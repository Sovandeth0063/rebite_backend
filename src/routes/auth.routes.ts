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
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email address is required' });
  }

  try {
    let user = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);

    if (!user) {
      const emailLower = email.trim().toLowerCase();
      // Auto-provision admin credentials if needed for platform administration
      if (emailLower === 'admin@rescuebite.com' || emailLower === 'admin@rescuebite.kh') {
        const newAdmin = {
          id: `usr_admin_${Date.now()}`,
          email: emailLower,
          name: 'Platform Administrator',
          role: 'ADMIN',
          phone: '+855 23 888 999',
          avatar_url: null,
          language: 'en',
          points: 9999,
          referral_code: 'ADMINVIP',
          saved_store_ids: JSON.stringify([]),
          created_at: new Date().toISOString(),
        };
        await pool.query(
          `INSERT INTO users (id, email, name, role, phone, avatar_url, language, points, referral_code, saved_store_ids, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            newAdmin.id,
            newAdmin.email,
            newAdmin.name,
            newAdmin.role,
            newAdmin.phone,
            newAdmin.avatar_url,
            newAdmin.language,
            newAdmin.points,
            newAdmin.referral_code,
            newAdmin.saved_store_ids,
            newAdmin.created_at,
          ]
        );
        user = newAdmin;
      } else {
        return res.status(404).json({
          error: 'No account found with this email. Please click "Sign Up" or "Join as Customer" to register.',
        });
      }
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
        phone: user.phone || '',
        avatarUrl: user.avatar_url || '',
        language: user.language || 'en',
        points: user.points || 0,
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
  const { email, password, name, role, phone, businessName, referralCode } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and Full Name are required' });
  }

  try {
    const existing = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    }

    let initialPoints = role === 'CUSTOMER' ? 50 : 0;
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
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: role || 'CUSTOMER',
      phone: phone ? phone.trim() : null,
      avatar_url: null,
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

    // If registering as a merchant, also create a linked merchant store record
    if (role === 'MERCHANT' && businessName) {
      const merchantId = `mer_${Date.now()}`;
      await pool.query(
        `INSERT INTO merchants (id, user_id, business_name, business_type, owner_name, phone, email, address, district, city, latitude, longitude, logo_url, cover_url, description, rating, review_count, opening_hours, pickup_window_default, status, joined_date, food_categories)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         ON CONFLICT (id) DO NOTHING`,
        [
          merchantId,
          newUser.id,
          businessName.trim(),
          'Bakery',
          name.trim(),
          phone ? phone.trim() : '+855 12 000 000',
          email.trim().toLowerCase(),
          'Phnom Penh, Cambodia',
          'Boeung Keng Kang',
          'Phnom Penh',
          11.5564,
          104.9282,
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200',
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800',
          `Welcome to ${businessName.trim()} on RescueBite. Fresh daily surplus items available for pickup.`,
          5.0,
          0,
          '08:00 AM - 08:00 PM',
          '18:00 - 19:30',
          'APPROVED',
          new Date().toISOString().split('T')[0],
          JSON.stringify(['Bakery', 'Café']),
        ]
      );
    }

    res.json({
      token: `jwt_demo_${newUser.id}`,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        phone: newUser.phone || '',
        avatarUrl: '',
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

// Profile & Me
authRouter.get('/profile', async (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(req.currentUser);
});

authRouter.get('/me', async (req: AuthenticatedRequest, res) => {
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
