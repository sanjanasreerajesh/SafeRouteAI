import type { IntersectionState, JourneyDirection } from "./traffic";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AmbulanceRoute {
  id: string;
  /** [lat, lng] pairs, Leaflet-ready, road-following where a routing provider is available. */
  coordinates: [number, number][];
  accidentLocation: [number, number];
  hospitalLocation: [number, number];
  accidentLocationName: string;
  hospitalName: string;
  /** ONE four-way intersection along the route — not a chain of separate signals. */
  intersection: IntersectionState;
  totalDistanceMeters: number;
  estimatedTimeSeconds: number;
  /** True when the routing provider was unreachable and a straight-line estimate was used. */
  isFallback: boolean;
}

export type EmergencySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface EmergencySummaryData {
  accidentId: string;
  severity: EmergencySeverity;
  victims: number;
  accidentLocationName: string;
  hospitalName: string;
  ambulanceId: string;
  ambulanceStatusLabel: string;
  etaSeconds: number;
  journeyDirection: JourneyDirection;
}

export type TimelineStageId =
  | "ACCIDENT_DETECTED"
  | "HOSPITAL_SELECTED"
  | "HOSPITAL_ALERTED"
  | "AMBULANCE_DISPATCHED"
  | "GPS_TRACKING_STARTED"
  | "ROUTE_GENERATED"
  | "SIGNAL_PRIORITY_OUTBOUND"
  | "INCIDENT_REACHED"
  | "VICTIM_PICKED_UP"
  | "JOURNEY_REVERSED"
  | "SIGNAL_PRIORITY_RETURN"
  | "AMBULANCE_ARRIVED";

export interface TimelineStep {
  id: TimelineStageId;
  label: string;
  status: "COMPLETED" | "ACTIVE" | "PENDING";
  timestampIso?: string;
  detail?: string;
}
