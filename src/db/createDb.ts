/**
 * ============================================================================
 * File: src/db/createDb.ts
 * Purpose: Automated PostgreSQL Database Creation & Provisioning
 * Responsibilities:
 *   - Connects to the default PostgreSQL root instance to check if the target database exists.
 *   - Automatically creates the database (e.g. 'rescuebite') if it does not yet exist.
 *   - Triggers setupDatabase() to ensure tables and seeds are properly loaded.
 * ============================================================================
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { setupDatabase } from './setup.js';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Client } = pg;

async function startLocalPostgresIfStopped(host: string, port: number) {
  const pgDataPath = path.resolve('pgdata');
  const pgExePath = 'C:\\Program Files\\PostgreSQL\\14\\bin\\postgres.exe';

  if (!fs.existsSync(pgExePath) || !fs.existsSync(pgDataPath)) {
    return;
  }

  // Remove stale pid file if postmaster process is dead
  const pidFile = path.join(pgDataPath, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pidContent = fs.readFileSync(pidFile, 'utf8');
      const pid = parseInt(pidContent.split('\n')[0], 10);
      let isAlive = false;
      try {
        process.kill(pid, 0);
        isAlive = true;
      } catch {
        isAlive = false;
      }
      if (!isAlive) {
        fs.unlinkSync(pidFile);
        console.log('[PostgreSQL] Removed stale postmaster.pid file.');
      }
    } catch {}
  }

  console.log(`[PostgreSQL] Attempting auto-start on local cluster (port ${port})...`);
  try {
    const child = spawn(pgExePath, ['-D', pgDataPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    // Wait for postgres to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (err: any) {
    console.warn(`[PostgreSQL] Auto-start attempt error: ${err.message}`);
  }
}

export async function ensureDatabaseAndSchema() {
  const host = process.env.PGHOST || 'localhost';
  const port = parseInt(process.env.PGPORT || '5432', 10);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || 'postgres';
  const targetDb = process.env.PGDATABASE || 'rescuebite';

  // 1. Connect to root 'postgres' db to ensure target database exists
  let rootClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    connectionTimeoutMillis: 3000,
  });

  try {
    await rootClient.connect();
  } catch (connectErr: any) {
    if (connectErr.code === 'ECONNREFUSED' || connectErr.message?.includes('ECONNREFUSED')) {
      await startLocalPostgresIfStopped(host, port);
      rootClient = new Client({
        host,
        port,
        user,
        password,
        database: 'postgres',
        connectionTimeoutMillis: 4000,
      });
      try {
        await rootClient.connect();
      } catch (retryErr: any) {
        console.warn(`[PostgreSQL] Could not connect to root db after auto-start: ${retryErr.message}`);
      }
    }
  }

  try {
    const checkDb = await rootClient.query('SELECT 1, pg_encoding_to_char(encoding) as enc FROM pg_database WHERE datname = $1', [targetDb]);
    if (checkDb.rows.length === 0) {
      console.log(`[PostgreSQL] Database "${targetDb}" not found. Creating database with UTF-8 encoding...`);
      await rootClient.query(`CREATE DATABASE "${targetDb}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
      console.log(`[PostgreSQL] Database "${targetDb}" created successfully with UTF-8 encoding.`);
    } else if (checkDb.rows[0].enc !== 'UTF8') {
      console.log(`[PostgreSQL] Database "${targetDb}" is in ${checkDb.rows[0].enc}. Recreating with UTF-8...`);
      await rootClient.query(`DROP DATABASE "${targetDb}" WITH (FORCE)`);
      await rootClient.query(`CREATE DATABASE "${targetDb}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
      console.log(`[PostgreSQL] Database "${targetDb}" recreated successfully with UTF-8.`);
    }
  } catch (err: any) {
    console.warn(`[PostgreSQL] Root DB check warning: ${err.message}`);
  } finally {
    try {
      await rootClient.end();
    } catch {}
  }

  // 2. Setup schema and seed
  await setupDatabase();
}

if (process.argv[1]?.endsWith('createDb.ts') || process.argv[1]?.endsWith('createDb.js')) {
  ensureDatabaseAndSchema()
    .then(() => {
      console.log('[PostgreSQL] Database setup and seed complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[PostgreSQL] Error during setup:', err);
      process.exit(1);
    });
}
