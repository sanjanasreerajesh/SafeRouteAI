import { getLocationForVideo, type LocationData } from "@/lib/emergencyResponse";

const DEFAULT_LOCATION: LocationData = {
  location: "Anna Salai, Chennai",
  lat: 13.0827,
  lon: 80.2707,
};

export type LocationSource = "manual" | "gps" | "video" | "default";

export interface ResolvedLocation extends LocationData {
  source: LocationSource;
}

interface BigDataCloudResponse {
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  countryName?: string;
}

/** Get device GPS coordinates */
export function getDeviceLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

function formatBigDataCloudName(data: BigDataCloudResponse): string {
  const parts = [
    data.locality,
    data.city,
    data.principalSubdivision,
    data.countryName,
  ].filter(Boolean);
  return parts.join(", ");
}

function looksLikeCoordinates(value: string): boolean {
  return /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(value.trim());
}

/** Reverse geocode via backend (Nominatim server-side, no CORS issues) */
async function reverseGeocodeBackend(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { location?: string };
    if (data.location && !looksLikeCoordinates(data.location)) {
      return data.location;
    }
    return data.location ?? null;
  } catch {
    return null;
  }
}

/** Browser-friendly fallback geocoder */
async function reverseGeocodeBigDataCloud(lat: number, lon: number): Promise<string | null> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as BigDataCloudResponse;
    const name = formatBigDataCloudName(data);
    return name || null;
  } catch {
    return null;
  }
}

/** Reverse geocode coordinates to a readable place name */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const backend = await reverseGeocodeBackend(lat, lon);
  if (backend && !looksLikeCoordinates(backend)) return backend;

  const cloud = await reverseGeocodeBigDataCloud(lat, lon);
  if (cloud) return cloud;

  return backend ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export function isValidCoordinates(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

/**
 * Resolve accident location priority:
 * 1. Manual coordinates entered by user (always reverse geocode if name missing)
 * 2. Device GPS + place name lookup
 * 3. Demo video filename mapping
 * 4. Default fallback
 */
export async function resolveAccidentLocation(options: {
  manual?: Partial<LocationData> | null;
  useGps?: boolean;
  videoFilename?: string;
}): Promise<ResolvedLocation> {
  const { manual, useGps, videoFilename } = options;

  if (manual && isValidCoordinates(Number(manual.lat), Number(manual.lon))) {
    const lat = Number(manual.lat);
    const lon = Number(manual.lon);
    const manualName = manual.location?.trim();
    const location =
      manualName && !looksLikeCoordinates(manualName)
        ? manualName
        : await reverseGeocode(lat, lon);
    return { location, lat, lon, source: "manual" };
  }

  if (useGps) {
    try {
      const { lat, lon } = await getDeviceLocation();
      const location = await reverseGeocode(lat, lon);
      return { location, lat, lon, source: "gps" };
    } catch {
      // fall through to video/default
    }
  }

  const videoLocation = videoFilename ? getLocationForVideo(videoFilename) : null;
  if (videoLocation) {
    return { ...videoLocation, source: "video" };
  }

  return { ...DEFAULT_LOCATION, source: "default" };
}
