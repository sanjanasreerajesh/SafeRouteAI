/**
 * useAmbulanceSimulation.ts
 *
 * The state machine at the heart of the Ambulance Tracking & Smart Traffic
 * Priority dashboard. Owns:
 *   - the two-leg journey (HOSPITAL_TO_INCIDENT, then INCIDENT_TO_HOSPITAL
 *     after victim pickup) along ONE canonical incident<->hospital route
 *   - the ambulance's position along the route (interpolated, not random)
 *   - ONE four-way intersection controller — NORTH/SOUTH/EAST/WEST, each
 *     with its own independent RED/YELLOW/GREEN light (not a chain of
 *     separate signals). Distance-driven (trafficConfig.ts); the only
 *     wall-clock timer is the brief "returning to normal" hold after the
 *     ambulance crosses.
 *   - the ESP32 command log and controller status
 *   - the emergency timeline
 *
 * Safety invariants enforced here (see assertInvariants):
 *   - at most one approach is ever GREEN at a time
 *   - during emergency priority, only the ambulance's own approach may be GREEN
 *   - the ambulance approach only ever advances RED -> YELLOW -> GREEN -> RED
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { TRAFFIC_CONFIG } from "@/config/trafficConfig";
import { getAmbulanceRoute } from "@/services/ambulanceService";
import {
  connectESP32,
  disconnectESP32,
  sendDirectionCommand,
  sendResumeNormalCycle,
} from "@/services/trafficControllerService";
import { bucketCompass, computeCumulativeDistances, pointAtDistance } from "@/services/simulationService";
import type { Ambulance, AmbulanceStatus } from "@/types/ambulance";
import type { AmbulanceRoute, TimelineStep } from "@/types/route";
import type {
  ApproachDirection,
  CommandLogEntry,
  DirectionSignalState,
  ESP32ControllerStatus,
  IntersectionState,
  JourneyDirection,
} from "@/types/traffic";
import { ALL_DIRECTIONS } from "@/types/traffic";

const {
  preparationDistanceMeters,
  priorityDistanceMeters,
  crossingDistanceMeters,
  simulationTickMs,
  baseSpeedKmh,
  victimPickupDurationMs,
  priorityClearingHoldMs,
} = TRAFFIC_CONFIG;

const MAX_LOG_ENTRIES = 60;
const AMBULANCE_ID = "AMB-01";

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function initialTimeline(): TimelineStep[] {
  return [
    { id: "ACCIDENT_DETECTED", label: "Accident Detected", status: "COMPLETED", timestampIso: nowIso() },
    { id: "HOSPITAL_SELECTED", label: "Hospital Selected", status: "COMPLETED", timestampIso: nowIso() },
    { id: "HOSPITAL_ALERTED", label: "Hospital Alerted", status: "COMPLETED", timestampIso: nowIso() },
    { id: "AMBULANCE_DISPATCHED", label: "Ambulance Dispatched", status: "PENDING" },
    { id: "GPS_TRACKING_STARTED", label: "GPS Tracking Started", status: "PENDING" },
    { id: "ROUTE_GENERATED", label: "Route Generated", status: "PENDING" },
    { id: "SIGNAL_PRIORITY_OUTBOUND", label: "Signal Priority Active (Outbound)", status: "PENDING" },
    { id: "INCIDENT_REACHED", label: "Incident Reached", status: "PENDING" },
    { id: "VICTIM_PICKED_UP", label: "Victim Picked Up", status: "PENDING" },
    { id: "JOURNEY_REVERSED", label: "Journey Reversed", status: "PENDING" },
    { id: "SIGNAL_PRIORITY_RETURN", label: "Signal Priority Active (Return)", status: "PENDING" },
    { id: "AMBULANCE_ARRIVED", label: "Ambulance Arrived", status: "PENDING" },
  ];
}

/** +1 when moving toward the hospital (increasing canonical distance), -1 toward the incident. */
function directionMultiplier(journeyDirection: JourneyDirection): 1 | -1 {
  return journeyDirection === "INCIDENT_TO_HOSPITAL" ? 1 : -1;
}

/**
 * The intersection's default "favored" approach when no emergency priority
 * is active — deliberately never the ambulance's own approach, so the
 * ambulance's direction always starts RED and has to earn its GREEN.
 */
