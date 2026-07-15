import type { Point } from '../types';

/**
 * Checks if three points are listed in counter-clockwise order.
 */
function ccw(A: Point, B: Point, C: Point): boolean {
  return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
}

/**
 * Checks if line segment AB intersects with line segment CD.
 */
export function doSegmentsIntersect(A: Point, B: Point, C: Point, D: Point): boolean {
  return (
    ccw(A, C, D) !== ccw(B, C, D) &&
    ccw(A, B, C) !== ccw(A, B, D)
  );
}

/**
 * Checks if a point is inside a polygon zone using the Ray-Casting algorithm.
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 0.0001) + xi;
    
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Determines if a track crossed a defined counting line.
 * Checks the last segment of the track's movement history.
 */
export function checkLineCrossing(history: Point[], linePoints: Point[]): boolean {
  if (history.length < 2 || linePoints.length < 2) return false;
  
  const lastPoint = history[history.length - 1];
  const prevPoint = history[history.length - 2];
  
  const lineStart = linePoints[0];
  const lineEnd = linePoints[1];

  return doSegmentsIntersect(prevPoint, lastPoint, lineStart, lineEnd);
}

/**
 * Determines if a track just entered a polygon zone.
 * True if the latest position is inside, and the previous position was outside.
 */
export function checkZoneEntry(history: Point[], zonePoints: Point[]): boolean {
  if (history.length < 1 || zonePoints.length < 3) return false;

  const currentPoint = history[history.length - 1];
  const isCurrentInside = isPointInPolygon(currentPoint, zonePoints);

  if (!isCurrentInside) return false;

  // If there's only one point in history, it is an entry if it's inside
  if (history.length === 1) return true;

  // Otherwise, it entered if the previous point was outside
  const prevPoint = history[history.length - 2];
  const isPrevInside = isPointInPolygon(prevPoint, zonePoints);

  return !isPrevInside;
}
