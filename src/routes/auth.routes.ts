/**
 * ============================================================================
 * File: src/routes/auth.routes.ts
 * Purpose: Authentication & User Profile API Endpoints
 * Endpoints:
 *   - POST   /api/auth/login            -> Authenticate user / create demo account
 *   - POST   /api/auth/register         -> Register new user account with referral code support
 *   - GET    /api/auth/profile          -> Retrieve current authenticated user profile
 *   - PUT    /api/auth/profile          -> Update user profile details (name, phone, language, avatar)
 *   - GET    /api/auth/profile/settings -> Get customer notification & payment preferences
 *   - PUT    /api/auth/profile/settings -> Update customer preferences
 *   - GET    /api/auth/sessions         -> List active login sessions
 *   - DELETE /api/auth/sessions/:id     -> Revoke a specific session
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';

export const authRouter = Router();

// Login
authRouter.post('/login', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  try {
    let user = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);

    if (!user) {
      const newUser = {
        id: `usr_${Date.now()}`,
        email: email.trim(),
        name: email.split('@')[0],
        role: role || 'CUSTOMER',
        phone: '+855 12 000 000',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        language: 'en',
        points: 50,
        referral_code: 'RESCUE' + Math.floor(1000 + Math.random() * 9000),
        saved_store_ids: JSON.stringify([]),
        created_at: new Date().toISOString(),
      };

      await pool.query(
        `INSERT INTO users (id, email, name, role, phone, avatar_url, language, points, referral_code, saved_store_ids, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newUser.id,
          newUser.email,
          newUser.name,
          newUser.role,
          newUser.phone,
          newUser.avatar_url,
          newUser.language,
          newUser.points,
          newUser.referral_code,
          newUser.saved_store_ids,
          newUser.created_at,
        ]
      );
      user = newUser;
    } else if (role && user.role !== role) {
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, user.id]);
      user.role = role;
    }

    // Record session
    const sessionId = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await pool.query(
      `INSERT INTO login_sessions (id, user_id, device, browser, ip_address, last_active, is_current)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sessionId,
        user.id,
        'Windows PC',
        'Chrome Browser',
        req.ip || '127.0.0.1',
        new Date().toISOString(),
        true,
      ]
    );

    res.json({
      token: `jwt_demo_${user.id}`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        avatarUrl: user.avatar_url,
        language: user.language,
        points: user.points,
        referralCode: user.referral_code,
        referredBy: user.referred_by,
        savedStoreIds: user.saved_store_ids || [],
        createdAt: user.created_at,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register
authRouter.post('/register', async (req, res) => {
  const { email, password, name, role, phone, referralCode } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and Name are required' });
  }

  try {
    const existing = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    let initialPoints = 50;
    let referredBy: string | undefined;

    if (referralCode) {
      const referrer = await queryOne('SELECT * FROM users WHERE referral_code = $1', [referralCode.trim().toUpperCase()]);
      if (referrer) {
        referredBy = referrer.id;
        initialPoints += 50;
        await pool.query('UPDATE users SET points = points + 50 WHERE id = $1', [referrer.id]);
      }
    }

    const newUser = {
      id: `usr_${Date.now()}`,
      email: email.trim(),
      name: name.trim(),
      role: role || 'CUSTOMER',
      phone: phone || '+855 12 000 000',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      language: 'en',
      points: initialPoints,
      referral_code: 'RESCUE' + Math.floor(1000 + Math.random() * 9000),
      referred_by: referredBy || null,
      saved_store_ids: JSON.stringify([]),
      created_at: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO users (id, email, name, role, phone, avatar_url, language, points, referral_code, referred_by, saved_store_ids, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        newUser.id,
        newUser.email,
        newUser.name,
        newUser.role,
        newUser.phone,
        newUser.avatar_url,
        newUser.language,
        newUser.points,
        newUser.referral_code,
        newUser.referred_by,
        newUser.saved_store_ids,
        newUser.created_at,
      ]
    );

    res.json({
      token: `jwt_demo_${newUser.id}`,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        phone: newUser.phone,
        avatarUrl: newUser.avatar_url,
        language: newUser.language,
        points: newUser.points,
        referralCode: newUser.referral_code,
        referredBy: newUser.referred_by,
        savedStoreIds: [],
        createdAt: newUser.created_at,
      },
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile
authRouter.get('/profile', async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(req.currentUser);
});

authRouter.put('/profile', async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, phone, avatarUrl, language, savedStoreIds } = req.body;
  try {
    await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           avatar_url = COALESCE($3, avatar_url),
           language = COALESCE($4, language),
           saved_store_ids = COALESCE($5, saved_store_ids)
       WHERE id = $6`,
      [
        name,
        phone,
        avatarUrl,
        language,
        savedStoreIds ? JSON.stringify(savedStoreIds) : null,
        req.currentUser.id,
      ]
    );

    const updated = await queryOne('SELECT * FROM users WHERE id = $1', [req.currentUser.id]);
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      phone: updated.phone,
      avatarUrl: updated.avatar_url,
      language: updated.language,
      points: updated.points,
      referralCode: updated.referral_code,
      referredBy: updated.referred_by,
      savedStoreIds: updated.saved_store_ids || [],
      createdAt: updated.created_at,
    });
  } catch (err: any) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Customer Settings
authRouter.get('/profile/settings', async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const row = await queryOne('SELECT settings FROM customer_settings WHERE user_id = $1', [req.currentUser.id]);
    if (row && row.settings) {
      return res.json(row.settings);
    }

    // Default settings
    const defaultSettings = {
      userId: req.currentUser.id,
      notifications: {
        orderUpdates: true,
        promoAlerts: true,
        pickupReminders: true,
        pushEnabled: true,
        smsEnabled: false,
        emailEnabled: true,
      },
      paymentMethods: {
        defaultMethod: 'ABA_PAY',
        bakongAccountId: 'dara.sok@acleda',
        abaPayPhone: '+855 12 345 678',
        savedBakongLink: true,
      },
      language: req.currentUser.language || 'en',
      currency: 'USD',
      twoFactorEnabled: false,
      savedAddresses: ['Street 240, Phnom Penh', 'BKK1, Phnom Penh'],
    };

    res.json(defaultSettings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

authRouter.put('/profile/settings', async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await pool.query(
      `INSERT INTO customer_settings (user_id, settings)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [req.currentUser.id, JSON.stringify(req.body)]
    );
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Sessions
authRouter.get('/sessions', async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sessions = await query('SELECT * FROM login_sessions WHERE user_id = $1 ORDER BY last_active DESC', [
      req.currentUser.id,
    ]);
    res.json(
      sessions.map((s) => ({
        id: s.id,
        userId: s.user_id,
        device: s.device,
        browser: s.browser,
        ipAddress: s.ip_address,
        lastActive: s.last_active,
        isCurrent: s.is_current,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

authRouter.delete('/sessions/:id', async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await pool.query('DELETE FROM login_sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.currentUser.id]);
    res.json({ success: true, message: 'Session revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});
