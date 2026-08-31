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
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rating: number;
  reviewCount: number;
  imageUrl: string;
  description?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
}

export interface ImpactStats {
  mealsRescued: number;
  co2SavedKg: number;
  moneySavedUsd: number;
  activePartners: number;
  wasteReductionRate: number;
}
