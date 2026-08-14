import { useEffect, useRef } from "react";
import {
  alertNeedsPoliceRefresh,
  updateAccidentAlert,
  type AccidentAlert,
} from "@/lib/accidentAlerts";
import { fetchNearestPolice, toPoliceApiSeverity } from "@/lib/dynamicPolice";

/**
 * Re-resolve police assignment for legacy alerts with hardcoded station names.
 */
export function useRefreshDynamicPolice(alerts: AccidentAlert[]) {
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    for (const alert of alerts) {
      if (!alertNeedsPoliceRefresh(alert)) continue;
      if (inFlightRef.current.has(alert.id)) continue;

      inFlightRef.current.add(alert.id);

      void (async () => {
        try {
          const result = await fetchNearestPolice(
            alert.lat,
            alert.lng,
            toPoliceApiSeverity(alert.severity),
            alert.location
          );
          const nearest = result?.nearestPoliceStation;
          if (!nearest) {
            // Don't overwrite an already-valid police station with a hard
            // failure — a refresh can legitimately fail transiently (e.g. the
            // free Overpass/OSRM APIs rate-limiting a burst of near-identical
            // lookups) even though the original detection already found one.
            const hasExistingAssignment =
              !!alert.assignedPoliceStation && alert.assignedPoliceStation !== "Searching…";
            if (!hasExistingAssignment) {
              updateAccidentAlert(alert.id, {
                assignedPoliceStation: "No police station found nearby",
                policeIntegrationMessage: result?.integration?.message,
              });
            }
            return;
          }

          updateAccidentAlert(alert.id, {
            assignedPoliceStation: nearest.name,
            assignedPoliceLat: nearest.latitude,
            assignedPoliceLng: nearest.longitude,
            assignedPoliceAddress: nearest.address,
            assignedPolicePhone: nearest.phone,
            policeMapsUrl: nearest.maps_url,
            isPoliceRegistered: result?.integration?.registered ?? false,
            policeIntegrationMessage: result?.integration?.message,
            policeSelectionReason: nearest.selection_reason,
            policeRouteDistanceKm: result?.route?.distance_km,
            policeEtaMinutes: result?.route?.eta_minutes,
            policeRoutePolyline: result?.route?.polyline,
          });
        } finally {
          inFlightRef.current.delete(alert.id);
        }
      })();
    }
  }, [alerts]);
}
