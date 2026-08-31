/**
 * ============================================================================
 * File: src/services/gemini.ts
 * Purpose: Legacy AI Service Interface (Delegated to Pure Mathematical Engine)
 * Responsibilities:
 *   - Completely eliminates external LLM API calls ($0.00 cost, zero rate limits).
 *   - Directly invokes forecastingEngine.ts for instant deterministic calculation.
 * ============================================================================
 */

import {
  calculateMathematicalForecast,
  getDeterministicAssistantAdvice,
  SurplusForecastResult,
} from './forecastingEngine.js';

export async function askAiFoodWasteAssistant(
  question: string,
  context: {
    businessName: string;
    businessType: string;
    city?: string;
    inventory?: any[];
  }
): Promise<string> {
  return getDeterministicAssistantAdvice(question, {
    businessName: context.businessName,
    businessType: context.businessType,
    city: context.city,
  });
}

export async function forecastBakerySurplus(context: {
  businessName: string;
  businessType: string;
  city?: string;
  openingHoursStr?: string;
  closingHour?: string;
  inventory?: any[];
  recent30dSalesCount?: number;
}): Promise<SurplusForecastResult> {
  return calculateMathematicalForecast(context);
}
