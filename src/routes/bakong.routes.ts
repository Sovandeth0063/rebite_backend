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
// @ts-ignore
import { BakongKHQR, IndividualInfo, MerchantInfo, khqrData } from 'bakong-khqr';

const bakongSdk = new BakongKHQR();

export const bakongRouter = Router();

// ============================================================================
// 1. BAKONG NBC OPEN API CONFIGURATION & PLACEHOLDERS
// (Set these in your .env for live banking network transactions)
// ============================================================================
import dotenv from 'dotenv';

// Dynamic configuration reader supporting both standard formats with instant hot-reload
function getBakongConfig() {
  dotenv.config({ override: true });
  const apiUrl = (process.env.KHQR_BASE_URL || process.env.BAKONG_API_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/+$/, '');
  const finalApiUrl = apiUrl.endsWith('/v1') ? apiUrl : `${apiUrl}/v1`;

  const bakongAccountId =
    process.env.KHQR_BAKONG_ACCOUNT_ID ||
    process.env.BAKONG_MERCHANT_ID ||
    process.env.BAKONG_ACCOUNT_ID ||
    process.env.KHQR_EMAIL ||
    'rescuebite@aba';

  return {
    apiToken: process.env.BAKONG_API_TOKEN || process.env.KHQR_API_TOKEN || '',
    apiUrl: finalApiUrl,
    email: process.env.KHQR_EMAIL || process.env.BAKONG_EMAIL || '',
    merchantId: bakongAccountId,
    merchantName: process.env.KHQR_MERCHANT_NAME || process.env.BAKONG_MERCHANT_NAME || process.env.KHQR_APP_NAME || 'RescueBite Cambodia',
    merchantCity: process.env.KHQR_MERCHANT_CITY || process.env.BAKONG_MERCHANT_CITY || 'Phnom Penh',
    acquiringBank: process.env.BAKONG_ACQUIRING_BANK || 'ABA Bank',
    appIconUrl: process.env.KHQR_APP_ICON_URL || '',
    appDeeplinkCallback: process.env.KHQR_APP_DEEPLINK_CALLBACK || '',
    currencyCode: '840', // USD: 840, KHR: 116
  };
}

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
 * Truncates a UTF-8 string to a maximum byte limit safely without splitting multi-byte characters.
 */
export function safeUtf8ByteTruncate(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  let sliceEnd = maxBytes;
  while (sliceEnd > 0 && (buf[sliceEnd] & 0xc0) === 0x80) {
    sliceEnd--;
  }
  return buf.subarray(0, sliceEnd).toString('utf8');
}

function toTlv(tag: string, value: string): string {
  const byteLength = Buffer.byteLength(value, 'utf8');
  const lengthStr = byteLength.toString().padStart(2, '0');
  return `${tag}${lengthStr}${value}`;
}

function sanitizeAscii(str: string, maxLen: number = 25): string {
  const clean = str.replace(/[^\x20-\x7E]/g, '').trim();
  return (clean.length > 0 ? clean : 'RescueBite Store').substring(0, maxLen);
}

function detectKhmerScript(text: string): boolean {
  return /[\u1780-\u17FF]/.test(text);
}

/**
 * Builds standard-compliant NBC Dynamic KHQR payload using authentic ABA & NBC EMVCo encoding
 */
