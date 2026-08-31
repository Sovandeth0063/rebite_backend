# 📋 RescueBite / ReBite — Daily System Update Report
**Date:** August 31, 2026  
**Repositories:**
- **Frontend App:** [chhounpisethchesda/ReBite](https://github.com/chhounpisethchesda/ReBite) (`sovandeth` branch)
- **Backend & Admin Panel:** [Sovandeth0063/rebite_backend](https://github.com/Sovandeth0063/rebite_backend) (`main` branch)

---

## 🚀 Summary of Key Accomplishments Today

### 1. 🧮 100% Pure Deterministic Mathematical Forecasting Engine
- **$0.00 Operational Cost & Instant Speed (< 0.2ms):** Fully replaced external LLM / Google Gemini calls for surplus forecasting with local deterministic statistical algorithms.
- **Clamped Dynamic Markdown Pricing:**
  $$\text{Discount } \% = \max\left(30\%, \min\left(70\%, \text{round}(0.40 + (U \times 0.20) + (C_{\text{decay}} \times 0.10))\right)\right)$$
  - Dynamically calculates discounts based on remaining hours to close ($H_{\text{rem}}$) and category perishability factor ($C_{\text{decay}}$).
- **Hourly Sales Velocity ($V_{\text{hourly}}$):** Derived from store's completed 30-day order volume in PostgreSQL with robust operating schedule string parsing (`parseOperatingSchedule`) and cold-start category prior defaults.
- **Tomorrow's Production Batch Optimizer:**
  $$\Delta \text{Bake Final} = -\min(\text{Current Batch} \times 0.40, \text{round}(P_{\text{surplus}} \times 0.60))$$
  - Eliminates over-baking waste while strictly capping batch reductions at $\le 40\%$ to prevent morning shortages.
- **Automated Verification Test Suite:** Added [`test_forecast_engine.ts`](file:///e:/First_Wave/backend/src/tests/test_forecast_engine.ts) testing 15 real-world bakery scenarios — **15 / 15 tests passing**.

---

### 2. 💼 Lean Canvas Business Alignment (AIM Growth Model)
- **15% Performance-Based Platform Commission:** Merchants pay zero upfront or fixed fees. Commission is calculated solely upon successful bag collection.
- **Merchant Revenue Recovery & Commission Breakdown:** Integrated into Merchant BI tab displaying Gross Recovered Revenue ($ & KHR), Platform Commission, and Net Payout to ABA / Bakong.
- **1-Click Telegram Drop Alert Tool:** Added a one-click copy tool formatted for Telegram channels & groups with bilingual Khmer/English copy to drive immediate local store traffic.
- **Customer Discovery Quick Filters:** Added `🎓 Under $3.50 (~14k KHR)` and `🌙 Evening Rush (5PM+)` filter pills for quick discovery.

---

### 3. 🗄️ Admin Studio Overview Entity Navigation (Port 3002)
- **Fixed Table Entity Routing:** Resolved an issue where clicking `users`, `orders`, or other tables in the Overview dashboard always defaulted to `merchants`.
- **Direct Navigation:** Clicking any database table card in Dashboard Overview now directly navigates to and selects that exact schema in the Database Studio (CRUD) interface.

---

### 4. 🥐 8 Real Phnom Penh Bakeries & Surplus Bags Seed Data
- Populated 8 real bakeries, cafés, and supermarkets across Phnom Penh offering daily end-of-day discounts (50%–70% off):
  1. **La Brioche Bakery (Hotel Cambodiana)** — Sisowath Quay, Daun Penh *(French luxury pastries, fruit tarts, eclairs)*
  2. **Maison Kayser Cambodia (BKK1)** — St 282, Boeung Keng Kang 1 *(Artisan sourdough, butter croissants, baguette sandwiches)*
  3. **BROWN Coffee and Bakery (BKK1)** — St 57, BKK1 *(Specialty iced espresso, cheese croissants, muffins)*
  4. **BreadTalk Cambodia (BKK1 Flagship)** — Preah Norodom Blvd, BKK1 *(Floss buns, pork sung breads, egg tarts)*
  5. **The Wine Bakery 24/7 (Tonle Bassac)** — St 308, Tonle Bassac *(Italian focaccia, red wine cakes, sourdough)*
  6. **Tous les Jours (Sihanouk Blvd)** — Preah Sihanouk Blvd, Daun Penh *(Korean milk bread, red bean buns, sponge cakes)*
  7. **Lucky Supermarket Bakery (Sihanouk Mall)** — Preah Sihanouk Blvd *(Evening markdown bread loaves, dinner rolls, donuts)*
  8. **Artisan Boulangerie & Café (Toul Tom Poung)** — St 450, Russian Market *(Olive focaccia, cinnamon rolls, vegan loaves)*
- Fully seeded into PostgreSQL with real GPS coordinates, pickup windows, original/discount prices, and bilingual English/Khmer descriptions.

---

### 5. 🛡️ Database & PostgreSQL UTF-8 Cluster
- Initialized standalone PostgreSQL cluster with `UTF-8` client encoding and `locale=C` to flawlessly store Khmer script (`ភាសាខ្មែរ`) alongside English text.
- Configured relational tables: `users`, `merchants`, `rescue_bags`, `orders`, `order_items`, `reviews`, `impact_stats`, `reports`, `inventory`, `ai_recommendations`, `notifications`, `customer_settings`, `merchant_settings`, `platform_config`, and `admin_users`.

---

### 6. 👤 Clean Authentication & Demo Role Removal
- Strictly removed demo bypasses from navigation and login handlers.
- Enforced clean user registration with authentic credentials.
- Every new user starts at **`0 pts`** with clean activity tracking.

---

## 🛠️ How to Set Up & Run the Project (For Teammates / Integrators)

### 1. Start Database & Backend API (Port 5000)
```bash
cd backend
npm install
npm run build
# Start PostgreSQL (auto-managed if using local pgdata) and launch backend
npm run dev
```

### 2. Run Mathematical Test Suite
```bash
cd backend
node dist/tests/test_forecast_engine.js
```

### 3. Start Consumer Web Application (Port 3001)
```bash
cd ReBite
npm install
npm run dev
```
Open `http://localhost:3001` in your browser.

### 4. Start Admin CRUD Studio (Port 3002)
```bash
cd backend/admin
npm install
npm run dev
```
Open `http://localhost:3002` in your browser.  
**Admin Credentials:** `admin@rescuebite.kh` / `admin@rescuebite.com` | Password: `password123`

---

## 📦 Verified Seed Accounts for Testing

| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | `admin@rescuebite.kh` | `password123` | Full access to Database Studio & CRUD |
| **Merchant** | `merchant@rescuebite.kh` | `password123` | Store owner for *Artisan Boulangerie & Café* |
| **Customer** | Register new account or use any verified email | `password123` | Starts with 0 pts and clean history |

---

## 📊 Summary of Modified Files

### Backend (`rebite_backend`)
- `src/services/forecastingEngine.ts` **[NEW]** — 100% deterministic mathematical forecasting & dynamic pricing engine.
- `src/tests/test_forecast_engine.ts` **[NEW]** — 15-scenario automated verification test suite.
- `src/controllers/ai.controller.ts` **[MODIFY]** — Express controller wired to pure math engine.
- `src/routes/ai.routes.ts` **[MODIFY]** — Route definitions delegating to controller.
- `src/services/gemini.ts` **[MODIFY]** — Lightweight interface delegating to math engine.
- `src/services/translation.ts` **[MODIFY]** — Dedicated bilingual translation handler.
- `src/routes/merchant.routes.ts` **[MODIFY]** — Analytics calculation (15% commission, net payout in USD/KHR).
- `src/routes/auth.routes.ts` **[MODIFY]** — Removed demo role switcher bypass; strict authentic auth.
- `src/db/createDb.ts` **[MODIFY]** — Database provisioning with 8 Phnom Penh bakeries.

### Admin Studio (`backend/admin`)
- `src/App.tsx` **[MODIFY]** — Added `selectedTable` state synchronization across views.
- `src/components/DashboardOverview.tsx` **[MODIFY]** — Wired table entity cards to pass schema names directly.
- `src/components/DatabaseStudioView.tsx` **[MODIFY]** — Accepted `initialTable` and synced active schema on navigation.

### Frontend App (`ReBite`)
- `src/components/MerchantView.tsx` **[MODIFY]** — AI Surplus Forecaster tab, Revenue Recovery breakdown card, Telegram 1-click share.
- `src/components/CustomerView.tsx` **[MODIFY]** — Added Evening Rush and Under $3.50 filter chips.
- `src/components/Header.tsx` **[MODIFY]** — Removed demo role switcher.
- `src/components/DemoRoleSwitcher.tsx` **[DELETE]** — Removed unused demo component.
- `src/services/api.ts` & `src/types/index.ts` **[MODIFY]** — Added `forecastSurplus` and `getMerchantAnalytics` API calls and types.