function normalGreenFor(ambulanceApproach: ApproachDirection): ApproachDirection {
  return ambulanceApproach === "NORTH" || ambulanceApproach === "SOUTH" ? "EAST" : "NORTH";
}

function buildDirections(greenDirection: ApproachDirection): Record<ApproachDirection, DirectionSignalState> {
  const directions = {} as Record<ApproachDirection, DirectionSignalState>;
  for (const d of ALL_DIRECTIONS) directions[d] = d === greenDirection ? "GREEN" : "RED";
  return directions;
}

/** Recompute the intersection's dynamic, journey-dependent fields for the start of a new leg. */
function resetIntersectionForLeg(
  route: AmbulanceRoute,
  journeyDirection: JourneyDirection,
  cum: number[],
  canonicalPosition: number
): IntersectionState {
  const dirMul = directionMultiplier(journeyDirection);
  const base = route.intersection;
  const { headingDegrees } = pointAtDistance(route.coordinates, cum, base.canonicalDistanceMeters);
  const travelBearing = dirMul === 1 ? headingDegrees : (headingDegrees + 180) % 360;
  const ambulanceApproach = bucketCompass(travelBearing);
  const distanceMeters = dirMul * (base.canonicalDistanceMeters - canonicalPosition);

  return {
    ...base,
    ambulanceApproach,
    mode: "NORMAL",
    directions: buildDirections(normalGreenFor(ambulanceApproach)),
    distanceMeters,
    etaSeconds: 0,
  };
}

/** Dev-time safety checks for the invariants this controller must never violate. */
function assertInvariants(intersection: IntersectionState) {
  const greens = ALL_DIRECTIONS.filter((d) => intersection.directions[d] === "GREEN");
  if (greens.length > 1) {
    console.error("[useAmbulanceSimulation] Invariant violated: more than one approach is GREEN", greens);
  }
  if (
    (intersection.mode === "PRIORITY_ACTIVE" || intersection.mode === "PRIORITY_PREPARING") &&
    greens.length === 1 &&
    greens[0] !== intersection.ambulanceApproach
  ) {
    console.error(
      "[useAmbulanceSimulation] Invariant violated: a non-ambulance approach is GREEN during emergency priority",
      greens[0]
    );
  }
}

interface DirectionTransition {
  direction: ApproachDirection;
  state: DirectionSignalState;
}

/**
 * Advances the ONE intersection by one tick, given the ambulance's current
 * signed distance to it. Returns the updated intersection plus the list of
 * per-direction state changes (for ESP32 command dispatch + the log) —
 * only actual changes are reported, nothing re-sent every tick.
 */
function advanceIntersection(
  intersection: IntersectionState,
  distanceMeters: number
): { intersection: IntersectionState; transitions: DirectionTransition[]; justCleared: boolean } {
  const approach = intersection.ambulanceApproach;
  const others = ALL_DIRECTIONS.filter((d) => d !== approach);
  const directions = { ...intersection.directions };
  const transitions: DirectionTransition[] = [];
  let mode = intersection.mode;
  let justCleared = false;

  const setDir = (dir: ApproachDirection, state: DirectionSignalState) => {
    if (directions[dir] !== state) {
      directions[dir] = state;
      transitions.push({ direction: dir, state });
    }
  };

  if (distanceMeters <= -crossingDistanceMeters) {
    // Past the intersection.
    if (mode === "PRIORITY_ACTIVE" || mode === "PRIORITY_PREPARING") {
      setDir(approach, "RED");
      mode = "PRIORITY_CLEARING";
      justCleared = true;
    }
  } else if (distanceMeters > preparationDistanceMeters) {
    // Still far away — normal operation, nothing to do.
    mode = "NORMAL";
  } else {
    // Engagement zone: -crossing < distance <= preparation.
    if (mode === "NORMAL") mode = "PRIORITY_PREPARING";

    if (mode === "PRIORITY_PREPARING") {
      for (const d of others) setDir(d, "RED");
      if (directions[approach] === "RED") setDir(approach, "YELLOW");
      if (distanceMeters <= priorityDistanceMeters) mode = "PRIORITY_ACTIVE";
    }

    if (mode === "PRIORITY_ACTIVE") {
      for (const d of others) setDir(d, "RED");
      setDir(approach, "GREEN");
    }
  }

  return { intersection: { ...intersection, directions, mode, distanceMeters }, transitions, justCleared };
}

