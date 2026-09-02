/**
 * ============================================================================
 * File: src/services/expiryWorker.ts
 * Purpose: Automated Background Expiry Worker Daemon
 * Responsibilities:
 *   - Runs periodically (every 5 minutes) on server boot.
 *   - Automatically flips LIVE listings whose expires_at timestamp has passed to EXPIRED.
 *   - Prevents stale listings from lingering on customer feeds after store closing.
 * ============================================================================
 */

import { pool } from '../config/db.js';

export function startExpiryWorker() {
  console.log('[ExpiryWorker] Background listing expiry worker initialized (interval: 5m)');

  const checkExpired = async () => {
    try {
      // 1. Sweep expired live surplus drops
      const res = await pool.query(
        `UPDATE live_listings
         SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'LIVE' AND expires_at < NOW()
         RETURNING id, item_name, merchant_name`
      );

      if (res.rowCount && res.rowCount > 0) {
        console.log(`[ExpiryWorker] Auto-expired ${res.rowCount} listings that passed their pickup window.`);
      }

      // 2. Sweep expired customer perk vouchers
      const vouchRes = await pool.query(
        `UPDATE customer_vouchers
         SET status = 'EXPIRED'
         WHERE status = 'ACTIVE' AND expires_at <= CURRENT_TIMESTAMP
         RETURNING id, voucher_code, customer_id`
      );

      if (vouchRes.rowCount && vouchRes.rowCount > 0) {
        console.log(`[ExpiryWorker] Auto-expired ${vouchRes.rowCount} customer vouchers that passed their validity window.`);
      }
    } catch (err: any) {
      console.warn('[ExpiryWorker] Error during expiry check cycle:', err.message);
    }
  };

  // Run initial check immediately
  checkExpired();

  // Schedule recurring interval every 5 minutes (300,000 ms)
  const timerId = setInterval(checkExpired, 5 * 60 * 1000);
  return timerId;
}
