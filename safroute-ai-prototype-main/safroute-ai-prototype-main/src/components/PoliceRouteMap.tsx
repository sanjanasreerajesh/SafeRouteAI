import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteResult } from "@/lib/routeOptimizer";
import type { LocationData } from "@/lib/emergencyResponse";
import type { MapPoliceStation } from "@/lib/dynamicPolice";
import { formatEta } from "@/lib/routeOptimizer";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const accidentIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const policeIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const nearbyPoliceIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [22, 36],
  iconAnchor: [11, 36],
  popupAnchor: [1, -30],
  shadowSize: [36, 36],
});

export interface MapPoliceTarget {
  name: string;
  lat: number;
  lon: number;
  address?: string;
}

function FitRouteBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(L.latLngBounds(positions), { padding: [36, 36] });
    }
  }, [map, positions]);
  return null;
}

interface PoliceRouteMapProps {
  accidentLocation: LocationData;
  policeStation: MapPoliceTarget;
  route: RouteResult | null;
  loading: boolean;
  height?: number;
  nearbyStations?: MapPoliceStation[];
}

const PoliceRouteMap = ({
  accidentLocation,
  policeStation,
  route,
  loading,
  height = 300,
  nearbyStations = [],
}: PoliceRouteMapProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const polyline = useMemo<[number, number][]>(
    () =>
      route?.polyline ?? [
        [accidentLocation.lat, accidentLocation.lon],
        [policeStation.lat, policeStation.lon],
      ],
    [route?.polyline, accidentLocation, policeStation]
  );

  const otherStations = nearbyStations.filter((s) => s.name !== policeStation.name);
  const isOptimized = route && !route.isFallback;

  return (
    <div className="relative">
      <div
        className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md w-full bg-slate-100"
        style={{ height: `${height}px`, minHeight: "240px" }}
      >
        {mounted ? (
          <MapContainer
            key={`police-${accidentLocation.lat}-${policeStation.name}-${polyline.length}`}
            center={[accidentLocation.lat, accidentLocation.lon]}
            zoom={12}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitRouteBounds positions={polyline} />

            <Marker position={[accidentLocation.lat, accidentLocation.lon]} icon={accidentIcon}>
              <Popup>
                <strong>🚨 Accident</strong>
                <br />
                {accidentLocation.location}
              </Popup>
            </Marker>

            <Marker position={[policeStation.lat, policeStation.lon]} icon={policeIcon}>
              <Popup>
                <strong>🚔 {policeStation.name}</strong>
                <br />
                {policeStation.address && <>{policeStation.address}<br /></>}
                {route && <>ETA: {formatEta(route.etaMinutes)}</>}
              </Popup>
            </Marker>

            {otherStations.map((s) => (
              <Marker key={`${s.name}-${s.lat}`} position={[s.lat, s.lon]} icon={nearbyPoliceIcon}>
                <Popup>
                  <strong>{s.name}</strong>
                  <br />
                  {s.distanceKm != null && <>{s.distanceKm.toFixed(1)} km</>}
                </Popup>
              </Marker>
            ))}

            {isOptimized && (
              <Polyline positions={polyline} color="#c4b5fd" weight={10} opacity={0.5} />
            )}
            <Polyline
              positions={polyline}
              color={route?.isFallback ? "#64748b" : "#7c3aed"}
              weight={5}
              dashArray={route?.isFallback ? "10, 10" : undefined}
            />
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading map…
          </div>
        )}
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
          <p className="text-sm font-medium text-muted-foreground">Calculating police route…</p>
        </div>
      )}
    </div>
  );
};

export default PoliceRouteMap;
