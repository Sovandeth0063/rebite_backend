/**
 * ============================================================================
 * File: src/server.ts
 * Purpose: Main Backend Application Entrypoint
 * Responsibilities:
 *   - Initializes Express application with CORS & JSON body parser.
 *   - Attaches user authentication middleware.
 *   - Mounts modular API route handlers (Auth, Merchants, Rescue Bags, Orders, Reviews, AI, Admin).
 *   - Automatically connects to PostgreSQL and verifies schema on startup.
 *   - Starts the HTTP server on configured port (default: 5000).
 * ============================================================================
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ensureDatabaseAndSchema } from './db/createDb.js';
import { authMiddleware } from './middleware/auth.js';
import { authRouter } from './routes/auth.routes.js';
import { merchantRouter } from './routes/merchant.routes.js';
import { rescueBagRouter } from './routes/rescueBag.routes.js';
import { orderRouter } from './routes/order.routes.js';
import { reviewRouter } from './routes/review.routes.js';
import { impactRouter } from './routes/impact.routes.js';
import { aiRouter } from './routes/ai.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { query } from './config/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// CORS setup
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  })
);

app.use(express.json());
app.use(authMiddleware);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    appName: 'RescueBite Cambodia Backend',
    database: 'PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

// All Users (for demo switcher)
app.get('/api/users', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM users ORDER BY created_at ASC');
    res.json(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        phone: u.phone,
        avatarUrl: u.avatar_url,
        language: u.language,
        points: u.points,
        referralCode: u.referral_code,
        referredBy: u.referred_by,
        savedStoreIds: u.saved_store_ids || [],
        createdAt: u.created_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

import { crudRouter } from './routes/crud.routes.js';

// Mount modular route handlers
app.use('/api/auth', authRouter);
app.use('/api/merchants', merchantRouter);
app.use('/api/rescue-bags', rescueBagRouter);
app.use('/api/orders', orderRouter);
app.use('/api/reviews', reviewRouter);
app.use('/api/impact', impactRouter);
app.use('/api/ai', aiRouter);
app.use('/api/crud', crudRouter);
app.use('/api', adminRouter);

// Reset demo database to seed
app.post('/api/reset', async (req, res) => {
  try {
    await ensureDatabaseAndSchema();
    res.json({ success: true, message: 'Database reset to initial demo seeds.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset database', details: err.message });
  }
});

async function start() {
  console.log('[Backend] Starting RescueBite PostgreSQL Backend Service...');
  
  try {
    await ensureDatabaseAndSchema();
  } catch (err: any) {
    console.warn('[Backend] Database initialization warning:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 RescueBite Backend API is running on http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
    console.log(`======================================================\n`);
  });
}

start();
