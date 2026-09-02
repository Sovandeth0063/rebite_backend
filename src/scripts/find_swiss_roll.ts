import { pool } from '../config/db.js';

async function run() {
  const resBags = await pool.query("SELECT id, title, image_url FROM rescue_bags WHERE title ILIKE '%Swiss Roll%' OR title ILIKE '%BreadTalk%'");
  console.log('RESCUE BAGS:', resBags.rows);

  const resMenuItems = await pool.query("SELECT id, name, image_url FROM menu_items WHERE name ILIKE '%Swiss Roll%' OR name ILIKE '%Chiffon%'");
  console.log('MENU ITEMS:', resMenuItems.rows);

  const resLive = await pool.query("SELECT id, item_name, image_url FROM live_listings WHERE item_name ILIKE '%Swiss Roll%' OR item_name ILIKE '%Chiffon%'");
  console.log('LIVE LISTINGS:', resLive.rows);

  await pool.end();
}

run();
