/**
 * trafficControllerService.ts
 *
 * ESP32-based Smart Traffic Controller Service
 *
 * Currently returns MOCKED data for prototype/demonstration purposes.
 * Replace the internals with real FastAPI endpoint calls when hardware is ready.
 *
 * Future API placeholders:
 *   GET  /traffic/signals
 *   POST /traffic/send-command
 *   GET  /traffic/controller-status
 */

export interface ESP32Status {
  connected: boolean;
  wifiStatus: "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
  ip: string;
  lastCommand: string;
  responseTimeMs: number;
  signalControlled: string;
  firmware: string;
}

export interface TrafficSignalState {
  id: string;
  color: "RED" | "YELLOW" | "GREEN";
  mode: "AUTO" | "PRIORITY" | "CLEARED";
  countdown: number; // seconds remaining
  distanceMeters: number;
  etaSeconds: number;
}

export interface CommandResult {
  success: boolean;
  message: string;
  responseTimeMs: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Simulated ESP32 connection state (in-memory for prototype)
// ---------------------------------------------------------------------------

let _connected = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect to the ESP32 hardware controller.
 * TODO: Replace with: POST /traffic/controller-status { action: "connect" }
 */
export async function connectESP32(): Promise<ESP32Status> {
  await _delay(400);
  _connected = true;
  return _buildStatus("SYSTEM_ONLINE", 38);
}

/**
 * Disconnect from the ESP32 hardware controller.
 * TODO: Replace with: POST /traffic/controller-status { action: "disconnect" }
 */
export async function disconnectESP32(): Promise<{ success: boolean }> {
  await _delay(200);
  _connected = false;
  return { success: true };
}

/**
 * Send a GREEN signal command to the specified traffic signal.
 * TODO: Replace with: POST /traffic/send-command { signalId, color: "GREEN" }
 */
export async function sendGreenSignal(signalId: string): Promise<CommandResult> {
  await _delay(350);
  return {
    success: true,
    message: `SIGNAL_${signalId}_GREEN`,
    responseTimeMs: _randomMs(30, 55),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send a RED signal command to the specified traffic signal.
 * TODO: Replace with: POST /traffic/send-command { signalId, color: "RED" }
 */
export async function sendRedSignal(signalId: string): Promise<CommandResult> {
  await _delay(350);
  return {
    success: true,
    message: `SIGNAL_${signalId}_RED`,
    responseTimeMs: _randomMs(30, 55),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get the current status of the ESP32 controller.
 * TODO: Replace with: GET /traffic/controller-status
 */
export async function getControllerStatus(): Promise<ESP32Status> {
  await _delay(200);
  return _buildStatus("STATUS_OK", _randomMs(25, 60));
}

/**
 * Get the current state of all traffic signals on the ambulance route.
 * TODO: Replace with: GET /traffic/signals
 */
export async function getTrafficSignals(): Promise<TrafficSignalState[]> {
  await _delay(150);
  return [
    { id: "12", color: "RED",   mode: "AUTO",     countdown: 45, distanceMeters: 250,  etaSeconds: 18  },
    { id: "13", color: "RED",   mode: "AUTO",     countdown: 60, distanceMeters: 900,  etaSeconds: 65  },
    { id: "14", color: "RED",   mode: "AUTO",     countdown: 60, distanceMeters: 1800, etaSeconds: 130 },
    { id: "15", color: "RED",   mode: "AUTO",     countdown: 60, distanceMeters: 2600, etaSeconds: 188 },
  ];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _randomMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _buildStatus(lastCommand: string, responseTimeMs: number): ESP32Status {
  return {
    connected: _connected,
    wifiStatus: _connected ? "CONNECTED" : "DISCONNECTED",
    ip: "192.168.1.50",
    lastCommand,
    responseTimeMs,
    signalControlled: "SIGNAL_12",
    firmware: "v2.4.1",
  };
}
