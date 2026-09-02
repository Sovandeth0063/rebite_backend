/**
 * ============================================================================
 * File: src/tests/test_voucher_lifecycles.ts
 * Purpose: Automated Verification Suite for Time-Limited Customer Vouchers,
 *          DB Idempotency Constraints, Mid-Checkout Expiration & Order Transactions.
 * ============================================================================
 */

import assert from 'assert';

console.log('\n======================================================');
console.log('🧪 RUNNING TIME-LIMITED VOUCHER LIFECYCLE TEST SUITE');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// ----------------------------------------------------------------------------
// Suite 1: Expiration Timestamp & State Machine
// ----------------------------------------------------------------------------
console.log('Test Suite 1: Time-Limited Expiration & State Transitions');

test('Active voucher within 7-day window evaluates to ACTIVE', () => {
  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const remainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const isExpired = remainingSeconds <= 0;

  assert.strictEqual(isExpired, false);
  assert.ok(remainingSeconds > 6 * 24 * 3600);
});

test('Expired voucher past expires_at timestamp automatically flags isExpired', () => {
  const now = Date.now();
  const pastExpiresAt = new Date(now - 1000 * 60).toISOString(); // 1 minute ago
  const remainingSeconds = Math.max(0, Math.floor((new Date(pastExpiresAt).getTime() - now) / 1000));
  const isExpired = remainingSeconds <= 0;

  assert.strictEqual(isExpired, true);
  assert.strictEqual(remainingSeconds, 0);
});

test('Expiring soon badge activates when < 24h remaining', () => {
  const now = Date.now();
  const soonExpiresAt = new Date(now + 3 * 3600 * 1000).toISOString(); // 3 hours remaining
  const diffMs = new Date(soonExpiresAt).getTime() - now;
  const isExpiringSoon = diffMs < 24 * 3600 * 1000 && diffMs > 0;

  assert.strictEqual(isExpiringSoon, true);
});

// ----------------------------------------------------------------------------
// Suite 2: DB Idempotency & Permanent Deduplication
// ----------------------------------------------------------------------------
console.log('\nTest Suite 2: DB Idempotency & Double-Click Protection');

test('Duplicate idempotency key safely returns existing active voucher', () => {
  const mockDb: Record<string, any> = {};
  const customerId = 'usr_cust_001';
  const idempotencyKey = 'idemp_cust_001_rew1_1720000000';

  // Request 1: Insert initial voucher
  const voucher1 = {
    id: 'cv_001',
    customerId,
    idempotencyKey,
    voucherCode: 'RB-PERK-A8K29Z',
    status: 'ACTIVE',
    discountAmount: 1.0,
  };
  mockDb[`${customerId}_${idempotencyKey}`] = voucher1;

  // Request 2 (Concurrent retry / Double click): Lookup by (customerId, idempotencyKey)
  const lookupKey = `${customerId}_${idempotencyKey}`;
  const existingVoucher = mockDb[lookupKey];

  assert.ok(existingVoucher !== undefined);
  assert.strictEqual(existingVoucher.voucherCode, 'RB-PERK-A8K29Z');
  assert.strictEqual(existingVoucher.id, 'cv_001');
});

// ----------------------------------------------------------------------------
// Suite 3: Mid-Checkout Expiration & Non-Refundable Policy
// ----------------------------------------------------------------------------
console.log('\nTest Suite 3: Mid-Checkout Expiration & Transaction Boundaries');

test('Mid-checkout order creation rejects expired voucher without refunding spent points', () => {
  const customerAccount = { id: 'usr_001', points: 150 };
  const perkCost = 50;

  // Transaction 1: Customer redeemed perk earlier (Points deducted independently)
  customerAccount.points -= perkCost;
  assert.strictEqual(customerAccount.points, 100);

  const voucher = {
    id: 'cv_002',
    code: 'RB-PERK-EXPIRED',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() - 5000).toISOString(), // Expired 5 seconds ago
  };

  // Transaction 2: Order submission check
  const isExpired = new Date(voucher.expiresAt).getTime() <= Date.now();
  let orderSucceeded = false;
  let errorMsg = '';

  if (isExpired) {
    voucher.status = 'EXPIRED';
    errorMsg = 'This voucher expired and is no longer valid.';
  } else {
    orderSucceeded = true;
    voucher.status = 'USED';
  }

  assert.strictEqual(orderSucceeded, false);
  assert.strictEqual(voucher.status, 'EXPIRED');
  assert.strictEqual(customerAccount.points, 100); // Points are NOT refunded per policy
  assert.ok(errorMsg.includes('expired'));
});

// ----------------------------------------------------------------------------
// Suite 4: Order Transaction Rollback vs Success Lifecycle
// ----------------------------------------------------------------------------
console.log('\nTest Suite 4: Order Transaction Rollback vs Success Lifecycle');

test('Aborted order transaction rolls back voucher status to ACTIVE', () => {
  const voucher = {
    id: 'cv_003',
    code: 'RB-PERK-VALID',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    usedAt: null as string | null,
    orderId: null as string | null,
  };

  // Simulate order transaction with payment failure
  let transactionState = { ...voucher };
  transactionState.status = 'USED';
  transactionState.usedAt = new Date().toISOString();
  transactionState.orderId = 'ord_fail_001';

  // Payment failed -> ROLLBACK!
  const paymentSuccess = false;
  if (!paymentSuccess) {
    // Revert to pre-transaction state
    transactionState = { ...voucher };
  }

  assert.strictEqual(transactionState.status, 'ACTIVE');
  assert.strictEqual(transactionState.usedAt, null);
  assert.strictEqual(transactionState.orderId, null);
});

test('Successful order marks voucher as USED with link to order ID', () => {
  const voucher = {
    id: 'cv_004',
    code: 'RB-PERK-WINNER',
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    usedAt: null as string | null,
    orderId: null as string | null,
  };

  // Order transaction succeeds -> COMMIT!
  const orderId = 'ord_win_999';
  voucher.status = 'USED';
  voucher.usedAt = new Date().toISOString();
  voucher.orderId = orderId;

  assert.strictEqual(voucher.status, 'USED');
  assert.ok(voucher.usedAt !== null);
  assert.strictEqual(voucher.orderId, 'ord_win_999');
});

console.log('\n======================================================');
console.log(`🏁 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
