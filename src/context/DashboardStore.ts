import { create } from 'zustand';
import type { 
  Point, 
  Track, 
  CountingZone, 
  SessionStats, 
  EventLogItem, 
  DashboardSettings, 
  SessionHistoryItem 
} from '../types';
import { checkLineCrossing, checkZoneEntry } from '../services/counting';
import { dbService } from '../services/db';

interface DashboardState {
  webcamActive: boolean;
  isPaused: boolean;
  currentFeedSource: 'webcam' | 'video' | 'simulation';
  feedUrl: string | null;
  settings: DashboardSettings;
  activeTracks: Track[];
  eventLogs: EventLogItem[];
  countingZones: CountingZone[];
  stats: SessionStats;
  activeSessionId: string | null;
  isModelLoading: boolean;
  modelLoadProgress: number;
  
  // Presence Detection
  presenceStatus: 'present' | 'absent' | 'idle';
  lastItemSeenAt: number | null;       // timestamp of last detected item
  gateTriggerFlash: boolean;           // flashes true briefly when item crosses gate
  absenceAlertSeconds: number;         // how many seconds of no-item = alert
  
  // Drawing state
  isDrawing: boolean;
  drawingType: 'line' | 'zone' | null;
  currentDrawingPoints: Point[];

  // Actions
  startSession: () => void;
  endSession: () => Promise<void>;
  setWebcamActive: (active: boolean) => void;
  setIsPaused: (paused: boolean) => void;
  setFeedSource: (source: 'webcam' | 'video' | 'simulation', url?: string | null) => void;
  updateSettings: (settings: Partial<DashboardSettings>) => void;
  setAbsenceAlertSeconds: (s: number) => void;
  
  // Counting Zones
  addCountingZone: (name: string, type: 'line' | 'zone', points: Point[], color: string) => void;
  removeCountingZone: (id: string) => void;
  clearCountingZones: () => void;

  // Drawing Actions
  startDrawing: (type: 'line' | 'zone') => void;
  addDrawingPoint: (pt: Point) => void;
  finishDrawing: (name: string) => void;
  cancelDrawing: () => void;

  // Tracking & Frame updates
  updateTracks: (tracks: Track[], getCropCallback: (bbox: [number, number, number, number]) => string | undefined) => void;
  updatePerformanceStats: (fps: number, latency: number) => void;
  resetSessionCounters: () => void;
  setModelLoading: (loading: boolean, progress?: number) => void;
}

const defaultSettings: DashboardSettings = {
  modelType: 'simulation',
  confidenceThreshold: 0.5,
  nmsThreshold: 0.45,
  frameSamplingRate: 1,
  countingMode: 'all',
  defectRateAlertThreshold: 5.0,
  audioAlertEnabled: true,
};

const initialStats = (): SessionStats => ({
  totalDetected: 0,
  defectCount: 0,
  defectRate: 0,
  fps: 0,
  latency: 0,
  classDistribution: {},
});

