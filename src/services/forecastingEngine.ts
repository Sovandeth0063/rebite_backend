/**
 * ============================================================================
 * File: src/services/forecastingEngine.ts
 * Purpose: 100% Deterministic Mathematical & Statistical Forecasting Engine
 * Key Features:
 *   - Zero External API Calls ($0.00 Cost, No Rate Limits, < 0.2ms latency)
 *   - Clamped Dynamic Markdown Pricing (30% to 70%)
 *   - 30-Day Empirical Velocity & Category Priors
 *   - Tropical Perishability Decay Factors (C_decay)
 *   - Next-Day Baking Batch Safety Optimizer (Max 40% reduction floor)
 *   - 100% Deterministic Bilingual (EN / KM) Advice Generators
 * ============================================================================
 */

export interface InventoryItem {
  name: string;
  category?: string;
  stock_quantity?: number;
  stockQuantity?: number;
  original_price?: number;
  originalPrice?: number;
}

export interface ForecastInputContext {
  businessName: string;
  businessType: string;
  city?: string;
  openingHoursStr?: string;
  closingHour?: string;
  inventory?: InventoryItem[];
  recent30dSalesCount?: number;
  currentBagsCount?: number;
}

export interface SurplusForecastResult {
  predictedUnsoldCount: number;
  suggestedBagQuantity: number;
  recommendedOriginalPrice: number;
  recommendedRescuePrice: number;
  discountPercentage: number;
  recommendedPickupWindow: string;
  bakingAdjustmentAdvice: string;
  potentialRevenueRecoveryUsd: number;
  summaryEn: string;
  summaryKh: string;
  metrics: {
    totalStock: number;
    hoursRemaining: number;
    hourlyVelocity: number;
    decayFactor: number;
    dayMultiplier: number;
    executionTimeMs: number;
  };
}

// 1. Domain Category Priors (Items / Hour)
const CATEGORY_VELOCITY_PRIORS: Record<string, number> = {
  Bakery: 2.8,
  Boulangerie: 2.8,
  Cafe: 3.2,
  'Café & Roastery': 3.2,
  Restaurant: 2.0,
  'Grocery & Bakery': 4.5,
  Supermarket: 4.5,
  Dessert: 2.2,
  Default: 2.5,
};

// 2. Food Perishability Matrix (C_decay)
const PERISHABILITY_MATRIX: Record<string, number> = {
  fresh_cream: 1.0,
  sandwich: 1.0,
  dairy: 1.0,
  cake: 0.95,
  viennoiserie: 0.8,
  croissant: 0.8,
  pastry: 0.8,
  crusty_bread: 0.65,
  baguette: 0.65,
  sourdough: 0.6,
  packaged_bread: 0.4,
  toast: 0.4,
  dry_pastry: 0.2,
  cookies: 0.2,
  biscuit: 0.2,
  default: 0.75,
};

// 3. Day of Week Demand Multiplier (W_day)
function getDayOfWeekMultiplier(date = new Date()): number {
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  if (day === 0 || day === 6) return 1.25; // Weekend peak
  if (day === 4 || day === 5) return 1.05; // Thu / Fri uptick
  return 0.85; // Mon - Wed regular baseline
}

/**
 * Parses operating hours string from PostgreSQL (e.g. "07:00 AM - 09:30 PM", "24 Hours Open")
 * Returns daily operating hours and closing hour as a float (24h format).
 */
