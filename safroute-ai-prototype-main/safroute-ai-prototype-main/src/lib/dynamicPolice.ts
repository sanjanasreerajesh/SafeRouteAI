/**
 * Dynamic police response — worldwide police station search via backend API.
 * No static police data; all results fetched from OSM or Google Places.
 */

export type ApiSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DynamicPoliceStation {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  place_id?: string | null;
  distance_km: number;
  maps_url: string;
  eta_minutes?: number | null;
  route_distance_km?: number | null;
  route_polyline?: [number, number][];
  route_provider?: string;
  is_registered?: boolean;
  registry_id?: string | null;
  selection_reason?: string;
}

export interface PoliceRoute {
  hospital_name?: string;
  distance_km: number;
  eta_minutes: number;
  polyline: [number, number][];
  is_fallback: boolean;
  provider?: string;
}

export interface NearestPoliceResponse {
  accident: {
    latitude: number;
    longitude: number;
    severity: string;
    address?: string | null;
  };
  nearestPoliceStation: DynamicPoliceStation | null;
  topPoliceStations: DynamicPoliceStation[];
  route: PoliceRoute | null;
  integration: {
    registered: boolean;
    message: string;
    notifications?: Record<string, boolean>;
  };
}

function getBackendUrls(path: string): string[] {
  const envBase = import.meta.env.VITE_API_URL;
  if (envBase) return [`${envBase.replace(/\/$/, "")}${path}`];
  return [path, `http://127.0.0.1:8000${path}`, `http://localhost:8000${path}`];
}

export function toPoliceApiSeverity(
  severity: "Low" | "Medium" | "High" | "Critical" | string
): ApiSeverity {
  const s = severity.toUpperCase();
  if (s === "CRITICAL") return "CRITICAL";
  if (s === "HIGH") return "HIGH";
  if (s === "LOW") return "LOW";
  return "MEDIUM";
}

/** POST /nearest-police — find nearest police stations worldwide and compute routes. */
export async function fetchNearestPolice(
  latitude: number,
  longitude: number,
  severity: ApiSeverity | string,
  address?: string
): Promise<NearestPoliceResponse | null> {
  const body = JSON.stringify({
    latitude,
    longitude,
    severity: typeof severity === "string" ? severity.toUpperCase() : severity,
    address,
  });

  for (const url of getBackendUrls("/nearest-police")) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (response.ok) {
        return (await response.json()) as NearestPoliceResponse;
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

export function routeFromPoliceResponse(
  response: NearestPoliceResponse
): import("@/lib/routeOptimizer").RouteResult | null {
  const route = response.route;
  const station = response.nearestPoliceStation;
  if (!route || !station) return null;

  return {
    hospitalName: station.name,
    distanceKm: route.distance_km,
    etaMinutes: route.eta_minutes,
    polyline: route.polyline ?? [],
    isFallback: route.is_fallback,
  };
}

export interface MapPoliceStation {
  name: string;
  lat: number;
  lon: number;
  address?: string;
  phone?: string | null;
  distanceKm?: number;
  etaMinutes?: number | null;
  mapsUrl?: string;
  isSelected?: boolean;
}

export function policeStationsForMap(
  response: NearestPoliceResponse,
  selectedName?: string
): MapPoliceStation[] {
  return response.topPoliceStations.map((s) => ({
    name: s.name,
    lat: s.latitude,
    lon: s.longitude,
    address: s.address,
    phone: s.phone,
    distanceKm: s.route_distance_km ?? s.distance_km,
    etaMinutes: s.eta_minutes,
    mapsUrl: s.maps_url,
    isSelected: selectedName
      ? s.name === selectedName
      : s.name === response.nearestPoliceStation?.name,
  }));
}
