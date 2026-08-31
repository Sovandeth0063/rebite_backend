/**
 * ============================================================================
 * File: src/routes/ai.routes.ts
 * Purpose: Gemini AI Smart Food Waste & Pricing Assistant Endpoints
 * Endpoints:
 *   - POST /api/ai/ask -> Sends prompt with business inventory context to Gemini AI assistant
 * ============================================================================
 */

import { Router } from 'express';
import { query } from '../config/db.js';
import { askAiFoodWasteAssistant } from '../services/gemini.js';

export const aiRouter = Router();

// Ask AI Food Waste Assistant
aiRouter.post('/ask', async (req, res) => {
  const { prompt, businessName, businessType, city } = req.body;
  try {
    const inventory = await query('SELECT * FROM inventory LIMIT 10');

    const answer = await askAiFoodWasteAssistant(prompt, {
      businessName: businessName || 'Phnom Penh Artisan Bakery',
      businessType: businessType || 'Bakery',
      city: city || 'Phnom Penh',
      inventory,
    });

    res.json({ answer });
  } catch (err: any) {
    console.error('AI route error:', err);
    res.status(500).json({ error: 'AI Assistant error' });
  }
});
