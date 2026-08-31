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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo & Portal Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-tight text-white">RescueBite</span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Port 3002 • Admin Studio
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">Isolated CRUD &amp; Data Control Center</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
            <button
              onClick={() => setActiveNav('DASHBOARD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeNav === 'DASHBOARD'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveNav('STUDIO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeNav === 'STUDIO'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Database Studio (CRUD)</span>
            </button>

            <button
              onClick={() => setActiveNav('MERCHANTS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeNav === 'MERCHANTS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Merchants</span>
            </button>

            <button
              onClick={() => setActiveNav('LOGS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeNav === 'LOGS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Audit Logs</span>
            </button>
          </nav>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-3">
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              <span>Consumer App (3001)</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <div className="h-4 w-px bg-neutral-800 hidden sm:block" />

            <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-xl border border-neutral-800">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                {currentAdmin.name ? currentAdmin.name[0].toUpperCase() : 'A'}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-bold text-white truncate max-w-[120px]">{currentAdmin.name}</div>
                <div className="text-[10px] text-emerald-400 uppercase font-mono">Admin</div>
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
          <DashboardOverview onNavigateTab={(tab) => setActiveNav(tab)} />
        )}
        {activeNav === 'STUDIO' && <DatabaseStudioView />}
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
