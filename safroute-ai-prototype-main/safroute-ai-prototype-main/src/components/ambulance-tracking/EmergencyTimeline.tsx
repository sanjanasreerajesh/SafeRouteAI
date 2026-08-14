import { CheckCircle2, Circle, Loader2, Milestone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimelineStep } from "@/types/route";

interface EmergencyTimelineProps {
  steps: TimelineStep[];
}

const EmergencyTimeline = ({ steps }: EmergencyTimelineProps) => {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Milestone className="h-5 w-5 text-primary" />
          Emergency Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;
            return (
              <div key={step.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  {step.status === "COMPLETED" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {step.status === "ACTIVE" && <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />}
                  {step.status === "PENDING" && <Circle className="h-4 w-4 text-muted-foreground/40" />}
                  {!isLast && (
                    <div className={`w-px flex-1 min-h-[18px] ${step.status === "COMPLETED" ? "bg-green-500/40" : "bg-border"}`} />
                  )}
                </div>
                <div className="pb-4">
                  <p
                    className={`text-base font-medium ${
                      step.status === "PENDING" ? "text-muted-foreground" : step.status === "ACTIVE" ? "text-amber-600" : ""
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.timestampIso && step.status !== "PENDING" && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(step.timestampIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default EmergencyTimeline;
