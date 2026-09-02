-- ============================================================================
-- File: src/db/schema.sql
-- Purpose: Production-Grade PostgreSQL Database Schema (DDL)
-- Features:
--   - Native PostGIS / earthdistance Great-Circle Distance & Bounding Box support
--   - Full Foreign Key integrity (ON DELETE CASCADE / SET NULL)
--   - Check Constraints (Ratings 1-5, Discounts 0-100%, Status enums, Positive prices)
--   - Auto-updating `updated_at` trigger function on mutable tables
--   - Multi-column and foreign-key performance indexes
--   - Native JSONB and TIMESTAMP WITH TIME ZONE support
-- ============================================================================

-- Spatial Extensions for Great-Circle Distance & Bounding Box Indexing
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- 0. Shared Trigger Function for updated_at timestamps
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('CUSTOMER', 'MERCHANT', 'ADMIN', 'GUEST')),
  phone VARCHAR(50),
  avatar_url TEXT,
  language VARCHAR(10) DEFAULT 'en' CHECK (language IN ('en', 'km')),
  points INTEGER DEFAULT 0 CHECK (points >= 0),
  trust_score INTEGER DEFAULT 75 CHECK (trust_score >= 0 AND trust_score <= 100),
  cash_strikes INTEGER DEFAULT 0 CHECK (cash_strikes >= 0),
  consecutive_clean_pickups INTEGER DEFAULT 0 CHECK (consecutive_clean_pickups >= 0),
  cash_strikes_history JSONB DEFAULT '[]'::jsonb,
  referral_code VARCHAR(100),
  referred_by VARCHAR(100),
  saved_store_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Merchants Table
CREATE TABLE IF NOT EXISTS merchants (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
  business_name VARCHAR(255) NOT NULL,
  business_name_en VARCHAR(255),
  business_name_km VARCHAR(255),
  business_type VARCHAR(100) NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  district VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  logo_url TEXT,
  cover_url TEXT,
  description TEXT NOT NULL,
  description_en TEXT,
  description_km TEXT,
  source_language VARCHAR(20),
  translation_status VARCHAR(20),
  is_machine_translated BOOLEAN DEFAULT FALSE,
  rating DOUBLE PRECISION DEFAULT 5.0 CHECK (rating >= 0.0 AND rating <= 5.0),
  bayesian_rating DOUBLE PRECISION DEFAULT 5.0,
  review_count INTEGER DEFAULT 0 CHECK (review_count >= 0),
  opening_hours VARCHAR(100) NOT NULL,
  pickup_window_default VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
  rejection_reason TEXT,
  joined_date VARCHAR(50) NOT NULL,
  food_categories JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Rescue Bags Table
CREATE TABLE IF NOT EXISTS rescue_bags (
  id VARCHAR(100) PRIMARY KEY,
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  merchant_name VARCHAR(255) NOT NULL,
  merchant_logo TEXT NOT NULL,
  merchant_rating DOUBLE PRECISION DEFAULT 5.0 CHECK (merchant_rating >= 0.0 AND merchant_rating <= 5.0),
  bayesian_rating DOUBLE PRECISION DEFAULT 5.0,
  merchant_address TEXT NOT NULL,
  merchant_lat DOUBLE PRECISION NOT NULL,
  merchant_lng DOUBLE PRECISION NOT NULL,
  title VARCHAR(255) NOT NULL,
  title_km VARCHAR(255),
  title_en VARCHAR(255),
  description TEXT NOT NULL,
  description_en TEXT,
  description_km TEXT,
  source_language VARCHAR(20),
  translation_status VARCHAR(20),
  is_machine_translated BOOLEAN DEFAULT FALSE,
  category VARCHAR(100) NOT NULL,
  image_url TEXT NOT NULL,
  original_price NUMERIC(10, 2) NOT NULL CHECK (original_price >= 0),
  rescue_price NUMERIC(10, 2) NOT NULL CHECK (rescue_price >= 0),
  discount_percentage INTEGER NOT NULL CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
  pickup_start VARCHAR(50) NOT NULL,
  pickup_end VARCHAR(50) NOT NULL,
  allergens JSONB DEFAULT '[]'::jsonb,
  composition_tags JSONB DEFAULT '[]'::jsonb,
  estimated_item_count VARCHAR(50),
  dietary_tags JSONB DEFAULT '[]'::jsonb,
  allergen_disclaimer TEXT,
  ingredients JSONB DEFAULT '[]'::jsonb,
  storage_instructions TEXT,
  min_items INTEGER DEFAULT 1 CHECK (min_items >= 1),
  max_items INTEGER DEFAULT 5 CHECK (max_items >= min_items),
  visibility VARCHAR(50) DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'DRAFT', 'SOLD_OUT', 'ARCHIVED')),
  safety_confirmed BOOLEAN DEFAULT TRUE,
  has_auto_escalating_discount BOOLEAN DEFAULT FALSE,
  escalated_discount_percentage INTEGER CHECK (escalated_discount_percentage IS NULL OR (escalated_discount_percentage >= 0 AND escalated_discount_percentage <= 100)),
  escalate_minutes_before_end INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Category Presets Table (DB-backed presets by business type)
