# 📋 RescueBite / ReBite — Daily System Update Report
**Date:** September 2, 2026  
**Repositories:**
- **Frontend App:** [chhounpisethchesda/ReBite](https://github.com/chhounpisethchesda/ReBite) (`sovandeth` branch)
- **Backend & Admin Panel:** [Sovandeth0063/rebite_backend](https://github.com/Sovandeth0063/rebite_backend) (`main` branch)

---

## 🚀 Summary of Key Accomplishments Today

### 1. 🐛 Critical Database Wipe Bug Fixed (`setup.ts`)
- **Root Cause:** `setup.ts` line 342 had `|| true` hardcoded at the end of the `isFresh` flag:
  ```ts
  // ❌ Before — wiped DB on every backend restart!
  const isFresh = process.argv.includes('--fresh') || process.argv.includes('--reset') || true;
  // ✅ After — only wipes when explicitly requested
  const isFresh = process.argv.includes('--fresh') || process.argv.includes('--reset');
  ```
- **Impact:** Every time `npm run dev` restarted or hot-reloaded the backend, all orders, sessions, and user data were silently dropped and re-seeded. This was the true cause of the "My Orders shows empty" bug.
- **Fix:** Removed `|| true`. The database now persists all orders across restarts.

---

### 2. 🛒 Complete Cash Order Flow Fixed End-to-End
- **"Done & View Orders" Now Works:** After confirming a Cash at Store reservation, clicking "Done & View Orders" correctly navigates to `My Orders` and shows `Active Reservations (1)` with the QR code and pickup window.
- **Triple-layer persistence strategy:**
  1. `CheckoutView.tsx` passes `completedOrder` directly into `onClose(completedOrder)` on the Done button.
  2. `App.tsx` immediately injects the order into React state AND commits it to `localStorage`.
  3. `OrdersView.tsx` uses a `useMemo` fallback to read from `localStorage` if the `orders` prop is ever momentarily empty.

---

### 3. ❌ Order Cancellation — Fully Working
- **Cancel endpoint** in `order.routes.ts` now resolves orders by both `id` and `order_number` (`WHERE id = $1 OR order_number = $1`).
- Points deduction on cancellation: `UPDATE users SET points = GREATEST(0, points - quantity * 10)`.
- Bag inventory restored: `UPDATE rescue_bags SET quantity_remaining = quantity_remaining + quantity`.
- `App.tsx handleCancelOrder` immediately flips the local order state to `CANCELLED` and persists to `localStorage`, so the cancelled order disappears from Active Reservations and appears in Past Order History instantly.

---

### 4. 🔁 React Re-render Loop Fixed (`OrdersView.tsx` + `App.tsx`)
- **Root Cause:** `OrdersView` had `useEffect(() => { onRefreshOrders?.(); }, [onRefreshOrders])`. Since `onRefreshOrders` was a new function reference on every render, this triggered an infinite fetch loop.
- **Fix:**
  - Changed `useEffect` dependency to `[]` (runs once on mount only).
  - Wrapped `loadAllData` in `App.tsx` with `useCallback(..., [])` to guarantee a stable reference.

---

### 5. 🏷️ TypeScript `OrderStatus` Type Expanded (`types/index.ts`)
- Added `PENDING`, `PAID`, `CONFIRMED`, `EXPIRED` to the `OrderStatus` union type.
- These are used in `OrdersView.tsx` filters for both active and past order states.
- Resolves 4 TypeScript TS2367 "no overlap" compile errors that appeared in `OrdersView.tsx`.

---

## 🛠️ Files Changed

| File | Change |
|---|---|
| `backend/src/db/setup.ts` | Removed `|| true` from `isFresh` flag — critical DB persistence fix |
| `backend/src/routes/order.routes.ts` | Cancel endpoint: dual ID/order_number lookup; points deduction; bag restock; COMMIT fix |
| `backend/src/server.ts` | Added `/api/debug-db` diagnostic route |
| `ReBite/src/App.tsx` | `handleCancelOrder` local state update; `loadAllData` wrapped in `useCallback`; checkout `onClose` hands off `completedOrder`; `orders` initialized from `localStorage` |
| `ReBite/src/components/CheckoutView.tsx` | "Done & View Orders" passes `completedOrder` to `onClose`; removed VIP/Standard badge; added `Pay at Counter` label |
| `ReBite/src/components/OrdersView.tsx` | Removed stale `useMemo` with `[]` dependency; added `effectiveOrders` fallback from `localStorage`; fixed `useEffect` dependency to `[]` |
| `ReBite/src/types/index.ts` | Expanded `OrderStatus` to include `PENDING`, `PAID`, `CONFIRMED`, `EXPIRED` |

---


**Repositories:**
- **Frontend App:** [chhounpisethchesda/ReBite](https://github.com/chhounpisethchesda/ReBite) (`sovandeth` branch)
- **Backend & Admin Panel:** [Sovandeth0063/rebite_backend](https://github.com/Sovandeth0063/rebite_backend) (`main` branch)

---

## 🚀 Summary of Key Accomplishments Today

### 1. 🏦 Full Split-Payment In-App Gateway & Bakong KHQR Engine
- **Instant 10% Platform Commission Custody:**
  - Automated split-payment custodian model guaranteeing the platform takes its 10% commission ($0.35 on $3.50 item) + $0.50 service fee instantly inside the transaction.
  - The store's 90% share ($3.15) is held in digital escrow and automatically disbursed weekly to their ABA Bank account.
- **National Bank of Cambodia (NBC) Bakong Dynamic KHQR Engine:**
  - Authentic EMVCo Tag-Length-Value (TLV) payload generation with standard CRC-16 CCITT-FALSE (`0x1021`, initial `0xFFFF`) checksum calculation.
  - Deep-link quick launch buttons for **ABA Mobile**, **Bakong App**, and **Wing Bank**.
  - **EMVCo Tag 64 (Language Template):** Native Khmer script store names (e.g. `ហាងនំប៉័ង ABC Bakery`) encoded in Tag 64 for native Khmer banking app display, with strict ASCII truncation fallback in Tag 59.
  - Production-ready placeholders for live NBC Bakong Open API & ABA PayWay token injection with seamless sandbox simulation fallback.

---

### 2. 💵 Clean Dual Payment Architecture (Bank vs Pure Cash on Pickup)
- **Universal Financial Inclusivity (Banked & Unbanked Users):**
  - **Choice 1: 🏦 Pay In-App via Bank (Bakong KHQR / ABA Mobile / Card)** — 100% pre-paid in-app, zero cash needed at store pickup.
  - **Choice 2: 💵 Pay Cash at Store (No Bank Needed)** — 1-tap instant reservation for unbanked consumers; hand exact cash to bakery cashier at pickup.
- **Unified Pricing & Commission Parity:**
  - Standardized customer price ($4.00 total across both Bank and Cash paths).
  - Platform take ($0.85) and merchant net ($3.15) strictly equalized across all payment channels.
- **NBC 100-Riel Physical Currency Rounding:**
  - Riel conversions strictly rounded to nearest physical **100 KHR denomination** ($4.00 = 16,400 KHR; $3.50 = 14,400 KHR).

---

### 3. 🛡️ Operational Safeguards, State Machine & Trust Score Gating
- **Strict Order State Machine:**
  - Cash orders initialize in `escrowStatus: 'PENDING_COLLECTION'` (never prematurely marked `PAID_OUT`).
  - Transitions to `PAID_OUT` only when bakery staff confirms physical cash collection via QR scan.
- **Active Trust Score & Concurrency Gating:**
  - **VIP Tier (`trustScore >= 80%`):** Unlocks up to **3 active concurrent cash reservations** at a time.
  - **Standard Tier (`50% <= trustScore < 80%`):** Restricted to **1 active cash reservation** at a time to prevent multi-bag ghosting.
  - **Low Trust Tier (`trustScore < 50%` or `cashStrikes >= 3`):** Cash reservations locked for 30 days (must pre-pay via Bakong/Card).
- **Rehabilitation & Strike Forgiveness:**
  - Every completed pickup verified by staff automatically forgives previous strikes (`cash_strikes - 1`, `trust_score + 10`).
- **Merchant Cash Volume Ceiling (-$20.00 Limit):**
  - If a merchant's cash commission debt exceeds -$20.00 without incoming digital sales, cash reservations for their store are paused until settled via 1-click Bakong KHQR.
- **Safe Auto-Restock Guard Against Race Conditions:**
  - Restock queries include strict `WHERE status != 'ARCHIVED' AND status != 'DRAFT'` filters to prevent reviving expired or draft bags on cancellation.

---

### 4. 🧪 Automated Unit Test Suite (`npm run test:escrow`)
- Added comprehensive unit test suite in [`test_escrow_accounting.ts`](file:///e:/First_Wave/backend/src/tests/test_escrow_accounting.ts) covering:
  1. Bank vs Cash commission parity math ($0.85 platform take, $3.15 merchant net).
  2. Strict state machine timing (`PENDING_COLLECTION` $\rightarrow$ `PAID_OUT` on staff scan).
  3. No-show & explicit cancellation waivers (`VOIDED` / `REFUNDED`).
  4. NBC physical 100-riel rounding rules.
  5. Deep EMVCo TLV content-correct parser (Tag 54 amount, Tag 53 currency, Tag 58 country, Tag 62 bill number, Tag 63 CRC16).
  6. EMVCo Tag 64 native Khmer script validation & UTF-8 byte-length assertions.
- **Test Result: 40 / 40 Unit Tests Passing (0 Failures)**.

---

### 5. 🎨 UI/UX Redesign & Viewport Polishing
- Redesigned **[BakongModal.tsx](file:///e:/First_Wave/ReBite/src/components/BakongModal.tsx)**: Replaced fixed-width elements with responsive action pills, centered dynamic QR cards, and viewport-safe geometry (`max-h-[92vh]`).
- Redesigned **[CheckoutView.tsx](file:///e:/First_Wave/ReBite/src/components/CheckoutView.tsx)**: Structured 3-card layout (Order Summary, Contact Verification, Payment Selector with live Trust Score Tier status) and high-contrast digital pickup ticket.
- Fixed `currentUser` unscoped reference and `UserIcon` JSX rendering bug.

---

## 🛠️ How to Set Up & Run the Project

### 1. Start Database & Backend API (Port 5000)
```bash
cd backend
npm install
npm run build
# Run unit tests
npm run test:escrow
# Launch backend server
npm run dev
```

### 2. Start Consumer Web Application (Port 3001)
```bash
cd ReBite
npm install
npm run build
npm run dev
```
Open `http://localhost:3001` in your browser.

### 3. Start Admin CRUD Studio (Port 3002)
```bash
cd backend/admin
npm install
npm run dev
```
Open `http://localhost:3002` in your browser.  
**Admin Credentials:** `admin@rescuebite.kh` | Password: `password123`

---

## 📦 Verified Seed Accounts for Testing

| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | `admin@rescuebite.kh` | `password123` | Full access to Database Studio, Audit Logs, and Escrow Overview |
| **Merchant** | `merchant@rescuebite.kh` | `password123` | Store owner for *Artisan Boulangerie & Café* (Phnom Penh) |
| **Customer** | `customer@rescuebite.kh` | `password123` | Verified customer with clean pickup ticket access |
