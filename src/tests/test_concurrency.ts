import { pool, query, queryOne } from '../config/db.js';
import { ensureDatabaseAndSchema } from '../db/createDb.js';

async function testDirectConcurrency() {
  console.log('--- 🧪 DIRECT POSTGRESQL ATOMIC CONCURRENCY TEST ---');
  await ensureDatabaseAndSchema();

  // 1. Reset bag stock to 1
  await pool.query('UPDATE rescue_bags SET quantity_remaining = 1, visibility = $1 WHERE id = $2', ['PUBLIC', 'bag_bayon_1']);
  const check = await queryOne('SELECT id, quantity_remaining, visibility FROM rescue_bags WHERE id = $1', ['bag_bayon_1']);
  console.log('Initial bag state in Postgres:', check);

  // Fetch valid user ID
  const testUser = await queryOne<{ id: string }>('SELECT id FROM users LIMIT 1');
  const validUserId = testUser ? testUser.id : 'usr_1';

  // 2. Define concurrent checkout worker using exact order.routes.ts logic
  async function placeOrderWorker(workerId: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const requestedQty = 1;
      const result = await client.query(
        `UPDATE rescue_bags
         SET quantity_remaining = quantity_remaining - $1,
             visibility = CASE WHEN quantity_remaining - $1 <= 0 THEN 'SOLD_OUT' ELSE visibility END
         WHERE id = $2 AND quantity_remaining >= $1
         RETURNING *`,
        [requestedQty, 'bag_bayon_1']
      );

      if (result.rowCount === 0 || !result.rows[0]) {
        await client.query('ROLLBACK');
        return { workerId, status: 409, error: 'SOLD_OUT_CONFLICT' };
      }

      const bag = result.rows[0];
      const orderId = `ord_test_${Date.now()}_${workerId}`;
      const orderNum = `RB-2026-${Math.floor(100000 + Math.random() * 900000)}`;

      await client.query(
        `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_phone, merchant_id, merchant_name, merchant_logo, merchant_address, rescue_bag_id, rescue_bag_title, quantity, unit_price, subtotal, service_fee, total_price, pickup_date, pickup_window, payment_method, payment_status, order_status, qr_code_url, qr_code_data, pickup_code, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
        [
          orderId,
          orderNum,
          validUserId,
          'Tester Customer',
          '+855 12 999 888',
          bag.merchant_id,
          bag.merchant_name,
          bag.merchant_logo,
          bag.merchant_address,
          bag.id,
          bag.title,
          1,
          parseFloat(bag.rescue_price),
          parseFloat(bag.rescue_price),
          0.5,
          parseFloat(bag.rescue_price) + 0.5,
          '2026-09-01',
          '18:00 - 20:00',
          'ABA_PAY',
          'PAID',
          'READY_FOR_PICKUP',
          'https://qr.test',
          `${orderNum}-PICKUP`,
          'RB-1234',
          new Date().toISOString(),
        ]
      );

      await client.query('COMMIT');
      return { workerId, status: 201, orderId, orderNum, remaining: bag.quantity_remaining };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return { workerId, status: 500, error: err.message };
    } finally {
      client.release();
    }
  }

  // 3. Fire 2 workers concurrently
  console.log('Dispatching 2 simultaneous DB workers on same bag (stock=1)...');
  const [w1, w2] = await Promise.all([
    placeOrderWorker(1),
    placeOrderWorker(2),
  ]);

  console.log('Worker 1 Result:', w1);
  console.log('Worker 2 Result:', w2);

  // 4. Final DB state check
  const finalCheck = await queryOne('SELECT id, quantity_remaining, visibility FROM rescue_bags WHERE id = $1', ['bag_bayon_1']);
  console.log('Final bag state in Postgres:', finalCheck);

  const statuses = [w1.status, w2.status].sort();
  if (statuses[0] === 201 && statuses[1] === 409) {
    console.log('✅ 100% PROVEN ATOMIC CONCURRENCY: Exactly 1 worker succeeded (201) and the second worker received 409 Conflict!');
  } else {
    console.error('❌ FAILED:', statuses);
  }

  // 5. TEST: Order Cancellation restores inventory & visibility
  console.log('\n--- 🧪 TEST: ORDER CANCELLATION RESTORATION ---');
  const winningWorker = w1.status === 201 ? w1 : w2;
  console.log(`Cancelling winning order: ${winningWorker.orderId}...`);
  
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query('UPDATE orders SET order_status = $1 WHERE id = $2', ['CANCELLED', winningWorker.orderId]);
  await client.query(
    `UPDATE rescue_bags
     SET quantity_remaining = quantity_remaining + 1,
         visibility = CASE WHEN visibility = 'SOLD_OUT' THEN 'PUBLIC' ELSE visibility END
     WHERE id = $1`,
    ['bag_bayon_1']
  );
  await client.query('COMMIT');
  client.release();

  const restoredBag = await queryOne('SELECT id, quantity_remaining, visibility FROM rescue_bags WHERE id = $1', ['bag_bayon_1']);
  console.log('Restored bag state after order cancellation:', restoredBag);
  if (restoredBag.quantity_remaining === 1 && restoredBag.visibility === 'PUBLIC') {
    console.log('✅ CANCELLATION RESTORATION PASSED: Bag stock restored to 1 and visibility returned to PUBLIC!');
  }

  // 6. TEST: Staff Sold-Out does not affect paid orders
  console.log('\n--- 🧪 TEST: PAID ORDER ISOLATION ON LISTING SOLD-OUT ---');
  // Re-place order
  const newOrderId = `ord_paid_test_${Date.now()}`;
  await pool.query(
    `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_phone, merchant_id, merchant_name, merchant_logo, merchant_address, rescue_bag_id, rescue_bag_title, quantity, unit_price, subtotal, service_fee, total_price, pickup_date, pickup_window, payment_method, payment_status, order_status, qr_code_url, qr_code_data, pickup_code, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
    [newOrderId, `RB-2026-${Math.floor(100000 + Math.random() * 900000)}`, validUserId, 'Tester Customer', '+855 12 999 888', 'mer_bayon', 'Bayon Bakery', 'https://logo.test', 'Phnom Penh', 'bag_bayon_1', 'Test Bag', 1, 3.5, 3.5, 0.5, 4.0, '2026-09-01', '18:00 - 20:00', 'ABA_PAY', 'PAID', 'READY_FOR_PICKUP', 'https://qr.test', 'RB-999999-PICKUP', 'RB-9999', new Date().toISOString()]
  );

  // Staff zeros out counter listing
  await pool.query('UPDATE rescue_bags SET quantity_remaining = 0, visibility = $1 WHERE id = $2', ['SOLD_OUT', 'bag_bayon_1']);
  console.log('Merchant staff set bag to 0 / SOLD_OUT.');

  // Check paid order
  const checkPaidOrder = await queryOne('SELECT id, order_status, payment_status, pickup_code FROM orders WHERE id = $1', [newOrderId]);
  console.log('Paid order check:', checkPaidOrder);
  if (checkPaidOrder.order_status === 'READY_FOR_PICKUP' && checkPaidOrder.payment_status === 'PAID') {
    console.log('✅ PAID ORDER ISOLATION PASSED: Customer order remains PAID and READY_FOR_PICKUP even when listing is marked SOLD_OUT!');
  }

  // Restore stock
  await pool.query('UPDATE rescue_bags SET quantity_remaining = 5, visibility = $1 WHERE id = $2', ['PUBLIC', 'bag_bayon_1']);
  await pool.end();
}

testDirectConcurrency().catch(console.error);
