import type { ReactNode } from "react";
import { Ambulance as AmbulanceIcon, Gauge, MapPinned, Navigation, Radio, Timer } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Ambulance } from "@/types/ambulance";
import { AMBULANCE_STATUS_LABELS } from "@/types/ambulance";
import { metersToKm, secondsToClock } from "@/services/simulationService";

interface AmbulanceStatusCardProps {
  ambulance: Ambulance | null;
  currentSignalLabel: string | null;
  gpsLost: boolean;
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-base font-semibold">{value}</span>
    </div>
  );
}

const AmbulanceStatusCard = ({ ambulance, currentSignalLabel, gpsLost }: AmbulanceStatusCardProps) => {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AmbulanceIcon className="h-5 w-5 text-primary" />
          Ambulance Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!ambulance ? (
          <p className="text-sm text-muted-foreground">Loading ambulance data…</p>
        ) : (
          <div>
            <Row icon={<AmbulanceIcon className="h-4 w-4" />} label="Ambulance ID" value={ambulance.id} />
            <Row icon={<Gauge className="h-4 w-4" />} label="Current Speed" value={`${Math.round(ambulance.speed)} km/h`} />
            <Row
              icon={<MapPinned className="h-4 w-4" />}
              label="Current Location"
              value={
                <span className="font-mono text-sm">
                  {ambulance.latitude.toFixed(4)}, {ambulance.longitude.toFixed(4)}
                </span>
              }
            />
            <Row
              icon={<Navigation className="h-4 w-4" />}
              label="Remaining Distance"
              value={`${metersToKm(ambulance.distanceRemainingMeters).toFixed(2)} km`}
            />
            <Row icon={<Timer className="h-4 w-4" />} label="ETA" value={secondsToClock(ambulance.etaSeconds)} />
            <Row icon={<Radio className="h-4 w-4" />} label="Current Signal" value={currentSignalLabel ?? "—"} />
            <Row
              icon={<AmbulanceIcon className="h-4 w-4" />}
              label="Status"
              value={
                <span className={`text-lg ${gpsLost ? "text-red-600" : "text-primary"}`}>
                  {gpsLost ? "GPS SIGNAL LOST" : AMBULANCE_STATUS_LABELS[ambulance.status]}
                </span>
              }
            />
            <Row
              icon={<AmbulanceIcon className="h-4 w-4" />}
              label="Patient"
              value={
                <span className={ambulance.patientOnBoard ? "text-green-600" : "text-muted-foreground"}>
                  {ambulance.patientOnBoard ? "On Board" : "Not Picked Up"}
                </span>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AmbulanceStatusCard;