CREATE TABLE IF NOT EXISTS category_presets (
  id VARCHAR(100) PRIMARY KEY,
  business_type VARCHAR(100) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_km VARCHAR(255) NOT NULL,
  icon VARCHAR(50) NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Orders Table (Snapshot fields preserved for historical purchase integrity)
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(100) PRIMARY KEY,
  order_number VARCHAR(100) UNIQUE NOT NULL,
  customer_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  merchant_name VARCHAR(255) NOT NULL,
  merchant_logo TEXT NOT NULL,
  merchant_address TEXT NOT NULL,
  rescue_bag_id VARCHAR(100) NOT NULL,
  rescue_bag_title VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  service_fee NUMERIC(10, 2) NOT NULL CHECK (service_fee >= 0),
  total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
  pickup_date VARCHAR(50) NOT NULL,
  pickup_window VARCHAR(100) NOT NULL,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('ABA_PAY', 'CARD', 'CASH_AT_PICKUP')),
  payment_status VARCHAR(50) NOT NULL CHECK (payment_status IN ('PAID', 'PENDING', 'REFUNDED')),
  order_status VARCHAR(50) NOT NULL CHECK (order_status IN ('RESERVED', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PENDING', 'PAID', 'CONFIRMED', 'EXPIRED')),
  qr_code_url TEXT,
  qr_code_data TEXT NOT NULL,
  pickup_code VARCHAR(50) NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE,
  review_given BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(100) PRIMARY KEY,
  order_id VARCHAR(100) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_name VARCHAR(255) NOT NULL,
  customer_avatar TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  comment_en TEXT,
  comment_km TEXT,
  source_language VARCHAR(20),
  translation_status VARCHAR(20),
  is_machine_translated BOOLEAN DEFAULT FALSE,
  food_quality_rating INTEGER CHECK (food_quality_rating IS NULL OR (food_quality_rating >= 1 AND food_quality_rating <= 5)),
  value_rating INTEGER CHECK (value_rating IS NULL OR (value_rating >= 1 AND value_rating <= 5)),
  pickup_experience_rating INTEGER CHECK (pickup_experience_rating IS NULL OR (pickup_experience_rating >= 1 AND pickup_experience_rating <= 5)),
  consumed_in_window BOOLEAN DEFAULT TRUE,
  is_suspicious_ip BOOLEAN DEFAULT FALSE,
  moderation_status VARCHAR(50) DEFAULT 'APPROVED',
  is_hidden BOOLEAN DEFAULT FALSE,
  merchant_reply TEXT,
  merchant_replied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Impact Stats Table
CREATE TABLE IF NOT EXISTS impact_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  meals_rescued INTEGER DEFAULT 0 CHECK (meals_rescued >= 0),
  food_saved_kg NUMERIC(10, 2) DEFAULT 0 CHECK (food_saved_kg >= 0),
  customer_savings_usd NUMERIC(10, 2) DEFAULT 0 CHECK (customer_savings_usd >= 0),
  co2_avoided_kg NUMERIC(10, 2) DEFAULT 0 CHECK (co2_avoided_kg >= 0),
  active_merchants_count INTEGER DEFAULT 0 CHECK (active_merchants_count >= 0)
);

-- 7. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(100) PRIMARY KEY,
  admin_id VARCHAR(100) NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target VARCHAR(255) NOT NULL,
  details TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Reports Table
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(100) PRIMARY KEY,
  reporter_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_type VARCHAR(50) NOT NULL CHECK (reporter_type IN ('CUSTOMER', 'MERCHANT')),
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('LISTING', 'MERCHANT', 'CUSTOMER', 'FOOD_SAFETY')),
  target_id VARCHAR(100) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Merchant Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
  id VARCHAR(100) PRIMARY KEY,
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
  normal_price NUMERIC(10, 2) NOT NULL CHECK (normal_price >= 0),
  expiry_date VARCHAR(50) NOT NULL,
  expected_sales INTEGER NOT NULL DEFAULT 0,
  surplus_risk VARCHAR(50) NOT NULL CHECK (surplus_risk IN ('HIGH', 'MEDIUM', 'LOW')),
  recommended_action TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. AI Recommendations Table
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id VARCHAR(100) PRIMARY KEY,
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  risk_level VARCHAR(50) NOT NULL CHECK (risk_level IN ('HIGH', 'MEDIUM', 'LOW')),
  suggested_action JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('ORDER_UPDATE', 'NEW_LISTING', 'REWARD', 'SYSTEM')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Settings Tables
