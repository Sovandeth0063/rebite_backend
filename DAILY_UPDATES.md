# 📋 RescueBite / ReBite — Daily System Update Report
**Date:** August 31, 2026  
**Repositories:**
- **Frontend App:** [chhounpisethchesda/ReBite](https://github.com/chhounpisethchesda/ReBite) (`sovandeth` branch)
- **Backend & Admin Panel:** [Sovandeth0063/rebite_backend](https://github.com/Sovandeth0063/rebite_backend) (`main` branch)

---

## 🚀 Summary of Key Accomplishments Today

### 1. 🥐 Migration of 8 Real Phnom Penh Bakeries & Surplus Bags
- Discovered and populated 8 real bakeries, cafés, and supermarkets across Phnom Penh offering daily end-of-day discounts (50%–70% off):
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

### 2. 🗄️ Database & PostgreSQL UTF-8 Cluster
- Initialized a standalone PostgreSQL cluster with `UTF-8` client encoding and `locale=C` to flawlessly store Khmer script (`ភាសាខ្មែរ`) alongside English text.
- Configured relational tables: `users`, `merchants`, `rescue_bags`, `orders`, `order_items`, `reviews`, `impact_stats`, `reports`, `inventory`, `ai_recommendations`, `notifications`, `customer_settings`, `merchant_settings`, `platform_config`, and `admin_users`.

---

### 3. 🛡️ Standalone Admin Database CRUD Studio (Port 3002)
- Decoupled the administrative database inspection studio from the consumer website.
- Created a separate administrative application running independently on `http://localhost:3002`.
- Added authentication protection requiring administrator credentials (`admin@rescuebite.kh` / `admin@rescuebite.com`).
- Implemented live record viewing, search, creation, editing, and deletion across all 15 database tables.

---

### 4. 🧹 Seed Data Sanitization & Demo Cleanup
- Removed legacy demo customer accounts (`usr_customer` / "Dara Sok") from seed files and database.
- Cleaned foreign key constraints in database provisioning scripts to ensure orphaned records do not block automated tests.
- Replaced 1-click demo bypass with authentic authentication flows.

---

### 5. 🤖 Continuous Integration (GitHub Actions CI)
- Added GitHub Actions CI pipelines to both repositories:
  - **Frontend CI (`.github/workflows/ci.yml`):** Runs TypeScript typechecks (`tsc --noEmit`) and Vite production builds on every push/PR.
  - **Backend CI (`.github/workflows/ci.yml`):** Runs automated PostgreSQL service container, database schema migrations, and API endpoint verification.

---

### 6. 👤 Authentic User Registration & Profile Data
- **Removed Fake Auto-Generation:** Fixed backend login endpoint so unregistered emails are not silently created with dummy placeholder names or fake phone numbers.
- **Clean Registration:** Registration strictly captures user's actual **Full Name**, **Phone Number**, **Email**, **Password**, and **Role** (Customer or Merchant).
- **Eliminated Fake Default Avatars:** Removed hardcoded stock Unsplash photos. Brand new accounts cleanly display user monogram initials (e.g. `SO`) or a clean icon unless the user explicitly uploads a custom photo.
- **Removed Redundant Settings Screen:** Deleted the broken, separate `SettingsView.tsx` screen and consolidated all profile and account settings directly into `ProfileView.tsx`.

---

### 7. 🎁 Clean Slate for New Accounts (`0 pts`)
- Updated registration defaults so every new user starts at **`0 pts`** instead of pre-filled mock points.
- Fixed points calculation in `RewardsView.tsx` to handle 0 points cleanly without defaulting to mock balances.
- Points history starts clean and records real customer rescues and reviews.

---

### 8. 📍 Location Permission Prompt on Website Startup
- Integrated automatic browser location request (`navigator.geolocation.getCurrentPosition`) every time the website opens.
- Added an accessible, polite top banner prompting users to allow location access if permission was dismissed.
- Implemented real-time GPS distance calculation (km) from user's live position to nearby bakeries in Phnom Penh, with accurate **"Distance: Nearest"** sorting.

---

### 9. 🗂️ Category Navigation & Multi-Category Filtering
- Fixed category cards on the Landing Page (*Bakery & Pastries*, *Breakfast & Brunch*, *Dessert*, *Dinner*, *Groceries*, *Lunch*, *Fruits & Vegetables*, *Meals*).
- Clicking any category navigates to Explore Food with that specific category active.
- Added smart multi-category matching in `CustomerView.tsx` to filter products and bakeries accurately.

---

### 10. ⚡ Bug Fixes & Stability
- **Fixed White Screen on "View List" Click:** Resolved a React SyntheticEvent propagation issue where clicking `[ View list ]` passed the mouse event object into category filters, causing a `.toLowerCase()` crash.
- Added type guards and sanitization across all navigation buttons.
- Successfully built both frontend applications with **0 TypeScript compiler errors**.

---

## 📊 Summary of Modified Files

### Frontend (`ReBite`)
- `src/App.tsx` — Geolocation on startup, category routing state, clean error guards.
- `src/components/LandingPage.tsx` — Category card click handlers, arrow-wrapped CTAs.
- `src/components/CustomerView.tsx` — Live GPS distance calculation, multi-category matching, string type guards.
- `src/components/Header.tsx` — Consolidated profile menu, clean monogram avatar badges.
- `src/components/ProfileView.tsx` — Removed preset stock photos & URL inputs; streamlined personal info editing.
- `src/components/RewardsView.tsx` — 0-point initialization, clean activity history.
- `src/components/LoginPage.tsx` — Validated login/signup flows without placeholder fallbacks.
- `src/components/SettingsView.tsx` — Removed redundant component.
- `src/data/seedData.ts` & `src/types/index.ts` — 8 Phnom Penh bakeries, surprise bags, updated types.
- `.github/workflows/ci.yml` — Frontend CI workflow.

### Backend (`backend`)
- `src/routes/auth.routes.ts` — Authentic registration/login handlers, `0 pts` initial balance, clean avatars.
- `src/routes/crud.routes.ts` — Dynamic CRUD table endpoints and search filtering.
- `src/db/createDb.ts` — UTF-8 database provisioning.
- `src/db/schema.sql` & `src/db/setup.ts` — Complete database schema and clean seeding without demo dependencies.
- `src/data/seedData.ts` & `src/types/index.ts` — Phnom Penh bakery dataset and TypeScript models.
- `admin/` — Standalone Admin CRUD Studio on Port 3002.
- `.github/workflows/ci.yml` — Backend PostgreSQL CI workflow.

---

## ✅ Remote Repository Status
- **`ReBite`:** Clean working tree, pushed to `origin/sovandeth`.
- **`rebite_backend`:** Clean working tree, pushed to `origin/main`.
