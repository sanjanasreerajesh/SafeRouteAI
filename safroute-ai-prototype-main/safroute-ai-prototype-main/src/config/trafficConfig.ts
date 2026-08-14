/**
 * trafficConfig.ts
 *
 * Central configuration for the Ambulance Tracking & Smart Traffic Priority
 * dashboard's ONE four-way intersection controller. Every distance
 * threshold used by the simulation lives here — nowhere else — so the demo
 * can be re-tuned without hunting through component code.
 *
 * All distances are along-route (meters travelled by the ambulance), not
 * straight-line "as the crow flies" distance.
 */

export const TRAFFIC_CONFIG = {
  /** Ambulance approach flips RED -> YELLOW once the ambulance is within this distance (~halfway). */
  preparationDistanceMeters: 300,

  /** Ambulance approach flips YELLOW -> GREEN once the ambulance is within this distance (~100-150m). */
  priorityDistanceMeters: 130,

  /**
   * Ambulance approach flips GREEN -> RED once the ambulance is this far
   * *past* the intersection (i.e. distanceMeters <= -crossingDistanceMeters).
   */
  crossingDistanceMeters: 30,

  /** Simulation tick interval, in ms, at 1x speed. */
  simulationTickMs: 200,

  /** Ambulance cruising speed at 1x simulation speed. */
  baseSpeedKmh: 46,

  /** Where along the canonical incident<->hospital route the single intersection sits (0 = incident, 1 = hospital). */
  intersectionPositionFraction: 0.55,

  /** Available simulation playback speed multipliers. */
  speedMultipliers: [1, 2, 5, 10] as const,

  /** How long the "EMERGENCY PRIORITY CLEARED / RETURNING TO NORMAL" state is shown before the normal cycle resumes. */
  priorityClearingHoldMs: 1500,

  /** How long the ambulance stays stopped at the incident for victim pickup. */
  victimPickupDurationMs: 2500,
} as const;

export type TrafficConfig = typeof TRAFFIC_CONFIG;
