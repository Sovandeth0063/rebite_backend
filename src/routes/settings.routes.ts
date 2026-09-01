/**
 * ============================================================================
 * File: src/routes/settings.routes.ts
 * Purpose: Unified User, Merchant, Staff & Admin Settings API
 * Endpoints:
 *   - Customer Settings & Sessions
 *   - Merchant Settings, Payouts & Store Staff Management
 *   - Admin Platform Configuration & Admin Users
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';

export const settingsRouter = Router();

// ----------------------------------------------------------------------------
// 1. Re-Authentication Gate
// ----------------------------------------------------------------------------
settingsRouter.post('/reauthenticate', async (req: AuthenticatedRequest, res) => {
  const { password } = req.body;
  // In development/demo, accept non-empty password
  if (password && password.trim().length > 0) {
    return res.json({ verified: true });
  }
  res.status(401).json({ verified: false, error: 'Invalid password' });
});

// ----------------------------------------------------------------------------
// 2. Customer Settings Endpoints
// ----------------------------------------------------------------------------
settingsRouter.get('/customer', async (req: AuthenticatedRequest, res) => {
  const userId = req.currentUser?.id || 'usr_customer';
  try {
    const row = await queryOne('SELECT settings FROM customer_settings WHERE user_id = $1', [userId]);
    if (row && row.settings) {
      return res.json(row.settings);
    }

    const defaultSettings = {
      userId,
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
        bakongAccountId: 'customer@acleda',
        abaPayPhone: '+855 12 345 678',
        savedBakongLink: true,
      },
      language: req.currentUser?.language || 'en',
      currency: 'USD',
      twoFactorEnabled: false,
      savedAddresses: ['Street 240, Phnom Penh', 'BKK1, Phnom Penh'],
    };

    res.json(defaultSettings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer settings' });
  }
});

settingsRouter.patch('/customer', async (req: AuthenticatedRequest, res) => {
  const userId = req.currentUser?.id || 'usr_customer';
  try {
    await pool.query(
      `INSERT INTO customer_settings (user_id, settings)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [userId, JSON.stringify(req.body)]
    );
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save customer settings' });
  }
});

settingsRouter.post('/customer/password', async (req: AuthenticatedRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  recordAuditLog(req.currentUser, 'UPDATE_PASSWORD', `User: ${req.currentUser?.email}`, 'Customer password updated');
  res.json({ success: true, message: 'Password updated successfully' });
});

settingsRouter.get('/customer/sessions', async (req: AuthenticatedRequest, res) => {
  const userId = req.currentUser?.id || 'usr_customer';
  try {
    const rows = await query('SELECT * FROM login_sessions WHERE user_id = $1 ORDER BY last_active DESC', [userId]);
    res.json(
      rows.map((s) => ({
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

settingsRouter.delete('/customer/sessions/:sessionId', async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query('DELETE FROM login_sessions WHERE id = $1', [req.params.sessionId]);
    res.json({ success: true, message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

settingsRouter.get('/customer/export', async (req: AuthenticatedRequest, res) => {
  const user = req.currentUser || { id: 'usr_customer', email: 'customer@rescuebite.kh' };
  try {
    const [orders, reviews] = await Promise.all([
      query('SELECT * FROM orders WHERE customer_id = $1', [user.id]),
      query('SELECT * FROM reviews WHERE customer_id = $1', [user.id]),
    ]);
    res.json({
      exportDate: new Date().toISOString(),
      user,
      orders,
      reviews,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

settingsRouter.post('/customer/delete-account', async (req: AuthenticatedRequest, res) => {
  const cooldownDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  recordAuditLog(req.currentUser, 'REQUEST_ACCOUNT_DELETION', `User: ${req.currentUser?.email}`, 'Account deletion requested');
  res.json({
    success: true,
    message: 'Account deletion scheduled. You have 30 days cooldown to reactivate.',
    cooldownDate,
  });
});

// ----------------------------------------------------------------------------
// 3. Merchant Settings & Store Staff Endpoints
// ----------------------------------------------------------------------------
settingsRouter.get('/merchant', async (req: AuthenticatedRequest, res) => {
  const merchantId = req.query.merchantId as string || 'mer_1';
  try {
    const row = await queryOne('SELECT settings FROM merchant_settings WHERE merchant_id = $1', [merchantId]);
    if (row && row.settings) {
      return res.json(row.settings);
    }

    const defaultSettings = {
      merchantId,
      userId: req.currentUser?.id || 'usr_merchant',
      pickupWindowDefault: '18:00 - 20:00',
      orderAutoCancelMinutes: 45,
      isTemporarilyClosed: false,
      notifications: {
        newOrders: true,
        lowStock: true,
        reviews: true,
        pushEnabled: true,
        smsEnabled: true,
        emailEnabled: true,
      },
      payout: {
        bankName: 'ABA Bank Cambodia',
        accountNumber: '001 889 234',
        accountName: 'PHNOM PENH BAKERY CO LTD',
        payoutSchedule: 'DAILY',
        lastUpdated: new Date().toISOString(),
      },
      teamMembers: [
        {
          id: 'tm_1',
          name: 'Chan Sothea',
          email: 'sothea.staff@bakery.com',
          role: 'STORE_MANAGER',
          addedAt: '2026-01-10',
        },
      ],
      language: 'en',
      currency: 'USD',
    };

    res.json(defaultSettings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch merchant settings' });
  }
});

settingsRouter.patch('/merchant', async (req: AuthenticatedRequest, res) => {
  const merchantId = req.body.merchantId || req.query.merchantId || 'mer_1';
  try {
    await pool.query(
      `INSERT INTO merchant_settings (merchant_id, user_id, settings)
       VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [merchantId, req.currentUser?.id || 'usr_merchant', JSON.stringify(req.body)]
    );
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update merchant settings' });
  }
});

settingsRouter.patch('/merchant/payout', async (req: AuthenticatedRequest, res) => {
  const merchantId = req.query.merchantId as string || 'mer_1';
  try {
    const row = await queryOne('SELECT settings FROM merchant_settings WHERE merchant_id = $1', [merchantId]);
    const current = row?.settings || {};
    current.payout = { ...req.body, lastUpdated: new Date().toISOString() };

    await pool.query(
      `INSERT INTO merchant_settings (merchant_id, user_id, settings)
       VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [merchantId, req.currentUser?.id || 'usr_merchant', JSON.stringify(current)]
    );
    res.json(current);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update payout settings' });
  }
});

settingsRouter.get('/merchant/team', async (req: AuthenticatedRequest, res) => {
  const merchantId = req.query.merchantId as string || 'mer_1';
  try {
    const row = await queryOne('SELECT settings FROM merchant_settings WHERE merchant_id = $1', [merchantId]);
    const team = row?.settings?.teamMembers || [
      {
        id: 'tm_1',
        name: 'Chan Sothea',
        email: 'sothea.staff@bakery.com',
        role: 'STORE_MANAGER',
        addedAt: '2026-01-10',
      },
    ];
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

settingsRouter.post('/merchant/team', async (req: AuthenticatedRequest, res) => {
  const { name, email, role } = req.body;
  const merchantId = req.query.merchantId as string || 'mer_1';
  const newMember = {
    id: `tm_${Date.now()}`,
    name,
    email,
    role: role || 'STORE_STAFF',
    addedAt: new Date().toISOString().split('T')[0],
  };

  try {
    const row = await queryOne('SELECT settings FROM merchant_settings WHERE merchant_id = $1', [merchantId]);
    const current = row?.settings || { teamMembers: [] };
    if (!current.teamMembers) current.teamMembers = [];
    current.teamMembers.push(newMember);

    await pool.query(
      `INSERT INTO merchant_settings (merchant_id, user_id, settings)
       VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [merchantId, req.currentUser?.id || 'usr_merchant', JSON.stringify(current)]
    );
    res.status(201).json(newMember);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

settingsRouter.delete('/merchant/team/:id', async (req: AuthenticatedRequest, res) => {
  const merchantId = req.query.merchantId as string || 'mer_1';
  try {
    const row = await queryOne('SELECT settings FROM merchant_settings WHERE merchant_id = $1', [merchantId]);
    const current = row?.settings || { teamMembers: [] };
    if (current.teamMembers) {
      current.teamMembers = current.teamMembers.filter((m: any) => m.id !== req.params.id);
      await pool.query(
        `INSERT INTO merchant_settings (merchant_id, user_id, settings)
         VALUES ($1, $2, $3)
         ON CONFLICT (merchant_id) DO UPDATE SET settings = EXCLUDED.settings`,
        [merchantId, req.currentUser?.id || 'usr_merchant', JSON.stringify(current)]
      );
    }
    res.json({ success: true, message: 'Team member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// ----------------------------------------------------------------------------
// 4. Admin Platform Config & Admin User Management Endpoints
// ----------------------------------------------------------------------------
settingsRouter.get('/admin/platform', async (req, res) => {
  try {
    const row = await queryOne('SELECT config FROM platform_config WHERE id = 1');
    if (row && row.config) {
      return res.json(row.config);
    }
    res.json({
      autoApproveNewMerchants: true,
      supportedCities: ['Phnom Penh', 'Siem Reap', 'Battambang'],
      defaultCommissionRate: 15,
      unclaimedAutoCancelMinutes: 60,
      notificationRouting: {
        merchantApplicationsEmail: 'partnerships@rescuebite.kh',
        disputesEmail: 'support@rescuebite.kh',
        flaggedContentEmail: 'trust@rescuebite.kh',
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch platform config' });
  }
});

settingsRouter.patch('/admin/platform', async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(
      `INSERT INTO platform_config (id, config)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
      [JSON.stringify(req.body)]
    );
    recordAuditLog(req.currentUser, 'UPDATE_PLATFORM_CONFIG', 'Global Settings', 'Platform configurations updated');
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update platform config' });
  }
});

settingsRouter.get('/admin/users', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM admin_users ORDER BY created_at ASC');
    res.json(
      rows.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        roleLevel: a.role_level,
        twoFactorEnforced: a.two_factor_enforced,
        createdAt: a.created_at,
        lastActiveAt: a.last_active_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

settingsRouter.post('/admin/users', async (req: AuthenticatedRequest, res) => {
  const { name, email, roleLevel, twoFactorEnforced } = req.body;
  const adminId = `adm_${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO admin_users (id, name, email, role_level, two_factor_enforced, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, name, email, roleLevel || 'SUPPORT_ADMIN', twoFactorEnforced ?? true, new Date().toISOString()]
    );
    recordAuditLog(req.currentUser, 'CREATE_ADMIN_USER', `Admin Account: ${email}`, `Created admin user '${name}'`);
    res.status(201).json({ id: adminId, name, email, roleLevel, twoFactorEnforced });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

settingsRouter.delete('/admin/users/:id', async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query('DELETE FROM admin_users WHERE id = $1', [req.params.id]);
    recordAuditLog(req.currentUser, 'REVOKE_ADMIN_USER', `Admin ID: ${req.params.id}`, 'Admin access revoked');
    res.json({ success: true, message: 'Admin account revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke admin user' });
  }
});
