import { useMemo } from "react";
import { Navigation, Clock, Hospital, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getHospitalByName, type LocationData } from "@/lib/emergencyResponse";
import { useEmergencyRoute } from "@/hooks/useEmergencyRoute";
import { formatEta } from "@/lib/routeOptimizer";
import EmergencyRouteMap from "@/components/EmergencyRouteMap";

export interface RouteModalAccident {
  id: string;
  location: string;
  lat: number;
  lng: number;
  assignedHospital: string;
}

interface OptimizedRouteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accident: RouteModalAccident | null;
}

const OptimizedRouteModal = ({ open, onOpenChange, accident }: OptimizedRouteModalProps) => {
  const accidentLocation: LocationData | null = accident
    ? { location: accident.location, lat: accident.lat, lon: accident.lng }
    : null;

  const hospital = useMemo(
    () => (accident ? getHospitalByName(accident.assignedHospital) : null),
    [accident]
  );

  const routeSource = accidentLocation
    ? { lat: accidentLocation.lat, lon: accidentLocation.lon }
    : null;

  const routeDestination = hospital
    ? { lat: hospital.lat, lon: hospital.lon, name: hospital.name }
    : null;

  const { route, loading } = useEmergencyRoute(
    open ? routeSource : null,
    open ? routeDestination : null
  );

  const hospitalForMap = hospital
    ? {
        ...hospital,
        dist: route?.distanceKm ?? 0,
        score: 0,
        isClosestSuitable: false,
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
          {!hospital ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Hospital coordinates not found for &quot;{accident?.assignedHospital}&quot;.
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
                  {hospital.name}
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
