import { useMemo } from "react";
import { Navigation, Clock, Hospital, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getHospitalByName, type LocationData } from "@/lib/emergencyResponse";
import { useEmergencyRoute } from "@/hooks/useEmergencyRoute";
import { formatEta } from "@/lib/routeOptimizer";
import EmergencyRouteMap from "@/components/EmergencyRouteMap";

export interface RoutePanelAccident {
  id: string;
  location: string;
  lat: number;
  lng: number;
  assignedHospital: string;
}

interface OptimizedRoutePanelProps {
  accident: RoutePanelAccident;
}

const OptimizedRoutePanel = ({ accident }: OptimizedRoutePanelProps) => {
  const accidentLocation: LocationData = {
    location: accident.location,
    lat: accident.lat,
    lon: accident.lng,
  };

  const hospital = useMemo(
    () => getHospitalByName(accident.assignedHospital),
    [accident.assignedHospital]
  );

  const routeSource = { lat: accidentLocation.lat, lon: accidentLocation.lon };
  const routeDestination = hospital
    ? { lat: hospital.lat, lon: hospital.lon, name: hospital.name }
    : null;

  const { route, loading } = useEmergencyRoute(
    routeSource,
    routeDestination
  );

  if (!hospital) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">
        Hospital coordinates not found for &quot;{accident.assignedHospital}&quot;.
      </div>
    );
  }

  const hospitalForMap = {
    ...hospital,
    dist: route?.distanceKm ?? 0,
    score: 0,
    isClosestSuitable: false,
  };

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
          <Navigation className="h-4 w-4" />
          Optimized Emergency Route
        </span>
        <Badge variant="outline" className="gap-1 text-xs">
          <MapPin className="h-3 w-3 text-red-500" />
          {accidentLocation.location}
        </Badge>
        <Badge variant="outline" className="gap-1 text-xs">
          <Hospital className="h-3 w-3 text-green-600" />
          {hospital.name}
        </Badge>
        {route && (
          <>
            <Badge variant="secondary" className="gap-1 text-xs">
              {route.distanceKm.toFixed(1)} km
            </Badge>
            <Badge variant="secondary" className="gap-1 text-xs">
              <Clock className="h-3 w-3" />
              ETA {formatEta(route.etaMinutes)}
            </Badge>
            {route.isFallback ? (
              <Badge variant="outline" className="text-xs">Estimated</Badge>
            ) : (
              <Badge className="bg-blue-600 text-xs">Optimized</Badge>
            )}
          </>
        )}
      </div>

      <EmergencyRouteMap
        accidentLocation={accidentLocation}
        hospital={hospitalForMap}
        route={route}
        loading={loading}
        height={380}
        mapActive={true}
        showAmbulanceAnimation={!!route && route.polyline.length > 2 && !route.isFallback}
      />
    </div>
  );
};

export default OptimizedRoutePanel;
