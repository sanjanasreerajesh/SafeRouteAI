import { useEffect, useState } from "react";
import {
  fetchEmergencyRoute,
  type RouteCoordinates,
  type RouteDestination,
  type RouteResult,
} from "@/lib/routeOptimizer";

/**
 * Fetches and auto-updates the emergency route when source or destination change.
 * Always resolves with a route (optimized, OSRM, or estimated fallback).
 */
export function useEmergencyRoute(
  source: RouteCoordinates | null,
  destination: RouteDestination | null
) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!source || !destination) {
      setRoute(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      setLoading(true);

      try {
        const result = await fetchEmergencyRoute({ source, destination });
        if (!cancelled) {
          setRoute(result);
        }
      } catch {
        if (!cancelled) {
          setRoute(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRoute();

    return () => {
      cancelled = true;
    };
  }, [
    source?.lat,
    source?.lon,
    destination?.lat,
    destination?.lon,
    destination?.name,
  ]);

  return { route, loading, error: null };
}
