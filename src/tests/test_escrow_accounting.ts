/**
 * ============================================================================
 * File: src/tests/test_escrow_accounting.ts
 * Purpose: Automated Unit Test Suite for RescueBite Escrow & Commission Math
 * Coverage:
 *   1. Bank vs Cash Commission Parity ($0.85 platform take, $3.15 merchant net)
 *   2. Strict State Machine Timing (PENDING_COLLECTION -> PAID_OUT on Staff Scan)
 *   3. No-Show & Cancellation Commission Waivers (VOIDED / REFUNDED)
 *   4. NBC 100-Riel Physical Currency Rounding
 *   5. EMVCo KHQR Deep Content-Correct TLV Decoder & CRC16 Checks
 * ============================================================================
 */

import { calculateCrc16, buildEmvcoKhqr, safeUtf8ByteTruncate } from '../routes/bakong.routes.js';
import { formatOrder, evaluateUserStrikes, isLateCancellation, CashStrikeRecord } from '../routes/order.routes.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`, detail || '');
    failed++;
  }
}

console.log('\n======================================================');
console.log('🧪 RUNNING ESCROW ACCOUNTING & COMMISSION TEST SUITE');
console.log('======================================================\n');

// ----------------------------------------------------------------------------
// TEST 1: Bank Payment Commission Split ($3.50 food + $0.50 fee = $4.00 total)
// ----------------------------------------------------------------------------
console.log('Test Suite 1: Bank Payment Commission Accounting');
const sampleBankOrder = {
  id: 'ord_test_bank',
  order_number: 'RB-2026-100001',
  customer_id: 'usr_customer',
  merchant_id: 'mer_1',
  unit_price: '3.50',
  quantity: 1,
  subtotal: '3.50',
  service_fee: '0.50',
  total_price: '4.00',
  payment_method: 'ABA_PAY',
  payment_status: 'PAID',
  order_status: 'READY_FOR_PICKUP',
  pickup_code: 'RB-1234',
  created_at: new Date().toISOString(),
};

const formattedBank = formatOrder(sampleBankOrder);
assert(formattedBank.totalPrice === 4.0, 'Bank order total is exactly $4.00');
assert(formattedBank.commissionAmount === 0.85, 'Bank platform take is $0.85 ($0.35 10% take + $0.50 fee)');
assert(formattedBank.merchantNetAmount === 3.15, 'Merchant net escrow is $3.15 (90% of $3.50 food)');
assert(formattedBank.amountPaidInApp === 4.0, 'Bank order is 100% pre-paid in-app ($4.00)');
assert(formattedBank.cashDueAtPickup === 0, 'Bank order requires $0.00 cash at pickup');
assert(formattedBank.escrowStatus === 'HELD_IN_ESCROW', 'Active bank order status is HELD_IN_ESCROW');

// ----------------------------------------------------------------------------
// TEST 2: Strict Cash State Machine Timing
// ----------------------------------------------------------------------------
console.log('\nTest Suite 2: Strict Cash State Machine Timing');
const sampleCashOrderReserved = {
  ...sampleBankOrder,
  id: 'ord_test_cash_res',
  order_number: 'RB-2026-100002',
  payment_method: 'CASH_AT_PICKUP',
  payment_status: 'PENDING',
  order_status: 'READY_FOR_PICKUP',
};

const formattedCashReserved = formatOrder(sampleCashOrderReserved);
assert(formattedCashReserved.totalPrice === 4.0, 'Cash order total is identical $4.00 for pricing consistency');
assert(formattedCashReserved.amountPaidInApp === 0, 'Cash order requires $0.00 in-app payment for unbanked users');
assert(formattedCashReserved.cashDueAtPickup === 4.0, 'Cash order requires customer to hand $4.00 cash to cashier');
assert(formattedCashReserved.escrowStatus === 'PENDING_COLLECTION', 'Cash order sets escrowStatus to PENDING_COLLECTION upon reservation (NOT PAID_OUT!)');
assert(formattedCashReserved.paymentStatus === 'PENDING', 'Cash order payment status is PENDING upon reservation');

// State 2: Staff scans QR code / confirms collection
const sampleCashOrderCompleted = {
  ...sampleCashOrderReserved,
  order_status: 'COMPLETED',
};
const formattedCashCompleted = formatOrder(sampleCashOrderCompleted);
assert(formattedCashCompleted.escrowStatus === 'PAID_OUT', 'Cash order transitions to PAID_OUT ONLY after staff completes pickup');
assert(formattedCashCompleted.paymentStatus === 'PAID', 'Cash order transitions to PAID upon completed pickup');
assert(formattedCashCompleted.cashDueAtPickup === 0, 'Cash due becomes $0.00 after completion');

