import { ArrowRight, Navigation2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { AmbulanceStatus } from "@/types/ambulance";
import { AMBULANCE_STATUS_LABELS } from "@/types/ambulance";
import type { JourneyDirection } from "@/types/traffic";

interface JourneyStatusBannerProps {
  journeyDirection: JourneyDirection;
  status: AmbulanceStatus;
  patientOnBoard: boolean;
  gpsLost: boolean;
}

const JourneyStatusBanner = ({ journeyDirection, status, patientOnBoard, gpsLost }: JourneyStatusBannerProps) => {
  const outbound = journeyDirection === "HOSPITAL_TO_INCIDENT";

  return (
    <Card className={outbound ? "border-l-4 border-l-primary" : "border-l-4 border-l-green-500"}>
      <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Navigation2 className="h-4 w-4" />
            Current Journey
          </p>
          <p className="text-2xl font-bold flex items-center gap-3 mt-1">
            {outbound ? "🏥 Hospital" : "📍 Incident"}
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            {outbound ? "📍 Incident" : "🏥 Hospital"}
          </p>
        </div>

        <div className="text-right">
          <p className="text-sm text-muted-foreground uppercase">Status</p>
          <p className={`text-xl font-bold ${gpsLost ? "text-red-600" : outbound ? "text-primary" : "text-green-600"}`}>
            {gpsLost ? "GPS SIGNAL LOST" : AMBULANCE_STATUS_LABELS[status].toUpperCase()}
          </p>
          {patientOnBoard && <p className="text-sm text-green-600 font-semibold mt-0.5">🩺 Patient on board</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default JourneyStatusBanner;
