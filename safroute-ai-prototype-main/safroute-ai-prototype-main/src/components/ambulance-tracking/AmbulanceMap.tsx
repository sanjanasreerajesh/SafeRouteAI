import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { Ambulance } from "@/types/ambulance";
import type { AmbulanceRoute } from "@/types/route";
import type { IntersectionState } from "@/types/traffic";
import TrafficSignalMarker from "@/components/ambulance-tracking/TrafficSignalMarker";

// Reuses the same default-icon fix already applied by the existing
// EmergencyRouteMap/PoliceRouteMap components — safe to repeat, Leaflet
// treats it as idempotent.
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
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/**
 * Custom vehicle shape (not an emoji/photo) so rotation always points the
 * "front" the right way — the polygon's tip is drawn pointing up (North,
 * 0deg) and the whole icon is rotated by the ambulance's real heading, so
 * it always faces its direction of travel. Sized up for presentation
 * visibility (44px vs. the earlier 30px).
 */
function buildAmbulanceIcon(headingDegrees: number) {
  const rounded = Math.round(headingDegrees / 5) * 5;
  const size = 44;
  return L.divIcon({
    className: "bg-transparent border-0",
    html: `
      <div style="width:${size}px;height:${size}px;transform:rotate(${rounded}deg);transform-origin:50% 50%;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.55));">
        <svg width="${size}" height="${size}" viewBox="0 0 30 30">
          <polygon points="15,1 25,26 15,20 5,26" fill="#ffffff" stroke="#dc2626" stroke-width="2"/>
          <rect x="12.5" y="12" width="5" height="9" fill="#dc2626"/>
          <rect x="10" y="15" width="10" height="3" fill="#dc2626"/>
        </svg>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitRouteBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
    }
  }, [map, positions]);
  return null;
}

function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timers = [100, 350, 600].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    return () => timers.forEach(clearTimeout);
  }, [map]);
  return null;
}

interface AmbulanceMapProps {
  route: AmbulanceRoute;
  ambulance: Ambulance | null;
  intersection: IntersectionState;
  height?: number;
}

const AmbulanceMap = ({ route, ambulance, intersection, height = 460 }: AmbulanceMapProps) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const headingDegrees = ambulance?.headingDegrees ?? null;
  // Only re-creates the divIcon when heading changes (not on every lat/lng
  // tick) — intentionally narrower than the full `ambulance` object.
  const ambulanceIcon = useMemo(
    () => (headingDegrees != null ? buildAmbulanceIcon(headingDegrees) : null),
    [headingDegrees]
  );

  return (
    <div
      className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md w-full bg-slate-100"
      style={{ height: `${height}px`, minHeight: "320px" }}
    >
      <style>{`
        @keyframes amb-signal-pulse {
          0% { transform: scale(0.7); opacity: 0.8; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes amb-red-led-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.15; }
        }
      `}</style>
      {mounted ? (
        <MapContainer
          key={route.id}
          center={route.accidentLocation}
          zoom={13}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRouteBounds positions={route.coordinates} />
          <MapResizeFix />

          <Marker position={route.accidentLocation} icon={accidentIcon}>
            <Popup>
              <strong>🚨 Accident</strong>
              <br />
              {route.accidentLocationName}
            </Popup>
          </Marker>

          <Marker position={route.hospitalLocation} icon={hospitalIcon}>
            <Popup>
              <strong>🏥 {route.hospitalName}</strong>
            </Popup>
          </Marker>

          {route.isFallback ? (
            <Polyline positions={route.coordinates} color="#64748b" weight={5} dashArray="10, 10" />
          ) : (
            <>
              <Polyline positions={route.coordinates} color="#60a5fa" weight={9} opacity={0.35} />
              <Polyline positions={route.coordinates} color="#2563eb" weight={4} />
            </>
          )}

          <TrafficSignalMarker intersection={intersection} />

          {ambulance && ambulanceIcon && (
            <Marker position={[ambulance.latitude, ambulance.longitude]} icon={ambulanceIcon} zIndexOffset={1000}>
              <Popup>
                <strong>🚑 {ambulance.id}</strong>
                <br />
                {Math.round(ambulance.speed)} km/h
                <br />
                {ambulance.journeyDirection === "HOSPITAL_TO_INCIDENT" ? "Hospital → Incident" : "Incident → Hospital"}
                {ambulance.patientOnBoard && (
                  <>
                    <br />
                    🩺 Patient on board
                  </>
                )}
              </Popup>
            </Marker>
          )}
        </MapContainer>
      ) : (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div>
      )}
    </div>
  );
};

export default AmbulanceMap;
