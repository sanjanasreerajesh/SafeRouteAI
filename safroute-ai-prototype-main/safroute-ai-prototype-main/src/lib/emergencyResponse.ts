export interface LocationData {
  location: string;
  lat: number;
  lon: number;
}

/** Demo video locations only — not used for hospital lookup */
export const LOCATION_MAP: Record<string, LocationData> = {
  "video1.mp4": { location: "Kathipara Junction", lat: 13.0067, lon: 80.2033 },
  "video2.mp4": { location: "Anna Salai", lat: 13.0674, lon: 80.2606 },
  "video3.mp4": { location: "Koyambedu Junction", lat: 13.0695, lon: 80.1946 },
  "video4.mp4": { location: "Sholinganallur Junction", lat: 12.8996, lon: 80.2279 },
};

/** Haversine formula — distance in kilometres */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getLocationForVideo(filename: string): LocationData | null {
  return LOCATION_MAP[filename] ?? null;
}

export function hasMappedLocation(filename: string): boolean {
  return filename in LOCATION_MAP;
}
