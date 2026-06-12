/**
 * Route Optimization Module (frontend client)
 *
 * Tries backend API first, then OSRM directly, then local estimate.
 * Always returns a route so the UI never breaks when the backend is offline.
 */

import { calculateDistance } from "@/lib/emergencyResponse";

export interface RouteCoordinates {
  lat: number;
  lon: number;
}

export interface RouteDestination extends RouteCoordinates {
  name: string;
}

export interface RouteRequest {
  source: RouteCoordinates;
  destination: RouteDestination;
}

export interface RouteResult {
  hospitalName: string;
  distanceKm: number;
  etaMinutes: number;
  /** Leaflet-ready [lat, lon] pairs */
  polyline: [number, number][];
  isFallback: boolean;
}

const EMERGENCY_SPEED_KMH = 45;
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

function getBackendUrls(): string[] {
  const envBase = import.meta.env.VITE_API_URL;
  if (envBase) return [`${envBase.replace(/\/$/, "")}/api/route`];
  // Same-origin proxy (vite dev) then direct backend
  return ["/api/route", "http://127.0.0.1:8000/api/route", "http://localhost:8000/api/route"];
}

function parseBackendResponse(data: Record<string, unknown>): RouteResult {
  return {
    hospitalName: String(data.hospital_name ?? ""),
    distanceKm: Number(data.distance_km),
    etaMinutes: Number(data.eta_minutes),
    polyline: (data.polyline as [number, number][]) ?? [],
    isFallback: Boolean(data.is_fallback),
  };
}

function buildEstimatedRoute(request: RouteRequest): RouteResult {
  const { source, destination } = request;
  const distanceKm = calculateDistance(
    source.lat,
    source.lon,
    destination.lat,
    destination.lon
  );
  return {
    hospitalName: destination.name,
    distanceKm: Math.round(distanceKm * 100) / 100,
    etaMinutes: Math.round(((distanceKm / EMERGENCY_SPEED_KMH) * 60) * 10) / 10,
    polyline: [
      [source.lat, source.lon],
      [destination.lat, destination.lon],
    ],
    isFallback: true,
  };
}

async function fetchFromBackend(request: RouteRequest): Promise<RouteResult | null> {
  const body = JSON.stringify({
    source_lat: request.source.lat,
    source_lon: request.source.lon,
    dest_lat: request.destination.lat,
    dest_lon: request.destination.lon,
    hospital_name: request.destination.name,
  });

  for (const url of getBackendUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (response.ok) {
        return parseBackendResponse(await response.json());
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

async function fetchFromOSRM(request: RouteRequest): Promise<RouteResult | null> {
  const { source, destination } = request;
  const url =
    `${OSRM_URL}/${source.lon},${source.lat};${destination.lon},${destination.lat}` +
    "?overview=full&geometries=geojson&steps=false";

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;

    const route = data.routes[0];
    const polyline: [number, number][] = route.geometry.coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]]
    );

    return {
      hospitalName: destination.name,
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      etaMinutes: Math.round((route.duration / 60) * 10) / 10,
      polyline,
      isFallback: false,
    };
  } catch {
    return null;
  }
}

export async function fetchEmergencyRoute(request: RouteRequest): Promise<RouteResult> {
  const backendRoute = await fetchFromBackend(request);
  if (backendRoute && backendRoute.polyline.length >= 2) {
    return backendRoute;
  }

  const osrmRoute = await fetchFromOSRM(request);
  if (osrmRoute && osrmRoute.polyline.length >= 2) {
    return osrmRoute;
  }

  return buildEstimatedRoute(request);
}

export function formatEta(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}
