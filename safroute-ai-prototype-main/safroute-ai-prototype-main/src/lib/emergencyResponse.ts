export interface LocationData {
  location: string;
  lat: number;
  lon: number;
}

export interface HospitalData {
  name: string;
  lat: number;
  lon: number;
  icu: boolean;
  trauma: boolean;
}

export interface HospitalRecommendation extends HospitalData {
  dist: number;
  score: number;
  isClosestSuitable: boolean;
}

export const LOCATION_MAP: Record<string, LocationData> = {
  "video1.mp4": { location: "Kathipara Junction", lat: 13.0067, lon: 80.2033 },
  "video2.mp4": { location: "Anna Salai", lat: 13.0674, lon: 80.2606 },
  "video3.mp4": { location: "Koyambedu Junction", lat: 13.0695, lon: 80.1946 },
  "video4.mp4": { location: "Sholinganallur Junction", lat: 12.8996, lon: 80.2279 },
};

export const HOSPITALS: HospitalData[] = [
  { name: "Apollo Hospitals Greams Road", lat: 13.0612, lon: 80.2489, icu: true, trauma: true },
  { name: "MIOT International", lat: 13.0182, lon: 80.1834, icu: true, trauma: true },
  { name: "MGM Healthcare", lat: 13.0722, lon: 80.2215, icu: true, trauma: true },
  { name: "Gleneagles HealthCity Chennai", lat: 12.9056, lon: 80.2014, icu: true, trauma: true },
  { name: "SIMS Hospital", lat: 13.0519, lon: 80.2120, icu: true, trauma: true },
];

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

/** Resolve hospital coordinates from assigned hospital name in alerts */
export function getHospitalByName(name: string): HospitalData | null {
  const lower = name.toLowerCase().trim();

  const aliases: Record<string, string> = {
    "apollo hospital": "Apollo Hospitals Greams Road",
    "apollo hospitals": "Apollo Hospitals Greams Road",
  };

  const aliasMatch = aliases[lower];
  if (aliasMatch) {
    return HOSPITALS.find((h) => h.name === aliasMatch) ?? null;
  }

  return (
    HOSPITALS.find((h) => h.name.toLowerCase() === lower) ??
    HOSPITALS.find(
      (h) =>
        h.name.toLowerCase().includes(lower) ||
        lower.includes(h.name.toLowerCase())
    ) ??
    null
  );
}

/**
 * Rank hospitals by distance, ICU availability, and trauma care.
 * Returns the best match with an explainable emergency response score (0–100).
 */
export function recommendHospital(
  accidentLat: number,
  accidentLon: number
): HospitalRecommendation {
  const scored = HOSPITALS.map((h) => {
    const dist = calculateDistance(accidentLat, accidentLon, h.lat, h.lon);

    // Distance component: up to 50 pts (0 km = 50, 25+ km = 0)
    const distanceScore = Math.max(0, 50 - dist * 2);
    const icuScore = h.icu ? 25 : 0;
    const traumaScore = h.trauma ? 25 : 0;
    const score = Math.min(100, distanceScore + icuScore + traumaScore);

    return { ...h, dist, score, isClosestSuitable: false };
  });

  // Suitable = has both ICU and trauma care
  const suitable = scored.filter((h) => h.icu && h.trauma);
  const pool = suitable.length > 0 ? suitable : scored;

  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.dist - b.dist;
  });

  const best = { ...pool[0] };

  const closestDist = Math.min(...pool.map((h) => h.dist));
  best.isClosestSuitable = best.dist === closestDist;

  return best;
}
