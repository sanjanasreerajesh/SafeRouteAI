import { TrafficCone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_DIRECTIONS } from "@/types/traffic";
import type { ApproachDirection, DirectionSignalState, IntersectionState } from "@/types/traffic";

const MODE_LABEL: Record<IntersectionState["mode"], string> = {
  NORMAL: "NORMAL OPERATION",
  PRIORITY_PREPARING: "ACTIVATING",
  PRIORITY_ACTIVE: "ACTIVE",
  PRIORITY_CLEARING: "CLEARED",
};

const MODE_COLOR: Record<IntersectionState["mode"], string> = {
  NORMAL: "text-muted-foreground",
  PRIORITY_PREPARING: "text-yellow-600",
  PRIORITY_ACTIVE: "text-green-600",
  PRIORITY_CLEARING: "text-primary",
};

function DirectionRow({ direction, state, isAmbulance }: { direction: ApproachDirection; state: DirectionSignalState; isAmbulance: boolean }) {
  const dotColor = state === "GREEN" ? "bg-green-500" : state === "YELLOW" ? "bg-yellow-500" : "bg-red-500";
  const textColor = state === "GREEN" ? "text-green-600" : state === "YELLOW" ? "text-yellow-600" : "text-red-600";
  return (
    <div className={`flex items-center justify-between rounded-md px-3 py-2 ${isAmbulance ? "bg-primary/10 border border-primary/30" : "bg-muted/40"}`}>
      <span className="flex items-center gap-2 text-sm font-medium">
        {direction}
        {isAmbulance && <span className="text-xs text-primary font-semibold">🚑 AMBULANCE</span>}
      </span>
      <span className={`flex items-center gap-1.5 font-bold text-sm ${textColor}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
        {state}
      </span>
    </div>
  );
}

interface NextSignalPanelProps {
  intersection: IntersectionState;
}

const NextSignalPanel = ({ intersection }: NextSignalPanelProps) => {
  const ambulanceLight = intersection.directions[intersection.ambulanceApproach];

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrafficCone className="h-5 w-5 text-amber-500" />
          Smart Intersection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-sm text-muted-foreground">Ambulance Approach</p>
            <p className="font-semibold text-lg">{intersection.ambulanceApproach}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Emergency Priority</p>
            <p className={`font-bold text-lg ${MODE_COLOR[intersection.mode]}`}>{MODE_LABEL[intersection.mode]}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Distance</p>
            <p className="font-semibold text-base">{Math.max(0, Math.round(intersection.distanceMeters))} m</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Ambulance Light</p>
            <p className={`font-bold text-lg ${ambulanceLight === "GREEN" ? "text-green-600" : ambulanceLight === "YELLOW" ? "text-yellow-600" : "text-red-600"}`}>
              {ambulanceLight}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Intersection State</p>
          {ALL_DIRECTIONS.map((d) => (
            <DirectionRow key={d} direction={d} state={intersection.directions[d]} isAmbulance={d === intersection.ambulanceApproach} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default NextSignalPanel;