CREATE TABLE IF NOT EXISTS customer_settings (
  user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS merchant_settings (
  merchant_id VARCHAR(100) PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Platform Configuration Table
CREATE TABLE IF NOT EXISTS platform_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  config JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role_level VARCHAR(50) NOT NULL CHECK (role_level IN ('SUPER_ADMIN', 'SUPPORT_ADMIN', 'OPERATIONS_ADMIN')),
  two_factor_enforced BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP WITH TIME ZONE
);

-- 15. Login Sessions Table
CREATE TABLE IF NOT EXISTS login_sessions (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device VARCHAR(100) NOT NULL,
  browser VARCHAR(100) NOT NULL,
  ip_address VARCHAR(100) NOT NULL,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_current BOOLEAN DEFAULT FALSE
);

-- 16. Menu Items Table (Merchant's reusable item catalogue — set up once)
CREATE TABLE IF NOT EXISTS menu_items (
  id VARCHAR(100) PRIMARY KEY,
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  name_km VARCHAR(255),
  category VARCHAR(100) NOT NULL DEFAULT 'Bakery',
  base_price NUMERIC(10, 2) NOT NULL CHECK (base_price > 0),
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. Live Listings Table (What's available RIGHT NOW at a discounted price)
CREATE TABLE IF NOT EXISTS live_listings (
  id VARCHAR(100) PRIMARY KEY,
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  menu_item_id VARCHAR(100) NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  merchant_name VARCHAR(255) NOT NULL,
  merchant_logo TEXT NOT NULL,
  merchant_lat DOUBLE PRECISION NOT NULL,
  merchant_lng DOUBLE PRECISION NOT NULL,
  merchant_address TEXT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_name_km VARCHAR(255),
  image_url TEXT,
  quantity_left INTEGER NOT NULL DEFAULT 1 CHECK (quantity_left >= 0),
  discount_pct INTEGER NOT NULL CHECK (discount_pct >= 40 AND discount_pct <= 90),
  rescue_price NUMERIC(10, 2) NOT NULL CHECK (rescue_price > 0),
  original_price NUMERIC(10, 2) NOT NULL CHECK (original_price > 0),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  pickup_start VARCHAR(50),
  pickup_end VARCHAR(50),
  status VARCHAR(50) DEFAULT 'LIVE' CHECK (status IN ('LIVE', 'SOLD_OUT', 'EXPIRED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Triggers for Automatic `updated_at` Timestamp Management
-- ============================================================================
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_merchants_updated_at ON merchants;
CREATE TRIGGER trg_merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_rescue_bags_updated_at ON rescue_bags;
CREATE TRIGGER trg_rescue_bags_updated_at
  BEFORE UPDATE ON rescue_bags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory;
CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customer_settings_updated_at ON customer_settings;
CREATE TRIGGER trg_customer_settings_updated_at
  BEFORE UPDATE ON customer_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_merchant_settings_updated_at ON merchant_settings;
CREATE TRIGGER trg_merchant_settings_updated_at
  BEFORE UPDATE ON merchant_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_platform_config_updated_at ON platform_config;
CREATE TRIGGER trg_platform_config_updated_at
  BEFORE UPDATE ON platform_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_live_listings_updated_at ON live_listings;
CREATE TRIGGER trg_live_listings_updated_at
  BEFORE UPDATE ON live_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Performance & Query Optimization Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_merchants_user ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
-- Spatial GIST Index for Sub-Millisecond Distance & Bounding-Box Proximity Filtering
CREATE INDEX IF NOT EXISTS idx_merchants_earth_active ON merchants USING GIST (ll_to_earth(latitude, longitude)) WHERE status = 'APPROVED';
CREATE INDEX IF NOT EXISTS idx_merchants_earth ON merchants USING GIST (ll_to_earth(latitude, longitude));
CREATE INDEX IF NOT EXISTS idx_rescue_bags_merchant_visibility ON rescue_bags(merchant_id, visibility);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_rescue_bag ON orders(rescue_bag_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_reviews_merchant ON reviews(merchant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_merchant ON inventory(merchant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_date ON audit_logs(admin_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_merchant ON menu_items(merchant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_live_listings_merchant ON live_listings(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_live_listings_status_expiry ON live_listings(status, expires_at);

-- Partial unique index: Only one LIVE row allowed per menu_item_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_listings_one_live_per_item
  ON live_listings(menu_item_id)
  WHERE status = 'LIVE';
