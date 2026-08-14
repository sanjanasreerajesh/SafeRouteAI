import { useMemo } from "react";
import { AlertTriangle, Loader2, Radio } from "lucide-react";

import { useAmbulanceSimulation } from "@/hooks/useAmbulanceSimulation";
import { AMBULANCE_STATUS_LABELS } from "@/types/ambulance";
import { DEMO_ACCIDENT } from "@/services/ambulanceService";

import AmbulanceMap from "@/components/ambulance-tracking/AmbulanceMap";
import EmergencySummary from "@/components/ambulance-tracking/EmergencySummary";
import JourneyStatusBanner from "@/components/ambulance-tracking/JourneyStatusBanner";
import AmbulanceStatusCard from "@/components/ambulance-tracking/AmbulanceStatusCard";
import NextSignalPanel from "@/components/ambulance-tracking/NextSignalPanel";
import SignalSequence from "@/components/ambulance-tracking/SignalSequence";
import PrototypeTrafficLight from "@/components/ambulance-tracking/PrototypeTrafficLight";
import ESP32StatusCard from "@/components/ambulance-tracking/ESP32StatusCard";
import CommandLog from "@/components/ambulance-tracking/CommandLog";
import EmergencyTimeline from "@/components/ambulance-tracking/EmergencyTimeline";
import RouteStatistics from "@/components/ambulance-tracking/RouteStatistics";
import SimulationControls from "@/components/ambulance-tracking/SimulationControls";

const AmbulanceTrackingPage = () => {
  const sim = useAmbulanceSimulation();
  const { route, intersection, ambulance, esp32, commandLog, timeline, loading, error, journeyDirection } = sim;
  const { running, paused, completed, gpsLost, speedMultiplier, controls } = sim;

  const summary = useMemo(() => {
    if (!ambulance) return null;
    return {
      accidentId: DEMO_ACCIDENT.id,
      severity: DEMO_ACCIDENT.severity,
      victims: DEMO_ACCIDENT.victims,
      accidentLocationName: DEMO_ACCIDENT.name,
      hospitalName: route?.hospitalName ?? "—",
      ambulanceId: ambulance.id,
      ambulanceStatusLabel: gpsLost ? "GPS SIGNAL LOST" : AMBULANCE_STATUS_LABELS[ambulance.status],
      etaSeconds: ambulance.etaSeconds,
      journeyDirection,
    };
  }, [ambulance, route, gpsLost, journeyDirection]);

  // Wider than the standard `.container` (capped at 1400px) — this page is a
  // map-dominant operations dashboard that benefits from the extra width;
  // every other page keeps its existing container untouched.
  const PAGE_WIDTH = "mx-auto w-[95%] max-w-[1700px]";

  if (loading) {
    return (
      <div className={`${PAGE_WIDTH} p-4 lg:p-6`}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground text-base">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading ambulance route…
          </div>
        </div>
      </div>
    );
  }

  if (error || !route || !ambulance || !intersection) {
    return (
      <div className={`${PAGE_WIDTH} p-4 lg:p-6`}>
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="flex items-center gap-2 text-destructive text-base max-w-md text-center px-4">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error ?? "Ambulance route unavailable."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${PAGE_WIDTH} p-4 lg:p-6 space-y-7`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Radio className="h-8 w-8 text-primary" />
            Ambulance Tracking &amp; Smart Traffic Priority
          </h1>
          <p className="text-muted-foreground mt-1 text-base">
            Real-time emergency vehicle coordination and intelligent traffic signal management
          </p>
        </div>
        {route.isFallback && (
          <span className="text-sm rounded-full border border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-1.5">
            Estimated route (routing service unreachable) — demo unaffected
          </span>
        )}
      </div>

      {summary && <EmergencySummary data={summary} />}

      <JourneyStatusBanner
        journeyDirection={journeyDirection}
        status={ambulance.status}
        patientOnBoard={ambulance.patientOnBoard}
        gpsLost={gpsLost}
      />

      <SimulationControls
        running={running}
        paused={paused}
        completed={completed}
        gpsLost={gpsLost}
        speedMultiplier={speedMultiplier}
        disabled={!route}
        journeyDirection={journeyDirection}
        onStart={controls.start}
        onPause={controls.pause}
        onResume={controls.resume}
        onReset={controls.reset}
        onSetSpeed={controls.setSpeedMultiplier}
        onToggleGpsLoss={controls.toggleGpsLoss}
        onSkipToIncident={controls.skipToIncident}
      />

      {/* Desktop: left info / center map / right signal+hardware. Stacks on mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-5 items-start">
        <div className="space-y-5 order-2 lg:order-1">
          <AmbulanceStatusCard
            ambulance={ambulance}
            currentSignalLabel={completed ? "Arrived" : `${intersection.name} — ${intersection.ambulanceApproach}`}
            gpsLost={gpsLost}
          />
          <PrototypeTrafficLight intersection={intersection} />
        </div>

        <div className="order-1 lg:order-2">
          <AmbulanceMap route={route} ambulance={ambulance} intersection={intersection} height={580} />
        </div>

        <div className="space-y-5 order-3">
          <NextSignalPanel intersection={intersection} />
          <ESP32StatusCard status={esp32} onToggleConnection={controls.toggleEsp32Connection} />
          <CommandLog entries={commandLog} />
        </div>
      </div>

      {/* Bottom row: sequence + timeline + route stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <SignalSequence intersection={intersection} journeyDirection={journeyDirection} />
        <EmergencyTimeline steps={timeline} />
        <RouteStatistics route={route} intersection={intersection} etaSeconds={ambulance.etaSeconds} />
      </div>
    </div>
  );
};

export default AmbulanceTrackingPage;
