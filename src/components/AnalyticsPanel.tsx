import React, { useState } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { TrendingUp, BarChart3, PieChart as PieIcon } from 'lucide-react';

const DARK_TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '8px 12px' },
  labelStyle: { color: '#94a3b8', fontSize: '10px', fontWeight: 700 },
  itemStyle: { color: '#e2e8f0', fontSize: '11px' },
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];

export const AnalyticsPanel: React.FC = () => {
  const { eventLogs, stats } = useDashboardStore();
  const [timeWindow, setTimeWindow] = useState<30 | 60 | 120>(60);

  /* ── Timeline Data ─────────────────────────────── */
  const timelineData = (() => {
    const now = Date.now();
    const windowMs = timeWindow * 1000;
    const slots = 20;
    const slotMs = windowMs / slots;
    const recent = eventLogs.filter(l => now - l.timestamp < windowMs);

    return Array.from({ length: slots }, (_, i) => {
      const slotStart = now - windowMs + i * slotMs;
      const slotEnd = slotStart + slotMs;
      const inSlot = recent.filter(l => l.timestamp >= slotStart && l.timestamp < slotEnd);
      return {
        t: `${Math.round((i * slotMs) / 1000)}s`,
        total: inSlot.length,
        defects: inSlot.filter(l => l.status === 'fail').length,
        pass: inSlot.filter(l => l.status !== 'fail').length,
      };
    });
  })();

  /* ── Class Distribution ────────────────────────── */
  const classData = Object.entries(stats.classDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name: name.replace('_', ' '), count }));

  /* ── Pass vs Fail Donut ────────────────────────── */
  const passCount = stats.totalDetected - stats.defectCount;
  const donutData = stats.totalDetected > 0
    ? [
        { name: 'Pass', value: passCount, color: '#10b981' },
        { name: 'Fail', value: stats.defectCount, color: '#ef4444' },
      ]
    : [{ name: 'No Data', value: 1, color: '#1e293b' }];

  const isEmpty = eventLogs.length === 0;

  if (isEmpty) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 min-h-[280px]">
        <BarChart3 className="h-10 w-10 text-slate-700" />
        <p className="text-slate-500 font-bold text-sm">No Analytics Yet</p>
        <p className="text-slate-600 text-xs text-center max-w-[200px]">
          Start a session and let the system scan items to see charts here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── ROW 1: Timeline + Donut ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Timeline Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <div>
                <h3 className="text-xs font-black text-white">Detection Timeline</h3>
                <p className="text-[9px] text-slate-500">Items detected per time bucket</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {([30, 60, 120] as const).map(w => (
                <button key={w}
                  onClick={() => setTimeWindow(w)}
                  className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all ${
                    timeWindow === w
                      ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {w}s
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={timelineData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="t" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip {...DARK_TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="pass" stroke="#10b981" strokeWidth={2} dot={false} name="Pass" />
              <Line type="monotone" dataKey="defects" stroke="#ef4444" strokeWidth={2} dot={false} name="Defects" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-emerald-500 rounded" />
              <span className="text-[9px] text-slate-500">Pass</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-red-500 rounded" style={{ borderBottom: '2px dashed #ef4444', background: 'transparent' }} />
              <span className="text-[9px] text-slate-500">Defects</span>
            </div>
          </div>
        </div>

        {/* Pass / Fail Donut */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <PieIcon className="h-4 w-4 text-purple-400" />
            <div>
              <h3 className="text-xs font-black text-white">Quality Ratio</h3>
              <p className="text-[9px] text-slate-500">Pass vs Fail split</p>
            </div>
          </div>
          <div className="relative">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%" cy="50%"
                  innerRadius={38} outerRadius={55}
                  paddingAngle={stats.totalDetected > 0 ? 3 : 0}
                  dataKey="value"
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '6px 10px' }}
                  itemStyle={{ color: '#e2e8f0', fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center text */}
            {stats.totalDetected > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-xl font-black text-white font-mono">{(100 - stats.defectRate).toFixed(0)}%</p>
                <p className="text-[9px] text-slate-500">pass rate</p>
              </div>
            )}
          </div>
          {stats.totalDetected > 0 && (
            <div className="flex justify-center gap-4 mt-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[9px] text-slate-400">{passCount} OK</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[9px] text-slate-400">{stats.defectCount} NG</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 2: Class Distribution Bar ─────────── */}
      {classData.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            <div>
              <h3 className="text-xs font-black text-white">Class Distribution</h3>
              <p className="text-[9px] text-slate-500">Count per detected class</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={classData} margin={{ top: 0, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip {...DARK_TOOLTIP_STYLE} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Count">
                {classData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Color legend */}
          <div className="flex flex-wrap gap-2 mt-3">
            {classData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-[9px] text-slate-500 capitalize">{item.name}</span>
                <span className="text-[9px] font-mono font-bold text-slate-400">×{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
