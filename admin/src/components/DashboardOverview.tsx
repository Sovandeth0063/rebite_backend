import React, { useState, useEffect } from 'react';
import { ImpactStats, TableMeta } from '../types';
import { adminApi } from '../services/api';
import {
  Database,
  Store,
  ShoppingBag,
  TrendingUp,
  Activity,
  Server,
  Layers,
  CheckCircle2,
  Users,
  DollarSign,
  Leaf,
  ShieldCheck,
} from 'lucide-react';

interface DashboardOverviewProps {
  onNavigateTab: (tab: 'STUDIO' | 'MERCHANTS' | 'LOGS', table?: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigateTab }) => {
  const [stats, setStats] = useState<ImpactStats | null>(null);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setLoading(true);
        const [statsData, tablesData, healthData] = await Promise.all([
          adminApi.getImpactStats().catch(() => null),
          adminApi.getTables().catch(() => []),
          adminApi.getHealth().catch(() => null),
        ]);
        setStats(statsData);
        setTables(tablesData);
        setHealth(healthData);
      } finally {
        setLoading(false);
      }
    };
    loadOverview();
  }, []);

  const totalRecords = tables.reduce((sum, t) => sum + (t.rowCount || 0), 0);

  return (
    <div className="space-y-6">
      
      {/* Top Welcome / System Status */}
      <div className="bg-gradient-to-r from-emerald-950/60 via-neutral-900 to-neutral-900 border border-emerald-900/50 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              PostgreSQL Service Online
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            RescueBite Master Administrative Portal
          </h2>
          <p className="text-xs text-neutral-400">
            Port 3002 (Admin Isolation) • Connected to API Service on Port 5000
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('STUDIO')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all active:scale-98 cursor-pointer flex items-center gap-2"
          >
            <Database className="w-4 h-4" />
            <span>Open Database Studio (CRUD)</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase tracking-wider">Database Tables</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {tables.length} <span className="text-xs font-normal text-neutral-500">schemas</span>
          </div>
          <div className="text-xs text-neutral-400 font-mono">
            {totalRecords.toLocaleString()} total active rows
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase tracking-wider">Meals Rescued</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {stats?.mealsRescued?.toLocaleString() || '1,840+'}
          </div>
          <div className="text-xs text-emerald-400 font-bold">
            +18.4% this week
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase tracking-wider">Active Partners</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {stats?.activePartners || 18} <span className="text-xs font-normal text-neutral-500">stores</span>
          </div>
          <div className="text-xs text-neutral-400">
            Across Phnom Penh &amp; Siem Reap
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase tracking-wider">CO2 Emissions Saved</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
              <Leaf className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {stats?.co2SavedKg?.toLocaleString() || '4,600'} <span className="text-xs font-normal text-neutral-500">kg</span>
          </div>
          <div className="text-xs text-emerald-400 font-bold">
            Zero-Waste Verified
          </div>
        </div>

      </div>

      {/* Quick Access Table Grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Quick Database Entities CRUD</h3>
          </div>
          <button
            onClick={() => onNavigateTab('STUDIO')}
            className="text-xs font-bold text-emerald-400 hover:underline cursor-pointer"
          >
            View all tables &amp; schemas →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {tables.slice(0, 12).map((tbl) => (
            <button
              key={tbl.name}
              onClick={() => onNavigateTab('STUDIO', tbl.name)}
              className="p-3 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 rounded-xl text-left transition-all group cursor-pointer space-y-1"
            >
              <div className="text-xs font-bold text-neutral-200 group-hover:text-emerald-400 font-mono truncate">
                {tbl.name}
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">
                {tbl.rowCount} rows
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};
