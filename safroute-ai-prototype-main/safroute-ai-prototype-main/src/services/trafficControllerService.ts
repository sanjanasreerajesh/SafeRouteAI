/**
 * trafficControllerService.ts (Ambulance Tracking dashboard)
 *
 * Talks to the ESP32-based smart intersection controller. Isolated from —
 * and unrelated to — the existing `src/lib/trafficControllerService.ts`
 * used elsewhere in the app; this one belongs only to the
 * `/ambulance-tracking` feature.
 *
 * Represents ONE physical prototype with 12 LEDs — 4 approaches
 * (NORTH/SOUTH/EAST/WEST) x 3 colors (RED/YELLOW/GREEN) — driven by simple
 * `{DIRECTION}_{STATE}` commands, plus a `RESUME_NORMAL_CYCLE` command sent
 * once emergency priority ends.
 *
 * MOCK_HARDWARE=true: every call simulates a realistic ESP32 response
 * without needing real hardware or a backend. Flip MOCK_HARDWARE to false
 * and forward these calls to FastAPI once the endpoints below exist —
 * dashboard code never has to change, only these function bodies:
 *
 *   POST /api/traffic/signals/{signal_id}/command   (sendDirectionCommand, sendResumeNormalCycle)
 *   GET  /api/traffic/controllers/{controller_id}/status  (getControllerStatus)
 */

import type { ApproachDirection, CommandResult, DirectionSignalState, ESP32ControllerStatus } from "@/types/traffic";

export const MOCK_HARDWARE = true;

const CONTROLLER_ID = "ESP32-INTERSECTION-01";
const CONTROLLER_IP = "192.168.1.50";

let _online = false;
let _lastCommand = "SYSTEM_IDLE";
let _lastResponseMs = 0;
let _lastUpdatedIso = new Date().toISOString();

function _randomMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _touch(command: string, responseMs: number) {
  _lastCommand = command;
  _lastResponseMs = responseMs;
  _lastUpdatedIso = new Date().toISOString();
}

function _buildStatus(): ESP32ControllerStatus {
  return {
    controllerId: CONTROLLER_ID,
    online: _online,
    wifiStatus: _online ? "CONNECTED" : "DISCONNECTED",
    ip: CONTROLLER_IP,
    lastCommand: _lastCommand,
    responseTimeMs: _lastResponseMs,
    lastUpdatedIso: _lastUpdatedIso,
  };
}

export async function connectESP32(): Promise<ESP32ControllerStatus> {
  _online = true;
  _touch("SYSTEM_ONLINE", _randomMs(30, 60));
  return _buildStatus();
}

export async function disconnectESP32(): Promise<{ success: boolean }> {
  _online = false;
  _touch("SYSTEM_OFFLINE", 0);
  return { success: true };
}

export async function getControllerStatus(): Promise<ESP32ControllerStatus> {
  return _buildStatus();
}

async function _sendCommand(command: string): Promise<CommandResult> {
  const online = _online;
  const responseMs = online ? _randomMs(28, 65) : 0;

  if (online) {
    _touch(command, responseMs);
  }

  return {
    success: MOCK_HARDWARE && online,
    command,
    controllerId: CONTROLLER_ID,
    responseTimeMs: responseMs,
  };
}

/** One approach's LED command, e.g. sendDirectionCommand("SOUTH", "GREEN") -> "SOUTH_GREEN". */
export async function sendDirectionCommand(
  direction: ApproachDirection,
  state: DirectionSignalState
): Promise<CommandResult> {
  return _sendCommand(`${direction}_${state}`);
}

/** Sent once the ambulance has crossed and emergency priority ends. */
export async function sendResumeNormalCycle(): Promise<CommandResult> {
  return _sendCommand("RESUME_NORMAL_CYCLE");
}
