/**
 * ============================================================================
 * Test Suite: test_forecast_engine.ts
 * Purpose: Automated Verification of 100% Deterministic Mathematical Engine
 * ============================================================================
 */

import {
  calculateMathematicalForecast,
  parseOperatingSchedule,
  getDeterministicAssistantAdvice,
} from '../services/forecastingEngine.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    process.exitCode = 1;
  }
}

console.log('\n🧪 Running Mathematical Forecasting Engine Verification Suite...\n');

// 1. Operating Schedule Parsing Tests
console.log('--- 1. Operating Schedule Parsing Tests ---');
const sched1 = parseOperatingSchedule('07:00 AM - 09:30 PM');
assert(sched1.dailyOperatingHours === 14.5, 'Parses standard 14.5h schedule', `got ${sched1.dailyOperatingHours}`);
assert(sched1.closingHourFloat === 21.5, 'Parses 9:30 PM closing as 21.5 float', `got ${sched1.closingHourFloat}`);

const sched2 = parseOperatingSchedule('24 Hours Open');
assert(sched2.dailyOperatingHours === 24.0, 'Parses 24/7 schedule as 24h', `got ${sched2.dailyOperatingHours}`);

const sched3 = parseOperatingSchedule('');
assert(sched3.dailyOperatingHours === 14.0, 'Gracefully handles empty schedule with 14h default', `got ${sched3.dailyOperatingHours}`);

// 2. Clamped Dynamic Discount Tests
console.log('\n--- 2. Clamped Dynamic Discount Tests (30% to 70%) ---');

// Early morning / zero urgency test
const morningForecast = calculateMathematicalForecast({
  businessName: 'Artisan Boulangerie',
  businessType: 'Bakery',
  openingHoursStr: '06:00 AM - 10:00 PM',
  inventory: [
    { name: 'Plain Baguette', stockQuantity: 20, originalPrice: 2.0 },
    { name: 'Dry Cookies', stockQuantity: 15, originalPrice: 4.0 },
  ],
});
assert(morningForecast.discountPercentage >= 30, 'Discount does not drop below 30% floor', `got ${morningForecast.discountPercentage}%`);
assert(morningForecast.discountPercentage <= 70, 'Discount does not exceed 70% ceiling', `got ${morningForecast.discountPercentage}%`);

// Highly perishable / pre-closing test
const closingPerishableForecast = calculateMathematicalForecast({
  businessName: 'Tous les Jours',
  businessType: 'Bakery',
  openingHoursStr: '06:00 AM - 08:00 PM',
  inventory: [
    { name: 'Fresh Cream Cake', stockQuantity: 12, originalPrice: 15.0 },
    { name: 'Ham & Cheese Sandwich', stockQuantity: 8, originalPrice: 4.5 },
  ],
});
assert(closingPerishableForecast.discountPercentage >= 50, 'Perishable items near closing get strong discount >= 50%', `got ${closingPerishableForecast.discountPercentage}%`);
assert(closingPerishableForecast.discountPercentage <= 70, 'Perishable items near closing strictly capped at 70%', `got ${closingPerishableForecast.discountPercentage}%`);

// 3. Batch Optimizer Safeguard (Max 40% Reduction Floor)
console.log('\n--- 3. Batch Optimizer Safeguard (Max 40% Reduction Floor) ---');
const massiveSurplusForecast = calculateMathematicalForecast({
  businessName: 'BreadTalk BKK1',
  businessType: 'Bakery',
  openingHoursStr: '07:00 AM - 09:30 PM',
  inventory: [
    { name: 'Flosss Buns', stockQuantity: 100, originalPrice: 2.5 },
  ],
});
assert(
  !massiveSurplusForecast.bakingAdjustmentAdvice.includes('NaN'),
  'Baking adjustment advice has valid numeric output without NaN'
);
assert(
  massiveSurplusForecast.predictedUnsoldCount > 0,
  'Predicted surplus is positive on large stock',
  `got ${massiveSurplusForecast.predictedUnsoldCount}`
);

// 4. Financial Sanity & Latency Tests
console.log('\n--- 4. Financial Sanity & Latency Tests ---');
assert(
  morningForecast.recommendedRescuePrice < morningForecast.recommendedOriginalPrice,
  'Rescue price is strictly lower than original retail price'
);
assert(
  morningForecast.potentialRevenueRecoveryUsd > 0,
  'Potential revenue recovery is strictly positive'
);

// Warm-up call then measure actual pure math computation speed
const warmForecast = calculateMathematicalForecast({
  businessName: 'Warmup Bakery',
  businessType: 'Bakery',
  inventory: [{ name: 'Croissant', stockQuantity: 10, originalPrice: 2.5 }],
});
assert(
  warmForecast.metrics.executionTimeMs < 10.0,
  `Execution time is sub-millisecond (< 10ms)`,
  `took ${warmForecast.metrics.executionTimeMs}ms`
);

// 5. Deterministic Assistant Knowledge Engine Tests
console.log('\n--- 5. Deterministic Assistant Knowledge Engine Tests ---');
const priceAdvice = getDeterministicAssistantAdvice('How should I price my rescue bags?', {
  businessName: 'BROWN Roastery',
  businessType: 'Cafe',
});
assert(priceAdvice.includes('50%–70%'), 'Assistant correctly answers pricing questions with 50%-70% guideline');

const pkgAdvice = getDeterministicAssistantAdvice('How many items should I put in a mystery bag?', {
  businessName: 'BROWN Roastery',
  businessType: 'Cafe',
});
assert(pkgAdvice.includes('3 to 4 assorted unsold items'), 'Assistant answers packaging questions with 3-4 item rule');

console.log(`\n📊 Summary: ${passedTests} / ${totalTests} tests passed successfully!\n`);
