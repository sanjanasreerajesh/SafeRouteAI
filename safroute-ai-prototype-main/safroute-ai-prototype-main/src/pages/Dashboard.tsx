import { useState } from "react";
import VideoFeedPanel, { type AccidentDetectionInfo } from "@/components/VideoFeedPanel";
import EmergencyDashboard from "@/components/EmergencyDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

const Dashboard = () => {
  const [accidentInfo, setAccidentInfo] = useState<AccidentDetectionInfo | null>(null);

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Live Monitoring</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <VideoFeedPanel
          onAccidentDetected={setAccidentInfo}
          onAccidentReset={() => setAccidentInfo(null)}
        />
        <div className="lg:sticky lg:top-6">
          {accidentInfo ? (
            <EmergencyDashboard
              videoFilename={accidentInfo.videoFilename}
              severity={accidentInfo.severity}
            />
          ) : (
            <Card className="overflow-hidden animate-fade-in border-dashed">
              <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Emergency Response Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent className="py-16 px-6 text-center">
                <Shield className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">
                  Waiting for accident detection
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Upload media and run detection — location mapping, hospital recommendation, and route will appear here.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
