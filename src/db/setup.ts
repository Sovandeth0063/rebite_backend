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
import { DEMO_USERS, DEMO_MERCHANTS, DEMO_RESCUE_BAGS, INITIAL_IMPACT } from '../data/seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setupDatabase(forceRecreate: boolean = false) {
  console.log('[PostgreSQL] Initializing PostgreSQL database schema...');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  if (forceRecreate) {
    console.log('[PostgreSQL] Dropping existing tables for fresh migration...');
    await pool.query(`
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

    // 2. Seed Merchants
    for (const m of DEMO_MERCHANTS) {
      await pool.query(
        `INSERT INTO merchants (id, user_id, business_name, business_name_en, business_name_km, business_type, owner_name, phone, email, address, district, city, latitude, longitude, logo_url, cover_url, description, description_en, description_km, source_language, translation_status, is_machine_translated, rating, review_count, opening_hours, pickup_window_default, status, rejection_reason, joined_date, food_categories)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
         ON CONFLICT (id) DO NOTHING`,
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

    // 3. Seed Rescue Bags
    for (const b of DEMO_RESCUE_BAGS) {
      await pool.query(
        `INSERT INTO rescue_bags (id, merchant_id, merchant_name, merchant_logo, merchant_rating, merchant_address, merchant_lat, merchant_lng, title, title_km, title_en, description, description_en, description_km, source_language, translation_status, is_machine_translated, category, image_url, original_price, rescue_price, discount_percentage, quantity_remaining, total_quantity, pickup_start, pickup_end, allergens, ingredients, storage_instructions, min_items, max_items, visibility, safety_confirmed, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
         ON CONFLICT (id) DO NOTHING`,
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

    // 5. Seed Demo Order
    await pool.query(
      `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_phone, merchant_id, merchant_name, merchant_logo, merchant_address, rescue_bag_id, rescue_bag_title, quantity, unit_price, subtotal, service_fee, total_price, pickup_date, pickup_window, payment_method, payment_status, order_status, qr_code_url, qr_code_data, pickup_code, collected_at, review_given, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
       ON CONFLICT (id) DO NOTHING`,
      [
        'ord_demo_1',
        'RB-2026-000088',
        'usr_customer',
        'Dara Sok',
        '+855 12 345 678',
        'mer_kayser',
        'Maison Kayser Cambodia (BKK1)',
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200',
        '219 E0, Street 63 (corner of Street 322), BKK1, Phnom Penh',
        'bag_kayser_1',
        'French Artisan Bakery Surprise Box',
        1,
        3.5,
        3.5,
        0.5,
        4.0,
        '2026-02-28',
        '18:30 - 20:00',
        'ABA_PAY',
        'PAID',
        'COMPLETED',
        'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=RB-2026-000088-PICKUP',
        'RB-2026-000088-PICKUP',
        'RB-0088',
        new Date().toISOString(),
        true,
        new Date().toISOString(),
      ]
    );

    // 6. Seed Demo Review
    await pool.query(
      `INSERT INTO reviews (id, order_id, merchant_id, customer_id, customer_name, customer_avatar, rating, comment, food_quality_rating, value_rating, pickup_experience_rating, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        'rev_1',
        'ord_demo_1',
        'mer_kayser',
        'usr_customer',
        'Dara Sok',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        5,
        'The croissants and sourdough loaf were incredibly fresh! Huge savings and great sustainability concept.',
        5,
        5,
        5,
        new Date().toISOString(),
      ]
    );

    // 7. Seed Admin User
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

    console.log('[PostgreSQL] Initial seed completed successfully.');
  } else {
    console.log(`[PostgreSQL] Database already contains ${count} users. Skipping seeding.`);
  }
}

// Auto-run if executed directly via `npm run db:setup`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isFresh = process.argv.includes('--fresh') || process.argv.includes('--reset') || true;
  setupDatabase(isFresh)
    .then(() => {
      console.log('[PostgreSQL] Setup and migrations complete!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[PostgreSQL] Setup failed:', err);
      process.exit(1);
    });
}
