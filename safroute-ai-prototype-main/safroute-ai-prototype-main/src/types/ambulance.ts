/**
 * Types for the ambulance entity tracked by the Ambulance Tracking &
 * Smart Traffic Priority dashboard.
 */

import type { JourneyDirection } from "./traffic";

export type AmbulanceStatus =
  | "DISPATCHED"
  | "EN_ROUTE"
  | "APPROACHING_SIGNAL"
  | "SIGNAL_PRIORITY"
  | "CROSSING_JUNCTION"
  | "NEAR_ACCIDENT"
  | "ARRIVED_INCIDENT"
  | "VICTIM_PICKUP"
  | "VICTIM_PICKED_UP"
  | "RETURNING"
  | "ARRIVED_HOSPITAL"
  | "PATIENT_DELIVERED"
  | "GPS_SIGNAL_LOST"
  | "IDLE";

export interface Ambulance {
  id: string;
  latitude: number;
  longitude: number;
  /** km/h */
  speed: number;
  status: AmbulanceStatus;
  etaSeconds: number;
  routeId: string;
  /** Compass heading (0 = North, 90 = East, ...) used to orient the map icon. */
  headingDegrees: number;
  distanceRemainingMeters: number;
  distanceCoveredMeters: number;
  /** Which of the two legs the ambulance is currently running. */
  journeyDirection: JourneyDirection;
  /** True once the victim has been picked up at the incident (return leg). */
  patientOnBoard: boolean;
}

export const AMBULANCE_STATUS_LABELS: Record<AmbulanceStatus, string> = {
  DISPATCHED: "Dispatched",
  EN_ROUTE: "En Route",
  APPROACHING_SIGNAL: "Approaching Signal",
  SIGNAL_PRIORITY: "Signal Priority",
  CROSSING_JUNCTION: "Crossing Junction",
  NEAR_ACCIDENT: "Near Accident",
  ARRIVED_INCIDENT: "Arrived at Incident",
  VICTIM_PICKUP: "Victim Pickup",
  VICTIM_PICKED_UP: "Patient on Board",
  RETURNING: "Returning",
  ARRIVED_HOSPITAL: "Arrived Hospital",
  PATIENT_DELIVERED: "Patient Delivered",
  GPS_SIGNAL_LOST: "GPS Signal Lost",
  IDLE: "Idle",
};
