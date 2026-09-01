/**
 * ============================================================================
 * File: src/types/index.ts
 * Purpose: TypeScript Data Models & Entity Interfaces
 * Responsibilities:
 *   - Defines strong typing for Users, Merchants, RescueBags, Orders, Reviews, ImpactStats,
 *     Inventory, AI Recommendations, Settings, and Audit Logs.
 * ============================================================================
 */

export type Role = 'CUSTOMER' | 'MERCHANT' | 'ADMIN' | 'GUEST';
export type Language = 'en' | 'km';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
  avatarUrl?: string;
  language: Language;
  points: number;
  referralCode: string;
  referredBy?: string;
  savedStoreIds: string[];
  cashStrikes?: number;
  trustScore?: number;
  createdAt: string;
}

export type BusinessCategory =
  | 'Bakery'
  | 'Café'
  | 'Restaurant'
  | 'Supermarket'
  | 'Hotel'
  | 'Grocery'
  | 'Dessert'
  | 'Fast Food'
  | 'Vegetarian'
  | 'Other'
  | string;

export type MerchantStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface Merchant {
  id: string;
  userId: string;
  businessName: string;
  businessName_en?: string;
  businessName_km?: string;
  businessType: BusinessCategory;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  district: string;
  city: string;
  latitude: number;
  longitude: number;
  logoUrl: string;
  coverUrl: string;
  description: string;
  description_en?: string;
  description_km?: string;
  sourceLanguage?: 'km' | 'en' | 'other';
  translationStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
  isMachineTranslated?: boolean;
  rating: number;
  bayesianRating?: number;
  reviewCount: number;
  openingHours: string;
  pickupWindowDefault: string;
  status: MerchantStatus;
  rejectionReason?: string;
  joinedDate: string;
  foodCategories: BusinessCategory[];
}

export type ListingVisibility = 'PUBLIC' | 'DRAFT' | 'SOLD_OUT' | 'ARCHIVED';

export interface RescueBag {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantLogo: string;
  merchantRating: number;
  merchantAddress: string;
  merchantLat: number;
  merchantLng: number;
  title: string;
  titleKm?: string;
  title_en?: string;
  title_km?: string;
  description: string;
  description_en?: string;
  description_km?: string;
  sourceLanguage?: 'km' | 'en' | 'other';
  translationStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
  isMachineTranslated?: boolean;
  category: BusinessCategory;
  imageUrl: string;
  originalPrice: number;
  rescuePrice: number;
  discountPercentage: number;
  quantityRemaining: number;
  totalQuantity: number;
  pickupStart: string;
  pickupEnd: string;
  tags?: string[];
  compositionTags?: string[];
  estimatedItemCount?: string;
  dietaryTags?: string[];
  allergenDisclaimer?: string;
  allergens?: string[];
  dietary?: string[];
  co2SavedKg?: number;
  status?: string;
  ingredients?: string[];
  storageInstructions?: string;
  minItems?: number;
  maxItems?: number;
  visibility?: ListingVisibility;
  safetyConfirmed?: boolean;
  hasAutoEscalatingDiscount?: boolean;
  escalatedDiscountPercentage?: number;
  escalateMinutesBeforeEnd?: number;
  createdAt: string;
}

export interface CategoryPreset {
  id: string;
  businessType: string;
  nameEn: string;
  nameKm: string;
  icon: string;
  orderIndex: number;
}

export type OrderStatus =
  | 'RESERVED'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  merchantId: string;
  merchantName: string;
  merchantLogo: string;
  merchantAddress: string;
  rescueBagId: string;
  rescueBagTitle: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  serviceFee: number;
  totalPrice: number;
  commissionRate?: number;
  commissionAmount?: number;
  merchantNetAmount?: number;
  escrowStatus?: 'PENDING_COLLECTION' | 'HELD_IN_ESCROW' | 'PAID_OUT' | 'VOIDED' | 'REFUNDED';
  cashDueAtPickup?: number;
  amountPaidInApp?: number;
  pickupDate: string;
  pickupWindow: string;
  paymentMethod: 'ABA_PAY' | 'CARD' | 'CASH_AT_PICKUP';
  paymentStatus: 'PAID' | 'PENDING' | 'REFUNDED';
  orderStatus: OrderStatus;
  qrCodeUrl?: string;
  qrCodeData: string;
  pickupCode: string;
  collectedAt?: string;
  reviewGiven?: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  merchantId: string;
  customerId: string;
  customerName: string;
  customerAvatar?: string;
  rating: number;
  comment: string;
  comment_en?: string;
  comment_km?: string;
  sourceLanguage?: 'km' | 'en' | 'other';
  translationStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
  isMachineTranslated?: boolean;
  foodQualityRating?: number;
  valueRating?: number;
  pickupExperienceRating?: number;
  merchantReply?: string;
  merchantRepliedAt?: string;
  consumedInWindow?: boolean;
  isFlagged?: boolean;
  flagReason?: string;
  moderationStatus?: 'APPROVED' | 'PENDING_MODERATION' | 'FLAGGED' | 'HIDDEN_BY_ADMIN';
  isSuspiciousIp?: boolean;
  isVerifiedPurchase?: boolean;
  createdAt: string;
}

