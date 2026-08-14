/**
 * simulationService.ts
 *
 * Pure, framework-agnostic geometry helpers used to move the ambulance icon
 * smoothly along a real route polyline (not a straight line, not random
 * jumps) and to compute bearings so the icon can face the direction of
 * travel. No React, no state — just math — so it's easy to unit test and
 * reuse from `useAmbulanceSimulation`.
 */

import type { ApproachDirection } from "@/types/traffic";

export type Coord = [number, number]; // [lat, lng]

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two [lat,lng] points, in meters. */
export function haversineMeters(a: Coord, b: Coord): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Compass bearing (0=N, 90=E, 180=S, 270=W) from `a` to `b`. */
export function bearingDegrees(a: Coord, b: Coord): number {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface CumulativeDistances {
  /** Cumulative distance (meters) at each vertex of the polyline; cum[0] = 0. */
  cum: number[];
  totalMeters: number;
}

/** Cumulative along-route distance at each vertex of a polyline. */
export function computeCumulativeDistances(coords: Coord[]): CumulativeDistances {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(coords[i - 1], coords[i]));
  }
  return { cum, totalMeters: cum[cum.length - 1] ?? 0 };
}

export interface RoutePoint {
  lat: number;
  lng: number;
  headingDegrees: number;
}

/**
 * Interpolate the point (and direction of travel) at `targetMeters` along a
 * polyline whose cumulative distances are `cum`. Clamps to the route ends.
 */
export function pointAtDistance(
  coords: Coord[],
  cum: number[],
  targetMeters: number
): RoutePoint {
  if (coords.length === 0) return { lat: 0, lng: 0, headingDegrees: 0 };
  if (coords.length === 1) {
    return { lat: coords[0][0], lng: coords[0][1], headingDegrees: 0 };
  }

  const total = cum[cum.length - 1];
  const clamped = Math.min(Math.max(targetMeters, 0), total);

  // Find the segment [i-1, i] containing `clamped`.
  let i = 1;
  while (i < cum.length - 1 && cum[i] < clamped) i++;

  const segStart = coords[i - 1];
  const segEnd = coords[i];
  const segStartDist = cum[i - 1];
  const segLen = cum[i] - cum[i - 1];
  const t = segLen > 0 ? (clamped - segStartDist) / segLen : 0;

  const lat = segStart[0] + (segEnd[0] - segStart[0]) * t;
  const lng = segStart[1] + (segEnd[1] - segStart[1]) * t;
  const headingDegrees = bearingDegrees(segStart, segEnd);

  return { lat, lng, headingDegrees };
}

/**
 * Evenly place `count` traffic signals along the route between
 * `startFraction` and `endFraction` of total distance (fractions kept away
 * from 0/1 so signals don't sit exactly on top of the accident/hospital).
 */
export function placeSignalsAlongRoute(
  coords: Coord[],
  cum: number[],
  count: number,
  startFraction = 0.12,
  endFraction = 0.9
): { lat: number; lng: number; distanceAlongRouteMeters: number }[] {
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 0 || count <= 0) return [];

  const points: { lat: number; lng: number; distanceAlongRouteMeters: number }[] = [];
  for (let i = 0; i < count; i++) {
    const fraction =
      count === 1
        ? (startFraction + endFraction) / 2
        : startFraction + ((endFraction - startFraction) * i) / (count - 1);
    const distanceAlongRouteMeters = fraction * total;
    const { lat, lng } = pointAtDistance(coords, cum, distanceAlongRouteMeters);
    points.push({ lat, lng, distanceAlongRouteMeters });
  }
  return points;
}

/**
 * Bucket a compass bearing into one of the 4 cardinal approach directions —
 * used to derive which way the ambulance is approaching a junction from,
 * directly from route geometry (never hardcoded).
 */
export function bucketCompass(bearingDeg: number): ApproachDirection {
  const b = ((bearingDeg % 360) + 360) % 360;
  if (b >= 315 || b < 45) return "NORTH";
  if (b < 135) return "EAST";
  if (b < 225) return "SOUTH";
  return "WEST";
}

/** The compass direction directly opposite `direction`. */
export function oppositeCompass(direction: ApproachDirection): ApproachDirection {
  const map: Record<ApproachDirection, ApproachDirection> = {
    NORTH: "SOUTH",
    SOUTH: "NORTH",
    EAST: "WEST",
    WEST: "EAST",
  };
  return map[direction];
}

export function metersToKm(m: number): number {
  return m / 1000;
}

export function secondsToClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
