/**
 * ============================================================================
 * File: src/routes/crud.routes.ts
 * Purpose: Universal Backend CRUD Operations & Database Studio API
 * Responsibilities:
 *   - Introspect PostgreSQL schemas, tables, and column data types
 *   - Execute Create, Read, Update, Delete (CRUD) operations on any table
 *   - Support searching, filtering, pagination, and SQL console queries
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';

export const crudRouter = Router();

// Allowed tables whitelist for safety
const ALLOWED_TABLES = [
  'users',
  'merchants',
  'rescue_bags',
  'orders',
  'reviews',
  'impact_stats',
  'audit_logs',
  'reports',
  'inventory',
  'ai_recommendations',
  'notifications',
  'customer_settings',
  'merchant_settings',
  'platform_config',
  'admin_users',
  'login_sessions',
];

function sanitizeTableName(name: string): string {
  const clean = name.toLowerCase().trim();
  if (!ALLOWED_TABLES.includes(clean)) {
    throw new Error(`Table '${name}' is not allowed or does not exist`);
  }
  return clean;
}

// 1. Get all tables with metadata and row counts
crudRouter.get('/tables', async (req, res) => {
  try {
    const tableMetadata = await Promise.all(
      ALLOWED_TABLES.map(async (tableName) => {
        // Get row count
        const countRes = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM "${tableName}"`);
        const rowCount = parseInt(countRes?.count || '0', 10);

        // Get column definitions
        const colRows = await query(
          `SELECT 
             column_name, 
             data_type, 
             is_nullable, 
             column_default
           FROM information_schema.columns 
           WHERE table_schema = 'public' AND table_name = $1 
           ORDER BY ordinal_position ASC`,
          [tableName]
        );

        // Get primary key
        const pkRow = await queryOne<{ column_name: string }>(
          `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY'
             AND tc.table_name = $1`,
          [tableName]
        );

        const primaryKey = pkRow?.column_name || 'id';

        return {
          name: tableName,
          rowCount,
          primaryKey,
          columns: colRows.map((c) => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === 'YES',
            defaultValue: c.column_default,
            isPrimary: c.column_name === primaryKey,
          })),
        };
      })
    );

    res.json(tableMetadata);
  } catch (err: any) {
    console.error('Error fetching table metadata:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch table metadata' });
  }
});

// 2. Read rows with pagination, search, and sorting
crudRouter.get(['/tables/:tableName', '/:tableName'], async (req, res) => {
  try {
    if (req.params.tableName === 'tables') return; // Handled by /tables route
    const tableName = sanitizeTableName(req.params.tableName);
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 500);
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const offset = req.query.offset !== undefined
      ? Math.max(parseInt((req.query.offset as string) || '0', 10), 0)
      : (page - 1) * limit;
    const search = (req.query.search as string) || '';
    const orderBy = (req.query.orderBy as string) || '';
    const orderDir = ((req.query.orderDir as string) || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Get columns to search across text fields
    const colRows = await query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );

    const pkRow = await queryOne<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_name = $1`,
      [tableName]
    );
    const primaryKey = pkRow?.column_name || 'id';

    let whereClause = '';
    const queryParams: any[] = [];

    if (search.trim()) {
      const textCols = colRows
        .filter((c) => ['character varying', 'text', 'character'].includes(c.data_type))
        .map((c) => `"${c.column_name}"::text ILIKE $1`);

      if (textCols.length > 0) {
        whereClause = `WHERE ${textCols.join(' OR ')}`;
        queryParams.push(`%${search.trim()}%`);
      }
    }

    // Count total matching
    const countSql = `SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`;
    const totalRes = await queryOne<{ count: string }>(countSql, queryParams);
    const totalRows = parseInt(totalRes?.count || '0', 10);

    // Sorting
    let sortSql = `ORDER BY "${primaryKey}" ASC`;
    if (orderBy && colRows.some((c) => c.column_name === orderBy)) {
      sortSql = `ORDER BY "${orderBy}" ${orderDir}`;
    }

    // Query rows
    const dataParams = [...queryParams, limit, offset];
    const dataSql = `SELECT * FROM "${tableName}" ${whereClause} ${sortSql} LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    const rows = await query(dataSql, dataParams);

    res.json({
      tableName,
      primaryKey,
      totalRows,
      total: totalRows,
      page,
      limit,
      offset,
      columns: colRows,
      rows,
      data: rows,
      pagination: {
        total: totalRows,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalRows / limit)),
      },
    });
  } catch (err: any) {
    console.error('CRUD read error:', err);
    res.status(500).json({ error: err.message || 'Failed to read table rows' });
  }
});

// 3. Create (Insert) a new row
crudRouter.post(['/tables/:tableName', '/:tableName'], async (req: AuthenticatedRequest, res) => {
  try {
    const tableName = sanitizeTableName(req.params.tableName);
    const data = req.body;

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Payload body is required' });
    }

    // Get column types to serialize JSONB fields properly
    const colRows = await query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );

    const validColMap = new Map(colRows.map((c) => [c.column_name, c.data_type]));

    const keys: string[] = [];
    const values: any[] = [];
    const placeholders: string[] = [];

    let paramIdx = 1;
    for (const [k, v] of Object.entries(data)) {
      if (validColMap.has(k)) {
        const colType = validColMap.get(k);
        keys.push(`"${k}"`);

        if (colType === 'jsonb' || colType === 'json') {
          values.push(typeof v === 'string' ? v : JSON.stringify(v));
        } else {
          values.push(v);
        }

        placeholders.push(`$${paramIdx++}`);
      }
    }

    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid table columns provided in body' });
    }

    const insertSql = `INSERT INTO "${tableName}" (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const inserted = await queryOne(insertSql, values);

    // Audit log
    await recordAuditLog(
      req.currentUser,
      'CRUD_INSERT',
      tableName,
      `Inserted new record in ${tableName}: ${JSON.stringify(inserted)}`
    );

    res.status(201).json({ success: true, row: inserted });
  } catch (err: any) {
    console.error('CRUD insert error:', err);
    res.status(500).json({ error: err.message || 'Failed to insert row' });
  }
});

// 4. Update an existing row by ID
crudRouter.put(['/tables/:tableName/:id', '/:tableName/:id'], async (req: AuthenticatedRequest, res) => {
  try {
    const tableName = sanitizeTableName(req.params.tableName);
    const rowId = req.params.id;
    const data = req.body;

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Payload body is required' });
    }

    // Get primary key
    const pkRow = await queryOne<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_name = $1`,
      [tableName]
    );
    const primaryKey = pkRow?.column_name || 'id';

    // Get column types
    const colRows = await query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    const validColMap = new Map(colRows.map((c) => [c.column_name, c.data_type]));

    const setClauses: string[] = [];
    const values: any[] = [];

    let paramIdx = 1;
    for (const [k, v] of Object.entries(data)) {
      if (k !== primaryKey && validColMap.has(k)) {
        const colType = validColMap.get(k);
        setClauses.push(`"${k}" = $${paramIdx++}`);

        if (colType === 'jsonb' || colType === 'json') {
          values.push(typeof v === 'string' ? v : JSON.stringify(v));
        } else {
          values.push(v);
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No editable columns provided' });
    }

    values.push(rowId);
    const updateSql = `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE "${primaryKey}"::text = $${paramIdx} RETURNING *`;
    const updated = await queryOne(updateSql, values);

    if (!updated) {
      return res.status(404).json({ error: `Record with ${primaryKey}=${rowId} not found in ${tableName}` });
    }

    await recordAuditLog(
      req.currentUser,
      'CRUD_UPDATE',
      `${tableName}:${rowId}`,
      `Updated record in ${tableName} (${primaryKey}=${rowId})`
    );

    res.json({ success: true, row: updated });
  } catch (err: any) {
    console.error('CRUD update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update row' });
  }
});

// 5. Delete a row by ID
crudRouter.delete(['/tables/:tableName/:id', '/:tableName/:id'], async (req: AuthenticatedRequest, res) => {
  try {
    const tableName = sanitizeTableName(req.params.tableName);
    const rowId = req.params.id;

    // Get primary key
    const pkRow = await queryOne<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_name = $1`,
      [tableName]
    );
    const primaryKey = pkRow?.column_name || 'id';

    const deleteSql = `DELETE FROM "${tableName}" WHERE "${primaryKey}"::text = $1 RETURNING *`;
    const deleted = await queryOne(deleteSql, [rowId]);

    if (!deleted) {
      return res.status(404).json({ error: `Record with ${primaryKey}=${rowId} not found in ${tableName}` });
    }

    await recordAuditLog(
      req.currentUser,
      'CRUD_DELETE',
      `${tableName}:${rowId}`,
      `Deleted record from ${tableName} (${primaryKey}=${rowId})`
    );

    res.json({ success: true, message: `Deleted record ${rowId} from ${tableName}`, deleted });
  } catch (err: any) {
    console.error('CRUD delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete row' });
  }
});

// 6. Execute direct SQL query console
crudRouter.post(['/query', '/query/sql'], async (req: AuthenticatedRequest, res) => {
  const sql = req.body.sql || req.body.query;
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'SQL query string is required' });
  }

  const startTime = Date.now();
  try {
    const queryResult = await pool.query(sql);
    const executionTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      command: queryResult.command,
      rowCount: queryResult.rowCount,
      fields: queryResult.fields?.map((f) => ({ name: f.name, dataTypeId: f.dataTypeID })),
      rows: queryResult.rows,
      executionTimeMs,
    });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'SQL Execution error',
      code: err.code,
      position: err.position,
    });
  }
});
