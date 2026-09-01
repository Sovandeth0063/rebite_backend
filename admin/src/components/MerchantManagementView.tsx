import React, { useState, useEffect, useMemo } from 'react';
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
  Star,
  LayoutList,
  LayoutGrid,
  ExternalLink,
  SlidersHorizontal,
  ChevronRight,
  X,
  Edit3,
  Check,
  Copy,
  Info,
} from 'lucide-react';

export const MerchantManagementView: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'SUSPENDED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'TABLE' | 'GRID'>('TABLE');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchMerchants = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getMerchants();
      setMerchants(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to load merchants:', err);
      setStatusMsg({ type: 'error', text: err.message || 'Failed to load merchants' });
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
      if (selectedMerchant && selectedMerchant.id === merchantId) {
        setSelectedMerchant({ ...selectedMerchant, status: status as any });
      }
      fetchMerchants();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update status' });
    } finally {
      setLoading(false);
    }
  };

  // Distinct categories and districts for dropdown filters
  const categories = useMemo(() => {
    const set = new Set<string>();
    merchants.forEach((m) => {
      const cat = m.businessType || m.category;
      if (cat) set.add(cat);
    });
    return Array.from(set);
  }, [merchants]);

  const districts = useMemo(() => {
    const set = new Set<string>();
    merchants.forEach((m) => {
      if (m.district) set.add(m.district);
      else if (m.city) set.add(m.city);
    });
    return Array.from(set);
  }, [merchants]);

  const filtered = useMemo(() => {
    return merchants.filter((m) => {
      const status = m.status || 'APPROVED';
      const cat = m.businessType || m.category || '';
      const dist = m.district || m.city || '';

      const matchesStatus = filter === 'ALL' || status === filter;
      const matchesCategory = categoryFilter === 'ALL' || cat.toLowerCase() === categoryFilter.toLowerCase();
      const matchesDistrict = districtFilter === 'ALL' || dist.toLowerCase() === districtFilter.toLowerCase();

      const q = search.toLowerCase().trim();
      if (!q) return matchesStatus && matchesCategory && matchesDistrict;

      const name = (m.businessName || m.name || '').toLowerCase();
      const nameKm = (m.businessName_km || '').toLowerCase();
      const city = (m.city || '').toLowerCase();
      const addr = (m.address || '').toLowerCase();
      const phone = (m.phone || '').toLowerCase();
      const email = (m.email || '').toLowerCase();

      const matchesSearch =
        name.includes(q) ||
        nameKm.includes(q) ||
        cat.toLowerCase().includes(q) ||
        city.includes(q) ||
        dist.toLowerCase().includes(q) ||
        addr.includes(q) ||
        phone.includes(q) ||
        email.includes(q);

      return matchesStatus && matchesCategory && matchesDistrict && matchesSearch;
    });
  }, [merchants, filter, categoryFilter, districtFilter, search]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cleanAddress = (addr?: string, dist?: string, city?: string) => {
    if (!addr) return dist ? `${dist}, ${city || 'Phnom Penh'}` : city || 'Phnom Penh';
    let result = addr;
    // Prevent duplicated "Daun Penh, Daun Penh"
    if (dist && !result.toLowerCase().includes(dist.toLowerCase())) {
      result += `, ${dist}`;
    }
    if (city && !result.toLowerCase().includes(city.toLowerCase())) {
      result += `, ${city}`;
    }
    return result;
  };

  return (
    <div className="space-y-6">
      
      {/* KPI Header Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-neutral-900/90 border border-neutral-800/80 rounded-2xl p-4.5 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-semibold">
            <span>Total Partners</span>
            <Store className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1.5 font-mono">{merchants.length}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Verified partner stores</div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800/80 rounded-2xl p-4.5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
            <span>Active &amp; Live</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1.5 font-mono">
            {merchants.filter((m) => (m.status || 'APPROVED') === 'APPROVED').length}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Receiving rescue bag orders</div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800/80 rounded-2xl p-4.5 shadow-sm">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1.5 font-mono">
            {merchants.filter((m) => m.status === 'PENDING').length}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Awaiting compliance sign-off</div>
        </div>

        <div className="bg-neutral-900/90 border border-neutral-800/80 rounded-2xl p-4.5 shadow-sm">
          <div className="flex items-center justify-between text-red-400 text-xs font-semibold">
            <span>Suspended</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-black text-red-400 mt-1.5 font-mono">
            {merchants.filter((m) => m.status === 'SUSPENDED').length}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Paused or inactive</div>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-md animate-fadeIn ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-200'
              : 'bg-red-950/70 border border-red-800 text-red-200'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="cursor-pointer font-bold px-2 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Control Toolbar */}
      <div className="bg-neutral-900/95 border border-neutral-800/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800/80 text-xs font-semibold">
          {(['ALL', 'APPROVED', 'PENDING', 'SUSPENDED'] as const).map((tab) => {
            const count = tab === 'ALL' ? merchants.length : merchants.filter((m) => (m.status || 'APPROVED') === tab).length;
            const isActive = filter === tab;
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`}
              >
                {tab} <span className={`text-[10px] ml-1 font-mono ${isActive ? 'text-white/80' : 'text-neutral-500'}`}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* Filters & View Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search partner, location, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-medium text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500 w-56 sm:w-64"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-medium text-neutral-300 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* District Filter */}
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-medium text-neutral-300 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">All Locations</option>
            {districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('TABLE')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'TABLE' ? 'bg-neutral-800 text-emerald-400 shadow-xs' : 'text-neutral-500 hover:text-neutral-300'
              }`}
              title="Table View"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('GRID')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'GRID' ? 'bg-neutral-800 text-emerald-400 shadow-xs' : 'text-neutral-500 hover:text-neutral-300'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchMerchants}
            disabled={loading}
            className="p-2 rounded-xl bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer transition-all"
            title="Refresh List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>

      </div>

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-12 text-center space-y-3 shadow-md">
          <Store className="w-12 h-12 text-neutral-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Matching Merchants Found</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Try adjusting your search terms or resetting the status and location filters.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setFilter('ALL');
              setCategoryFilter('ALL');
              setDistrictFilter('ALL');
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-all shadow-xs"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* TABLE / LIST VIEW (Clean, High-Density, Easy To Scan) */}
      {viewMode === 'TABLE' && filtered.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800/90 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-neutral-950/90 text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">Merchant Partner</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">Category</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">Location / District</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">Contact &amp; Hours</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">Rating</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]">Status</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70">
                {filtered.map((m) => {
                  const name = m.businessName || m.name || 'Unnamed Merchant';
                  const nameKm = m.businessName_km;
                  const category = m.businessType || m.category || 'Food & Bakery';
                  const image = m.logoUrl || m.coverUrl || m.imageUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200';
                  const status = m.status || 'APPROVED';
                  const rating = typeof m.rating === 'number' ? m.rating.toFixed(1) : '4.9';
                  const reviews = m.reviewCount || 0;
                  const location = cleanAddress(m.address, m.district, m.city);

                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMerchant(m)}
                      className="hover:bg-neutral-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Merchant Identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={image}
                            alt={name}
                            className="w-10 h-10 rounded-xl object-cover border border-neutral-800 shrink-0 bg-neutral-950"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200';
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-white group-hover:text-emerald-400 transition-colors text-sm truncate max-w-[220px]">
                              {name}
                            </div>
                            {nameKm && (
                              <div className="text-[11px] text-emerald-400/90 font-khmer truncate max-w-[220px]">
                                {nameKm}
                              </div>
                            )}
                            <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                              ID: {m.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-neutral-950 border border-neutral-800 text-neutral-300">
                          {category}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-1.5 max-w-[240px]">
                          <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                          <span className="text-neutral-300 line-clamp-2 text-xs leading-relaxed">{location}</span>
                        </div>
                      </td>

                      {/* Contact & Hours */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="space-y-0.5 text-neutral-400 text-xs">
                          {m.phone && <div className="font-mono text-neutral-300">{m.phone}</div>}
                          {m.openingHours && (
                            <div className="flex items-center gap-1 text-neutral-500 text-[11px]">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{m.openingHours}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Rating */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span className="font-bold text-white text-xs">{rating}</span>
                          <span className="text-neutral-500 text-[11px]">({reviews})</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            status === 'APPROVED'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                              : status === 'PENDING'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                              : 'bg-red-500/15 text-red-400 border border-red-500/25'
                          }`}
                        >
                          {status}
                        </span>
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedMerchant(m)}
                            className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                          >
                            Details
                          </button>

                          {status === 'APPROVED' && (
                            <button
                              onClick={() => handleUpdateStatus(m.id, 'SUSPENDED', 'Policy review')}
                              className="p-1.5 rounded-lg bg-neutral-950 border border-neutral-800 hover:bg-amber-950/60 hover:border-amber-700/50 hover:text-amber-300 text-neutral-500 transition-all cursor-pointer"
                              title="Suspend Partner"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {status === 'SUSPENDED' && (
                            <button
                              onClick={() => handleUpdateStatus(m.id, 'APPROVED')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Activate</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GRID CARD VIEW */}
      {viewMode === 'GRID' && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const name = m.businessName || m.name || 'Unnamed Merchant';
            const nameKm = m.businessName_km;
            const category = m.businessType || m.category || 'Food & Bakery';
            const image = m.logoUrl || m.coverUrl || m.imageUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200';
            const status = m.status || 'APPROVED';
            const rating = typeof m.rating === 'number' ? m.rating.toFixed(1) : '4.9';
            const reviews = m.reviewCount || 0;
            const location = cleanAddress(m.address, m.district, m.city);

            return (
              <div
                key={m.id}
                onClick={() => setSelectedMerchant(m)}
                className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700/90 rounded-2xl p-4.5 space-y-3.5 transition-all shadow-md flex flex-col justify-between cursor-pointer group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={image}
                        alt={name}
                        className="w-11 h-11 rounded-xl object-cover border border-neutral-800 shrink-0 bg-neutral-950"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200';
                        }}
                      />
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                          {name}
                        </h4>
                        {nameKm && <div className="text-[11px] text-emerald-400/90 font-khmer truncate">{nameKm}</div>}
                        <div className="text-xs text-neutral-400 font-medium">{category}</div>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                        status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-neutral-400 pt-1">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{location}</span>
                    </div>

                    {m.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span className="font-mono text-neutral-300">{m.phone}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4 pt-1">
                      <div className="flex items-center gap-1 text-amber-400 font-bold text-xs">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{rating}</span>
                        <span className="text-neutral-500 text-[10px]">({reviews})</span>
                      </div>

                      {m.openingHours && (
                        <div className="flex items-center gap-1 text-neutral-500 text-[11px]">
                          <Clock className="w-3 h-3" />
                          <span>{m.openingHours}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[10px] font-mono text-neutral-500">ID: {m.id}</span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedMerchant(m)}
                      className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                    >
                      Manage
                    </button>

                    {status === 'APPROVED' && (
                      <button
                        onClick={() => handleUpdateStatus(m.id, 'SUSPENDED', 'Policy review')}
                        className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 hover:bg-amber-950/60 hover:text-amber-300 hover:border-amber-500/30 text-neutral-400 text-xs font-bold transition-all cursor-pointer"
                      >
                        Suspend
                      </button>
                    )}

                    {status === 'SUSPENDED' && (
                      <button
                        onClick={() => handleUpdateStatus(m.id, 'APPROVED')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Re-Activate</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL DRAWER / MODAL */}
      {selectedMerchant && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6 p-6 sm:p-8">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-4">
                <img
                  src={selectedMerchant.logoUrl || selectedMerchant.coverUrl || 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200'}
                  alt={selectedMerchant.businessName}
                  className="w-14 h-14 rounded-2xl object-cover border border-neutral-800 bg-neutral-950"
                />
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>{selectedMerchant.businessName || selectedMerchant.name}</span>
                    <button
                      onClick={() => copyToClipboard(selectedMerchant.id, 'modal_id')}
                      className="text-neutral-500 hover:text-neutral-300 text-xs flex items-center gap-1 font-mono"
                      title="Copy ID"
                    >
                      {copiedId === 'modal_id' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </h3>
                  {selectedMerchant.businessName_km && (
                    <div className="text-xs text-emerald-400 font-khmer">{selectedMerchant.businessName_km}</div>
                  )}
                  <div className="text-xs text-neutral-400 mt-0.5">{selectedMerchant.businessType || selectedMerchant.category}</div>
                </div>
              </div>

              <button
                onClick={() => setSelectedMerchant(null)}
                className="p-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Merchant Details Content */}
            <div className="space-y-4 text-xs">
              
              {/* Description */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800/80 space-y-2">
                <span className="font-bold text-neutral-300 uppercase tracking-wider text-[10px]">Store Bio &amp; Surplus Policy</span>
                <p className="text-neutral-300 leading-relaxed">{selectedMerchant.description || selectedMerchant.description_en || 'No description provided.'}</p>
                {selectedMerchant.description_km && (
                  <p className="text-neutral-400 leading-relaxed font-khmer pt-1 border-t border-neutral-900">{selectedMerchant.description_km}</p>
                )}
              </div>

              {/* Grid Properties */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 space-y-1">
                  <span className="text-neutral-500 text-[10px] uppercase font-bold">Address &amp; District</span>
                  <div className="text-neutral-200 font-medium">{cleanAddress(selectedMerchant.address, selectedMerchant.district, selectedMerchant.city)}</div>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 space-y-1">
                  <span className="text-neutral-500 text-[10px] uppercase font-bold">Opening Hours &amp; Pickup Window</span>
                  <div className="text-neutral-200 font-medium">
                    {selectedMerchant.openingHours || 'Standard Operating Hours'}
                    {selectedMerchant.pickupWindowDefault && (
                      <span className="text-emerald-400 ml-1 font-mono">({selectedMerchant.pickupWindowDefault})</span>
                    )}
                  </div>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 space-y-1">
                  <span className="text-neutral-500 text-[10px] uppercase font-bold">Phone Number</span>
                  <div className="text-neutral-200 font-mono">{selectedMerchant.phone || 'N/A'}</div>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 space-y-1">
                  <span className="text-neutral-500 text-[10px] uppercase font-bold">Email Address</span>
                  <div className="text-neutral-200 font-mono truncate">{selectedMerchant.email || 'N/A'}</div>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 space-y-1">
                  <span className="text-neutral-500 text-[10px] uppercase font-bold">GPS Coordinates</span>
                  <div className="text-neutral-200 font-mono">
                    {selectedMerchant.latitude && selectedMerchant.longitude
                      ? `${selectedMerchant.latitude}, ${selectedMerchant.longitude}`
                      : 'Not configured'}
                  </div>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 space-y-1">
                  <span className="text-neutral-500 text-[10px] uppercase font-bold">Rating &amp; Reputation</span>
                  <div className="text-neutral-200 flex items-center gap-1.5 font-bold">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>{selectedMerchant.rating || 5.0}</span>
                    <span className="text-neutral-500 font-normal">({selectedMerchant.reviewCount || 0} reviews)</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-neutral-800 flex items-center justify-between gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                (selectedMerchant.status || 'APPROVED') === 'APPROVED'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : selectedMerchant.status === 'PENDING'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                Current: {selectedMerchant.status || 'APPROVED'}
              </span>

              <div className="flex items-center gap-2">
                {(selectedMerchant.status || 'APPROVED') === 'APPROVED' ? (
                  <button
                    onClick={() => handleUpdateStatus(selectedMerchant.id, 'SUSPENDED', 'Policy review')}
                    className="px-4 py-2 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-300 hover:bg-amber-900 text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Suspend Partner</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateStatus(selectedMerchant.id, 'APPROVED')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve &amp; Activate</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedMerchant(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-950 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold cursor-pointer transition-all"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
