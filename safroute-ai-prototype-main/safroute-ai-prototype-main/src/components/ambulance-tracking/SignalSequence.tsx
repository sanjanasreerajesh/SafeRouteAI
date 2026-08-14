import { CheckCircle2, Circle, ListOrdered, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IntersectionState } from "@/types/traffic";

interface PhaseStep {
  mode: IntersectionState["mode"];
  label: string;
  detail: string;
}

const PHASES: PhaseStep[] = [
  { mode: "NORMAL", label: "Normal Operation", detail: "Intersection runs its default cycle" },
  { mode: "PRIORITY_PREPARING", label: "Emergency Priority Activating", detail: "Ambulance approach RED → YELLOW, conflicting approaches RED" },
  { mode: "PRIORITY_ACTIVE", label: "Emergency Priority Active", detail: "Ambulance approach GREEN — exclusive right of way" },
  { mode: "PRIORITY_CLEARING", label: "Emergency Priority Cleared", detail: "Ambulance approach GREEN → RED, returning to normal" },
];

/** Rank used to mark phases already passed this leg as COMPLETED, the current as ACTIVE, the rest PENDING. */
const PHASE_ORDER: Record<IntersectionState["mode"], number> = {
  NORMAL: 0,
  PRIORITY_PREPARING: 1,
  PRIORITY_ACTIVE: 2,
  PRIORITY_CLEARING: 3,
};

interface SignalSequenceProps {
  intersection: IntersectionState;
  journeyDirection: "HOSPITAL_TO_INCIDENT" | "INCIDENT_TO_HOSPITAL";
}

const SignalSequence = ({ intersection, journeyDirection }: SignalSequenceProps) => {
  const currentRank = PHASE_ORDER[intersection.mode];

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListOrdered className="h-5 w-5 text-primary" />
          Intersection Phase Sequence — {journeyDirection === "HOSPITAL_TO_INCIDENT" ? "Hospital → Incident" : "Incident → Hospital"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {PHASES.map((phase, idx) => {
            const isLast = idx === PHASES.length - 1;
            const isCurrent = phase.mode === intersection.mode;
            const isCompleted = !isCurrent && phase.mode !== "NORMAL" && PHASE_ORDER[phase.mode] < currentRank;
            const status: "COMPLETED" | "ACTIVE" | "PENDING" = isCurrent ? "ACTIVE" : isCompleted ? "COMPLETED" : "PENDING";

            return (
              <div key={phase.mode} className="flex gap-3">
                <div className="flex flex-col items-center">
                  {status === "COMPLETED" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {status === "ACTIVE" && <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />}
                  {status === "PENDING" && <Circle className="h-4 w-4 text-muted-foreground/40" />}
                  {!isLast && (
                    <div className={`w-px flex-1 min-h-[18px] ${status === "COMPLETED" ? "bg-green-500/40" : "bg-border"}`} />
                  )}
                </div>
                <div className="pb-4">
                  <p className={`text-base font-medium ${status === "PENDING" ? "text-muted-foreground" : status === "ACTIVE" ? "text-amber-600" : ""}`}>
                    {phase.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{phase.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default SignalSequence;
