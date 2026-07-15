import React, { useEffect, useState, useRef } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import { AlertTriangle, Bell, X, ShieldAlert } from 'lucide-react';

interface Toast {
  id: string;
  trackId: string;
  className: string;
  severity?: 'minor' | 'major' | 'critical';
  timestamp: number;
}

export const AlertBanner: React.FC = () => {
  const { eventLogs, settings, presenceStatus } = useDashboardStore();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastProcessedLogId = useRef<string | null>(null);

  const playBeep = (severity?: 'minor' | 'major' | 'critical') => {
    if (!settings.audioAlertEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (severity === 'critical') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
        setTimeout(() => playBeep('minor'), 200);
      } else if (severity === 'major') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        osc.start(); osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!eventLogs[0]) return;
    const log = eventLogs[0];
    if (log.id === lastProcessedLogId.current) return;
    lastProcessedLogId.current = log.id;
    if (log.status !== 'fail') return;

    playBeep(log.severity);

    const toast: Toast = {
      id: `TOAST-${Date.now()}`,
      trackId: log.trackId,
      className: log.defectClass || log.className,
      severity: log.severity,
      timestamp: Date.now(),
    };
    setToasts(prev => [toast, ...prev].slice(0, 5));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), 6000);
  }, [eventLogs]);

  const recentLogs = eventLogs.slice(0, 50);
  const recentDefects = recentLogs.filter(l => l.status === 'fail').length;
  const recentRate = recentLogs.length > 0 ? (recentDefects / recentLogs.length) * 100 : 0;
  const rateTriggered = recentLogs.length >= 10 && recentRate > settings.defectRateAlertThreshold;

  const toastConfig = {
    critical: {
      bg: 'bg-red-950/90',
      border: 'border-red-500/50',
      dot: 'bg-red-400',
      title: '🚨 CRITICAL DEFECT',
      titleColor: 'text-red-400',
    },
    major: {
      bg: 'bg-amber-950/90',
      border: 'border-amber-500/40',
      dot: 'bg-amber-400',
      title: '⚠️ MAJOR DEFECT',
      titleColor: 'text-amber-400',
    },
    minor: {
      bg: 'bg-slate-900/95',
      border: 'border-yellow-500/30',
      dot: 'bg-yellow-400',
      title: '🔶 DEFECT DETECTED',
      titleColor: 'text-yellow-400',
    },
  };

  return (
    <>
      {/* ── High defect rate banner ── */}
      {rateTriggered && (
        <div className="bg-red-950/80 border-b border-red-800/50 text-red-200 px-5 py-2.5 flex items-center gap-3 animate-pulse">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <p className="text-xs font-bold flex-1">
            <span className="text-red-400 font-black">HIGH DEFECT RATE ALERT</span>
            {' '}— {recentRate.toFixed(1)}% defect rate exceeds {settings.defectRateAlertThreshold}% threshold
            (based on last {recentLogs.length} scanned items)
          </p>
          <span className="text-red-400 font-mono font-black text-sm">{recentRate.toFixed(0)}%</span>
        </div>
      )}

      {/* ── Absence alert banner ── */}
      {presenceStatus === 'absent' && (
        <div className="bg-orange-950/70 border-b border-orange-800/40 text-orange-200 px-5 py-2 flex items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-orange-400 shrink-0" />
          <p className="text-xs font-bold flex-1">
            <span className="text-orange-400 font-black">BELT GAP DETECTED</span>
            {' '}— No item on conveyor. Waiting for next item...
          </p>
        </div>
      )}

      {/* ── Floating toast notifications ── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-xs w-full pointer-events-none">
        {toasts.map((toast, i) => {
          const cfg = toastConfig[toast.severity || 'minor'];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto backdrop-blur-md border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-slide-in-right`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className={`${cfg.bg} ${cfg.border} border p-4 flex items-start gap-3`}>
                {/* Dot */}
                <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0 mt-1 animate-status-ping`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-black ${cfg.titleColor}`}>{cfg.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-400">ID:</span>
                    <span className="text-[10px] font-mono font-bold text-white">{toast.trackId}</span>
                    <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {toast.className}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-0.5 font-mono">
                    {new Date(toast.timestamp).toLocaleTimeString()}
                  </p>
                </div>

                {/* Close */}
                <button
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="text-slate-500 hover:text-white p-0.5 rounded transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Auto-dismiss progress bar */}
              <div className="h-0.5 bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${cfg.dot} opacity-60`}
                  style={{
                    animation: 'progress-shrink 6s linear forwards',
                    width: '100%',
                  }}
                />
              </div>
            </div>
          );
        })}

        {/* Bell icon badge when alerts are active */}
        {toasts.length > 0 && (
          <div className="flex justify-end pointer-events-none">
            <div className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full font-mono">
              {toasts.length} alert{toasts.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes progress-shrink {
          from { transform: scaleX(1); transform-origin: left; }
          to   { transform: scaleX(0); transform-origin: left; }
        }
      `}</style>
    </>
  );
};
