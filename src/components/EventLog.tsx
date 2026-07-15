import React, { useState, useRef, useEffect } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import { generatePDFReport } from '../services/report';
import { ClipboardList, Download, FileText, Search, Filter } from 'lucide-react';

type FilterMode = 'all' | 'pass' | 'fail';
type SeverityKey = 'minor' | 'major' | 'critical';

export const EventLog: React.FC = () => {
  const { eventLogs, stats, activeSessionId } = useDashboardStore();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const tbodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top on new events
  useEffect(() => {
    if (tbodyRef.current) tbodyRef.current.scrollTop = 0;
  }, [eventLogs.length]);

  const filtered = eventLogs.filter(log => {
    if (filter === 'pass' && log.status !== 'pass') return false;
    if (filter === 'fail' && log.status !== 'fail') return false;
    if (search) {
      const q = search.toLowerCase();
      if (!log.className.toLowerCase().includes(q) && !log.trackId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ['Time', 'Track ID', 'Class', 'Defect', 'Confidence', 'Status', 'Severity', 'Gate'];
    const rows = eventLogs.map(l => [
      new Date(l.timestamp).toLocaleTimeString(),
      l.trackId,
      l.className,
      l.defectClass || '-',
      `${(l.confidence * 100).toFixed(1)}%`,
      l.status.toUpperCase(),
      l.severity || '-',
      l.zoneName || 'Global',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `scan_log_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    setIsExporting(true);
    try {
      await generatePDFReport(stats, eventLogs);
    } catch (e) {
      alert('PDF export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const severityConfig: Record<SeverityKey, { label: string; color: string }> = {
    critical: { label: 'CRIT',  color: 'text-red-400 bg-red-950/60 border-red-800/50' },
    major:    { label: 'MAJOR', color: 'text-amber-400 bg-amber-950/60 border-amber-800/50' },
    minor:    { label: 'MINOR', color: 'text-yellow-400 bg-yellow-950/60 border-yellow-800/50' },
  };

  const filterButtons: { key: FilterMode; label: string; count: number; color: string }[] = [
    { key: 'all',  label: 'All',      count: eventLogs.length,                                   color: 'text-slate-300 border-slate-700 bg-slate-800' },
    { key: 'pass', label: 'Pass',     count: eventLogs.filter(l => l.status === 'pass').length,  color: 'text-emerald-400 border-emerald-800/50 bg-emerald-950/30' },
    { key: 'fail', label: 'Defects',  count: eventLogs.filter(l => l.status === 'fail').length,  color: 'text-red-400 border-red-800/50 bg-red-950/30' },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-400" />
          <div>
            <h2 className="text-xs font-black text-white">Event Log</h2>
            <p className="text-[9px] text-slate-500">{eventLogs.length} events recorded</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={exportCSV}
            disabled={eventLogs.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white text-[10px] font-bold transition-all disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            <span>CSV</span>
          </button>
          <button onClick={exportPDF}
            disabled={eventLogs.length === 0 || isExporting}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:border-blue-600/50 text-slate-400 hover:text-blue-400 text-[10px] font-bold transition-all disabled:opacity-40"
          >
            <FileText className="h-3 w-3" />
            <span>{isExporting ? '...' : 'PDF'}</span>
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800">
        <Filter className="h-3 w-3 text-slate-600 shrink-0" />
        <div className="flex items-center gap-1 flex-1">
          {filterButtons.map(btn => (
            <button key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[9px] font-black transition-all ${
                filter === btn.key
                  ? btn.color + ' opacity-100'
                  : 'text-slate-500 border-slate-800 bg-transparent hover:text-slate-300'
              }`}
            >
              <span>{btn.label}</span>
              <span className="font-mono opacity-70">({btn.count})</span>
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
          <Search className="h-3 w-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search ID or class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none w-28"
          />
        </div>
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <ClipboardList className="h-8 w-8 text-slate-700" />
          <p className="text-slate-500 text-xs font-bold">
            {eventLogs.length === 0
              ? activeSessionId ? 'Waiting for detections...' : 'Start a session to begin logging'
              : 'No events match your filter'}
          </p>
        </div>
      )}

      {/* ── Table ── */}
      {filtered.length > 0 && (
        <div ref={tbodyRef} className="overflow-y-auto max-h-[420px] custom-scrollbar">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10">
              <tr className="border-b border-slate-800">
                {['Thumb', 'Time', 'Track ID', 'Class', 'Conf.', 'Status', 'Gate'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-black text-[9px] text-slate-600 uppercase tracking-widest whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((log, i) => {
                const isDefect = log.status === 'fail';
                const confPct = Math.round(log.confidence * 100);
                const confColor = confPct >= 80 ? 'bg-emerald-500' : confPct >= 60 ? 'bg-amber-500' : 'bg-red-500';

                return (
                  <tr
                    key={log.id}
                    className={`hover:bg-slate-800/30 transition-colors ${
                      isDefect ? 'bg-red-950/10' : ''
                    } ${i === 0 ? 'animate-slide-in' : ''}`}
                  >
                    {/* Thumbnail */}
                    <td className="px-3 py-1.5">
                      {log.thumbnail
                        ? <img src={log.thumbnail} alt="" className="w-8 h-8 rounded object-cover border border-slate-700" />
                        : <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600 text-[8px]">—</div>
                      }
                    </td>

                    {/* Time */}
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </td>

                    {/* Track ID */}
                    <td className="px-3 py-1.5">
                      <span className="font-mono font-bold text-slate-400">{log.trackId.slice(0, 10)}</span>
                    </td>

                    {/* Class */}
                    <td className="px-3 py-1.5">
                      <span className="capitalize text-slate-300 font-bold">
                        {(log.defectClass || log.className).replace('_', ' ')}
                      </span>
                    </td>

                    {/* Confidence bar */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${confColor} rounded-full transition-all`}
                            style={{ width: `${confPct}%` }} />
                        </div>
                        <span className="font-mono text-slate-500">{confPct}%</span>
                      </div>
                    </td>

                    {/* Status + Severity */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${
                          isDefect
                            ? 'bg-red-950/60 text-red-400 border-red-800/50'
                            : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                        }`}>
                          {isDefect ? 'NG' : 'OK'}
                        </span>
                        {log.severity && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${severityConfig[log.severity as SeverityKey]?.color}`}>
                            {severityConfig[log.severity as SeverityKey]?.label}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Gate */}
                    <td className="px-3 py-1.5">
                      <span className="text-slate-600 font-mono">{log.zoneName || '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
