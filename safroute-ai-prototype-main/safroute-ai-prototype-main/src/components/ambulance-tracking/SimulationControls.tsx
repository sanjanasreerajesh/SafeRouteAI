import { FastForward, Gauge, Pause, Play, RotateCcw, SatelliteDish } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TRAFFIC_CONFIG } from "@/config/trafficConfig";
import type { JourneyDirection } from "@/types/traffic";

interface SimulationControlsProps {
  running: boolean;
  paused: boolean;
  completed: boolean;
  gpsLost: boolean;
  speedMultiplier: number;
  disabled: boolean;
  journeyDirection: JourneyDirection;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSetSpeed: (multiplier: number) => void;
  onToggleGpsLoss: () => void;
  onSkipToIncident: () => void;
}

const SimulationControls = ({
  running,
  paused,
  completed,
  gpsLost,
  speedMultiplier,
  disabled,
  journeyDirection,
  onStart,
  onPause,
  onResume,
  onReset,
  onSetSpeed,
  onToggleGpsLoss,
  onSkipToIncident,
}: SimulationControlsProps) => {
  const isActivelyRunning = running && !paused;
  const controlBtn = "h-11 md:h-12 px-5 text-sm md:text-base gap-2";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Simulation / Demo Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {!running || completed ? (
            <Button type="button" className={controlBtn} disabled={disabled} onClick={onStart}>
              <Play className="h-5 w-5" />
              Start Ambulance Simulation
            </Button>
          ) : isActivelyRunning ? (
            <Button type="button" variant="outline" className={controlBtn} onClick={onPause}>
              <Pause className="h-5 w-5" />
              Pause
            </Button>
          ) : (
            <Button type="button" className={controlBtn} onClick={onResume}>
              <Play className="h-5 w-5" />
              Resume
            </Button>
          )}

          <Button type="button" variant="outline" className={controlBtn} onClick={onReset}>
            <RotateCcw className="h-5 w-5" />
            Reset
          </Button>

          <Button
            type="button"
            variant="outline"
            className={`${controlBtn} ${gpsLost ? "text-red-600 border-red-300" : ""}`}
            onClick={onToggleGpsLoss}
          >
            <SatelliteDish className="h-5 w-5" />
            {gpsLost ? "Restore GPS" : "Simulate GPS Loss"}
          </Button>

          {running && !completed && journeyDirection === "HOSPITAL_TO_INCIDENT" && (
            <Button
              type="button"
              variant="outline"
              className={`${controlBtn} text-muted-foreground`}
              onClick={onSkipToIncident}
              title="Testing shortcut — jump straight to the incident"
            >
              <FastForward className="h-5 w-5" />
              Skip to Incident
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Gauge className="h-4 w-4" />
            Speed
          </span>
          {TRAFFIC_CONFIG.speedMultipliers.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onSetSpeed(m)}
              className={`h-10 px-4 rounded-md text-sm font-semibold border transition-colors ${
                speedMultiplier === m
                  ? "bg-primary border-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}x
            </button>
          ))}
        </div>

        {gpsLost && (
          <p className="text-sm font-semibold text-red-600 flex items-center gap-2 rounded-md bg-red-500/10 border border-red-300 px-3 py-2">
            <SatelliteDish className="h-4 w-4" />
            GPS SIGNAL LOST — automatic signal progression paused
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default SimulationControls;
