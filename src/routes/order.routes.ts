/**
 * ============================================================================
 * File: src/routes/order.routes.ts
 * Purpose: Order Processing & Pickup Verification Endpoints
 * Endpoints:
 *   - GET    /api/orders                   -> List orders filtered by customer, merchant, or status
 *   - GET    /api/orders/:id               -> Retrieve single order by ID or orderNumber
 *   - POST   /api/orders                   -> Create order (deducts bag stock, calculates fees, updates impact)
 *   - PUT    /api/orders/:id/status        -> Update order status (RESERVED, READY_FOR_PICKUP, COMPLETED, CANCELLED)
 *   - POST   /api/orders/:id/verify-pickup -> Merchant scans customer QR code or checks 4-digit pickup code
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';

export const orderRouter = Router();

export interface CashStrikeRecord {
  id: string;
  orderId: string;
  reason: 'LATE_CANCELLATION' | 'NO_SHOW';
  strikeWeight: number; // 0.5 for late cancellation, 1.0 for no-show
  timestamp: string; // ISO 8601
  status: 'ACTIVE' | 'DECAYED' | 'REDEEMED';
}

/**
 * Cleanly decays strikes older than 45 days.
 */
export function evaluateUserStrikes(strikesHistory: CashStrikeRecord[] = []): {
  activeStrikes: number;
  updatedHistory: CashStrikeRecord[];
} {
  const now = Date.now();
  const FORTY_FIVE_DAYS_MS = 45 * 24 * 60 * 60 * 1000;

  const updatedHistory = (strikesHistory || []).map((strike) => {
    if (strike.status === 'ACTIVE') {
      const strikeAge = now - new Date(strike.timestamp).getTime();
      if (strikeAge > FORTY_FIVE_DAYS_MS) {
        return { ...strike, status: 'DECAYED' as const };
      }
    }
    return strike;
  });

  const activeStrikes = updatedHistory
    .filter((s) => s.status === 'ACTIVE')
    .reduce((acc, s) => acc + (s.strikeWeight || 1.0), 0);

  return { activeStrikes, updatedHistory };
}

export type CancellationTier = 'GRACE' | 'ADVANCE' | 'LATE' | 'NO_SHOW';

/**
 * Evaluates order cancellation tier in exact priority order (first match wins):
 * 1. GRACE PERIOD — order placed < 5 min ago (always wins, even if pickup is <30 min away)
 * 2. ADVANCE — >= 30 min before pickup window start
 * 3. LATE — < 30 min before pickup, or inside pickup window (not yet expired)
 * 4. NO-SHOW — pickup window expired, uncollected
 */
export function evaluateCancellationPolicy(
  pickupDateStr?: string,
  pickupWindowStr?: string,
  createdAtStr?: string
): CancellationTier {
  // 1. GRACE PERIOD — order placed < 5 min ago (always wins)
  if (createdAtStr) {
    const orderAgeMinutes = (Date.now() - new Date(createdAtStr).getTime()) / (1000 * 60);
    if (orderAgeMinutes >= 0 && orderAgeMinutes < 5) {
      return 'GRACE';
    }
  }

  if (!pickupWindowStr) return 'ADVANCE';

  try {
    const [startStr, endStr] = pickupWindowStr.split('-').map((s) => s.trim());
    if (!startStr) return 'ADVANCE';

    const [startHours, startMinutes] = startStr.split(':').map((s) => parseInt(s, 10));
    if (isNaN(startHours) || isNaN(startMinutes)) return 'ADVANCE';

    const todayStr = pickupDateStr || new Date().toISOString().split('T')[0];
    const pickupStart = new Date(`${todayStr}T${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}:00`);

    let pickupEnd = new Date(pickupStart.getTime() + 2 * 60 * 60 * 1000); // default 2h window
    if (endStr) {
      const [endHours, endMinutes] = endStr.split(':').map((s) => parseInt(s, 10));
      if (!isNaN(endHours) && !isNaN(endMinutes)) {
        pickupEnd = new Date(`${todayStr}T${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`);
      }
    }

    const now = new Date();
    const diffMinutesToStart = (pickupStart.getTime() - now.getTime()) / (1000 * 60);

    // 2. ADVANCE — >= 30 min before pickup window start
    if (diffMinutesToStart >= 30) {
      return 'ADVANCE';
    }

    // 3. LATE — < 30 min before pickup, or inside pickup window (not yet expired)
    if (now.getTime() <= pickupEnd.getTime()) {
      return 'LATE';
    }

    // 4. NO-SHOW — pickup window expired, uncollected
    return 'NO_SHOW';
  } catch {
    return 'ADVANCE';
  }
}

export function isLateCancellation(pickupDateStr?: string, pickupWindowStr?: string, createdAtStr?: string): boolean {
  const tier = evaluateCancellationPolicy(pickupDateStr, pickupWindowStr, createdAtStr);
  return tier === 'LATE';
}

