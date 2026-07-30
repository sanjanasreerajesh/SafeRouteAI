import { useEffect, useMemo, useState } from "react";
import { Shield, Navigation, Clock, MapPin, Phone, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type LocationData } from "@/lib/emergencyResponse";
import { formatEta } from "@/lib/routeOptimizer";
import PoliceRouteMap from "@/components/PoliceRouteMap";
import {
  fetchNearestPolice,
  policeStationsForMap,
  routeFromPoliceResponse,
  toPoliceApiSeverity,
  type NearestPoliceResponse,
} from "@/lib/dynamicPolice";

export interface PoliceRoutePanelAccident {
  id: string;
  location: string;
  lat: number;
  lng: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  assignedPoliceStation?: string;
  assignedPoliceLat?: number;
  assignedPoliceLng?: number;
  assignedPoliceAddress?: string;
  assignedPolicePhone?: string | null;
  policeMapsUrl?: string;
  isPoliceRegistered?: boolean;
  policeIntegrationMessage?: string;
  policeRouteDistanceKm?: number;
  policeEtaMinutes?: number;
  policeRoutePolyline?: [number, number][];
}

interface PoliceRoutePanelProps {
  accident: PoliceRoutePanelAccident;
}

const SELECTION_LABELS: Record<string, string> = {
  nearest_traffic_police: "Nearest traffic / highway police",
  nearest_police_high_severity: "Nearest police station (high severity)",
  nearest_police_station: "Nearest police station",
};

const PoliceRoutePanel = ({ accident }: PoliceRoutePanelProps) => {
  const [response, setResponse] = useState<NearestPoliceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const hasStoredCoords =
    accident.assignedPoliceLat != null && accident.assignedPoliceLng != null;

  useEffect(() => {
    if (hasStoredCoords && accident.policeRoutePolyline) return;

    let cancelled = false;
    setLoading(true);
    void fetchNearestPolice(
      accident.lat,
      accident.lng,
      toPoliceApiSeverity(accident.severity),
      accident.location
    ).then((res) => {
      if (!cancelled) {
        setResponse(res);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    accident.lat,
    accident.lng,
    accident.severity,
    accident.location,
    hasStoredCoords,
    accident.policeRoutePolyline,
  ]);

  const accidentLocation: LocationData = {
    location: accident.location,
    lat: accident.lat,
    lon: accident.lng,
  };

  const nearest = response?.nearestPoliceStation;
  const stationName = nearest?.name ?? accident.assignedPoliceStation ?? "Police Station";
  const stationLat = nearest?.latitude ?? accident.assignedPoliceLat;
  const stationLng = nearest?.longitude ?? accident.assignedPoliceLng;

  const route = useMemo(() => {
    if (accident.policeRoutePolyline && accident.policeRoutePolyline.length >= 2) {
      return {
        hospitalName: stationName,
        distanceKm: accident.policeRouteDistanceKm ?? 0,
        etaMinutes: accident.policeEtaMinutes ?? 0,
        polyline: accident.policeRoutePolyline,
        isFallback: false,
      };
    }
    return response ? routeFromPoliceResponse(response) : null;
  }, [accident, response, stationName]);

  const mapStations = response ? policeStationsForMap(response, stationName) : [];

  if (stationLat == null || stationLng == null) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800">
        {loading ? "Searching nearby police stations…" : "Police station location not available."}
      </div>
    );
  }

  const integrationMsg =
    response?.integration?.message ?? accident.policeIntegrationMessage;
  const isRegistered =
    response?.integration?.registered ?? accident.isPoliceRegistered ?? false;
  const mapsUrl = nearest?.maps_url ?? accident.policeMapsUrl;

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
          <Shield className="h-4 w-4" />
          Nearest Police Station
        </span>
        <Badge variant="outline" className="text-xs">{stationName}</Badge>
        {route && (
          <>
            <Badge variant="secondary" className="text-xs">
              {route.distanceKm.toFixed(1)} km
            </Badge>
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              ETA {formatEta(route.etaMinutes)}
            </Badge>
          </>
        )}
      </div>

      {(nearest?.address ?? accident.assignedPoliceAddress) && (
        <p className="text-sm text-muted-foreground flex items-start gap-1.5">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {nearest?.address ?? accident.assignedPoliceAddress}
        </p>
      )}

      {(nearest?.phone ?? accident.assignedPolicePhone) && (
        <p className="text-sm flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          <a
            href={`tel:${nearest?.phone ?? accident.assignedPolicePhone}`}
            className="text-blue-600 hover:underline"
          >
            {nearest?.phone ?? accident.assignedPolicePhone}
          </a>
        </p>
      )}

      {(nearest?.selection_reason ?? accident.policeSelectionReason) && (
        <p className="text-xs text-muted-foreground">
          Selection:{" "}
          {SELECTION_LABELS[nearest?.selection_reason ?? accident.policeSelectionReason ?? ""] ??
            nearest?.selection_reason ??
            accident.policeSelectionReason}
        </p>
      )}

      {integrationMsg && (
        <p
          className={`text-xs rounded-md px-3 py-2 ${
            isRegistered
              ? "bg-green-100 dark:bg-green-950/30 text-green-800"
              : "bg-amber-100 dark:bg-amber-950/30 text-amber-800"
          }`}
        >
          {integrationMsg}
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

      {response && response.topPoliceStations.length > 1 && (
        <ul className="text-xs space-y-1 max-h-24 overflow-y-auto border rounded-md p-2 bg-white/50 dark:bg-slate-900/50">
          {response.topPoliceStations.map((s) => (
            <li key={`${s.place_id ?? s.name}`} className={s.name === stationName ? "font-semibold text-violet-700" : ""}>
              {s.name} — {(s.route_distance_km ?? s.distance_km).toFixed(1)} km
              {s.eta_minutes != null && ` · ${formatEta(s.eta_minutes)}`}
            </li>
          ))}
        </ul>
      )}

      <PoliceRouteMap
        accidentLocation={accidentLocation}
        policeStation={{
          name: stationName,
          lat: stationLat,
          lon: stationLng,
          address: nearest?.address ?? accident.assignedPoliceAddress,
        }}
        route={route}
        loading={loading}
        height={360}
        nearbyStations={mapStations}
      />
    </div>
  );
};

export default PoliceRoutePanel;
