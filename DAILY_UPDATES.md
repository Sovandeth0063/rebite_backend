# 📋 RescueBite / ReBite — Daily System Update Report
**Date:** September 2, 2026  
**Repositories:**
- **Frontend App:** [chhounpisethchesda/ReBite](https://github.com/chhounpisethchesda/ReBite) (`sovandeth` branch)
- **Backend & Admin Panel:** [Sovandeth0063/rebite_backend](https://github.com/Sovandeth0063/rebite_backend) (`main` branch)

---

## 🚀 Summary of Key Accomplishments Today

### 1. 🛡️ Atomic Checkout & Concurrency-Hardened Inventory Transaction
- **Single-Connection Transaction Atomicity:**
  - Hardened `POST /api/orders` in `order.routes.ts` with a single-connection `pg` client transaction (`BEGIN ... COMMIT / ROLLBACK`).
  - Guaranteed connection release on all paths (`finally { client.release() }`) preventing connection pool exhaustion under high traffic.
- **Add-on Stock Decrement & Concurrency Defense:**
  - Implemented row-count validated stock decrements (`UPDATE inventory_items SET quantity = quantity - $1 WHERE id = $2 AND quantity >= $1`) for all add-ons and primary rescue bags.
  - Added race-condition protection returning `409 Conflict` with automatic full rollback if stock is exhausted by a concurrent request.
  - Added strict cross-merchant validation preventing foreign add-ons from being attached to an order.
  - Multi-surface total verification across Checkout Modal, Customer QR Modal, and Merchant Verification Scanner.

---

### 2. 🏪 Merchant Order Queue & Customer Review Inspection
- **Newest-First Chronological Ordering:**
  - Re-ordered store orders queue strictly by `createdAt DESC` so newly placed reservations appear on top immediately.
- **Customer Review Inspection Dialog:**
  - Integrated **"Inspect Review (X.X★)"** trigger on completed orders.
  - Modal provides deep inspection: multi-dimensional scores (Food Quality, Value for Money, Pickup Experience), 2-hour consumption safety badge, customer commentary, and inline public store reply editor.

---

### 3. 📊 Dedicated Merchant Executive Dashboard (`MerchantDashboardView.tsx`)
- **Standalone Executive View:**
  - Decoupled high-level analytics from daily operations into a dedicated **Store Dashboard** view in the top navigation bar.
- **Financial Recovery Ledger & Payout Settlement:**
  - Real-time tracking of Gross Surplus Revenue, Digital Escrow Pool (+90% Bakong KHQR / digital card payments), Cash-at-Counter Offset (-10% platform fee), and Net Weekly Settlement destination to ABA Bank.
  - 7-Day daily revenue trend visualization.
- **Environmental & Social Impact KPIs:**
  - Live calculations for kg food waste diverted (0.75 kg/meal), $\text{CO}_2\text{e}$ avoided (1.8 kg/meal), and equivalent km car drive offset.
- **AI Surplus Forecaster & 1-Click Auto-Publishing:**
  - Built predictive algorithm factoring day-of-week trends, weather, and category foot traffic.
  - **"⚡ Auto-Drop AI Bag Now"** allows store managers to publish the AI-recommended mystery bag to the live explore feed in 1 tap with zero manual typing.

---

### 4. ⚡ Streamlined 3-Tab Operational Hub (`MerchantView.tsx`)
- **Removed Cluttered Nested Sub-tabs:**
  - Completely removed the old `Store Insights` and `Store Profile` tabs from the daily operations flow.
- **Clean 3-Tab Focus:**
  1. `⚡ Daily Rescue Hub`: Fast single-item drops & mystery surprise bag creation.
  2. `📋 Menu Catalog`: Item catalog, batch pricing, and custom photos.
  3. `📦 Orders & Pickups`: Live queue, review inspection, and QR verification scanner.

---

### 5. 📱 iPhone & Mobile Responsiveness Overhaul
- **iOS-Style Segmented Navigation Bar:**
  - 3-column compact segmented bar with adaptive labels (`⚡ Rescue`, `📋 Menu`, `📦 Orders`) fitting 375px/390px iPhone viewports without wrapping.
- **Touch-Friendly Action Grids:**
  - `Surprise Bag` and `Scan QR` buttons scale to full-width 2-column touch targets on mobile.
- **Responsive Mobile Item Cards for Menu Catalog:**
  - Render crisp data table on desktop/tablet (`hidden md:block`) and native touch cards on iPhone (`md:hidden`) with thumbnail, batch info, and 1-tap action buttons.
- **Auto-Scaled Typography on KPI Cards:**
  - Scaled number metrics (`text-lg sm:text-2xl md:text-3xl font-black`) avoiding truncation on compact smartphone screens.

---

## 📦 Verified Credentials for Testing

| Role | Email | Password | Store / Access |
|---|---|---|---|
| **Merchant (Bayon)** | `bayon@rescuebite.kh` | `password123` | Bayon Bakery (Mao Tse Toung) |
| **Merchant (BreadTalk)** | `breadtalk@rescuebite.kh` | `password123` | BreadTalk (TK Avenue) |
| **Customer** | `customer@rescuebite.kh` | `password123` | Verified customer with 150 points & clean history |
| **Admin** | `admin@rescuebite.kh` | `password123` | Full admin studio & database inspection |

---

## 🛠️ Files Changed

| Repository | File | Description |
|---|---|---|
| **Frontend** | `ReBite/src/components/MerchantDashboardView.tsx` | **[NEW]** Dedicated Executive Dashboard (Financial Ledger, Impact KPIs, AI Forecasting, Reviews) |
| **Frontend** | `ReBite/src/components/MerchantView.tsx` | Streamlined 3 operational tabs, latest-first order sort, review inspection modal, mobile responsive cards |
| **Frontend** | `ReBite/src/components/Header.tsx` | Added `Store Dashboard` navigation in desktop navbar & mobile drawer |
| **Frontend** | `ReBite/src/App.tsx` | Routed `merchant_dashboard` view, merchant bottom navigation bar |
| **Frontend** | `ReBite/src/components/OrdersView.tsx` | Scoped merchant filtering, symmetric 3-slot actions for cancelled orders |
| **Frontend** | `ReBite/src/components/CheckoutView.tsx` | Add-on selection, atomic cash-at-counter total calculation |
| **Backend** | `backend/src/routes/order.routes.ts` | Single-connection atomic transaction, add-on concurrency protection (`409`), cross-merchant validation |
| **Backend** | `backend/src/routes/review.routes.ts` | Public merchant reply endpoint and multidimensional ratings support |
| **Backend** | `backend/src/routes/merchant.routes.ts` | Profile and location updates handler |
| **Root** | `DAILY_UPDATES.md` | Comprehensive system progress and operational update report |
