/**
 * ambulanceService.ts
 *
 * Data source for the Ambulance Tracking dashboard. Currently returns demo
 * data (an accident, a selected hospital, a real road-following route
 * between them — reusing the existing `fetchEmergencyRoute` OSRM/backend
 * client already used elsewhere in the app — and ONE four-way intersection
 * along that route), structured so the mock calls below can be swapped for
 * real FastAPI calls without touching any component:
 *
 *   GET  /api/ambulance/{ambulance_id}
 *   GET  /api/ambulance/{ambulance_id}/location
 *   GET  /api/ambulance/{ambulance_id}/route
 *   POST /api/ambulance/{ambulance_id}/dispatch
 *
 * This does NOT create those backend endpoints (none exist yet) and does
 * NOT modify any existing API — it only prepares the frontend contract.
 */

import { fetchEmergencyRoute } from "@/lib/routeOptimizer";
import { TRAFFIC_CONFIG } from "@/config/trafficConfig";
import { computeCumulativeDistances, pointAtDistance, type Coord } from "@/services/simulationService";
import type { AmbulanceRoute, EmergencySummaryData } from "@/types/route";
import type { IntersectionState } from "@/types/traffic";

// ---------------------------------------------------------------------------
// Demo accident / hospital / ambulance identity
// ---------------------------------------------------------------------------

export const DEMO_ACCIDENT = {
  id: "ACC-2026-001",
  name: "Sholinganallur Junction, OMR",
  lat: 12.9010,
  lng: 80.2279,
  severity: "CRITICAL" as const,
  victims: 1,
};

export const DEMO_HOSPITAL = {
  name: "City Trauma Hospital",
  lat: 12.9581,
  lng: 80.2453,
};

export const DEMO_AMBULANCE_ID = "AMB-01";

const INTERSECTION_NAME = "Kandanchavadi Junction";

function buildEmergencySummary(
  status: string,
  etaSeconds: number,
  journeyDirection: EmergencySummaryData["journeyDirection"]
): EmergencySummaryData {
  return {
    accidentId: DEMO_ACCIDENT.id,
    severity: DEMO_ACCIDENT.severity,
    victims: DEMO_ACCIDENT.victims,
    accidentLocationName: DEMO_ACCIDENT.name,
    hospitalName: DEMO_HOSPITAL.name,
    ambulanceId: DEMO_AMBULANCE_ID,
    ambulanceStatusLabel: status,
    etaSeconds,
    journeyDirection,
  };
}

/**
 * Build the accident -> hospital route: a real road-following polyline when
 * a routing provider is reachable (reuses the existing OSRM/backend client),
 * with ONE four-way intersection placed along it (not a chain of separate
 * signals — see trafficConfig.intersectionPositionFraction).
 *
 * TODO (LIVE mode): replace with `GET /api/ambulance/{id}/route`.
 */
export async function getAmbulanceRoute(): Promise<AmbulanceRoute> {
  const routeResult = await fetchEmergencyRoute({
    source: { lat: DEMO_ACCIDENT.lat, lon: DEMO_ACCIDENT.lng },
    destination: { lat: DEMO_HOSPITAL.lat, lon: DEMO_HOSPITAL.lng, name: DEMO_HOSPITAL.name },
  });

  const coords: Coord[] = routeResult.polyline.length >= 2
    ? routeResult.polyline
    : [
        [DEMO_ACCIDENT.lat, DEMO_ACCIDENT.lng],
        [DEMO_HOSPITAL.lat, DEMO_HOSPITAL.lng],
      ];

  const { cum, totalMeters } = computeCumulativeDistances(coords);
  const total = totalMeters || routeResult.distanceKm * 1000;
  const canonicalDistanceMeters = TRAFFIC_CONFIG.intersectionPositionFraction * total;
  const { lat, lng } = pointAtDistance(coords, cum, canonicalDistanceMeters);

  // Only the canonical, journey-independent fields are set here (position,
  // fixed distance-from-incident). Everything direction-dependent
  // (ambulanceApproach, per-direction RED/YELLOW/GREEN state, the live
  // distanceMeters) is (re)computed by useAmbulanceSimulation at the start
  // of each journey leg, since it depends on which way the ambulance is
  // travelling. Defaults here are just placeholders until that first reset.
  const intersection: IntersectionState = {
    id: "INT-1",
    name: INTERSECTION_NAME,
    latitude: lat,
    longitude: lng,
    canonicalDistanceMeters,
    directions: { NORTH: "RED", SOUTH: "RED", EAST: "RED", WEST: "RED" },
    ambulanceApproach: "NORTH",
    mode: "NORMAL",
    distanceMeters: canonicalDistanceMeters,
    etaSeconds: 0,
  };

  return {
    id: "ROUTE-001",
    coordinates: coords,
    accidentLocation: [DEMO_ACCIDENT.lat, DEMO_ACCIDENT.lng],
    hospitalLocation: [DEMO_HOSPITAL.lat, DEMO_HOSPITAL.lng],
    accidentLocationName: DEMO_ACCIDENT.name,
    hospitalName: DEMO_HOSPITAL.name,
    intersection,
    totalDistanceMeters: total,
    estimatedTimeSeconds: routeResult.etaMinutes * 60,
    isFallback: routeResult.isFallback,
  };
}

/** TODO (LIVE mode): replace with `POST /api/ambulance/{id}/dispatch`. */
export async function dispatchAmbulance(): Promise<{ ambulanceId: string; dispatchedAtIso: string }> {
  return { ambulanceId: DEMO_AMBULANCE_ID, dispatchedAtIso: new Date().toISOString() };
}

export { buildEmergencySummary };
