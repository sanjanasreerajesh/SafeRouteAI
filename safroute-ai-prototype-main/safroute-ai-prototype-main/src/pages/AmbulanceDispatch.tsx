/**
 * AmbulanceDispatch.tsx
 * Smart Ambulance Dispatch & Traffic Priority — /ambulance-dispatch
 *
 * Signal colour logic (per specification):
 *  - All signals start RED
 *  - When ambulance reaches 50% of distance to a signal → RED → YELLOW
 *  - When ambulance is within 0.15 km (150 m) of signal → YELLOW → GREEN
 *  - When ambulance passes signal by 0.04 km (40 m)     → back to AUTO (RED)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Ambulance, BarChart3, CheckCircle2,
  Clock, Cpu, Navigation, Radio, Siren,
  Terminal, Zap,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { connectESP32, sendGreenSignal } from "@/lib/trafficControllerService";
import type {
  CommandLogEntry,
  ESP32ControllerStatus,
} from "@/lib/ambulanceDispatchTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & types
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_KM      = 12.8;
const NUM_SIGNALS   = 10;
const SPEED_KMH     = 48;           // ambulance speed during simulation
const TICK_MS       = 200;          // simulation tick interval
const KM_PER_TICK   = (SPEED_KMH / 3600) * (TICK_MS / 1000);

/** km before signal where state flips RED → YELLOW (50% of distance to that signal from previous) */
// calculated dynamically per signal

/** km before signal where state flips YELLOW → GREEN */
const GREEN_KM      = 0.15;

/** km after signal where state resets back to AUTO */
const AUTO_AFTER_KM = 0.04;

/** Signal km positions spread evenly along route */
const SIGNAL_POSITIONS: number[] = Array.from({ length: NUM_SIGNALS }, (_, i) =>
  parseFloat(((i + 1) * (TOTAL_KM / (NUM_SIGNALS + 1))).toFixed(2))
);

type SigState = "WAITING" | "YELLOW" | "GREEN" | "AUTO";

interface Signal {
  id: string;
  km: number;
  state: SigState;
  /** the km point at which this signal turns YELLOW (halfway from prev signal) */
  yellowKm: number;
}

