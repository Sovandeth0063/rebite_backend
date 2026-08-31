/**
 * ============================================================================
 * File: src/routes/order.routes.ts
 * Purpose: Order Processing & Pickup Verification Endpoints
 * Endpoints:
 *   - GET    /api/orders                   -> List orders filtered by customer, merchant, or status
 *   - GET    /api/orders/:id               -> Retrieve single order by ID or orderNumber
 *   - POST   /api/orders                   -> Create order (deducts bag stock, calculates fees, updates impact)
 *   - PUT    /api/orders/:id/status        -> Update order status (RESERVED, READY_FOR_PICKUP, COMPLETED, CANCELLED)
 *   - POST   /api/orders/:id/verify-pickup -> Merchant scans customer QR code or checks 4-digit pickup code
 * ============================================================================
 */

import { Router } from 'express';
import { pool, query, queryOne } from '../config/db.js';
import { AuthenticatedRequest, recordAuditLog } from '../middleware/auth.js';

export const orderRouter = Router();

// Get orders
orderRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const { customerId, merchantId, status } = req.query;
  try {
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params: any[] = [];

    if (customerId) {
      params.push(customerId);
      sql += ` AND customer_id = $${params.length}`;
    }
    if (merchantId) {
      params.push(merchantId);
      sql += ` AND merchant_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND order_status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, params);

    res.json(
      rows.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        customerId: o.customer_id,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        merchantId: o.merchant_id,
        merchantName: o.merchant_name,
        merchantLogo: o.merchant_logo,
        merchantAddress: o.merchant_address,
        rescueBagId: o.rescue_bag_id,
        rescueBagTitle: o.rescue_bag_title,
        quantity: o.quantity,
        unitPrice: parseFloat(o.unit_price),
        subtotal: parseFloat(o.subtotal),
        serviceFee: parseFloat(o.service_fee),
        totalPrice: parseFloat(o.total_price),
        pickupDate: o.pickup_date,
        pickupWindow: o.pickup_window,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        orderStatus: o.order_status,
        qrCodeUrl: o.qr_code_url,
        qrCodeData: o.qr_code_data,
        pickupCode: o.pickup_code,
        collectedAt: o.collected_at,
        reviewGiven: o.review_given,
        createdAt: o.created_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
orderRouter.get('/:id', async (req, res) => {
  try {
    const o = await queryOne('SELECT * FROM orders WHERE id = $1 OR order_number = $1', [req.params.id]);
    if (!o) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({
      id: o.id,
      orderNumber: o.order_number,
      customerId: o.customer_id,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      merchantId: o.merchant_id,
      merchantName: o.merchant_name,
      merchantLogo: o.merchant_logo,
      merchantAddress: o.merchant_address,
      rescueBagId: o.rescue_bag_id,
      rescueBagTitle: o.rescue_bag_title,
      quantity: o.quantity,
      unitPrice: parseFloat(o.unit_price),
      subtotal: parseFloat(o.subtotal),
      serviceFee: parseFloat(o.service_fee),
      totalPrice: parseFloat(o.total_price),
      pickupDate: o.pickup_date,
      pickupWindow: o.pickup_window,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      orderStatus: o.order_status,
      qrCodeUrl: o.qr_code_url,
      qrCodeData: o.qr_code_data,
      pickupCode: o.pickup_code,
      collectedAt: o.collected_at,
      reviewGiven: o.review_given,
      createdAt: o.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order
orderRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const { rescueBagId, quantity = 1, paymentMethod = 'ABA_PAY' } = req.body;

  try {
    const bag = await queryOne('SELECT * FROM rescue_bags WHERE id = $1', [rescueBagId]);
    if (!bag) {
      return res.status(404).json({ error: 'Rescue Bag not found' });
    }

    if (bag.quantity_remaining < quantity) {
      return res.status(400).json({ error: 'Not enough bags available' });
    }

    // Decrement bag inventory
    await pool.query('UPDATE rescue_bags SET quantity_remaining = quantity_remaining - $1 WHERE id = $2', [
      quantity,
      rescueBagId,
    ]);

    const unitPrice = parseFloat(bag.rescue_price);
    const subtotal = unitPrice * quantity;
    const serviceFee = 0.5;
    const totalPrice = subtotal + serviceFee;

    const orderNum = `RB-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const orderId = `ord_${Date.now()}`;
    const pickupCode = `RB-${Math.floor(1000 + Math.random() * 9000)}`;
    const qrData = `${orderNum}-PICKUP`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

    const user = req.currentUser || { id: 'usr_customer', name: 'Dara Sok', phone: '+855 12 345 678' };

    await pool.query(
      `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_phone, merchant_id, merchant_name, merchant_logo, merchant_address, rescue_bag_id, rescue_bag_title, quantity, unit_price, subtotal, service_fee, total_price, pickup_date, pickup_window, payment_method, payment_status, order_status, qr_code_url, qr_code_data, pickup_code, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
      [
        orderId,
        orderNum,
        user.id,
        user.name,
        user.phone || '+855 12 000 000',
        bag.merchant_id,
        bag.merchant_name,
        bag.merchant_logo,
        bag.merchant_address,
        bag.id,
        bag.title,
        quantity,
        unitPrice,
        subtotal,
        serviceFee,
        totalPrice,
        new Date().toISOString().split('T')[0],
        `${bag.pickup_start} - ${bag.pickup_end}`,
        paymentMethod,
        'PAID',
        'READY_FOR_PICKUP',
        qrUrl,
        qrData,
        pickupCode,
        new Date().toISOString(),
      ]
    );

    // Update impact stats & user points
    await pool.query(
      `UPDATE impact_stats
       SET meals_rescued = meals_rescued + $1,
           food_saved_kg = food_saved_kg + ($1 * 0.75),
           customer_savings_usd = customer_savings_usd + ($1 * ($2 - $3)),
           co2_avoided_kg = co2_avoided_kg + ($1 * 1.8)
       WHERE id = 1`,
      [quantity, parseFloat(bag.original_price), parseFloat(bag.rescue_price)]
    );

    await pool.query('UPDATE users SET points = points + ($1 * 10) WHERE id = $2', [quantity, user.id]);

    const createdOrder = await queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
    res.status(201).json(createdOrder);
  } catch (err: any) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// Update order status
orderRouter.put('/:id/status', async (req: AuthenticatedRequest, res) => {
  const { status } = req.body;
  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const collectedAt = status === 'COMPLETED' ? new Date().toISOString() : order.collected_at;

    await pool.query(
      `UPDATE orders
       SET order_status = $1, collected_at = $2
       WHERE id = $3`,
      [status, collectedAt, req.params.id]
    );

    const updated = await queryOne('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Global Scan QR / Pickup code verification endpoint
orderRouter.post('/scan-qr', async (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'Pickup code or QR token is required' });
  }

  const clean = code.trim();
  try {
    const order = await queryOne(
      `SELECT * FROM orders 
       WHERE UPPER(pickup_code) = UPPER($1) 
          OR order_number = $1 
          OR qr_code_data = $1 
          OR id = $1`,
      [clean]
    );

    if (!order) {
      return res.status(404).json({ error: 'No matching order found for this pickup code or QR token' });
    }

    if (order.order_status === 'COMPLETED') {
      return res.json({
        success: true,
        message: 'Order was already marked completed.',
        order: {
          id: order.id,
          orderNumber: order.order_number,
          customerId: order.customer_id,
          customerName: order.customer_name,
          customerPhone: order.customer_phone,
          merchantId: order.merchant_id,
          merchantName: order.merchant_name,
          rescueBagId: order.rescue_bag_id,
          rescueBagTitle: order.rescue_bag_title,
          quantity: order.quantity,
          unitPrice: parseFloat(order.unit_price),
          subtotal: parseFloat(order.subtotal),
          totalPrice: parseFloat(order.total_price),
          orderStatus: 'COMPLETED',
          collectedAt: order.collected_at,
          createdAt: order.created_at,
        },
        pointsEarned: order.quantity * 10,
      });
    }

    await pool.query(
      `UPDATE orders
       SET order_status = 'COMPLETED', collected_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), order.id]
    );

    const pointsEarned = (order.quantity || 1) * 10;
    await pool.query('UPDATE users SET points = points + $1 WHERE id = $2', [pointsEarned, order.customer_id]);

    const updated = await queryOne('SELECT * FROM orders WHERE id = $1', [order.id]);

    res.json({
      success: true,
      message: 'Pickup confirmed! Order completed successfully.',
      order: {
        id: updated.id,
        orderNumber: updated.order_number,
        customerId: updated.customer_id,
        customerName: updated.customer_name,
        customerPhone: updated.customer_phone,
        merchantId: updated.merchant_id,
        merchantName: updated.merchant_name,
        rescueBagId: updated.rescue_bag_id,
        rescueBagTitle: updated.rescue_bag_title,
        quantity: updated.quantity,
        unitPrice: parseFloat(updated.unit_price),
        subtotal: parseFloat(updated.subtotal),
        totalPrice: parseFloat(updated.total_price),
        orderStatus: updated.order_status,
        collectedAt: updated.collected_at,
        createdAt: updated.created_at,
      },
      pointsEarned,
    });
  } catch (err: any) {
    console.error('Error verifying pickup QR:', err);
    res.status(500).json({ error: 'Failed to verify pickup code' });
  }
});

// Cancel order endpoint
orderRouter.post('/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.order_status === 'COMPLETED') {
      return res.status(400).json({ error: 'Completed orders cannot be cancelled' });
    }

    await pool.query('UPDATE orders SET order_status = $1 WHERE id = $2', ['CANCELLED', req.params.id]);

    // Restore bag inventory
    if (order.rescue_bag_id && order.quantity) {
      await pool.query('UPDATE rescue_bags SET quantity_remaining = quantity_remaining + $1 WHERE id = $2', [
        order.quantity,
        order.rescue_bag_id,
      ]);
    }

    const updated = await queryOne('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    res.json({
      id: updated.id,
      orderNumber: updated.order_number,
      orderStatus: updated.order_status,
      customerId: updated.customer_id,
      merchantId: updated.merchant_id,
      totalPrice: parseFloat(updated.total_price),
      createdAt: updated.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});