export const useDashboardStore = create<DashboardState>((set, get) => ({
  webcamActive: false,
  isPaused: false,
  currentFeedSource: 'simulation',
  feedUrl: null,
  settings: defaultSettings,
  activeTracks: [],
  eventLogs: [],
  countingZones: [],
  stats: initialStats(),
  activeSessionId: null,
  isModelLoading: false,
  modelLoadProgress: 0,

  // Presence Detection defaults
  presenceStatus: 'idle',
  lastItemSeenAt: null,
  gateTriggerFlash: false,
  absenceAlertSeconds: 3,
  
  isDrawing: false,
  drawingType: null,
  currentDrawingPoints: [],

  startSession: () => {
    const id = `SESS-${Date.now()}`;
    set({
      activeSessionId: id,
      eventLogs: [],
      stats: initialStats(),
      activeTracks: [],
    });
  },

  endSession: async () => {
    const { activeSessionId, stats, eventLogs } = get();
    if (!activeSessionId) return;

    const sessionData: SessionHistoryItem = {
      id: activeSessionId,
      startTime: parseInt(activeSessionId.split('-')[1]),
      endTime: Date.now(),
      totalCounts: stats.classDistribution,
      defectCount: stats.defectCount,
      totalDetected: stats.totalDetected,
      logs: eventLogs,
    };

    try {
      await dbService.saveSession(sessionData);
    } catch (e) {
      console.error('Failed to save session history:', e);
    }

    set({ activeSessionId: null });
  },

  setWebcamActive: (active) => set({ webcamActive: active }),
  setIsPaused: (paused) => set({ isPaused: paused }),
  
  setFeedSource: (source, url = null) => {
    set({ 
      currentFeedSource: source, 
      feedUrl: url,
      webcamActive: source === 'webcam',
      activeTracks: [],
    });
  },

  updateSettings: (newSettings) => 
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  setAbsenceAlertSeconds: (s) => set({ absenceAlertSeconds: s }),

  addCountingZone: (name, type, points, color) => {
    const newZone: CountingZone = {
      id: `ZONE-${Date.now()}`,
      name,
      type,
      points,
      color,
    };
    set((state) => ({
      countingZones: [...state.countingZones, newZone],
    }));
  },

  removeCountingZone: (id) => set((state) => ({
    countingZones: state.countingZones.filter((z) => z.id !== id),
  })),

  clearCountingZones: () => set({ countingZones: [] }),

  startDrawing: (type) => set({
    isDrawing: true,
    drawingType: type,
    currentDrawingPoints: [],
  }),

  addDrawingPoint: (pt) => set((state) => ({
    currentDrawingPoints: [...state.currentDrawingPoints, pt],
  })),

  finishDrawing: (name) => {
    const { drawingType, currentDrawingPoints, addCountingZone, cancelDrawing } = get();
    if (!drawingType || currentDrawingPoints.length < 2) return;

    // Pick a random vibrant color
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    addCountingZone(name, drawingType, currentDrawingPoints, color);
    cancelDrawing();
  },

  cancelDrawing: () => set({
    isDrawing: false,
    drawingType: null,
    currentDrawingPoints: [],
  }),

  updateTracks: (tracks, getCropCallback) => {
    const { settings, countingZones, activeSessionId, stats, eventLogs } = get();
    
    // If no active session, we don't log counts
    if (!activeSessionId) {
      set({ activeTracks: tracks });
      return;
    }

    const updatedTracks = [...tracks];
    const newLogs: EventLogItem[] = [];
    
    let totalDetectedChange = 0;
    let defectCountChange = 0;
    const newClassDistribution = { ...stats.classDistribution };

    for (const track of updatedTracks) {
      const isDefect = track.status === 'fail';

      // 1. "COUNT ALL" mode - Count on first appearance
      if (settings.countingMode === 'all') {
        if (!track.counted['global']) {
          track.counted['global'] = true;
          totalDetectedChange++;
          
          if (isDefect) {
            defectCountChange++;
          }

          // Update distribution
          const className = isDefect ? (track.defectClass || 'defect') : track.className;
          newClassDistribution[className] = (newClassDistribution[className] || 0) + 1;

          // Request visual crop from canvas
          const crop = getCropCallback(track.bbox);

          newLogs.push({
            id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            trackId: track.id,
            className: track.className,
            confidence: track.confidence,
            status: track.status,
            severity: track.severity,
            defectClass: track.defectClass,
            thumbnail: crop,
          });
        }
      } 
      
      // 2. LINE crossing / ZONE entry rules
      else {
        for (const zone of countingZones) {
          if (track.counted[zone.id]) continue; // already counted for this zone

          let triggered = false;
          if (settings.countingMode === 'line' && zone.type === 'line') {
            triggered = checkLineCrossing(track.history, zone.points);
          } else if (settings.countingMode === 'zone' && zone.type === 'zone') {
            triggered = checkZoneEntry(track.history, zone.points);
          }

          if (triggered) {
            track.counted[zone.id] = true;
            totalDetectedChange++;

            if (isDefect) {
              defectCountChange++;
            }

            const className = isDefect ? (track.defectClass || 'defect') : track.className;
            newClassDistribution[className] = (newClassDistribution[className] || 0) + 1;

            const crop = getCropCallback(track.bbox);

            newLogs.push({
              id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
              trackId: track.id,
              className: track.className,
              confidence: track.confidence,
              status: track.status,
              severity: track.severity,
              defectClass: track.defectClass,
              zoneName: zone.name,
              thumbnail: crop,
            });
          }
        }
      }
    }

    const nextTotalDetected = stats.totalDetected + totalDetectedChange;
    const nextDefectCount = stats.defectCount + defectCountChange;
    const nextDefectRate = nextTotalDetected > 0 ? (nextDefectCount / nextTotalDetected) * 100 : 0;

    // ── Presence Detection ────────────────────────────────────────────────
    const hasItems = tracks.length > 0;
    const now = Date.now();
    const { absenceAlertSeconds } = get();
    let newPresenceStatus: 'present' | 'absent' | 'idle' = get().presenceStatus;
    let newLastItemSeenAt = get().lastItemSeenAt;
    let triggerGateFlash = false;

    if (hasItems) {
      newPresenceStatus = 'present';
      newLastItemSeenAt = now;
      // Flash gate if a new item was counted this frame
      if (totalDetectedChange > 0) triggerGateFlash = true;
    } else {
      if (newLastItemSeenAt !== null) {
        const secondsSinceSeen = (now - newLastItemSeenAt) / 1000;
        newPresenceStatus = secondsSinceSeen >= absenceAlertSeconds ? 'absent' : 'present';
      } else {
        newPresenceStatus = 'idle';
      }
    }

    // Auto-clear gate flash after 600ms
    if (triggerGateFlash) {
      setTimeout(() => set({ gateTriggerFlash: false }), 600);
    }

    set({
      activeTracks: updatedTracks,
      eventLogs: [...newLogs, ...eventLogs].slice(0, 500),
      presenceStatus: newPresenceStatus,
      lastItemSeenAt: newLastItemSeenAt,
      gateTriggerFlash: triggerGateFlash ? true : get().gateTriggerFlash,
      stats: {
        ...stats,
        totalDetected: nextTotalDetected,
        defectCount: nextDefectCount,
        defectRate: nextDefectRate,
        classDistribution: newClassDistribution,
      }
    });
  },

  updatePerformanceStats: (fps, latency) => set((state) => ({
    stats: { ...state.stats, fps, latency }
  })),

  resetSessionCounters: () => {
    set({
      eventLogs: [],
      stats: initialStats(),
      activeTracks: [],
    });
  },

  setModelLoading: (loading, progress = 0) => set({
    isModelLoading: loading,
    modelLoadProgress: progress,
  }),
}));
