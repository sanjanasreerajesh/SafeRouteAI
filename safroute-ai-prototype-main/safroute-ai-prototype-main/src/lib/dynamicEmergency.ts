/**
 * Dynamic emergency response — worldwide hospital search via backend API.
 * No static hospital data; all results fetched from OSM or Google Places.
 */

export type ApiSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DynamicHospital {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  place_id?: string | null;
  distance_km: number;
  maps_url: string;
  is_trauma_center?: boolean;
  eta_minutes?: number | null;
  route_distance_km?: number | null;
  route_polyline?: [number, number][];
  route_provider?: string;
  is_registered?: boolean;
  registry_id?: string | null;
  selection_reason?: string;
}

export interface EmergencyRoute {
  hospital_name?: string;
  distance_km: number;
  eta_minutes: number;
  polyline: [number, number][];
  is_fallback: boolean;
  provider?: string;
}

export interface DetectAccidentResponse {
  accident: {
    latitude: number;
    longitude: number;
    severity: string;
    address?: string | null;
  };
  nearestHospital: DynamicHospital | null;
  topHospitals: DynamicHospital[];
  route: EmergencyRoute | null;
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

/** Map UI severity labels to API enum */
export function toApiSeverity(
  severity: "Low" | "Medium" | "High" | "Critical" | string
): ApiSeverity {
  const s = severity.toUpperCase();
  if (s === "CRITICAL") return "CRITICAL";
  if (s === "HIGH") return "HIGH";
  if (s === "LOW") return "LOW";
  return "MEDIUM";
}

/**
 * POST /detect-accident — find nearest hospitals worldwide and compute routes.
 */
export async function detectAccident(
  latitude: number,
  longitude: number,
  severity: ApiSeverity | string,
  address?: string
): Promise<DetectAccidentResponse | null> {
  const body = JSON.stringify({
    latitude,
    longitude,
    severity: typeof severity === "string" ? severity.toUpperCase() : severity,
    address,
  });

  for (const url of getBackendUrls("/detect-accident")) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (response.ok) {
        return (await response.json()) as DetectAccidentResponse;
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

/** Convert backend route to frontend RouteResult shape */
export function routeFromDetectResponse(
  response: DetectAccidentResponse
): import("@/lib/routeOptimizer").RouteResult | null {
  const route = response.route;
  const hospital = response.nearestHospital;
  if (!route || !hospital) return null;

  return {
    hospitalName: hospital.name,
    distanceKm: route.distance_km,
    etaMinutes: route.eta_minutes,
    polyline: route.polyline ?? [],
    isFallback: route.is_fallback,
  };
}

/** Hospital marker shape for map components */
export interface MapHospital {
  name: string;
  lat: number;
  lon: number;
  address?: string;
  phone?: string | null;
  distanceKm?: number;
  etaMinutes?: number | null;
  mapsUrl?: string;
  isSelected?: boolean;
  isRegistered?: boolean;
}

export function hospitalsForMap(
  response: DetectAccidentResponse,
  selectedName?: string
): MapHospital[] {
  return response.topHospitals.map((h) => ({
    name: h.name,
    lat: h.latitude,
    lon: h.longitude,
    address: h.address,
    phone: h.phone,
    distanceKm: h.route_distance_km ?? h.distance_km,
    etaMinutes: h.eta_minutes,
    mapsUrl: h.maps_url,
    isSelected: selectedName ? h.name === selectedName : h.name === response.nearestHospital?.name,
    isRegistered: h.is_registered,
  }));
}