export function parseOperatingSchedule(openingHoursStr?: string): {
  dailyOperatingHours: number;
  closingHourFloat: number;
  formattedPickupWindow: string;
} {
  const defaultSchedule = {
    dailyOperatingHours: 14.0,
    closingHourFloat: 21.0, // 9:00 PM
    formattedPickupWindow: '19:30 - 21:00',
  };

  if (!openingHoursStr || !openingHoursStr.trim()) {
    return defaultSchedule;
  }

  const str = openingHoursStr.trim().toLowerCase();

  if (str.includes('24 hours') || str.includes('24/7')) {
    return {
      dailyOperatingHours: 24.0,
      closingHourFloat: 23.99,
      formattedPickupWindow: '20:00 - 22:00',
    };
  }

  // Example match: "07:00 am - 09:30 pm" or "7:00 - 21:30"
  const match = openingHoursStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

  if (!match) {
    return defaultSchedule;
  }

  let openH = parseInt(match[1], 10);
  const openM = match[2] ? parseInt(match[2], 10) : 0;
  const openMeridiem = match[3]?.toLowerCase();

  let closeH = parseInt(match[4], 10);
  const closeM = match[5] ? parseInt(match[5], 10) : 0;
  const closeMeridiem = match[6]?.toLowerCase();

  // Convert 12h to 24h
  if (openMeridiem === 'pm' && openH < 12) openH += 12;
  if (openMeridiem === 'am' && openH === 12) openH = 0;

  if (closeMeridiem === 'pm' && closeH < 12) closeH += 12;
  if (closeMeridiem === 'am' && closeH === 12) closeH = 0;

  const openFloat = openH + openM / 60;
  const closeFloat = closeH + closeM / 60;

  const dailyHours = closeFloat > openFloat ? closeFloat - openFloat : 24 - openFloat + closeFloat;

  // Pickup window: 1.5h before closing to closing
  const pickupStartH = Math.max(0, closeH - 2);
  const pickupEndH = closeH;
  const formatTime = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const formattedPickupWindow = `${formatTime(pickupStartH, 30)} - ${formatTime(pickupEndH, closeM)}`;

  return {
    dailyOperatingHours: dailyHours > 0 && dailyHours <= 24 ? dailyHours : 14.0,
    closingHourFloat: closeFloat,
    formattedPickupWindow,
  };
}

/**
 * Derives average perishability factor from current inventory items.
 */
function getInventoryDecayFactor(inventory: InventoryItem[] = []): number {
  if (!inventory || inventory.length === 0) return PERISHABILITY_MATRIX.default;

  let totalDecay = 0;
  let itemCount = 0;

  for (const item of inventory) {
    const qty = item.stockQuantity || item.stock_quantity || 1;
    const nameLower = (item.name || '').toLowerCase();
    const catLower = (item.category || '').toLowerCase();

    let decay = PERISHABILITY_MATRIX.default;
    for (const [key, val] of Object.entries(PERISHABILITY_MATRIX)) {
      if (nameLower.includes(key) || catLower.includes(key)) {
        decay = val;
        break;
      }
    }

    totalDecay += decay * qty;
    itemCount += qty;
  }

  return itemCount > 0 ? Number((totalDecay / itemCount).toFixed(2)) : PERISHABILITY_MATRIX.default;
}

/**
 * 100% Deterministic Mathematical Surplus & Production Forecaster
 */
