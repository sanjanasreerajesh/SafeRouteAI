import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import { ALL_DIRECTIONS } from "@/types/traffic";
import type { IntersectionState } from "@/types/traffic";

const SIGNAL_COLORS: Record<string, string> = {
  RED: "#ef4444",
  YELLOW: "#eab308",
  GREEN: "#22c55e",
};

const MODE_LABEL: Record<IntersectionState["mode"], string> = {
  NORMAL: "Normal Operation",
  PRIORITY_PREPARING: "Emergency Priority Activating",
  PRIORITY_ACTIVE: "Emergency Priority Active",
  PRIORITY_CLEARING: "Emergency Priority Cleared",
};

/**
 * Marker for the ONE four-way intersection. Color reflects the ambulance's
 * own approach light (its light is what matters for priority); pulses while
 * emergency priority is engaging or active.
 */
function buildIntersectionIcon(intersection: IntersectionState) {
  const color = SIGNAL_COLORS[intersection.directions[intersection.ambulanceApproach]] ?? "#64748b";
  const isPriority = intersection.mode === "PRIORITY_PREPARING" || intersection.mode === "PRIORITY_ACTIVE";
  const pulse = isPriority
    ? `<span style="position:absolute;inset:-7px;border-radius:9999px;border:2px solid ${color};opacity:0.6;animation:amb-signal-pulse 1.4s ease-out infinite"></span>`
    : "";
  return L.divIcon({
    className: "bg-transparent border-0",
    html: `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
        ${pulse}
        <div style="width:20px;height:20px;border-radius:6px;background:#0f172a;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px rgba(0,0,0,0.5);">
          <div style="width:10px;height:10px;border-radius:9999px;background:${color};box-shadow:0 0 6px ${color};"></div>
        </div>
      </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

interface IntersectionMarkerProps {
  intersection: IntersectionState;
}

const TrafficSignalMarker = ({ intersection }: IntersectionMarkerProps) => (
  <Marker position={[intersection.latitude, intersection.longitude]} icon={buildIntersectionIcon(intersection)}>
    <Popup>
      <strong>🚦 {intersection.name}</strong>
      <br />
      {MODE_LABEL[intersection.mode]}
      <br />
      Ambulance approach: {intersection.ambulanceApproach}
      <br />
      {ALL_DIRECTIONS.map((d) => `${d}: ${intersection.directions[d]}`).join(" · ")}
    </Popup>
  </Marker>
);

export default TrafficSignalMarker;
