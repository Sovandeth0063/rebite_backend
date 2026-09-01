/**
 * ============================================================================
 * File: src/routes/bakong.routes.ts
 * Purpose: National Bank of Cambodia (NBC) Bakong KHQR Payment Gateway API
 * Features:
 *   - Mathematically authentic EMVCo Tag-Length-Value (TLV) payload generation
 *   - Strict CRC-16 CCITT-FALSE (0x1021) checksum generation for Tag 6304
 *   - Production-ready placeholders for live NBC Open API / ABA PayWay token injection
 *   - High-fidelity sandbox status tracking & simulation engine
 * Endpoints:
 *   - POST /api/bakong/generate-khqr      -> Generate dynamic KHQR token & payload
 *   - GET  /api/bakong/check-status/:hash -> Check real-time payment status
 *   - POST /api/bakong/simulate-scan-pay  -> Test sandbox instant payment trigger
 * ============================================================================
 */

import { Router } from 'express';
import crypto from 'crypto';

export const bakongRouter = Router();

// ============================================================================
// 1. BAKONG NBC OPEN API CONFIGURATION & PLACEHOLDERS
// (Set these in your .env for live banking network transactions)
// ============================================================================
const BAKONG_CONFIG = {
  // NBC Open API Token (obtain from https://bakong.nbc.gov.kh/developer/)
  apiToken: process.env.BAKONG_API_TOKEN || '',
  // Live API Base URL (default: https://api-bakong.nbc.gov.kh/v1)
  apiUrl: process.env.BAKONG_API_URL || 'https://api-bakong.nbc.gov.kh/v1',
  // Official Registered Merchant Account ID (e.g. 'rescuebite_platform@aba')
  merchantId: process.env.BAKONG_MERCHANT_ID || 'rescuebite@aba',
  merchantName: process.env.BAKONG_MERCHANT_NAME || 'RescueBite Cambodia',
  merchantCity: process.env.BAKONG_MERCHANT_CITY || 'Phnom Penh',
  acquiringBank: process.env.BAKONG_ACQUIRING_BANK || 'ABA Bank',
  currencyCode: '840', // USD: 840, KHR: 116
};

/**
 * Standard EMVCo CRC-16 CCITT-FALSE Algorithm
 * Polynomial: 0x1021, Initial: 0xFFFF
 * Required by NBC KHQR specification for Tag 6304
 */
export function calculateCrc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Helper to build EMVCo Tag-Length-Value (TLV) string
 */
function toTlv(tag: string, value: string): string {
  const lengthStr = value.length.toString().padStart(2, '0');
  return `${tag}${lengthStr}${value}`;
}

/**
 * Sanitizes merchant name for EMVCo Tag 59 (max 25 ASCII characters)
 */
function sanitizeAscii(str: string, maxLen: number = 25): string {
  // Strip non-ASCII or replace with safe latin alphanumeric characters
  const clean = str.replace(/[^\x20-\x7E]/g, '').trim();
  return (clean.length > 0 ? clean : 'RescueBite Store').substring(0, maxLen);
}

/**
 * Builds standard-compliant NBC Dynamic KHQR payload
 */
