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
      <header className="sticky top-0 z-50 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-white tracking-wide">RescueBite</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PORT 3002 • ADMIN STUDIO
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 font-mono">Isolated CRUD &amp; Data Control Center</p>
            </div>
          </div>

          {/* Primary View Switcher */}
          <nav className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 text-xs font-bold">
            <button
              onClick={() => setActiveNav('DASHBOARD')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeNav === 'DASHBOARD'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveNav('STUDIO')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeNav === 'STUDIO'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Database Studio (CRUD)</span>
            </button>

            <button
              onClick={() => setActiveNav('MERCHANTS')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeNav === 'MERCHANTS'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Merchants</span>
            </button>

            <button
              onClick={() => setActiveNav('LOGS')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                activeNav === 'LOGS'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Audit Logs</span>
            </button>
          </nav>

          {/* Right Links & User Controls */}
          <div className="flex items-center gap-3">
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-neutral-400 hover:text-emerald-400 flex items-center gap-1 transition-colors font-mono hidden md:flex"
            >
              <span>Consumer App (3001)</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <div className="h-4 w-px bg-neutral-800 hidden md:block" />

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center font-black text-xs">
                {currentAdmin.name?.charAt(0) || 'A'}
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-xs font-bold text-white">{currentAdmin.name || 'Admin'}</div>
                <div className="text-[10px] font-mono text-emerald-400">ADMIN</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
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
