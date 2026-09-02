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
import { pool, query, queryOne } from './config/db.js';

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

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
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

app.get('/api/debug-db', async (req, res) => {
  try {
    const dbInfo = await query('SELECT current_database(), current_user, inet_server_port(), (SELECT count(*) FROM orders) as orders_count');
    res.json(dbInfo);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

// Current User / Me endpoint alias
app.get('/api/users/me', (req: AuthenticatedRequest, res) => {
  if (req.currentUser) {
    return res.json(req.currentUser);
  }
  res.json({
    id: 'usr_guest',
    email: '',
    name: 'Guest',
    role: 'GUEST',
    language: 'en',
    points: 0,
    referralCode: 'GUEST',
    savedStoreIds: [],
    createdAt: new Date().toISOString(),
  });
});

import { crudRouter } from './routes/crud.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { bakongRouter } from './routes/bakong.routes.js';
import { menuItemRouter } from './routes/menuItem.routes.js';
import { liveListingRouter } from './routes/liveListing.routes.js';
import { startExpiryWorker } from './services/expiryWorker.js';
import { AuthenticatedRequest } from './middleware/auth.js';

// Mount modular route handlers
app.use('/api/auth', authRouter);
app.use('/api/merchants', merchantRouter);
app.use('/api/rescue-bags', rescueBagRouter);
app.use('/api/menu-items', menuItemRouter);
app.use('/api/live-listings', liveListingRouter);
app.use('/api/orders', orderRouter);
app.use('/api/reviews', reviewRouter);
app.use('/api/impact', impactRouter);
app.use('/api/ai', aiRouter);
app.use('/api/crud', crudRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/bakong', bakongRouter);
app.use('/api', adminRouter);

// Toggle Favorite Store
app.post('/api/favorites/toggle', async (req: AuthenticatedRequest, res) => {
  const { merchantId } = req.body;
  if (!merchantId) {
    return res.status(400).json({ error: 'merchantId is required' });
  }

  const userId = req.currentUser?.id || (req.headers['x-user-id'] as string) || 'usr_customer';
  try {
    const user = await queryOne('SELECT saved_store_ids FROM users WHERE id = $1', [userId]);
    let savedStoreIds: string[] = [];
    if (user?.saved_store_ids) {
      savedStoreIds = Array.isArray(user.saved_store_ids)
        ? user.saved_store_ids
        : typeof user.saved_store_ids === 'string'
        ? JSON.parse(user.saved_store_ids)
        : [];
    }

    if (savedStoreIds.includes(merchantId)) {
      savedStoreIds = savedStoreIds.filter((id) => id !== merchantId);
    } else {
      savedStoreIds.push(merchantId);
    }

    if (user) {
      await pool.query('UPDATE users SET saved_store_ids = $1 WHERE id = $2', [
        JSON.stringify(savedStoreIds),
        userId,
      ]);
    }

    res.json({ savedStoreIds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle favorite store' });
  }
});

// All Inventory endpoint (for Merchant view & surplus tracking)
app.get('/api/inventory', async (req: AuthenticatedRequest, res) => {
  try {
    const rows = await query('SELECT * FROM inventory ORDER BY name ASC');
    res.json(
      rows.map((r) => ({
        id: r.id,
        merchantId: r.merchant_id,
        name: r.name,
        category: r.category,
        stockQuantity: r.stock_quantity,
        normalPrice: parseFloat(r.normal_price),
        expiryDate: r.expiry_date,
        expectedSales: r.expected_sales,
        surplusRisk: r.surplus_risk,
        recommendedAction: r.recommended_action,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Reset demo database to seed (support both /api/reset and /api/demo/reset)
const handleReset = async (req: any, res: any) => {
  try {
    await ensureDatabaseAndSchema();
    res.json({ success: true, message: 'Database reset to initial demo seeds.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset database', details: err.message });
  }
};

app.post('/api/reset', handleReset);
app.post('/api/demo/reset', handleReset);

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

    // Start background auto-expiry daemon
    startExpiryWorker();
  });
}

start();