export function buildEmvcoKhqr(options: {
  amountUsd: number;
  orderNumber: string;
  merchantId?: string;
  merchantName?: string;
  merchantCity?: string;
}): { qrCodeData: string; md5Hash: string } {
  const {
    amountUsd,
    orderNumber,
    merchantId = BAKONG_CONFIG.merchantId,
    merchantName = BAKONG_CONFIG.merchantName,
    merchantCity = BAKONG_CONFIG.merchantCity,
  } = options;

  const formattedAmount = amountUsd.toFixed(2);
  const safeMerchantName = sanitizeAscii(merchantName, 25);
  const safeMerchantCity = sanitizeAscii(merchantCity, 15);
  const safeOrderNumber = orderNumber.replace(/[^\x20-\x7E]/g, '').substring(0, 25);

  // Sub-tag for Bakong Merchant Account Information (Tag 29 or Tag 30)
  // Tag 00: Globally Unique Identifier ("bakongkh")
  // Tag 01: Merchant Account ID / Bakong Phone
  const bakongAcctInfo = toTlv('00', 'bakongkh') + toTlv('01', merchantId);

  // Construct main TLV sequence:
  // 00: Payload Format Indicator ("01")
  // 01: Point of Initiation Method ("12" for Dynamic QR with fixed amount)
  // 29/30: Merchant Account Information
  // 52: Merchant Category Code ("5812" for Eating Places / Restaurants)
  // 53: Transaction Currency ("840" for USD)
  // 54: Transaction Amount
  // 58: Country Code ("KH")
  // 59: Merchant Name
  // 60: Merchant City
  // 62: Additional Data Field (Bill/Order Number)
  let rawPayload =
    toTlv('00', '01') +
    toTlv('01', '12') +
    toTlv('30', bakongAcctInfo) +
    toTlv('52', '5812') +
    toTlv('53', '840') +
    toTlv('54', formattedAmount) +
    toTlv('58', 'KH') +
    toTlv('59', safeMerchantName) +
    toTlv('60', safeMerchantCity) +
    toTlv('62', toTlv('01', safeOrderNumber));

  // Append Tag 63 Length (04) before computing CRC
  rawPayload += '6304';

  // Calculate standard 16-bit CRC checksum
  const crc = calculateCrc16(rawPayload);
  const finalQrCodeData = rawPayload.slice(0, -4) + toTlv('63', crc);

  // Compute MD5 hash of raw QR payload for status lookup
  const md5Hash = crypto.createHash('md5').update(finalQrCodeData).digest('hex');

  return { qrCodeData: finalQrCodeData, md5Hash };
}

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

// 1. Generate Dynamic KHQR payload
bakongRouter.post('/generate-khqr', (req, res) => {
  const { amountUsd = 0, merchantName = 'RescueBite Merchant', orderNumber = 'RB-2026-000000', merchantId } = req.body;

  const numUsd = typeof amountUsd === 'number' ? amountUsd : parseFloat(amountUsd) || 0;
  const khrRate = 4100;
  const amountKhr = Math.round(numUsd * khrRate);

  const txId = `tx_bakong_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes expiry

  // Generate EMVCo compliant KHQR data with real CRC-16
  const { qrCodeData, md5Hash } = buildEmvcoKhqr({
    amountUsd: numUsd,
    orderNumber,
    merchantId,
    merchantName,
  });

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
    config: {
      gateway: BAKONG_CONFIG.apiToken ? 'NBC_BAKONG_LIVE' : 'NBC_BAKONG_SANDBOX',
      merchantId: merchantId || BAKONG_CONFIG.merchantId,
      acquiringBank: BAKONG_CONFIG.acquiringBank,
    },
  });
});

// 2. Check status of KHQR (Supports both live NBC Open API and sandbox simulation)
bakongRouter.get('/check-status/:md5Hash', async (req, res) => {
  const { md5Hash } = req.params;

  // If live Bakong API Token is configured in .env, check real NBC ledger
  if (BAKONG_CONFIG.apiToken) {
    try {
      const response = await fetch(`${BAKONG_CONFIG.apiUrl}/check_transaction_by_md5`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BAKONG_CONFIG.apiToken}`,
        },
        body: JSON.stringify({ md5: md5Hash }),
      });

      if (response.ok) {
        const data: any = await response.json();
        if (data.responseCode === 0 && data.data?.status === 'SUCCESS') {
          return res.json({
            status: 'SUCCESS',
            paidAt: data.data.paymentDate || new Date().toISOString(),
            externalTxId: data.data.externalTransactionId,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('[Bakong Gateway] Live API check warning, falling back to local state:', err);
    }
  }

  // Fallback to local sandbox transaction map
  const tx = khqrTransactions.get(md5Hash);

  if (!tx) {
    return res.json({
      status: 'PENDING',
      paidAt: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }

  if (new Date() > new Date(tx.expiresAt) && tx.status === 'PENDING') {
    tx.status = 'EXPIRED';
  }

  res.json({
    status: tx.status,
    paidAt: tx.paidAt,
    expiresAt: tx.expiresAt,
  });
});

// 3. Simulate scanning & paying in sandbox
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
    message: 'Payment simulation acknowledged.',
  });
});
