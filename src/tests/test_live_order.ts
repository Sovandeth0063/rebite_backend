import { pool } from '../config/db.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(`
      INSERT INTO orders (
        id, order_number, customer_id, customer_name, customer_phone,
        merchant_id, merchant_name, merchant_logo, merchant_address,
        rescue_bag_id, rescue_bag_title, quantity, unit_price,
        subtotal, service_fee, total_price, pickup_date, pickup_window,
        payment_method, payment_status, order_status, qr_code_url,
        qr_code_data, pickup_code, created_at
      ) VALUES (
        'ord_live_test_1', 'RB-2026-LIVE01', 'usr_1788229813203', 'Sovandath Hour',
        '+855 12 345 678', 'mer_bayon', 'Bayon Bakery', 'https://logo.png',
        'St 282, BKK1, Phnom Penh', 'bag_bayon_1', 'Bayon Fresh Bread',
        1, 3.50, 3.50, 0.50, 4.00, '2026-09-02', '18:00 - 20:00',
        'CASH_AT_PICKUP', 'PENDING', 'READY_FOR_PICKUP', 'https://qr.png',
        'RB-2026-LIVE01-PICKUP', 'RB-7777', NOW()
      ) ON CONFLICT (id) DO UPDATE SET order_status = 'READY_FOR_PICKUP'
      RETURNING *
    `);
    await client.query('COMMIT');
    console.log('Successfully committed order:', res.rows[0].order_number);
  } finally {
    client.release();
  }

  const directCount = await pool.query('SELECT count(*) FROM orders');
  console.log('Direct PostgreSQL order count:', directCount.rows[0].count);

  const apiRes = await fetch('http://localhost:5000/api/orders');
  const apiOrders = await apiRes.json() as any[];
  console.log('GET http://localhost:5000/api/orders count:', apiOrders.length);
  if (apiOrders.length > 0) {
    console.log('First order from API:', apiOrders[0].orderNumber, apiOrders[0].orderStatus);
  }

  const viteRes = await fetch('http://localhost:3001/api/orders');
  const viteOrders = await viteRes.json() as any[];
  console.log('GET http://localhost:3001/api/orders (Vite proxy) count:', viteOrders.length);
}

main().catch(console.error).finally(() => process.exit(0));
