import React, { useEffect, useState, useRef } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import { VideoPanel } from './VideoPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { SettingsPanel } from './SettingsPanel';
import { EventLog } from './EventLog';
import { PresenceIndicator } from './PresenceIndicator';
import { dbService } from '../services/db';
import type { SessionHistoryItem } from '../types';
import { generatePDFReport } from '../services/report';
import { GalleryPanel } from './GalleryPanel';
import {
  Terminal,
  History,
  Sun,
  Moon,
  Play,
  Square,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
  Activity,
  BarChart3,
  ShieldAlert,
  Cpu,
  Radio,
  Zap,
  TrendingUp,
  Image,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {
    activeSessionId,
    startSession,
    endSession,
    stats,
    settings,
    presenceStatus,
    activeTracks,
    eventLogs,
  } = useDashboardStore();

  const [activeTab, setActiveTab] = useState<'live' | 'gallery' | 'history'>('live');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [historySessions, setHistorySessions] = useState<SessionHistoryItem[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const prevTotal = useRef(0);
  const [tickingCardId, setTickingCardId] = useState<string | null>(null);

  // Apply visual theme
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Session clock
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeSessionId) {
      interval = setInterval(() => {
        const startTime = parseInt(activeSessionId.split('-')[1]);
        setSessionDuration(Math.round((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      setSessionDuration(0);
    }
    return () => clearInterval(interval);
  }, [activeSessionId]);

  // Animate KPI counter when total increments
  useEffect(() => {
    if (stats.totalDetected !== prevTotal.current) {
      prevTotal.current = stats.totalDetected;
      setTickingCardId('total');
      setTimeout(() => setTickingCardId(null), 220);
    }
  }, [stats.totalDetected]);

  const loadHistory = async () => {
    try {
      const list = await dbService.getSessions();
      setHistorySessions(list);
    } catch (e) {
      console.error('Error fetching sessions:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  const handleSessionToggle = async () => {
    if (activeSessionId) {
      if (window.confirm('Stop current session and save metrics to history?')) {
        await endSession();
        loadHistory();
      }
    } else {
      startSession();
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this session permanently?')) {
      await dbService.deleteSession(id);
      loadHistory();
      if (expandedSessionId === id) setExpandedSessionId(null);
    }
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  const defectRateColor =
    stats.defectRate > 10 ? '#ef4444' :
    stats.defectRate > 5  ? '#f59e0b' : '#10b981';

  // Live ticker messages
  const tickerItems = [
    `🟢 Model: ${settings.modelType.toUpperCase().replace('-', ' ')}`,
    `📦 Total Scanned: ${stats.totalDetected}`,
    `✅ Pass: ${stats.totalDetected - stats.defectCount}`,
    `❌ Defects: ${stats.defectCount}`,
    `📊 Defect Rate: ${stats.defectRate.toFixed(2)}%`,
    `⚡ Latency: ${stats.latency}ms`,
    `🎯 FPS: ${stats.fps}`,
    `🔧 Mode: ${settings.countingMode.toUpperCase()}`,
    `🚨 Alert Threshold: ${settings.defectRateAlertThreshold}%`,
    presenceStatus === 'present' ? `✅ ITEM PRESENT — ${activeTracks.length} in frame` :
    presenceStatus === 'absent'  ? `⚠️ NO ITEM DETECTED — conveyor gap!` :
    `⏸ IDLE — waiting for scan`,
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">

      {/* ── TICKER TAPE ─────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800 py-1.5 overflow-hidden text-[10px] font-mono text-slate-400 select-none">
        <div className="ticker-tape animate-marquee">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="whitespace-nowrap pr-12">{item}</span>
          ))}
        </div>
      </div>

      {/* ── TOP NAVBAR ────────────────────────────────────── */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-lg shadow-black/30">

        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-400 p-2.5 rounded-xl shadow-lg shadow-blue-500/30">
              <Terminal className="h-5 w-5 text-white" />
            </div>
            {activeSessionId && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-status-ping ring-2 ring-slate-900" />
            )}
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              APEX VISION
            </h1>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.15em]">
              Object & Defect Counter · AI Dashboard
            </p>
          </div>
        </div>

        {/* Center: live KPIs + Presence status */}
        {activeSessionId && (
          <div className="hidden lg:flex items-center space-x-4">
            {/* Presence pill */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all duration-500 ${
              presenceStatus === 'present' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              presenceStatus === 'absent'  ? 'bg-red-500/10 border-red-500/30 text-red-400 animate-pulse' :
              'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                presenceStatus === 'present' ? 'bg-emerald-400 animate-pulse' :
                presenceStatus === 'absent'  ? 'bg-red-400' : 'bg-slate-500'
              }`} />
              <span>{
                presenceStatus === 'present' ? `ITEM IN FRAME (${activeTracks.length})` :
                presenceStatus === 'absent'  ? 'NO ITEM' : 'IDLE'
              }</span>
            </div>

            {[
              { label: 'SCANNED', value: stats.totalDetected, color: 'text-blue-400' },
              { label: 'PASS', value: stats.totalDetected - stats.defectCount, color: 'text-emerald-400' },
              { label: 'DEFECTS', value: stats.defectCount, color: 'text-red-400' },
              { label: 'FPS', value: stats.fps, color: 'text-sky-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center px-3 border-l border-slate-700/60 first:border-l-0">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
                <p className={`text-lg font-black font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Right controls */}
        <div className="flex items-center space-x-3">
          {/* Defect rate alert pill */}
          {activeSessionId && stats.defectRate > 0 && (
            <div
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold border"
              style={{
                background: `${defectRateColor}18`,
                borderColor: `${defectRateColor}40`,
                color: defectRateColor,
              }}
            >
              <TrendingUp className="h-3 w-3" />
              <span>{stats.defectRate.toFixed(1)}% defects</span>
            </div>
          )}

          {/* Session timer */}
          {activeSessionId && (
            <div className="hidden sm:flex items-center space-x-1.5 bg-emerald-950/40 border border-emerald-800/40 rounded-full px-3 py-1.5 text-emerald-400 text-[10px] font-mono font-bold">
              <Radio className="h-3 w-3 animate-pulse" />
              <span>REC {formatDuration(sessionDuration)}</span>
            </div>
          )}

          {/* Start/Stop session */}
          <button
            onClick={handleSessionToggle}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 shadow-lg ${
              activeSessionId
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 hover:shadow-red-500/40'
                : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-blue-500/20 hover:shadow-blue-500/40'
            }`}
          >
            {activeSessionId ? (
              <><Square className="h-3.5 w-3.5 fill-white" /><span>Stop Session</span></>
            ) : (
              <><Play className="h-3.5 w-3.5 fill-white" /><span>Start Session</span></>
            )}
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 transition-all"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* ── MAIN LAYOUT ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col lg:flex-row">

        {/* ── SIDEBAR ───────────────────────────────────── */}
        <aside className="w-full lg:w-56 bg-slate-900/80 backdrop-blur border-r border-slate-800 px-3 py-5 flex flex-row lg:flex-col gap-2 lg:sticky lg:top-[89px] lg:h-[calc(100vh-89px)] shrink-0">

          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center space-x-3 w-full px-3.5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'live'
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/5'
                : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'live' ? 'bg-blue-500/20' : 'bg-slate-800'}`}>
              <Zap className="h-3.5 w-3.5" />
            </div>
            <span>Live Console</span>
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center space-x-3 w-full px-3.5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'gallery'
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/5'
                : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'gallery' ? 'bg-blue-500/20' : 'bg-slate-800'}`}>
              <Image className="h-3.5 w-3.5" />
            </div>
            <span>Product Gallery</span>
            {eventLogs.length > 0 && (
              <span className="ml-auto bg-slate-700 text-slate-300 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                {eventLogs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center space-x-3 w-full px-3.5 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/5'
                : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'history' ? 'bg-blue-500/20' : 'bg-slate-800'}`}>
              <History className="h-3.5 w-3.5" />
            </div>
            <span>Session History</span>
            {historySessions.length > 0 && (
              <span className="ml-auto bg-slate-700 text-slate-300 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full">
                {historySessions.length}
              </span>
            )}
          </button>

          {/* Sidebar bottom status */}
          <div className="hidden lg:block mt-auto pt-4 border-t border-slate-800">
            <div className="flex flex-col gap-2 text-[10px] text-slate-500 font-mono">
              <div className="flex justify-between">
                <span>Model</span>
                <span className="text-slate-300 font-bold uppercase">{settings.modelType.replace('-', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span>Conf.</span>
                <span className="text-slate-300 font-bold">{Math.round(settings.confidenceThreshold * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Skip</span>
                <span className="text-slate-300 font-bold">1 / {settings.frameSamplingRate}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className={`font-bold ${activeSessionId ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {activeSessionId ? '● LIVE' : '○ IDLE'}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ────────────────────────────────── */}
        <main className="flex-1 p-5 flex flex-col gap-5 overflow-y-auto">

          {/* ── LIVE CONSOLE TAB ──────────────────────────── */}
          {activeTab === 'live' && (
            <div className="flex flex-col gap-5 animate-fade-in">

              {/* Row 1: Video + KPIs + Settings */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

                {/* Video Panel — takes most space */}
                <div className="lg:col-span-8">
                  <VideoPanel />
                </div>

                {/* Right column: Presence + KPI cards + Settings */}
                <div className="lg:col-span-4 flex flex-col gap-4">

                  {/* ── PRESENCE INDICATOR (most important!) */}
                  <PresenceIndicator />

                  {/* KPI cards — 2×2 grid */}
                  <div className="grid grid-cols-2 gap-3">

                    {/* Total Counted */}
                    <div className={`kpi-card bg-slate-900 border border-slate-800 rounded-2xl p-4 neon-border-blue ${tickingCardId === 'total' ? 'animate-counter-tick' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Scanned</span>
                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                          <Activity className="h-3 w-3 text-blue-400" />
                        </div>
                      </div>
                      <p className="text-3xl font-black text-white font-mono leading-none">{stats.totalDetected}</p>
                      <p className="text-[9px] text-slate-500 mt-1">unique objects tracked</p>
                    </div>

                    {/* Pass Count */}
                    <div className="kpi-card bg-slate-900 border border-slate-800 rounded-2xl p-4 neon-border-green">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Pass</span>
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                          <BarChart3 className="h-3 w-3 text-emerald-400" />
                        </div>
                      </div>
                      <p className="text-3xl font-black text-emerald-400 font-mono leading-none">
                        {stats.totalDetected - stats.defectCount}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-1">quality approved</p>
                    </div>

                    {/* Defect Rate */}
                    <div className={`kpi-card col-span-2 bg-slate-900 border rounded-2xl p-4 transition-all ${
                      stats.defectRate > 5 ? 'border-red-500/30 neon-border-red' : 'border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Defect Rate</span>
                          <div className="flex items-baseline gap-2 mt-1">
                            <p
                              className="text-4xl font-black font-mono leading-none"
                              style={{ color: defectRateColor }}
                            >
                              {stats.defectRate.toFixed(1)}%
                            </p>
                            <span className="text-xs text-slate-500">{stats.defectCount} items</span>
                          </div>
                        </div>
                        <div className={`p-3 rounded-xl ${stats.defectRate > 5 ? 'bg-red-500/10' : 'bg-slate-800'}`}>
                          <ShieldAlert className={`h-6 w-6 ${stats.defectRate > 5 ? 'text-red-400' : 'text-slate-500'}`} />
                        </div>
                      </div>
                      {/* Mini progress bar */}
                      <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(stats.defectRate, 100)}%`,
                            background: defectRateColor,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                        <span>0%</span>
                        <span className="text-slate-500">threshold: {settings.defectRateAlertThreshold}%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Latency / FPS */}
                    <div className="kpi-card col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Vision Engine</span>
                          <div className="flex items-baseline gap-3 mt-1">
                            <p className="text-2xl font-black text-white font-mono">{stats.fps} <span className="text-base text-slate-500">FPS</span></p>
                            <p className="text-xl font-black text-sky-400 font-mono">{stats.latency} <span className="text-sm text-slate-500">ms</span></p>
                          </div>
                        </div>
                        <div className="p-2 bg-sky-500/10 rounded-xl">
                          <Cpu className="h-5 w-5 text-sky-400" />
                        </div>
                      </div>
                      {/* FPS bar */}
                      <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-400 transition-all duration-300"
                          style={{ width: `${Math.min((stats.fps / 30) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                  </div>

                  {/* Settings Panel */}
                  <SettingsPanel />
                </div>
              </div>

              {/* Row 2: Analytics Charts + Event Log */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-8">
                  <AnalyticsPanel />
                </div>
                <div className="lg:col-span-4">
                  <EventLog />
                </div>
              </div>

            </div>
          )}

          {/* ── HISTORY TAB ───────────────────────────────── */}
          {activeTab === 'history' && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-white">Session History</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Review past runs stored in IndexedDB · download PDF reports</p>
                  </div>
                  <span className="bg-slate-800 text-slate-300 text-xs font-mono font-bold px-3 py-1.5 rounded-full border border-slate-700">
                    {historySessions.length} sessions
                  </span>
                </div>

                {historySessions.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-600 border border-dashed border-slate-800 rounded-2xl gap-3">
                    <History className="h-10 w-10 text-slate-700" />
                    <p className="text-sm text-slate-500">No sessions saved yet. Start a session and click Stop to save it.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {historySessions.map((session) => {
                      const isExpanded = expandedSessionId === session.id;
                      const startTime = new Date(session.startTime).toLocaleString();
                      const durationSec = Math.round((session.endTime - session.startTime) / 1000);
                      const defectRate = session.totalDetected > 0
                        ? (session.defectCount / session.totalDetected) * 100 : 0;

                      return (
                        <div
                          key={session.id}
                          className="border border-slate-800 hover:border-slate-700 rounded-2xl transition-all overflow-hidden cursor-pointer"
                          onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        >
                          <div className="p-5 flex flex-wrap gap-4 items-center justify-between">
                            <div>
                              <span className="text-[10px] font-mono font-bold text-blue-400">{session.id}</span>
                              <p className="text-sm font-bold text-white mt-0.5">{startTime}</p>
                            </div>

                            <div className="flex items-center gap-6 text-xs text-slate-500 flex-wrap">
                              <span>Duration: <span className="text-white font-mono font-bold">{formatDuration(durationSec)}</span></span>
                              <span>Scanned: <span className="text-white font-mono font-bold">{session.totalDetected}</span></span>
                              <span>Defect Rate:
                                <span className={`font-mono font-bold ml-1 ${defectRate > 5 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {defectRate.toFixed(1)}%
                                </span>
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={e => { e.stopPropagation(); generatePDFReport(session); }}
                                className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition-all"
                                title="Download PDF Report"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                              <button
                                onClick={e => handleDeleteSession(session.id, e)}
                                className="p-2 bg-slate-800 hover:bg-red-950/40 border border-slate-700 hover:border-red-800/40 text-red-400 rounded-xl transition-all"
                                title="Delete Session"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <div className="text-slate-600 ml-1">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-slate-800 bg-slate-950/50 p-5">
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
                                Event Logs · {session.logs.length} entries
                              </h4>
                              {session.logs.length === 0 ? (
                                <p className="text-xs text-slate-600 italic">No events logged during this session.</p>
                              ) : (
                                <div className="overflow-x-auto max-h-60">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                        <th className="pb-2 pr-4">Time</th>
                                        <th className="pb-2 pr-4">Track ID</th>
                                        <th className="pb-2 pr-4">Class</th>
                                        <th className="pb-2 pr-4">Conf.</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2">Gate</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-mono">
                                      {session.logs.map(log => (
                                        <tr key={log.id} className="hover:bg-slate-900/50">
                                          <td className="py-1.5 pr-4 text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                          <td className="py-1.5 pr-4 font-bold text-slate-200">{log.trackId}</td>
                                          <td className="py-1.5 pr-4 uppercase font-bold text-[10px]">
                                            {log.status === 'fail' ? (log.defectClass || 'defect') : log.className}
                                          </td>
                                          <td className="py-1.5 pr-4 text-slate-400">{(log.confidence * 100).toFixed(0)}%</td>
                                          <td className="py-1.5 pr-4">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${log.status === 'fail' ? 'badge-fail' : 'badge-pass'}`}>
                                              {log.status.toUpperCase()}
                                            </span>
                                          </td>
                                          <td className="py-1.5 text-slate-500">{log.zoneName || 'Global'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* ── PRODUCT GALLERY TAB ────────────────────────── */}
          {activeTab === 'gallery' && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <GalleryPanel />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
