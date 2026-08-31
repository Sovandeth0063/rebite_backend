/**
 * ============================================================================
 * File: src/config/db.ts
 * Purpose: PostgreSQL Database Connection & Query Pool
 * Responsibilities:
 *   - Configures and manages the pg.Pool connection pool to PostgreSQL.
 *   - Supports DATABASE_URL connection strings as well as individual PG* env vars.
 *   - Provides typed query helper functions (query, queryOne) with error logging.
 *   - Provides testConnection() for startup health checks.
 * ============================================================================
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'rescuebite',
      }
);

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected idle client error:', err);
});

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 50) {
      console.log(`[PostgreSQL] Query took ${duration}ms: ${text.slice(0, 80)}`);
    }
    return res.rows as T[];
  } catch (error) {
    console.error(`[PostgreSQL] Query error on: ${text}`, error);
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
    console.error('[PostgreSQL] Connection failed:', err.message);
    return false;
  }
}