export interface SimulationState {
  loading: boolean;
  error: string | null;
  route: AmbulanceRoute | null;
  intersection: IntersectionState | null;
  ambulance: Ambulance | null;
  esp32: ESP32ControllerStatus;
  commandLog: CommandLogEntry[];
  timeline: TimelineStep[];
  journeyDirection: JourneyDirection;
  running: boolean;
  paused: boolean;
  completed: boolean;
  gpsLost: boolean;
  speedMultiplier: number;
  /** Set while the ambulance is stopped at the incident for victim pickup; null otherwise. */
  atIncidentUntilMs: number | null;
  /** Set while the intersection is showing "returning to normal" after a crossing; null otherwise. */
  intersectionClearingUntilMs: number | null;
}

function emptyEsp32(): ESP32ControllerStatus {
  return {
    controllerId: "ESP32-INTERSECTION-01",
    online: false,
    wifiStatus: "DISCONNECTED",
    ip: "192.168.1.50",
    lastCommand: "SYSTEM_IDLE",
    responseTimeMs: 0,
    lastUpdatedIso: nowIso(),
  };
}

export function useAmbulanceSimulation() {
  const [state, setState] = useState<SimulationState>({
    loading: true,
    error: null,
    route: null,
    intersection: null,
    ambulance: null,
    esp32: emptyEsp32(),
    commandLog: [],
    timeline: initialTimeline(),
    journeyDirection: "HOSPITAL_TO_INCIDENT",
    running: false,
    paused: false,
    completed: false,
    gpsLost: false,
    speedMultiplier: 1,
    atIncidentUntilMs: null,
    intersectionClearingUntilMs: null,
  });

  // Mutable mirrors so the tick loop always reads fresh values without
  // re-subscribing the interval on every state change.
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Position along the CANONICAL route: 0 = incident, total = hospital. */
  const positionRef = useRef(0);
  const geometryRef = useRef<{ cum: number[] } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickingRef = useRef(false);

  const pushLog = useCallback((event: string, detail: string, status: CommandLogEntry["status"]) => {
    setState((prev) => ({
      ...prev,
      commandLog: [{ id: uid(), timestampIso: nowIso(), event, detail, status }, ...prev.commandLog].slice(
        0,
        MAX_LOG_ENTRIES
      ),
    }));
  }, []);

  const updateTimeline = useCallback((id: TimelineStep["id"], status: TimelineStep["status"]) => {
    setState((prev) => ({
      ...prev,
      timeline: prev.timeline.map((t) => (t.id === id ? { ...t, status, timestampIso: nowIso() } : t)),
    }));
  }, []);

  // --- Load the canonical route once on mount ------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const route = await getAmbulanceRoute();
        if (cancelled) return;
        geometryRef.current = computeCumulativeDistances(route.coordinates);
        positionRef.current = route.totalDistanceMeters; // start at the hospital

        const intersection = resetIntersectionForLeg(
          route,
          "HOSPITAL_TO_INCIDENT",
          geometryRef.current.cum,
          route.totalDistanceMeters
        );
        const start = pointAtDistance(route.coordinates, geometryRef.current.cum, route.totalDistanceMeters);

        setState((prev) => ({
          ...prev,
          loading: false,
          route,
          intersection,
          ambulance: {
            id: AMBULANCE_ID,
            latitude: start.lat,
            longitude: start.lng,
            speed: 0,
            status: "IDLE",
            etaSeconds: route.estimatedTimeSeconds,
            routeId: route.id,
            headingDegrees: (start.headingDegrees + 180) % 360,
            distanceRemainingMeters: route.totalDistanceMeters,
            distanceCoveredMeters: 0,
            journeyDirection: "HOSPITAL_TO_INCIDENT",
            patientOnBoard: false,
          },
        }));
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load ambulance route.",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- ESP32 command dispatch (fires the mock + logs it) -------------------
  const dispatchDirectionTransition = useCallback(
    async (t: DirectionTransition) => {
      const result = await sendDirectionCommand(t.direction, t.state);

      setState((prev) => ({
        ...prev,
        esp32: {
          ...prev.esp32,
          online: result.success,
          wifiStatus: result.success ? "CONNECTED" : "DISCONNECTED",
          lastCommand: result.command,
          responseTimeMs: result.responseTimeMs,
          lastUpdatedIso: nowIso(),
        },
      }));

      pushLog(
        result.command,
        result.success ? `ESP32 command sent (${result.responseTimeMs}ms)` : "ESP32 offline — command not delivered",
        result.success ? "SUCCESS" : "FAILED"
      );
    },
    [pushLog]
  );

  const dispatchResumeNormal = useCallback(async () => {
    const result = await sendResumeNormalCycle();
    setState((prev) => ({
      ...prev,
      esp32: {
        ...prev.esp32,
        online: result.success,
        wifiStatus: result.success ? "CONNECTED" : "DISCONNECTED",
        lastCommand: result.command,
        responseTimeMs: result.responseTimeMs,
        lastUpdatedIso: nowIso(),
      },
    }));
    pushLog(
      result.command,
      result.success ? `ESP32 command sent (${result.responseTimeMs}ms)` : "ESP32 offline — command not delivered",
      result.success ? "SUCCESS" : "FAILED"
    );
  }, [pushLog]);

  /** Runs once the victim-pickup dwell has elapsed: reverses the journey in place. */
  const completeVictimPickupAndReverse = useCallback(async () => {
    const route = stateRef.current.route;
    if (!route || !geometryRef.current) return;

    pushLog("PATIENT ON BOARD", "Victim secured — returning to hospital", "SUCCESS");
    updateTimeline("VICTIM_PICKED_UP", "COMPLETED");
    updateTimeline("JOURNEY_REVERSED", "COMPLETED");

    const newDirection: JourneyDirection = "INCIDENT_TO_HOSPITAL";
    positionRef.current = 0;
    const intersection = resetIntersectionForLeg(route, newDirection, geometryRef.current.cum, 0);

    setState((prev) => ({
      ...prev,
      journeyDirection: newDirection,
      atIncidentUntilMs: null,
      intersectionClearingUntilMs: null,
      intersection,
      ambulance: prev.ambulance
        ? {
            ...prev.ambulance,
            status: "RETURNING",
            journeyDirection: newDirection,
            patientOnBoard: true,
            distanceCoveredMeters: 0,
            distanceRemainingMeters: route.totalDistanceMeters,
          }
        : prev.ambulance,
    }));
  }, [pushLog, updateTimeline]);

  // --- The tick loop ---------------------------------------------------------
  const tick = useCallback(async () => {
    if (tickingRef.current) return;
    const s = stateRef.current;
    if (!s.route || !s.intersection || !geometryRef.current || s.gpsLost || s.paused || !s.running || s.completed) return;

    tickingRef.current = true;
    try {
      // Waiting out the victim-pickup dwell at the incident — no movement,
      // no intersection progression, until the timer elapses.
      if (s.atIncidentUntilMs != null) {
        if (Date.now() < s.atIncidentUntilMs) return;
        await completeVictimPickupAndReverse();
        return;
      }

      // Movement always proceeds — GPS/position must never freeze. Only the
      // intersection's own state machine pauses during the brief
      // "returning to normal" hold after a crossing.
      const speedKmh = baseSpeedKmh * s.speedMultiplier;
      const speedMps = (speedKmh * 1000) / 3600;
      const deltaMeters = speedMps * (simulationTickMs / 1000);
      const total = s.route.totalDistanceMeters;
      const dirMul = directionMultiplier(s.journeyDirection);

      const nextPosition = Math.min(Math.max(positionRef.current + dirMul * deltaMeters, 0), total);
      positionRef.current = nextPosition;

      const { cum } = geometryRef.current;
      const { lat, lng, headingDegrees: forwardHeading } = pointAtDistance(s.route.coordinates, cum, nextPosition);
      const headingDegrees = dirMul === 1 ? forwardHeading : (forwardHeading + 180) % 360;

      const distanceMeters = dirMul * (s.intersection.canonicalDistanceMeters - nextPosition);
      const etaToIntersection = Math.max(0, distanceMeters / Math.max(speedMps, 0.1));

      let updatedIntersection = s.intersection;
      let transitions: DirectionTransition[] = [];
      let justCleared = false;
      let clearingHoldElapsed = false;

      if (s.intersectionClearingUntilMs != null) {
        // Holding the "cleared / returning to normal" display — the
        // intersection state machine doesn't re-run until the hold elapses.
        if (Date.now() >= s.intersectionClearingUntilMs) {
          clearingHoldElapsed = true;
          updatedIntersection = {
            ...s.intersection,
            mode: "NORMAL",
            directions: buildDirections(normalGreenFor(s.intersection.ambulanceApproach)),
            distanceMeters,
          };
        } else {
          updatedIntersection = { ...s.intersection, distanceMeters };
        }
      } else {
        const advanced = advanceIntersection(s.intersection, distanceMeters);
        updatedIntersection = advanced.intersection;
        transitions = advanced.transitions;
        justCleared = advanced.justCleared;
      }

      assertInvariants(updatedIntersection);

      const reachedIncidentEnd = s.journeyDirection === "HOSPITAL_TO_INCIDENT" && nextPosition <= 0;
      const reachedHospitalEnd = s.journeyDirection === "INCIDENT_TO_HOSPITAL" && nextPosition >= total;
      const distanceRemainingMeters =
        s.journeyDirection === "INCIDENT_TO_HOSPITAL" ? Math.max(0, total - nextPosition) : Math.max(0, nextPosition);

      let status: AmbulanceStatus = s.ambulance?.status ?? "EN_ROUTE";
      if (reachedIncidentEnd) status = "ARRIVED_INCIDENT";
      else if (reachedHospitalEnd) status = "ARRIVED_HOSPITAL";
      else if (updatedIntersection.mode === "PRIORITY_ACTIVE") status = "SIGNAL_PRIORITY";
      else if (updatedIntersection.mode === "PRIORITY_PREPARING") status = "APPROACHING_SIGNAL";
      else status = s.journeyDirection === "INCIDENT_TO_HOSPITAL" ? "RETURNING" : "EN_ROUTE";

      const nextClearingUntilMs = clearingHoldElapsed
        ? null
        : justCleared
          ? Date.now() + priorityClearingHoldMs
          : s.intersectionClearingUntilMs;

      setState((prev) => ({
        ...prev,
        intersection: { ...updatedIntersection, etaSeconds: etaToIntersection },
        intersectionClearingUntilMs: nextClearingUntilMs,
        ambulance: prev.ambulance
          ? {
              ...prev.ambulance,
              latitude: lat,
              longitude: lng,
              headingDegrees,
              speed: reachedIncidentEnd || reachedHospitalEnd ? 0 : speedKmh,
              status,
              distanceRemainingMeters,
              distanceCoveredMeters: total - distanceRemainingMeters,
              etaSeconds: distanceRemainingMeters / Math.max(speedMps, 0.1),
            }
          : prev.ambulance,
      }));

      for (const t of transitions) {
        await dispatchDirectionTransition(t);
      }

      if (justCleared) {
        pushLog("EMERGENCY PRIORITY CLEARED", "Intersection returning to normal", "SUCCESS");
      }

      if (clearingHoldElapsed) {
        await dispatchResumeNormal();
      }

      if (reachedIncidentEnd) {
        pushLog("ARRIVED AT INCIDENT", "Ambulance stopped — beginning victim pickup", "SUCCESS");
        pushLog("VICTIM PICKUP", `Loading patient (${victimPickupDurationMs / 1000}s)`, "PENDING");
        updateTimeline("INCIDENT_REACHED", "COMPLETED");
        setState((prev) => ({
          ...prev,
          atIncidentUntilMs: Date.now() + victimPickupDurationMs,
          ambulance: prev.ambulance ? { ...prev.ambulance, status: "ARRIVED_INCIDENT", speed: 0 } : prev.ambulance,
        }));
      } else if (reachedHospitalEnd) {
        pushLog("AMBULANCE ARRIVED", "Reached hospital — intersection returned to normal", "SUCCESS");
        updateTimeline("AMBULANCE_ARRIVED", "COMPLETED");
        updateTimeline("SIGNAL_PRIORITY_RETURN", "COMPLETED");
        setState((prev) => ({
          ...prev,
          running: false,
          completed: true,
          intersectionClearingUntilMs: null,
          intersection: prev.intersection
            ? {
                ...prev.intersection,
                mode: "NORMAL",
                directions: buildDirections(normalGreenFor(prev.intersection.ambulanceApproach)),
              }
            : prev.intersection,
        }));
        setTimeout(() => {
          pushLog("PATIENT DELIVERED", "Handover complete at hospital", "SUCCESS");
          setState((prev) => ({
            ...prev,
            ambulance: prev.ambulance ? { ...prev.ambulance, status: "PATIENT_DELIVERED" } : prev.ambulance,
          }));
        }, 400);
      } else if (
        (updatedIntersection.mode === "PRIORITY_PREPARING" || updatedIntersection.mode === "PRIORITY_ACTIVE") &&
        s.timeline.find(
          (t) => t.id === (s.journeyDirection === "HOSPITAL_TO_INCIDENT" ? "SIGNAL_PRIORITY_OUTBOUND" : "SIGNAL_PRIORITY_RETURN")
        )?.status === "PENDING"
      ) {
        updateTimeline(
          s.journeyDirection === "HOSPITAL_TO_INCIDENT" ? "SIGNAL_PRIORITY_OUTBOUND" : "SIGNAL_PRIORITY_RETURN",
          "ACTIVE"
        );
      }
    } finally {
      tickingRef.current = false;
    }
  }, [completeVictimPickupAndReverse, dispatchDirectionTransition, dispatchResumeNormal, pushLog, updateTimeline]);

  useEffect(() => {
    if (state.running && !state.paused && !state.gpsLost && !state.completed) {
      intervalRef.current = setInterval(tick, simulationTickMs);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    return undefined;
  }, [state.running, state.paused, state.gpsLost, state.completed, tick]);

  // --- Controls ---------------------------------------------------------------
  const start = useCallback(async () => {
    const s = stateRef.current;
    if (!s.route || !geometryRef.current) return;

    if (s.completed) {
      // Implicit full reset before restarting a finished run.
      positionRef.current = s.route.totalDistanceMeters;
      const freshIntersection = resetIntersectionForLeg(
        s.route,
        "HOSPITAL_TO_INCIDENT",
        geometryRef.current.cum,
        s.route.totalDistanceMeters
      );
      setState((prev) => ({
        ...prev,
        journeyDirection: "HOSPITAL_TO_INCIDENT",
        intersection: freshIntersection,
        completed: false,
        atIncidentUntilMs: null,
        intersectionClearingUntilMs: null,
        commandLog: [],
        timeline: initialTimeline(),
        ambulance: prev.ambulance ? { ...prev.ambulance, patientOnBoard: false, status: "IDLE" } : prev.ambulance,
      }));
    }

    await connectESP32();
    pushLog("AMBULANCE DISPATCHED", `${AMBULANCE_ID} dispatched from hospital toward incident`, "SUCCESS");
    updateTimeline("AMBULANCE_DISPATCHED", "COMPLETED");
    pushLog("GPS TRACKING STARTED", "Live location updates enabled", "SUCCESS");
    updateTimeline("GPS_TRACKING_STARTED", "COMPLETED");
    pushLog("ROUTE GENERATED", `Intersection identified along route: ${s.route.intersection.name}`, "SUCCESS");
    updateTimeline("ROUTE_GENERATED", "COMPLETED");

    setState((prev) => ({
      ...prev,
      running: true,
      paused: false,
      gpsLost: false,
      ambulance: prev.ambulance ? { ...prev.ambulance, status: "DISPATCHED" } : prev.ambulance,
    }));
  }, [pushLog, updateTimeline]);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, paused: true }));
    pushLog("SIMULATION PAUSED", "Ambulance movement and signal progression paused", "SUCCESS");
  }, [pushLog]);

  const resume = useCallback(() => {
    setState((prev) => ({ ...prev, paused: false }));
    pushLog("SIMULATION RESUMED", "Ambulance movement resumed", "SUCCESS");
  }, [pushLog]);

  const reset = useCallback(() => {
    const route = stateRef.current.route;
    if (!route || !geometryRef.current) return;

    positionRef.current = route.totalDistanceMeters;
    const freshIntersection = resetIntersectionForLeg(
      route,
      "HOSPITAL_TO_INCIDENT",
      geometryRef.current.cum,
      route.totalDistanceMeters
    );
    const start = pointAtDistance(route.coordinates, geometryRef.current.cum, route.totalDistanceMeters);

    setState((prev) => ({
      ...prev,
      running: false,
      paused: false,
      completed: false,
      gpsLost: false,
      atIncidentUntilMs: null,
      intersectionClearingUntilMs: null,
      journeyDirection: "HOSPITAL_TO_INCIDENT",
      intersection: freshIntersection,
      commandLog: [],
      timeline: initialTimeline(),
      ambulance: prev.ambulance
        ? {
            ...prev.ambulance,
            status: "IDLE",
            speed: 0,
            journeyDirection: "HOSPITAL_TO_INCIDENT",
            patientOnBoard: false,
            distanceCoveredMeters: 0,
            distanceRemainingMeters: route.totalDistanceMeters,
            etaSeconds: route.estimatedTimeSeconds,
            latitude: start.lat,
            longitude: start.lng,
            headingDegrees: (start.headingDegrees + 180) % 360,
          }
        : prev.ambulance,
    }));
  }, []);

  const setSpeedMultiplier = useCallback((multiplier: number) => {
    setState((prev) => ({ ...prev, speedMultiplier: multiplier }));
  }, []);

  const toggleGpsLoss = useCallback(() => {
    setState((prev) => {
      const gpsLost = !prev.gpsLost;
      return {
        ...prev,
        gpsLost,
        ambulance: prev.ambulance
          ? { ...prev.ambulance, status: gpsLost ? "GPS_SIGNAL_LOST" : "EN_ROUTE" }
          : prev.ambulance,
      };
    });
    const newGpsLost = !stateRef.current.gpsLost;
    pushLog(
      newGpsLost ? "GPS SIGNAL LOST" : "GPS SIGNAL RESTORED",
      newGpsLost ? "Automatic signal progression paused until GPS is restored" : "Location updates resumed",
      newGpsLost ? "FAILED" : "SUCCESS"
    );
  }, [pushLog]);

  const toggleEsp32Connection = useCallback(async () => {
    if (stateRef.current.esp32.online) {
      await disconnectESP32();
      setState((prev) => ({
        ...prev,
        esp32: { ...prev.esp32, online: false, wifiStatus: "DISCONNECTED", lastCommand: "SYSTEM_OFFLINE" },
      }));
      pushLog("ESP32 DISCONNECTED", "Controller manually taken offline", "FAILED");
    } else {
      const status = await connectESP32();
      setState((prev) => ({ ...prev, esp32: status }));
      pushLog("ESP32 CONNECTED", "Controller back online", "SUCCESS");
    }
  }, [pushLog]);

  /** Testing shortcut: instantly jump to the incident (only valid on the outbound leg). */
  const skipToIncident = useCallback(() => {
    const s = stateRef.current;
    if (!s.route || !geometryRef.current || s.journeyDirection !== "HOSPITAL_TO_INCIDENT" || s.completed) return;

    positionRef.current = 0;
    const { lat, lng } = pointAtDistance(s.route.coordinates, geometryRef.current.cum, 0);

    setState((prev) => ({
      ...prev,
      running: true,
      paused: false,
      intersectionClearingUntilMs: null,
      intersection: prev.intersection
        ? {
            ...prev.intersection,
            mode: "NORMAL",
            directions: buildDirections(normalGreenFor(prev.intersection.ambulanceApproach)),
            distanceMeters: 0,
          }
        : prev.intersection,
      ambulance: prev.ambulance
        ? {
            ...prev.ambulance,
            latitude: lat,
            longitude: lng,
            distanceCoveredMeters: prev.route?.totalDistanceMeters ?? 0,
            distanceRemainingMeters: 0,
          }
        : prev.ambulance,
    }));

    pushLog("SKIP TO INCIDENT", "Testing shortcut — ambulance jumped to incident location", "SUCCESS");
    updateTimeline("INCIDENT_REACHED", "COMPLETED");
  }, [pushLog, updateTimeline]);

  return {
    ...state,
    controls: { start, pause, resume, reset, setSpeedMultiplier, toggleGpsLoss, toggleEsp32Connection, skipToIncident },
  };
}

export type UseAmbulanceSimulationResult = ReturnType<typeof useAmbulanceSimulation>;
