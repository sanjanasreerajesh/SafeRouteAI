import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ambulance, Clock, Users, MapPin, AlertCircle, Navigation } from "lucide-react";
import { useAccidentAlerts } from "@/hooks/use-accident-alerts";
import { useRefreshDynamicHospitals } from "@/hooks/useRefreshDynamicHospitals";
import OptimizedRoutePanel from "@/components/OptimizedRoutePanel";
import { getPostureRiskColor, getPostureStatusColor, resolveAlertSeverity } from "@/lib/postureAnalysis";

const getSeverityColor = (severity: "Low" | "Medium" | "High" | "Critical") => {
  switch (severity) {
    case "Critical":
      return "bg-red-600 text-white";
    case "High":
      return "bg-orange-500 text-white";
    case "Medium":
      return "bg-yellow-500 text-black";
    case "Low":
      return "bg-green-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

const getStatusColor = (status: "Ambulance Dispatched" | "Pending") => {
  return status === "Ambulance Dispatched"
    ? "bg-green-500 text-white"
    : "bg-yellow-500 text-black";
};

const HospitalDashboard = () => {
  const storedAlerts = useAccidentAlerts();
  useRefreshDynamicHospitals(storedAlerts);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  // Convert stored alerts to display format
  const accidents = useMemo(() => {
    return storedAlerts.map((a) => ({
      id: a.id.replace("acc-", "").slice(-6),
      severity: resolveAlertSeverity(a.severity, a.postureAnalysis),
      injured: a.injured,
      time: new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: new Date(a.createdAt).toISOString().slice(0, 10),
      rawTime: new Date(a.createdAt).getTime(),
      status: a.hospitalStatus,
      lat: a.lat,
      lng: a.lng,
      location: a.location,
      new: a.isNew,
      assignedHospital: a.assignedHospital,
      assignedHospitalLat: a.assignedHospitalLat,
      assignedHospitalLng: a.assignedHospitalLng,
      assignedHospitalAddress: a.assignedHospitalAddress,
      hospitalMapsUrl: a.hospitalMapsUrl,
      isHospitalRegistered: a.isHospitalRegistered,
      integrationMessage: a.integrationMessage,
      routeDistanceKm: a.routeDistanceKm,
      etaMinutes: a.etaMinutes,
      routePolyline: a.routePolyline,
      assignedPoliceStation: a.assignedPoliceStation,
      photoDataUrl: a.photoDataUrl,
      confidence: a.confidence,
      postureAnalysis: a.postureAnalysis,
    }));
  }, [storedAlerts]);

  // Sort accidents: Priority 1: Newest first, Priority 2: Criticality
  const sortedAccidents = useMemo(() => {
    return [...accidents].sort((a, b) => {
      // Always put actual new ones at top
      if (a.new && !b.new) return -1;
      if (!a.new && b.new) return 1;
      // Then sort by time (newest first)
      return b.rawTime - a.rawTime;
    });
  }, [accidents]);

  // Real-time alert badge count
  const newAccidentsCount = accidents.filter((a) => a.new).length;

  // Statistics
  const totalAccidents = accidents.length;
  const criticalCount = accidents.filter((a) => a.severity === "Critical").length;
  const pendingCount = accidents.filter((a) => a.status === "Pending").length;
  const totalInjured = accidents.reduce((sum, a) => sum + a.injured, 0);

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      {/* Header with real-time alert badge */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Ambulance className="h-8 w-8 text-primary" />
            Hospital Emergency Response
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time accident alerts and emergency coordination
          </p>
        </div>
        {newAccidentsCount > 0 && (
          <Badge
            variant="destructive"
            className="px-4 py-2 text-lg animate-pulse"
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            {newAccidentsCount} New Alert{newAccidentsCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Accidents</p>
                <p className="text-2xl font-bold">{totalAccidents}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Injured</p>
                <p className="text-2xl font-bold">{totalInjured}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accident Alerts - Full Width */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Accident Alerts</h2>
        <div className="space-y-4">
          {sortedAccidents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No accident alerts yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Upload an image or video on the main dashboard to detect accidents
                </p>
              </CardContent>
            </Card>
          ) : (
            sortedAccidents.map((accident) => (
              <Card
                key={accident.id}
                className={`relative transition-all hover:shadow-lg ${accident.new ? "border-l-4 border-l-red-600" : ""
                  }`}
              >
                {accident.new && (
                  <Badge className="absolute top-2 right-2 bg-red-600 animate-pulse z-10">
                    NEW
                  </Badge>
                )}
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Badge className={getSeverityColor(accident.severity)}>
                        {accident.severity}
                      </Badge>
                      <span className="text-lg">Accident #{accident.id}</span>
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-4 space-y-2">
                    <p className="font-semibold text-red-700 dark:text-red-400">Accident Detected</p>
                    {accident.confidence != null && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Confidence: </span>
                        <span className="font-semibold">{(accident.confidence * 100).toFixed(0)}%</span>
                      </p>
                    )}
                    {accident.postureAnalysis ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Posture: </span>
                          <Badge className={getPostureStatusColor(accident.postureAnalysis.status)}>
                            {accident.postureAnalysis.status}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Risk: </span>
                          <Badge className={getPostureRiskColor(accident.postureAnalysis.risk)}>
                            {accident.postureAnalysis.risk}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Persons: </span>
                          <span className="font-semibold">{accident.postureAnalysis.persons_detected}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Location: </span>
                          <span className="font-semibold">{accident.location}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Location: </span>
                        <span className="font-semibold">{accident.location}</span>
                      </p>
                    )}
                  </div>
                  {/* Show photo for alert if available */}
                  {accident.photoDataUrl && (
                    <div className="rounded-lg overflow-hidden border bg-muted">
                      <img
                        src={accident.photoDataUrl}
                        alt={`Accident ${accident.id}`}
                        className="w-full h-96 object-contain bg-black"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Injured</p>
                        <p className="font-semibold">{accident.injured} person(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Time</p>
                        <p className="font-semibold">{accident.time}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-semibold text-sm">{accident.location}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p className="font-semibold text-sm">{accident.date}</p>
                    </div>
                  </div>
                  {(accident.assignedHospital || accident.assignedPoliceStation) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                      {accident.assignedHospital && (
                        <div>
                          <p className="text-sm text-muted-foreground">Assigned Hospital</p>
                          <p className="font-semibold text-sm">{accident.assignedHospital}</p>
                          {accident.isHospitalRegistered && accident.integrationMessage && (
                            <p className="text-xs mt-1 text-green-600">
                              {accident.integrationMessage}
                            </p>
                          )}
                        </div>
                      )}
                      {accident.assignedPoliceStation && (
                        <div>
                          <p className="text-sm text-muted-foreground">Police Notified</p>
                          <p className="font-semibold text-sm">{accident.assignedPoliceStation}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                    <Badge className={getStatusColor(accident.status)}>
                      {accident.status}
                    </Badge>
                    {accident.assignedHospital && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950"
                        onClick={() =>
                          setExpandedRouteId(
                            expandedRouteId === accident.id ? null : accident.id
                          )
                        }
                      >
                        <Navigation className="h-4 w-4" />
                        {expandedRouteId === accident.id ? "Hide Route" : "View Optimized Route"}
                      </Button>
                    )}
                  </div>

                  {expandedRouteId === accident.id && accident.assignedHospital && (
                    <OptimizedRoutePanel
                      accident={{
                        id: accident.id,
                        location: accident.location,
                        lat: accident.lat,
                        lng: accident.lng,
                        severity: accident.severity,
                        assignedHospital: accident.assignedHospital,
                        assignedHospitalLat: accident.assignedHospitalLat,
                        assignedHospitalLng: accident.assignedHospitalLng,
                        assignedHospitalAddress: accident.assignedHospitalAddress,
                        hospitalMapsUrl: accident.hospitalMapsUrl,
                        isHospitalRegistered: accident.isHospitalRegistered,
                        integrationMessage: accident.integrationMessage,
                        routeDistanceKm: accident.routeDistanceKm,
                        etaMinutes: accident.etaMinutes,
                        routePolyline: accident.routePolyline,
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default HospitalDashboard;
