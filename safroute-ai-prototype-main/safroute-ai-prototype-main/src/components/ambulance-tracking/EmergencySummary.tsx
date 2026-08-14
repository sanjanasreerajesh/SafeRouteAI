import type { ReactNode } from "react";
import { AlertTriangle, Ambulance, Hospital, MapPin, Timer, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { EmergencySummaryData } from "@/types/route";
import { secondsToClock } from "@/services/simulationService";

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-500 text-black",
  LOW: "bg-green-500 text-white",
};

function SummaryTile({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="min-h-[96px]">
      <CardContent className="p-5 h-full flex items-center gap-3">
        <div className="text-muted-foreground shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold truncate ${valueClassName ?? ""}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface EmergencySummaryProps {
  data: EmergencySummaryData;
}

const EmergencySummary = ({ data }: EmergencySummaryProps) => {
  const severityClass = SEVERITY_STYLES[data.severity] ?? SEVERITY_STYLES.MEDIUM;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
      <SummaryTile icon={<AlertTriangle className="h-6 w-6" />} label="Accident ID" value={data.accidentId} />
      <SummaryTile
        icon={<AlertTriangle className="h-6 w-6" />}
        label="Severity"
        value={<span className={`inline-block rounded px-3 py-1 text-sm font-bold ${severityClass}`}>{data.severity}</span>}
      />
      <SummaryTile icon={<Users className="h-6 w-6" />} label="Victims" value={data.victims} />
      <SummaryTile icon={<MapPin className="h-6 w-6" />} label="Location" value={data.accidentLocationName} />
      <SummaryTile icon={<Hospital className="h-6 w-6" />} label="Hospital" value={data.hospitalName} />
      <SummaryTile icon={<Ambulance className="h-6 w-6" />} label="Ambulance" value={data.ambulanceId} />
      <SummaryTile
        icon={<Ambulance className="h-6 w-6" />}
        label="Status"
        value={data.ambulanceStatusLabel}
        valueClassName="text-primary text-xl"
      />
      <SummaryTile
        icon={<Timer className="h-6 w-6" />}
        label="ETA"
        value={secondsToClock(data.etaSeconds)}
        valueClassName="font-mono text-green-600 text-xl"
      />
    </div>
  );
};

export default EmergencySummary;
