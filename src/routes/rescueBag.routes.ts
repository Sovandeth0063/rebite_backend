/**
 * ============================================================================
 * File: src/routes/rescueBag.routes.ts
 * Purpose: Rescue Food Bag Listings & Discovery Endpoints
 * Endpoints:
 *   - GET    /api/rescue-bags      -> Browse listings (filter by merchant, category, max price, text search)
 *   - GET    /api/rescue-bags/:id  -> Get detailed info for a specific rescue bag
 *   - POST   /api/rescue-bags      -> Create a new mystery / rescue food bag listing
 *   - PUT    /api/rescue-bags/:id  -> Update listing details, prices, or remaining quantity
 *   - DELETE /api/rescue-bags/:id  -> Remove or archive a listing
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';
import { asyncTranslateRescueBag } from '../services/translation.js';

export const rescueBagRouter = Router();

export const formatRescueBag = (b: any) => ({
    id: b.id,
    merchantId: b.merchant_id,
    merchantName: b.merchant_name,
    merchantLogo: b.merchant_logo,
    merchantRating: b.merchant_rating,
    merchantAddress: b.merchant_address,
    merchantLat: b.merchant_lat,
    merchantLng: b.merchant_lng,
    title: b.title,
    titleKm: b.title_km,
    title_en: b.title_en,
    title_km: b.title_km,
    description: b.description,
    description_en: b.description_en,
    description_km: b.description_km,
    sourceLanguage: b.source_language,
    translationStatus: b.translation_status,
    isMachineTranslated: b.is_machine_translated,
    category: b.category,
    imageUrl: b.image_url,
    originalPrice: parseFloat(b.original_price),
    rescuePrice: parseFloat(b.rescue_price),
    discountPercentage: b.discount_percentage,
    quantityRemaining: b.quantity_remaining,
    totalQuantity: b.total_quantity,
    pickupStart: b.pickup_start,
    pickupEnd: b.pickup_end,
    tags: b.tags || [],
    compositionTags: b.composition_tags || [],
    estimatedItemCount: b.estimated_item_count || '',
    dietaryTags: b.dietary_tags || [],
    allergenDisclaimer: b.allergen_disclaimer || '',
    allergens: b.allergens || [],
    ingredients: b.ingredients || [],
    storageInstructions: b.storage_instructions,
    minItems: b.min_items,
    maxItems: b.max_items,
    visibility: b.visibility,
    safetyConfirmed: b.safety_confirmed,
    hasAutoEscalatingDiscount: b.has_auto_escalating_discount,
    escalatedDiscountPercentage: b.escalated_discount_percentage,
    escalateMinutesBeforeEnd: b.escalate_minutes_before_end,
    createdAt: b.created_at,
});

// Get category composition presets
rescueBagRouter.get('/presets', async (req, res) => {
  const { businessType } = req.query;
  try {
    let sql = 'SELECT * FROM category_presets';
    const params: any[] = [];
    if (businessType) {
      params.push(businessType);
      sql += ' WHERE LOWER(business_type) = LOWER($1)';
    }
    sql += ' ORDER BY order_index ASC';
    const rows = await query(sql, params);
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        businessType: r.business_type,
        nameEn: r.name_en,
        nameKm: r.name_km,
        icon: r.icon,
        orderIndex: r.order_index,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

// Get all rescue bags
rescueBagRouter.get('/', async (req, res) => {
  const { merchantId, category, maxPrice, search, availableOnly } = req.query;
  try {
    let sql = 'SELECT * FROM rescue_bags WHERE 1=1';
    const params: any[] = [];

    if (merchantId) {
      params.push(merchantId);
      sql += ` AND merchant_id = $${params.length}`;
    }
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (maxPrice) {
      params.push(parseFloat(maxPrice as string));
      sql += ` AND rescue_price <= $${params.length}`;
    }
    if (availableOnly === 'true') {
      sql += ' AND quantity_remaining > 0 AND visibility = \'PUBLIC\'';
    }

    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, params);
    let bags = rows.map(formatRescueBag);

    if (search) {
      const q = (search as string).toLowerCase();
      bags = bags.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.merchantName.toLowerCase().includes(q)
      );
    }

    res.json(bags);
  } catch (err) {
    console.error('Error fetching rescue bags:', err);
    res.status(500).json({ error: 'Failed to fetch rescue bags' });
  }
});

// Get single rescue bag
rescueBagRouter.get('/:id', async (req, res) => {
  try {
    const b = await queryOne('SELECT * FROM rescue_bags WHERE id = $1', [req.params.id]);
    if (!b) {
      return res.status(404).json({ error: 'Rescue bag not found' });
    }
    res.json({
      id: b.id,
      merchantId: b.merchant_id,
      merchantName: b.merchant_name,
      merchantLogo: b.merchant_logo,
      merchantRating: b.merchant_rating,
      merchantAddress: b.merchant_address,
      merchantLat: b.merchant_lat,
      merchantLng: b.merchant_lng,
      title: b.title,
      titleKm: b.title_km,
      title_en: b.title_en,
      title_km: b.title_km,
      description: b.description,
      description_en: b.description_en,
      description_km: b.description_km,
      sourceLanguage: b.source_language,
      translationStatus: b.translation_status,
      isMachineTranslated: b.is_machine_translated,
      category: b.category,
      imageUrl: b.image_url,
      originalPrice: parseFloat(b.original_price),
      rescuePrice: parseFloat(b.rescue_price),
      discountPercentage: b.discount_percentage,
      quantityRemaining: b.quantity_remaining,
      totalQuantity: b.total_quantity,
      pickupStart: b.pickup_start,
      pickupEnd: b.pickup_end,
      allergens: b.allergens || [],
      ingredients: b.ingredients || [],
      storageInstructions: b.storage_instructions,
      minItems: b.min_items,
      maxItems: b.max_items,
      visibility: b.visibility,
      safetyConfirmed: b.safety_confirmed,
      hasAutoEscalatingDiscount: b.has_auto_escalating_discount,
      escalatedDiscountPercentage: b.escalated_discount_percentage,
      escalateMinutesBeforeEnd: b.escalate_minutes_before_end,
      createdAt: b.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rescue bag' });
  }
});

// Create rescue bag
rescueBagRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const data = req.body;
  const bagId = `bag_${Date.now()}`;

  try {
    const merchant = await queryOne('SELECT * FROM merchants WHERE id = $1', [data.merchantId || 'mer_paul']);

    const originalPrice = parseFloat(data.originalPrice) || 10.0;
    const rescuePrice = parseFloat(data.rescuePrice) || 3.5;

    if (originalPrice <= 0 || rescuePrice <= 0) {
      return res.status(400).json({ error: 'Prices must be greater than $0' });
    }
    if (rescuePrice >= originalPrice) {
      return res.status(400).json({ error: 'Rescue price must be less than normal retail price' });
    }

    const discount = Math.round(((originalPrice - rescuePrice) / originalPrice) * 100);
    if (discount < 40) {
      const maxAllowed = (originalPrice * 0.6).toFixed(2);
      return res.status(400).json({
        error: `Platform Rule: Rescue bags must offer at least 40% discount. Max allowed rescue price is $${maxAllowed} (currently ${discount}% discount).`,
      });
    }

    await pool.query(
      `INSERT INTO rescue_bags (id, merchant_id, merchant_name, merchant_logo, merchant_rating, merchant_address, merchant_lat, merchant_lng, title, title_en, title_km, description, description_en, description_km, category, image_url, original_price, rescue_price, discount_percentage, quantity_remaining, total_quantity, pickup_start, pickup_end, allergens, composition_tags, estimated_item_count, dietary_tags, allergen_disclaimer, ingredients, storage_instructions, min_items, max_items, visibility, safety_confirmed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)`,
      [
        bagId,
        merchant ? merchant.id : data.merchantId,
        merchant ? merchant.business_name : data.merchantName,
        merchant ? merchant.logo_url : data.merchantLogo || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200',
        merchant && merchant.rating ? parseFloat(merchant.rating) : 0.0,
        merchant ? merchant.address : 'Phnom Penh',
        merchant ? merchant.latitude : 11.5564,
        merchant ? merchant.longitude : 104.9282,
        data.title,
        data.title_en || data.title,
        data.title_km || null,
        data.description,
        data.description_en || data.description,
        data.description_km || null,
        data.category || merchant?.business_type || 'Bakery',
        data.imageUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600',
        originalPrice,
        rescuePrice,
        discount,
        parseInt(data.quantityRemaining || data.totalQuantity || '5', 10),
        parseInt(data.totalQuantity || '5', 10),
        data.pickupStart || '18:00',
        data.pickupEnd || '20:00',
        JSON.stringify(data.allergens || []),
        JSON.stringify(data.compositionTags || []),
        data.estimatedItemCount || '~3-4 items',
        JSON.stringify(data.dietaryTags || []),
        data.allergenDisclaimer || 'Packed in a kitchen that handles nuts, dairy, seafood and gluten.',
        JSON.stringify(data.ingredients || []),
        data.storageInstructions || 'Keep in cool dry place or refrigerate.',
        data.minItems || 2,
        data.maxItems || 5,
        'PUBLIC',
        true,
        new Date().toISOString(),
      ]
    );

    // Trigger async translation
    asyncTranslateRescueBag(bagId);

    const created = await queryOne('SELECT * FROM rescue_bags WHERE id = $1', [bagId]);
    res.status(201).json(formatRescueBag(created));
  } catch (err) {
    console.error('Error creating rescue bag:', err);
    res.status(500).json({ error: 'Failed to create rescue bag' });
  }
});

const handleUpdateRescueBag = async (req: any, res: any) => {
  const data = req.body;
  try {
    const existing = await queryOne('SELECT * FROM rescue_bags WHERE id = $1', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Rescue bag not found' });
    }

    const origPrice = data.originalPrice !== undefined ? parseFloat(data.originalPrice) : parseFloat(existing.original_price);
    const rescPrice = data.rescuePrice !== undefined ? parseFloat(data.rescuePrice) : parseFloat(existing.rescue_price);

    if (data.rescuePrice !== undefined || data.originalPrice !== undefined) {
      if (rescPrice >= origPrice) {
        return res.status(400).json({ error: 'Rescue price must be lower than original retail price' });
      }
      const discount = Math.round(((origPrice - rescPrice) / origPrice) * 100);
      if (discount < 40) {
        const maxAllowed = (origPrice * 0.6).toFixed(2);
        return res.status(400).json({
          error: `Platform Rule: Must be at least 40% discount. Max allowed rescue price is $${maxAllowed} (provided: $${rescPrice.toFixed(2)} = ${discount}% off).`,
        });
      }
    }

    const discountPct = Math.round(((origPrice - rescPrice) / origPrice) * 100);

    await pool.query(
      `UPDATE rescue_bags
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           rescue_price = COALESCE($3, rescue_price),
           original_price = COALESCE($4, original_price),
           discount_percentage = COALESCE($5, discount_percentage),
           quantity_remaining = COALESCE($6, quantity_remaining),
           visibility = COALESCE($7, visibility),
           composition_tags = COALESCE($8, composition_tags),
           estimated_item_count = COALESCE($9, estimated_item_count),
           dietary_tags = COALESCE($10, dietary_tags),
           allergen_disclaimer = COALESCE($11, allergen_disclaimer)
       WHERE id = $12`,
      [
        data.title,
        data.description,
        data.rescuePrice,
        data.originalPrice,
        discountPct,
        data.quantityRemaining,
        data.visibility,
        data.compositionTags ? JSON.stringify(data.compositionTags) : null,
        data.estimatedItemCount,
        data.dietaryTags ? JSON.stringify(data.dietaryTags) : null,
        data.allergenDisclaimer,
        req.params.id,
      ]
    );
    const updated = await queryOne('SELECT * FROM rescue_bags WHERE id = $1', [req.params.id]);
    res.json(formatRescueBag(updated));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update rescue bag' });
  }
};

rescueBagRouter.put('/:id', handleUpdateRescueBag);
rescueBagRouter.patch('/:id', handleUpdateRescueBag);

// Atomic staff stepper for surprise bags
rescueBagRouter.patch('/:id/quantity', async (req, res) => {
  const { delta = 1 } = req.body;
  const d = parseInt(delta, 10) || 0;
  try {
    const result = await pool.query(
      `UPDATE rescue_bags
       SET quantity_remaining = GREATEST(0, quantity_remaining + $1),
           visibility = CASE WHEN quantity_remaining + $1 <= 0 THEN 'SOLD_OUT' ELSE 'PUBLIC' END
       WHERE id = $2
       RETURNING *`,
      [d, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Rescue bag not found' });
    }

    const row = result.rows[0];
    res.json(formatRescueBag(row));
  } catch (err) {
    console.error('Error updating rescue bag quantity:', err);
    res.status(500).json({ error: 'Failed to update quantity' });
  }
});

// Delete rescue bag
rescueBagRouter.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM rescue_bags WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Rescue bag removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete rescue bag' });
  }
});
