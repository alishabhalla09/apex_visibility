import type { Detection, Track, Point } from '../types';

export function getIntersectionOverUnion(
  box1: [number, number, number, number],
  box2: [number, number, number, number]
): number {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;

  const x_left = Math.max(x1, x2);
  const y_top = Math.max(y1, y2);
  const x_right = Math.min(x1 + w1, x2 + w2);
  const y_bottom = Math.min(y1 + h1, y2 + h2);

  if (x_right <= x_left || y_bottom <= y_top) {
    return 0.0;
  }

  const intersection_area = (x_right - x_left) * (y_bottom - y_top);
  const area1 = w1 * h1;
  const area2 = w2 * h2;
  const union_area = area1 + area2 - intersection_area;

  if (union_area === 0) return 0;
  return intersection_area / union_area;
}

export class ObjectTracker {
  private activeTracks: Track[] = [];
  private nextId = 1;
  private maxLostFrames = 15; // Number of frames to keep a track without detections
  private iouThreshold = 0.25; // Minimum IoU to associate detections

  constructor(maxLostFrames = 15, iouThreshold = 0.25) {
    this.maxLostFrames = maxLostFrames;
    this.iouThreshold = iouThreshold;
  }

  public getTracks(): Track[] {
    return this.activeTracks;
  }

  public reset(): void {
    this.activeTracks = [];
    this.nextId = 1;
  }

  public update(detections: Detection[]): Track[] {
    const now = Date.now();
    const matchedTracks = new Set<number>();
    const matchedDetections = new Set<number>();

    // 1. Calculate IoUs between all active tracks and new detections
    interface MatchPair {
      trackIdx: number;
      detIdx: number;
      iou: number;
    }

    const pairs: MatchPair[] = [];
    for (let t = 0; t < this.activeTracks.length; t++) {
      for (let d = 0; d < detections.length; d++) {
        // Only match same/compatible classes if necessary, but generally we match by IoU
        // For general tracking, if a box overlaps highly, it's the same object, even if class changed (noise)
        const iou = getIntersectionOverUnion(this.activeTracks[t].bbox, detections[d].bbox);
        if (iou >= this.iouThreshold) {
          pairs.push({ trackIdx: t, detIdx: d, iou });
        }
      }
    }

    // Sort pairs by IoU in descending order
    pairs.sort((a, b) => b.iou - a.iou);

    // Greedy matching
    const associations: { trackIdx: number; detIdx: number }[] = [];
    for (const pair of pairs) {
      if (!matchedTracks.has(pair.trackIdx) && !matchedDetections.has(pair.detIdx)) {
        matchedTracks.add(pair.trackIdx);
        matchedDetections.add(pair.detIdx);
        associations.push({ trackIdx: pair.trackIdx, detIdx: pair.detIdx });
      }
    }

    // 2. Update matched tracks
    for (const assoc of associations) {
      const track = this.activeTracks[assoc.trackIdx];
      const det = detections[assoc.detIdx];
      
      const center: Point = {
        x: det.bbox[0] + det.bbox[2] / 2,
        y: det.bbox[1] + det.bbox[3] / 2,
      };

      // Limit history size to 30 points
      const history = [...track.history, center].slice(-30);

      // Check if detection indicates a defect
      const isDefect = ['scratch', 'dent', 'crack', 'missing_part', 'defect', 'flaw'].includes(
        det.className.toLowerCase()
      );

      // Determine severity
      let severity: 'minor' | 'major' | 'critical' | undefined = track.severity;
      let defectClass: string | undefined = track.defectClass;
      let status: 'pass' | 'fail' = track.status;

      if (isDefect) {
        status = 'fail';
        defectClass = det.className;
        // Severity heuristic based on size and confidence
        const area = det.bbox[2] * det.bbox[3];
        if (area > 30000 || det.confidence > 0.85) {
          severity = 'critical';
        } else if (area > 10000 || det.confidence > 0.6) {
          severity = 'major';
        } else {
          severity = 'minor';
        }
      }

      this.activeTracks[assoc.trackIdx] = {
        ...track,
        bbox: det.bbox,
        className: isDefect ? 'defect' : det.className, // Keep general or change to defect
        confidence: det.confidence,
        history,
        age: track.age + 1,
        lostFrames: 0,
        status,
        severity,
        defectClass,
        lastSeen: now,
      };
    }

    // 3. Handle unmatched tracks (increment lostFrames)
    for (let t = 0; t < this.activeTracks.length; t++) {
      if (!matchedTracks.has(t)) {
        this.activeTracks[t].lostFrames += 1;
      }
    }

    // 4. Handle unmatched detections (spawn new tracks)
    for (let d = 0; d < detections.length; d++) {
      if (!matchedDetections.has(d)) {
        const det = detections[d];
        const center: Point = {
          x: det.bbox[0] + det.bbox[2] / 2,
          y: det.bbox[1] + det.bbox[3] / 2,
        };

        const isDefect = ['scratch', 'dent', 'crack', 'missing_part', 'defect', 'flaw'].includes(
          det.className.toLowerCase()
        );

        let severity: 'minor' | 'major' | 'critical' | undefined = undefined;
        let defectClass: string | undefined = undefined;
        let status: 'pass' | 'fail' = 'pass';

        if (isDefect) {
          status = 'fail';
          defectClass = det.className;
          const area = det.bbox[2] * det.bbox[3];
          if (area > 30000 || det.confidence > 0.85) {
            severity = 'critical';
          } else if (area > 10000 || det.confidence > 0.6) {
            severity = 'major';
          } else {
            severity = 'minor';
          }
        }

        const idString = `TRK-${String(this.nextId++).padStart(3, '0')}`;
        this.activeTracks.push({
          id: idString,
          bbox: det.bbox,
          className: isDefect ? 'defect' : det.className,
          confidence: det.confidence,
          history: [center],
          age: 1,
          lostFrames: 0,
          status,
          severity,
          defectClass,
          counted: {},
          firstSeen: now,
          lastSeen: now,
        });
      }
    }

    // 5. Remove lost tracks
    this.activeTracks = this.activeTracks.filter(
      (t) => t.lostFrames <= this.maxLostFrames
    );

    return this.activeTracks;
  }
}
