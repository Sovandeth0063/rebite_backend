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

dotenv.config();

const { Client } = pg;

export async function ensureDatabaseAndSchema() {
  const host = process.env.PGHOST || 'localhost';
  const port = parseInt(process.env.PGPORT || '3000', 10);
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || 'postgres';
  const targetDb = process.env.PGDATABASE || 'rescuebite';

  // 1. Connect to root 'postgres' db to ensure target database exists
  const rootClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });

  try {
    await rootClient.connect();
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
