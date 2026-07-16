import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import {
  Image, ShieldCheck, ShieldAlert, Download,
  ZoomIn, ZoomOut, Search, Clock, X,
  Play, Pause, CheckSquare, Square, RefreshCw,
  Eye
} from 'lucide-react';
import JSZip from 'jszip';
import type { EventLogItem } from '../types';

export const GalleryPanel: React.FC = () => {
  const { eventLogs } = useDashboardStore();

  // Local state for filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'fail'>('all');
  const [defectTypeFilter, setDefectTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [paused, setPaused] = useState(false);
  
  // Frozen snapshot state to pause updates
  const [logsSnapshot, setLogsSnapshot] = useState<EventLogItem[]>([]);

  // Sync logs when not paused
  useEffect(() => {
    if (!paused) {
      setLogsSnapshot(eventLogs);
    }
  }, [eventLogs, paused]);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal Details State
  const [previewItem, setPreviewItem] = useState<EventLogItem | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isReplaying, setIsReplaying] = useState(false);

  // Extract unique defect types from history for selector dropdown
  const uniqueDefectTypes = useMemo(() => {
    const types = new Set<string>();
    eventLogs.forEach(l => {
      const cls = l.defectClass || l.className;
      if (cls && cls !== 'electronic_board') {
        types.add(cls);
      }
    });
    return Array.from(types);
  }, [eventLogs]);

  // Handle updates sync on unpause
  const handlePauseToggle = () => {
    if (paused) {
      // Syncing
      setLogsSnapshot(eventLogs);
    }
    setPaused(!paused);
  };

  // Filtered logs computation
  const filteredLogs = useMemo(() => {
    return logsSnapshot.filter(log => {
      // 1. Status Filter
      if (statusFilter === 'pass' && log.status !== 'pass') return false;
      if (statusFilter === 'fail' && log.status !== 'fail') return false;

      // 2. Defect Type Filter
      if (defectTypeFilter !== 'all') {
        const cls = log.defectClass || log.className;
        if (cls !== defectTypeFilter) return false;
      }

      // 3. Severity Filter
      if (severityFilter !== 'all') {
        if (log.severity !== severityFilter) return false;
      }

      // 4. Search Query (ID or label)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesId = log.trackId.toLowerCase().includes(q);
        const label = log.defectClass || log.className;
        const matchesLabel = label.toLowerCase().includes(q);
        const matchesGate = log.zoneName && log.zoneName.toLowerCase().includes(q);
        if (!matchesId && !matchesLabel && !matchesGate) return false;
      }

      return true;
    });
  }, [logsSnapshot, statusFilter, defectTypeFilter, severityFilter, searchQuery]);

  // Live Summary calculation
  const totalCount = logsSnapshot.length;
  const failCount = logsSnapshot.filter(l => l.status === 'fail').length;
  const passCount = totalCount - failCount;
  const defectRate = totalCount > 0 ? (failCount / totalCount) * 100 : 0;

  // Toggle single selection
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Toggle all visible items
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLogs.length) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      filteredLogs.forEach(l => next.add(l.id));
      setSelectedIds(next);
    }
  };

  // Helper to convert dataURL to Blob
  const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  // Bulk ZIP download helper
  const handleBulkExport = async () => {
    if (selectedIds.size === 0) return;
    const zip = new JSZip();
    const metadataList: any[] = [];

    const selectedLogs = logsSnapshot.filter(l => selectedIds.has(l.id));

    selectedLogs.forEach((log) => {
      const filename = `product_${log.trackId}_${log.status}_${log.timestamp}.jpg`;
      
      // Save metadata list
      metadataList.push({
        id: log.id,
        trackId: log.trackId,
        timestamp: new Date(log.timestamp).toISOString(),
        status: log.status,
        className: log.className,
        defectClass: log.defectClass || 'N/A',
        severity: log.severity || 'N/A',
        confidence: log.confidence,
        gateName: log.zoneName || 'Global'
      });

      // Add image to zip if present
      if (log.thumbnail) {
        try {
          const blob = dataURLtoBlob(log.thumbnail);
          zip.file(`images/${filename}`, blob);
        } catch (e) {
          console.error(`Failed to pack crop for ${log.trackId}:`, e);
        }
      }
    });

    // Add JSON metadata
    zip.file('metadata.json', JSON.stringify(metadataList, null, 2));

    // Add CSV metadata
    const headers = ['ID', 'Track ID', 'Timestamp', 'Status', 'Class', 'Defect Class', 'Severity', 'Confidence', 'Gate'];
    const csvContent = [
      headers.join(','),
      ...metadataList.map(m => [
        m.id, m.trackId, m.timestamp, m.status, m.className,
        `"${m.defectClass}"`, m.severity, m.confidence, m.gateName
      ].join(','))
    ].join('\n');
    zip.file('metadata.csv', csvContent);

    // Generate zip blob
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex_gallery_export_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-scroll anchor
  const listEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!paused && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsSnapshot.length, paused]);

  return (
    <div className="flex flex-col gap-4">

      {/* ── 1. GALLERY SUMMARY METRICS ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/60 backdrop-blur border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Total Captured</span>
          <p className="text-2xl font-black text-white font-mono leading-none mt-1.5">{totalCount}</p>
          <span className="text-[9px] text-slate-500 mt-1">all snapshots in current viewport</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Passed (OK)</span>
          <p className="text-2xl font-black text-emerald-400 font-mono leading-none mt-1.5">{passCount}</p>
          <span className="text-[9px] text-slate-500 mt-1">quality check approved</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Defective (NG)</span>
          <p className="text-2xl font-black text-red-400 font-mono leading-none mt-1.5">{failCount}</p>
          <span className="text-[9px] text-slate-500 mt-1">flagged anomalies</span>
        </div>

        <div className="flex flex-col">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Defect Rate</span>
          <p className="text-2xl font-black text-amber-500 font-mono leading-none mt-1.5">{defectRate.toFixed(1)}%</p>
          <span className="text-[9px] text-slate-500 mt-1">running defect ratio</span>
        </div>
      </div>

      {/* ── 2. FILTER BAR CONTROLS ───────────────────── */}
      <div className="flex flex-col lg:flex-row gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        
        {/* Left Side: Status Toggles + Live Pause */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Buttons */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all ${
                statusFilter === 'all'
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setStatusFilter('pass')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all ${
                statusFilter === 'pass'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Passed
            </button>
            <button
              onClick={() => setStatusFilter('fail')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition-all ${
                statusFilter === 'fail'
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Defects
            </button>
          </div>

          {/* Pause Toggle */}
          <button
            onClick={handlePauseToggle}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase transition-all ${
              paused
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title={paused ? "Click to resume live feeds" : "Pause feed changes while viewing"}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span>{paused ? 'Live Updates Paused' : 'Pause Live Updates'}</span>
          </button>
        </div>

        {/* Right Side: Selectors, Search, Export */}
        <div className="flex flex-wrap lg:ml-auto items-center gap-2">
          {/* Defect Type Dropdown */}
          <select
            value={defectTypeFilter}
            onChange={e => setDefectTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[10px] text-slate-300 font-bold focus:outline-none"
          >
            <option value="all">🔍 All Classes</option>
            {uniqueDefectTypes.map(t => (
              <option key={t} value={t}>📦 {t.replace('_', ' ')}</option>
            ))}
          </select>

          {/* Severity Dropdown */}
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[10px] text-slate-300 font-bold focus:outline-none"
          >
            <option value="all">🚨 All Severities</option>
            <option value="critical">🔴 Critical Only</option>
            <option value="major">🟠 Major Only</option>
            <option value="minor">🟡 Minor Only</option>
          </select>

          {/* ID Search Input */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-600" />
            <input
              type="text"
              placeholder="Search ID/Gate..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent text-[10px] text-slate-300 font-bold placeholder:text-slate-600 focus:outline-none w-28 lg:w-36"
            />
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition-all"
            >
              {selectedIds.size === filteredLogs.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              <span>{selectedIds.size === filteredLogs.length ? 'Clear All' : 'Select All'}</span>
            </button>
            
            <button
              onClick={handleBulkExport}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-blue-500 text-white text-[10px] font-bold shadow-lg shadow-blue-500/10 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export ({selectedIds.size})</span>
            </button>
          </div>
        </div>

      </div>

      {/* ── 3. RESPONSIBLE GRID MASONRY LAYOUT ─────────── */}
      {filteredLogs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
          <Image className="h-10 w-10 text-slate-700" />
          <p className="text-slate-500 text-xs font-black">No matching products found</p>
          <p className="text-[10px] text-slate-600 max-w-xs">
            Either there are no detections yet or none match your selected search queries & active filter options.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredLogs.map((log) => {
            const isDefect = log.status === 'fail';
            const isSelected = selectedIds.has(log.id);

            return (
              <div
                key={log.id}
                onClick={() => setPreviewItem(log)}
                className={`relative group bg-slate-900 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                  isSelected
                    ? 'border-blue-500 ring-1 ring-blue-500'
                    : isDefect
                    ? 'border-red-500/30 hover:border-red-500/50'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Crop Image Wrapper */}
                <div className="relative aspect-square bg-slate-950 overflow-hidden flex items-center justify-center border-b border-slate-800/80">
                  {log.thumbnail ? (
                    <img
                      src={log.thumbnail}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="text-slate-700 text-[10px] font-mono">[NO IMAGE]</div>
                  )}

                  {/* Bulk Select checkbox overlay */}
                  <button
                    onClick={(e) => toggleSelect(log.id, e)}
                    className={`absolute top-2 left-2 p-1.5 rounded-lg border backdrop-blur transition-all z-10 ${
                      isSelected
                        ? 'bg-blue-500 border-blue-600 text-white'
                        : 'bg-black/40 border-white/10 text-transparent hover:text-white/40'
                    }`}
                  >
                    <CheckSquare className="h-3 w-3" />
                  </button>

                  {/* Quick Preview icon overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="bg-slate-900/90 border border-slate-700 p-2 rounded-xl text-white text-[10px] font-bold flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5 text-blue-400" />
                      <span>Review Details</span>
                    </div>
                  </div>
                </div>

                {/* Card Content details */}
                <div className="p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    {/* Unique Tracker ID */}
                    <span className="font-mono text-[9px] font-bold text-slate-500 uppercase">
                      ID: <span className="text-slate-300">{log.trackId}</span>
                    </span>
                    {/* Timestamp */}
                    <div className="flex items-center gap-1 text-slate-500 text-[8px] font-mono">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-1.5">
                    {isDefect ? (
                      <span className="inline-flex items-center gap-1 bg-red-950/40 border border-red-800/40 px-2 py-0.5 rounded-lg text-[9px] font-black text-red-400">
                        <ShieldAlert className="h-3 w-3" />
                        <span>FAIL (NG)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-lg text-[9px] font-black text-emerald-400">
                        <ShieldCheck className="h-3 w-3" />
                        <span>PASS (OK)</span>
                      </span>
                    )}

                    {/* Defect Class Label */}
                    <span className="text-[9px] text-slate-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded capitalize truncate max-w-[80px]">
                      {(log.defectClass || log.className).replace('_', ' ')}
                    </span>
                  </div>

                  {/* Confidence & Severity metrics */}
                  <div className="flex items-center justify-between text-[8px] border-t border-slate-800/50 pt-2">
                    <span className="text-slate-500">
                      Confidence: <span className="font-mono text-slate-300">{(log.confidence * 100).toFixed(0)}%</span>
                    </span>
                    {log.severity && (
                      <span className={`px-1 rounded uppercase font-mono font-black ${
                        log.severity === 'critical' ? 'text-red-400' :
                        log.severity === 'major' ? 'text-amber-400' : 'text-yellow-400'
                      }`}>
                        {log.severity}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Invisible anchor to trigger scroll updates */}
          <div ref={listEndRef} />
        </div>
      )}

      {/* ── 4. DETAILED IMAGE PREVIEW MODAL ──────────────── */}
      {previewItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="relative bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl animate-slide-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Close Button */}
            <button
              onClick={() => { setPreviewItem(null); setZoom(1); setIsReplaying(false); }}
              className="absolute top-4 right-4 bg-slate-950/80 hover:bg-slate-800 border border-slate-700/60 p-2 rounded-full text-slate-400 hover:text-white transition-all z-20"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Left: Interactive Image Panel */}
            <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r border-slate-800 relative min-h-[300px]">
              
              {/* Toolbar */}
              <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur border border-slate-800 p-1.5 rounded-2xl">
                <button
                  onClick={() => setZoom(z => Math.max(1, z - 0.5))}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-mono font-bold text-slate-400 px-1">{zoom.toFixed(1)}x</span>
                <button
                  onClick={() => setZoom(z => Math.min(4, z + 0.5))}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                
                {/* Replay Simulation */}
                <div className="h-4 w-px bg-slate-800 mx-1" />
                <button
                  onClick={() => setIsReplaying(!isReplaying)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                    isReplaying
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Click to toggle replay simulation mode"
                >
                  <RefreshCw className={`h-3 w-3 ${isReplaying ? 'animate-spin' : ''}`} />
                  <span>{isReplaying ? 'Replaying...' : 'Replay Clip'}</span>
                </button>
              </div>

              {/* Main Image Container */}
              <div className="w-full h-full max-h-[480px] overflow-auto flex items-center justify-center custom-scrollbar">
                <div
                  className="relative transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                >
                  <img
                    src={previewItem.thumbnail}
                    alt=""
                    className="max-h-[380px] object-contain rounded-lg border border-slate-800"
                  />

                  {/* Animated Simulated Replay Sweep Overlay */}
                  {isReplaying && (
                    <div className="absolute inset-0 bg-blue-500/5 overflow-hidden rounded-lg pointer-events-none">
                      {/* Laser Line */}
                      <div className="h-0.5 bg-blue-400 opacity-80 animate-scan-line shadow-[0_0_12px_#3b82f6]" />
                      <div className="absolute inset-0 bg-radial-gradient from-blue-500/10 to-transparent animate-pulse" />
                    </div>
                  )}

                  {/* Bounding box outline inside modal overlay */}
                  <div className={`absolute inset-0 border-2 ${
                    previewItem.status === 'fail' ? 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-emerald-500/40'
                  } rounded-lg pointer-events-none`} />
                </div>
              </div>

              {isReplaying && (
                <div className="absolute bottom-4 text-[9px] font-mono text-blue-400 bg-blue-950/40 border border-blue-900/40 px-3 py-1.5 rounded-xl animate-fade-in flex items-center gap-1.5">
                  <Play className="h-3 w-3 fill-blue-400" />
                  <span>SIMULATED REPLAY PLAYBACK LOOP</span>
                </div>
              )}
            </div>

            {/* Right: Metadata Panel */}
            <div className="w-full md:w-80 p-6 flex flex-col justify-between shrink-0">
              <div className="flex flex-col gap-5">
                <div>
                  <span className="text-[9px] font-mono font-bold text-blue-400">{previewItem.id}</span>
                  <h3 className="text-base font-black text-white mt-1">Inspection Audit</h3>
                  <p className="text-[10px] text-slate-500">Unique identifier of scanned product</p>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-2">
                  {previewItem.status === 'fail' ? (
                    <div className="flex items-center gap-1 bg-red-950/50 border border-red-500/30 px-3 py-1 rounded-xl text-xs font-black text-red-400">
                      <ShieldAlert className="h-4 w-4" />
                      <span>DEFECTIVE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-emerald-950/50 border border-emerald-500/30 px-3 py-1 rounded-xl text-xs font-black text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                      <span>PASSED</span>
                    </div>
                  )}

                  {previewItem.severity && (
                    <div className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase border ${
                      previewItem.severity === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                      previewItem.severity === 'major' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                      'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                    }`}>
                      {previewItem.severity} Severity
                    </div>
                  )}
                </div>

                {/* Detailed Table */}
                <div className="flex flex-col border border-slate-800 rounded-2xl overflow-hidden text-[10px] font-mono">
                  {[
                    { label: 'Object ID', val: previewItem.trackId },
                    { label: 'Timestamp', val: new Date(previewItem.timestamp).toLocaleString() },
                    { label: 'Detector Class', val: previewItem.className, cap: true },
                    { label: 'Anomaly Type', val: previewItem.defectClass || 'N/A', cap: true },
                    { label: 'Confidence', val: `${(previewItem.confidence * 100).toFixed(2)}%` },
                    { label: 'Trigger Gate', val: previewItem.zoneName || 'Global' }
                  ].map((row, idx) => (
                    <div
                      key={row.label}
                      className={`flex justify-between p-3 ${idx % 2 === 0 ? 'bg-slate-950/20' : 'bg-transparent'} border-b border-slate-800 last:border-b-0`}
                    >
                      <span className="text-slate-500">{row.label}</span>
                      <span className={`text-slate-300 font-bold ${row.cap ? 'capitalize' : ''}`}>{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action: Export crop only */}
              <div className="mt-6 pt-5 border-t border-slate-800 flex gap-2">
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = previewItem.thumbnail!;
                    a.download = `product_${previewItem.trackId}_${previewItem.status}.jpg`;
                    a.click();
                  }}
                  className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl py-2.5 text-xs font-bold transition-all"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Crop</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Styled Replay Scanner Animation */}
      <style>{`
        @keyframes scan-laser {
          0%   { transform: translateY(0); }
          50%  { transform: translateY(370px); }
          100% { transform: translateY(0); }
        }
        .animate-scan-line {
          animation: scan-laser 2.2s ease-in-out infinite;
        }
      `}</style>

    </div>
  );
};