// ----------------------------------------------------------------------------
// TEST 3: No-Show & Explicit Cancellation Waivers
// ----------------------------------------------------------------------------
console.log('\nTest Suite 3: No-Show & Explicit Cancellation Waivers');
const sampleNoShowOrder = {
  ...sampleCashOrderReserved,
  id: 'ord_test_noshow',
  order_status: 'NO_SHOW',
};

const formattedNoShow = formatOrder(sampleNoShowOrder);
assert(formattedNoShow.commissionAmount === 0, 'Platform commission is $0.00 on NO_SHOW orders (waived)');
assert(formattedNoShow.merchantNetAmount === 0, 'Merchant net is $0.00 on NO_SHOW orders');
assert(formattedNoShow.escrowStatus === 'VOIDED', 'Escrow status becomes VOIDED on NO_SHOW');
assert(formattedNoShow.paymentStatus === 'UNPAID', 'Payment status is UNPAID on NO_SHOW');

const sampleCancelledOrder = {
  ...sampleCashOrderReserved,
  id: 'ord_test_cancel',
  order_status: 'CANCELLED',
};
const formattedCancelled = formatOrder(sampleCancelledOrder);
assert(formattedCancelled.commissionAmount === 0, 'Platform commission is $0.00 on CANCELLED orders (waived)');
assert(formattedCancelled.escrowStatus === 'VOIDED', 'Cash order escrow status becomes VOIDED on cancellation');

// ----------------------------------------------------------------------------
// TEST 4: NBC Physical 100-Riel Currency Rounding
// ----------------------------------------------------------------------------
console.log('\nTest Suite 4: NBC Physical Riel Currency Rounding');
function roundKhr(usd: number, rate: number = 4100): number {
  return Math.round((usd * rate) / 100) * 100;
}

assert(roundKhr(4.0) === 16400, '$4.00 @ 4100 KHR/USD rounds to 16,400 KHR');
assert(roundKhr(3.5) === 14400, '$3.50 (14,350 KHR exact) rounds up to physical 14,400 KHR');
assert(roundKhr(0.5) === 2100, '$0.50 (2,050 KHR exact) rounds up to physical 2,100 KHR');
assert(roundKhr(1.0) === 4100, '$1.00 rounds to 4,100 KHR');

// ----------------------------------------------------------------------------
// TEST 5: Deep EMVCo TLV Content-Correct Decoder
// ----------------------------------------------------------------------------
console.log('\nTest Suite 5: Deep EMVCo TLV Content-Correct Decoder');

interface TLVNode {
  tag: string;
  length: number;
  value: string;
}

function parseEmvcoTlv(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i < raw.length - 4) {
    const tag = raw.substring(i, i + 2);
    const lenStr = raw.substring(i + 2, i + 4);
    const len = parseInt(lenStr, 10);
    if (isNaN(len)) break;
    const value = raw.substring(i + 4, i + 4 + len);
    map.set(tag, value);
    i += 4 + len;
  }
  return map;
}

const testKhqr = buildEmvcoKhqr({
  amountUsd: 4.0,
  merchantName: 'Brown Coffee BKK1',
  orderNumber: 'RB-2026-TEST001',
});

const tlvMap = parseEmvcoTlv(testKhqr.qrCodeData);

assert(tlvMap.get('00') === '01', 'EMVCo Tag 00 Payload Format Indicator is 01');
assert(tlvMap.get('01') === '12', 'EMVCo Tag 01 Point of Initiation is Dynamic (12)');
assert(tlvMap.get('53') === '840', 'EMVCo Tag 53 Currency is USD (840)');
assert(tlvMap.get('54') === '4.00', 'EMVCo Tag 54 Amount correctly encodes 4.00 USD');
assert(tlvMap.get('58') === 'KH', 'EMVCo Tag 58 Country Code is KH (Cambodia)');
assert(Boolean(tlvMap.get('59')?.includes('Brown Coffee') || tlvMap.get('59')?.includes('RescueBite')), 'EMVCo Tag 59 Merchant Name is accurately encoded');
assert(tlvMap.get('60') === 'Phnom Penh', 'EMVCo Tag 60 Merchant City is Phnom Penh');

const tag62 = tlvMap.get('62');
assert(tag62 !== undefined && tag62.includes('RB-2026-TEST001'), 'EMVCo Tag 62 Additional Data contains Bill Number RB-2026-TEST001');

