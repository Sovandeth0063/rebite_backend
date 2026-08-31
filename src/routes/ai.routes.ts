/**
 * ============================================================================
 * File: src/routes/ai.routes.ts
 * Purpose: AI Food Waste Assistant & Surplus Forecaster Route Definitions
 * Endpoints:
 *   - POST /api/ai/ask -> Delegates to aiController.askAssistant
 *   - POST /api/ai/forecast-surplus -> Delegates to aiController.forecastSurplus
 * ============================================================================
 */

import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';

export const aiRouter = Router();

// Ask Conversational AI Assistant
aiRouter.post('/ask', (req, res) => aiController.askAssistant(req, res));

// AI Smart Surplus & Production Demand Forecaster
aiRouter.post('/forecast-surplus', (req, res) => aiController.forecastSurplus(req, res));