export function calculateMathematicalForecast(context: ForecastInputContext): SurplusForecastResult {
  const startTime = performance.now();

  const inventory = context.inventory || [];
  const totalStock = inventory.reduce(
    (sum, item) => sum + (item.stockQuantity || item.stock_quantity || 1),
    0
  );

  // Average item retail price
  const totalRetailValue = inventory.reduce((sum, item) => {
    const qty = item.stockQuantity || item.stock_quantity || 1;
    const price = item.originalPrice || item.original_price || 3.5;
    return sum + price * qty;
  }, 0);
  const avgItemRetailPrice = totalStock > 0 ? totalRetailValue / totalStock : 3.5;

  // 1. Operating Hours & Remaining Time
  const schedule = parseOperatingSchedule(context.openingHoursStr);
  const now = new Date();
  const currentHourFloat = now.getHours() + now.getMinutes() / 60;
  let hoursRemaining = Math.max(0.5, schedule.closingHourFloat - currentHourFloat);
  if (hoursRemaining > 16) hoursRemaining = 4.0; // Normalized default for mid-day check

  // 2. Sales Velocity Calculation
  const categoryPrior =
    CATEGORY_VELOCITY_PRIORS[context.businessType] || CATEGORY_VELOCITY_PRIORS.Default;
  let hourlyVelocity = categoryPrior;

  if (context.recent30dSalesCount && context.recent30dSalesCount >= 5) {
    const total30dOperatingHours = schedule.dailyOperatingHours * 30;
    hourlyVelocity = Number((context.recent30dSalesCount / total30dOperatingHours).toFixed(2));
    // Bound empirical velocity between 0.5 and 15 items/hour
    hourlyVelocity = Math.max(0.5, Math.min(15.0, hourlyVelocity));
  }

  // 3. Day of Week & Decay Modifiers
  const dayMultiplier = getDayOfWeekMultiplier(now);
  const decayFactor = getInventoryDecayFactor(inventory);

  // 4. Surplus Calculation: P_surplus = Max(0, Stock - (Velocity * Hours * Day)) * Decay
  const expectedNaturalSales = hourlyVelocity * hoursRemaining * dayMultiplier;
  const rawSurplus = Math.max(0, totalStock - expectedNaturalSales);
  const predictedUnsoldCount = Math.max(
    totalStock > 0 ? 2 : 0,
    Math.round(rawSurplus * decayFactor)
  );

  // 5. Bag Sizing (3.5 items per mystery bag)
  const suggestedBagQuantity = Math.max(
    1,
    Math.ceil(predictedUnsoldCount / 3.5)
  );

  // 6. Dynamic Clamped Discount Percentage: Discount% = Clamp(30%, 70%, 40% + U*20% + Decay*10%)
  const urgencyFactor = Math.max(0, Math.min(1, 1 - hoursRemaining / 3.0));
  const rawDiscount = 0.4 + urgencyFactor * 0.2 + decayFactor * 0.1;
  const discountPercentage = Math.max(30, Math.min(70, Math.round(rawDiscount * 100)));

  // 7. Pricing & Revenue Recovery
  const recommendedOriginalPrice = Number((avgItemRetailPrice * 3.2).toFixed(2)); // Bag retail value
  const recommendedRescuePrice = Number(
    Math.max(1.5, recommendedOriginalPrice * (1 - discountPercentage / 100)).toFixed(2)
  );
  const potentialRevenueRecoveryUsd = Number(
    (suggestedBagQuantity * recommendedRescuePrice).toFixed(2)
  );
  const potentialRevenueRecoveryKhr = Math.round(potentialRevenueRecoveryUsd * 4100);

  // 8. Tomorrow's Production Batch Optimizer (Single Coherent 40% Cap)
  const currentBatchApprox = Math.max(totalStock, 30);
  const proposedReduction = Math.round(predictedUnsoldCount * 0.6);
  const maxAllowedReduction = Math.round(currentBatchApprox * 0.4);
  const finalBatchReduction = Math.min(maxAllowedReduction, proposedReduction);
  const tomorrowRecommendedBatch = currentBatchApprox - finalBatchReduction;

  const topSurplusCategory = inventory[0]?.name || 'croissants & morning pastries';
  const bakingAdjustmentAdvice =
    finalBatchReduction > 0
      ? `Reduce tomorrow morning ${topSurplusCategory} batch by ${finalBatchReduction} units (${Math.round((finalBatchReduction / currentBatchApprox) * 100)}%) to eliminate recurring surplus while meeting peak morning demand.`
      : `Current production batch aligns with daily sales velocity. Maintain current morning bake quantity.`;

  // 9. Deterministic Bilingual Summaries
  const summaryEn = `Statistical model predicts ~${predictedUnsoldCount} unsold items by ${schedule.closingHourFloat.toFixed(0)}:00. Listing ${suggestedBagQuantity} Surprise Bags at ${discountPercentage}% off will recover ~$${potentialRevenueRecoveryUsd.toFixed(2)} (${potentialRevenueRecoveryKhr.toLocaleString()} KHR) in revenue.`;
  const summaryKh = `គំរូស្ថិតិព្យាករណ៍ថានឹងមាននំប៉័ងសល់ប្រហែល ${predictedUnsoldCount} មុខមុនពេលបិទហាង។ ការដាក់លក់ ${suggestedBagQuantity} កញ្ចប់បញ្ចុះតម្លៃ ${discountPercentage}% នឹងជួយស្រោចស្រង់ចំណូលបាន $${potentialRevenueRecoveryUsd.toFixed(2)} (~${potentialRevenueRecoveryKhr.toLocaleString()} រៀល)។`;

  const executionTimeMs = Number((performance.now() - startTime).toFixed(3));

  return {
    predictedUnsoldCount,
    suggestedBagQuantity,
    recommendedOriginalPrice,
    recommendedRescuePrice,
    discountPercentage,
    recommendedPickupWindow: schedule.formattedPickupWindow,
    bakingAdjustmentAdvice,
    potentialRevenueRecoveryUsd,
    summaryEn,
    summaryKh,
    metrics: {
      totalStock,
      hoursRemaining: Number(hoursRemaining.toFixed(2)),
      hourlyVelocity,
      decayFactor,
      dayMultiplier,
      executionTimeMs,
    },
  };
}

