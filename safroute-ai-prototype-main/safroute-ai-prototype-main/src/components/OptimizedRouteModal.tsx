import { useMemo } from "react";
import { Navigation, Clock, Hospital, MapPin, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type LocationData } from "@/lib/emergencyResponse";
import { useEmergencyRoute } from "@/hooks/useEmergencyRoute";
import { formatEta } from "@/lib/routeOptimizer";
import EmergencyRouteMap from "@/components/EmergencyRouteMap";
import type { RoutePanelAccident } from "@/components/OptimizedRoutePanel";

interface OptimizedRouteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accident: RoutePanelAccident | null;
}

const OptimizedRouteModal = ({ open, onOpenChange, accident }: OptimizedRouteModalProps) => {
  const accidentLocation: LocationData | null = accident
    ? { location: accident.location, lat: accident.lat, lon: accident.lng }
    : null;

  const hasCoords =
    accident?.assignedHospitalLat != null && accident?.assignedHospitalLng != null;

  const routeSource = accidentLocation
    ? { lat: accidentLocation.lat, lon: accidentLocation.lon }
    : null;

  const routeDestination =
    hasCoords && accident
      ? {
          lat: accident.assignedHospitalLat!,
          lon: accident.assignedHospitalLng!,
          name: accident.assignedHospital,
        }
      : null;

  const { route: fetchedRoute, loading } = useEmergencyRoute(
    open && hasCoords ? routeSource : null,
    open ? routeDestination : null
  );

  const route = useMemo(() => {
    if (accident?.routePolyline && accident.routePolyline.length >= 2) {
      return {
        hospitalName: accident.assignedHospital,
        distanceKm: accident.routeDistanceKm ?? 0,
        etaMinutes: accident.etaMinutes ?? 0,
        polyline: accident.routePolyline,
        isFallback: false,
      };
    }
    return fetchedRoute;
  }, [accident, fetchedRoute]);

  const hospitalForMap =
    hasCoords && accident
      ? {
          name: accident.assignedHospital,
          lat: accident.assignedHospitalLat!,
          lon: accident.assignedHospitalLng!,
          dist: route?.distanceKm ?? accident.routeDistanceKm ?? 0,
          address: accident.assignedHospitalAddress,
        }
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Navigation className="h-5 w-5 text-primary" />
            Optimized Emergency Route
          </DialogTitle>
          <DialogDescription>
            {accident && (
              <>
                Accident #{accident.id} → {accident.assignedHospital}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {!hasCoords ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Hospital coordinates not available for &quot;{accident?.assignedHospital}&quot;.
            </p>
          ) : accidentLocation && hospitalForMap ? (
            <>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="gap-1 py-1.5 px-3">
                  <MapPin className="h-3.5 w-3.5 text-red-500" />
                  {accidentLocation.location}
                </Badge>
                <Badge variant="outline" className="gap-1 py-1.5 px-3">
                  <Hospital className="h-3.5 w-3.5 text-green-600" />
                  {hospitalForMap.name}
                </Badge>
                {route && (
                  <>
                    <Badge variant="secondary" className="gap-1 py-1.5 px-3">
                      <Navigation className="h-3.5 w-3.5" />
                      {route.distanceKm.toFixed(1)} km
                    </Badge>
                    <Badge variant="secondary" className="gap-1 py-1.5 px-3">
                      <Clock className="h-3.5 w-3.5" />
                      ETA {formatEta(route.etaMinutes)}
                    </Badge>
                  </>
                )}
                {route?.isFallback && (
                  <Badge variant="outline" className="text-xs">Estimated route</Badge>
                )}
                {route && !route.isFallback && (
                  <Badge className="bg-blue-600 text-xs">Optimized route</Badge>
                )}
              </div>

              {accident?.isHospitalRegistered && accident?.integrationMessage && (
                <p className="text-xs text-green-600">{accident.integrationMessage}</p>
              )}

              {accident?.hospitalMapsUrl && (
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <a href={accident.hospitalMapsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Google Maps
                  </a>
                </Button>
              )}

            {open && (
              <EmergencyRouteMap
                accidentLocation={accidentLocation}
                hospital={hospitalForMap}
                route={route}
                loading={loading}
                height={420}
                mapActive={open}
                showAmbulanceAnimation={!!route && route.polyline.length > 2 && !route.isFallback}
              />
            )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OptimizedRouteModal;
