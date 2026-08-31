import React, { useState, useEffect } from 'react';
import { TableMeta } from '../types';
import { adminApi } from '../services/api';
import {
  Database,
  Table as TableIcon,
  Plus,
  Trash2,
  Edit3,
  Search,
  RefreshCw,
  Play,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronRight,
  Code,
  Terminal,
  Layers,
  ArrowUpDown,
  FileSpreadsheet,
  Clock,
  Key,
  ChevronLeft,
  Filter,
} from 'lucide-react';

export const DatabaseStudioView: React.FC = () => {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('merchants');
  const [tableSearch, setTableSearch] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [currentTableMeta, setCurrentTableMeta] = useState<TableMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Sorting & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<string>('');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRows, setTotalRows] = useState(0);

  // Active Tab: 'DATA' | 'SQL_CONSOLE' | 'SCHEMA'
  const [activeTab, setActiveTab] = useState<'DATA' | 'SQL_CONSOLE' | 'SCHEMA'>('DATA');

  // SQL Console state
  const [customSql, setCustomSql] = useState<string>('SELECT * FROM merchants LIMIT 10;');
  const [sqlResult, setSqlResult] = useState<any | null>(null);
  const [sqlLoading, setSqlLoading] = useState(false);

  // Modal States
  const [editModalRow, setEditModalRow] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  // 1. Fetch All Tables Metadata
  const fetchTables = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getTables();
      setTables(data);
      if (!selectedTable && data.length > 0) {
        setSelectedTable(data[0].name);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // 2. Fetch Selected Table Rows
  const fetchTableRows = async (tableName: string, currentPage = page) => {
    if (!tableName) return;
    try {
      setLoading(true);
      setError(null);
      const res = await adminApi.getTableRows(tableName, {
        search: searchQuery,
        orderBy: sortCol,
        orderDir: sortDir,
        page: currentPage,
        limit: pageSize,
      });

      setRows(res.data || []);
      setTotalRows(res.pagination?.total || 0);

      const matchedMeta = tables.find((t) => t.name === tableName);
      if (matchedMeta) setCurrentTableMeta(matchedMeta);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTable) {
      setPage(1);
      fetchTableRows(selectedTable, 1);
    }
  }, [selectedTable, searchQuery, sortCol, sortDir, pageSize]);

  useEffect(() => {
    const matchedMeta = tables.find((t) => t.name === selectedTable);
    if (matchedMeta) setCurrentTableMeta(matchedMeta);
  }, [selectedTable, tables]);

  // Execute Custom SQL
  const handleExecuteSql = async () => {
    if (!customSql.trim()) return;
    try {
      setSqlLoading(true);
      setError(null);
      const result = await adminApi.executeSql(customSql);
      setSqlResult(result);
      setSuccessMsg(`SQL query completed. (${result.rowCount || 0} rows affected)`);
      fetchTables();
    } catch (err: any) {
      setError(err.message);
      setSqlResult(null);
    } finally {
      setSqlLoading(false);
    }
  };

  // Create Row
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await adminApi.createRow(selectedTable, formData);
      setSuccessMsg(`Successfully created record in "${selectedTable}"`);
      setIsAddModalOpen(false);
      setFormData({});
      fetchTableRows(selectedTable);
      fetchTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update Row
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalRow) return;
    const pk = currentTableMeta?.primaryKey || 'id';
    const rowId = editModalRow[pk];

    try {
      setLoading(true);
      setError(null);
      await adminApi.updateRow(selectedTable, rowId, formData);
      setSuccessMsg(`Record #${rowId} updated in "${selectedTable}"`);
      setEditModalRow(null);
      setFormData({});
      fetchTableRows(selectedTable);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete Row
  const handleDeleteRow = async () => {
    if (!deleteConfirmRow) return;
    const pk = currentTableMeta?.primaryKey || 'id';
    const rowId = deleteConfirmRow[pk];

    try {
      setLoading(true);
      setError(null);
      await adminApi.deleteRow(selectedTable, rowId);
      setSuccessMsg(`Deleted record #${rowId} from "${selectedTable}"`);
      setDeleteConfirmRow(null);
      fetchTableRows(selectedTable);
      fetchTables();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export Table Data to CSV
  const handleExportCSV = () => {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedTable}_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (colName: string) => {
    if (sortCol === colName) {
      setSortDir(sortDir === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortCol(colName);
      setSortDir('ASC');
    }
  };

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Top Banner Alert Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs font-semibold flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Studio Grid: Left Sidebar (Tables) & Right Panel (Data & SQL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Tables Navigator */}
        <div className="lg:col-span-3 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Database Tables</span>
            </div>
            <button
              onClick={fetchTables}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Refresh tables"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search Tables */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tables..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-medium text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Tables List */}
          <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
            {filteredTables.map((tbl) => {
              const isSelected = selectedTable === tbl.name;
              return (
                <button
                  key={tbl.name}
                  onClick={() => {
                    setSelectedTable(tbl.name);
                    setActiveTab('DATA');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TableIcon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    <span className="truncate font-mono">{tbl.name}</span>
                  </div>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                    {tbl.rowCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Studio Work Area */}
        <div className="lg:col-span-9 space-y-4">
          
          {/* Header Toolbar */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-500 uppercase">Active Table:</span>
                <span className="text-sm font-black text-white font-mono bg-neutral-950 px-2.5 py-1 rounded-lg border border-neutral-800">
                  {selectedTable}
                </span>
                <span className="text-xs text-neutral-400 font-medium">
                  ({totalRows} rows)
                </span>
              </div>
            </div>

            {/* Mode Tabs */}
            <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              <button
                onClick={() => setActiveTab('DATA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'DATA'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Data Grid</span>
              </button>
              <button
                onClick={() => setActiveTab('SQL_CONSOLE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'SQL_CONSOLE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>SQL Console</span>
              </button>
              <button
                onClick={() => setActiveTab('SCHEMA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'SCHEMA'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Schema</span>
              </button>
            </div>
          </div>

          {/* TAB 1: DATA GRID VIEW */}
          {activeTab === 'DATA' && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl space-y-4 p-4">
              
              {/* Table Action Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                
                {/* Search in table */}
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={`Filter in ${selectedTable}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-medium text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                {/* Right Actions: Add Row & Export */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFormData({});
                      setIsAddModalOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Insert Record</span>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    disabled={rows.length === 0}
                    className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    title="Export table data to CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>

                  <button
                    onClick={() => fetchTableRows(selectedTable)}
                    className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-all cursor-pointer"
                    title="Reload data"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto border border-neutral-800 rounded-xl max-h-[500px]">
                {rows.length === 0 ? (
                  <div className="p-12 text-center text-neutral-500 space-y-2">
                    <TableIcon className="w-8 h-8 mx-auto text-neutral-600" />
                    <p className="text-xs font-semibold">No records found for table "{selectedTable}"</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-neutral-950 text-neutral-400 sticky top-0 z-10 border-b border-neutral-800">
                      <tr>
                        <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-center w-24">
                          Actions
                        </th>
                        {currentTableMeta?.columns.map((col) => (
                          <th
                            key={col.name}
                            onClick={() => handleSort(col.name)}
                            className="p-3 font-bold uppercase tracking-wider text-[11px] hover:text-white transition-colors cursor-pointer select-none whitespace-nowrap"
                          >
                            <div className="flex items-center gap-1.5">
                              {col.isPrimary && <Key className="w-3 h-3 text-amber-400" />}
                              <span>{col.name}</span>
                              <ArrowUpDown className="w-3 h-3 text-neutral-600" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60 font-mono">
                      {rows.map((row, idx) => {
                        const pk = currentTableMeta?.primaryKey || 'id';
                        const rowKey = row[pk] || idx;
                        return (
                          <tr
                            key={rowKey}
                            className="hover:bg-neutral-800/40 transition-colors group"
                          >
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditModalRow(row);
                                    setFormData(row);
                                  }}
                                  className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-emerald-400 cursor-pointer"
                                  title="Edit Row"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmRow(row)}
                                  className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-red-400 cursor-pointer"
                                  title="Delete Row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            {currentTableMeta?.columns.map((col) => {
                              const val = row[col.name];
                              let displayVal = val;
                              if (val === null || val === undefined) {
                                displayVal = <span className="text-neutral-600 italic">null</span>;
                              } else if (typeof val === 'boolean') {
                                displayVal = val ? (
                                  <span className="text-emerald-400 font-bold">true</span>
                                ) : (
                                  <span className="text-red-400 font-bold">false</span>
                                );
                              } else if (typeof val === 'object') {
                                displayVal = (
                                  <span className="text-neutral-400 max-w-xs truncate inline-block" title={JSON.stringify(val)}>
                                    {JSON.stringify(val)}
                                  </span>
                                );
                              } else {
                                displayVal = (
                                  <span className="text-neutral-200 max-w-sm truncate inline-block">
                                    {String(val)}
                                  </span>
                                );
                              }

                              return (
                                <td key={col.name} className="p-3 text-neutral-300 whitespace-nowrap">
                                  {displayVal}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center justify-between pt-2 text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <span>Page {page} of {Math.max(1, Math.ceil(totalRows / pageSize))}</span>
                  <span>•</span>
                  <span>Total: {totalRows} records</span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white"
                  >
                    <option value={10}>10 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>

                  <button
                    onClick={() => {
                      if (page > 1) {
                        setPage(page - 1);
                        fetchTableRows(selectedTable, page - 1);
                      }
                    }}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 cursor-pointer text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (page < Math.ceil(totalRows / pageSize)) {
                        setPage(page + 1);
                        fetchTableRows(selectedTable, page + 1);
                      }
                    }}
                    disabled={page >= Math.ceil(totalRows / pageSize)}
                    className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 cursor-pointer text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: SQL CONSOLE VIEW */}
          {activeTab === 'SQL_CONSOLE' && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4 shadow-xl">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-bold text-xs">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>Direct PostgreSQL Query Runner</span>
                  </div>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    PostgreSQL 15+ compatible
                  </span>
                </div>

                <textarea
                  value={customSql}
                  onChange={(e) => setCustomSql(e.target.value)}
                  rows={5}
                  placeholder="SELECT * FROM merchants LIMIT 10;"
                  className="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-mono text-emerald-300 placeholder:text-neutral-700 focus:outline-hidden focus:border-emerald-500 leading-relaxed resize-y"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCustomSql(`SELECT * FROM users LIMIT 10;`)}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono text-neutral-300 cursor-pointer"
                    >
                      Users
                    </button>
                    <button
                      onClick={() => setCustomSql(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;`)}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono text-neutral-300 cursor-pointer"
                    >
                      Recent Orders
                    </button>
                    <button
                      onClick={() => setCustomSql(`SELECT * FROM rescue_bags WHERE status = 'AVAILABLE';`)}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono text-neutral-300 cursor-pointer"
                    >
                      Available Bags
                    </button>
                  </div>

                  <button
                    onClick={handleExecuteSql}
                    disabled={sqlLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{sqlLoading ? 'Executing...' : 'Run Query'}</span>
                  </button>
                </div>
              </div>

              {/* SQL Result Output */}
              {sqlResult && (
                <div className="space-y-2 pt-2 border-t border-neutral-800">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span className="font-bold text-white">Query Results</span>
                    <span className="font-mono">
                      {sqlResult.rows?.length || 0} rows returned
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-neutral-800 rounded-xl max-h-[400px]">
                    {sqlResult.rows && sqlResult.rows.length > 0 ? (
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead className="bg-neutral-950 text-neutral-400 sticky top-0">
                          <tr>
                            {Object.keys(sqlResult.rows[0]).map((col) => (
                              <th key={col} className="p-2.5 font-bold uppercase tracking-wider text-[11px] border-b border-neutral-800">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                          {sqlResult.rows.map((r: any, idx: number) => (
                            <tr key={idx} className="hover:bg-neutral-800/40">
                              {Object.keys(sqlResult.rows[0]).map((col) => (
                                <td key={col} className="p-2.5 text-neutral-300 whitespace-nowrap">
                                  {typeof r[col] === 'object' ? JSON.stringify(r[col]) : String(r[col] ?? 'null')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-neutral-500 text-xs">
                        Statement executed successfully. No tabular rows to display.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SCHEMA INSPECTOR */}
          {activeTab === 'SCHEMA' && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Column Definitions for Table: <span className="font-mono text-emerald-400">{selectedTable}</span></span>
              </div>

              <div className="overflow-x-auto border border-neutral-800 rounded-xl">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="bg-neutral-950 text-neutral-400">
                    <tr>
                      <th className="p-3 font-bold">Column Name</th>
                      <th className="p-3 font-bold">Data Type</th>
                      <th className="p-3 font-bold">Nullable</th>
                      <th className="p-3 font-bold">Primary Key</th>
                      <th className="p-3 font-bold">Default Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {currentTableMeta?.columns.map((col) => (
                      <tr key={col.name} className="hover:bg-neutral-800/40">
                        <td className="p-3 font-bold text-white flex items-center gap-1.5">
                          {col.isPrimary && <Key className="w-3.5 h-3.5 text-amber-400" />}
                          <span>{col.name}</span>
                        </td>
                        <td className="p-3 text-emerald-400">{col.type}</td>
                        <td className="p-3">
                          {col.nullable ? (
                            <span className="text-neutral-400">YES</span>
                          ) : (
                            <span className="text-amber-400 font-bold">NO</span>
                          )}
                        </td>
                        <td className="p-3">
                          {col.isPrimary ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">PRIMARY KEY</span>
                          ) : (
                            <span className="text-neutral-600">-</span>
                          )}
                        </td>
                        <td className="p-3 text-neutral-400">
                          {col.defaultValue || <span className="text-neutral-600 italic">none</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* MODAL: ADD RECORD */}
      {isAddModalOpen && currentTableMeta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Insert Record into <span className="font-mono text-emerald-400">{selectedTable}</span>
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-neutral-500 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentTableMeta.columns.map((col) => {
                if (col.isPrimary && col.name === 'id' && !formData[col.name]) {
                  // Can optionally pre-generate ID or leave for input
                }
                return (
                  <div key={col.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-300 font-mono flex items-center gap-1">
                        {col.name}
                        {col.isPrimary && <span className="text-[10px] text-amber-400 font-normal">(Primary Key)</span>}
                      </label>
                      <span className="text-[11px] text-neutral-500 font-mono">{col.type}</span>
                    </div>
                    <input
                      type="text"
                      placeholder={`Value for ${col.name}...`}
                      value={formData[col.name] !== undefined ? String(formData[col.name]) : ''}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                );
              })}

              <div className="pt-4 border-t border-neutral-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Row</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT RECORD */}
      {editModalRow && currentTableMeta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Edit Record in <span className="font-mono text-emerald-400">{selectedTable}</span>
                </h3>
              </div>
              <button
                onClick={() => setEditModalRow(null)}
                className="text-neutral-500 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentTableMeta.columns.map((col) => {
                const isPk = col.isPrimary || col.name === 'id';
                const val = formData[col.name];
                const displayVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : (val ?? '');

                return (
                  <div key={col.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-300 font-mono flex items-center gap-1">
                        {col.name}
                        {isPk && <span className="text-[10px] text-amber-400 font-normal">(Read Only PK)</span>}
                      </label>
                      <span className="text-[11px] text-neutral-500 font-mono">{col.type}</span>
                    </div>
                    <input
                      type="text"
                      disabled={isPk}
                      value={displayVal}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-xl text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-hidden ${
                        isPk
                          ? 'bg-neutral-950/60 border-neutral-800 text-neutral-500 cursor-not-allowed'
                          : 'bg-neutral-950 border-neutral-800 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                );
              })}

              <div className="pt-4 border-t border-neutral-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalRow(null)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteConfirmRow && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Confirm Record Deletion</h3>
                <p className="text-xs text-neutral-400">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-300 overflow-x-auto">
              <div>Table: <span className="text-emerald-400">{selectedTable}</span></div>
              <div>Record: <span className="text-amber-400">#{deleteConfirmRow[currentTableMeta?.primaryKey || 'id']}</span></div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmRow(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRow}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
