import { useEffect, useMemo, useState } from "react";
import { Navigation, Clock, Hospital, MapPin, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type LocationData } from "@/lib/emergencyResponse";
import { useEmergencyRoute } from "@/hooks/useEmergencyRoute";
import { formatEta } from "@/lib/routeOptimizer";
import EmergencyRouteMap from "@/components/EmergencyRouteMap";
import {
  detectAccident,
  hospitalsForMap,
  routeFromDetectResponse,
  toApiSeverity,
  type DetectAccidentResponse,
} from "@/lib/dynamicEmergency";

export interface RoutePanelAccident {
  id: string;
  location: string;
  lat: number;
  lng: number;
  severity?: "Low" | "Medium" | "High" | "Critical";
  assignedHospital: string;
  assignedHospitalLat?: number;
  assignedHospitalLng?: number;
  assignedHospitalAddress?: string;
  hospitalMapsUrl?: string;
  isHospitalRegistered?: boolean;
  integrationMessage?: string;
  routeDistanceKm?: number;
  etaMinutes?: number;
  routePolyline?: [number, number][];
}

interface OptimizedRoutePanelProps {
  accident: RoutePanelAccident;
}

const OptimizedRoutePanel = ({ accident }: OptimizedRoutePanelProps) => {
  const [liveResponse, setLiveResponse] = useState<DetectAccidentResponse | null>(null);
  const [fetching, setFetching] = useState(false);

  const accidentLocation: LocationData = {
    location: accident.location,
    lat: accident.lat,
    lon: accident.lng,
  };

  const storedHasCoords =
    accident.assignedHospitalLat != null && accident.assignedHospitalLng != null;

  // Fetch hospital + route live when stored coordinates are missing
  useEffect(() => {
    if (storedHasCoords) return;

    let cancelled = false;
    setFetching(true);
    void detectAccident(
      accident.lat,
      accident.lng,
      toApiSeverity(accident.severity ?? "Medium"),
      accident.location
    ).then((res) => {
      if (!cancelled) {
        setLiveResponse(res);
        setFetching(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    accident.lat,
    accident.lng,
    accident.location,
    accident.severity,
    storedHasCoords,
  ]);

  const liveHospital = liveResponse?.nearestHospital;
  const hospitalLat = accident.assignedHospitalLat ?? liveHospital?.latitude;
  const hospitalLng = accident.assignedHospitalLng ?? liveHospital?.longitude;
  const hospitalName = liveHospital?.name ?? accident.assignedHospital;
  const hasCoords = hospitalLat != null && hospitalLng != null;

  const routeSource = { lat: accidentLocation.lat, lon: accidentLocation.lon };
  const routeDestination = hasCoords
    ? { lat: hospitalLat!, lon: hospitalLng!, name: hospitalName }
    : null;

  const { route: fetchedRoute, loading: routeLoading } = useEmergencyRoute(
    hasCoords && !accident.routePolyline?.length ? routeSource : null,
    hasCoords && !accident.routePolyline?.length ? routeDestination : null
  );

  const route = useMemo(() => {
    if (accident.routePolyline && accident.routePolyline.length >= 2) {
      return {
        hospitalName,
        distanceKm: accident.routeDistanceKm ?? 0,
        etaMinutes: accident.etaMinutes ?? 0,
        polyline: accident.routePolyline,
        isFallback: false,
      };
    }
    if (liveResponse) {
      return routeFromDetectResponse(liveResponse);
    }
    return fetchedRoute;
  }, [accident, liveResponse, fetchedRoute, hospitalName]);

  const loading = fetching || routeLoading;
  const mapHospitals = liveResponse
    ? hospitalsForMap(liveResponse, hospitalName)
    : [];

  if (!hasCoords && fetching) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-4 text-sm text-blue-800">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading hospital route…
      </div>
    );
  }

  if (!hasCoords) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">
        Hospital location not available for &quot;{accident.assignedHospital}&quot;.
      </div>
    );
  }

  const hospitalForMap = {
    name: hospitalName,
    lat: hospitalLat!,
    lon: hospitalLng!,
    dist: route?.distanceKm ?? accident.routeDistanceKm ?? 0,
    address: accident.assignedHospitalAddress ?? liveHospital?.address,
  };

  const mapsUrl = accident.hospitalMapsUrl ?? liveHospital?.maps_url;
  const registeredIntegrationMsg =
    (accident.isHospitalRegistered ?? liveResponse?.integration?.registered) &&
    (accident.integrationMessage ?? liveResponse?.integration?.message);

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
          {hospitalName}
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

      {registeredIntegrationMsg && (
        <p className="text-xs rounded-md px-3 py-2 bg-green-100 dark:bg-green-950/30 text-green-800">
          {registeredIntegrationMsg}
        </p>
      )}

      {mapsUrl && (
        <Button variant="outline" size="sm" asChild className="gap-1.5 h-7 text-xs">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            Navigate via Google Maps
          </a>
        </Button>
      )}

      <EmergencyRouteMap
        accidentLocation={accidentLocation}
        hospital={hospitalForMap}
        route={route}
        loading={loading}
        height={380}
        mapActive={true}
        nearbyHospitals={mapHospitals}
        showAmbulanceAnimation={!!route && route.polyline.length > 2 && !route.isFallback}
      />
    </div>
  );
};

export default OptimizedRoutePanel;