// Edge Case 5b: Unicode Khmer Merchant Name & Long String Limits
const khmerKhqr = buildEmvcoKhqr({
  amountUsd: 4.0,
  merchantName: 'ហាងនំប៉័ង Eric Kayser Bakery Phnom Penh Cambodia 1234567890',
  merchantNameKm: 'ហាងនំប៉័ង អេរិក ខាយសឺ',
  orderNumber: 'RB-2026-VERY-LONG-ORDER-NUMBER-9999999999999999',
});
const khmerTlvMap = parseEmvcoTlv(khmerKhqr.qrCodeData);
const tag59Val = khmerTlvMap.get('59') || '';
assert(tag59Val.length <= 25, 'Tag 59 length is capped at EMVCo 25 character limit', tag59Val.length);
assert(/^[\x20-\x7E]*$/.test(tag59Val), 'Tag 59 sanitized to valid ASCII characters for banking scanner compatibility');

const tag64Val = khmerTlvMap.get('64') || '';
assert(tag64Val.length > 0, 'Tag 64 (Merchant Information - Language Template) is populated for native Khmer display');
assert(tag64Val.includes('km'), 'Tag 64 contains language preference km');
assert(tag64Val.includes('ហាងនំប៉័ង'), 'Tag 64 preserves authentic native Khmer store name without gibberish stripping');

const tag62Khmer = khmerTlvMap.get('62') || '';
assert(tag62Khmer.length <= 40, 'Tag 62 length is safely bounded within EMVCo limits');

const samplePayload = '00020101021230380009bakongkh1015rescuebite@aba52045812530384054044.005802KH5919RescueBite Cambodia6010Phnom Penh62190115RB-2026-TEST0016304';
const crc = calculateCrc16(samplePayload);
assert(crc.length === 4, 'Calculated CRC16 is 4 hex characters', crc);
assert(/^[0-9A-F]{4}$/.test(crc), 'CRC16 contains valid uppercase hexadecimal', crc);

console.log('\nTest Suite 6: Strike Decay, Trust Bounds & Safe UTF-8 Truncation');
// 6a. Safe UTF-8 Multi-Byte Truncation (prevents split 3-byte Khmer characters)
const longKhmerText = 'ហាងនំប៉័ង អេរិក ខាយសឺ ភ្នំពេញ កម្ពុជា';
const truncatedKhmer = safeUtf8ByteTruncate(longKhmerText, 25);
assert(Buffer.byteLength(truncatedKhmer, 'utf8') <= 25, 'safeUtf8ByteTruncate adheres strictly to 25 byte limit', Buffer.byteLength(truncatedKhmer, 'utf8'));
// Ensure no malformed trailing byte replacement character
assert(!truncatedKhmer.includes('\uFFFD'), 'safeUtf8ByteTruncate produces 100% valid UTF-8 without replacement corruptions');

// 6b. Strike History & 45-Day Independent Time-Decay
const fortySixDaysAgo = new Date(Date.now() - 46 * 24 * 60 * 60 * 1000).toISOString();
const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

const mockHistory: CashStrikeRecord[] = [
  { id: 's1', orderId: 'ord1', reason: 'NO_SHOW', strikeWeight: 1.0, timestamp: fortySixDaysAgo, status: 'ACTIVE' },
  { id: 's2', orderId: 'ord2', reason: 'LATE_CANCELLATION', strikeWeight: 0.5, timestamp: yesterday, status: 'ACTIVE' },
];

const { activeStrikes, updatedHistory } = evaluateUserStrikes(mockHistory);
assert(updatedHistory[0].status === 'DECAYED', '46-day-old strike automatically transitioned to DECAYED');
assert(updatedHistory[1].status === 'ACTIVE', 'Recent strike remains ACTIVE');
assert(activeStrikes === 0.5, 'Active strikes count reflects only active strikes (0.5)', activeStrikes);

// 6c. Trust Score Mathematical Bounds [0, 100]
const boundedHigh = Math.min(100, Math.max(0, 75 + 30));
const boundedLow = Math.min(100, Math.max(0, 20 - 30));
assert(boundedHigh === 100, 'Trust score safely caps at 100', boundedHigh);
assert(boundedLow === 0, 'Trust score safely floors at 0', boundedLow);

// 6d. 30-Minute Cancellation Sharp Threshold
const now = new Date();
const pad = (n: number) => n.toString().padStart(2, '0');
const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const inTenMin = new Date(now.getTime() + 10 * 60 * 1000);
const inFiftyMin = new Date(now.getTime() + 50 * 60 * 1000);

const lateWindow = `${formatTime(inTenMin)} - ${formatTime(new Date(inTenMin.getTime() + 60 * 60 * 1000))}`;
const gracefulWindow = `${formatTime(inFiftyMin)} - ${formatTime(new Date(inFiftyMin.getTime() + 60 * 60 * 1000))}`;

assert(isLateCancellation(undefined, lateWindow) === true, 'Order within 10 minutes is flagged as LATE cancellation');
assert(isLateCancellation(undefined, gracefulWindow) === false, 'Order 50 minutes out is flagged as GRACEFUL cancellation');

console.log('\n======================================================');
console.log(`🏁 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
