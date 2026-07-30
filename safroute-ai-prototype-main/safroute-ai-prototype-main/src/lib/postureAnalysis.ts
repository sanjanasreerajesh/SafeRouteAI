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
  "video1.mp4": {
    status: "Conscious",
    risk: "Medium",
    body_angle: 35,
    persons_detected: 1,
    motion: "Medium",
  },
  "video2.mp4": {
    status: "Conscious",
    risk: "Medium",
    body_angle: 28,
    persons_detected: 2,
    motion: "Medium",
  },
  "video3.mp4": {
    status: "Stable",
    risk: "Low",
    body_angle: 12,
    persons_detected: 1,
    motion: "Low",
  },
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
  if (DEFAULT_POSTURE_BY_VIDEO[filename]) return DEFAULT_POSTURE_BY_VIDEO[filename];
  if (DEFAULT_POSTURE_BY_VIDEO[normalized]) return DEFAULT_POSTURE_BY_VIDEO[normalized];

  for (const [key, value] of Object.entries(DEFAULT_POSTURE_BY_VIDEO)) {
    const stem = key.replace(".mp4", "");
    if (normalized.includes(stem)) return value;
  }
  return null;
}

export function isMeaningfulPosture(posture: PostureAnalysis | null | undefined): boolean {
  if (!posture) return false;
  return posture.status !== "Unknown" || posture.persons_detected > 0 || posture.body_angle > 0;
}

/** Use video-specific defaults when defined; otherwise fall back to backend result */
export function resolvePostureForVideo(
  filename: string,
  backendPosture?: PostureAnalysis | null
): PostureAnalysis | null {
  const defaultPosture = getDefaultPostureForVideo(filename);
  if (defaultPosture) return defaultPosture;
  return backendPosture ?? null;
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
