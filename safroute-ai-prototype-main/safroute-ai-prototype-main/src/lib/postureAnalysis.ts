export type PostureStatus =
  | "Stable"
  | "Conscious"
  | "Possible Injury"
  | "Critical"
  | "Unknown";

export type PostureRisk = "Low" | "Medium" | "High" | "Critical" | "Unknown";

export type PostureMotion = "Low" | "Medium" | "High" | "Unknown";

export interface PostureAnalysis {
  status: PostureStatus;
  risk: PostureRisk;
  body_angle: number;
  persons_detected: number;
  motion: PostureMotion;
}

/** Default posture results for predefined demo videos */
export const DEFAULT_POSTURE_BY_VIDEO: Record<string, PostureAnalysis> = {
  "video4.mp4": {
    status: "Critical",
    risk: "High",
    body_angle: 82,
    persons_detected: 1,
    motion: "Low",
  },
};

export function getDefaultPostureForVideo(filename: string): PostureAnalysis | null {
  const normalized = filename.trim().toLowerCase();
  return (
    DEFAULT_POSTURE_BY_VIDEO[filename] ??
    DEFAULT_POSTURE_BY_VIDEO[normalized] ??
    null
  );
}

/** Use video-specific defaults when defined; otherwise fall back to backend result */
export function resolvePostureForVideo(
  filename: string,
  backendPosture?: PostureAnalysis | null
): PostureAnalysis | null {
  return getDefaultPostureForVideo(filename) ?? backendPosture ?? null;
}

export type AlertSeverity = "Low" | "Medium" | "High" | "Critical";

/** Prefer posture risk for alert severity when available */
export function resolveAlertSeverity(
  confidenceSeverity: AlertSeverity,
  posture?: PostureAnalysis | null
): AlertSeverity {
  if (posture?.risk && posture.risk !== "Unknown") {
    return posture.risk;
  }
  return confidenceSeverity;
}

export const getPostureStatusColor = (status: PostureStatus): string => {
  switch (status) {
    case "Stable":
      return "bg-green-500 text-white";
    case "Conscious":
      return "bg-yellow-500 text-black";
    case "Possible Injury":
      return "bg-orange-500 text-white";
    case "Critical":
      return "bg-red-600 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

export const getPostureRiskColor = (risk: PostureRisk): string => {
  switch (risk) {
    case "Low":
      return "bg-green-500 text-white";
    case "Medium":
      return "bg-yellow-500 text-black";
    case "High":
      return "bg-orange-500 text-white";
    case "Critical":
      return "bg-red-600 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};
