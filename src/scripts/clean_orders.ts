import { pool } from '../config/db.js';

async function cleanOrders() {
  console.log('Cleaning up orders and resetting bags & user states...');
  try {
    // 1. Clear all orders
    await pool.query('DELETE FROM orders');
    console.log('✓ Cleared all orders.');

    // 2. Reset bag quantities and visibility
    await pool.query(
      `UPDATE rescue_bags 
       SET quantity_remaining = total_quantity, 
           visibility = 'PUBLIC' 
       WHERE visibility != 'ARCHIVED' AND visibility != 'DRAFT'`
    );
    console.log('✓ Reset all rescue bag stock quantities to full and visibility to PUBLIC.');

    // 3. Reset customer test account stats
    await pool.query(
      `UPDATE users 
       SET cash_strikes = 0, 
           trust_score = 75, 
           consecutive_clean_pickups = 0, 
           cash_strikes_history = '[]'::jsonb 
       WHERE role = 'CUSTOMER'`
    );
    console.log('✓ Reset customer trust scores to default 75 and 0 cash strikes.');

    console.log('All reservation test data cleaned successfully!');
  } catch (err) {
    console.error('Error cleaning orders:', err);
  } finally {
    await pool.end();
  }
}

cleanOrders();
