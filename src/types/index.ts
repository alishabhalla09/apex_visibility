export interface Point {
  x: number;
  y: number;
}

export interface Detection {
  bbox: [number, number, number, number]; // [x, y, w, h] (normalized or pixel relative)
  classId: number;
  className: string;
  confidence: number;
}

export interface Track {
  id: string;
  bbox: [number, number, number, number]; // [x, y, w, h]
  className: string;
  confidence: number;
  history: Point[];
  age: number;
  lostFrames: number;
  status: 'pass' | 'fail';
  severity?: 'minor' | 'major' | 'critical';
  defectClass?: string;
  counted: { [zoneId: string]: boolean }; // tracks if this object was counted by specific zones/lines
  firstSeen: number;
  lastSeen: number;
}

export interface CountingZone {
  id: string;
  name: string;
  type: 'line' | 'zone';
  points: Point[]; // exactly 2 points for 'line'; 3+ points for 'zone' (polygon)
  color: string;
}

export interface SessionStats {
  totalDetected: number;
  defectCount: number;
  defectRate: number;
  fps: number;
  latency: number;
  classDistribution: { [className: string]: number };
}

export interface EventLogItem {
  id: string;
  timestamp: number;
  trackId: string;
  className: string;
  confidence: number;
  status: 'pass' | 'fail';
  severity?: 'minor' | 'major' | 'critical';
  defectClass?: string;
  zoneName?: string;
  thumbnail?: string; // Base64 data URL of cropped bounding box
}

export interface DashboardSettings {
  modelType: 'coco-ssd' | 'face-api' | 'custom-onnx' | 'simulation';
  confidenceThreshold: number;
  nmsThreshold: number;
  frameSamplingRate: number; // process every Nth frame (1 = every frame, 2 = every 2nd frame, etc.)
  countingMode: 'all' | 'line' | 'zone';
  defectRateAlertThreshold: number; // percentage (e.g. 5 for 5%)
  audioAlertEnabled: boolean;
}

export interface SessionHistoryItem {
  id: string;
  startTime: number;
  endTime: number;
  totalCounts: { [className: string]: number };
  defectCount: number;
  totalDetected: number;
  logs: EventLogItem[];
}
