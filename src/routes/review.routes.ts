/**
 * ============================================================================
 * File: src/routes/review.routes.ts
 * Purpose: Customer Reviews & Merchant Rating Endpoints
 * Endpoints:
 *   - GET  /api/reviews  -> Fetch reviews (optionally filtered by merchantId)
 *   - POST /api/reviews  -> Submit a rating & review for completed orders, recalculates store average rating
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { asyncTranslateReview } from '../services/translation.js';

export const reviewRouter = Router();

// Get reviews
reviewRouter.get('/', async (req, res) => {
  const { merchantId } = req.query;
  try {
    let sql = 'SELECT * FROM reviews';
    const params: any[] = [];
    if (merchantId) {
      params.push(merchantId);
      sql += ' WHERE merchant_id = $1';
    }
    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, params);

    res.json(
      rows.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        merchantId: r.merchant_id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        customerAvatar: r.customer_avatar,
        rating: r.rating,
        comment: r.comment,
        comment_en: r.comment_en,
        comment_km: r.comment_km,
        sourceLanguage: r.source_language,
        translationStatus: r.translation_status,
        isMachineTranslated: r.is_machine_translated,
        foodQualityRating: r.food_quality_rating,
        valueRating: r.value_rating,
        pickupExperienceRating: r.pickup_experience_rating,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Create review
reviewRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const { orderId, merchantId, rating, comment, foodQualityRating, valueRating, pickupExperienceRating } = req.body;
  const user = req.currentUser || { id: 'usr_customer', name: 'Dara Sok' };
  const reviewId = `rev_${Date.now()}`;

  try {
    await pool.query(
      `INSERT INTO reviews (id, order_id, merchant_id, customer_id, customer_name, customer_avatar, rating, comment, food_quality_rating, value_rating, pickup_experience_rating, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        reviewId,
        orderId || 'ord_demo_1',
        merchantId,
        user.id,
        user.name,
        (user as any).avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        rating || 5,
        comment || 'Great experience saving food with RescueBite!',
        foodQualityRating || rating || 5,
        valueRating || rating || 5,
        pickupExperienceRating || rating || 5,
        new Date().toISOString(),
      ]
    );

    // Mark order as reviewed
    if (orderId) {
      await pool.query('UPDATE orders SET review_given = TRUE WHERE id = $1', [orderId]);
    }

    // Update merchant rating
    const ratingStats = await queryOne<{ avg_rating: string; cnt: string }>(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE merchant_id = $1',
      [merchantId]
    );
    if (ratingStats) {
      await pool.query(
        'UPDATE merchants SET rating = ROUND($1::numeric, 1), review_count = $2 WHERE id = $3',
        [parseFloat(ratingStats.avg_rating || '5.0'), parseInt(ratingStats.cnt || '1', 10), merchantId]
      );
    }

    // Trigger async translation
    asyncTranslateReview(reviewId);

    const created = await queryOne('SELECT * FROM reviews WHERE id = $1', [reviewId]);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});
