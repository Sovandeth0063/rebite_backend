import { User, TableMeta, Merchant, AuditLog, ImpactStats } from '../types';

let currentAdminId: string = localStorage.getItem('rebite_admin_id') || '';

export const setAdminUserId = (id: string) => {
  currentAdminId = id;
  if (id) {
    localStorage.setItem('rebite_admin_id', id);
  } else {
    localStorage.removeItem('rebite_admin_id');
  }
};

const authHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (currentAdminId) {
    headers['x-user-id'] = currentAdminId;
  }
  return headers;
};

export const adminApi = {
  // 1. Admin Authentication
  login: async (credentials: { email: string; password?: string }): Promise<User> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Authentication failed. Invalid admin credentials.');
    }
    const user: User = await res.json();
    if (user.role !== 'ADMIN') {
      throw new Error('Access denied. This portal is restricted to authorized RescueBite Administrators only.');
    }
    setAdminUserId(user.id);
    return user;
  },

  getCurrentAdmin: async (): Promise<User | null> => {
    if (!currentAdminId) return null;
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!res.ok) return null;
    const user: User = await res.json();
    if (user.role !== 'ADMIN') return null;
    return user;
  },

  logout: () => {
    setAdminUserId('');
  },

  // 2. Database Studio CRUD APIs
  getTables: async (): Promise<TableMeta[]> => {
    const res = await fetch('/api/crud/tables', { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch database schema');
    return res.json();
  },

  getTableRows: async (
    tableName: string,
    options?: { search?: string; orderBy?: string; orderDir?: string; page?: number; limit?: number }
  ): Promise<{ data: any[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
    const params = new URLSearchParams();
    if (options?.search) params.set('search', options.search);
    if (options?.orderBy) params.set('orderBy', options.orderBy);
    if (options?.orderDir) params.set('orderDir', options.orderDir);
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));

    const res = await fetch(`/api/crud/${tableName}?${params.toString()}`, { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch data for table "${tableName}"`);
    }
    return res.json();
  },

  createRow: async (tableName: string, rowData: Record<string, any>): Promise<any> => {
    const res = await fetch(`/api/crud/${tableName}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(rowData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to insert record into "${tableName}"`);
    }
    return res.json();
  },

  updateRow: async (tableName: string, id: string, rowData: Record<string, any>): Promise<any> => {
    const res = await fetch(`/api/crud/${tableName}/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(rowData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to update record in "${tableName}"`);
    }
    return res.json();
  },

  deleteRow: async (tableName: string, id: string): Promise<any> => {
    const res = await fetch(`/api/crud/${tableName}/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to delete record from "${tableName}"`);
    }
    return res.json();
  },

  executeSql: async (sql: string): Promise<any> => {
    const res = await fetch('/api/crud/query/sql', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.details || 'SQL Execution error');
    }
    return res.json();
  },

  // 3. Platform & Merchant Management
  getMerchants: async (): Promise<Merchant[]> => {
    const res = await fetch('/api/merchants', { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch merchants');
    return res.json();
  },

  updateMerchantStatus: async (merchantId: string, status: string, reason?: string): Promise<any> => {
    const res = await fetch(`/api/admin/merchants/${merchantId}/status`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status, reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update merchant status');
    }
    return res.json();
  },

  getAuditLogs: async (): Promise<AuditLog[]> => {
    const res = await fetch('/api/admin/audit-logs', { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return res.json();
  },

  getImpactStats: async (): Promise<ImpactStats> => {
    const res = await fetch('/api/impact', { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch impact stats');
    return res.json();
  },

  getHealth: async (): Promise<any> => {
    const res = await fetch('/api/health');
    return res.json();
  },
};
