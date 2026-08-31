/**
 * ============================================================================
 * File: src/routes/liveListing.routes.ts
 * Purpose: Fast End-of-Day Individual Item Live Listing Endpoints
 * Responsibilities:
 *   - Fast-listing publish in < 3 taps (minimum 40% discount enforced).
 *   - Atomic quantity decrement/increment with collision guard (23505 -> 409).
 *   - 1-tap "Item Sold Out" action to prevent out-of-sync walk-in purchases.
 *   - Ownership enforcement using AuthenticatedRequest (req.currentUser).
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const liveListingRouter = Router();

// Helper to map DB row to LiveListing response object
function formatLiveListing(r: any) {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    menuItemId: r.menu_item_id,
    merchantName: r.merchant_name,
    merchantLogo: r.merchant_logo,
    merchantLat: r.merchant_lat,
    merchantLng: r.merchant_lng,
    merchantAddress: r.merchant_address,
    itemName: r.item_name,
    itemNameKm: r.item_name_km,
    imageUrl: r.image_url,
    quantityLeft: r.quantity_left,
    discountPct: r.discount_pct,
    rescuePrice: parseFloat(r.rescue_price),
    originalPrice: parseFloat(r.original_price),
    expiresAt: r.expires_at,
    pickupStart: r.pickup_start,
    pickupEnd: r.pickup_end,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 1. GET /api/live-listings/available - Customer feed of all currently LIVE active listings
liveListingRouter.get('/available', async (_req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM live_listings
       WHERE status = 'LIVE' 
         AND expires_at > NOW() 
         AND quantity_left > 0
       ORDER BY created_at DESC`
    );
    res.json(rows.map(formatLiveListing));
  } catch (err) {
    console.error('Error fetching available live listings:', err);
    res.status(500).json({ error: 'Failed to fetch available live listings' });
  }
});

// 2. GET /api/live-listings - Merchant listings (optionally filtered by merchantId)
liveListingRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const { merchantId, status } = req.query;

  try {
    let sql = 'SELECT * FROM live_listings WHERE 1=1';
    const params: any[] = [];

    if (merchantId) {
      params.push(merchantId);
      sql += ` AND merchant_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await query(sql, params);
    res.json(rows.map(formatLiveListing));
  } catch (err) {
    console.error('Error fetching live listings:', err);
    res.status(500).json({ error: 'Failed to fetch live listings' });
  }
});

// 3. POST /api/live-listings - Fast-publish a live listing (< 3 taps)
liveListingRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const data = req.body;
  const listingId = `live_${Date.now()}`;

  try {
    if (!data.menuItemId) {
      return res.status(400).json({ error: 'menuItemId is required' });
    }

    const menuItem = await queryOne('SELECT * FROM menu_items WHERE id = $1 AND is_active = TRUE', [data.menuItemId]);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found or deactivated' });
    }

    const merchantId = data.merchantId || menuItem.merchant_id;
    const merchant = await queryOne('SELECT * FROM merchants WHERE id = $1', [merchantId]);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Ownership check
    if (req.currentUser && req.currentUser.role === 'MERCHANT') {
      const authMerchant = await queryOne('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      if (authMerchant && authMerchant.id !== merchant.id) {
        return res.status(403).json({ error: 'Forbidden: you do not own this store' });
      }
    }

    const discountPct = parseInt(data.discountPct, 10) || 50;
    if (discountPct < 40 || discountPct > 90) {
      return res.status(400).json({ error: 'RescueBite Rule: Discount percentage must be between 40% and 90%' });
    }

    const originalPrice = parseFloat(data.originalPrice || menuItem.base_price);
    const rescuePrice = parseFloat((originalPrice * (1 - discountPct / 100)).toFixed(2));
    const quantityLeft = Math.max(1, parseInt(data.quantityLeft, 10) || 3);

    // Compute pickup window & expiry time
    let pickupStart = data.pickupStart;
    let pickupEnd = data.pickupEnd;
    let expiresAt = data.expiresAt;

    if (!pickupStart || !pickupEnd || !expiresAt) {
      const windowStr = merchant.pickup_window_default || '18:00 - 20:00';
      const parts = windowStr.split('-').map((s: string) => s.trim());
      pickupStart = pickupStart || parts[0] || '18:00';
      pickupEnd = pickupEnd || parts[1] || '20:00';

      if (!expiresAt) {
        const today = new Date();
        const [h, m] = pickupEnd.split(':').map((s: string) => parseInt(s, 10) || 0);
        const expDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h || 20, m || 0, 0);
        // If the window has already passed today, set expiry to 2 hours from now
        if (expDate.getTime() <= Date.now()) {
          expDate.setTime(Date.now() + 2 * 60 * 60 * 1000);
        }
        expiresAt = expDate.toISOString();
      }
    }

    await pool.query(
      `INSERT INTO live_listings (
        id, merchant_id, menu_item_id, merchant_name, merchant_logo, 
        merchant_lat, merchant_lng, merchant_address, item_name, item_name_km, 
        image_url, quantity_left, discount_pct, rescue_price, original_price, 
        expires_at, pickup_start, pickup_end, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'LIVE', CURRENT_TIMESTAMP)`,
      [
        listingId,
        merchant.id,
        menuItem.id,
        merchant.business_name,
        merchant.logo_url,
        merchant.latitude,
        merchant.longitude,
        merchant.address,
        menuItem.name,
        menuItem.name_km,
        data.imageUrl || menuItem.image_url,
        quantityLeft,
        discountPct,
        rescuePrice,
        originalPrice,
        expiresAt,
        pickupStart,
        pickupEnd,
      ]
    );

    const created = await queryOne('SELECT * FROM live_listings WHERE id = $1', [listingId]);
    res.status(201).json(formatLiveListing(created));
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'This item already has an active LIVE listing. Please adjust quantity or mark it sold out first.',
      });
    }
    console.error('Error creating live listing:', err);
    res.status(500).json({ error: 'Failed to create live listing' });
  }
});

// 4. PATCH /api/live-listings/:id/quantity - Atomic quantity increment/decrement with 23505 collision catch
liveListingRouter.patch('/:id/quantity', async (req: AuthenticatedRequest, res) => {
  const { delta } = req.body;
  const deltaNum = parseInt(delta, 10);

  if (isNaN(deltaNum) || (deltaNum !== 1 && deltaNum !== -1 && deltaNum !== 0)) {
    return res.status(400).json({ error: 'delta must be 1 (restock) or -1 (decrement)' });
  }

  try {
    const existing = await queryOne('SELECT * FROM live_listings WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Ownership check
    if (req.currentUser && req.currentUser.role === 'MERCHANT') {
      const merchant = await queryOne('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      if (merchant && merchant.id !== existing.merchant_id) {
        return res.status(403).json({ error: 'Forbidden: you do not own this listing' });
      }
    }

    try {
      const result = await pool.query(
        `UPDATE live_listings
         SET quantity_left = quantity_left + $1,
             status = CASE 
                        WHEN quantity_left + $1 <= 0 THEN 'SOLD_OUT'
                        WHEN quantity_left + $1 > 0 AND expires_at > NOW() THEN 'LIVE'
                        ELSE status
                      END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
           AND status IN ('LIVE', 'SOLD_OUT')
           AND expires_at > NOW()
           AND quantity_left + $1 >= 0
         RETURNING *`,
        [deltaNum, req.params.id]
      );

      if (result.rowCount === 0) {
        return res.status(409).json({
          error: 'Cannot update quantity: listing has expired or quantity would drop below 0',
        });
      }

      res.json(formatLiveListing(result.rows[0]));
    } catch (err: any) {
      // Unique index collision: Another row for this menu_item_id is already LIVE
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'A newer active listing for this item is already live. Please adjust quantity on the active listing instead.',
        });
      }
      throw err;
    }
  } catch (err) {
    console.error('Error updating live listing quantity:', err);
    res.status(500).json({ error: 'Failed to update listing quantity' });
  }
});

// 5. PATCH /api/live-listings/:id/sold-out - 1-tap instant "Sold Out" action
liveListingRouter.patch('/:id/sold-out', async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await queryOne('SELECT * FROM live_listings WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Ownership check
    if (req.currentUser && req.currentUser.role === 'MERCHANT') {
      const merchant = await queryOne('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      if (merchant && merchant.id !== existing.merchant_id) {
        return res.status(403).json({ error: 'Forbidden: you do not own this listing' });
      }
    }

    const result = await pool.query(
      `UPDATE live_listings
       SET status = 'SOLD_OUT',
           quantity_left = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    res.json(formatLiveListing(result.rows[0]));
  } catch (err) {
    console.error('Error marking live listing sold out:', err);
    res.status(500).json({ error: 'Failed to mark listing sold out' });
  }
});

// 6. DELETE /api/live-listings/:id - Merchant pulls a listing early
liveListingRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await queryOne('SELECT * FROM live_listings WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Ownership check
    if (req.currentUser && req.currentUser.role === 'MERCHANT') {
      const merchant = await queryOne('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      if (merchant && merchant.id !== existing.merchant_id) {
        return res.status(403).json({ error: 'Forbidden: you do not own this listing' });
      }
    }

    await pool.query(
      `UPDATE live_listings SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Live listing pulled from feed' });
  } catch (err) {
    console.error('Error deleting live listing:', err);
    res.status(500).json({ error: 'Failed to delete live listing' });
  }
});
