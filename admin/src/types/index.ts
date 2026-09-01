export interface User {
  id: string;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'MERCHANT' | 'ADMIN' | 'GUEST';
  phone?: string;
  avatarUrl?: string;
  language?: string;
  points?: number;
  referralCode?: string;
  referredBy?: string;
  savedStoreIds?: string[];
  createdAt?: string;
}

export interface ColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
  isPrimary?: boolean;
}

export interface TableMeta {
  name: string;
  rowCount: number;
  primaryKey: string;
  columns: ColumnMeta[];
}

export interface Merchant {
  id: string;
  userId?: string;
  name?: string;
  businessName?: string;
  businessName_en?: string;
  businessName_km?: string;
  businessType?: string;
  category?: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  address?: string;
  district?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  logoUrl?: string;
  coverUrl?: string;
  imageUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rating?: number;
  reviewCount?: number;
  openingHours?: string;
  pickupWindowDefault?: string;
  description?: string;
  description_en?: string;
  description_km?: string;
  foodCategories?: string[];
  joinedDate?: string;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  adminId?: string;
  adminEmail?: string;
  action: string;
  target: string;
  details: string;
  timestamp?: string;
  createdAt?: string;
}

export interface ImpactStats {
  mealsRescued: number;
  co2SavedKg?: number;
  co2AvoidedKg?: number;
  foodSavedKg?: number;
  customerSavingsUsd?: number;
  moneySavedUsd?: number;
  activePartners?: number;
  activeMerchantsCount?: number;
  wasteReductionRate?: number;
}
