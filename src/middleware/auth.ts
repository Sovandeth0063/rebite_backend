/**
 * ============================================================================
 * File: src/middleware/auth.ts
 * Purpose: Authentication & Audit Logging Middleware
 * Responsibilities:
 *   - Extracts and verifies current user identity from the `x-user-id` header or demo session.
 *   - Attaches `req.currentUser` to express requests for role and authorization checks.
 *   - Provides recordAuditLog() utility for tracking admin actions in the `audit_logs` table.
 * ============================================================================
 */

import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db.js';
import { User } from '../types/index.js';

export interface AuthenticatedRequest extends Request {
  currentUser?: User;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userIdHeader = req.headers['x-user-id'] as string;
  try {
    if (userIdHeader && userIdHeader !== 'usr_guest') {
      const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userIdHeader]);
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        req.currentUser = {
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
        };
        return next();
      }
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
  }
  next();
}

export async function recordAuditLog(
  admin: User | undefined,
  action: string,
  target: string,
  details: string
) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, admin_id, admin_email, action, target, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        admin?.id || 'adm_system',
        admin?.email || 'admin@rescuebite.kh',
        action,
        target,
        details,
        new Date().toISOString(),
      ]
    );
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}