export interface ImpactStats {
  mealsRescued: number;
  foodSavedKg: number;
  customerSavingsUsd: number;
  co2AvoidedKg: number;
  activeMerchantsCount: number;
}

export interface AchievementBadge {
  id: string;
  title: string;
  titleKm?: string;
  description: string;
  descriptionKm?: string;
  icon: string;
  unlocked?: boolean;
  unlockedAt?: string;
  progress?: number;
  category?: string;
}

export interface RewardItem {
  id: string;
  title: string;
  titleKm?: string;
  pointsCost: number;
  discountUsd?: number;
  discountAmountUsd?: number;
  description: string;
  descriptionKm?: string;
  code?: string;
  category?: string;
  expiresInDays?: number;
  partnerName?: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'ORDER_UPDATE' | 'NEW_LISTING' | 'REWARD' | 'SYSTEM';
  isRead: boolean;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  merchantId: string;
  name: string;
  category: string;
  stockQuantity: number;
  normalPrice: number;
  expiryDate: string;
  expectedSales: number;
  surplusRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedAction: string;
}

export interface AIRecommendation {
  id: string;
  merchantId: string;
  title: string;
  message: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedAction: {
    type: 'CREATE_RESCUE_BAG';
    title: string;
    originalPrice: number;
    rescuePrice: number;
    quantity: number;
  };
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface CustomerSettings {
  userId: string;
  notifications: {
    orderUpdates: boolean;
    promoAlerts: boolean;
    pickupReminders: boolean;
    pushEnabled: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
  };
  paymentMethods: {
    defaultMethod: 'ABA_PAY' | 'BAKONG' | 'CASH';
    bakongAccountId?: string;
    abaPayPhone?: string;
    savedBakongLink: boolean;
  };
  language: 'en' | 'km';
  currency: 'USD' | 'KHR';
  twoFactorEnabled: boolean;
  savedAddresses: string[];
  deleteCooldownDate?: string;
}

export interface MerchantSettingsData {
  merchantId: string;
  userId: string;
  pickupWindowDefault: string;
  orderAutoCancelMinutes: number;
  isTemporarilyClosed: boolean;
  closureReason?: string;
  notifications: {
    newOrders: boolean;
    lowStock: boolean;
    reviews: boolean;
    pushEnabled: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
  };
  payout: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    payoutSchedule: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    lastUpdated?: string;
  };
  teamMembers: {
    id: string;
    name: string;
    email: string;
    role: 'STORE_STAFF' | 'STORE_MANAGER';
    addedAt: string;
  }[];
  language: 'en' | 'km';
  currency: 'USD' | 'KHR';
}

export interface PlatformConfig {
  autoApproveNewMerchants: boolean;
  supportedCities: string[];
  defaultCommissionRate: number;
  unclaimedAutoCancelMinutes: number;
  notificationRouting: {
    merchantApplicationsEmail: string;
    disputesEmail: string;
    flaggedContentEmail: string;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roleLevel: 'SUPER_ADMIN' | 'SUPPORT_ADMIN' | 'OPERATIONS_ADMIN';
  twoFactorEnforced: boolean;
  createdAt: string;
  lastActiveAt?: string;
}

export interface LoginSession {
  id: string;
  userId: string;
  device: string;
  browser: string;
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reporterType: 'CUSTOMER' | 'MERCHANT';
  targetType: 'LISTING' | 'MERCHANT' | 'CUSTOMER' | 'FOOD_SAFETY';
  targetId: string;
  reason: string;
  status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
}

export interface MenuItem {
  id: string;
  merchantId: string;
  name: string;
  nameKm?: string;
  category: BusinessCategory;
  basePrice: number;
  quantity?: number;
  unit?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type LiveListingStatus = 'LIVE' | 'SOLD_OUT' | 'EXPIRED';

export interface LiveListing {
  id: string;
  merchantId: string;
  menuItemId: string;
  merchantName: string;
  merchantLogo: string;
  merchantLat: number;
  merchantLng: number;
  merchantAddress: string;
  itemName: string;
  itemNameKm?: string;
  imageUrl?: string;
  quantityLeft: number;
  unit?: string;
  discountPct: number;
  rescuePrice: number;
  originalPrice: number;
  expiresAt: string;
  pickupStart?: string;
  pickupEnd?: string;
  status: LiveListingStatus;
  createdAt: string;
  updatedAt?: string;
}

