import assert from 'assert';
import { query } from '../config/db.js';
import { validateGeoParams } from '../utils/geo.js';

async function runTests() {
  console.log('--- 🧪 SPATIAL & POSTGRESQL DISTANCE TESTS ---');

  // 1. Test Input Validation
  console.log('1. Testing Geo Input Validation...');
  assert.strictEqual(validateGeoParams(undefined, undefined).isValid, true);
  assert.strictEqual(validateGeoParams(11.55, undefined).isValid, false);
  assert.strictEqual(validateGeoParams(95.0, 104.0).isValid, false); // invalid lat
  assert.strictEqual(validateGeoParams(11.55, 200.0).isValid, false); // invalid lng
  assert.strictEqual(validateGeoParams(11.55, 104.92, -50).isValid, false); // negative radius
  const valid = validateGeoParams(11.5564, 104.9282, 3000);
  assert.strictEqual(valid.isValid, true);
  assert.strictEqual(valid.lat, 11.5564);
  assert.strictEqual(valid.lng, 104.9282);
  assert.strictEqual(valid.radiusMeters, 3000);
  console.log('✅ Geo Input Validation passed');

  // 2. Test PostgreSQL earthdistance query on merchants
  console.log('2. Testing PostgreSQL earthdistance query...');
  const merchants = await query<{
    id: string;
    business_name: string;
    latitude: number;
    longitude: number;
    distance_m: string;
  }>(`
    SELECT 
      m.id, 
      m.business_name, 
      m.latitude, 
      m.longitude,
      ROUND(earth_distance(ll_to_earth(m.latitude, m.longitude), ll_to_earth($1, $2))::numeric, 1) AS distance_m
    FROM merchants m
    WHERE m.status = 'APPROVED'
    ORDER BY earth_distance(ll_to_earth(m.latitude, m.longitude), ll_to_earth($1, $2)) ASC
  `, [11.5564, 104.9282]);

  console.log(`Found ${merchants.length} active merchants near Phnom Penh center:`);
  for (const m of merchants) {
    console.log(` - ${m.business_name}: ${m.distance_m}m (${(parseFloat(m.distance_m)/1000).toFixed(2)} km)`);
  }
  assert(merchants.length > 0, 'Should return at least 1 merchant');
  console.log('✅ Spatial distance query passed');

  // 3. Test Bounding Box Radius
  console.log('3. Testing 3km Bounding Box Radius Filter...');
  const nearby = await query(`
    SELECT m.id, m.business_name,
           ROUND(earth_distance(ll_to_earth(m.latitude, m.longitude), ll_to_earth($1, $2))::numeric, 1) AS distance_m
    FROM merchants m
    WHERE m.status = 'APPROVED'
      AND earth_box(ll_to_earth($1, $2), 3000) @> ll_to_earth(m.latitude, m.longitude)
    ORDER BY earth_distance(ll_to_earth(m.latitude, m.longitude), ll_to_earth($1, $2)) ASC
  `, [11.5564, 104.9282]);

  console.log(`Found ${nearby.length} merchants within 3km:`, nearby.map((r: any) => `${r.business_name} (${r.distance_m}m)`));
  for (const r of nearby) {
    assert(parseFloat(r.distance_m) <= 3000, 'Distance must be <= 3000m');
  }
  console.log('✅ Bounding Box Radius filter passed');

  console.log('\n🎉 ALL SPATIAL TESTS PASSED!');
  process.exit(0);
}

runTests().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
