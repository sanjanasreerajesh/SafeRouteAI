import { BarChart3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AmbulanceRoute } from "@/types/route";
import type { IntersectionState } from "@/types/traffic";
import { metersToKm, secondsToClock } from "@/services/simulationService";

interface RouteStatisticsProps {
  route: AmbulanceRoute;
  intersection: IntersectionState;
  etaSeconds: number;
}

function Stat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${valueClassName ?? ""}`}>{value}</p>
    </div>
  );
}

const MODE_LABEL: Record<IntersectionState["mode"], string> = {
  NORMAL: "Normal",
  PRIORITY_PREPARING: "Activating",
  PRIORITY_ACTIVE: "Active",
  PRIORITY_CLEARING: "Cleared",
};

const RouteStatistics = ({ route, intersection, etaSeconds }: RouteStatisticsProps) => {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Route Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Total Distance" value={`${metersToKm(route.totalDistanceMeters).toFixed(1)} km`} />
          <Stat label="Est. Travel Time" value={secondsToClock(route.estimatedTimeSeconds)} />
          <Stat label="Intersection" value={intersection.name} />
          <Stat label="Ambulance Approach" value={intersection.ambulanceApproach} valueClassName="text-primary" />
          <Stat label="Emergency Priority" value={MODE_LABEL[intersection.mode]} valueClassName="text-amber-600" />
          <Stat label="Distance to Intersection" value={`${Math.max(0, Math.round(intersection.distanceMeters))} m`} />
          <Stat label="ETA" value={secondsToClock(etaSeconds)} valueClassName="text-primary" />
          <Stat label="Route Type" value={route.isFallback ? "Estimated" : "Optimized"} />
        </div>
      </CardContent>
    </Card>
  );
};

export default RouteStatistics;
