import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  AlertTriangle,
  Car,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Navigation,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAccidentAlerts } from "@/hooks/use-accident-alerts";
import { useRefreshDynamicHospitals } from "@/hooks/useRefreshDynamicHospitals";
import { useRefreshDynamicPolice } from "@/hooks/useRefreshDynamicPolice";
import { markAlertNotNew as markNotNew } from "@/lib/accidentAlerts";
import PostureAnalysisDisplay from "@/components/PostureAnalysisDisplay";
import PoliceRoutePanel from "@/components/PoliceRoutePanel";
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

const getTrafficStatusColor = (status: "Road Blocked" | "Diverted" | "Cleared") => {
  switch (status) {
    case "Road Blocked":
      return "bg-red-600 text-white";
    case "Diverted":
      return "bg-orange-500 text-white";
    case "Cleared":
      return "bg-green-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

const PoliceDashboard = () => {
  const storedAlerts = useAccidentAlerts();
  useRefreshDynamicHospitals(storedAlerts);
  useRefreshDynamicPolice(storedAlerts);
  const { toast } = useToast();
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  // Convert stored alerts to display format
  const accidents = useMemo(() => {
    return storedAlerts.map((a) => ({
      id: a.id.replace("acc-", "").slice(-6),
      severity: resolveAlertSeverity(a.severity, a.postureAnalysis),
      vehicles: a.vehicles,
      roadType: a.roadType,
      time: new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: new Date(a.createdAt).toISOString().slice(0, 10),
      rawTime: new Date(a.createdAt).getTime(),
      trafficStatus: a.trafficStatus,
      lat: a.lat,
      lng: a.lng,
      location: a.location,
      investigationStatus: a.investigationStatus,
      assignedHospital: a.assignedHospital,
      assignedPoliceStation: a.assignedPoliceStation,
      assignedPoliceLat: a.assignedPoliceLat,
      assignedPoliceLng: a.assignedPoliceLng,
      assignedPoliceAddress: a.assignedPoliceAddress,
      assignedPolicePhone: a.assignedPolicePhone,
      policeMapsUrl: a.policeMapsUrl,
      isPoliceRegistered: a.isPoliceRegistered,
      policeIntegrationMessage: a.policeIntegrationMessage,
      policeSelectionReason: a.policeSelectionReason,
      policeRouteDistanceKm: a.policeRouteDistanceKm,
      policeEtaMinutes: a.policeEtaMinutes,
      policeRoutePolyline: a.policeRoutePolyline,
      alertId: a.id,
      photoDataUrl: a.photoDataUrl,
      isNew: a.isNew,
      confidence: a.confidence,
      postureAnalysis: a.postureAnalysis,
    }));
  }, [storedAlerts]);

  // Sort accidents by time (newest first)
  const sortedAccidents = useMemo(() => {
    return [...accidents].sort((a, b) => b.rawTime - a.rawTime);
  }, [accidents]);

  const handleStatusChange = (alertId: string, status: "Pending" | "Under Investigation" | "Completed") => {
    // In a real app, this would update the backend
    // For now, we'll just show a toast
    toast({
      title: "Status Updated",
      description: `Investigation status changed to ${status}`,
    });
  };

  const handleRoadCleared = (alertId: string) => {
    // In a real app, this would update the backend
    toast({
      title: "Road Cleared",
      description: "Traffic status updated and investigation marked as completed",
    });
  };

  // Statistics
  const totalAccidents = accidents.length;
  const blockedCount = accidents.filter(
    (a) => a.trafficStatus === "Road Blocked"
  ).length;
  const underInvestigationCount = accidents.filter(
    (a) => a.investigationStatus === "Under Investigation"
  ).length;
  const clearedCount = accidents.filter(
    (a) => a.trafficStatus === "Cleared"
  ).length;

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          Police Traffic & Investigation
        </h1>
        <p className="text-muted-foreground mt-1">
          Traffic control and accident investigation management
        </p>
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
              <AlertTriangle className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Road Blocked</p>
                <p className="text-2xl font-bold text-red-600">{blockedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Under Investigation</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {underInvestigationCount}
                </p>
              </div>
              <Shield className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cleared</p>
                <p className="text-2xl font-bold text-green-600">{clearedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accident Overview - Full Width */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Accident Overview</h2>
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
                className={`relative transition-all hover:shadow-lg ${accident.isNew ? "border-l-4 border-l-red-600" : ""
                  }`}
              >
                {accident.isNew && (
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
                      <span className="text-lg">Accident #{String(accident.id).slice(-6)}</span>
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-4 space-y-2">
                    <p className="font-semibold text-red-700 dark:text-red-400">Accident Confirmed</p>
                    {accident.confidence != null && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Confidence: </span>
                        <span className="font-semibold">{(accident.confidence * 100).toFixed(0)}%</span>
                      </p>
                    )}
                    {accident.postureAnalysis && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Posture Status: </span>
                          <Badge className={getPostureStatusColor(accident.postureAnalysis.status)}>
                            {accident.postureAnalysis.status}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Risk Level: </span>
                          <Badge className={getPostureRiskColor(accident.postureAnalysis.risk)}>
                            {accident.postureAnalysis.risk}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Persons Detected: </span>
                          <span className="font-semibold">{accident.postureAnalysis.persons_detected}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Time: </span>
                      <span className="font-semibold">{accident.time}</span>
                      <span className="text-muted-foreground ml-2">Location: </span>
                      <span className="font-semibold">{accident.location}</span>
                    </div>
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
                      <Car className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Vehicles</p>
                        <p className="font-semibold">{accident.vehicles}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Road Type</p>
                        <p className="font-semibold">{accident.roadType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Time</p>
                        <p className="font-semibold text-sm">{accident.time}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p className="font-semibold text-sm">{accident.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-semibold text-sm">{accident.location}</p>
                    </div>
                  </div>
                  {(accident.assignedHospital || accident.assignedPoliceStation) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                      {accident.assignedPoliceStation && (
                        <div>
                          <p className="text-sm text-muted-foreground">Assigned Police</p>
                          <p className="font-semibold text-sm">{accident.assignedPoliceStation}</p>
                          {accident.policeIntegrationMessage && (
                            <p
                              className={`text-xs mt-1 ${
                                accident.isPoliceRegistered
                                  ? "text-green-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {accident.policeIntegrationMessage}
                            </p>
                          )}
                        </div>
                      )}
                      {accident.assignedHospital && (
                        <div>
                          <p className="text-sm text-muted-foreground">Hospital Notified</p>
                          <p className="font-semibold text-sm">{accident.assignedHospital}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {accident.postureAnalysis && (
                    <PostureAnalysisDisplay posture={accident.postureAnalysis} />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                    <Badge className={getTrafficStatusColor(accident.trafficStatus)}>
                      {accident.trafficStatus}
                    </Badge>
                    <div className="flex flex-wrap gap-2">
                      {accident.assignedPoliceStation && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-400"
                          onClick={() =>
                            setExpandedRouteId(
                              expandedRouteId === accident.id ? null : accident.id
                            )
                          }
                        >
                          <Navigation className="h-4 w-4" />
                          {expandedRouteId === accident.id ? "Hide Route" : "View Police Route"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {expandedRouteId === accident.id && (
                    <PoliceRoutePanel
                      accident={{
                        id: accident.id,
                        location: accident.location,
                        lat: accident.lat,
                        lng: accident.lng,
                        severity: accident.severity,
                        assignedPoliceStation: accident.assignedPoliceStation,
                        assignedPoliceLat: accident.assignedPoliceLat,
                        assignedPoliceLng: accident.assignedPoliceLng,
                        assignedPoliceAddress: accident.assignedPoliceAddress,
                        assignedPolicePhone: accident.assignedPolicePhone,
                        policeMapsUrl: accident.policeMapsUrl,
                        isPoliceRegistered: accident.isPoliceRegistered,
                        policeIntegrationMessage: accident.policeIntegrationMessage,
                        policeSelectionReason: accident.policeSelectionReason,
                        policeRouteDistanceKm: accident.policeRouteDistanceKm,
                        policeEtaMinutes: accident.policeEtaMinutes,
                        policeRoutePolyline: accident.policeRoutePolyline,
                      }}
                    />
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <Badge
                      variant={
                        accident.investigationStatus === "Completed"
                          ? "default"
                          : accident.investigationStatus === "Under Investigation"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {accident.investigationStatus}
                    </Badge>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        handleStatusChange(accident.id, "Under Investigation");
                      }}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Under Investigation
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        handleRoadCleared(accident.id);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Road Cleared
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PoliceDashboard;