/**
 * Deterministic Intent-Mapped Assistant Knowledge Engine
 */
export function getDeterministicAssistantAdvice(
  question: string,
  context: { businessName: string; businessType: string; city?: string }
): string {
  const q = question.toLowerCase();
  const name = context.businessName || 'Partner Store';
  const type = context.businessType || 'Bakery';

  if (q.includes('price') || q.includes('pricing') || q.includes('discount') || q.includes('cost')) {
    return `[RescueBite Pricing Strategy for ${name}]
• **Recommended Markdown:** 50%–70% off standard retail.
• **Sweet Spot Price:** $3.00 to $4.00 (~12,000 to 16,500 KHR) per Surprise Bag.
• **Margin Rule:** At 65% discount, retail price still covers 100% of raw ingredient and packaging costs, converting waste directly into cash.`;
  }

  if (q.includes('package') || q.includes('bag') || q.includes('pack') || q.includes('mystery')) {
    return `[RescueBite Bag Packaging Guide for ${name}]
• **Ideal Sizing:** 3 to 4 assorted unsold items per bag.
• **Assortment Ratio:** 2 standard items (e.g. plain croissants/baguettes) + 1 premium sweet/savory pastry.
• **Packaging:** Eco-friendly brown kraft bags with the RescueBite seal.`;
  }

  if (q.includes('hour') || q.includes('pickup') || q.includes('time') || q.includes('schedule')) {
    return `[Pickup Window Optimization for ${type}]
• **Best Window:** Schedule pickup 30 to 90 minutes before closing (e.g., 18:30 – 20:00).
• **Customer Flow:** Concentrates foot traffic during low-rush evening hours without interrupting peak afternoon counter sales.`;
  }

  if (q.includes('safe') || q.includes('quality') || q.includes('allergen') || q.includes('health')) {
    return `[Food Safety & Freshness Guidelines]
• **Daily Rule:** All surplus items must be freshly baked or prepared on the same day.
• **Temperature Control:** Chilled items (sandwiches/dairy) must remain refrigerated until pickup.
• **Allergen Notice:** Display clear allergen notices (gluten, dairy, eggs, nuts) on bag tags.`;
  }

  return `[RescueBite Operational Advisor for ${name}]
• **Surplus Recovery:** Regular Phnom Penh partner bakeries recover $180–$450/month from evening surplus bags.
• **Zero Fixed Cost:** Platform commission is strictly 15% on completed sales; payout is transferred weekly via ABA / Bakong.
• **Next Step:** Update your daily end-of-day stock count by 17:30 to publish evening rescue bags automatically.`;
}
