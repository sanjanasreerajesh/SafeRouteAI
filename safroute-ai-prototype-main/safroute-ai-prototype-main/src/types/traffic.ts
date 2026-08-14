/**
 * Types for the single four-way intersection and the ESP32 hardware
 * controller layer, used only by the Ambulance Tracking & Smart Traffic
 * Priority dashboard (isolated from the rest of the app's types).
 *
 * This models ONE intersection with four approaches (NORTH/SOUTH/EAST/WEST)
 * controlled by one controller — not a chain of separate signals along the
 * route.
 */

export type ApproachDirection = "NORTH" | "SOUTH" | "EAST" | "WEST";

export const ALL_DIRECTIONS: ApproachDirection[] = ["NORTH", "SOUTH", "EAST", "WEST"];

/** Each approach's own light — exactly one of these three, no shared/group state. */
export type DirectionSignalState = "RED" | "YELLOW" | "GREEN";

/** What the intersection controller is currently doing. */
export type IntersectionMode =
  | "NORMAL"
  | "PRIORITY_PREPARING"
  | "PRIORITY_ACTIVE"
  | "PRIORITY_CLEARING";

export interface IntersectionState {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Fixed along-route distance from the incident (route start), in meters. Never mutated. */
  canonicalDistanceMeters: number;

  /** Independent RED/YELLOW/GREEN state per approach — the whole point of this model. */
  directions: Record<ApproachDirection, DirectionSignalState>;

  /** Which approach the ambulance is currently using (recomputed per journey leg from route geometry). */
  ambulanceApproach: ApproachDirection;

  mode: IntersectionMode;

  /** Signed along-route distance from the ambulance to the intersection (negative once passed). */
  distanceMeters: number;
  etaSeconds: number;
}

export interface ESP32ControllerStatus {
  controllerId: string;
  online: boolean;
  wifiStatus: "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
  ip: string;
  lastCommand: string;
  responseTimeMs: number;
  lastUpdatedIso: string;
}

export interface CommandLogEntry {
  id: string;
  timestampIso: string;
  event: string;
  detail: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
}

export type JourneyDirection = "HOSPITAL_TO_INCIDENT" | "INCIDENT_TO_HOSPITAL";

export interface CommandResult {
  success: boolean;
  /** The literal command string sent to the (mock) ESP32, e.g. "SOUTH_GREEN" or "RESUME_NORMAL_CYCLE". */
  command: string;
  controllerId: string;
  responseTimeMs: number;
}
