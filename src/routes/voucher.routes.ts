/**
 * ============================================================================
 * File: src/routes/voucher.routes.ts
 * Purpose: Centralized Voucher, Points Redemption & Expiration Engine
 * Endpoints:
 *   - POST /api/vouchers/redeem-points -> Spends customer points for time-limited voucher perk
 *   - GET  /api/vouchers/my-vouchers   -> List customer's unlocked vouchers with live expiry status
 *   - POST /api/vouchers/validate      -> Authenticated check for discount eligibility & expiration
 *   - GET  /api/vouchers/active        -> List public active promotional campaigns
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const voucherRouter = Router();

// Standard catalog of redeemable loyalty perks
const REWARD_CATALOG: Record<
  string,
  {
    title: string;
    pointsCost: number;
    discountAmount: number;
    minOrderAmount: number;
    expiresInDays: number;
    isDonation?: boolean;
  }
> = {
  rew_1_voucher: {
    title: '$1.00 Rescue Voucher',
    pointsCost: 50,
    discountAmount: 1.0,
    minOrderAmount: 0.0,
    expiresInDays: 7,
  },
  rew_2_voucher: {
    title: '$2.50 Super Saver Voucher',
    pointsCost: 100,
    discountAmount: 2.5,
    minOrderAmount: 5.0,
    expiresInDays: 7,
  },
  rew_tree_plant: {
    title: 'Plant a Tree in Cambodia',
    pointsCost: 150,
    discountAmount: 0,
    minOrderAmount: 0,
    expiresInDays: 365,
    isDonation: true,
  },
};

function formatCustomerVoucher(cv: any) {
  const expiresAtDate = new Date(cv.expires_at);
  const now = Date.now();
  const remainingSeconds = Math.max(0, Math.floor((expiresAtDate.getTime() - now) / 1000));
  const isExpired = cv.status === 'EXPIRED' || remainingSeconds <= 0;

  return {
    id: cv.id,
    customerId: cv.customer_id,
    voucherCode: cv.voucher_code,
    title: cv.title,
    discountAmount: parseFloat(cv.discount_amount),
    minOrderAmount: parseFloat(cv.min_order_amount),
    pointsSpent: cv.points_spent,
    status: isExpired && cv.status !== 'USED' ? 'EXPIRED' : cv.status,
    expiresAt: cv.expires_at,
    createdAt: cv.created_at,
    usedAt: cv.used_at,
    orderId: cv.order_id,
    remainingSeconds,
    isExpired: isExpired && cv.status !== 'USED',
  };
}

// 1. Redeem Points for a Time-Limited Voucher Perk (with DB Idempotency & User Row Lock)
voucherRouter.post('/redeem-points', async (req: AuthenticatedRequest, res) => {
  const user = req.currentUser;
  const { rewardId, idempotencyKey } = req.body;

  if (!user || !user.id || user.id === 'usr_guest') {
    return res.status(401).json({ error: 'Please sign in to redeem loyalty points.' });
  }

  const reward = REWARD_CATALOG[rewardId] || {
    title: '$1.00 Rescue Voucher',
    pointsCost: 50,
    discountAmount: 1.0,
    minOrderAmount: 0.0,
    expiresInDays: 7,
  };

  // Check permanent idempotency key before entering lock
  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    const existing = await queryOne(
      'SELECT * FROM customer_vouchers WHERE customer_id = $1 AND idempotency_key = $2',
      [user.id, idempotencyKey.trim()]
    );
    if (existing) {
      return res.json({
        success: true,
        voucher: formatCustomerVoucher(existing),
        deduplicated: true,
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock user record to prevent concurrent double-spending
    const userRes = await client.query(
      'SELECT id, points FROM users WHERE id = $1 FOR UPDATE',
      [user.id]
    );
    const lockedUser = userRes.rows[0];

    if (!lockedUser) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User account not found.' });
    }

    if ((lockedUser.points || 0) < reward.pointsCost) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient points balance (${lockedUser.points || 0} pts available, need ${reward.pointsCost} pts).`,
      });
    }

    // Deduct points from user
    await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2',
      [reward.pointsCost, user.id]
    );

    // Collision-resistant code generator loop
    let generatedCode = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      attempts++;
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      generatedCode = `RB-PERK-${randomSuffix}`;

      const collisionCheck = await client.query(
        'SELECT 1 FROM customer_vouchers WHERE voucher_code = $1',
        [generatedCode]
      );
      if (collisionCheck.rowCount === 0) {
        isUnique = true;
      }
    }

    const voucherId = `cv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const validityDays = reward.expiresInDays || 7;

    // Insert into customer_vouchers (Transaction 1 commits independently with DB unique index)
    const insertedVoucherRes = await client.query(
      `INSERT INTO customer_vouchers (id, customer_id, voucher_code, title, discount_amount, min_order_amount, points_spent, status, idempotency_key, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, CURRENT_TIMESTAMP + ($9 || ' days')::INTERVAL, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        voucherId,
        user.id,
        generatedCode,
        reward.title,
        reward.discountAmount,
        reward.minOrderAmount,
        reward.pointsCost,
        idempotencyKey ? idempotencyKey.trim() : null,
        `${validityDays}`,
      ]
    );

    // Also register in global vouchers table for unified lookups
    if (reward.discountAmount > 0) {
      await client.query(
        `INSERT INTO vouchers (code, title, discount_amount, discount_type, min_order_amount, max_uses_per_customer, total_usage_limit, is_active, expires_at)
         VALUES ($1, $2, $3, 'FIXED', $4, 1, 1, TRUE, CURRENT_TIMESTAMP + ($5 || ' days')::INTERVAL)
         ON CONFLICT (code) DO NOTHING`,
        [generatedCode, reward.title, reward.discountAmount, reward.minOrderAmount, `${validityDays}`]
      );
    }

    await client.query('COMMIT');

    const createdVoucher = insertedVoucherRes.rows[0];

    res.status(201).json({
      success: true,
      message: `Successfully unlocked ${reward.title}!`,
      voucher: formatCustomerVoucher(createdVoucher),
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    // Graceful recovery if idempotency unique constraint caught a concurrent race
    if (err.code === '23505' && idempotencyKey) {
      const existing = await queryOne(
        'SELECT * FROM customer_vouchers WHERE customer_id = $1 AND idempotency_key = $2',
        [user.id, idempotencyKey.trim()]
      );
      if (existing) {
        return res.json({
          success: true,
          voucher: formatCustomerVoucher(existing),
          deduplicated: true,
        });
      }
    }
    console.error('Error redeeming points for voucher:', err);
    res.status(500).json({ error: 'Failed to redeem voucher. Please try again.' });
  } finally {
    client.release();
  }
});

// 2. Get Authenticated Customer's Unlocked Vouchers Wallet
voucherRouter.get('/my-vouchers', async (req: AuthenticatedRequest, res) => {
  const user = req.currentUser;

  if (!user || !user.id || user.id === 'usr_guest') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Lazy status sweep for expired vouchers
    await query(
      `UPDATE customer_vouchers
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE' AND expires_at <= CURRENT_TIMESTAMP`
    );

    const rows = await query(
      `SELECT * FROM customer_vouchers
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [user.id]
    );

    res.json(rows.map(formatCustomerVoucher));
  } catch (err: any) {
    console.error('Error fetching my-vouchers:', err);
    res.status(500).json({ error: 'Failed to retrieve vouchers wallet' });
  }
});

// 3. Validate Voucher Code (Handles both Personal Customer Vouchers & Platform Promos)
voucherRouter.post('/validate', async (req: AuthenticatedRequest, res) => {
  const { code, subtotal } = req.body;
  const user = req.currentUser;

  if (!user || !user.id || user.id === 'usr_guest') {
    return res.status(401).json({ error: 'Please sign in to apply a promotional voucher code.' });
  }

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Voucher code is required' });
  }

  const normalizedCode = code.trim().toUpperCase();
  const cartSubtotal = parseFloat(subtotal) || 0;

  try {
    // Lazy sweep
    await query(
      `UPDATE customer_vouchers
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE' AND expires_at <= CURRENT_TIMESTAMP`
    );

    // 1. Check if this is a personal Customer Voucher
    const custVoucher = await queryOne(
      `SELECT * FROM customer_vouchers 
       WHERE UPPER(voucher_code) = $1 AND customer_id = $2`,
      [normalizedCode, user.id]
    );

    if (custVoucher) {
      if (custVoucher.status === 'USED') {
        return res.status(400).json({ error: `Voucher "${normalizedCode}" has already been used on order #${custVoucher.order_id || 'RB'}.` });
      }

      if (custVoucher.status === 'EXPIRED' || new Date(custVoucher.expires_at).getTime() <= Date.now()) {
        const expiredDateStr = new Date(custVoucher.expires_at).toLocaleDateString();
        return res.status(400).json({ error: `Voucher "${normalizedCode}" expired on ${expiredDateStr}.` });
      }

      const minReq = parseFloat(custVoucher.min_order_amount) || 0;
      if (cartSubtotal < minReq) {
        return res.status(400).json({
          error: `Order subtotal ($${cartSubtotal.toFixed(2)}) does not meet the minimum requirement ($${minReq.toFixed(2)}) for this voucher.`,
        });
      }

      return res.json({
        valid: true,
        code: custVoucher.voucher_code,
        title: custVoucher.title,
        discountAmount: parseFloat(custVoucher.discount_amount),
        discountType: 'FIXED',
        minOrderAmount: minReq,
        expiresAt: custVoucher.expires_at,
        isCustomerPerk: true,
      });
    }

    // 2. Check Platform Campaign Vouchers
    const voucher = await queryOne(
      'SELECT * FROM vouchers WHERE UPPER(code) = $1',
      [normalizedCode]
    );

    if (!voucher) {
      return res.status(404).json({ error: `Voucher code "${normalizedCode}" does not exist.` });
    }

    if (!voucher.is_active) {
      return res.status(400).json({ error: `Voucher "${normalizedCode}" is no longer active.` });
    }

    if (voucher.expires_at && new Date(voucher.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: `Voucher "${normalizedCode}" has expired.` });
    }

    const minAmount = parseFloat(voucher.min_order_amount) || 0;
    if (cartSubtotal < minAmount) {
      return res.status(400).json({
        error: `Order subtotal ($${cartSubtotal.toFixed(2)}) does not meet the minimum requirement ($${minAmount.toFixed(2)}) for this voucher.`,
      });
    }

    if (voucher.total_usage_limit && (voucher.used_count || 0) >= voucher.total_usage_limit) {
      return res.status(400).json({
        error: `This promotional voucher campaign has reached its maximum global usage capacity.`,
      });
    }

    const redemptionsRes = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM voucher_redemptions WHERE voucher_code = $1 AND customer_id = $2',
      [voucher.code, user.id]
    );
    const uses = parseInt(redemptionsRes?.count || '0', 10);
    const maxUses = voucher.max_uses_per_customer || 1;

    if (uses >= maxUses) {
      return res.status(400).json({
        error: `You have already redeemed voucher "${normalizedCode}" (limit: ${maxUses} use per customer).`,
      });
    }

    res.json({
      valid: true,
      code: voucher.code,
      title: voucher.title,
      discountAmount: parseFloat(voucher.discount_amount),
      discountType: voucher.discount_type,
      minOrderAmount: minAmount,
      expiresAt: voucher.expires_at,
    });
  } catch (err: any) {
    console.error('Error validating voucher:', err);
    res.status(500).json({ error: 'Failed to validate voucher code' });
  }
});

// 4. List Public Active Promotional Campaigns
voucherRouter.get('/active', async (_req, res) => {
  try {
    const vouchers = await query(
      `SELECT code, title, discount_amount, discount_type, min_order_amount, expires_at
       FROM vouchers
       WHERE is_active = TRUE
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         AND (total_usage_limit IS NULL OR used_count < total_usage_limit)
         AND NOT code LIKE 'RB-PERK-%'
       ORDER BY discount_amount DESC`
    );

    res.json(
      vouchers.map((v) => ({
        code: v.code,
        title: v.title,
        discountAmount: parseFloat(v.discount_amount),
        discountType: v.discount_type,
        minOrderAmount: parseFloat(v.min_order_amount),
        expiresAt: v.expires_at,
      }))
    );
  } catch (err: any) {
    console.error('Error fetching active vouchers:', err);
    res.status(500).json({ error: 'Failed to fetch active promotions' });
  }
});
