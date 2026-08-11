/**
 * ambulanceDispatchTypes.ts
 *
 * Shared TypeScript interfaces and types for the
 * Smart Ambulance Dispatch & Traffic Priority page.
 */

// ---------------------------------------------------------------------------
// Emergency Summary
// ---------------------------------------------------------------------------

export type DispatchPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type DispatchStatus =
  | "ACCIDENT_DETECTED"
  | "HOSPITAL_SELECTED"
  | "AMBULANCE_ASSIGNED"
  | "ROUTE_GENERATED"
  | "DISPATCHING"
  | "EN_ROUTE"
  | "NEAR_SIGNAL"
  | "VICTIM_PICKED_UP"
  | "RETURNING"
  | "HOSPITAL_REACHED";

export interface EmergencySummary {
  accidentId: string;
  priority: DispatchPriority;
  victims: number;
  selectedHospital: string;
  ambulanceAssigned: string;
  currentEtaMinutes: number;
  currentStatus: DispatchStatus;
}

// ---------------------------------------------------------------------------
// Ambulance
// ---------------------------------------------------------------------------

export interface AmbulanceInfo {
  id: string;
  driver: string;
  speedKmh: number;
  distanceRemainingKm: number;
  currentSignal: string;
  etaMinutes: number;
  hospitalDestination: string;
  status: DispatchStatus;
  progressPercent: number; // 0–100
}

// ---------------------------------------------------------------------------
// Traffic Signals
// ---------------------------------------------------------------------------

export type SignalColor = "RED" | "YELLOW" | "GREEN";
export type SignalMode = "AUTO" | "PRIORITY" | "CLEARED";

export interface TrafficSignal {
  id: string;
  label: string;
  distanceMeters: number;
  etaSeconds: number;
  color: SignalColor;
  mode: SignalMode;
  countdown: number;
}

// ---------------------------------------------------------------------------
// Route / Map
// ---------------------------------------------------------------------------

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface MapState {
  accidentLocation: RoutePoint;
  hospitalLocation: RoutePoint;
  ambulancePosition: RoutePoint;
  routePoints: RoutePoint[];
  signals: (TrafficSignal & { position: RoutePoint })[];
}

// ---------------------------------------------------------------------------
// ESP32
// ---------------------------------------------------------------------------

export type WifiStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING";

export interface ESP32ControllerStatus {
  online: boolean;
  wifiStatus: WifiStatus;
  ip: string;
  lastCommand: string;
  responseTimeMs: number;
  signalControlled: string;
}

// ---------------------------------------------------------------------------
// Command Log
// ---------------------------------------------------------------------------

export interface CommandLogEntry {
  id: string;
  timestamp: string;
  event: string;
  detail: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type TimelineStatus = "COMPLETED" | "ACTIVE" | "PENDING";

export interface TimelineStep {
  id: string;
  label: string;
  status: TimelineStatus;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface DispatchStats {
  signalsCleared: number;
  avgResponseTimeSec: number;
  distanceCoveredKm: number;
  etaAccuracyPercent: number;
  ambulanceSpeedKmh: number;
}
