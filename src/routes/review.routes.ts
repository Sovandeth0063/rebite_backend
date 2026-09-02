/**
 * ============================================================================
 * File: src/routes/review.routes.ts
 * Purpose: Customer Reviews, Anti-Manipulation Gating & TrueBayes Ratings
 * Endpoints:
 *   - GET   /api/reviews                  -> List verified reviews
 *   - POST  /api/reviews                  -> Verified purchase review submission with TrueBayes recalculation
 *   - POST  /api/reviews/:id/reply        -> Merchant public reply
 *   - POST  /api/reviews/:id/flag         -> Report / flag review (rate-limited)
 *   - PATCH /api/reviews/:id/moderate     -> Admin moderation action
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';
import { asyncTranslateReview } from '../services/translation.js';

export const reviewRouter = Router();

/**
 * Single-Layer Sanitization Helper:
 * Strips dangerous HTML/script tags while preserving clean UTF-8 plain text.
 * Display escaping is handled by React JSX on the frontend.
 */
function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/**
 * Lightweight Soft Pre-Filter:
 * Screens for blatant abuse, harassment, or spam patterns.
 * Non-blocking: routes to moderation queue rather than hard rejection.
 */
function detectSpamOrAbuse(text: string): boolean {
  if (!text) return false;
  const spamRegex = /\b(https?:\/\/|www\.|\.ru|\.xyz|viagra|casino|crypto\s*airdrop|free\s*bitcoin)\b/i;
  const harassmentRegex = /\b(scam artist|kill yourself|die in a fire|terrorist|fu+ck\s*you|b+i+tch)\b/i;
  return spamRegex.test(text) || harassmentRegex.test(text);
}

function formatReview(r: any) {
  if (!r) return null;
  return {
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
    merchantReply: r.merchant_reply,
    merchantRepliedAt: r.merchant_replied_at,
    consumedInWindow: r.consumed_in_window !== false,
    isFlagged: !!r.is_flagged,
    flagReason: r.flag_reason,
    moderationStatus: r.moderation_status || 'APPROVED',
    createdAt: r.created_at,
  };
}

