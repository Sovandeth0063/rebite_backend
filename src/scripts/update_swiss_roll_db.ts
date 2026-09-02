import { pool } from '../config/db.js';

async function updateDb() {
  const result = await pool.query(
    "UPDATE rescue_bags SET image_url = $1 WHERE id = $2 OR title ILIKE '%Swiss Roll%' RETURNING id, title, image_url",
    ['/images/breadtalk_swiss_roll.jpg', 'bag_breadtalk_3']
  );
  console.log('UPDATED ROWS:', result.rows);
  await pool.end();
}

updateDb();
