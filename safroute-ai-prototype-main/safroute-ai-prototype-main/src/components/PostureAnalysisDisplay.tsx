import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, RotateCw, Gauge } from "lucide-react";
import {
  PostureAnalysis,
  getPostureRiskColor,
  getPostureStatusColor,
} from "@/lib/postureAnalysis";

interface PostureAnalysisDisplayProps {
  posture: PostureAnalysis | null | undefined;
  compact?: boolean;
}

const PostureAnalysisDisplay = ({ posture, compact = false }: PostureAnalysisDisplayProps) => {
  if (!posture) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 items-center">
        <Badge className={getPostureStatusColor(posture.status)}>{posture.status}</Badge>
        <Badge className={getPostureRiskColor(posture.risk)}>Risk: {posture.risk}</Badge>
        {posture.persons_detected > 0 && (
          <span className="text-sm text-muted-foreground">
            {posture.persons_detected} person(s)
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-blue-600" />
          Posture Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <Badge className={getPostureStatusColor(posture.status)}>{posture.status}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Risk Level</p>
            <Badge className={getPostureRiskColor(posture.risk)}>{posture.risk}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-1 border-t">
          <div className="flex items-center gap-2">
            <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Body Angle</p>
              <p className="font-semibold text-sm">{posture.body_angle}°</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Persons</p>
              <p className="font-semibold text-sm">{posture.persons_detected}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Motion</p>
              <p className="font-semibold text-sm">{posture.motion}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PostureAnalysisDisplay;
