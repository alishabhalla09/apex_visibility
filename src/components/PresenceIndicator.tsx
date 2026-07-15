import React, { useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import { PackageCheck, PackageX, ScanLine, Bell, BellOff, Timer } from 'lucide-react';

/**
 * PresenceIndicator — shows whether items are currently on the conveyor/in frame.
 *
 * States:
 *  • IDLE     — no session started yet, waiting
 *  • PRESENT  — item(s) detected in current frame
 *  • ABSENT   — no item seen for >= absenceAlertSeconds
 */
export const PresenceIndicator: React.FC = () => {
  const {
    presenceStatus,
    lastItemSeenAt,
    gateTriggerFlash,
    absenceAlertSeconds,
    setAbsenceAlertSeconds,
    activeSessionId,
    activeTracks,
  } = useDashboardStore();

  // Local timer to count elapsed seconds since last item seen
  const [secondsSince, setSecondsSince] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hasPlayedAbsenceAlert = useRef(false);

  // Update elapsed timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastItemSeenAt) {
        setSecondsSince(Math.round((Date.now() - lastItemSeenAt) / 1000));
      } else {
        setSecondsSince(0);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [lastItemSeenAt]);

  // Play audio alert when item detected (gate flash) or absent
  useEffect(() => {
    if (!audioEnabled) return;

    const playTone = (freq: number, duration: number, type: OscillatorType = 'sine') => {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (_) {}
    };

    if (gateTriggerFlash) {
      // Short beep when item counted
      playTone(880, 0.12, 'square');
      hasPlayedAbsenceAlert.current = false;
    }
  }, [gateTriggerFlash, audioEnabled]);

  // Play absence alert when status changes to absent
  useEffect(() => {
    if (!audioEnabled) return;
    if (presenceStatus === 'absent' && !hasPlayedAbsenceAlert.current) {
      hasPlayedAbsenceAlert.current = true;
      const playTone = (freq: number, duration: number) => {
        try {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AudioContext();
          }
          const ctx = audioCtxRef.current;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
          osc.start();
          osc.stop(ctx.currentTime + duration);
        } catch (_) {}
      };
      // Double beep for absence alert
      playTone(440, 0.2);
      setTimeout(() => playTone(330, 0.3), 250);
    }
    if (presenceStatus === 'present') {
      hasPlayedAbsenceAlert.current = false;
    }
  }, [presenceStatus, audioEnabled]);

  // Derive display config from status
  const config = {
    idle: {
      bg: 'bg-slate-800/60',
      border: 'border-slate-700',
      dot: 'bg-slate-500',
      label: 'IDLE',
      sublabel: 'Waiting for detection to start',
      textColor: 'text-slate-400',
      icon: <ScanLine className="h-8 w-8 text-slate-500" />,
      pulse: false,
    },
    present: {
      bg: 'bg-emerald-950/40',
      border: 'border-emerald-500/40',
      dot: 'bg-emerald-400',
      label: 'ITEM PRESENT',
      sublabel: `${activeTracks.length} object${activeTracks.length !== 1 ? 's' : ''} in frame`,
      textColor: 'text-emerald-400',
      icon: <PackageCheck className="h-8 w-8 text-emerald-400" />,
      pulse: true,
    },
    absent: {
      bg: 'bg-red-950/40',
      border: 'border-red-500/50',
      dot: 'bg-red-400',
      label: 'NO ITEM DETECTED',
      sublabel: `Gap: ${secondsSince}s — threshold: ${absenceAlertSeconds}s`,
      textColor: 'text-red-400',
      icon: <PackageX className="h-8 w-8 text-red-400" />,
      pulse: true,
    },
  }[presenceStatus];

  const defectTracks = activeTracks.filter(t => t.status === 'fail');
  const passTracks = activeTracks.filter(t => t.status !== 'fail');

  return (
    <div className="flex flex-col gap-3">

      {/* ── MAIN PRESENCE CARD ──────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${config.bg} ${config.border} ${
          gateTriggerFlash ? 'ring-2 ring-blue-400/60 shadow-lg shadow-blue-500/20' : ''
        } ${
          presenceStatus === 'absent' ? 'animate-pulse' : ''
        }`}
      >
        {/* Background pulse glow for absent */}
        {presenceStatus === 'absent' && (
          <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
        )}

        {/* Gate flash overlay */}
        {gateTriggerFlash && (
          <div className="absolute inset-0 bg-blue-400/10 pointer-events-none rounded-2xl animate-fade-in" />
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Status icon */}
            <div className={`p-3 rounded-xl ${
              presenceStatus === 'present' ? 'bg-emerald-500/10' :
              presenceStatus === 'absent'  ? 'bg-red-500/10' : 'bg-slate-700'
            }`}>
              {config.icon}
            </div>

            {/* Status text */}
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${config.dot} ${config.pulse ? 'animate-status-ping' : ''}`}
                />
                <span className={`text-lg font-black tracking-tight ${config.textColor}`}>
                  {config.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{config.sublabel}</p>
            </div>
          </div>

          {/* Audio toggle */}
          <button
            onClick={() => setAudioEnabled(a => !a)}
            className={`p-2 rounded-xl border transition-all ${
              audioEnabled
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                : 'bg-slate-800 border-slate-700 text-slate-600'
            }`}
            title={audioEnabled ? 'Mute audio alerts' : 'Enable audio alerts'}
          >
            {audioEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </button>
        </div>

        {/* Live item breakdown bar — only show when present */}
        {presenceStatus === 'present' && activeTracks.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${(passTracks.length / activeTracks.length) * 100}%` }}
              />
              <div
                className="h-full bg-red-500 transition-all duration-300"
                style={{ width: `${(defectTracks.length / activeTracks.length) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono font-bold shrink-0">
              <span className="text-emerald-400">✓ {passTracks.length} OK</span>
              <span className="text-red-400">✗ {defectTracks.length} NG</span>
            </div>
          </div>
        )}

        {/* Session not started nudge */}
        {!activeSessionId && (
          <p className="mt-3 text-[10px] text-slate-600 border-t border-slate-800 pt-2">
            ℹ️ Start a session to begin tracking presence and counting items.
          </p>
        )}
      </div>

      {/* ── ABSENCE TIMER CONFIG ────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-slate-500" />
          <span className="text-[11px] font-bold text-slate-400">Absence Alert After</span>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 5, 10].map(s => (
            <button
              key={s}
              onClick={() => setAbsenceAlertSeconds(s)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all ${
                absenceAlertSeconds === s
                  ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>

      {/* ── GATE TRIGGER FLASH DISPLAY ─────────────────── */}
      {gateTriggerFlash && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5 flex items-center gap-3 animate-slide-in">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs font-black text-blue-400">
            🎯 ITEM COUNTED — Gate trigger activated!
          </span>
        </div>
      )}
    </div>
  );
};
