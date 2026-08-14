import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrafficCone } from "lucide-react";

import { ALL_DIRECTIONS } from "@/types/traffic";
import type { ApproachDirection, DirectionSignalState, IntersectionState } from "@/types/traffic";

interface PrototypeTrafficLightProps {
  intersection: IntersectionState;
}

/** One approach's own 3-LED stack (RED/YELLOW/GREEN) — the ESP32 prototype has 4 of these, 12 LEDs total. */
function DirectionStack({ state, isAmbulance }: { state: DirectionSignalState; isAmbulance: boolean }) {
  const dot = (color: "red" | "yellow" | "green", on: boolean) => {
    const glow: Record<string, string> = {
      red: "bg-red-500 shadow-[0_0_8px_3px_rgba(239,68,68,0.7)]",
      yellow: "bg-yellow-400 shadow-[0_0_8px_3px_rgba(234,179,8,0.7)]",
      green: "bg-green-400 shadow-[0_0_8px_3px_rgba(34,197,94,0.7)]",
    };
    return <span className={`h-3 w-3 rounded-full block ${on ? glow[color] : "bg-slate-600"}`} />;
  };

  return (
    <div className={`flex flex-col gap-1 rounded-md p-1.5 ${isAmbulance ? "bg-slate-800 ring-1 ring-primary/60" : "bg-slate-800/60"}`}>
      {dot("red", state === "RED")}
      {dot("yellow", state === "YELLOW")}
      {dot("green", state === "GREEN")}
    </div>
  );
}

/**
 * Prototype 4-way junction: ONE intersection, each approach with its own
 * independent 3-LED stack. Only the ambulance's approach may show GREEN at
 * a time — enforced upstream by the state machine, not here.
 */
function FourWayJunction({ intersection }: { intersection: IntersectionState }) {
  const positions: Record<ApproachDirection, string> = {
    NORTH: "top-0 left-1/2 -translate-x-1/2",
    EAST: "right-0 top-1/2 -translate-y-1/2",
    SOUTH: "bottom-0 left-1/2 -translate-x-1/2",
    WEST: "left-0 top-1/2 -translate-y-1/2",
  };

  return (
    <div className="relative mx-auto" style={{ width: 190, height: 190 }}>
      <div className="absolute inset-12 rounded-md bg-slate-800" />
      {ALL_DIRECTIONS.map((dir) => {
        const isAmbulance = dir === intersection.ambulanceApproach;
        return (
          <div key={dir} className={`absolute flex flex-col items-center gap-1 ${positions[dir]}`}>
            <DirectionStack state={intersection.directions[dir]} isAmbulance={isAmbulance} />
            <span className={`text-[10px] font-semibold ${isAmbulance ? "text-primary" : "text-muted-foreground"}`}>
              {dir}
              {isAmbulance && " 🚑"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const PrototypeTrafficLight = ({ intersection }: PrototypeTrafficLightProps) => {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrafficCone className="h-5 w-5 text-primary" />
          Four-Way Intersection — {intersection.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <FourWayJunction intersection={intersection} />

        <div className="text-center">
          <p className="text-xs text-muted-foreground">ESP32 Controlled · 12-LED Prototype Representation</p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">Does not control real public traffic infrastructure.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PrototypeTrafficLight;
