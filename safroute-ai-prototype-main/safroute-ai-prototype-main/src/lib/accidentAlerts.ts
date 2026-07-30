export type Severity = "Low" | "Medium" | "High" | "Critical";

export type HospitalStatus = "Ambulance Dispatched" | "Pending";
export type TrafficStatus = "Road Blocked" | "Diverted" | "Cleared";
export type InvestigationStatus = "Pending" | "Under Investigation" | "Completed";
export type RoadType = "Highway" | "City" | "Junction";

export type PostureStatus =
  | "Stable"
  | "Conscious"
  | "Possible Injury"
  | "Critical"
  | "Unknown";

export type PostureRisk = "Low" | "Medium" | "High" | "Critical" | "Unknown";

export interface PostureAnalysis {
  status: PostureStatus;
  risk: PostureRisk;
  body_angle: number;
  persons_detected: number;
  motion: "Low" | "Medium" | "High" | "Unknown";
}

export interface AccidentAlert {
  id: string;
  createdAt: string; // ISO
  severity: Severity;
  confidence?: number; // 0-1
  lat: number;
  lng: number;
  location: string;

  // Dummy routing / assignments
  assignedHospital: string;
  assignedPoliceStation: string;

  // Details
  injured: number;
  vehicles: number;
  roadType: RoadType;

  // Evidence
  photoDataUrl?: string; // base64 data URL
  source: "image" | "video";

  // Workflow status (dashboard-specific)
  hospitalStatus: HospitalStatus;
  trafficStatus: TrafficStatus;
  investigationStatus: InvestigationStatus;

  // UI helper
  isNew: boolean;

  // Posture analysis (optional extension)
  postureAnalysis?: PostureAnalysis;

  // Deduplication key: one alert per accident event (e.g. video upload session)
  eventKey?: string;

  // Dynamic hospital assignment (from POST /detect-accident)
  assignedHospitalLat?: number;
  assignedHospitalLng?: number;
  assignedHospitalAddress?: string;
  assignedHospitalPhone?: string | null;
  hospitalMapsUrl?: string;
  isHospitalRegistered?: boolean;
  integrationMessage?: string;
  hospitalSelectionReason?: string;
  routeDistanceKm?: number;
  etaMinutes?: number;
  routePolyline?: [number, number][];

  // Dynamic police assignment (from POST /nearest-police)
  assignedPoliceLat?: number;
  assignedPoliceLng?: number;
  assignedPoliceAddress?: string;
  assignedPolicePhone?: string | null;
  policeMapsUrl?: string;
  isPoliceRegistered?: boolean;
  policeIntegrationMessage?: string;
  policeSelectionReason?: string;
  policeRouteDistanceKm?: number;
  policeEtaMinutes?: number;
  policeRoutePolyline?: [number, number][];
}

const STORAGE_KEY = "safroute.accidentAlerts.v1";

function safeParseAlerts(raw: string | null): AccidentAlert[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as AccidentAlert[];
  } catch {
    return [];
  }
}

function loadAlerts(): AccidentAlert[] {
  if (typeof window === "undefined") return [];
  return safeParseAlerts(window.localStorage.getItem(STORAGE_KEY));
}

function saveAlerts(alerts: AccidentAlert[]) {
  if (typeof window === "undefined") return;
  try {
    // Limit to most recent 20 alerts to prevent localStorage overflow (base64 images are large)
    const limitedAlerts = alerts.slice(0, 20);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedAlerts));
  } catch (err) {
    console.error("Failed to save alerts to localStorage (likely full):", err);
    // If full, try saving even fewer
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts.slice(0, 5)));
    } catch (e) {
      console.warn("localStorage critically full, clearing alerts.");
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
}

const emitter = new EventTarget();
const EVENT_NAME = "accident-alerts-updated";

export function getAccidentAlerts(): AccidentAlert[] {
  return loadAlerts();
}

export function subscribeAccidentAlerts(onChange: (alerts: AccidentAlert[]) => void) {
  const handler = () => onChange(loadAlerts());
  const listener = handler as EventListener;
  emitter.addEventListener(EVENT_NAME, listener);

  // Also listen for other tabs/windows
  const storageListener = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) handler();
  };
  window.addEventListener("storage", storageListener);

  // Initial fire
  handler();

  return () => {
    emitter.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", storageListener);
  };
}

export function publishAccidentAlert(alert: AccidentAlert) {
  console.log("lib: publishAccidentAlert called", alert.id);
  const alerts = loadAlerts();

  if (alert.eventKey) {
    const duplicate = alerts.some((a) => a.eventKey === alert.eventKey);
    if (duplicate) {
      console.log("lib: skipping duplicate alert for event", alert.eventKey);
      return;
    }
  }

  const next = [alert, ...alerts];
  saveAlerts(next);
  emitter.dispatchEvent(new Event(EVENT_NAME));
  console.log("lib: update event dispatched");
}

/** Keep the first alert per accident event (eventKey, or source+location fallback) */
export function dedupeAlertsByEvent(alerts: AccidentAlert[]): AccidentAlert[] {
  const seen = new Set<string>();
  const result: AccidentAlert[] = [];
  for (const alert of alerts) {
    const key = alert.eventKey ?? `${alert.source}:${alert.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(alert);
  }
  return result;
}

export function markAlertNotNew(alertId: string) {
  const alerts = loadAlerts();
  const next = alerts.map((a) => (a.id === alertId ? { ...a, isNew: false } : a));
  saveAlerts(next);
  emitter.dispatchEvent(new Event(EVENT_NAME));
}

export function updateAccidentAlert(alertId: string, patch: Partial<AccidentAlert>) {
  const alerts = loadAlerts();
  const next = alerts.map((a) => (a.id === alertId ? { ...a, ...patch } : a));
  saveAlerts(next);
  emitter.dispatchEvent(new Event(EVENT_NAME));
}

/** Old static Chennai hospitals — refresh these to dynamic lookup */
const LEGACY_STATIC_HOSPITALS = new Set([
  "Apollo Hospitals Greams Road",
  "MIOT International",
  "MGM Healthcare",
  "Gleneagles HealthCity Chennai",
  "SIMS Hospital",
]);

/** Old hardcoded police station — refresh to dynamic lookup */
const LEGACY_STATIC_POLICE = new Set([
  "Teynampet Police Station",
  "Anna Salai Police Station",
  "Koyambedu Police Station",
]);

export function alertNeedsHospitalRefresh(alert: AccidentAlert): boolean {
  if (alert.assignedHospitalLat == null || alert.assignedHospitalLng == null) return true;
  return LEGACY_STATIC_HOSPITALS.has(alert.assignedHospital);
}

export function alertNeedsPoliceRefresh(alert: AccidentAlert): boolean {
  if (alert.assignedPoliceLat == null || alert.assignedPoliceLng == null) return true;
  return LEGACY_STATIC_POLICE.has(alert.assignedPoliceStation);
}

