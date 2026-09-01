import React, { useState, useEffect } from 'react';
import { User } from './types';
import { adminApi } from './services/api';
import { AdminLogin } from './components/AdminLogin';
import { DatabaseStudioView } from './components/DatabaseStudioView';
import { MerchantManagementView } from './components/MerchantManagementView';
import { AuditLogsView } from './components/AuditLogsView';
import { DashboardOverview } from './components/DashboardOverview';
import {
  Database,
  LayoutDashboard,
  Store,
  ShieldCheck,
  LogOut,
  User as UserIcon,
  Layers,
  Terminal,
  Activity,
  ExternalLink,
} from 'lucide-react';

export default function App() {
  const [currentAdmin, setCurrentAdmin] = useState<User | null>(null);
  const [activeNav, setActiveNav] = useState<'DASHBOARD' | 'STUDIO' | 'MERCHANTS' | 'LOGS'>('DASHBOARD');
  const [selectedTable, setSelectedTable] = useState<string>('merchants');
  const [loading, setLoading] = useState(true);

  // Check existing session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const admin = await adminApi.getCurrentAdmin();
        if (admin) {
          setCurrentAdmin(admin);
        }
      } catch (err) {
        console.warn('Admin session check:', err);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleLogout = () => {
    adminApi.logout();
    setCurrentAdmin(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400 font-mono text-xs">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-400 animate-spin" />
          <span>Verifying RescueBite Admin Access...</span>
        </div>
      </div>
    );
  }

  // Not logged in -> Show dedicated Admin Login Portal
  if (!currentAdmin) {
    return <AdminLogin onLoginSuccess={(admin) => setCurrentAdmin(admin)} />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-neutral-950">
      
      {/* Top Administration Navigation Bar */}
      <header className="sticky top-0 z-50 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800/80 shadow-md">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2.5 sm:py-0 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          
          {/* Logo & Identity */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xs">
              <Database className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs sm:text-sm text-white tracking-tight">RescueBite</span>
                <span className="px-1.5 sm:px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 tracking-wide">
                  Admin Studio
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-neutral-400 font-medium leading-none mt-0.5 hidden xs:block">Database &amp; Platform Operations</p>
            </div>
          </div>

          {/* Primary View Switcher */}
          <nav className="order-3 md:order-2 w-full md:w-auto flex items-center gap-1 sm:gap-1.5 bg-neutral-950/80 p-1 sm:p-1.5 rounded-xl border border-neutral-800/80 text-xs font-semibold overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveNav('DASHBOARD')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 text-xs ${
                activeNav === 'DASHBOARD'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveNav('STUDIO')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 text-xs ${
                activeNav === 'STUDIO'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              <Database className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeNav === 'STUDIO' ? 'text-white' : 'text-emerald-400'}`} />
              <span>Database Studio</span>
            </button>

            <button
              onClick={() => setActiveNav('MERCHANTS')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 text-xs ${
                activeNav === 'MERCHANTS'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400" />
              <span>Merchants</span>
            </button>

            <button
              onClick={() => setActiveNav('LOGS')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 text-xs ${
                activeNav === 'LOGS'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400" />
              <span>Audit Logs</span>
            </button>
          </nav>

          {/* Right Links & User Controls */}
          <div className="order-2 md:order-3 flex items-center gap-2 sm:gap-3 shrink-0">
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-neutral-400 hover:text-emerald-400 flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-neutral-950/60 hover:bg-neutral-900 border border-neutral-800/80 transition-all font-medium whitespace-nowrap shrink-0"
            >
              <span className="hidden sm:inline">Consumer App</span>
              <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
            </a>

            <div className="h-4 w-px bg-neutral-800" />

            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-950/90 border border-emerald-700/60 text-emerald-400 flex items-center justify-center font-bold text-xs shadow-xs">
                {currentAdmin.name?.charAt(0) || 'A'}
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-xs font-bold text-neutral-200 leading-tight">{currentAdmin.name || 'Admin'}</div>
                <div className="text-[10px] font-semibold text-emerald-400 tracking-wider">ADMINISTRATOR</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 sm:p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-400 hover:text-red-400 border border-neutral-700/50 transition-colors cursor-pointer shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeNav === 'DASHBOARD' && (
          <DashboardOverview
            onNavigateTab={(tab, table) => {
              setActiveNav(tab);
              if (table) setSelectedTable(table);
            }}
          />
        )}
        {activeNav === 'STUDIO' && (
          <DatabaseStudioView
            initialTable={selectedTable}
            onSelectTable={(tbl) => setSelectedTable(tbl)}
          />
        )}
        {activeNav === 'MERCHANTS' && <MerchantManagementView />}
        {activeNav === 'LOGS' && <AuditLogsView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-4 text-center text-xs text-neutral-600 font-mono">
        RescueBite Isolated Admin Subsystem • Database CRUD Explorer &amp; Operations
      </footer>

    </div>
  );
}
