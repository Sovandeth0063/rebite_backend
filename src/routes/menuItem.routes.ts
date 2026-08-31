/**
 * ============================================================================
 * File: src/routes/menuItem.routes.ts
 * Purpose: Merchant Reusable Menu Items Catalogue Endpoints
 * Responsibilities:
 *   - CRUD operations for standard menu items that merchants discount at end of day.
 *   - Ownership enforcement using AuthenticatedRequest (req.currentUser).
 *   - Filters soft-deleted items (is_active = TRUE).
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const menuItemRouter = Router();

// 1. GET /api/menu-items?merchantId=X - Fetch merchant's active catalogue items
menuItemRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const { merchantId } = req.query;

  try {
    let sql = 'SELECT * FROM menu_items WHERE is_active = TRUE';
    const params: any[] = [];

    if (merchantId) {
      params.push(merchantId);
      sql += ` AND merchant_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at ASC';

    const rows = await query(sql, params);
    res.json(
      rows.map((r) => ({
        id: r.id,
        merchantId: r.merchant_id,
        name: r.name,
        nameKm: r.name_km,
        category: r.category,
        basePrice: parseFloat(r.base_price),
        imageUrl: r.image_url,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  } catch (err) {
    console.error('Error fetching menu items:', err);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// 2. POST /api/menu-items - Create new catalogue item
menuItemRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const data = req.body;
  const itemId = `menu_item_${Date.now()}`;

  try {
    let merchantId = data.merchantId;
    if (!merchantId && req.currentUser?.id) {
      const m = await queryOne('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      if (m) merchantId = m.id;
    }
    if (!merchantId) {
      merchantId = 'mer_labrioche';
    }

    const basePrice = parseFloat(data.basePrice);
    if (isNaN(basePrice) || basePrice <= 0) {
      return res.status(400).json({ error: 'Base price must be greater than $0' });
    }

    if (!data.name || data.name.trim().length < 2) {
      return res.status(400).json({ error: 'Item name must be at least 2 characters' });
    }

    await pool.query(
      `INSERT INTO menu_items (id, merchant_id, name, name_km, category, base_price, image_url, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, CURRENT_TIMESTAMP)`,
      [
        itemId,
        merchantId,
        data.name.trim(),
        data.nameKm ? data.nameKm.trim() : null,
        data.category || 'Bakery',
        basePrice,
        data.imageUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400',
      ]
    );

    const created = await queryOne('SELECT * FROM menu_items WHERE id = $1', [itemId]);
    res.status(201).json({
      id: created.id,
      merchantId: created.merchant_id,
      name: created.name,
      nameKm: created.name_km,
      category: created.category,
      basePrice: parseFloat(created.base_price),
      imageUrl: created.image_url,
      isActive: created.is_active,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    });
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

// 3. PATCH /api/menu-items/:id - Update catalogue item with ownership check
menuItemRouter.patch('/:id', async (req: AuthenticatedRequest, res) => {
  const data = req.body;

  try {
    const existing = await queryOne('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    // Ownership check (if authenticated as merchant or admin)
    if (req.currentUser && req.currentUser.role === 'MERCHANT') {
      const merchant = await queryOne('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      if (merchant && merchant.id !== existing.merchant_id) {
        return res.status(403).json({ error: 'Forbidden: you do not own this menu item' });
      }
    }

    const basePrice = data.basePrice !== undefined ? parseFloat(data.basePrice) : undefined;
    if (basePrice !== undefined && (isNaN(basePrice) || basePrice <= 0)) {
      return res.status(400).json({ error: 'Base price must be greater than $0' });
    }

    await pool.query(
      `UPDATE menu_items
       SET name = COALESCE($1, name),
           name_km = COALESCE($2, name_km),
           category = COALESCE($3, category),
           base_price = COALESCE($4, base_price),
           image_url = COALESCE($5, image_url),
           is_active = COALESCE($6, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        data.name ? data.name.trim() : null,
        data.nameKm !== undefined ? data.nameKm : null,
        data.category || null,
        basePrice !== undefined ? basePrice : null,
        data.imageUrl || null,
        data.isActive !== undefined ? data.isActive : null,
        req.params.id,
      ]
    );

    const updated = await queryOne('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
    res.json({
      id: updated.id,
      merchantId: updated.merchant_id,
      name: updated.name,
      nameKm: updated.name_km,
      category: updated.category,
      basePrice: parseFloat(updated.base_price),
      imageUrl: updated.image_url,
      isActive: updated.is_active,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  } catch (err) {
    console.error('Error updating menu item:', err);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// 4. DELETE /api/menu-items/:id - Soft-delete menu item with ownership check
menuItemRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await queryOne('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    // Ownership check
    if (req.currentUser && req.currentUser.role === 'MERCHANT') {
      const merchant = await queryOne('SELECT id FROM merchants WHERE user_id = $1', [req.currentUser.id]);
      if (merchant && merchant.id !== existing.merchant_id) {
        return res.status(403).json({ error: 'Forbidden: you do not own this menu item' });
      }
    }

    // Soft delete so historical live_listings reference stays valid
    await pool.query('UPDATE menu_items SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Menu item soft-deleted' });
  } catch (err) {
    console.error('Error deleting menu item:', err);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});
