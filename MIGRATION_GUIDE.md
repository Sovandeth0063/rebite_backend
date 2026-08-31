# 🚀 RescueBite Database Migration & Seeding Guide
**For Developers, Teammates & Cloud Deployment (Neon / Supabase / Render / Local)**

This guide explains how to set up, migrate the latest schema (17 tables including `menu_items` and `live_listings`), and seed authentic Phnom Penh bakery data.

---

## 📋 Prerequisites

- **Node.js**: v18 or newer
- **PostgreSQL**: Local PostgreSQL 14+ **OR** a cloud connection string from [Neon.tech](https://neon.tech), [Supabase](https://supabase.com), or [Render](https://render.com).

---

## ⚙️ Step 1: Clone & Install Dependencies

```bash
# 1. Clone the backend repository
git clone https://github.com/Sovandeth0063/rebite_backend.git
cd rebite_backend

# 2. Install dependencies
npm install
```

---

## 🔑 Step 2: Configure Environment Variables

Create or edit your `.env` file in the `backend/` directory:

### Option A: Using Cloud Database (Recommended: Neon / Supabase / Render)
```env
PORT=3001
NODE_ENV=production

# Paste your Cloud PostgreSQL connection string:
DATABASE_URL=postgresql://username:password@ep-cool-sample.ap-southeast-1.aws.neon.tech/rescuebite?sslmode=require
```

### Option B: Using Local PostgreSQL
```env
PORT=3001
NODE_ENV=development

PGHOST=localhost
PGPORT=5432
PGDATABASE=rescuebite
PGUSER=postgres
PGPASSWORD=your_postgres_password
```

---

## 🗄️ Step 3: Run Database Schema Migration & Seeding

Run the automated migration command:

```bash
# Build TypeScript and run schema setup + initial seed data
npm run build
node dist/db/setup.js
```

### What this command automatically does:
1. **Creates / Updates 17 Tables:**
   - `users`, `merchants`, `rescue_bags`, `orders`, `reviews`
   - `impact_stats`, `inventory`, `notifications`, `customer_settings`, `merchant_settings`
   - `platform_config`, `admin_users`, `login_sessions`, `reports`, `ai_recommendations`
   - **`menu_items`** *(Master reusable catalogue for everyday bakery items)*
   - **`live_listings`** *(Real-time end-of-day discounted drops with $\ge 40\%$ rule)*
2. **Applies Triggers & Unique Indexes:**
   - Sets up `updated_at` automated triggers.
   - Creates partial unique index `idx_live_listings_one_live_per_item` (`WHERE status = 'LIVE'`) to prevent duplicate active drops.
3. **Seeds Authentic Phnom Penh Data:**
   - 8 Real Bakeries & Cafés (La Brioche, Maison Kayser, BROWN Coffee, BreadTalk, The Wine Bakery, Tous les Jours, Lucky Supermarket, Artisan Boulangerie).
   - Real GPS coordinates across BKK1, Daun Penh / Riverside, and Tonle Bassac.
   - Master menu items with English & Khmer bilingual names.
   - Active surplus rescue bags (50%–70% discount).
   - Demo merchant account (`merchant@rescuebite.kh`), customer account, and admin account.

---

## 🧪 Step 4: Verify Your Database Migration

Run the automated test suites to ensure everything is connected and working:

```bash
# Run the Live Listings & Drops test suite (13 tests)
node dist/tests/test_live_listings.js

# Run the Mathematical Forecasting Engine test suite (15 tests)
node dist/tests/test_forecast_engine.js
```

**Expected Output:**
```text
📊 Test Results: 13 Passed, 0 Failed
📊 Summary: 15 / 15 tests passed successfully!
```

---

## 🏃 Step 5: Start the Backend Server

```bash
# Start backend in development mode (with auto-reload)
npm run dev
```

- API Base URL: `http://localhost:3001`
- Health Check: `http://localhost:3001/api/health`
- Available Live Listings: `http://localhost:3001/api/live-listings/available`
- Available Rescue Bags: `http://localhost:3001/api/rescue-bags`

---

## 💡 Pro Tip: Need a Fresh Database Reset?

If you ever want to wipe and completely re-seed from scratch:

```bash
# Force fresh reset (drops existing tables and re-applies schema + seed)
node dist/db/setup.js --fresh
```