export const formatOrder = (o: any) => {
  const subtotal = parseFloat(o.subtotal) || 0;
  const serviceFee = parseFloat(o.service_fee) || 0.5;
  const totalPrice = parseFloat(o.total_price) || subtotal + serviceFee;
  const isCash = o.payment_method === 'CASH_AT_PICKUP';
  const isNoShow = o.order_status === 'NO_SHOW';
  const isCancelled = o.order_status === 'CANCELLED';
  const isCompleted = o.order_status === 'COMPLETED';

  // 10% platform take rate on food subtotal + $0.50 platform service fee
  const foodCommission = parseFloat((subtotal * 0.10).toFixed(2));
  const commissionAmount = (isNoShow || isCancelled)
    ? 0
    : parseFloat((foodCommission + serviceFee).toFixed(2));
  const merchantNetAmount = (isNoShow || isCancelled)
    ? 0
    : parseFloat((subtotal - foodCommission).toFixed(2));

  const amountPaidInApp = isCash ? 0 : totalPrice;
  const cashDueAtPickup = isCash && !isCompleted && !isNoShow && !isCancelled ? totalPrice : 0;

  let escrowStatus: 'PENDING_COLLECTION' | 'HELD_IN_ESCROW' | 'PAID_OUT' | 'VOIDED' | 'REFUNDED';
  if (isNoShow || isCancelled) {
    escrowStatus = isCash ? 'VOIDED' : 'REFUNDED';
  } else if (isCompleted) {
    escrowStatus = 'PAID_OUT';
  } else if (isCash) {
    escrowStatus = 'PENDING_COLLECTION';
  } else {
    escrowStatus = 'HELD_IN_ESCROW';
  }

  let paymentStatus = o.payment_status;
  if (isCompleted) {
    paymentStatus = 'PAID';
  } else if (isNoShow) {
    paymentStatus = 'UNPAID';
  } else if (isCancelled) {
    paymentStatus = isCash ? 'VOIDED' : 'REFUNDED';
  } else if (isCash) {
    paymentStatus = 'PENDING';
  }

  return {
    id: o.id,
    orderNumber: o.order_number,
    customerId: o.customer_id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    merchantId: o.merchant_id,
    merchantName: o.merchant_name,
    merchantLogo: o.merchant_logo,
    merchantAddress: o.merchant_address,
    rescueBagId: o.rescue_bag_id,
    rescueBagTitle: o.rescue_bag_title,
    quantity: o.quantity,
    unitPrice: parseFloat(o.unit_price),
    originalUnitPrice: o.original_unit_price ? parseFloat(o.original_unit_price) : parseFloat(o.unit_price),
    subtotal,
    serviceFee,
    totalPrice,
    commissionRate: 0.10,
    commissionAmount,
    merchantNetAmount,
    amountPaidInApp,
    cashDueAtPickup,
    escrowStatus,
    pickupDate: o.pickup_date,
    pickupWindow: o.pickup_window,
    paymentMethod: o.payment_method,
    paymentStatus,
    orderStatus: o.order_status,
    qrCodeUrl: o.qr_code_url,
    qrCodeData: o.qr_code_data,
    pickupCode: o.pickup_code,
    collectedAt: o.collected_at,
    reviewGiven: o.review_given,
    addons: (() => {
      try {
        if (!o.addons || o.addons === '[]' || o.addons === 'null') return [];
        const parsed = Array.isArray(o.addons) ? o.addons : (typeof o.addons === 'string' ? JSON.parse(o.addons) : []);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    })(),
    createdAt: o.created_at,
  };
};

// Get orders
orderRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const { customerId, merchantId, status } = req.query;
  try {
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params: any[] = [];

    // If requested by a MERCHANT, strictly scope to orders belonging to this merchant's stores
    if (req.currentUser && req.currentUser.role === 'MERCHANT') {
      const merchantStores = await query<{ id: string }>('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      const storeIds = merchantStores.map((m) => m.id);
      if (storeIds.length > 0) {
        params.push(storeIds);
        sql += ` AND merchant_id = ANY($${params.length})`;
      } else {
        params.push(req.currentUser.id);
        sql += ` AND (merchant_id = $${params.length} OR merchant_id IN (SELECT id FROM merchants WHERE user_id = $${params.length}))`;
      }
    } else if (merchantId) {
      params.push(merchantId);
      sql += ` AND merchant_id = $${params.length}`;
    }

    if (customerId) {
      params.push(customerId);
      sql += ` AND customer_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND order_status = $${params.length}`;
    }

    sql += " ORDER BY CASE WHEN order_status IN ('PAID', 'CONFIRMED', 'READY_FOR_PICKUP', 'RESERVED', 'PENDING') THEN 0 ELSE 1 END, COALESCE(collected_at, created_at) DESC";
    const rows = await query(sql, params);
    res.json(rows.map(formatOrder));
  } catch (err) {
    console.error('[DEBUG GET /orders] Query error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
orderRouter.get('/:id', async (req, res) => {
  try {
    const o = await queryOne('SELECT * FROM orders WHERE id = $1 OR order_number = $1', [req.params.id]);
    if (!o) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(formatOrder(o));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order
orderRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const { rescueBagId, quantity = 1, paymentMethod = 'ABA_PAY', addons: rawAddons = [], promoCode } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Atomic inventory deduction (supports both Live Drops & Surprise Bags)
    const requestedQty = Math.max(1, parseInt(quantity, 10) || 1);
    const isLiveListing = typeof rescueBagId === 'string' && rescueBagId.startsWith('live_');
    let bag: any = null;

    if (isLiveListing) {
      const liveResult = await client.query(
        `UPDATE live_listings
         SET quantity_left = quantity_left - $1,
             status = CASE WHEN quantity_left - $1 <= 0 THEN 'SOLD_OUT' ELSE status END
         WHERE id = $2 AND quantity_left >= $1
         RETURNING *`,
        [requestedQty, rescueBagId]
      );
      if (liveResult.rowCount && liveResult.rows[0]) {
        const r = liveResult.rows[0];
        bag = {
          id: r.id,
          merchant_id: r.merchant_id,
          merchant_name: r.merchant_name,
          merchant_logo: r.merchant_logo,
          merchant_address: r.merchant_address,
          title: r.item_name,
          rescue_price: r.rescue_price,
          original_price: r.original_price,
          pickup_start: r.pickup_start || '17:30',
          pickup_end: r.pickup_end || '20:30',
        };
      }
    } else {
      const result = await client.query(
        `UPDATE rescue_bags
         SET quantity_remaining = quantity_remaining - $1,
             visibility = CASE WHEN quantity_remaining - $1 <= 0 THEN 'SOLD_OUT' ELSE visibility END
         WHERE id = $2 AND quantity_remaining >= $1
         RETURNING *`,
        [requestedQty, rescueBagId]
      );
      if (result.rowCount && result.rows[0]) {
        const r = result.rows[0];
        bag = {
          id: r.id,
          merchant_id: r.merchant_id,
          merchant_name: r.merchant_name,
          merchant_logo: r.merchant_logo,
          merchant_address: r.merchant_address,
          title: r.title,
          rescue_price: r.rescue_price,
          original_price: r.original_price,
          image_url: r.image_url,
          pickup_start: r.pickup_start || '17:30',
          pickup_end: r.pickup_end || '20:30',
        };
      }
    }

    // Primary bag failure — explicit rollback + 409
    if (!bag) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Sorry, this surplus item was just claimed by another customer or is sold out.',
      });
    }

    // 2. Process add-on bags: dedup, self-selection guard, cross-merchant guard, atomic decrement (ordered by ID for deadlock prevention)
    const rawAddonList: Array<{ id: string; quantity?: number }> = Array.isArray(rawAddons)
      ? rawAddons.map((a: any) => (typeof a === 'string' ? { id: a, quantity: 1 } : { id: a.id, quantity: a.quantity || 1 }))
      : [];

    const seenIds = new Set<string>();
    const deduplicatedAddons = rawAddonList
      .filter((a) => {
        if (seenIds.has(a.id)) return false;
        seenIds.add(a.id);
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id)); // Strict ID ordering to prevent concurrent add-on deadlocks

    if (deduplicatedAddons.some((a) => a.id === rescueBagId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Primary bag cannot be selected as an add-on.',
      });
    }

    const addonSnapshots: Array<{ id: string; title: string; price: number; quantity: number; imageUrl?: string }> = [];
    let addonSubtotal = 0;

    for (const addon of deduplicatedAddons) {
      const addonQty = Math.max(1, addon.quantity || 1);
      const addonResult = await client.query(
        `UPDATE rescue_bags
         SET quantity_remaining = quantity_remaining - $1,
             visibility = CASE WHEN quantity_remaining - $1 <= 0 THEN 'SOLD_OUT' ELSE visibility END
         WHERE id = $2 AND merchant_id = $3 AND quantity_remaining >= $1
         RETURNING *`,
        [addonQty, addon.id, bag.merchant_id]
      );

      if (!addonResult.rowCount || !addonResult.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Sorry, one of your selected add-ons (${addon.id}) is sold out, unavailable, or belongs to a different store.`,
        });
      }

      const ar = addonResult.rows[0];
      const addonPrice = parseFloat(ar.rescue_price);
      addonSubtotal += addonPrice * addonQty;

      addonSnapshots.push({
        id: ar.id,
        title: ar.title,
        price: addonPrice,
        quantity: addonQty,
        imageUrl: ar.image_url,
      });
    }

    const unitPrice = parseFloat(bag.rescue_price);
    const originalUnitPrice = parseFloat(bag.original_price || bag.base_price || bag.rescue_price || '0');
    const primarySubtotal = unitPrice * requestedQty;
    const subtotal = primarySubtotal + addonSubtotal;
    const serviceFee = 0.5;

    let user = req.currentUser;
    if (!user) {
      const userRow = await client.query('SELECT * FROM users WHERE role = $1 LIMIT 1', ['CUSTOMER']);
      user = userRow.rows[0];
      if (!user) {
        const fallbackUser = await client.query('SELECT * FROM users LIMIT 1');
        user = fallbackUser.rows[0];
      }
    }

    if (!user) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'User account required to place an order.' });
    }

    if (user.role === 'MERCHANT') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Merchant accounts cannot place customer orders. Please use a customer account to purchase surplus food.',
      });
    }

    // 3. Voucher Verification inside Transaction (Step 3 in Lock Hierarchy — Bags then Voucher)
    let discountAmount = 0;
    let appliedVoucherCode: string | null = null;
    let customerVoucherIdToUpdate: string | null = null;
    let isGlobalVoucher = false;

    if (promoCode && typeof promoCode === 'string' && promoCode.trim()) {
      const normCode = promoCode.trim().toUpperCase();

      // Check customer personal voucher first
      const custVoucherRes = await client.query(
        `SELECT * FROM customer_vouchers 
         WHERE UPPER(voucher_code) = $1 AND customer_id = $2 
         FOR UPDATE`,
        [normCode, user.id]
      );
      const custVoucher = custVoucherRes.rows[0];

      if (custVoucher) {
        if (custVoucher.status === 'USED') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Voucher "${normCode}" has already been used on order #${custVoucher.order_id || 'RB'}.`,
          });
        }

        const expiryTime = new Date(custVoucher.expires_at).getTime();
        if (custVoucher.status === 'EXPIRED' || expiryTime <= Date.now()) {
          await client.query('ROLLBACK');
          const expiredDateStr = new Date(custVoucher.expires_at).toLocaleDateString();
          return res.status(400).json({
            error: `Voucher "${normCode}" expired on ${expiredDateStr} and is no longer valid.`,
          });
        }

        const minReq = parseFloat(custVoucher.min_order_amount) || 0;
        if (subtotal < minReq) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Order subtotal ($${subtotal.toFixed(2)}) does not meet minimum requirement ($${minReq.toFixed(2)}) for voucher "${normCode}".`,
          });
        }

        discountAmount = parseFloat(custVoucher.discount_amount);
        appliedVoucherCode = custVoucher.voucher_code;
        customerVoucherIdToUpdate = custVoucher.id;
      } else {
        // Fallback to Global Campaign Vouchers
        const voucherRes = await client.query(
          'SELECT * FROM vouchers WHERE UPPER(code) = $1 FOR UPDATE',
          [normCode]
        );
        const voucher = voucherRes.rows[0];

        if (!voucher) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Voucher code "${normCode}" does not exist.` });
        }

        if (!voucher.is_active) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Voucher "${normCode}" is no longer active.` });
        }

        if (voucher.expires_at && new Date(voucher.expires_at).getTime() <= Date.now()) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Voucher "${normCode}" has expired.` });
        }

        const minReq = parseFloat(voucher.min_order_amount) || 0;
        if (subtotal < minReq) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Order subtotal ($${subtotal.toFixed(2)}) does not meet minimum requirement ($${minReq.toFixed(2)}) for voucher "${normCode}".`,
          });
        }

        if (voucher.total_usage_limit && (voucher.used_count || 0) >= voucher.total_usage_limit) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Voucher campaign "${normCode}" has reached maximum global capacity.`,
          });
        }

        const redemptionsRes = await client.query(
          'SELECT COUNT(*) as count FROM voucher_redemptions WHERE voucher_code = $1 AND customer_id = $2',
          [voucher.code, user.id]
        );
        const userUses = parseInt(redemptionsRes.rows[0]?.count || '0', 10);
        const maxAllowed = voucher.max_uses_per_customer || 1;

        if (userUses >= maxAllowed) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `You have already redeemed voucher "${normCode}" (limit: ${maxAllowed} use per customer).`,
          });
        }

        discountAmount = parseFloat(voucher.discount_amount);
        appliedVoucherCode = voucher.code;
        isGlobalVoucher = true;
      }
    }

    const totalPrice = Math.max(0, subtotal + serviceFee - discountAmount);

    const orderNum = `RB-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const pickupCode = `RB-${Math.floor(1000 + Math.random() * 9000)}`;
    const qrData = `${orderNum}-PICKUP`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

    // Active Trust Score & Anti-Abuse Concurrency Gating for Cash Orders
    if (paymentMethod === 'CASH_AT_PICKUP') {
      let strikesHistory: CashStrikeRecord[] = [];
      try {
        strikesHistory = typeof (user as any).cash_strikes_history === 'string'
          ? JSON.parse((user as any).cash_strikes_history)
          : ((user as any).cash_strikes_history || []);
      } catch {
        strikesHistory = [];
      }

      const { activeStrikes, updatedHistory } = evaluateUserStrikes(strikesHistory);
      const rawTrust = user.trustScore !== undefined ? user.trustScore : ((user as any).trust_score !== undefined ? (user as any).trust_score : 75);
      const trustScore = Math.min(100, Math.max(0, rawTrust));

      if (activeStrikes >= 3 || trustScore < 50) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: `Cash reservations are temporarily locked on this account (${activeStrikes} active strikes, Trust Score: ${trustScore}/100). Please pre-pay with Bakong KHQR or Card.`,
        });
      }
    }

    const insertedOrderRes = await client.query(
      `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_phone, merchant_id, merchant_name, merchant_logo, merchant_address, rescue_bag_id, rescue_bag_title, quantity, unit_price, original_unit_price, subtotal, service_fee, total_price, pickup_date, pickup_window, payment_method, payment_status, order_status, qr_code_url, qr_code_data, pickup_code, addons, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
       RETURNING *`,
      [
        orderId,
        orderNum,
        user.id,
        user.name,
        user.phone || '+855 12 000 000',
        bag.merchant_id,
        bag.merchant_name,
        bag.merchant_logo,
        bag.merchant_address,
        bag.id,
        bag.title,
        requestedQty,
        unitPrice,
        originalUnitPrice,
        subtotal,
        serviceFee,
        totalPrice,
        new Date().toISOString().split('T')[0],
        `${bag.pickup_start || '18:00'} - ${bag.pickup_end || '20:00'}`,
        paymentMethod,
        paymentMethod === 'CASH_AT_PICKUP' ? 'PENDING' : 'PAID',
        'READY_FOR_PICKUP',
        qrUrl,
        qrData,
        pickupCode,
        JSON.stringify(addonSnapshots),
        new Date().toISOString(),
      ]
    );

    // Update customer voucher state atomically
    if (customerVoucherIdToUpdate) {
      await client.query(
        `UPDATE customer_vouchers 
         SET status = 'USED', used_at = CURRENT_TIMESTAMP, order_id = $1 
         WHERE id = $2`,
        [orderId, customerVoucherIdToUpdate]
      );
    }

    // Record global voucher redemption if applied
    if (isGlobalVoucher && appliedVoucherCode) {
      const redemptionId = `vouch_red_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await client.query(
        'UPDATE vouchers SET used_count = used_count + 1 WHERE code = $1',
        [appliedVoucherCode]
      );
      await client.query(
        `INSERT INTO voucher_redemptions (id, voucher_code, customer_id, order_id, discount_applied, redeemed_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [redemptionId, appliedVoucherCode, user.id, orderId, discountAmount]
      );
    }

    // Commit primary order creation & inventory lock immediately
    await client.query('COMMIT');
    console.log('[DEBUG POST /orders] Successfully committed order:', insertedOrderRes.rows[0]?.order_number);

    const createdOrder = insertedOrderRes.rows[0];

    // Secondary async updates outside transaction
    try {
      const origP = originalUnitPrice || (unitPrice * 1.5);
      const savingsPerMeal = Math.max(0, origP - unitPrice);

      await pool.query(
        `UPDATE impact_stats
         SET meals_rescued = meals_rescued + $1::integer,
             food_saved_kg = food_saved_kg + ($1::numeric * 0.75),
             customer_savings_usd = customer_savings_usd + ($1::numeric * $2::numeric),
             co2_avoided_kg = co2_avoided_kg + ($1::numeric * 1.8)
         WHERE id = (SELECT id FROM impact_stats LIMIT 1)`,
        [requestedQty, savingsPerMeal]
      );
    } catch (e: any) {
      console.warn('Impact stats update warning:', e.message);
    }

    try {
      if (user?.id) {
        await pool.query('UPDATE users SET points = points + $1 WHERE id = $2', [requestedQty * 10, user.id]);
      }
    } catch (e: any) {
      console.warn('User points award warning:', e.message);
    }

    res.status(201).json(formatOrder(createdOrder));
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[DEBUG POST /orders] Error creating order, ROLLED BACK:', err);
    res.status(500).json({ error: 'Failed to place order' });
  } finally {
    client.release();
  }
});

// Update order status (PUT & PATCH)
const handleUpdateOrderStatus = async (req: AuthenticatedRequest, res: any) => {
  const { status, restockBag } = req.body;
  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const collectedAt = status === 'COMPLETED' ? new Date().toISOString() : order.collected_at;

    await pool.query(
      `UPDATE orders
       SET order_status = $1, collected_at = $2
       WHERE id = $3`,
      [status, collectedAt, req.params.id]
    );

    // If marked NO_SHOW: penalize user trust score & add cash strike
    if (status === 'NO_SHOW' && order.customer_id) {
      await pool.query(
        `UPDATE users
         SET points = GREATEST(0, points - 15)
         WHERE id = $1`,
        [order.customer_id]
      ).catch(() => {});

      if (restockBag && order.rescue_bag_id) {
        await pool.query(
          `UPDATE rescue_bags
           SET quantity_remaining = quantity_remaining + $1,
               visibility = CASE WHEN visibility = 'SOLD_OUT' THEN 'PUBLIC' ELSE visibility END
           WHERE id = $2`,
          [order.quantity || 1, order.rescue_bag_id]
        ).catch(() => {});
      }
    }

    const updated = await queryOne('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    res.json(formatOrder(updated));
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

orderRouter.put('/:id/status', handleUpdateOrderStatus);
orderRouter.patch('/:id/status', handleUpdateOrderStatus);

// Global Scan QR / Pickup code verification endpoint
orderRouter.post('/scan-qr', async (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'Pickup code or QR token is required' });
  }

  const clean = code.trim();
  const stripped = clean.replace(/^#/, '');
  try {
    const order = await queryOne(
      `SELECT * FROM orders 
       WHERE UPPER(pickup_code) = UPPER($1) 
          OR UPPER(pickup_code) = UPPER($2)
          OR UPPER(order_number) = UPPER($1) 
          OR UPPER(order_number) = UPPER($2)
          OR UPPER(qr_code_data) = UPPER($1) 
          OR UPPER(qr_code_data) = UPPER($2)
          OR id = $1 
          OR id = $2`,
      [clean, stripped]
    );

    if (!order) {
      return res.status(404).json({ error: 'No matching order found for this pickup code or QR token' });
    }

    if (order.order_status === 'COMPLETED') {
      return res.json({
        success: true,
        message: 'Order was already marked completed.',
        order: formatOrder(order),
        pointsEarned: (order.quantity || 1) * 10,
      });
    }

    await pool.query(
      `UPDATE orders
       SET order_status = 'COMPLETED', collected_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), order.id]
    );

    const pointsEarned = (order.quantity || 1) * 10;
    // Award points AND evaluate clean pickup streak (+2 trust, every 3 clean pickups redeems 1 strike & grants +5 trust)
    if (order.customer_id) {
      const userRow = await pool.query('SELECT * FROM users WHERE id = $1', [order.customer_id]);
      if (userRow.rows[0]) {
        const u = userRow.rows[0];
        let history: CashStrikeRecord[] = [];
        try {
          history = typeof u.cash_strikes_history === 'string'
            ? JSON.parse(u.cash_strikes_history)
            : (u.cash_strikes_history || []);
        } catch {
          history = [];
        }

        let { activeStrikes, updatedHistory } = evaluateUserStrikes(history);

        let streak = (u.consecutive_clean_pickups || 0) + 1;
        let currentTrust = u.trust_score !== undefined ? u.trust_score : 75;
        currentTrust = Math.min(100, currentTrust + 2); // +2 for successful rescue

        // Streak redemption: every 3 clean pickups redeems 1 oldest active strike
        if (streak >= 3) {
          const oldestActiveIdx = updatedHistory.findIndex((s) => s.status === 'ACTIVE');
          if (oldestActiveIdx !== -1) {
            updatedHistory[oldestActiveIdx] = {
              ...updatedHistory[oldestActiveIdx],
              status: 'REDEEMED',
            };
            activeStrikes = updatedHistory
              .filter((s) => s.status === 'ACTIVE')
              .reduce((acc, s) => acc + (s.strikeWeight || 1.0), 0);
          }
          currentTrust = Math.min(100, currentTrust + 5); // +5 bonus trust points
          streak = 0; // Reset streak counter
        }

        await pool.query(
          `UPDATE users 
           SET points = points + $1,
               trust_score = $2,
               cash_strikes = $3,
               consecutive_clean_pickups = $4,
               cash_strikes_history = $5
           WHERE id = $6`,
          [pointsEarned, currentTrust, activeStrikes, streak, JSON.stringify(updatedHistory), order.customer_id]
        ).catch(() => {});
      }
    }

    const updated = await queryOne('SELECT * FROM orders WHERE id = $1', [order.id]);

    res.json({
      success: true,
      message: 'Pickup confirmed! Order completed successfully.',
      order: formatOrder(updated || order),
      pointsEarned,
    });
  } catch (err: any) {
    console.error('Error verifying pickup QR:', err);
    res.status(500).json({ error: 'Failed to verify pickup code' });
  }
});

