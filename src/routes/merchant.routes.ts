/**
 * ============================================================================
 * File: src/routes/merchant.routes.ts
 * Purpose: Merchant Store & Inventory Management Endpoints
 * Endpoints:
 *   - GET    /api/merchants                  -> List all merchants (supports filter by status, city, category)
 *   - GET    /api/merchants/:id              -> Get details of a single merchant
 *   - POST   /api/merchants                  -> Create new merchant store profile
 *   - PUT    /api/merchants/:id/status       -> Update merchant status (APPROVED, REJECTED, SUSPENDED)
 *   - GET    /api/merchants/:id/inventory    -> List merchant inventory & surplus risk data
 *   - POST   /api/merchants/:id/inventory    -> Add inventory item for food surplus tracking
 *   - DELETE /api/merchants/:id/inventory/:itemId -> Delete inventory item
 *   - GET    /api/merchants/:id/settings     -> Get store payout & staff settings
 *   - PUT    /api/merchants/:id/settings     -> Update store settings
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';
import { asyncTranslateMerchant } from '../services/translation.js';

export const merchantRouter = Router();

// Get all merchants
merchantRouter.get('/', async (req, res) => {
  const { status, city, category } = req.query;
  try {
    let sql = 'SELECT * FROM merchants WHERE 1=1';
    const params: any[] = [];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (city) {
      params.push(city);
      sql += ` AND city = $${params.length}`;
    }

    sql += ' ORDER BY rating DESC, review_count DESC';
    const rows = await query(sql, params);

    const merchants = rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      businessName: m.business_name,
      businessName_en: m.business_name_en,
      businessName_km: m.business_name_km,
      businessType: m.business_type,
      ownerName: m.owner_name,
      phone: m.phone,
      email: m.email,
      address: m.address,
      district: m.district,
      city: m.city,
      latitude: m.latitude,
      longitude: m.longitude,
      logoUrl: m.logo_url,
      coverUrl: m.cover_url,
      description: m.description,
      description_en: m.description_en,
      description_km: m.description_km,
      sourceLanguage: m.source_language,
      translationStatus: m.translation_status,
      isMachineTranslated: m.is_machine_translated,
      rating: m.rating,
      reviewCount: m.review_count,
      openingHours: m.opening_hours,
      pickupWindowDefault: m.pickup_window_default,
      status: m.status,
      rejectionReason: m.rejection_reason,
      joinedDate: m.joined_date,
      foodCategories: m.food_categories || [],
    }));

    if (category) {
      const filtered = merchants.filter((m) =>
        m.foodCategories.includes(category as any) || m.businessType === category
      );
      return res.json(filtered);
    }

    res.json(merchants);
  } catch (err) {
    console.error('Error fetching merchants:', err);
    res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

// Get single merchant
merchantRouter.get('/:id', async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM merchants WHERE id = $1', [req.params.id]);
    if (!m) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    res.json({
      id: m.id,
      userId: m.user_id,
      businessName: m.business_name,
      businessName_en: m.business_name_en,
      businessName_km: m.business_name_km,
      businessType: m.business_type,
      ownerName: m.owner_name,
      phone: m.phone,
      email: m.email,
      address: m.address,
      district: m.district,
      city: m.city,
      latitude: m.latitude,
      longitude: m.longitude,
      logoUrl: m.logo_url,
      coverUrl: m.cover_url,
      description: m.description,
      description_en: m.description_en,
      description_km: m.description_km,
      sourceLanguage: m.source_language,
      translationStatus: m.translation_status,
      isMachineTranslated: m.is_machine_translated,
      rating: m.rating,
      reviewCount: m.review_count,
      openingHours: m.opening_hours,
      pickupWindowDefault: m.pickup_window_default,
      status: m.status,
      rejectionReason: m.rejection_reason,
      joinedDate: m.joined_date,
      foodCategories: m.food_categories || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch merchant' });
  }
});

// Create merchant
merchantRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const data = req.body;
  const merchantId = `mer_${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO merchants (id, user_id, business_name, business_name_en, business_name_km, business_type, owner_name, phone, email, address, district, city, latitude, longitude, logo_url, cover_url, description, rating, review_count, opening_hours, pickup_window_default, status, joined_date, food_categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        merchantId,
        req.currentUser?.id || data.userId || 'usr_merchant',
        data.businessName,
        data.businessName_en || data.businessName,
        data.businessName_km || null,
        data.businessType || 'Bakery',
        data.ownerName,
        data.phone,
        data.email,
        data.address,
        data.district || 'Chamkarmon',
        data.city || 'Phnom Penh',
        data.latitude || 11.5564,
        data.longitude || 104.9282,
        data.logoUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200',
        data.coverUrl || 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800',
        data.description,
        5.0,
        0,
        data.openingHours || '08:00 AM - 08:00 PM',
        data.pickupWindowDefault || '18:00 - 20:00',
        'APPROVED',
        new Date().toISOString().split('T')[0],
        JSON.stringify(data.foodCategories || [data.businessType || 'Bakery']),
      ]
    );

    // Trigger async translation in background
    asyncTranslateMerchant(merchantId);

    const created = await queryOne('SELECT * FROM merchants WHERE id = $1', [merchantId]);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Error creating merchant:', err);
    res.status(500).json({ error: 'Failed to create merchant' });
  }
});

// Update merchant profile (PATCH & PUT)
const handleUpdateMerchant = async (req: AuthenticatedRequest, res: any) => {
  const data = req.body;
  try {
    const existing = await queryOne('SELECT * FROM merchants WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    await pool.query(
      `UPDATE merchants
       SET business_name = COALESCE($1, business_name),
           business_type = COALESCE($2, business_type),
           owner_name = COALESCE($3, owner_name),
           phone = COALESCE($4, phone),
           email = COALESCE($5, email),
           address = COALESCE($6, address),
           district = COALESCE($7, district),
           city = COALESCE($8, city),
           logo_url = COALESCE($9, logo_url),
           cover_url = COALESCE($10, cover_url),
           description = COALESCE($11, description),
           opening_hours = COALESCE($12, opening_hours),
           pickup_window_default = COALESCE($13, pickup_window_default),
           food_categories = COALESCE($14, food_categories)
       WHERE id = $15`,
      [
        data.businessName,
        data.businessType,
        data.ownerName,
        data.phone,
        data.email,
        data.address,
        data.district,
        data.city,
        data.logoUrl,
        data.coverUrl,
        data.description,
        data.openingHours,
        data.pickupWindowDefault,
        data.foodCategories ? JSON.stringify(data.foodCategories) : null,
        req.params.id,
      ]
    );

    const updated = await queryOne('SELECT * FROM merchants WHERE id = $1', [req.params.id]);
    res.json({
      id: updated.id,
      userId: updated.user_id,
      businessName: updated.business_name,
      businessName_en: updated.business_name_en,
      businessName_km: updated.business_name_km,
      businessType: updated.business_type,
      ownerName: updated.owner_name,
      phone: updated.phone,
      email: updated.email,
      address: updated.address,
      district: updated.district,
      city: updated.city,
      latitude: updated.latitude,
      longitude: updated.longitude,
      logoUrl: updated.logo_url,
      coverUrl: updated.cover_url,
      description: updated.description,
      rating: updated.rating,
      reviewCount: updated.review_count,
      openingHours: updated.opening_hours,
      pickupWindowDefault: updated.pickup_window_default,
      status: updated.status,
      rejectionReason: updated.rejection_reason,
      joinedDate: updated.joined_date,
      foodCategories: updated.food_categories || [],
    });
  } catch (err: any) {
    console.error('Error updating merchant:', err);
    res.status(500).json({ error: 'Failed to update merchant profile' });
  }
};

merchantRouter.patch('/:id', handleUpdateMerchant);
merchantRouter.put('/:id', handleUpdateMerchant);

// Update merchant status (Admin) - Support PUT, PATCH, POST
const handleUpdateStatus = async (req: AuthenticatedRequest, res: any) => {
  const { status, rejectionReason, reason } = req.body;
  const finalReason = rejectionReason || reason;
  try {
    const existing = await queryOne('SELECT * FROM merchants WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    await pool.query(
      `UPDATE merchants
       SET status = $1, rejection_reason = $2
       WHERE id = $3`,
      [status, finalReason || null, req.params.id]
    );

    recordAuditLog(
      req.currentUser,
      `MERCHANT_${status}`,
      `Merchant: ${existing.business_name}`,
      `Status changed from ${existing.status} to ${status}. ${finalReason ? `Reason: ${finalReason}` : ''}`
    );

    const updated = await queryOne('SELECT * FROM merchants WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update merchant status' });
  }
};

merchantRouter.put('/:id/status', handleUpdateStatus);
merchantRouter.patch('/:id/status', handleUpdateStatus);
merchantRouter.post('/:id/status', handleUpdateStatus);

// Merchant Analytics & Revenue Recovery Breakdown (Lean Canvas Model)
merchantRouter.get('/:id/analytics', async (req, res) => {
  const merchantId = req.params.id;
  try {
    const [orders, merchant] = await Promise.all([
      query('SELECT * FROM orders WHERE merchant_id = $1', [merchantId]),
      queryOne('SELECT * FROM merchants WHERE id = $1', [merchantId]),
    ]);

    const completedOrders = orders.filter((o) => o.order_status === 'COMPLETED' || o.order_status === 'READY_FOR_PICKUP');
    const totalBagsSold = completedOrders.reduce((sum, o) => sum + (o.quantity || 1), 0);
    const grossRevenueUsd = completedOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total_price || '0'), 0);
    const commissionRate = 0.15; // 15% platform fee
    const commissionAmountUsd = parseFloat((grossRevenueUsd * commissionRate).toFixed(2));
    const netPayoutUsd = parseFloat((grossRevenueUsd - commissionAmountUsd).toFixed(2));
    const foodRescuedKg = parseFloat((totalBagsSold * 0.75).toFixed(1));
    const co2AvoidedKg = parseFloat((totalBagsSold * 1.8).toFixed(1));

    // Calculate customer repeat rate
    const customerMap = new Map<string, number>();
    completedOrders.forEach((o) => {
      customerMap.set(o.customer_id, (customerMap.get(o.customer_id) || 0) + 1);
    });
    const totalUniqueCustomers = customerMap.size;
    const repeatCustomers = Array.from(customerMap.values()).filter((cnt) => cnt > 1).length;
    const repeatRatePercentage = totalUniqueCustomers > 0 ? Math.round((repeatCustomers / totalUniqueCustomers) * 100) : 0;

    res.json({
      merchantId,
      merchantName: merchant?.business_name || 'Phnom Penh Partner Bakery',
      totalOrders: completedOrders.length,
      totalBagsSold,
      grossRevenueUsd,
      grossRevenueKhr: Math.round(grossRevenueUsd * 4100),
      commissionRatePercentage: 15,
      commissionAmountUsd,
      netPayoutUsd,
      netPayoutKhr: Math.round(netPayoutUsd * 4100),
      foodRescuedKg,
      co2AvoidedKg,
      totalUniqueCustomers,
      repeatRatePercentage,
      currencyRateKhr: 4100,
    });
  } catch (err: any) {
    console.error('Error fetching merchant analytics:', err);
    res.status(500).json({ error: 'Failed to fetch merchant analytics' });
  }
});

// Inventory
merchantRouter.get('/:id/inventory', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM inventory WHERE merchant_id = $1', [req.params.id]);
    res.json(
      rows.map((r) => ({
        id: r.id,
        merchantId: r.merchant_id,
        name: r.name,
        category: r.category,
        stockQuantity: r.stock_quantity,
        normalPrice: parseFloat(r.normal_price),
        expiryDate: r.expiry_date,
        expectedSales: r.expected_sales,
        surplusRisk: r.surplus_risk,
        recommendedAction: r.recommended_action,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

merchantRouter.post('/:id/inventory', async (req, res) => {
  const { name, category, stockQuantity, normalPrice, expiryDate, expectedSales, surplusRisk, recommendedAction } = req.body;
  const id = `inv_${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO inventory (id, merchant_id, name, category, stock_quantity, normal_price, expiry_date, expected_sales, surplus_risk, recommended_action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        req.params.id,
        name,
        category,
        stockQuantity,
        normalPrice,
        expiryDate,
        expectedSales,
        surplusRisk,
        recommendedAction,
      ]
    );
    res.status(201).json({
      id,
      merchantId: req.params.id,
      name,
      category,
      stockQuantity,
      normalPrice,
      expiryDate,
      expectedSales,
      surplusRisk,
      recommendedAction,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add inventory item' });
  }
});

merchantRouter.delete('/:id/inventory/:itemId', async (req, res) => {
  try {
    await pool.query('DELETE FROM inventory WHERE id = $1 AND merchant_id = $2', [
      req.params.itemId,
      req.params.id,
    ]);
    res.json({ success: true, message: 'Item removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Merchant Settings
merchantRouter.get('/:id/settings', async (req, res) => {
  try {
    const row = await queryOne('SELECT settings FROM merchant_settings WHERE merchant_id = $1', [req.params.id]);
    if (row && row.settings) {
      return res.json(row.settings);
    }

    const defaultSettings = {
      merchantId: req.params.id,
      userId: 'usr_merchant',
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
          name: 'Sok Dara',
          email: 'dara.staff@bakery.com',
          role: 'STORE_MANAGER',
          addedAt: '2026-01-10',
        },
      ],
      language: 'en',
      currency: 'USD',
    };
    res.json(defaultSettings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

merchantRouter.put('/:id/settings', async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(
      `INSERT INTO merchant_settings (merchant_id, user_id, settings)
       VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [req.params.id, req.currentUser?.id || 'usr_merchant', JSON.stringify(req.body)]
    );
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save merchant settings' });
  }
});