function makeSignals(): Signal[] {
  return SIGNAL_POSITIONS.map((km, i) => {
    const prevKm = i === 0 ? 0 : SIGNAL_POSITIONS[i - 1];
    const halfwayFromPrev = prevKm + (km - prevKm) * 0.5;
    return { id: `S${i + 1}`, km, state: "WAITING", yellowKm: halfwayFromPrev };
  });
}

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmtClock() {
  return new Date().toLocaleTimeString("en-IN", {
    hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** Which LED colour to show given signal state */
function ledColor(state: SigState): "RED" | "YELLOW" | "GREEN" {
  if (state === "YELLOW") return "YELLOW";
  if (state === "GREEN")  return "GREEN";
  return "RED"; // WAITING or AUTO
}

// ─────────────────────────────────────────────────────────────────────────────
// Atom components
// ─────────────────────────────────────────────────────────────────────────────

function GlowDot({ on, color = "green" }: { on: boolean; color?: "green"|"red"|"yellow"|"blue" }) {
  const map: Record<string,string> = {
    green:  "bg-green-400  shadow-green-400/70",
    red:    "bg-red-500    shadow-red-500/70",
    yellow: "bg-yellow-400 shadow-yellow-400/70",
    blue:   "bg-blue-400   shadow-blue-400/70",
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${map[color]} ${on ? "shadow-[0_0_8px_3px]" : "opacity-25"}`} />
  );
}

/** Mini SVG traffic light shown on the route strip */
function TLIcon({ state, active }: { state: SigState; active: boolean }) {
  const c   = ledColor(state);
  const red = c === "RED"    ? "#ef4444" : "#1a2035";
  const yel = c === "YELLOW" ? "#eab308" : "#1a2035";
  const grn = c === "GREEN"  ? "#22c55e" : "#1a2035";
  const glow =
    c === "RED"    ? "drop-shadow(0 0 4px #ef4444)" :
    c === "YELLOW" ? "drop-shadow(0 0 4px #eab308)" :
                     "drop-shadow(0 0 4px #22c55e)";
  return (
    <svg width="20" height="48" viewBox="0 0 20 48" style={{ filter: active ? glow : undefined }}>
      <rect x="1" y="0" width="18" height="42" rx="4" fill="#0f172a"
        stroke={active ? "#f59e0b" : "#334155"} strokeWidth={active ? 1.5 : 0.8}/>
      <circle cx="10" cy="8"  r="5.5" fill={red}/>
      <circle cx="10" cy="21" r="5.5" fill={yel}/>
      <circle cx="10" cy="34" r="5.5" fill={grn}/>
      <line x1="10" y1="42" x2="10" y2="48" stroke="#475569" strokeWidth="2"/>
      {/* Blink ring on active */}
      {active && (
        <circle cx="10" cy={c==="GREEN"?34:c==="YELLOW"?21:8} r="8" fill="none"
          stroke={c==="GREEN"?"#22c55e":c==="YELLOW"?"#eab308":"#ef4444"}
          strokeWidth="1" opacity="0.6">
          <animate attributeName="opacity" values="0.6;0;0.6" dur="0.9s" repeatCount="indefinite"/>
        </circle>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Strip — full-width horizontal route with 10 signals
// ─────────────────────────────────────────────────────────────────────────────

function RouteStrip({ coveredKm, signals }: { coveredKm: number; signals: Signal[] }) {
  // Ambulance starts on the RIGHT (accident) and moves LEFT toward hospital.
  // "pct" = how far ambulance has travelled as % of total.
  // On screen: hospital is at left=0%, accident is at left=100%.
  // Ambulance visual position = 100% - pct  (starts at right, moves left).
  const pct     = Math.min(100, (coveredKm / TOTAL_KM) * 100);
  const ambLeft = 100 - pct;   // starts at 100 (right), decreases toward 0 (left)

  // Signal screen position: signal at km  →  left = (1 - km/TOTAL_KM)*100%
  //   S1 is closest to accident (right), S10 closest to hospital (left)
  const sigLeft = (km: number) => (1 - km / TOTAL_KM) * 100;

  const nextSignal = signals.find(s => s.state !== "AUTO" && s.km > coveredKm) ?? null;
  const yellowSig  = signals.find(s => s.state === "YELLOW") ?? null;
  const greenSig   = signals.find(s => s.state === "GREEN")  ?? null;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 overflow-x-auto">
      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Navigation className="h-4 w-4 text-blue-400"/>
        Ambulance Route &amp; Traffic Signals
      </p>

      <div style={{ minWidth: 800 }}>

        {/* ── Annotation row ── */}
        <div className="relative h-5 mb-1">
          {yellowSig && (
            <span className="absolute text-[10px] text-yellow-300 font-semibold whitespace-nowrap -translate-x-1/2"
              style={{ left: `${sigLeft(yellowSig.km)}%` }}>
              ↓ Signal will turn YELLOW at halfway
            </span>
          )}
          {greenSig && (
            <span className="absolute text-[10px] text-green-300 font-semibold whitespace-nowrap -translate-x-1/2"
              style={{ left: `${sigLeft(greenSig.km)}%` }}>
              ↓ Signals turn GREEN as ambulance reaches
            </span>
          )}
        </div>

        {/* ── Road coordinate space (contains both endpoint markers and road) ── */}
        <div className="relative mx-5" style={{ height: 110 }}>
          {/* Road bed — tall enough to contain the ambulance */}
          <div className="absolute inset-x-0 bg-[#0d1e3d] border-t border-b border-[#1e3a6e]"
            style={{ top: 40, height: 40 }}/>
          {/* Progress fill: grows from the RIGHT (accident side) leftward */}
          <div className="absolute bg-blue-700/30 transition-all duration-300"
            style={{ top: 40, right: 0, height: 40, width: `${pct}%` }}/>
          {/* Road lane lines */}
          <div className="absolute inset-x-0 border-t border-dashed border-blue-400/25"
            style={{ top: 60 }}/>

          {/* ACCIDENT marker — top-right, above the road */}
          <div className="absolute flex flex-col items-center" style={{ right: -4, top: 0 }}>
            <div className="w-12 h-12 rounded-full bg-red-600 border-2 border-red-400 flex items-center justify-center
              shadow-[0_0_20px_8px_rgba(239,68,68,0.6)]">
              <span className="text-white font-black text-lg">!</span>
            </div>
            <span className="text-[8px] text-red-400 font-bold mt-0.5 text-center leading-none">ACCIDENT<br/>0 km</span>
          </div>

          {/* HOSPITAL marker — top-left, above the road */}
          <div className="absolute flex flex-col items-center" style={{ left: -4, top: 0 }}>
            <div className="w-12 h-12 rounded-xl bg-cyan-700 border-2 border-cyan-400 flex items-center justify-center
              shadow-[0_0_20px_8px_rgba(6,182,212,0.4)]">
              <span className="text-white font-black text-lg">H</span>
            </div>
            <span className="text-[8px] text-cyan-400 font-bold mt-0.5 text-center leading-none">HOSPITAL<br/>{TOTAL_KM} km</span>
          </div>

          {/* Traffic signal lights — straddle the road top edge */}
          {signals.map(sig => {
            const lPct     = sigLeft(sig.km);
            const isActive = nextSignal?.id === sig.id;
            return (
              <div key={sig.id} className="absolute flex flex-col items-center -translate-x-1/2"
                style={{ left: `${lPct}%`, top: 8 }}>
                {isActive && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping opacity-70"/>
                )}
                <TLIcon state={sig.state} active={isActive}/>
              </div>
            );
          })}

          {/* Ambulance — large, centered vertically on road, moves right→left */}
          <div className="absolute transition-all duration-300 flex flex-col items-center"
            style={{ left: `${ambLeft}%`, top: 34, transform: "translateX(-50%)" }}>
            {/* Flashing red beacon */}
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 mb-0.5
              shadow-[0_0_10px_4px_rgba(239,68,68,0.9)] animate-pulse"/>
            {/* Ambulance vehicle */}
            <div className="bg-white rounded-xl border-2 border-blue-200 flex items-center justify-center
              shadow-[0_0_16px_4px_rgba(251,191,36,0.4)]"
              style={{ width: 56, height: 32 }}>
              <span className="select-none" style={{ fontSize: 26, lineHeight: 1 }}>🚑</span>
            </div>
          </div>
        </div>

        {/* ── Signal labels ── */}
        <div className="relative mx-5 mt-1" style={{ height: 26 }}>
          {signals.map(sig => {
            const lPct = sigLeft(sig.km);
            const c    = ledColor(sig.state);
            const col  = c === "GREEN" ? "text-green-400" : c === "YELLOW" ? "text-yellow-300" : "text-slate-500";
            return (
              <div key={sig.id} className={`absolute flex flex-col items-center -translate-x-1/2 ${col}`}
                style={{ left: `${lPct}%` }}>
                <span className="text-[9px] font-bold">{sig.id}</span>
                <span className="text-[8px] text-slate-600">{sig.km} km</span>
              </div>
            );
          })}
        </div>

        {/* Distance ruler */}
        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-600">
          <span className="flex-1 border-t border-dashed border-slate-800"/>
          TOTAL DISTANCE: {TOTAL_KM} km
          <span className="flex-1 border-t border-dashed border-slate-800"/>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary bar
// ─────────────────────────────────────────────────────────────────────────────

function SummaryBar({ coveredKm, dispatchStatus }: { coveredKm: number; dispatchStatus: string }) {
  const remainKm  = Math.max(0, TOTAL_KM - coveredKm);
  const etaMins   = SPEED_KMH > 0 ? Math.ceil((remainKm / SPEED_KMH) * 60) : 0;
  const etaTime   = new Date(Date.now() + etaMins * 60000).toLocaleTimeString("en-IN",
    { hour: "2-digit", minute: "2-digit", hour12: true });

  const cards = [
    { label: "Accident ID",       value: "ACC-2025-051",       cls: "bg-red-900/30 border-red-700/50"  },
    { label: "Priority Level",    value: "CRITICAL",           cls: "bg-orange-900/30 border-orange-700/50" },
    { label: "Victims",           value: "2",                  cls: "bg-slate-800/60 border-slate-700/50" },
    { label: "Selected Hospital", value: "City Trauma Center", cls: "bg-slate-800/60 border-slate-700/50" },
    { label: "Ambulance",         value: "AMB-108",            cls: "bg-slate-800/60 border-slate-700/50" },
    { label: "Current ETA",       value: etaTime,              cls: "bg-slate-800/60 border-slate-700/50" },
    { label: "Status",            value: dispatchStatus,       cls: dispatchStatus === "HOSPITAL REACHED"
        ? "bg-green-900/30 border-green-600/50"
        : "bg-green-900/20 border-green-700/40" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {cards.map(c => (
        <div key={c.label} className={`rounded-lg border p-3 ${c.cls}`}>
          <p className="text-[10px] text-slate-400 mb-0.5">{c.label}</p>
          <p className="text-sm font-bold text-slate-100 leading-tight">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ambulance Status panel
// ─────────────────────────────────────────────────────────────────────────────

function AmbulanceStatusPanel({
  coveredKm, simRunning, nextSignal,
}: { coveredKm: number; simRunning: boolean; nextSignal: Signal | null }) {
  const remaining  = Math.max(0, TOTAL_KM - coveredKm);
  const etaHosp    = SPEED_KMH > 0 ? Math.ceil((remaining / SPEED_KMH) * 60) : 0;
  const distToSig  = nextSignal ? Math.max(0, nextSignal.km - coveredKm) : null;
  const etaToSig   = distToSig !== null ? Math.ceil((distToSig / SPEED_KMH) * 60) : null;
  const pct        = Math.min(100, Math.round((coveredKm / TOTAL_KM) * 100));
  const status     = !simRunning && coveredKm === 0 ? "STANDBY"
    : coveredKm >= TOTAL_KM ? "HOSPITAL REACHED"
    : nextSignal && (nextSignal.km - coveredKm) < 0.3 ? "NEAR SIGNAL"
    : "EN ROUTE";

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Ambulance className="h-4 w-4 text-cyan-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Ambulance Status</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-3xl">🚑</span>
        <div>
          <p className="text-cyan-400 font-bold">AMB-108</p>
          <p className="text-xs text-slate-400">Driver: Raj Kumar</p>
          <p className="text-xs text-slate-400">Hospital: City Trauma Center</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {([
          ["Speed",               simRunning ? `${SPEED_KMH} km/h` : "0 km/h"],
          ["Distance Remaining",  `${remaining.toFixed(1)} km`],
          ["Next Signal",         nextSignal ? `${nextSignal.id} (${distToSig!.toFixed(2)} km)` : "—"],
          ["ETA to Next Signal",  etaToSig !== null ? `${etaToSig} min` : "—"],
          ["ETA to Hospital",     etaHosp ? `${etaHosp} min` : "—"],
          ["Status",              status],
        ] as [string,string][]).map(([k,v]) => (
          <div key={k}>
            <p className="text-slate-500">{k}</p>
            <p className={`font-semibold ${k === "Status" ? "text-green-400" : "text-slate-200"}`}>{v}</p>
          </div>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>Route Progress</span><span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-2 bg-slate-800 [&>div]:bg-blue-500"/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Next Signal Details panel
// ─────────────────────────────────────────────────────────────────────────────

function NextSignalPanel({
  nextSignal, coveredKm, countdown,
}: { nextSignal: Signal | null; coveredKm: number; countdown: number }) {
  if (!nextSignal) return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 flex items-center justify-center min-h-[180px]">
      <p className="text-slate-500 text-sm">No upcoming signal</p>
    </div>
  );

  const dist  = Math.max(0, nextSignal.km - coveredKm);
  const etaS  = SPEED_KMH > 0 ? Math.ceil((dist / SPEED_KMH) * 3600) : 0;
  const c     = ledColor(nextSignal.state);
  const rOn   = c === "RED";
  const yOn   = c === "YELLOW";
  const gOn   = c === "GREEN";

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Siren className="h-4 w-4 text-yellow-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Next Signal Details</span>
      </div>
      <div className="flex gap-4">
        {/* Traffic light + countdown */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="bg-slate-900 border-2 border-slate-600 rounded-2xl p-2 w-14 flex flex-col items-center gap-1.5">
            <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all duration-500
              ${rOn ? "bg-red-500 border-red-300 shadow-[0_0_14px_5px_rgba(239,68,68,0.6)] text-white" : "bg-slate-800 border-slate-700 text-slate-600 opacity-30"}`}>R</div>
            <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all duration-500
              ${yOn ? "bg-yellow-400 border-yellow-200 shadow-[0_0_14px_5px_rgba(234,179,8,0.6)] text-black" : "bg-slate-800 border-slate-700 text-slate-600 opacity-30"}`}>Y</div>
            <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all duration-500
              ${gOn ? "bg-green-500 border-green-300 shadow-[0_0_14px_5px_rgba(34,197,94,0.6)] text-white" : "bg-slate-800 border-slate-700 text-slate-600 opacity-30"}`}>G</div>
          </div>
          {/* Countdown ring */}
          <div className="relative w-11 h-11">
            <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
              <circle cx="22" cy="22" r="17" fill="none" stroke="#1e293b" strokeWidth="4"/>
              <circle cx="22" cy="22" r="17" fill="none"
                stroke={gOn?"#22c55e":yOn?"#eab308":"#ef4444"}
                strokeWidth="4"
                strokeDasharray={`${Math.min(1,(countdown/60))*107} 107`}
                strokeLinecap="round"/>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-200">{countdown}s</span>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs flex-1">
          {([
            ["Signal ID",      <span className="text-yellow-400 font-bold">{nextSignal.id}</span>],
            ["Distance",       <span className="text-slate-200 font-semibold">{dist.toFixed(2)} km</span>],
            ["ETA",            <span className="text-slate-200 font-semibold">{Math.floor(etaS/60)}m {etaS%60}s</span>],
            ["Current Status", <span className={`font-bold ${gOn?"text-green-400":yOn?"text-yellow-300":"text-red-400"}`}>{c}</span>],
            ["Mode",           <span className="text-orange-400 font-bold">PRIORITY</span>],
            ["Countdown",      <span className="text-slate-200 font-semibold">{countdown}s</span>],
          ] as [string, JSX.Element][]).map(([k,v]) => (
            <div key={k}>
              <p className="text-slate-500">{k}</p>
              <div>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={`text-center text-xs font-semibold py-1.5 rounded-lg border transition-all duration-500
        ${gOn  ? "border-green-500/40  text-green-400  bg-green-900/20" :
          yOn  ? "border-yellow-500/40 text-yellow-300 bg-yellow-900/20" :
                 "border-slate-600/40  text-slate-400  bg-slate-800/20"}`}>
        {gOn  ? "✓ Signal Cleared — Ambulance Passing" :
         yOn  ? "⚡ Will turn GREEN when ambulance reaches" :
                "⏳ Waiting — Ambulance approaching"}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal Progression panel
// ─────────────────────────────────────────────────────────────────────────────

function SignalProgressionPanel({ nextSignal, coveredKm }: { nextSignal: Signal | null; coveredKm: number }) {
  if (!nextSignal) return null;
  const dist     = Math.max(0, nextSignal.km - coveredKm);
  const halfKm   = nextSignal.yellowKm;
  // progress = how far ambulance is between previous signal (or 0) and this signal
  const prevKm   = 0; // start of segment for progress bar simplicity
  const pct      = Math.min(100, Math.max(0, Math.round((coveredKm / nextSignal.km) * 100)));
  const action   = dist <= GREEN_KM  ? "WILL TURN GREEN" :
                   dist <= (nextSignal.km - nextSignal.yellowKm) ? "TURNING YELLOW" : "APPROACHING";

  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Navigation className="h-4 w-4 text-blue-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Signal Progression</span>
      </div>
      <p className="text-yellow-400 text-sm font-bold">{nextSignal.id} (Current Target)</p>

      {/* Progress track */}
      <div className="relative h-10 flex items-center px-2">
        <div className="w-full h-2 bg-slate-800 rounded-full"/>
        <div className="absolute h-2 bg-gradient-to-r from-blue-600 via-yellow-400 to-yellow-400 rounded-full transition-all duration-300"
          style={{ left: 8, width: `calc((100% - 16px) * ${pct / 100})` }}/>
        {/* Halfway dot */}
        <div className="absolute flex flex-col items-center" style={{ left: `calc(8px + (100% - 16px) * 0.5)`, transform: "translateX(-50%)" }}>
          <div className="w-3 h-3 rounded-full bg-yellow-400 border-2 border-yellow-200 -mt-0.5"/>
          <span className="text-[8px] text-yellow-400 mt-0.5 whitespace-nowrap">Halfway {halfKm.toFixed(1)} km</span>
        </div>
        {/* Ambulance dot */}
        <div className="absolute w-4 h-4 rounded-full bg-red-500 border-2 border-red-300 transition-all duration-300 -mt-1"
          style={{ left: `calc(8px + (100% - 16px) * ${pct / 100})`, transform: "translateX(-50%)" }}/>
        {/* Signal end dot */}
        <div className="absolute right-2 flex flex-col items-center -mt-1">
          <div className="w-3 h-3 rounded-full bg-green-400 border-2 border-green-200"/>
          <span className="text-[8px] text-green-400 mt-0.5">{nextSignal.km} km</span>
        </div>
        <div className="absolute left-2 -bottom-3 text-[8px] text-slate-500">0 km</div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
        {([
          ["Progress to Signal",      `${pct}%`],
          ["Distance Traveled",       `${coveredKm.toFixed(2)} km`],
          ["Dist Remaining to Signal",`${dist.toFixed(2)} km`],
          ["Expected Action",          action],
        ] as [string,string][]).map(([k,v]) => (
          <div key={k}>
            <p className="text-slate-500">{k}</p>
            <p className={`font-semibold ${v.includes("GREEN")?"text-green-400":v.includes("YELLOW")?"text-yellow-300":"text-slate-200"}`}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// All Signals Overview
// ─────────────────────────────────────────────────────────────────────────────

function AllSignalsOverview({ signals }: { signals: Signal[] }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Radio className="h-4 w-4 text-green-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">All Signals Overview</span>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
        {signals.map(sig => {
          const c  = ledColor(sig.state);
          const dot = c === "GREEN"  ? "bg-green-400 shadow-[0_0_6px_2px_rgba(34,197,94,0.5)]"
                    : c === "YELLOW" ? "bg-yellow-400 shadow-[0_0_6px_2px_rgba(234,179,8,0.5)]"
                    : "bg-red-500";
          const label = c === "GREEN" ? "CLEARED" : c === "YELLOW" ? "YELLOW" : sig.state === "AUTO" ? "AUTO" : "WAITING";
          const lCol  = label === "CLEARED" ? "text-green-400" : label === "YELLOW" ? "text-yellow-300" : "text-slate-500";
          const Icon  = label === "CLEARED" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400"/>
                      : label === "YELLOW"  ? <Zap className="h-3.5 w-3.5 text-yellow-300"/>
                      : <Clock className="h-3.5 w-3.5 text-slate-600"/>;
          return (
            <div key={sig.id} className="flex items-center gap-2 py-1 border-b border-slate-800/50 last:border-0">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`}/>
              <span className="text-slate-300 text-xs font-semibold w-5">{sig.id}</span>
              <span className="text-slate-500 text-xs flex-1">{sig.km} km</span>
              <span className={`text-xs font-bold ${lCol}`}>{label}</span>
              {Icon}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESP32 panel
// ─────────────────────────────────────────────────────────────────────────────

function ESP32Panel({ esp32, uptime }: { esp32: ESP32ControllerStatus; uptime: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-purple-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">ESP32 Controller Status</span>
      </div>
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-500
          ${esp32.online ? "border-green-500 bg-green-900/30 shadow-[0_0_16px_4px_rgba(34,197,94,0.3)]" : "border-slate-600 bg-slate-800"}`}>
          <Cpu className={`h-6 w-6 ${esp32.online ? "text-green-400" : "text-slate-500"}`}/>
        </div>
        <div>
          <p className={`font-bold text-base ${esp32.online ? "text-green-400" : "text-red-400"}`}>
            {esp32.online ? "CONNECTED" : "OFFLINE"}
          </p>
          <p className="text-xs text-slate-500">Status</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {([
          ["Uptime",         uptime],
          ["IP Address",     esp32.ip],
          ["Last Command",   esp32.lastCommand],
          ["Firmware",       "v1.4.2"],
          ["Response Time",  esp32.responseTimeMs ? `${esp32.responseTimeMs} ms` : "—"],
          ["WiFi",           esp32.wifiStatus],
        ] as [string,string][]).map(([k,v]) => (
          <div key={k}>
            <p className="text-slate-500">{k}</p>
            <div className="flex items-center gap-1.5">
              {k === "WiFi" && <GlowDot on={v === "CONNECTED"} color="green"/>}
              <p className="text-slate-200 font-semibold">{v}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Log
// ─────────────────────────────────────────────────────────────────────────────

function CommandLogPanel({ logs }: { logs: CommandLogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  const sty: Record<string,string> = { SUCCESS: "text-green-400", PENDING: "text-yellow-400", FAILED: "text-red-400" };
  const ico: Record<string,string> = { SUCCESS: "✓", PENDING: "⏳", FAILED: "✗" };
  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-green-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Command Log</span>
      </div>
      <div ref={ref} className="h-44 overflow-y-auto space-y-0.5 pr-1">
        {logs.length === 0 && <p className="text-slate-600 text-xs text-center py-8">No commands yet…</p>}
        {logs.map(log => (
          <div key={log.id} className="flex items-start gap-2 text-xs py-1 border-b border-slate-800/40 animate-fade-in">
            <span className="text-slate-600 font-mono shrink-0 w-20">{log.timestamp}</span>
            <span className="text-slate-300 flex-1">{log.event}</span>
            {log.detail && <span className="text-blue-400 font-mono shrink-0 text-[10px]">{log.detail}</span>}
            <span className={`shrink-0 font-bold ${sty[log.status]}`}>{ico[log.status]} {log.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prototype Traffic Signal LEDs (hardware panel)
// ─────────────────────────────────────────────────────────────────────────────

function PrototypePanel({ nextSignal }: { nextSignal: Signal | null }) {
  const c = nextSignal ? ledColor(nextSignal.state) : "RED";
  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-yellow-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Prototype Traffic Signal ({nextSignal?.id ?? "—"})
        </span>
      </div>
      <div className="flex justify-center gap-8 py-2">
        {([
          ["RED",    c === "RED",    "bg-red-500 border-red-300 shadow-[0_0_28px_10px_rgba(239,68,68,0.6)] text-white"],
          ["YELLOW", c === "YELLOW", "bg-yellow-400 border-yellow-200 shadow-[0_0_28px_10px_rgba(234,179,8,0.6)] text-black"],
          ["GREEN",  c === "GREEN",  "bg-green-500 border-green-300 shadow-[0_0_28px_10px_rgba(34,197,94,0.6)] text-white"],
        ] as [string, boolean, string][]).map(([label, active, onCls]) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className={`w-16 h-16 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-700
              ${active ? onCls : "bg-slate-900 border-slate-700 text-slate-600 opacity-25"}`}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-green-400 border border-green-700/40 bg-green-900/20 rounded-lg py-1.5">
        <GlowDot on color="green"/>
        Connected to ESP32 Hardware Controller
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Actions
// ─────────────────────────────────────────────────────────────────────────────

function QuickActions({
  onForceGreen, onHoldGreen, onReturnAuto, onStop, simRunning,
}: {
  onForceGreen: ()=>void; onHoldGreen: ()=>void;
  onReturnAuto: ()=>void; onStop: ()=>void; simRunning: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-orange-400"/>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Quick Actions</span>
      </div>
      <div className="space-y-2">
        {([
          ["🟢", "Force GREEN (Next Signal)", "border-green-700/50 bg-green-900/20 text-green-400 hover:bg-green-900/40", onForceGreen, !simRunning],
          ["🔵", "Hold Current Green",         "border-blue-700/50  bg-blue-900/20  text-blue-400  hover:bg-blue-900/40",  onHoldGreen,  !simRunning],
          ["🔄", "Return All to AUTO",          "border-orange-700/50 bg-orange-900/20 text-orange-400 hover:bg-orange-900/40", onReturnAuto, !simRunning],
          ["🛑", "Emergency Stop",              "border-red-700/50   bg-red-900/20   text-red-400   hover:bg-red-900/40",   onStop,       false],
        ] as [string,string,string,()=>void,boolean][]).map(([ico,lbl,cls,fn,disabled]) => (
          <button key={lbl} onClick={fn} disabled={disabled}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}>
            <span>{ico}</span>{lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

const AmbulanceDispatch = () => {
  const [signals,    setSignals]    = useState<Signal[]>(makeSignals());
  const [coveredKm,  setCoveredKm]  = useState(0);
  const [simRunning, setSimRunning] = useState(false);
  const [logs,       setLogs]       = useState<CommandLogEntry[]>([]);
  const [countdown,  setCountdown]  = useState(60);
  const [uptime,     setUptime]     = useState("00:00:00");
  const [esp32,      setEsp32]      = useState<ESP32ControllerStatus>({
    online: false, wifiStatus: "DISCONNECTED",
    ip: "192.168.1.50", lastCommand: "—", responseTimeMs: 0, signalControlled: "—",
  });

  const uptimeRef  = useRef(0);
  const simRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const coveredRef = useRef(0);
  const signalsRef = useRef<Signal[]>(makeSignals());

  // Keep refs in sync with state
  useEffect(() => { coveredRef.current = coveredKm; }, [coveredKm]);
  useEffect(() => { signalsRef.current = signals; },   [signals]);

  const addLog = useCallback((event: string, detail = "", status: "SUCCESS"|"PENDING"|"FAILED" = "SUCCESS") => {
    setLogs(p => [...p.slice(-80), { id: uid(), timestamp: fmtClock(), event, detail, status }]);
  }, []);

  // ESP32 connect on mount
  useEffect(() => {
    connectESP32().then(res => {
      setEsp32({ online: res.connected, wifiStatus: res.wifiStatus, ip: res.ip,
        lastCommand: res.lastCommand, responseTimeMs: res.responseTimeMs, signalControlled: "—" });
      addLog("ESP32 Controller Connected", `IP ${res.ip}`);
      addLog("Ambulance Dispatched", "AMB-108");
    });
  }, [addLog]);

  // Uptime clock
  useEffect(() => {
    const t = setInterval(() => {
      uptimeRef.current += 1;
      const h = String(Math.floor(uptimeRef.current / 3600)).padStart(2,"0");
      const m = String(Math.floor((uptimeRef.current % 3600) / 60)).padStart(2,"0");
      const s = String(uptimeRef.current % 60).padStart(2,"0");
      setUptime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Simulation tick ─────────────────────────────────────────────────────────
  const startSim = useCallback(() => {
    if (simRunning) return;

    // Reset
    const fresh = makeSignals();
    setSignals(fresh);
    signalsRef.current = fresh;
    setCoveredKm(0);
    coveredRef.current = 0;
    setLogs([]);
    setCountdown(60);
    setSimRunning(true);
    addLog("Simulation Started", "All signals RED", "SUCCESS");
    addLog("Ambulance Dispatched", "AMB-108 — EN ROUTE");

    simRef.current = setInterval(() => {
      const km  = coveredRef.current + KM_PER_TICK;
      const cur = signalsRef.current;

      if (km >= TOTAL_KM) {
        // Reached hospital
        setCoveredKm(TOTAL_KM);
        coveredRef.current = TOTAL_KM;
        clearInterval(simRef.current!);
        setSimRunning(false);
        addLog("Hospital Reached", "City Trauma Center", "SUCCESS");
        addLog("Mission Complete", "All signals restored", "SUCCESS");
        return;
      }

      // ── Per-signal state machine ─────────────────────────────────────────
      const updated = cur.map(sig => {
        const dist = sig.km - km;   // positive = ahead, negative = behind

        if (sig.state === "WAITING") {
          // Turn YELLOW when ambulance reaches the halfway point (yellowKm)
          if (km >= sig.yellowKm) {
            addLog(`${sig.id} → YELLOW`, `Halfway reached at ${sig.yellowKm.toFixed(1)} km`, "SUCCESS");
            sendGreenSignal(sig.id); // mock ESP32 prepare
            return { ...sig, state: "YELLOW" as SigState };
          }
        }

        if (sig.state === "YELLOW") {
          // Turn GREEN when within GREEN_KM (150 m)
          if (dist <= GREEN_KM) {
            addLog(`${sig.id} → GREEN`, `Command: SIGNAL_${sig.id}_GREEN`, "SUCCESS");
            setEsp32(p => ({ ...p, lastCommand: `SIGNAL_${sig.id}_GREEN`, responseTimeMs: 38, signalControlled: sig.id }));
            return { ...sig, state: "GREEN" as SigState };
          }
        }

        if (sig.state === "GREEN") {
          // Return to AUTO once ambulance has passed by AUTO_AFTER_KM (40 m)
          if (dist < -AUTO_AFTER_KM) {
            addLog(`${sig.id} → AUTO`, "Ambulance cleared", "SUCCESS");
            return { ...sig, state: "AUTO" as SigState };
          }
        }

        return sig;
      });

      // countdown tick
      setCountdown(p => p > 0 ? p - 1 : 60);

      setSignals(updated);
      signalsRef.current = updated;
      setCoveredKm(parseFloat(km.toFixed(3)));
      coveredRef.current = km;
    }, TICK_MS);
  }, [simRunning, addLog]);

  const stopSim = useCallback(() => {
    if (simRef.current) clearInterval(simRef.current);
    setSimRunning(false);
    addLog("Emergency Stop", "Simulation halted", "FAILED");
  }, [addLog]);

  const forceGreen = useCallback(() => {
    const next = signalsRef.current.find(s => s.state !== "AUTO" && s.km > coveredRef.current);
    if (!next) return;
    setSignals(p => p.map(s => s.id === next.id ? { ...s, state: "GREEN" } : s));
    addLog(`Force GREEN`, `${next.id} overridden`, "SUCCESS");
  }, [addLog]);

  const returnAuto = useCallback(() => {
    setSignals(p => p.map(s => s.state !== "AUTO" && s.km < coveredRef.current ? { ...s, state: "AUTO" } : s));
    addLog("All signals returned to AUTO", "", "SUCCESS");
  }, [addLog]);

  useEffect(() => () => { if (simRef.current) clearInterval(simRef.current); }, []);

  // Derived
  const nextSignal = signals.find(s => s.state !== "AUTO" && s.km > coveredKm) ?? null;
  const dispatchStatus = !simRunning && coveredKm === 0 ? "STANDBY"
    : coveredKm >= TOTAL_KM ? "HOSPITAL REACHED"
    : nextSignal && (nextSignal.km - coveredKm) < 0.3 ? "NEAR SIGNAL"
    : "EN ROUTE";
  const clearedCount = signals.filter(s => s.state === "AUTO" && s.km <= coveredKm).length;

  return (
    <div className="min-h-screen bg-[#050c1a] text-slate-100">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#050c1a]/95 backdrop-blur border-b border-slate-800/80 px-4 py-2.5
        flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center">
            <Ambulance className="h-4 w-4 text-red-400"/>
          </div>
          <div>
            <p className="font-bold text-sm text-slate-100 leading-none">SAFE ROUTE AI</p>
            <p className="text-[10px] text-slate-500">Smart Ambulance Dispatch &amp; Traffic Priority</p>
          </div>
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full border border-green-700/40 bg-green-900/20">
            <GlowDot on color="green"/>
            <span className="text-[10px] text-green-400 font-semibold">LIVE</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5"/>{fmtClock()}</div>
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-purple-400"/>
            <GlowDot on={esp32.online} color="green"/>
            <span className={esp32.online ? "text-green-400 font-semibold" : "text-slate-500"}>
              ESP32 {esp32.online ? "CONNECTED" : "OFFLINE"}
            </span>
          </div>
          <button onClick={simRunning ? stopSim : startSim}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all
              ${simRunning
                ? "bg-red-900/40 border-red-600/60 text-red-400 hover:bg-red-900/60"
                : "bg-blue-600 hover:bg-blue-500 border-blue-500 text-white shadow-[0_0_12px_2px_rgba(37,99,235,0.4)]"}`}>
            {simRunning ? "⏹ Stop" : "▶ Start Simulation"}
          </button>
        </div>
      </div>

      {/* ── Page body ─────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-4 max-w-[1600px] mx-auto">

        {/* Route strip */}
        <RouteStrip coveredKm={coveredKm} signals={signals}/>

        {/* Summary bar */}
        <SummaryBar coveredKm={coveredKm} dispatchStatus={dispatchStatus}/>

        {/* Row: Ambulance Status | Next Signal | Signal Progression | All Signals */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <AmbulanceStatusPanel coveredKm={coveredKm} simRunning={simRunning} nextSignal={nextSignal}/>
          <NextSignalPanel nextSignal={nextSignal} coveredKm={coveredKm} countdown={countdown}/>
          <SignalProgressionPanel nextSignal={nextSignal} coveredKm={coveredKm}/>
          <AllSignalsOverview signals={signals}/>
        </div>

        {/* Row: ESP32 | Command Log | Prototype LED | Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ESP32Panel esp32={esp32} uptime={uptime}/>
          <CommandLogPanel logs={logs}/>
          <PrototypePanel nextSignal={nextSignal}/>
          <QuickActions
            onForceGreen={forceGreen}
            onHoldGreen={() => addLog("Hold Green", "Manual hold", "SUCCESS")}
            onReturnAuto={returnAuto}
            onStop={stopSim}
            simRunning={simRunning}/>
        </div>

        {/* Stats footer */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {([
            [<CheckCircle2 className="h-5 w-5"/>, "text-green-400",  String(clearedCount),    "Signals Cleared"],
            [<Clock        className="h-5 w-5"/>, "text-blue-400",   uptime,                  "Uptime"],
            [<Navigation   className="h-5 w-5"/>, "text-purple-400", `${coveredKm.toFixed(1)} km`, "Distance Covered"],
            [<BarChart3    className="h-5 w-5"/>, "text-cyan-400",   "96%",                   "ETA Accuracy"],
            [<Ambulance    className="h-5 w-5"/>, "text-orange-400", simRunning ? `${SPEED_KMH} km/h` : "0 km/h", "Ambulance Speed"],
          ] as [JSX.Element, string, string, string][]).map(([ico, col, val, lbl]) => (
            <div key={lbl} className="rounded-xl border border-slate-700/50 bg-[#070f20] p-4 flex flex-col gap-1 items-center text-center">
              <span className={col}>{ico}</span>
              <p className={`text-xl font-bold ${col}`}>{val}</p>
              <p className="text-[10px] text-slate-400">{lbl}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-slate-700 pb-4">
          Prototype IoT demo — ESP32 calls are mocked. Replace functions in{" "}
          <code className="text-slate-600">src/lib/trafficControllerService.ts</code> with live FastAPI endpoints.
        </p>
      </div>
    </div>
  );
};

export default AmbulanceDispatch;
