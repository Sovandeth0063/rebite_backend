/**
 * ============================================================================
 * File: src/routes/admin.routes.ts
 * Purpose: Platform Administration, Audit Logs, Reports & Notification Endpoints
 * Endpoints:
 *   - GET    /api/notifications          -> Retrieve user notifications
 *   - PUT    /api/notifications/:id/read -> Mark single notification as read
 *   - POST   /api/notifications/read-all -> Mark all user notifications as read
 *   - GET    /api/reports                -> List customer/merchant incident reports
 *   - POST   /api/reports                -> Submit new report
 *   - PUT    /api/reports/:id/status     -> Update report resolution status
 *   - GET    /api/admin/audit-logs       -> View administrative audit log entries
 *   - GET    /api/admin/config           -> Get platform settings (fees, commission, auto-approve)
 *   - PUT    /api/admin/config           -> Update platform settings
 *   - GET    /api/admin/admins           -> List administrator accounts
 *   - POST   /api/admin/admins           -> Create new administrator
 *   - DELETE /api/admin/admins/:id       -> Revoke administrator account
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';

export const adminRouter = Router();

// Notifications
adminRouter.get('/notifications', async (req: AuthenticatedRequest, res) => {
  const user = req.currentUser;
  try {
    const rows = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [
      user?.id || 'usr_customer',
    ]);
    res.json(
      rows.map((n) => ({
        id: n.id,
        userId: n.user_id,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.is_read,
        createdAt: n.created_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

adminRouter.put('/notifications/:id/read', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

adminRouter.post('/notifications/read-all', async (req: AuthenticatedRequest, res) => {
  const user = req.currentUser;
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [user?.id || 'usr_customer']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Reports
adminRouter.get('/reports', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM reports ORDER BY created_at DESC');
    res.json(
      rows.map((r) => ({
        id: r.id,
        reporterId: r.reporter_id,
        reporterType: r.reporter_type,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

adminRouter.post('/reports', async (req: AuthenticatedRequest, res) => {
  const { reporterType, targetType, targetId, reason } = req.body;
  const user = req.currentUser;
  const reportId = `rep_${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO reports (id, reporter_id, reporter_type, target_type, target_id, reason, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        reportId,
        user?.id || 'usr_customer',
        reporterType || 'CUSTOMER',
        targetType,
        targetId,
        reason,
        'PENDING',
        new Date().toISOString(),
      ]
    );
    res.status(201).json({ success: true, reportId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

adminRouter.put('/reports/:id/status', async (req: AuthenticatedRequest, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE reports SET status = $1 WHERE id = $2', [status, req.params.id]);
    recordAuditLog(req.currentUser, 'UPDATE_REPORT_STATUS', `Report: ${req.params.id}`, `Status changed to ${status}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report status' });
  }
});

// Audit Logs
adminRouter.get('/admin/audit-logs', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 50');
    res.json(
      rows.map((l) => ({
        id: l.id,
        adminId: l.admin_id,
        adminEmail: l.admin_email,
        action: l.action,
        target: l.target,
        details: l.details,
        timestamp: l.timestamp,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Platform Config
adminRouter.get('/admin/config', async (req, res) => {
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

adminRouter.put('/admin/config', async (req: AuthenticatedRequest, res) => {
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

// Admin Users
adminRouter.get('/admin/admins', async (req, res) => {
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

adminRouter.post('/admin/admins', async (req: AuthenticatedRequest, res) => {
  const { name, email, roleLevel } = req.body;
  const adminId = `adm_${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO admin_users (id, name, email, role_level, two_factor_enforced, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, name, email, roleLevel || 'SUPPORT_ADMIN', true, new Date().toISOString()]
    );
    recordAuditLog(req.currentUser, 'CREATE_ADMIN_USER', `Admin Account: ${email}`, `Created admin user for '${name}'`);
    res.status(201).json({ id: adminId, name, email, roleLevel, twoFactorEnforced: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

adminRouter.delete('/admin/admins/:id', async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query('DELETE FROM admin_users WHERE id = $1', [req.params.id]);
    recordAuditLog(req.currentUser, 'REVOKE_ADMIN_USER', `Admin ID: ${req.params.id}`, 'Admin access revoked');
    res.json({ success: true, message: 'Admin account revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke admin user' });
  }
});