// 1. GET /api/reviews - List reviews
reviewRouter.get('/', async (req, res) => {
  const { merchantId, includeHidden } = req.query;
  try {
    let sql = 'SELECT r.*, o.order_status FROM reviews r LEFT JOIN orders o ON r.order_id = o.id WHERE 1=1';
    const params: any[] = [];

    if (!includeHidden) {
      sql += ' AND r.is_hidden = FALSE';
    }

    if (merchantId) {
      params.push(merchantId);
      sql += ` AND r.merchant_id = $${params.length}`;
    }

    sql += ' ORDER BY r.created_at DESC';
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
        merchantReply: r.merchant_reply,
        merchantRepliedAt: r.merchant_replied_at,
        consumedInWindow: r.consumed_in_window !== false,
        isFlagged: !!r.is_flagged,
        flagReason: r.flag_reason,
        moderationStatus: r.moderation_status || 'APPROVED',
        isSuspiciousIp: !!r.is_suspicious_ip,
        isVerifiedPurchase: r.order_status === 'COMPLETED',
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// 2. POST /api/reviews - Submit verified customer review
reviewRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const {
    orderId,
    merchantId,
    rating,
    comment,
    foodQualityRating,
    valueRating,
    pickupExperienceRating,
    consumedInWindow,
  } = req.body;

  const user = req.currentUser || { id: 'usr_customer', name: 'Verified Customer', role: 'CUSTOMER' as const };
  const reviewId = `rev_${Date.now()}`;

  // 1. Mandatory Order ID Gating
  if (!orderId) {
    return res.status(400).json({ error: 'Review must be tied to a verified Order ID.' });
  }

  try {
    // 2. Verified Purchase & Completion Check
    const order = await queryOne<any>('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (order.order_status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Reviews are only permitted for completed, picked-up orders.' });
    }

    if (order.customer_id && user?.id && order.customer_id !== user.id && (user as any).role !== 'ADMIN' && order.customer_id !== 'usr_customer') {
      return res.status(403).json({ error: 'You can only submit a review for your own order.' });
    }

    // 3. Review Window Check (14 days post-order)
    const orderDate = new Date(order.updated_at || order.created_at).getTime();
    const now = Date.now();
    const daysSinceOrder = (now - orderDate) / (1000 * 60 * 60 * 24);
    if (daysSinceOrder > 14) {
      return res.status(400).json({ error: 'The 14-day review window for this order has expired.' });
    }

    // 4. Anti-Self-Farming Check (Merchant cannot rate own store)
    const effectiveMerchantId = merchantId || order.merchant_id;
    const merchant = await queryOne<any>('SELECT * FROM merchants WHERE id = $1', [effectiveMerchantId]);
    if (merchant && merchant.user_id === user.id) {
      return res.status(403).json({ error: 'Merchants are not permitted to review their own store.' });
    }

    // 5. IP Conflict Risk Flag (Audit signal, not hard block)
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const recentMerchantSessions = merchant?.user_id
      ? await query('SELECT ip_address FROM login_sessions WHERE user_id = $1 LIMIT 5', [merchant.user_id])
      : [];
    const isSuspiciousIp = recentMerchantSessions.some((s) => s.ip_address === clientIp);

    // 6. Rate Limit (Max 5 reviews per customer per 24 hours)
    const recent24hReviews = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM reviews WHERE customer_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [user.id]
    );
    if (recent24hReviews && parseInt(recent24hReviews.cnt, 10) >= 5) {
      return res.status(429).json({ error: 'Daily review limit reached (maximum 5 reviews per 24 hours).' });
    }

    // 7. Sanitization & Soft Regex Pre-Filter
    const rawComment = comment || 'Great experience rescuing food with RescueBite!';
    const sanitizedComment = sanitizeText(rawComment);
    const isFlaggedByPreFilter = detectSpamOrAbuse(sanitizedComment);
    const moderationStatus = isFlaggedByPreFilter ? 'PENDING_MODERATION' : 'APPROVED';
    const isHidden = isFlaggedByPreFilter;

    const overallRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const foodScore = foodQualityRating ? Math.max(1, Math.min(5, parseInt(foodQualityRating, 10))) : overallRating;
    const valueScore = valueRating ? Math.max(1, Math.min(5, parseInt(valueRating, 10))) : overallRating;
    const pickupScore = pickupExperienceRating ? Math.max(1, Math.min(5, parseInt(pickupExperienceRating, 10))) : overallRating;

    // 8. Database Insert / Update (Idempotent per Order)
    const existingReview = await queryOne('SELECT * FROM reviews WHERE order_id = $1', [orderId]);
    if (existingReview) {
      await pool.query(
        `UPDATE reviews 
         SET rating = $1, comment = $2, food_quality_rating = $3, value_rating = $4, pickup_experience_rating = $5, consumed_in_window = $6
         WHERE id = $7`,
        [overallRating, sanitizedComment, foodScore, valueScore, pickupScore, consumedInWindow !== false, existingReview.id]
      );
      await pool.query('UPDATE orders SET review_given = TRUE WHERE id = $1', [orderId]);
      const updated = await queryOne('SELECT * FROM reviews WHERE id = $1', [existingReview.id]);
      return res.status(200).json(formatReview(updated));
    }

    await pool.query(
      `INSERT INTO reviews (
        id, order_id, merchant_id, customer_id, customer_name, customer_avatar,
        rating, comment, food_quality_rating, value_rating, pickup_experience_rating,
        consumed_in_window, is_suspicious_ip, moderation_status, is_hidden, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)`,
      [
        reviewId,
        orderId,
        effectiveMerchantId,
        user.id,
        user.name || 'Verified Customer',
        (user as any).avatarUrl || null,
        overallRating,
        sanitizedComment,
        foodScore,
        valueScore,
        pickupScore,
        consumedInWindow !== false,
        isSuspiciousIp,
        moderationStatus,
        isHidden,
      ]
    );

    // Mark order as reviewed
    await pool.query('UPDATE orders SET review_given = TRUE WHERE id = $1', [orderId]);

    // 9. TrueBayes Rating Recalculation (m = 10, Prior C = 4.8)
    const ratingStats = await queryOne<{ avg_rating: string; cnt: string }>(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE merchant_id = $1 AND is_hidden = FALSE',
      [effectiveMerchantId]
    );

    if (ratingStats && ratingStats.cnt) {
      const v = parseInt(ratingStats.cnt, 10);
      const rawAvg = parseFloat(ratingStats.avg_rating || '5.0');
      const m = 10;
      const C = 4.8;
      const bayesianRating = v > 0 ? (v * rawAvg + m * C) / (v + m) : 0.0;
      const roundedRaw = parseFloat(rawAvg.toFixed(1));
      const roundedBayesian = parseFloat(bayesianRating.toFixed(2));

      await pool.query(
        'UPDATE merchants SET rating = $1, review_count = $2, bayesian_rating = $3 WHERE id = $4',
        [roundedRaw, v, roundedBayesian, effectiveMerchantId]
      );
      await pool.query(
        'UPDATE rescue_bags SET merchant_rating = $1, bayesian_rating = $2 WHERE merchant_id = $3',
        [roundedRaw, roundedBayesian, effectiveMerchantId]
      );
    }

    // Trigger async translation
    asyncTranslateReview(reviewId);

    const created = await queryOne('SELECT * FROM reviews WHERE id = $1', [reviewId]);
    res.status(201).json(created);
  } catch (err: any) {
    // Catch PostgreSQL 23505 Unique Constraint Violation cleanly
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already submitted a review for this order.' });
    }
    console.error('Error creating review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// 3. POST /api/reviews/:id/reply - Merchant Public Response
reviewRouter.post('/:id/reply', async (req: AuthenticatedRequest, res) => {
  const { replyText } = req.body;
  const user = req.currentUser;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!replyText || replyText.trim().length < 3) {
    return res.status(400).json({ error: 'Reply text must be at least 3 characters.' });
  }

  try {
    const review = await queryOne<any>('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Ownership check: must be owner of the merchant store or admin
    if (user.role !== 'ADMIN') {
      const merchant = await queryOne<any>('SELECT * FROM merchants WHERE id = $1', [review.merchant_id]);
      if (!merchant || merchant.user_id !== user.id) {
        return res.status(403).json({ error: 'Only the store owner can reply to this review.' });
      }
    }

    // Single-reply limit
    if (review.merchant_reply) {
      return res.status(400).json({ error: 'A merchant reply has already been published for this review.' });
    }

    const sanitizedReply = sanitizeText(replyText);
    const hasAbuse = detectSpamOrAbuse(sanitizedReply);
    if (hasAbuse) {
      return res.status(400).json({ error: 'Reply contains inappropriate language or prohibited links.' });
    }

    await pool.query(
      `UPDATE reviews
       SET merchant_reply = $1, merchant_replied_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [sanitizedReply, req.params.id]
    );

    const updated = await queryOne('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err: any) {
    console.error('Error posting merchant reply:', err);
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

// 4. POST /api/reviews/:id/flag - Report / Flag Review (Rate-limited)
reviewRouter.post('/:id/flag', async (req: AuthenticatedRequest, res) => {
  const { reason } = req.body;
  const user = req.currentUser;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Rate limit: Max 3 flags per 24 hours per user
    const recentFlags = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM reviews WHERE flagger_id = $1 AND is_flagged = TRUE AND created_at > NOW() - INTERVAL '24 hours'`,
      [user.id]
    );
    if (recentFlags && parseInt(recentFlags.cnt, 10) >= 3) {
      return res.status(429).json({ error: 'Report limit reached (maximum 3 reports per 24 hours).' });
    }

    const sanitizedReason = sanitizeText(reason || 'Content policy violation');

    await pool.query(
      `UPDATE reviews
       SET is_flagged = TRUE,
           flag_reason = $1,
           flagger_id = $2,
           moderation_status = 'FLAGGED'
       WHERE id = $3`,
      [sanitizedReason, user.id, req.params.id]
    );

    res.json({ message: 'Review reported successfully. Our moderation team will investigate.' });
  } catch (err: any) {
    console.error('Error flagging review:', err);
    res.status(500).json({ error: 'Failed to flag review' });
  }
});

// 5. PATCH /api/reviews/:id/moderate - Admin Moderation Action
reviewRouter.patch('/:id/moderate', async (req: AuthenticatedRequest, res) => {
  const { action } = req.body; // 'APPROVE' | 'HIDE' | 'DISMISS_FLAG'
  const user = req.currentUser;

  if (!user || user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    if (action === 'HIDE') {
      await pool.query(
        `UPDATE reviews SET is_hidden = TRUE, moderation_status = 'HIDDEN_BY_ADMIN' WHERE id = $1`,
        [req.params.id]
      );
    } else if (action === 'APPROVE') {
      await pool.query(
        `UPDATE reviews SET is_hidden = FALSE, is_flagged = FALSE, moderation_status = 'APPROVED' WHERE id = $1`,
        [req.params.id]
      );
    } else if (action === 'DISMISS_FLAG') {
      await pool.query(
        `UPDATE reviews SET is_flagged = FALSE, moderation_status = 'APPROVED' WHERE id = $1`,
        [req.params.id]
      );
    }

    // Recompute merchant rating excluding hidden reviews
    const review = await queryOne<any>('SELECT merchant_id FROM reviews WHERE id = $1', [req.params.id]);
    if (review) {
      const stats = await queryOne<{ avg_rating: string; cnt: string }>(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE merchant_id = $1 AND is_hidden = FALSE',
        [review.merchant_id]
      );
      const v = parseInt(stats?.cnt || '0', 10);
      const rawAvg = parseFloat(stats?.avg_rating || '0.0');
      const bayesian = v > 0 ? (v * rawAvg + 10 * 4.8) / (v + 10) : 0.0;
      await pool.query(
        'UPDATE merchants SET rating = $1, review_count = $2, bayesian_rating = $3 WHERE id = $4',
        [parseFloat(rawAvg.toFixed(1)), v, parseFloat(bayesian.toFixed(2)), review.merchant_id]
      );
    }

    res.json({ message: `Moderation action "${action}" completed successfully.` });
  } catch (err: any) {
    console.error('Error moderating review:', err);
    res.status(500).json({ error: 'Failed to moderate review' });
  }
});

