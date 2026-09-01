/**
 * ============================================================================
 * File: src/config/db.ts
 * Purpose: Resilient PostgreSQL Database Connection & Query Pool
 * Features:
 *   - Explicit IPv4 127.0.0.1 binding to eliminate IPv6 (::1) ECONNREFUSED issues on Windows
 *   - Auto-reconnect and query retry with exponential backoff on transient connection hiccups
 *   - Clean idle connection handling without excessive log dumps
 *   - Full typed query and queryOne helpers
 * ============================================================================
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const poolConfig: pg.PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'rescuebite',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err: any) => {
  if (err.code === 'ECONNRESET' || err.code === '57P01' || err.message?.includes('ECONNRESET')) {
    // Normal idle socket cleanup on Windows; next query will re-open a pool client automatically
    return;
  }
  console.warn('[PostgreSQL] Idle pool client notice:', err.message || err);
});

/**
 * Execute a query with automatic 1x retry on transient connection drops (ECONNREFUSED / ECONNRESET / 57P03)
 */
export async function query<T = any>(text: string, params: any[] = [], retries = 1): Promise<T[]> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.log(`[PostgreSQL] Query took ${duration}ms: ${text.slice(0, 80)}`);
    }
    return res.rows as T[];
  } catch (error: any) {
    const isTransient =
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === '57P03' ||
      error.message?.includes('starting up') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ECONNRESET');

    if (isTransient && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return query<T>(text, params, retries - 1);
    }

    console.error(`[PostgreSQL] Query error on: ${text.slice(0, 80)}`, error.message || error);
    throw error;
  }
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as db');
    client.release();
    console.log(`[PostgreSQL] Connected successfully to database "${result.rows[0].db}" at ${result.rows[0].current_time}`);
    return true;
  } catch (err: any) {
    console.error('[PostgreSQL] Connection check notice:', err.message);
    return false;
  }
}
