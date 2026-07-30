import React, { useEffect, useMemo, useState } from "react";

import "leaflet/dist/leaflet.css";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import {

  AlertCircle,

  Hospital,

  MapPin,

  Clock,

  Navigation,

  Phone,

  ExternalLink,

  Loader2,

} from "lucide-react";

import { getLocationForVideo, type LocationData } from "@/lib/emergencyResponse";

import { formatEta } from "@/lib/routeOptimizer";

import EmergencyRouteMap from "@/components/EmergencyRouteMap";

import {

  detectAccident,

  hospitalsForMap,

  routeFromDetectResponse,

  toApiSeverity,

  type DetectAccidentResponse,

} from "@/lib/dynamicEmergency";



interface EmergencyDashboardProps {

  videoFilename: string;

  severity: "High" | "Medium" | "Low";

  accidentLocation?: LocationData | null;

  locationSource?: "manual" | "gps" | "video" | "default";

}



const SELECTION_LABELS: Record<string, string> = {

  nearest_trauma_center: "Nearest trauma / emergency center",

  nearest_general_no_trauma_found: "Nearest hospital (no trauma center in range)",

  nearest_hospital: "Nearest hospital by distance",

  nearest_hospital_low_severity: "Nearest hospital (low severity)",

};



const EmergencyDashboard: React.FC<EmergencyDashboardProps> = ({

  videoFilename,

  severity,

  accidentLocation: propLocation,

  locationSource,

}) => {

  const accidentLocation = propLocation ?? getLocationForVideo(videoFilename);

  const [response, setResponse] = useState<DetectAccidentResponse | null>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    if (!accidentLocation) return;



    let cancelled = false;

    setLoading(true);

    setError(null);



    void detectAccident(

      accidentLocation.lat,

      accidentLocation.lon,

      toApiSeverity(severity),

      accidentLocation.location

    ).then((result) => {

      if (cancelled) return;

      if (!result) {

        setError("Could not reach emergency response API. Is the backend running?");

        setResponse(null);

      } else {

        setResponse(result);

      }

      setLoading(false);

    });



    return () => {

      cancelled = true;

    };

  }, [accidentLocation?.lat, accidentLocation?.lon, accidentLocation?.location, severity]);



  const nearest = response?.nearestHospital ?? null;

  const route = useMemo(

    () => (response ? routeFromDetectResponse(response) : null),

    [response]

  );

  const mapHospitals = useMemo(

    () => (response ? hospitalsForMap(response, nearest?.name) : []),

    [response, nearest?.name]

  );



  const hospitalForMap = nearest

    ? {

        name: nearest.name,

        lat: nearest.latitude,

        lon: nearest.longitude,

        dist: nearest.route_distance_km ?? nearest.distance_km,

        address: nearest.address,

      }

    : null;



  if (!accidentLocation) {

    return (

      <Card className="border-amber-500 shadow-lg animate-fade-in">

        <CardHeader className="bg-amber-50 dark:bg-amber-950/20">

          <CardTitle className="text-amber-700 flex items-center gap-2 text-xl">

            <AlertCircle className="h-6 w-6" />

            Accident Detected — Location Required

          </CardTitle>

        </CardHeader>

        <CardContent className="p-6">

          <p className="text-muted-foreground">

            Set the accident location using GPS or enter coordinates on the left panel, then run detection again.

          </p>

        </CardContent>

      </Card>

    );

  }



  const severityVariant =

    severity === "High" ? "destructive" : severity === "Medium" ? "default" : "secondary";

  const severityClass =

    severity === "Medium" ? "bg-amber-500 hover:bg-amber-500 text-white border-transparent" : "";



  return (

    <Card className="border-red-500 shadow-lg animate-fade-in overflow-hidden">

      <CardHeader className="bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900 py-4">

        <CardTitle className="text-red-600 flex items-center gap-2 text-xl">

          <AlertCircle className="h-6 w-6 animate-pulse" />

          🚨 Accident Detected

        </CardTitle>

      </CardHeader>



      <CardContent className="p-0">

        <div className="p-4 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">

          {loading && (

            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">

              <Loader2 className="h-4 w-4 animate-spin" />

              Searching nearby hospitals worldwide…

            </div>

          )}



          {error && (

            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800">

              {error}

            </div>

          )}



          <div className="grid grid-cols-1 gap-4">

            {/* Accident Details */}

            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">

              <h3 className="font-semibold text-lg flex items-center gap-2">

                <MapPin className="h-5 w-5 text-red-500" />

                Location

              </h3>

              <p className="text-lg font-medium text-foreground">{accidentLocation.location}</p>

              {locationSource && (

                <Badge variant="outline" className="text-xs capitalize">

                  Source: {locationSource}

                </Badge>

              )}



              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">

                <p className="text-sm text-muted-foreground mb-1">Severity</p>

                <Badge variant={severityVariant} className={`text-sm px-3 py-1 ${severityClass}`}>

                  {severity}

                </Badge>

              </div>



              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">

                <p className="text-sm text-muted-foreground mb-2">Coordinates</p>

                <div className="grid grid-cols-2 gap-3 text-sm">

                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-md p-3">

                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Latitude</p>

                    <p className="font-mono font-semibold">{accidentLocation.lat.toFixed(4)}</p>

                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-md p-3">

                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Longitude</p>

                    <p className="font-mono font-semibold">{accidentLocation.lon.toFixed(4)}</p>

                  </div>

                </div>

              </div>

            </div>



            {/* Dynamic Hospital Recommendation */}

            {nearest && (

              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-green-200 dark:border-green-900/50 shadow-sm space-y-4">

                <h3 className="font-semibold text-lg flex items-center gap-2 text-green-700 dark:text-green-500">

                  <Hospital className="h-5 w-5" />

                  Auto-Selected Hospital

                </h3>

                <p className="text-lg font-medium">{nearest.name}</p>

                {nearest.address && (

                  <p className="text-sm text-muted-foreground">{nearest.address}</p>

                )}



                {nearest.phone && (

                  <p className="text-sm flex items-center gap-1.5">

                    <Phone className="h-3.5 w-3.5" />

                    <a href={`tel:${nearest.phone}`} className="text-blue-600 hover:underline">

                      {nearest.phone}

                    </a>

                  </p>

                )}



                {route && (

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-green-100 dark:border-green-900/30">

                    <div>

                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">

                        <Navigation className="h-3 w-3" /> Driving Distance

                      </p>

                      <p className="text-xl font-bold text-green-700 dark:text-green-400">

                        {route.distanceKm.toFixed(1)} km

                      </p>

                    </div>

                    <div>

                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">

                        <Clock className="h-3 w-3" /> ETA

                      </p>

                      <p className="text-xl font-bold text-green-700 dark:text-green-400">

                        {formatEta(route.etaMinutes)}

                      </p>

                    </div>

                  </div>

                )}



                {nearest.selection_reason && (

                  <p className="text-sm text-muted-foreground pt-2 border-t border-green-100 dark:border-green-900/30">

                    Selection: {SELECTION_LABELS[nearest.selection_reason] ?? nearest.selection_reason}

                  </p>

                )}



                {response?.integration?.registered && response.integration.message && (

                  <div

                    className="rounded-md p-3 text-sm bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300 border border-green-200"

                  >

                    {response.integration.message}

                  </div>

                )}



                {nearest.maps_url && (

                  <Button variant="outline" size="sm" asChild className="gap-1.5">

                    <a href={nearest.maps_url} target="_blank" rel="noopener noreferrer">

                      <ExternalLink className="h-3.5 w-3.5" />

                      Open in Google Maps

                    </a>

                  </Button>

                )}

              </div>

            )}



            {/* Top hospitals list */}

            {response && response.topHospitals.length > 1 && (

              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">

                <h3 className="font-semibold text-base">Nearby Hospitals ({response.topHospitals.length})</h3>

                <ul className="space-y-2 max-h-48 overflow-y-auto">

                  {response.topHospitals.map((h) => (

                    <li

                      key={`${h.place_id ?? h.name}-${h.latitude}`}

                      className={`text-sm rounded-md p-2 border ${

                        h.name === nearest?.name

                          ? "border-green-300 bg-green-50/50 dark:bg-green-950/20"

                          : "border-slate-100 dark:border-slate-800"

                      }`}

                    >

                      <span className="font-medium">{h.name}</span>

                      <span className="text-muted-foreground ml-2">

                        {(h.route_distance_km ?? h.distance_km).toFixed(1)} km

                        {h.eta_minutes != null && ` · ${formatEta(h.eta_minutes)}`}

                      </span>

                    </li>

                  ))}

                </ul>

              </div>

            )}

          </div>



          {/* Route map with multiple hospital markers */}

          {hospitalForMap && (

            <div className="space-y-2">

              <h3 className="font-semibold text-base flex items-center gap-2 text-foreground">

                <MapPin className="h-4 w-4 text-red-500" />

                Emergency Route

                {route && !route.isFallback && (

                  <Badge variant="secondary" className="text-xs font-normal">Optimized</Badge>

                )}

                {route?.isFallback && (

                  <Badge variant="outline" className="text-xs font-normal">Estimated</Badge>

                )}

              </h3>



              <EmergencyRouteMap

                accidentLocation={accidentLocation}

                hospital={hospitalForMap}

                route={route}

                loading={loading}

                nearbyHospitals={mapHospitals}

              />



              {route && (

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900/50 rounded-lg px-4 py-3 border">

                  <span className="flex items-center gap-1">

                    <Hospital className="h-4 w-4" />

                    <strong className="text-foreground">{route.hospitalName}</strong>

                  </span>

                  <span className="flex items-center gap-1">

                    <Navigation className="h-4 w-4" />

                    {route.distanceKm.toFixed(1)} km

                  </span>

                  <span className="flex items-center gap-1">

                    <Clock className="h-4 w-4" />

                    ETA {formatEta(route.etaMinutes)}

                  </span>

                </div>

              )}

            </div>

          )}

        </div>

      </CardContent>

    </Card>

  );

};



export default EmergencyDashboard;

