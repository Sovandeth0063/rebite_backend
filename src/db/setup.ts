/**
 * ============================================================================
 * File: src/db/setup.ts
 * Purpose: PostgreSQL Schema Execution & Initial Data Seeding
 * Responsibilities:
 *   - Reads and applies the DDL statements from schema.sql.
 *   - Checks if users/merchants already exist; if not, seeds initial demo datasets.
 *   - Seeds DEMO_USERS, DEMO_MERCHANTS, DEMO_RESCUE_BAGS, INITIAL_IMPACT, and sample orders.
 *   - Can be run programmatically or directly via CLI: npm run db:setup
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query, queryOne, testConnection } from '../config/db.js';
import { DEMO_USERS, DEMO_MERCHANTS, DEMO_RESCUE_BAGS, INITIAL_IMPACT, DEFAULT_CATEGORY_PRESETS } from '../data/seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setupDatabase(forceRecreate: boolean = false) {
  console.log('[PostgreSQL] Initializing PostgreSQL database schema...');

  let schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  }
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.resolve('src/db/schema.sql');
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  if (forceRecreate) {
    console.log('[PostgreSQL] Dropping existing tables for fresh migration...');
    await pool.query(`
      DROP TABLE IF EXISTS live_listings CASCADE;
      DROP TABLE IF EXISTS menu_items CASCADE;
      DROP TABLE IF EXISTS login_sessions CASCADE;
      DROP TABLE IF EXISTS admin_users CASCADE;
      DROP TABLE IF EXISTS platform_config CASCADE;
      DROP TABLE IF EXISTS merchant_settings CASCADE;
      DROP TABLE IF EXISTS customer_settings CASCADE;
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS ai_recommendations CASCADE;
      DROP TABLE IF EXISTS inventory CASCADE;
      DROP TABLE IF EXISTS reports CASCADE;
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS impact_stats CASCADE;
      DROP TABLE IF EXISTS reviews CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS rescue_bags CASCADE;
      DROP TABLE IF EXISTS merchants CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS kv_store CASCADE;
    `);
  }

  // Execute schema DDL
  await pool.query(schemaSql);
  console.log('[PostgreSQL] Schema applied successfully.');

  // Check if users already seeded
  const userCheck = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users');
  const count = parseInt(userCheck?.count || '0', 10);

  if (count === 0 || forceRecreate) {
    console.log('[PostgreSQL] Database is empty. Seeding initial data...');

    // 1. Seed Demo Users
    for (const u of DEMO_USERS) {
      await pool.query(
        `INSERT INTO users (id, email, name, role, phone, avatar_url, language, points, referral_code, referred_by, saved_store_ids, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          u.id,
          u.email,
          u.name,
          u.role,
          u.phone || null,
          u.avatarUrl || null,
          u.language || 'en',
          u.points || 0,
          u.referralCode || null,
          u.referredBy || null,
          JSON.stringify(u.savedStoreIds || []),
          u.createdAt || new Date().toISOString(),
        ]
      );
    }

    // 1b. Ensure merchant user accounts exist for foreign key constraints
    for (const m of DEMO_MERCHANTS) {
      if (m.userId) {
        await pool.query(
          `INSERT INTO users (id, email, name, role, phone, avatar_url, language, points, referral_code, saved_store_ids, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            m.userId,
            m.email || `${m.id}@rescuebite.kh`,
            m.ownerName || m.businessName,
            'MERCHANT',
            m.phone || '+855 12 000 000',
            m.logoUrl || null,
            'en',
            100,
            `MREF_${m.id.toUpperCase()}`,
            JSON.stringify([]),
            new Date().toISOString(),
          ]
        );
      }
    }

    // 2. Seed / Upsert Merchants
    for (const m of DEMO_MERCHANTS) {
      await pool.query(
        `INSERT INTO merchants (id, user_id, business_name, business_name_en, business_name_km, business_type, owner_name, phone, email, address, district, city, latitude, longitude, logo_url, cover_url, description, description_en, description_km, source_language, translation_status, is_machine_translated, rating, review_count, opening_hours, pickup_window_default, status, rejection_reason, joined_date, food_categories)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
         ON CONFLICT (id) DO UPDATE SET
           business_name = EXCLUDED.business_name,
           business_name_en = EXCLUDED.business_name_en,
           business_name_km = EXCLUDED.business_name_km,
           business_type = EXCLUDED.business_type,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           address = EXCLUDED.address,
           district = EXCLUDED.district,
           city = EXCLUDED.city,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           logo_url = EXCLUDED.logo_url,
           cover_url = EXCLUDED.cover_url,
           description = EXCLUDED.description,
           description_en = EXCLUDED.description_en,
           description_km = EXCLUDED.description_km,
           rating = EXCLUDED.rating,
           review_count = EXCLUDED.review_count,
           opening_hours = EXCLUDED.opening_hours,
           pickup_window_default = EXCLUDED.pickup_window_default,
           food_categories = EXCLUDED.food_categories`,
        [
          m.id,
          m.userId,
          m.businessName,
          m.businessName_en || null,
          m.businessName_km || null,
          m.businessType,
          m.ownerName,
          m.phone,
          m.email,
          m.address,
          m.district,
          m.city,
          m.latitude,
          m.longitude,
          m.logoUrl,
          m.coverUrl,
          m.description,
          m.description_en || null,
          m.description_km || null,
          m.sourceLanguage || null,
          m.translationStatus || null,
          m.isMachineTranslated || false,
          m.rating,
          m.reviewCount,
          m.openingHours,
          m.pickupWindowDefault,
          m.status,
          m.rejectionReason || null,
          m.joinedDate,
          JSON.stringify(m.foodCategories || []),
        ]
      );
    }

    // 3. Seed / Upsert Rescue Bags
    for (const b of DEMO_RESCUE_BAGS) {
      await pool.query(
        `INSERT INTO rescue_bags (id, merchant_id, merchant_name, merchant_logo, merchant_rating, merchant_address, merchant_lat, merchant_lng, title, title_km, title_en, description, description_en, description_km, source_language, translation_status, is_machine_translated, category, image_url, original_price, rescue_price, discount_percentage, quantity_remaining, total_quantity, pickup_start, pickup_end, allergens, ingredients, storage_instructions, min_items, max_items, visibility, safety_confirmed, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
         ON CONFLICT (id) DO UPDATE SET
           merchant_name = EXCLUDED.merchant_name,
           merchant_logo = EXCLUDED.merchant_logo,
           merchant_rating = EXCLUDED.merchant_rating,
           merchant_address = EXCLUDED.merchant_address,
           merchant_lat = EXCLUDED.merchant_lat,
           merchant_lng = EXCLUDED.merchant_lng,
           title = EXCLUDED.title,
           title_km = EXCLUDED.title_km,
           title_en = EXCLUDED.title_en,
           description = EXCLUDED.description,
           description_en = EXCLUDED.description_en,
           description_km = EXCLUDED.description_km,
           category = EXCLUDED.category,
           image_url = EXCLUDED.image_url,
           original_price = EXCLUDED.original_price,
           rescue_price = EXCLUDED.rescue_price,
           discount_percentage = EXCLUDED.discount_percentage,
           quantity_remaining = EXCLUDED.quantity_remaining,
           total_quantity = EXCLUDED.total_quantity,
           pickup_start = EXCLUDED.pickup_start,
           pickup_end = EXCLUDED.pickup_end,
           allergens = EXCLUDED.allergens,
           ingredients = EXCLUDED.ingredients`,
        [
          b.id,
          b.merchantId,
          b.merchantName,
          b.merchantLogo,
          b.merchantRating,
          b.merchantAddress,
          b.merchantLat,
          b.merchantLng,
          b.title,
          b.titleKm || null,
          b.title_en || null,
          b.description,
          b.description_en || null,
          b.description_km || null,
          b.sourceLanguage || null,
          b.translationStatus || null,
          b.isMachineTranslated || false,
          b.category,
          b.imageUrl,
          b.originalPrice,
          b.rescuePrice,
          b.discountPercentage,
          b.quantityRemaining,
          b.totalQuantity,
          b.pickupStart,
          b.pickupEnd,
          JSON.stringify(b.allergens || []),
          JSON.stringify(b.ingredients || []),
          b.storageInstructions || null,
          b.minItems || 1,
          b.maxItems || 5,
          b.visibility || 'PUBLIC',
          b.safetyConfirmed ?? true,
          b.createdAt || new Date().toISOString(),
        ]
      );
    }

    // 4. Seed Impact Stats
    await pool.query(
      `INSERT INTO impact_stats (id, meals_rescued, food_saved_kg, customer_savings_usd, co2_avoided_kg, active_merchants_count)
       VALUES (1, $1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         meals_rescued = EXCLUDED.meals_rescued,
         food_saved_kg = EXCLUDED.food_saved_kg,
         customer_savings_usd = EXCLUDED.customer_savings_usd,
         co2_avoided_kg = EXCLUDED.co2_avoided_kg,
         active_merchants_count = EXCLUDED.active_merchants_count`,
      [
        INITIAL_IMPACT.mealsRescued,
        INITIAL_IMPACT.foodSavedKg,
        INITIAL_IMPACT.customerSavingsUsd,
        INITIAL_IMPACT.co2AvoidedKg,
        INITIAL_IMPACT.activeMerchantsCount,
      ]
    );

    // 5. Seed Admin User
    await pool.query(
      `INSERT INTO admin_users (id, name, email, role_level, two_factor_enforced, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      ['adm_1', 'Super Administrator', 'admin@rescuebite.kh', 'SUPER_ADMIN', true, new Date().toISOString()]
    );

    // 8. Seed Platform Config
    await pool.query(
      `INSERT INTO platform_config (id, config)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
      [
        JSON.stringify({
          autoApproveNewMerchants: true,
          supportedCities: ['Phnom Penh', 'Siem Reap', 'Battambang', 'Sihanoukville', 'Kampot'],
          defaultCommissionRate: 15,
          unclaimedAutoCancelMinutes: 60,
          notificationRouting: {
            merchantApplicationsEmail: 'partnerships@rescuebite.kh',
            disputesEmail: 'support@rescuebite.kh',
            flaggedContentEmail: 'trust@rescuebite.kh',
          },
        }),
      ]
    );

    // 9. Seed Menu Items for Live Menu Fast Listing
    const SAMPLE_MENU_ITEMS = [
      { id: 'menu_item_1', merchantId: 'mer_labrioche', name: 'Artisan Butter Croissant', nameKm: 'នំប៉័ងក្រូសង់ប៊ឺរ', category: 'Bakery', basePrice: 2.50, imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400' },
      { id: 'menu_item_2', merchantId: 'mer_labrioche', name: 'Pain au Chocolat', nameKm: 'នំប៉័ងសូកូឡាបារាំង', category: 'Bakery', basePrice: 2.80, imageUrl: 'https://images.unsplash.com/photo-1530610476181-d83430b64dcd?w=400' },
      { id: 'menu_item_3', merchantId: 'mer_labrioche', name: 'French Baguette Tradition', nameKm: 'នំប៉័ងបាហ្គែតបារាំង', category: 'Bakery', basePrice: 1.80, imageUrl: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?w=400' },
      { id: 'menu_item_4', merchantId: 'mer_khema', name: 'Quiche Lorraine Maison', nameKm: 'នំគីសសាច់ជ្រូកបារាំង', category: 'Bakery', basePrice: 4.50, imageUrl: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400' },
      { id: 'menu_item_5', merchantId: 'mer_gerbies', name: 'Gourmet Chicken Caesar Wrap', nameKm: 'រ៉េបមាន់សេសា', category: 'Meals', basePrice: 4.80, imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400' },
      { id: 'menu_item_6', merchantId: 'mer_breadtalk', name: 'Signature Pork Flosss Bun', nameKm: 'នំប៉័ងសាច់ផាត់', category: 'Bakery', basePrice: 2.20, imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400' },
      { id: 'menu_item_7', merchantId: 'mer_taties', name: 'Almond Frangipane Croissant', nameKm: 'ក្រូសង់អាល់ម៉ុន', category: 'Bakery', basePrice: 3.20, imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400' },
      { id: 'menu_item_8', merchantId: 'mer_ausbake', name: 'Rustic Country Sourdough', nameKm: 'នំប៉័ងសូដូសិប្បកម្ម', category: 'Bakery', basePrice: 4.20, imageUrl: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=400' },
    ];

    for (const item of SAMPLE_MENU_ITEMS) {
      await pool.query(
        `INSERT INTO menu_items (id, merchant_id, name, name_km, category, base_price, image_url, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING`,
        [item.id, item.merchantId, item.name, item.nameKm, item.category, item.basePrice, item.imageUrl]
      );
    }

    // 10. Seed Category Presets
    for (const preset of DEFAULT_CATEGORY_PRESETS) {
      await pool.query(
        `INSERT INTO category_presets (id, business_type, name_en, name_km, icon, order_index, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING`,
        [preset.id, preset.businessType, preset.nameEn, preset.nameKm, preset.icon, preset.orderIndex]
      );
    }

    console.log('[PostgreSQL] Initial seed completed successfully.');
  } else {
    console.log(`[PostgreSQL] Database already contains ${count} users. Skipping seeding.`);
  }
}

// Auto-run if executed directly via `npm run db:setup`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isFresh = process.argv.includes('--fresh') || process.argv.includes('--reset') || true;
  setupDatabase(isFresh)
    .then(async () => {
      console.log('[PostgreSQL] Setup and migrations complete!');
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[PostgreSQL] Setup failed:', err);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
