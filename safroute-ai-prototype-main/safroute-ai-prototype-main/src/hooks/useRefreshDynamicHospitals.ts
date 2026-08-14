import { useEffect, useRef } from "react";
import {
  alertNeedsHospitalRefresh,
  updateAccidentAlert,
  type AccidentAlert,
} from "@/lib/accidentAlerts";
import { detectAccident, toApiSeverity } from "@/lib/dynamicEmergency";

/**
 * Re-resolve hospital assignment for legacy alerts that still use static Chennai names.
 * Runs once per alert when the dashboard loads.
 */
export function useRefreshDynamicHospitals(alerts: AccidentAlert[]) {
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    for (const alert of alerts) {
      if (!alertNeedsHospitalRefresh(alert)) continue;
      if (inFlightRef.current.has(alert.id)) continue;

      inFlightRef.current.add(alert.id);

      void (async () => {
        try {
          const result = await detectAccident(
            alert.lat,
            alert.lng,
            toApiSeverity(alert.severity),
            alert.location
          );
          const nearest = result?.nearestHospital;
          if (!nearest) {
            // Don't overwrite an already-valid hospital name with a hard
            // failure — a refresh can legitimately fail transiently (e.g. the
            // free Overpass/OSRM APIs rate-limiting a burst of near-identical
            // lookups) even though the original detection already found one.
            const hasExistingAssignment =
              !!alert.assignedHospital && alert.assignedHospital !== "Searching…";
            if (!hasExistingAssignment) {
              updateAccidentAlert(alert.id, {
                assignedHospital: "No hospital found within 15 km",
                integrationMessage: result?.integration?.message,
              });
            }
            return;
          }

          updateAccidentAlert(alert.id, {
            assignedHospital: nearest.name,
            assignedHospitalLat: nearest.latitude,
            assignedHospitalLng: nearest.longitude,
            assignedHospitalAddress: nearest.address,
            assignedHospitalPhone: nearest.phone,
            hospitalMapsUrl: nearest.maps_url,
            isHospitalRegistered: result?.integration?.registered ?? false,
            integrationMessage: result?.integration?.registered
              ? result?.integration?.message
              : undefined,
            hospitalSelectionReason: nearest.selection_reason,
            routeDistanceKm: result?.route?.distance_km,
            etaMinutes: result?.route?.eta_minutes,
            routePolyline: result?.route?.polyline,
          });
        } finally {
          inFlightRef.current.delete(alert.id);
        }
      })();
    }
  }, [alerts]);
}
