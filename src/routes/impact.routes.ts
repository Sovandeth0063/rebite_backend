/**
 * ============================================================================
 * File: src/routes/impact.routes.ts
 * Purpose: Environmental & Financial Impact Analytics Endpoints
 * Endpoints:
 *   - GET /api/impact -> Retrieve global platform metrics (meals rescued, kg food saved, CO2 avoided, customer savings)
 * ============================================================================
 */

import { Router } from 'express';
import { queryOne } from '../config/db.js';

export const impactRouter = Router();

// Get impact stats
impactRouter.get('/', async (req, res) => {
  try {
    const stats = await queryOne('SELECT * FROM impact_stats WHERE id = 1');
    if (!stats) {
      return res.json({
        mealsRescued: 14850,
        foodSavedKg: 2890,
        customerSavingsUsd: 22450,
        co2AvoidedKg: 10420,
        activeMerchantsCount: 32,
      });
    }

    res.json({
      mealsRescued: stats.meals_rescued,
      foodSavedKg: parseFloat(stats.food_saved_kg),
      customerSavingsUsd: parseFloat(stats.customer_savings_usd),
      co2AvoidedKg: parseFloat(stats.co2_avoided_kg),
      activeMerchantsCount: stats.active_merchants_count,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch impact statistics' });
  }
});
