import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteResult } from "@/lib/routeOptimizer";
import type { LocationData } from "@/lib/emergencyResponse";
import type { MapHospital } from "@/lib/dynamicEmergency";
import { formatEta } from "@/lib/routeOptimizer";

// Fix Leaflet default icon paths in bundled apps
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

const hospitalIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const nearbyHospitalIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [22, 36],
  iconAnchor: [11, 36],
  popupAnchor: [1, -30],
  shadowSize: [36, 36],
});

const ambulanceIcon = L.divIcon({
  html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">🚑</div>',
  className: "bg-transparent border-0",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export interface MapHospitalTarget {
  name: string;
  lat: number;
  lon: number;
  dist?: number;
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

/** Fix Leaflet map sizing inside modals / hidden containers */
function MapResizeFix({ active }: { active?: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (active === false) return;
    const timers = [100, 350, 600].map((ms) =>
      setTimeout(() => map.invalidateSize(), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [map, active]);

  return null;
}

/** Animates an ambulance marker along the route polyline */
function AmbulanceAnimator({ polyline }: { polyline: [number, number][] }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (polyline.length < 2) return;

    const marker = L.marker(polyline[0], { icon: ambulanceIcon, zIndexOffset: 1000 }).addTo(map);
    markerRef.current = marker;

    let index = 0;
    const step = Math.max(1, Math.floor(polyline.length / 120));
    const interval = setInterval(() => {
      index = (index + step) % polyline.length;
      marker.setLatLng(polyline[index]);
    }, 80);

    return () => {
      clearInterval(interval);
      map.removeLayer(marker);
    };
  }, [map, polyline]);

  return null;
}

interface EmergencyRouteMapProps {
  accidentLocation: LocationData;
  hospital: MapHospitalTarget;
  route: RouteResult | null;
  loading: boolean;
  height?: number;
  showAmbulanceAnimation?: boolean;
  mapActive?: boolean;
  /** Additional nearby hospitals to show as markers */
  nearbyHospitals?: MapHospital[];
}

const EmergencyRouteMap = ({
  accidentLocation,
  hospital,
  route,
  loading,
  height = 300,
  showAmbulanceAnimation = false,
  mapActive = true,
  nearbyHospitals = [],
}: EmergencyRouteMapProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const polyline = useMemo<[number, number][]>(
    () =>
      route?.polyline ?? [
        [accidentLocation.lat, accidentLocation.lon],
        [hospital.lat, hospital.lon],
      ],
    [route?.polyline, accidentLocation.lat, accidentLocation.lon, hospital.lat, hospital.lon]
  );

  const drivingDistance = route?.distanceKm;
  const eta = route?.etaMinutes;
  const isOptimized = route && !route.isFallback;

  const otherHospitals = nearbyHospitals.filter((h) => h.name !== hospital.name);

  return (
    <div className="relative">
      <div
        className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md w-full bg-slate-100"
        style={{ height: `${height}px`, minHeight: "240px" }}
      >
        {mounted ? (
        <MapContainer
          key={`${accidentLocation.lat}-${accidentLocation.lon}-${hospital.name}-${polyline.length}-${otherHospitals.length}`}
          center={[accidentLocation.lat, accidentLocation.lon]}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRouteBounds positions={polyline} />
          <MapResizeFix active={mapActive} />

          {/* Accident marker */}
          <Marker position={[accidentLocation.lat, accidentLocation.lon]} icon={accidentIcon}>
            <Popup>
              <strong>🚨 Accident Location</strong>
              <br />
              {accidentLocation.location}
            </Popup>
          </Marker>

          {/* Selected hospital marker */}
          <Marker position={[hospital.lat, hospital.lon]} icon={hospitalIcon}>
            <Popup>
              <strong>🏥 {hospital.name}</strong>
              <br />
              {hospital.address && <>{hospital.address}<br /></>}
              {drivingDistance != null && <>Distance: {drivingDistance.toFixed(1)} km<br /></>}
              {eta != null && <>ETA: {formatEta(eta)}</>}
            </Popup>
          </Marker>

          {/* Other nearby hospitals */}
          {otherHospitals.map((h) => (
            <Marker
              key={`${h.name}-${h.lat}`}
              position={[h.lat, h.lon]}
              icon={nearbyHospitalIcon}
            >
              <Popup>
                <strong>{h.name}</strong>
                <br />
                {h.distanceKm != null && <>{h.distanceKm.toFixed(1)} km<br /></>}
                {h.etaMinutes != null && <>ETA: {formatEta(h.etaMinutes)}</>}
              </Popup>
            </Marker>
          ))}

          {/* Route polyline */}
          {isOptimized && (
            <Polyline positions={polyline} color="#93c5fd" weight={10} opacity={0.5} />
          )}
          <Polyline
            positions={polyline}
            color={route?.isFallback ? "#64748b" : "#2563eb"}
            weight={5}
            dashArray={route?.isFallback ? "10, 10" : undefined}
          />
          {showAmbulanceAnimation && <AmbulanceAnimator polyline={polyline} />}
        </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading map…
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
          <p className="text-sm font-medium text-muted-foreground">Calculating emergency route…</p>
        </div>
      )}
    </div>
  );
};

export default EmergencyRouteMap;
