import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { adminApi } from '../services/api';
import { ShieldCheck, Search, RefreshCw, Clock, UserCheck, AlertCircle, FileText } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getAuditLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const q = search.toLowerCase().trim();
  const filtered = logs.filter((l) => {
    if (!q) return true;
    const action = (l.action || '').toLowerCase();
    const target = (l.target || '').toLowerCase();
    const details = (l.details || '').toLowerCase();
    const email = (l.adminEmail || '').toLowerCase();
    return action.includes(q) || target.includes(q) || details.includes(q) || email.includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-white">System Security &amp; Audit Trail</span>
          <span className="text-xs text-neutral-400 font-mono">({logs.length} logged events)</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-medium text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500 w-64"
            />
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white cursor-pointer transition-all"
            title="Refresh Audit Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Timestamp</th>
                <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Admin</th>
                <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Action</th>
                <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Target Entity</th>
                <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Details / Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 font-mono">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-neutral-500 font-sans">
                    {loading ? 'Loading audit records...' : 'No audit log entries recorded yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const dateStr = log.createdAt || log.timestamp;
                  const dateFormatted = dateStr ? new Date(dateStr).toLocaleString() : 'N/A';

                  return (
                    <tr key={log.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="p-3 text-neutral-400 whitespace-nowrap">
                        {dateFormatted}
                      </td>
                      <td className="p-3 text-white font-sans font-semibold whitespace-nowrap">
                        {log.adminEmail || 'System Agent'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                          {log.action || 'OP'}
                        </span>
                      </td>
                      <td className="p-3 text-amber-300 font-semibold whitespace-nowrap">
                        {log.target || '-'}
                      </td>
                      <td className="p-3 text-neutral-300">
                        {log.details || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
