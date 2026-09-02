# 📋 RescueBite / ReBite — Daily System Update Report
**Date:** September 2, 2026  
**Repositories:**
- **Frontend App:** [chhounpisethchesda/ReBite](https://github.com/chhounpisethchesda/ReBite) (`sovandeth` branch)
- **Backend & Admin Panel:** [Sovandeth0063/rebite_backend](https://github.com/Sovandeth0063/rebite_backend) (`main` branch)

---

## 🚀 Summary of Key Accomplishments Today

### 1. 📍 Dynamic Real-Time Distance & Micro-Logistics Route Engine
- **Accurate Real-Time Spatial Computations:**
  - Implemented `computeDistanceKm` in `lib/utils.ts` supporting live customer GPS coordinates with fallback to city center coordinates (`CITY_COORDINATES` for Phnom Penh, Siem Reap, Battambang, Sihanoukville, Kampot).
  - Resolved static `280 m` bug in `FoodCard.tsx` by eliminating hardcoded defaults and passing reactive `distanceKm` props across the explore feed and landing page grids.
  - Added Tuk-Tuk / PassApp travel time estimates (`1.7 km · 7m Tuk-Tuk`, `4.7 km · 17m Tuk-Tuk`) to `StoreDetailPage.tsx`, `FoodDetailPage.tsx`, and `FoodDetailModal.tsx`.
- **Cross-Table Backend Location Synchronization:**
  - Synchronized `merchant_lat`, `merchant_lng`, and `merchant_address` in `rescue_bags` table upon `PATCH /api/merchants/:id` profile updates, ensuring instant dynamic recalculation for customers whenever a merchant edits their store coordinates.

---

### 2. 🛡️ Atomic Checkout & Concurrency-Hardened Inventory Transaction
- **Single-Connection Transaction Atomicity:**
  - Hardened `POST /api/orders` in `order.routes.ts` with a single-connection `pg` client transaction (`BEGIN ... COMMIT / ROLLBACK`).
  - Guaranteed connection release on all paths (`finally { client.release() }`) preventing connection pool exhaustion under high traffic.
- **Add-on Stock Decrement & Concurrency Defense:**
  - Implemented row-count validated stock decrements (`UPDATE inventory_items SET quantity = quantity - $1 WHERE id = $2 AND quantity >= $1`) for all add-ons and primary rescue bags.
  - Added race-condition protection returning `409 Conflict` with automatic full rollback if stock is exhausted by a concurrent request.
  - Added strict cross-merchant validation preventing foreign add-ons from being attached to an order.
  - Multi-surface total verification across Checkout Modal, Customer QR Modal, and Merchant Verification Scanner.

---

### 3. 🎟️ Time-Limited Voucher Engine, DB Idempotency & Rewards Lifecycle
- **Server-Authoritative Expiration & Idempotency:**
  - Designed `customer_vouchers` table with DB-enforced `expires_at`, `status IN ('ACTIVE','USED','EXPIRED')`, and unique constraint `idx_customer_vouchers_idempotency` preventing double points deduction on concurrent requests.
  - Integrated `FOR UPDATE` transaction locks during checkout to atomically mark vouchers as `USED` and safely rollback to `ACTIVE` if the order creation aborts.
- **Points Wallet & Catalog Badge Count Fix:**
  - Fixed tab badge in `RewardsView.tsx` to accurately reflect available redemption perks (`3`) rather than user wallet instances.
  - Integrated full 7-step unit & integration test suite (`test_voucher_lifecycles.ts`) validating 100% passing results.

---

### 4. ⚡ Merchant Live Handover & Real-Time Counter Sync
- **Optimistic State Updates:**
  - Connected `onCompleteOrder` across `App.tsx` and `MerchantView.tsx` so clicking **"Verify & Handover"** immediately transitions order state to `COMPLETED` without requiring manual page reloads.
  - Synchronized automatic status updates with backend `scanQrCode` verification endpoint.

---

### 5. ⏰ Adjustable Pickup Hours for Fast Drops & Active Listings
- **Backend Pickup Hours Endpoint:**
  - Implemented `PATCH /api/live-listings/:id` supporting live updates to `pickupStart`, `pickupEnd`, and quantity with automated server-side recalculation of `expires_at`.
- **Merchant Controls:**
  - Added start/end time pickers (`<input type="time" />`) with 4 quick 1-tap presets (`17:00–19:00`, `17:30–20:00`, `18:00–20:00`, `18:30–21:00`) in the Quick Drop card.
  - Added an inline **"Adjust Hours"** editor on active listings for instant schedule corrections.

---

### 6. ✏️ Product Edit Action in Merchant Menu Catalogue & Fast Drops
- **Catalog Management:**
  - Added **"Edit"** (`✏️ Edit`) action button in the Master Menu Catalogue desktop table, mobile card stream, and Fast Drops grid.
  - Unified modal form dynamically pre-filling English & Khmer names, category, base price, batch quantity, unit, and product image.
  - Saving updates backend `PATCH /api/menu-items/:id` and synchronizes all active live listings in real-time.

---

### 7. 🔍 Real-Time Order & Pickup Queue Filter Bar
- **Tabbed Order Filtering:**
  - Added 5 responsive filter pill buttons: **All Orders**, **Ready for Pickup** (Pending), **Completed** (Handover Verified), **Cancelled / Voided**, and **No Review Yet**.
  - Dynamic badge counters compute exact filter stats in real-time via `useMemo`.
  - Contextual empty states for each filter view.

---

### 8. 📊 Dedicated Merchant Executive Dashboard (`MerchantDashboardView.tsx`)
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

### 9. 📱 Mobile & iPhone Responsiveness Overhaul
- **iOS-Style Segmented Navigation Bar:**
  - 3-column compact segmented bar with adaptive labels (`⚡ Rescue`, `📋 Menu`, `📦 Orders`) fitting 375px/390px iPhone viewports without wrapping.
- **Touch-Friendly Action Grids:**
  - `Surprise Bag` and `Scan QR` buttons scale to full-width 2-column touch targets on mobile.
- **Responsive Mobile Item Cards for Menu Catalog:**
  - Render crisp data table on desktop/tablet (`hidden md:block`) and native touch cards on iPhone (`md:hidden`) with thumbnail, batch info, and 1-tap action buttons.

---

### 10. 🧪 CI/CD Quality & TypeScript Build Verification
- **Zero-Error Type Checking:**
  - Resolved all CI/CD `npm run lint` (`tsc --noEmit`) build errors in `MerchantDashboardView.tsx`, `ImpactView.tsx`, and `types/index.ts`.
  - Added complete exported interfaces for `Achievement`, `AchievementBadge`, `RewardItem`, `CategoryPreset`, and `SurplusForecast`.
  - Verified 100% clean production builds across frontend and backend services.

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
| **Frontend** | `ReBite/src/lib/utils.ts` | Added `computeDistanceKm` and `CITY_COORDINATES` dictionary for dynamic Cambodian city distance calculations |
| **Frontend** | `ReBite/src/components/FoodCard.tsx` | Fixed static distance fallback, dynamic meters/km formatting |
| **Frontend** | `ReBite/src/components/CustomerView.tsx` | Passed dynamic distance prop to `FoodCard` and updated `getBagDistance` |
| **Frontend** | `ReBite/src/components/LandingPage.tsx` | Integrated dynamic distance computation into landing explore grid |
| **Frontend** | `ReBite/src/components/StoreDetailPage.tsx` | Added live Tuk-Tuk/PassApp route estimates and dynamic distance badge |
| **Frontend** | `ReBite/src/components/FoodDetailPage.tsx` | Added route duration and distance info in merchant header |
| **Frontend** | `ReBite/src/components/FoodDetailModal.tsx` | Dynamic distance resolution using live GPS coords or city center |
| **Frontend** | `ReBite/src/types/index.ts` | Added `AchievementBadge`, `Achievement`, `RewardItem`, `CategoryPreset`, and updated `SurplusForecast` |
| **Frontend** | `ReBite/src/components/MerchantDashboardView.tsx` | Fixed `storeBags` reference and typecheck compliance for CI/CD |
| **Frontend** | `ReBite/src/components/MerchantView.tsx` | Added product Edit action, pickup hours customizer, order queue filter tabs, and realtime handover sync |
| **Frontend** | `ReBite/src/components/RewardsView.tsx` | Fixed rewards catalog tab badge count, points history connected to user wallet |
| **Frontend** | `ReBite/src/components/CheckoutView.tsx` | Added voucher discount calculation, time-limited expiry validation display |
| **Frontend** | `ReBite/src/services/api.ts` | Added `updateLiveListing`, `updateMenuItem`, `getMyVouchers`, and voucher validation APIs |
| **Frontend** | `ReBite/src/App.tsx` | Wired dynamic distance props to landing page and optimistic location updates to bags |
| **Backend** | `backend/src/routes/merchant.routes.ts` | Cross-table update synchronizing `rescue_bags` location and address on merchant edit |
| **Backend** | `backend/src/routes/liveListing.routes.ts` | Added `PATCH /api/live-listings/:id` for pickup window and stock quantity updates |
| **Backend** | `backend/src/routes/voucher.routes.ts` | Added time-limited voucher issuance, validation, and points redemption endpoints |
| **Backend** | `backend/src/routes/order.routes.ts` | Single-connection atomic transaction, voucher FOR UPDATE locking and rollback safety |
| **Backend** | `backend/src/tests/test_live_drop_workflow.ts` | 17-step end-to-end live listing lifecycle test suite |
| **Backend** | `backend/src/tests/test_voucher_lifecycles.ts` | 7-step voucher time-limited expiration and idempotency test suite |
| **Root** | `DAILY_UPDATES.md` | Comprehensive system progress and daily operational report |
