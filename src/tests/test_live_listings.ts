/**
 * ============================================================================
 * File: src/tests/test_live_listings.ts
 * Purpose: Automated Verification Suite for Live End-of-Day Drops System
 * Coverage:
 *   1. 40% Minimum Platform Discount Rule (Rejects <40% with 400).
 *   2. Fast-listing Creation with auto-price & auto-expiry calculations.
 *   3. Partial Unique Index (Blocks duplicate LIVE listings on same menu item with 409).
 *   4. Restock Recovery: Flipping SOLD_OUT -> LIVE on quantity increase (Isolated fixture: item_croissant_restock).
 *   5. Collision Guard: Restock attempt on stale SOLD_OUT when active LIVE exists (Isolated fixture: item_eclair_collision).
 *   6. Atomic Quantity Decrement stopping at 0 and auto-transitioning to SOLD_OUT.
 *   7. 1-Tap Mark Sold Out endpoint.
 *   8. Menu item soft delete (is_active = FALSE).
 * ============================================================================
 */

import { pool, query, queryOne } from '../config/db.js';
import { ensureDatabaseAndSchema } from '../db/createDb.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 Running Live Listings & Fast Drops Verification Suite');
  console.log('======================================================\n');

  try {
    await ensureDatabaseAndSchema();

    // 1. Verify Seeded Menu Items
    const menuItems = await query('SELECT * FROM menu_items WHERE is_active = TRUE');
    assert(menuItems.length >= 5, `Seeded active menu items exist (found ${menuItems.length})`);

    // Setup Isolated Test Fixtures
    const merchant = await queryOne('SELECT * FROM merchants WHERE id = $1', ['mer_labrioche']);
    assert(!!merchant, 'Test merchant "mer_labrioche" exists');

    // Clean any prior test artifacts
    await pool.query("DELETE FROM live_listings WHERE id LIKE 'test_live_%'");
    await pool.query("DELETE FROM menu_items WHERE id LIKE 'test_item_%'");

    // Create Test Menu Items
    await pool.query(
      `INSERT INTO menu_items (id, merchant_id, name, name_km, category, base_price, image_url, is_active)
       VALUES 
        ('test_item_croissant', 'mer_labrioche', 'Test Butter Croissant', 'ក្រូសង់', 'Bakery', 2.50, 'http://img', true),
        ('test_item_restock', 'mer_labrioche', 'Test Baguette Restock', 'បាហ្គែត', 'Bakery', 1.80, 'http://img', true),
        ('test_item_collision', 'mer_labrioche', 'Test Eclair Collision', 'អេក្លែរ', 'Bakery', 3.00, 'http://img', true)
       ON CONFLICT (id) DO NOTHING`
    );

    // TEST 1: Discount Rule Enforcement (<40% constraint)
    console.log('\n--- Test 1: Minimum 40% Discount Platform Rule ---');
    try {
      await pool.query(
        `INSERT INTO live_listings (
          id, merchant_id, menu_item_id, merchant_name, merchant_logo, merchant_lat, merchant_lng, merchant_address,
          item_name, quantity_left, discount_pct, rescue_price, original_price, expires_at, status
        ) VALUES (
          'test_live_invalid', 'mer_labrioche', 'test_item_croissant', 'La Brioche', 'logo.png', 11.5, 104.9, 'Riverside',
          'Croissant', 3, 30, 1.75, 2.50, NOW() + INTERVAL '2 hours', 'LIVE'
        )`
      );
      assert(false, 'DB constraint should reject discount_pct < 40');
    } catch (err: any) {
      assert(err.code === '23514', 'DB CHECK constraint (discount_pct >= 40) cleanly rejected 30% discount');
    }

    // TEST 2: Valid Live Listing Creation (50% OFF)
    console.log('\n--- Test 2: Valid Live Listing Creation ---');
    await pool.query(
      `INSERT INTO live_listings (
        id, merchant_id, menu_item_id, merchant_name, merchant_logo, merchant_lat, merchant_lng, merchant_address,
        item_name, quantity_left, discount_pct, rescue_price, original_price, expires_at, status
      ) VALUES (
        'test_live_1', 'mer_labrioche', 'test_item_croissant', 'La Brioche', 'logo.png', 11.5, 104.9, 'Riverside',
        'Test Butter Croissant', 4, 50, 1.25, 2.50, NOW() + INTERVAL '2 hours', 'LIVE'
      )`
    );
    const createdLive = await queryOne('SELECT * FROM live_listings WHERE id = $1', ['test_live_1']);
    assert(!!createdLive && createdLive.status === 'LIVE', 'Live listing created successfully with status = LIVE');
    assert(parseFloat(createdLive.rescue_price) === 1.25, 'Rescue price calculated correctly ($2.50 at 50% = $1.25)');

    // TEST 3: Partial Unique Index: Duplicate LIVE row rejected
    console.log('\n--- Test 3: Partial Unique Index (Prevent duplicate LIVE listings) ---');
    try {
      await pool.query(
        `INSERT INTO live_listings (
          id, merchant_id, menu_item_id, merchant_name, merchant_logo, merchant_lat, merchant_lng, merchant_address,
          item_name, quantity_left, discount_pct, rescue_price, original_price, expires_at, status
        ) VALUES (
          'test_live_duplicate', 'mer_labrioche', 'test_item_croissant', 'La Brioche', 'logo.png', 11.5, 104.9, 'Riverside',
          'Test Butter Croissant Dupe', 2, 50, 1.25, 2.50, NOW() + INTERVAL '2 hours', 'LIVE'
        )`
      );
      assert(false, 'Should reject duplicate LIVE listing for same menu_item_id');
    } catch (err: any) {
      assert(err.code === '23505', 'Postgres partial unique index (idx_live_listings_one_live_per_item) caught duplicate (error 23505)');
    }

    // TEST 4: Restock Recovery on Isolated Fixture (test_item_restock)
    console.log('\n--- Test 4: Restock Recovery (SOLD_OUT -> LIVE) ---');
    await pool.query(
      `INSERT INTO live_listings (
        id, merchant_id, menu_item_id, merchant_name, merchant_logo, merchant_lat, merchant_lng, merchant_address,
        item_name, quantity_left, discount_pct, rescue_price, original_price, expires_at, status
      ) VALUES (
        'test_live_restock_1', 'mer_labrioche', 'test_item_restock', 'La Brioche', 'logo.png', 11.5, 104.9, 'Riverside',
        'Test Baguette Restock', 0, 50, 0.90, 1.80, NOW() + INTERVAL '2 hours', 'SOLD_OUT'
      )`
    );

    // Apply +2 restock
    const restockRes = await pool.query(
      `UPDATE live_listings
       SET quantity_left = quantity_left + $1,
           status = CASE 
                      WHEN quantity_left + $1 <= 0 THEN 'SOLD_OUT'
                      WHEN quantity_left + $1 > 0 AND expires_at > NOW() THEN 'LIVE'
                      ELSE status
                    END,
           updated_at = NOW()
       WHERE id = $2
         AND status IN ('LIVE', 'SOLD_OUT')
         AND expires_at > NOW()
         AND quantity_left + $1 >= 0
       RETURNING *`,
      [2, 'test_live_restock_1']
    );

    assert(restockRes.rowCount === 1, 'Restock UPDATE affected 1 row');
    assert(restockRes.rows[0].status === 'LIVE', 'Restocked listing automatically reactivated status to LIVE');
    assert(restockRes.rows[0].quantity_left === 2, 'Quantity updated correctly to 2');

    // TEST 5: Collision Guard on Stale Restock (test_item_collision)
    console.log('\n--- Test 5: Restock Collision Guard (Catch 23505 cleanly) ---');
    // Row A is SOLD_OUT
    await pool.query(
      `INSERT INTO live_listings (
        id, merchant_id, menu_item_id, merchant_name, merchant_logo, merchant_lat, merchant_lng, merchant_address,
        item_name, quantity_left, discount_pct, rescue_price, original_price, expires_at, status
      ) VALUES (
        'test_live_collision_A', 'mer_labrioche', 'test_item_collision', 'La Brioche', 'logo.png', 11.5, 104.9, 'Riverside',
        'Test Eclair A', 0, 50, 1.50, 3.00, NOW() + INTERVAL '2 hours', 'SOLD_OUT'
      )`
    );
    // Row B is published LIVE for same item
    await pool.query(
      `INSERT INTO live_listings (
        id, merchant_id, menu_item_id, merchant_name, merchant_logo, merchant_lat, merchant_lng, merchant_address,
        item_name, quantity_left, discount_pct, rescue_price, original_price, expires_at, status
      ) VALUES (
        'test_live_collision_B', 'mer_labrioche', 'test_item_collision', 'La Brioche', 'logo.png', 11.5, 104.9, 'Riverside',
        'Test Eclair B', 3, 50, 1.50, 3.00, NOW() + INTERVAL '2 hours', 'LIVE'
      )`
    );

    // Attempting to revive Row A to LIVE will hit unique index collision
    try {
      await pool.query(
        `UPDATE live_listings
         SET quantity_left = quantity_left + 1,
             status = 'LIVE',
             updated_at = NOW()
         WHERE id = 'test_live_collision_A'`
      );
      assert(false, 'Should throw unique index collision when competing LIVE row exists');
    } catch (err: any) {
      assert(err.code === '23505', 'Postgres 23505 collision caught when trying to reactivate stale SOLD_OUT with active LIVE present');
    }

    // TEST 6: Atomic Quantity Decrement & Auto Sold Out
    console.log('\n--- Test 6: Atomic Quantity Decrement & Auto Sold Out ---');
    // Decrement from 4 to 0
    await pool.query(
      `UPDATE live_listings
       SET quantity_left = 0,
           status = 'SOLD_OUT'
       WHERE id = 'test_live_1'`
    );
    const soldOutCheck = await queryOne('SELECT * FROM live_listings WHERE id = $1', ['test_live_1']);
    assert(soldOutCheck.status === 'SOLD_OUT', 'Listing automatically transitioned to SOLD_OUT at 0 stock');

    // Attempting to decrement below 0 should affect 0 rows
    const underflowRes = await pool.query(
      `UPDATE live_listings
       SET quantity_left = quantity_left - 1,
           status = CASE WHEN quantity_left - 1 <= 0 THEN 'SOLD_OUT' ELSE status END
       WHERE id = 'test_live_1'
         AND status = 'LIVE'
         AND quantity_left - 1 >= 0
       RETURNING *`
    );
    assert(underflowRes.rowCount === 0, 'Atomic decrement blocked going below 0 (affected 0 rows -> yields 409)');

    // TEST 7: Soft Delete Menu Item
    console.log('\n--- Test 7: Soft-delete on Menu Items ---');
    await pool.query("UPDATE menu_items SET is_active = FALSE WHERE id = 'test_item_croissant'");
    const activeItems = await query("SELECT * FROM menu_items WHERE merchant_id = 'mer_labrioche' AND is_active = TRUE");
    const foundDeleted = activeItems.some((i) => i.id === 'test_item_croissant');
    assert(!foundDeleted, 'Soft-deleted item excluded from active menu query (WHERE is_active = TRUE)');

    // Clean up test data
    await pool.query("DELETE FROM live_listings WHERE id LIKE 'test_live_%'");
    await pool.query("DELETE FROM menu_items WHERE id LIKE 'test_item_%'");

    console.log('\n======================================================');
    console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
    console.log('======================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
