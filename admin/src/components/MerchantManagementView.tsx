import React, { useState, useEffect } from 'react';
import { Merchant } from '../types';
import { adminApi } from '../services/api';
import {
  Store,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Building2,
  Search,
  RefreshCw,
  Clock,
  Phone,
  Mail,
  ShieldCheck,
} from 'lucide-react';

export const MerchantManagementView: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'SUSPENDED'>('ALL');
  const [search, setSearch] = useState('');
  const [actionMerchantId, setActionMerchantId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchMerchants = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getMerchants();
      setMerchants(data);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMerchants();
  }, []);

  const handleUpdateStatus = async (merchantId: string, status: string, reason?: string) => {
    try {
      setLoading(true);
      await adminApi.updateMerchantStatus(merchantId, status, reason);
      setStatusMsg({ type: 'success', text: `Merchant status updated to ${status}` });
      setActionMerchantId(null);
      setActionReason('');
      fetchMerchants();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const filtered = merchants.filter((m) => {
    const matchesFilter = filter === 'ALL' || m.status === filter;
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.category.toLowerCase().includes(search.toLowerCase()) ||
      m.city.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
              : 'bg-red-950/60 border border-red-800 text-red-200'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="cursor-pointer">✕</button>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['ALL', 'PENDING', 'APPROVED', 'SUSPENDED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filter === tab
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {tab} ({tab === 'ALL' ? merchants.length : merchants.filter((m) => m.status === tab).length})
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search merchants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-medium text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <button
            onClick={fetchMerchants}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Merchants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <div
            key={m.id}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4 hover:border-neutral-700 transition-all shadow-lg flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={m.imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200'}
                    alt={m.name}
                    className="w-12 h-12 rounded-xl object-cover border border-neutral-800"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-white">{m.name}</h4>
                    <span className="text-xs text-neutral-400 font-medium">{m.category}</span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    m.status === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : m.status === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}
                >
                  {m.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-neutral-400 pt-1">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{m.address}, {m.city}</span>
                </div>
                {m.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span>{m.phone}</span>
                  </div>
                )}
                {m.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span>{m.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-end gap-2">
              {m.status === 'PENDING' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus(m.id, 'APPROVED')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(m.id, 'REJECTED', 'Documents incomplete')}
                    className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </>
              )}

              {m.status === 'APPROVED' && (
                <button
                  onClick={() => handleUpdateStatus(m.id, 'SUSPENDED', 'Policy review')}
                  className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Suspend</span>
                </button>
              )}

              {m.status === 'SUSPENDED' && (
                <button
                  onClick={() => handleUpdateStatus(m.id, 'APPROVED')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Re-Activate</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