// Cancel order endpoint with 30-minute late cancellation check
orderRouter.post('/:id/cancel', async (req: AuthenticatedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 OR order_number = $1', [req.params.id]);
    const order = orderRes.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.order_status === 'COMPLETED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Completed orders cannot be cancelled' });
    }

    if (order.order_status === 'CANCELLED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    await client.query('UPDATE orders SET order_status = $1 WHERE id = $2', ['CANCELLED', order.id]);

    // Restore primary bag inventory & restore visibility ONLY if bag is active (never revive archived/draft bags)
    // Supports both Live Drop listings and standard Mystery Bags
    if (order.rescue_bag_id && order.quantity) {
      const isLiveListing = typeof order.rescue_bag_id === 'string' && order.rescue_bag_id.startsWith('live_');
      if (isLiveListing) {
        await client.query(
          `UPDATE live_listings
           SET quantity_left = quantity_left + $1,
               status = CASE WHEN status = 'SOLD_OUT' AND expires_at > NOW() THEN 'LIVE' ELSE status END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND status != 'EXPIRED'`,
          [order.quantity, order.rescue_bag_id]
        );
      } else {
        await client.query(
          `UPDATE rescue_bags
           SET quantity_remaining = quantity_remaining + $1,
               visibility = CASE WHEN visibility = 'SOLD_OUT' THEN 'PUBLIC' ELSE visibility END
           WHERE id = $2 AND visibility != 'ARCHIVED' AND visibility != 'DRAFT'`,
          [order.quantity, order.rescue_bag_id]
        );
      }
    }

    // Restore addon bag inventory for each add-on in the order snapshot
    // (No-show path does NOT restore stock — food was set aside and perishable)
    const orderAddons = (() => {
      try {
        return Array.isArray(order.addons)
          ? order.addons
          : (typeof order.addons === 'string' ? JSON.parse(order.addons) : []);
      } catch { return []; }
    })();

    for (const addon of orderAddons) {
      if (addon.id && addon.quantity) {
        await client.query(
          `UPDATE rescue_bags
           SET quantity_remaining = quantity_remaining + $1,
               visibility = CASE WHEN visibility = 'SOLD_OUT' THEN 'PUBLIC' ELSE visibility END
           WHERE id = $2 AND visibility != 'ARCHIVED' AND visibility != 'DRAFT'`,
          [addon.quantity, addon.id]
        ).catch(() => {});
      }
    }

    // Revert user points
    const points = (order.quantity || 1) * 10;
    await client.query('UPDATE users SET points = GREATEST(0, points - $1) WHERE id = $2', [points, order.customer_id]).catch(() => {});

    // Evaluate in exact 4-tier priority order: 1. GRACE -> 2. ADVANCE -> 3. LATE -> 4. NO_SHOW
    const tier = evaluateCancellationPolicy(order.pickup_date, order.pickup_window, order.created_at);
    const isCash = order.payment_method === 'CASH_AT_PICKUP';
    const orderTotal = parseFloat(order.total_price) || 0;
    const orderSubtotal = parseFloat(order.subtotal) || orderTotal;

    let refundPercentage = 100;
    let refundAmount = isCash ? 0 : orderTotal;
    let merchantCompensation = 0;
    let penaltyMessage = '';

    if (tier === 'GRACE' || tier === 'ADVANCE') {
      // TIER 1 (Grace <5 min) & TIER 2 (Advance >= 30 min): 100% refund, 0 strikes, 0 trust impact
      refundPercentage = 100;
      refundAmount = isCash ? 0 : orderTotal;
      merchantCompensation = 0;
      penaltyMessage = isCash
        ? 'Free reservation cancellation with 0 penalty and 0 strikes.'
        : `100% full refund ($${refundAmount.toFixed(2)}) processed with 0 penalty.`;
    } else if (tier === 'LATE') {
      // TIER 3 (Late <30 min or inside window):
      if (isCash) {
        // Cash: 0.5 strike, -10 trust, no money collected so no money split
        refundPercentage = 0;
        refundAmount = 0;
        merchantCompensation = 0;
        penaltyMessage = 'Late cash cancellation (<30 min before pickup): 0.5 cash strike and -10 trust points recorded.';

        if (order.customer_id) {
          const userRow = await client.query('SELECT * FROM users WHERE id = $1', [order.customer_id]);
          if (userRow.rows[0]) {
            const u = userRow.rows[0];
            let history: CashStrikeRecord[] = [];
            try {
              history = typeof u.cash_strikes_history === 'string'
                ? JSON.parse(u.cash_strikes_history)
                : (u.cash_strikes_history || []);
            } catch {
              history = [];
            }

            const newStrike: CashStrikeRecord = {
              id: `strk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              orderId: order.id,
              reason: 'LATE_CANCELLATION',
              strikeWeight: 0.5,
              timestamp: new Date().toISOString(),
              status: 'ACTIVE',
            };
            history.push(newStrike);

            const { activeStrikes, updatedHistory } = evaluateUserStrikes(history);
            const currentTrust = u.trust_score !== undefined ? u.trust_score : 75;
            const newTrust = Math.max(0, currentTrust - 10);

            await client.query(
              `UPDATE users 
               SET trust_score = $1, 
                   cash_strikes = $2, 
                   consecutive_clean_pickups = 0, 
                   cash_strikes_history = $3 
               WHERE id = $4`,
              [newTrust, activeStrikes, JSON.stringify(updatedHistory), order.customer_id]
            );
          }
        }
      } else {
        // Pre-paid (Bakong/Card): 50% refund to customer, 50% payout to merchant (no strike on pre-paid)
        refundPercentage = 50;
        refundAmount = parseFloat((orderSubtotal * 0.50).toFixed(2));
        merchantCompensation = parseFloat((orderSubtotal * 0.50).toFixed(2));
        penaltyMessage = `Late cancellation: 50% refund ($${refundAmount.toFixed(2)}) returned to your account, and 50% ($${merchantCompensation.toFixed(2)}) awarded to merchant for meal prep.`;
      }
    } else {
      // TIER 4 (No-Show): 0% refund, 100% to merchant (or 1.0 strike for cash)
      if (isCash) {
        refundPercentage = 0;
        refundAmount = 0;
        merchantCompensation = 0;
        penaltyMessage = 'Unclaimed cash reservation: 1.0 strike and -25 trust points recorded.';
      } else {
        refundPercentage = 0;
        refundAmount = 0;
        merchantCompensation = orderTotal;
        penaltyMessage = `Pickup window expired: 0% refund, 100% ($${merchantCompensation.toFixed(2)}) awarded to merchant.`;
      }
    }

    await client.query('COMMIT');

    const updated = await queryOne('SELECT * FROM orders WHERE id = $1', [order.id]);
    res.json({
      ...(updated ? formatOrder(updated) : formatOrder(order)),
      cancellationTier: tier,
      isLateCancellation: tier === 'LATE',
      refundPercentage,
      refundAmount,
      merchantCompensation,
      penaltyMessage,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error cancelling order:', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

// Report No-Show endpoint with atomic double-fire protection
orderRouter.post('/:id/no-show', async (req: AuthenticatedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ATOMIC STATE GUARD: Only transition if order is currently active (prevents double-firing)
    const updateRes = await client.query(
      `UPDATE orders 
       SET order_status = 'NO_SHOW', escrow_status = 'VOIDED' 
       WHERE id = $1 AND order_status IN ('READY_FOR_PICKUP', 'PENDING', 'RESERVED')
       RETURNING *`,
      [req.params.id]
    );

    if (updateRes.rowCount === 0 || !updateRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: 'Order was already marked completed, cancelled, or no-show. No changes made.' 
      });
    }

    const order = updateRes.rows[0];

    // Food Safety Policy: Perishable food is set aside and prepared; stock is NOT restored on NO-SHOW.

    // Penalize user: -25 trust score, +1.0 strike, reset consecutive clean pickups to 0
    if (order.customer_id) {
      const userRow = await client.query('SELECT * FROM users WHERE id = $1', [order.customer_id]);
      if (userRow.rows[0]) {
        const u = userRow.rows[0];
        let history: CashStrikeRecord[] = [];
        try {
          history = typeof u.cash_strikes_history === 'string'
            ? JSON.parse(u.cash_strikes_history)
            : (u.cash_strikes_history || []);
        } catch {
          history = [];
        }

        const newStrike: CashStrikeRecord = {
          id: `strk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orderId: order.id,
          reason: 'NO_SHOW',
          strikeWeight: 1.0,
          timestamp: new Date().toISOString(),
          status: 'ACTIVE',
        };
        history.push(newStrike);

        const { activeStrikes, updatedHistory } = evaluateUserStrikes(history);
        const currentTrust = u.trust_score !== undefined ? u.trust_score : 75;
        const newTrust = Math.max(0, currentTrust - 25); // Deduct 25, floored at 0

        await client.query(
          `UPDATE users 
           SET trust_score = $1, 
               cash_strikes = $2, 
               consecutive_clean_pickups = 0, 
               cash_strikes_history = $3 
           WHERE id = $4`,
          [newTrust, activeStrikes, JSON.stringify(updatedHistory), order.customer_id]
        );
      }
    }

    await client.query('COMMIT');
    const updated = await queryOne('SELECT * FROM orders WHERE id = $1', [order.id]);
    res.json(formatOrder(updated));
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error marking order no-show:', err);
    res.status(500).json({ error: 'Failed to record no-show' });
  } finally {
    client.release();
  }
});
