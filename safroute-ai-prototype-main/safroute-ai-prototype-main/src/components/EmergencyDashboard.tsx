import React, { useMemo } from "react";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Hospital, MapPin, Activity, Clock, Navigation } from "lucide-react";
import {
  getLocationForVideo,
  recommendHospital,
} from "@/lib/emergencyResponse";
import { useEmergencyRoute } from "@/hooks/useEmergencyRoute";
import { formatEta } from "@/lib/routeOptimizer";
import EmergencyRouteMap from "@/components/EmergencyRouteMap";

interface EmergencyDashboardProps {
  videoFilename: string;
  severity: "High" | "Medium" | "Low";
}

const EmergencyDashboard: React.FC<EmergencyDashboardProps> = ({ videoFilename, severity }) => {
  const accidentLocation = getLocationForVideo(videoFilename);

  const bestHospital = useMemo(() => {
    if (!accidentLocation) return null;
    return recommendHospital(accidentLocation.lat, accidentLocation.lon);
  }, [accidentLocation]);

  const routeSource = accidentLocation
    ? { lat: accidentLocation.lat, lon: accidentLocation.lon }
    : null;

  const routeDestination = bestHospital
    ? { lat: bestHospital.lat, lon: bestHospital.lon, name: bestHospital.name }
    : null;

  const { route, loading: routeLoading } = useEmergencyRoute(
    routeSource,
    routeDestination
  );

  if (!accidentLocation || !bestHospital) {
    return (
      <Card className="border-amber-500 shadow-lg animate-fade-in">
        <CardHeader className="bg-amber-50 dark:bg-amber-950/20">
          <CardTitle className="text-amber-700 flex items-center gap-2 text-xl">
            <AlertCircle className="h-6 w-6" />
            Accident Detected — Location Unmapped
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Upload one of the predefined Chennai test videos (<code className="text-sm">video1.mp4</code> – <code className="text-sm">video4.mp4</code>) to enable location mapping, hospital recommendation, and route visualization.
          </p>
        </CardContent>
      </Card>
    );
  }

  const severityVariant =
    severity === "High" ? "destructive" : severity === "Medium" ? "default" : "secondary";
  const severityClass =
    severity === "Medium" ? "bg-amber-500 hover:bg-amber-500 text-white border-transparent" : "";

  return (
    <Card className="border-red-500 shadow-lg animate-fade-in overflow-hidden">
      <CardHeader className="bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900 py-4">
        <CardTitle className="text-red-600 flex items-center gap-2 text-xl">
          <AlertCircle className="h-6 w-6 animate-pulse" />
          🚨 Accident Detected
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <div className="p-4 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <div className="grid grid-cols-1 gap-4">
            {/* Accident Details */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-500" />
                Location
              </h3>
              <p className="text-lg font-medium text-foreground">{accidentLocation.location}</p>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-sm text-muted-foreground mb-1">Severity</p>
                <Badge variant={severityVariant} className={`text-sm px-3 py-1 ${severityClass}`}>
                  {severity}
                </Badge>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-sm text-muted-foreground mb-2">Coordinates</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-md p-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Latitude</p>
                    <p className="font-mono font-semibold">{accidentLocation.lat.toFixed(4)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-md p-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Longitude</p>
                    <p className="font-mono font-semibold">{accidentLocation.lon.toFixed(4)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hospital Recommendation (decision engine — auto-selected) */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-green-200 dark:border-green-900/50 shadow-sm space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-green-700 dark:text-green-500">
                <Hospital className="h-5 w-5" />
                Recommended Hospital
              </h3>
              <p className="text-lg font-medium">{bestHospital.name}</p>

              {route && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-green-100 dark:border-green-900/30">
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Navigation className="h-3 w-3" /> Driving Distance
                    </p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">
                      {route.distanceKm.toFixed(1)} km
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Clock className="h-3 w-3" /> ETA
                    </p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">
                      {formatEta(route.etaMinutes)}
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-green-100 dark:border-green-900/30">
                <p className="font-medium mb-2 text-sm text-muted-foreground">Reason</p>
                <ul className="space-y-1.5 text-slate-700 dark:text-slate-300">
                  {bestHospital.isClosestSuitable && (
                    <li className="flex items-center gap-2">✓ Closest suitable hospital</li>
                  )}
                  {bestHospital.icu && <li className="flex items-center gap-2">✓ ICU available</li>}
                  {bestHospital.trauma && <li className="flex items-center gap-2">✓ Trauma care available</li>}
                  <li className="flex items-center gap-2 pt-2 border-t text-sm">
                    <Activity className="h-4 w-4 text-blue-500 shrink-0" />
                    Emergency Response Score:{" "}
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {bestHospital.score.toFixed(0)}/100
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Route Optimization — map display */}
          <div className="space-y-2">
            <h3 className="font-semibold text-base flex items-center gap-2 text-foreground">
              <MapPin className="h-4 w-4 text-red-500" />
              Emergency Route
              {route && !route.isFallback && (
                <Badge variant="secondary" className="text-xs font-normal">Optimized</Badge>
              )}
              {route?.isFallback && (
                <Badge variant="outline" className="text-xs font-normal">Estimated</Badge>
              )}
            </h3>


            <EmergencyRouteMap
              accidentLocation={accidentLocation}
              hospital={bestHospital}
              route={route}
              loading={routeLoading}
            />

            {route && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900/50 rounded-lg px-4 py-3 border">
                <span className="flex items-center gap-1">
                  <Hospital className="h-4 w-4" />
                  <strong className="text-foreground">{route.hospitalName}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Navigation className="h-4 w-4" />
                  {route.distanceKm.toFixed(1)} km
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  ETA {formatEta(route.etaMinutes)}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmergencyDashboard;