export function buildEmvcoKhqr(options: {
  amountUsd: number;
  orderNumber: string;
  merchantId?: string;
  merchantName?: string;
  merchantNameKm?: string;
  merchantCity?: string;
  merchantCityKm?: string;
}): { qrCodeData: string; md5Hash: string } {
  const cfg = getBakongConfig();
  const {
    amountUsd,
    orderNumber,
    merchantId = cfg.merchantId,
    merchantName = cfg.merchantName,
    merchantNameKm,
    merchantCity = cfg.merchantCity,
    merchantCityKm,
  } = options;

  const numAmount = Math.max(0.01, parseFloat(amountUsd.toFixed(2)));
  const formattedAmount = numAmount.toFixed(2);
  const safeOrderNumber = orderNumber.replace(/[^\x20-\x7E]/g, '').substring(0, 25);
  const safeMerchantName = sanitizeAscii(merchantName, 25);
  const safeMerchantCity = sanitizeAscii(merchantCity, 15);

  // Build Tag 64: EMVCo Merchant Information - Language Template (Native Khmer Script)
  let tag64 = '';
  const nativeName = merchantNameKm || (detectKhmerScript(merchantName) ? merchantName : '');
  if (nativeName) {
    const safeNativeName = safeUtf8ByteTruncate(nativeName, 50);
    const safeNativeCity = safeUtf8ByteTruncate(merchantCityKm || 'ភ្នំពេញ', 30);
    tag64 = toTlv('64', toTlv('00', 'km') + toTlv('01', safeNativeName) + toTlv('02', safeNativeCity));
  }

  // If receiving account is ABA Bank, use ABA's native P2P & EMVCo tag sequence
  if (merchantId.includes('aba') || merchantId.includes('007462933')) {
    const cleanAccount = merchantId.replace(/[^0-9]/g, '') || '007462933';
    
    // Tag 29: ABA Bakong Account
    const tag29 = toTlv('00', 'abaakhppxxx@abaa') + toTlv('01', cleanAccount) + toTlv('02', 'ABA Bank');
    
    // Tag 40: ABA P2P Dual Account Routing (KHR 007463048, USD 007462933)
    const tag40 = toTlv('00', 'abaP2P') + toTlv('01', '87EF4817F604') + toTlv('02', '007463048') + toTlv('03', cleanAccount) + toTlv('04', 'Dual');

    let rawPayload =
      toTlv('00', '01') +
      toTlv('01', '12') +
      toTlv('29', tag29) +
      toTlv('40', tag40) +
      toTlv('52', '0000') +
      toTlv('53', '840') +
      toTlv('54', formattedAmount) +
      toTlv('58', 'KH') +
      toTlv('59', safeMerchantName) +
      toTlv('60', safeMerchantCity) +
      toTlv('62', toTlv('01', safeOrderNumber)) +
      tag64 +
      '6304';

    const crc = calculateCrc16(rawPayload);
    const finalQrCodeData = rawPayload.slice(0, -4) + toTlv('63', crc);
    const md5Hash = crypto.createHash('md5').update(finalQrCodeData).digest('hex');

    return { qrCodeData: finalQrCodeData, md5Hash };
  }

  // Standard NBC Individual SDK format for other banks
  try {
    const expiresMs = Date.now() + 15 * 60 * 1000;
    const info = new IndividualInfo(
      merchantId,
      safeMerchantName,
      safeMerchantCity,
      {
        currency: khqrData.currency.usd,
        amount: numAmount,
        billNumber: safeOrderNumber,
        storeLabel: 'RescueBite',
        terminalLabel: 'Online',
        expirationTimestamp: expiresMs,
      }
    );

    const sdkResult = bakongSdk.generateIndividual(info);
    if (sdkResult && sdkResult.data && sdkResult.data.qr) {
      return {
        qrCodeData: sdkResult.data.qr,
        md5Hash: sdkResult.data.md5 || crypto.createHash('md5').update(sdkResult.data.qr).digest('hex'),
      };
    }
  } catch (err) {
    console.warn('[Bakong KHQR SDK] Generation warning:', err);
  }

  // Generic fallback
  const bakongAcctInfo = toTlv('00', 'bakongkh') + toTlv('01', merchantId);
  let rawPayload =
    toTlv('00', '01') +
    toTlv('01', '12') +
    toTlv('29', bakongAcctInfo) +
    toTlv('52', '5999') +
    toTlv('53', '840') +
    toTlv('54', formattedAmount) +
    toTlv('58', 'KH') +
    toTlv('59', safeMerchantName) +
    toTlv('60', safeMerchantCity) +
    toTlv('62', toTlv('01', safeOrderNumber)) +
    tag64 +
    '6304';

  const crc = calculateCrc16(rawPayload);
  const finalQrCodeData = rawPayload.slice(0, -4) + toTlv('63', crc);
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

// 1. Generate dynamic KHQR token
const handleGenerateKhqr = (req: any, res: any) => {
  const cfg = getBakongConfig();
  const {
    amountUsd,
    amount,
    orderNumber = (req.body.orderId || `RB-${Date.now()}`),
    merchantId,
    merchantName = cfg.merchantName,
  } = req.body;

  const finalAmount = amountUsd != null ? amountUsd : amount;
  const numUsd = typeof finalAmount === 'number' ? finalAmount : parseFloat(finalAmount) || 0;
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
    qrString: qrCodeData,
    md5Hash,
    txId,
    expiresAt,
    amountUsd: numUsd,
    amountKhr,
    config: {
      gateway: cfg.apiToken ? 'NBC_BAKONG_LIVE' : 'NBC_BAKONG_SANDBOX',
      merchantId: merchantId || cfg.merchantId,
      acquiringBank: cfg.acquiringBank,
    },
  });
};

// 2. Check status of KHQR (Supports both live NBC Open API and sandbox simulation)
bakongRouter.get('/check-status/:md5Hash', async (req, res) => {
  const { md5Hash } = req.params;
  const cfg = getBakongConfig();

  // If live Bakong API Token is configured in .env, check real NBC ledger
  if (cfg.apiToken) {
    try {
      const response = await fetch(`${cfg.apiUrl}/check_transaction_by_md5`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiToken}`,
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

// Aliases for KHQR endpoints
bakongRouter.post('/generate-khqr', handleGenerateKhqr);
bakongRouter.post('/khqr', handleGenerateKhqr);
bakongRouter.get('/status/:md5Hash', (req, res) => {
  const { md5Hash } = req.params;
  const tx = khqrTransactions.get(md5Hash);
  if (!tx) {
    return res.json({
      status: 'PENDING',
      paidAt: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }
  res.json({
    status: tx.status,
    paidAt: tx.paidAt,
    expiresAt: tx.expiresAt,
  });
});

const handleSimulatePayment = (req: any, res: any) => {
  const md5Hash = req.body.md5Hash || req.body.md5 || req.body.hash;
  if (!md5Hash) {
    return res.status(400).json({ error: 'md5Hash is required for payment simulation' });
  }
  const tx = khqrTransactions.get(md5Hash);
  if (tx) {
    tx.status = 'SUCCESS';
    tx.paidAt = new Date().toISOString();
  } else {
    // Record sandbox transaction as success even if called with simulated hash
    khqrTransactions.set(md5Hash, {
      orderNumber: req.body.orderNumber || `RB-SIM-${Date.now()}`,
      amountUsd: 0,
      amountKhr: 0,
      merchantName: 'Sandbox Simulated Payment',
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
};

bakongRouter.post('/simulate-scan-pay', handleSimulatePayment);
bakongRouter.post('/simulate-payment', handleSimulatePayment);
