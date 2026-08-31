/**
 * ============================================================================
 * File: src/services/translation.ts
 * Purpose: Automated Bilingual (Khmer/English) Translation Engine
 * Responsibilities:
 *   - Detects language script (Khmer Unicode vs Latin).
 *   - Automatically translates merchant profiles, rescue bags, and user reviews using Gemini AI.
 *   - Persists translated title_en, title_km, description_en, description_km into PostgreSQL.
 *   - Provides fallback translation when AI is offline.
 * ============================================================================
 */

import { GoogleGenAI } from '@google/genai';
import { pool } from '../config/db.js';

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

export interface BatchTranslationResult {
  sourceLanguage: 'km' | 'en' | 'other';
  translations: {
    en?: Record<string, string>;
    km?: Record<string, string>;
  };
  success: boolean;
}

function detectKhmerScript(text: string): boolean {
  return /[\u1780-\u17FF]/.test(text);
}

function generateFallbackTranslation(fields: Record<string, string>): BatchTranslationResult {
  const combined = Object.values(fields).join(' ');
  const isKhmer = detectKhmerScript(combined);
  const sourceLang: 'km' | 'en' = isKhmer ? 'km' : 'en';
  const translations: { en?: Record<string, string>; km?: Record<string, string> } = {};

  if (sourceLang === 'km') {
    const enFields: Record<string, string> = {};
    for (const [key, val] of Object.entries(fields)) {
      enFields[key] = `[EN] ${val}`;
    }
    translations.en = enFields;
  } else {
    const kmFields: Record<string, string> = {};
    for (const [key, val] of Object.entries(fields)) {
      kmFields[key] = `[KM] ${val}`;
    }
    translations.km = kmFields;
  }

  return {
    sourceLanguage: sourceLang,
    translations,
    success: true,
  };
}

export async function translateContentBatch(fields: Record<string, string>): Promise<BatchTranslationResult> {
  const ai = getGenAI();
  if (!ai) {
    return generateFallbackTranslation(fields);
  }

  try {
    const prompt = `Translate the following JSON key-value pairs between English and Khmer (Cambodian). Return a clean JSON object with fields "sourceLanguage" ("km" or "en"), "en" (dictionary of english translations), and "km" (dictionary of khmer translations).
Input: ${JSON.stringify(fields)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      sourceLanguage: parsed.sourceLanguage || 'en',
      translations: {
        en: parsed.en,
        km: parsed.km,
      },
      success: true,
    };
  } catch (err) {
    console.error('Translation error:', err);
    return generateFallbackTranslation(fields);
  }
}

export async function asyncTranslateRescueBag(bagId: string) {
  try {
    const res = await pool.query('SELECT * FROM rescue_bags WHERE id = $1', [bagId]);
    if (res.rows.length === 0) return;
    const bag = res.rows[0];

    const result = await translateContentBatch({
      title: bag.title,
      description: bag.description,
    });

    const titleEn = result.translations.en?.title || bag.title_en || bag.title;
    const titleKm = result.translations.km?.title || bag.title_km || bag.title_km || bag.title;
    const descEn = result.translations.en?.description || bag.description_en || bag.description;
    const descKm = result.translations.km?.description || bag.description_km || bag.description_km || bag.description;

    await pool.query(
      `UPDATE rescue_bags
       SET title_en = $1, title_km = $2, description_en = $3, description_km = $4,
           source_language = $5, translation_status = 'COMPLETED', is_machine_translated = TRUE
       WHERE id = $6`,
      [titleEn, titleKm, descEn, descKm, result.sourceLanguage, bagId]
    );
  } catch (err) {
    console.error('Failed to translate rescue bag:', err);
  }
}

export async function asyncTranslateMerchant(merchantId: string) {
  try {
    const res = await pool.query('SELECT * FROM merchants WHERE id = $1', [merchantId]);
    if (res.rows.length === 0) return;
    const merchant = res.rows[0];

    const result = await translateContentBatch({
      businessName: merchant.business_name,
      description: merchant.description,
    });

    const nameEn = result.translations.en?.businessName || merchant.business_name_en || merchant.business_name;
    const nameKm = result.translations.km?.businessName || merchant.business_name_km || merchant.business_name;
    const descEn = result.translations.en?.description || merchant.description_en || merchant.description;
    const descKm = result.translations.km?.description || merchant.description_km || merchant.description;

    await pool.query(
      `UPDATE merchants
       SET business_name_en = $1, business_name_km = $2, description_en = $3, description_km = $4,
           source_language = $5, translation_status = 'COMPLETED', is_machine_translated = TRUE
       WHERE id = $6`,
      [nameEn, nameKm, descEn, descKm, result.sourceLanguage, merchantId]
    );
  } catch (err) {
    console.error('Failed to translate merchant:', err);
  }
}

export async function asyncTranslateReview(reviewId: string) {
  try {
    const res = await pool.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
    if (res.rows.length === 0) return;
    const review = res.rows[0];

    const result = await translateContentBatch({
      comment: review.comment,
    });

    const commentEn = result.translations.en?.comment || review.comment_en || review.comment;
    const commentKm = result.translations.km?.comment || review.comment_km || review.comment;

    await pool.query(
      `UPDATE reviews
       SET comment_en = $1, comment_km = $2,
           source_language = $3, translation_status = 'COMPLETED', is_machine_translated = TRUE
       WHERE id = $4`,
      [commentEn, commentKm, result.sourceLanguage, reviewId]
    );
  } catch (err) {
    console.error('Failed to translate review:', err);
  }
}
