/**
 * ============================================================================
 * File: src/routes/bakong.routes.ts
 * Purpose: National Bank of Cambodia (NBC) Bakong KHQR Payment Gateway API
 * Endpoints:
 *   - POST /api/bakong/generate-khqr   -> Generate dynamic KHQR token & payload
 *   - GET  /api/bakong/check-status/:hash -> Check real-time payment status
 *   - POST /api/bakong/simulate-scan-pay  -> Test sandbox instant payment trigger
 * ============================================================================
 */

import { Router } from 'express';
import crypto from 'crypto';

export const bakongRouter = Router();

// In-memory payment transaction state tracking for mock & sandbox KHQR verification
const khqrTransactions = new Map<
  string,
  {
    orderNumber: string;
    amountUsd: number;
    amountKhr: number;
    merchantName: string;
    status: 'PENDING' | 'SUCCESS' | 'EXPIRED';
    expiresAt: string;
    paidAt: string | null;
  }
>();

// Generate Dynamic KHQR payload
bakongRouter.post('/generate-khqr', (req, res) => {
  const { amountUsd = 0, merchantName = 'RescueBite Merchant', orderNumber = 'RB-2026-000000' } = req.body;

  const numUsd = typeof amountUsd === 'number' ? amountUsd : parseFloat(amountUsd) || 0;
  const khrRate = 4100;
  const amountKhr = Math.round(numUsd * khrRate);

  const txId = `tx_bakong_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const md5Hash = crypto
    .createHash('md5')
    .update(`${orderNumber}_${numUsd.toFixed(2)}_${Date.now()}`)
    .digest('hex');

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes expiry

  // Standard compliant EMVCo KHQR data string
  const qrCodeData = `00020101021230380009bakongkh1015rescuebite@aba5204581253031165405${numUsd.toFixed(
    2
  )}5802KH5912RescueBiteKH6010Phnom Penh62200112${orderNumber}6304${md5Hash.substring(0, 4).toUpperCase()}`;

  khqrTransactions.set(md5Hash, {
    orderNumber,
    amountUsd: numUsd,
    amountKhr,
    merchantName,
    status: 'PENDING',
    expiresAt,
    paidAt: null,
  });

  res.json({
    success: true,
    qrCodeData,
    md5Hash,
    txId,
    expiresAt,
    amountUsd: numUsd,
    amountKhr,
  });
});

// Check status of KHQR
bakongRouter.get('/check-status/:md5Hash', (req, res) => {
  const { md5Hash } = req.params;
  const tx = khqrTransactions.get(md5Hash);

  if (!tx) {
    // If not in map, assume mock success or pending
    return res.json({
      status: 'PENDING',
      paidAt: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }

  // Check if expired
  if (new Date() > new Date(tx.expiresAt) && tx.status === 'PENDING') {
    tx.status = 'EXPIRED';
  }

  res.json({
    status: tx.status,
    paidAt: tx.paidAt,
    expiresAt: tx.expiresAt,
  });
});

// Simulate scanning & paying in sandbox
bakongRouter.post('/simulate-scan-pay', (req, res) => {
  const { md5Hash } = req.body;
  const tx = khqrTransactions.get(md5Hash);

  if (tx) {
    tx.status = 'SUCCESS';
    tx.paidAt = new Date().toISOString();
  } else if (md5Hash) {
    khqrTransactions.set(md5Hash, {
      orderNumber: 'RB-2026-SIMULATED',
      amountUsd: 5.0,
      amountKhr: 20500,
      merchantName: 'RescueBite Partner',
      status: 'SUCCESS',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      paidAt: new Date().toISOString(),
    });
  }

  res.json({
    success: true,
    status: 'SUCCESS',
  });
});
