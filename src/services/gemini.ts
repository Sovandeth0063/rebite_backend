/**
 * ============================================================================
 * File: src/services/gemini.ts
 * Purpose: Google Gemini AI Integration Service
 * Responsibilities:
 *   - Initializes GoogleGenAI client with GEMINI_API_KEY.
 *   - Provides askAiFoodWasteAssistant() to generate tailored inventory recommendations,
 *     optimal discount percentages, and pickup window advice for Cambodian food merchants.
 *   - Includes fallback deterministic rule-based advice if API key is not configured.
 * ============================================================================
 */

import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return aiInstance;
}

export async function askAiFoodWasteAssistant(
  prompt: string,
  businessContext: {
    businessName: string;
    businessType: string;
    city: string;
    inventory?: any[];
    salesHistory?: any;
  }
): Promise<string> {
  const ai = getGenAI();

  if (!ai) {
    return `[Demo AI Assistant for ${businessContext.businessName}] Based on typical ${businessContext.businessType} patterns in ${businessContext.city}:
1. **Surplus Prediction**: Evening peak hours produce approx 10-15% unsold baked items or prepared meals.
2. **Smart Pricing Recommendation**: Discount surplus bags by 60-70% 2 hours before closing to maximize revenue recovery while covering ingredient cost.
3. **Action Step**: Create a Rescue Bag with 3-4 items priced at $3.50 (estimated retail $10.00) for pickup between 18:30 and 20:00.`;
  }

  try {
    const systemInstruction = `You are RescueBite AI, a specialized data science and food waste reduction expert for Cambodian food businesses (bakeries, cafes, restaurants, supermarkets in Phnom Penh, Siem Reap, etc.). 
Provide practical, friendly, actionable advice on predicting food surplus, pricing discount rescue bags, optimizing pickup windows, and reducing organic waste. Keep answers concise, highly structured, and Cambodian market-relevant.`;

    const userPrompt = `Business Name: ${businessContext.businessName} (${businessContext.businessType} in ${businessContext.city})
Inventory Context: ${JSON.stringify(businessContext.inventory || [])}
Merchant Question: ${prompt}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text || 'Unable to generate recommendation at this moment.';
  } catch (err: any) {
    console.error('Error calling Gemini AI:', err);
    return `[RescueBite AI Assistant] Unable to query AI model currently (${err.message || 'API error'}). Rule recommendation: Discount surplus inventory by 60% during the final 2 hours of operating hours.`;
  }
}
