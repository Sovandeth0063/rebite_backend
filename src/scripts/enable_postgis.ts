import { query } from '../config/db.js';

async function main() {
  try {
    console.log('[PostgreSQL] Enabling cube & earthdistance extensions...');
    await query('CREATE EXTENSION IF NOT EXISTS cube;');
    await query('CREATE EXTENSION IF NOT EXISTS earthdistance;');
    console.log('[PostgreSQL] cube & earthdistance enabled!');

    console.log('[PostgreSQL] Creating partial GIST index on active merchants...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_merchants_earth_active 
      ON merchants USING GIST (ll_to_earth(latitude, longitude))
      WHERE status = 'APPROVED';
    `);

    console.log('[PostgreSQL] Creating general GIST index on merchants...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_merchants_earth 
      ON merchants USING GIST (ll_to_earth(latitude, longitude));
    `);

    console.log('[PostgreSQL] Verification query from Phnom Penh Center (lat: 11.5564, lng: 104.9282):');
    const userLat = 11.5564;
    const userLng = 104.9282;
    const check = await query(`
      SELECT 
        m.id, 
        m.business_name, 
        m.latitude, 
        m.longitude,
        ROUND(earth_distance(ll_to_earth(m.latitude, m.longitude), ll_to_earth($1, $2))::numeric, 1) AS distance_m
      FROM merchants m
      WHERE m.status = 'APPROVED'
        AND earth_box(ll_to_earth($1, $2), 5000) @> ll_to_earth(m.latitude, m.longitude)
      ORDER BY earth_distance(ll_to_earth(m.latitude, m.longitude), ll_to_earth($1, $2)) ASC
      LIMIT 5;
    `, [userLat, userLng]);

    console.log('[PostgreSQL] Stores within 5km radius sorted by distance:', check);
    console.log('✅ PostgreSQL native spatial setup complete!');
  } catch (err: any) {
    console.error('❌ Spatial setup failed:', err);
  } finally {
    process.exit(0);
  }
}

main();
