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
import { exec, spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Client } = pg;

async function startLocalPostgresIfStopped(host: string, port: number) {
  const pgDataPath = path.resolve('pgdata');
  const pgCtlPath = 'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_ctl.exe';
  const pgExePath = 'C:\\Program Files\\PostgreSQL\\14\\bin\\postgres.exe';

  if (!fs.existsSync(pgDataPath)) {
    return;
  }

  // Pre-check if PostgreSQL is already responsive or starting up
  try {
    const testClient = new Client({
      host,
      port,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: 'postgres',
      connectionTimeoutMillis: 1000,
    });
    await testClient.connect();
    await testClient.end();
    // Already running and connected
    return;
  } catch (err: any) {
    if (err.message?.includes('the database system is starting up') || err.code === '57P03') {
      // Postgres is already starting up, do not spawn another instance
      return;
    }
  }

  console.log(`[PostgreSQL] Starting background database service on port ${port}...`);
  try {
    if (fs.existsSync(pgCtlPath)) {
      const child: any = spawn(pgCtlPath, ['-D', pgDataPath, 'start'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        creationFlags: 0x08000000, // CREATE_NO_WINDOW flag for Windows
      } as any);
      child?.unref?.();
    } else if (fs.existsSync(pgExePath)) {
      const child: any = spawn(pgExePath, ['-D', pgDataPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        creationFlags: 0x08000000, // CREATE_NO_WINDOW flag for Windows
      } as any);
      child?.unref?.();
    }
  } catch (err: any) {
    console.warn(`[PostgreSQL] Auto-start attempt error: ${err.message}`);
  }
}

async function connectWithRetry(
  clientConfig: pg.ClientConfig,
  maxRetries = 15,
  delayMs = 1000
): Promise<pg.Client> {
  let autoStartAttempted = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = new Client(clientConfig);
    try {
      await client.connect();
      // Test basic query to make sure database is ready to accept queries
      await client.query('SELECT 1');
      return client;
    } catch (err: any) {
      try {
        await client.end();
      } catch {}

      const msg = err.message || '';
      const isRefused = err.code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED');
      const isStartingUp = msg.includes('the database system is starting up') || err.code === '57P03';

      if (isRefused && !autoStartAttempted) {
        autoStartAttempted = true;
        await startLocalPostgresIfStopped(
          (clientConfig.host as string) || 'localhost',
          (clientConfig.port as number) || 5432
        );
      }

      if (attempt < maxRetries) {
        if (isStartingUp) {
          console.log(`[PostgreSQL] Database system is initializing/starting up... waiting (attempt ${attempt}/${maxRetries})`);
        } else if (isRefused) {
          console.log(`[PostgreSQL] Waiting for database cluster on port ${clientConfig.port}... (attempt ${attempt}/${maxRetries})`);
        }
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error('PostgreSQL connection timed out waiting for server readiness');
}

export async function ensureDatabaseAndSchema() {
  const host = process.env.PGHOST || 'localhost';
  const port = parseInt(process.env.PGPORT || '5432', 10);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || 'postgres';
  const targetDb = process.env.PGDATABASE || 'rescuebite';

  // 1. Connect to root 'postgres' db with retry to ensure target database exists
  let rootClient: pg.Client | null = null;
  try {
    rootClient = await connectWithRetry({
      host,
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 3000,
    });

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
    if (rootClient) {
      try {
        await rootClient.end();
      } catch {}
    }
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
