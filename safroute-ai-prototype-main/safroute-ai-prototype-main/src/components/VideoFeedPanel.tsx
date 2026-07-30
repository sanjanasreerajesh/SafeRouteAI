import { useState, useRef, useEffect, useCallback } from "react";
import { Video, Info, Upload, Play, AlertTriangle, MapPin, LocateFixed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { publishAccidentAlert } from "@/lib/accidentAlerts";
import { type LocationData } from "@/lib/emergencyResponse";
import { detectAccident, toApiSeverity } from "@/lib/dynamicEmergency";
import { fetchNearestPolice, toPoliceApiSeverity } from "@/lib/dynamicPolice";
import { resolveAccidentLocation, type ResolvedLocation } from "@/lib/locationService";
import PostureAnalysisDisplay from "@/components/PostureAnalysisDisplay";
import type { PostureAnalysis } from "@/lib/postureAnalysis";
import { resolvePostureForVideo, resolveAlertSeverity, isMeaningfulPosture, getDefaultPostureForVideo } from "@/lib/postureAnalysis";

export interface AccidentDetectionInfo {
  videoFilename: string;
  severity: "High" | "Medium" | "Low";
  location: LocationData;
  locationSource: ResolvedLocation["source"];
}

interface VideoFeedPanelProps {
  onAccidentDetected?: (info: AccidentDetectionInfo) => void;
  onAccidentReset?: () => void;
}

// WebSocket configuration
const WS_URL = "ws://127.0.0.1:8000/ws";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label: string;
}

// --- Helper Functions ---

const iou = (box1: BoundingBox, box2: BoundingBox): number => {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;

  return intersectionArea / (box1Area + box2Area - intersectionArea);
};

const nms = (boxes: BoundingBox[], iouThreshold: number = 0.5): BoundingBox[] => {
  if (boxes.length === 0) return [];
  // Sort boxes by confidence
  let sortedBoxes = [...boxes].sort((a, b) => b.confidence - a.confidence);

  // Performance optimization: Cap the number of boxes to process
  if (sortedBoxes.length > 500) {
    sortedBoxes = sortedBoxes.slice(0, 500);
  }

  const selectedBoxes: BoundingBox[] = [];

  while (sortedBoxes.length > 0) {
    const current = sortedBoxes.shift()!;
    selectedBoxes.push(current);
    for (let i = sortedBoxes.length - 1; i >= 0; i--) {
      if (iou(current, sortedBoxes[i]) > iouThreshold) {
        sortedBoxes.splice(i, 1);
      }
    }
    // Limit total selected boxes to prevent UI lag
    if (selectedBoxes.length > 50) break;
  }
  return selectedBoxes;
};

// -------------------------------------------------------------------------------

const MAX_HISTORY = 8;
const CONSENSUS_THRESHOLD = 5; // Must detect in 5/8 frames to alert
const MIN_STABLE_FRAMES_VIDEO = 5;
const MIN_STABLE_FRAMES_IMAGE = 2;
const MIN_BOX_AREA_RATIO = 0.008;

const VideoFeedPanel = ({ onAccidentDetected, onAccidentReset }: VideoFeedPanelProps) => {
  const { toast } = useToast();
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState<string>("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [detections, setDetections] = useState<BoundingBox[]>([]);
  const [postureResult, setPostureResult] = useState<PostureAnalysis | null>(null);
  const [originalImageSize, setOriginalImageSize] = useState<{ width: number; height: number } | null>(null);

  // Detection Threshold (Sensitivity) — higher = fewer false positives
  const [threshold, setThreshold] = useState(0.75);

  // Accident location (manual / GPS / video fallback)
  const [locationName, setLocationName] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [preferGps, setPreferGps] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [activeLocationLabel, setActiveLocationLabel] = useState<string | null>(null);
  const accidentLocationRef = useRef<ResolvedLocation | null>(null);

  // State for coordinate mode
  const [coordMode, setCoordMode] = useState<'auto' | 'norm' | 'pixel'>('auto');
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Toggle Handler
  const cycleCoordMode = () => {
    const modes: ('auto' | 'norm' | 'pixel')[] = ['auto', 'norm', 'pixel'];
    const next = modes[(modes.indexOf(coordMode) + 1) % modes.length];
    setCoordMode(next);
    setDetectionResult(`Mode: ${next.toUpperCase()} `);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoProcessing, setIsVideoProcessing] = useState(false);
  const [isLiveDetecting, setIsLiveDetecting] = useState(false);
  const requestRef = useRef<number>();
  const isProcessingFrame = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const detectionHistory = useRef<BoundingBox[][]>([]);
  const boxPersistence = useRef<{ box: BoundingBox, count: number }[]>([]);
  const lastAlertTimeRef = useRef<number>(0);
  const lastPostureRef = useRef<PostureAnalysis | null>(null);
  const postureLockedRef = useRef(false);
  const alertPublishedForEventRef = useRef(false);
  const lastCapturedImageRef = useRef<string | null>(null);
  const videoFilenameRef = useRef<string>("");
  const accidentNotifiedRef = useRef(false);

  useEffect(() => {
    videoFilenameRef.current = videoFilename;
  }, [videoFilename]);

  const handleUseGps = async () => {
    setGpsLoading(true);
    try {
      const resolved = await resolveAccidentLocation({ useGps: true });
      setLocationLat(resolved.lat.toFixed(6));
      setLocationLng(resolved.lon.toFixed(6));
      setLocationName(resolved.location);
      setActiveLocationLabel(`${resolved.location} (GPS)`);
      accidentLocationRef.current = resolved;
      toast({
        title: "Location updated",
        description: resolved.location,
      });
    } catch {
      toast({
        title: "GPS unavailable",
        description: "Allow location access or enter coordinates manually.",
        variant: "destructive",
      });
    } finally {
      setGpsLoading(false);
    }
  };

  const getManualLocationInput = (): Partial<LocationData> | null => {
    const lat = parseFloat(locationLat);
    const lon = parseFloat(locationLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      location: locationName.trim() || undefined,
    };
  };

  // Initialize WebSocket connection
  useEffect(() => {
    let retryCount = 0;
    const connectWS = () => {
      console.log("WebSocket: Initializing connection...");
      setIsModelLoading(true);

      // Determine protocol and host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const targetUrl = `${protocol}//localhost:8000/ws`;

      console.log(`WebSocket: Target URL is ${targetUrl}`);
      setDebugInfo(`Connecting to ${targetUrl}...`);

      try {
        const ws = new WebSocket(targetUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("WebSocket: Connection established!");
          setWsConnected(true);
          setIsModelLoading(false);
          setDebugInfo("Backend Connected");
          retryCount = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
              if (data.detections) {
              console.log("WS Response received:", data.detections.length, "detections");

              // Lock posture after first confirmed estimation (or demo default)
              if (data.posture_final && data.posture) {
                const resolvedPosture = resolvePostureForVideo(
                  videoFilenameRef.current,
                  data.posture
                );
                if (resolvedPosture) {
                  setPostureResult(resolvedPosture);
                  lastPostureRef.current = resolvedPosture;
                  postureLockedRef.current = true;
                }
              } else if (!postureLockedRef.current && data.detections.length > 0) {
                const resolvedPosture = resolvePostureForVideo(
                  videoFilenameRef.current,
                  data.posture ?? null
                );
                if (resolvedPosture) {
                  setPostureResult(resolvedPosture);
                  lastPostureRef.current = resolvedPosture;
                  if (getDefaultPostureForVideo(videoFilenameRef.current)) {
                    postureLockedRef.current = true;
                  }
                }
              } else if (data.detections.length === 0) {
                setPostureResult(null);
                lastPostureRef.current = null;
                postureLockedRef.current = false;
                detectionHistory.current = [];
                boxPersistence.current = [];
                setDetections([]);
              }
              const media = imageRef.current || videoRef.current;
              const isImageSource = !!imageRef.current;
              const naturalWidth = media instanceof HTMLImageElement ? media.naturalWidth : (media?.videoWidth || 640);
              const naturalHeight = media instanceof HTMLImageElement ? media.naturalHeight : (media?.videoHeight || 640);

              const rawFinal = data.detections
                .filter((d: { confidence?: number; confirmed?: boolean; width: number; height: number }) => {
                  const conf = d.confidence ?? 0;
                  const area = d.width * d.height;
                  const minArea = naturalWidth * naturalHeight * MIN_BOX_AREA_RATIO;
                  return conf >= threshold && d.confirmed !== false && area >= minArea;
                })
                .map((d: {x: number, y: number, width: number, height: number, confidence?: number}) => ({
                  ...d,
                  x: d.x,
                  y: d.y,
                  width: d.width,
                  height: d.height,
                  confidence: d.confidence ?? 0,
                  label: 'Accident'
                }));

              // Frame consensus — reduce single-frame false positives
              detectionHistory.current.push(rawFinal);
              if (detectionHistory.current.length > MAX_HISTORY) {
                detectionHistory.current.shift();
              }
              const consensusCount = detectionHistory.current.filter((h) => h.length > 0).length;
              const hasConsensus = consensusCount >= CONSENSUS_THRESHOLD;

              // Match current detections with persistent boxes for smoothing
              const nextPersistence: { box: BoundingBox, count: number }[] = [];
              rawFinal.forEach((newBox: BoundingBox) => {
                let found = false;
                for (const p of boxPersistence.current) {
                  const intersection = iou(p.box, newBox);
                  if (intersection > 0.5) {
                    nextPersistence.push({ box: newBox, count: Math.min(p.count + 1, 10) });
                    found = true;
                    break;
                  }
                }
                if (!found) nextPersistence.push({ box: newBox, count: 1 });
              });

              boxPersistence.current = nextPersistence;
              const minStable = isImageSource ? MIN_STABLE_FRAMES_IMAGE : MIN_STABLE_FRAMES_VIDEO;
              const stableBoxes = boxPersistence.current
                .filter((p) => p.count >= minStable && p.box.confidence >= threshold)
                .map((p) => p.box);

              setDetections(stableBoxes);

              // Alert only on stable + consensus + confirmed backend detections
              const alertBoxes = hasConsensus ? stableBoxes : [];

              console.log(`Detections received: ${rawFinal.length}, Stable: ${stableBoxes.length}, Alert candidates: ${alertBoxes.length}`);

              if (alertBoxes.length > 0) {
                const maxConf = Math.max(...alertBoxes.map(d => d.confidence));
                setDetectionResult(`Accident Detected! ${(maxConf * 100).toFixed(0)}%`);
                console.log(`Alert condition met. Max confidence: ${maxConf}, consensus: ${consensusCount}/${MAX_HISTORY}`);

                const now = Date.now();

                // One alert + posture record per accident event (per video/image upload)
                if (!alertPublishedForEventRef.current) {
                  alertPublishedForEventRef.current = true;
                  lastAlertTimeRef.current = now;

                  // Create annotated image with bounding boxes for the alert
                  let annotatedDataUrl = lastCapturedImageRef.current;
                  const media = imageRef.current || videoRef.current;

                  console.log(`Attempting alert. Media: ${!!media}, ImageRef: ${!!lastCapturedImageRef.current}`);

                  if (media && lastCapturedImageRef.current) {
                    const tempCanvas = document.createElement('canvas');
                    const img = new Image();
                    img.src = lastCapturedImageRef.current;
                    img.onload = () => {
                      console.log("Alert image loaded, starting annotation...");
                      tempCanvas.width = img.width;
                      tempCanvas.height = img.height;
                      const tctx = tempCanvas.getContext('2d');
                      if (tctx) {
                        tctx.drawImage(img, 0, 0);
                        tctx.strokeStyle = '#ff0000';
                        tctx.lineWidth = 10;
                        alertBoxes.forEach((box: BoundingBox) => {
                          tctx.strokeRect(box.x, box.y, box.width, box.height);
                          tctx.fillStyle = '#ff0000';
                          tctx.font = 'bold 40px Arial';
                          tctx.fillText(`Accident ${(box.confidence * 100).toFixed(0)}%`, box.x, box.y - 10);
                        });
                        annotatedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);
                      }

                      console.log("Publishing alert to dashboards...");
                      void (async () => {
                      const resolvedLocation = await resolveAccidentLocation({
                        manual: getManualLocationInput(),
                        useGps: preferGps && !getManualLocationInput(),
                        videoFilename: videoFilenameRef.current,
                      });
                      accidentLocationRef.current = resolvedLocation;
                      setActiveLocationLabel(
                        `${resolvedLocation.location} (${resolvedLocation.source.toUpperCase()})`
                      );
                      const hospitalRec = await detectAccident(
                        resolvedLocation.lat,
                        resolvedLocation.lon,
                        toApiSeverity(confidenceSeverity),
                        resolvedLocation.location
                      );
                      const policeRec = await fetchNearestPolice(
                        resolvedLocation.lat,
                        resolvedLocation.lon,
                        toPoliceApiSeverity(confidenceSeverity),
                        resolvedLocation.location
                      );
                      const nearest = hospitalRec?.nearestHospital;
                      const nearestPolice = policeRec?.nearestPoliceStation;
                      const alertPosture = resolvePostureForVideo(
                        videoFilenameRef.current,
                        lastPostureRef.current
                      );
                      const confidenceSeverity =
                        maxConf > 0.8 ? "Critical" : maxConf > 0.7 ? "High" : "Medium";
                      const locationLabel = resolvedLocation.location;
                      const eventKey = `${videoFilenameRef.current || "media"}:${locationLabel}`;
                      publishAccidentAlert({
                        id: `acc-${now}`,
                        createdAt: new Date().toISOString(),
                        eventKey,
                        severity: resolveAlertSeverity(confidenceSeverity, alertPosture),
                        confidence: maxConf,
                        lat: resolvedLocation.lat,
                        lng: resolvedLocation.lon,
                        location: locationLabel,
                        assignedHospital: nearest?.name ?? "Searching…",
                        assignedHospitalLat: nearest?.latitude,
                        assignedHospitalLng: nearest?.longitude,
                        assignedHospitalAddress: nearest?.address,
                        assignedHospitalPhone: nearest?.phone,
                        hospitalMapsUrl: nearest?.maps_url,
                        isHospitalRegistered: hospitalRec?.integration?.registered ?? false,
                        integrationMessage: hospitalRec?.integration?.registered
                          ? hospitalRec?.integration?.message
                          : undefined,
                        hospitalSelectionReason: nearest?.selection_reason,
                        routeDistanceKm: hospitalRec?.route?.distance_km,
                        etaMinutes: hospitalRec?.route?.eta_minutes,
                        routePolyline: hospitalRec?.route?.polyline,
                        assignedPoliceStation: nearestPolice?.name ?? "Searching…",
                        assignedPoliceLat: nearestPolice?.latitude,
                        assignedPoliceLng: nearestPolice?.longitude,
                        assignedPoliceAddress: nearestPolice?.address,
                        assignedPolicePhone: nearestPolice?.phone,
                        policeMapsUrl: nearestPolice?.maps_url,
                        isPoliceRegistered: policeRec?.integration?.registered ?? false,
                        policeIntegrationMessage: policeRec?.integration?.message,
                        policeSelectionReason: nearestPolice?.selection_reason,
                        policeRouteDistanceKm: policeRec?.route?.distance_km,
                        policeEtaMinutes: policeRec?.route?.eta_minutes,
                        policeRoutePolyline: policeRec?.route?.polyline,
                        injured: alertPosture?.persons_detected
                          ? Math.max(alertPosture.persons_detected, 1)
                          : Math.floor(Math.random() * 3) + 1,
                        vehicles: Math.floor(Math.random() * 2) + 1,
                        roadType: "Highway",
                        photoDataUrl: annotatedDataUrl || undefined,
                        source: imageRef.current ? "image" : "video",
                        hospitalStatus: "Pending",
                        trafficStatus: "Road Blocked",
                        investigationStatus: "Pending",
                        isNew: true,
                        postureAnalysis: alertPosture ?? undefined,
                      });

                      if (!accidentNotifiedRef.current) {
                        accidentNotifiedRef.current = true;
                        let severity: "High" | "Medium" | "Low" = "Medium";
                        if (maxConf > 0.75) severity = "High";
                        onAccidentDetected?.({
                          videoFilename: videoFilenameRef.current,
                          severity,
                          location: {
                            location: resolvedLocation.location,
                            lat: resolvedLocation.lat,
                            lon: resolvedLocation.lon,
                          },
                          locationSource: resolvedLocation.source,
                        });
                      }

                      toast({
                        title: "🚨 Accident Alert Sent",
                        description: "Hospital and Police dashboards have been notified.",
                        variant: "destructive",
                      });
                      console.log("Alert published successfully.");
                      })();
                    };
                    img.onerror = (e) => {
                      console.error("Failed to load alert image for annotation", e);
                    };
                  } else {
                    console.warn("Skipping alert: Media or Captured Image missing.");
                    alertPublishedForEventRef.current = false;
                  }
                }
              } else if (rawFinal.length > 0) {
                setDetectionResult(`Monitoring... (${consensusCount}/${CONSENSUS_THRESHOLD} frames)`);
              } else {
                setDetectionResult("Monitoring Feed...");
              }
            }
          } catch (err) {
            console.error("Parse Error:", err);
          }
        };

        ws.onclose = (event) => {
          setWsConnected(false);
          setIsModelLoading(false);
          if (!event.wasClean) {
            setDebugInfo(`Err: Connection Lost (Code: ${event.code})`);
          } else {
            setDebugInfo("Backend Disconnected");
          }
          retryCount++;
          setTimeout(connectWS, 3000);
        };

        ws.onerror = (err) => {
          console.error("WebSocket Error Detected:", err);
          setDebugInfo(`Connection Failed. check browser console.`);
        };
      } catch (e) {
        console.error("WebSocket Construction Failed:", e);
        setDebugInfo("WS init failed.");
      }
    };

    // Small delay to ensure component is settled
    const timer = setTimeout(connectWS, 1000);
    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  // Use existing drawBoundingBoxes logic...
  const drawBoundingBoxes = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;

    // Support either image or video source
    const image = imageRef.current;
    const video = videoRef.current;
    const mediaElement = image || video;

    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!mediaElement || detections.length === 0) return;
    if (image && (!image.complete || image.naturalWidth === 0)) return;
    if (video && (video.readyState < 2)) return;

    const container = overlayCanvas.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = containerRect.width * dpr;
    overlayCanvas.height = containerRect.height * dpr;
    ctx.scale(dpr, dpr);

    const naturalWidth = image ? image.naturalWidth : (video ? video.videoWidth : 0);
    const naturalHeight = image ? image.naturalHeight : (video ? video.videoHeight : 0);

    if (!naturalWidth || !naturalHeight) return;

    const mediaAspect = naturalWidth / naturalHeight;
    const containerAspect = containerRect.width / containerRect.height;
    let displayWidth: number, displayHeight: number, offsetX: number, offsetY: number;

    if (mediaAspect > containerAspect) {
      displayWidth = containerRect.width;
      displayHeight = containerRect.width / mediaAspect;
      offsetX = 0;
      offsetY = (containerRect.height - displayHeight) / 2;
    } else {
      displayWidth = containerRect.height * mediaAspect;
      displayHeight = containerRect.height;
      offsetX = (containerRect.width - displayWidth) / 2;
      offsetY = 0;
    }

    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;

    detections.forEach((detection) => {
      const x = offsetX + detection.x * scaleX;
      const y = offsetY + detection.y * scaleY;
      const width = detection.width * scaleX;
      const height = detection.height * scaleY;

      if (width <= 0 || height <= 0) return;

      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, width, height);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);

      ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
      ctx.fillRect(x, y, width, height);

      const labelText = `${detection.label} ${(detection.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 16px Arial, sans-serif';
      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const textHeight = 22;
      const padding = 8;

      const labelX = Math.max(0, Math.min(x, containerRect.width - textWidth - padding * 2));
      const labelY = Math.max(textHeight + padding * 2, y);

      ctx.fillStyle = '#2563eb';
      ctx.fillRect(labelX, labelY - textHeight - padding * 2, textWidth + padding * 2, textHeight + padding * 2);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, labelX + padding, labelY - padding);
    });
  }, [detections]);

  // Consolidate drawing effects: draw whenever detections or coordinate mode change
  useEffect(() => {
    const handleResize = () => requestAnimationFrame(() => drawBoundingBoxes());
    window.addEventListener('resize', handleResize);

    if (detections.length >= 0) {
      requestAnimationFrame(() => drawBoundingBoxes());
    }

    return () => window.removeEventListener('resize', handleResize);
  }, [detections, coordMode, drawBoundingBoxes, uploadedImage, uploadedVideo]);

  // Notify parent once per upload (fallback if alert path didn't fire)
  useEffect(() => {
    if (detectionResult && detectionResult.includes('Detected') && !detectionResult.includes('No')) {
      if (!accidentNotifiedRef.current && accidentLocationRef.current) {
        accidentNotifiedRef.current = true;
        let severity: "High" | "Medium" | "Low" = "Medium";
        const match = detectionResult.match(/\d{2}/);
        if (match && parseInt(match[0]) > 75) {
          severity = "High";
        }
        const loc = accidentLocationRef.current;
        onAccidentDetected?.({
          videoFilename,
          severity,
          location: { location: loc.location, lat: loc.lat, lon: loc.lon },
          locationSource: loc.source,
        });
      }
    }
  }, [detectionResult, videoFilename, onAccidentDetected]);

  // Removed redundant redrawing effect

  // Processing logic
  const processFrame = useCallback(async (
    sourceCanvas: HTMLCanvasElement,
    sourceName: string
  ) => {
    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      // Send to backend via WS with current sensitivity threshold
      const dataUrl = sourceCanvas.toDataURL('image/jpeg', 0.8);
      lastCapturedImageRef.current = dataUrl;
      wsRef.current.send(JSON.stringify({
        image: dataUrl,
        threshold: threshold
      }));

    } catch (err) {
      console.error("WebSocket Send Error:", err);
    }
  }, [threshold]);

  const detectFrame = useCallback(async () => {
    if (!isLiveDetecting) return;

    const video = videoRef.current;
    const now = Date.now();

    // Check if we can/should process this frame
    const shouldProcess =
      video &&
      !video.paused &&
      !video.ended &&
      video.readyState >= 2 &&
      wsConnected &&
      !isProcessingFrame.current &&
      (now - lastFrameTimeRef.current >= 200);

    if (shouldProcess) {
      lastFrameTimeRef.current = now;
      isProcessingFrame.current = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          await processFrame(canvas, 'video');
        }
      } catch (e) {
        console.error("Frame processing error:", e);
      } finally {
        isProcessingFrame.current = false;
      }
    }

    // Always reschedule if still detecting, even if video is paused
    // This ensures detection kicks in as soon as someone hits play
    requestRef.current = requestAnimationFrame(detectFrame);
  }, [isLiveDetecting, wsConnected, processFrame]);

  useEffect(() => {
    if (isLiveDetecting) {
      detectFrame();
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isLiveDetecting, detectFrame]);

  // Consolidant draw effect (already handled above)

  const detectAccident = async () => {
    if (!uploadedImage || !wsConnected) return;
    setIsDetecting(true);
    const img = new Image();
    img.src = uploadedImage;
    await new Promise(r => img.onload = r);

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      await processFrame(canvas, 'image');
    }
    setIsDetecting(false);
  };

  // ... (Other handlers identical to before: handleFileUpload, toggleLiveDetection, etc.)
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setVideoFilename(file.name);
    accidentNotifiedRef.current = false;
    alertPublishedForEventRef.current = false;
    postureLockedRef.current = false;
    lastPostureRef.current = null;
    setPostureResult(null);
    accidentLocationRef.current = null;
    setActiveLocationLabel(null);
    onAccidentReset?.();
    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
      const videoUrl = URL.createObjectURL(file);
      setUploadedVideo(videoUrl);
      setUploadedImage(null);
      setDetectionResult(null);
      setDetections([]);
      boxPersistence.current = [];
      detectionHistory.current = [];
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
        setUploadedVideo(null);
        setDetectionResult(null);
        setDetections([]);
        boxPersistence.current = [];
        detectionHistory.current = [];
      }
      reader.readAsDataURL(file);
    }
  };

  const toggleLiveDetection = async () => {
    const newState = !isLiveDetecting;
    setIsLiveDetecting(newState);

    if (newState) {
      setDetectionResult("Live Detection Enabled");
      if (videoRef.current) {
        // Reset to beginning if at the end
        if (videoRef.current.ended) {
          videoRef.current.currentTime = 0;
        }
        try {
          await videoRef.current.play();
        } catch (e) {
          console.error("Manual playback trigger failed:", e);
          // If play() fails here, we still have isLiveDetecting=true,
          // so it will start as soon as the user clicks the video's own play button
        }
      }
    } else {
      setDetectionResult(null);
      setDetections([]);
      if (videoRef.current) videoRef.current.pause();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Video Feed & Accident Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="flex gap-2">
          <input type="file" accept="image/*,video/*" onChange={handleFileUpload} ref={fileInputRef} className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="flex-1">
            <Upload className="h-4 w-4 mr-2" /> Upload Media
          </Button>
          {uploadedImage && (
            <Button onClick={detectAccident} disabled={isDetecting || !wsConnected} className="flex-1">
              {isDetecting ? "Detecting..." : <><Play className="h-4 w-4 mr-2" /> Verify Image</>}
            </Button>
          )}
          {uploadedVideo && (
            <Button onClick={toggleLiveDetection} disabled={!wsConnected} variant={isLiveDetecting ? "destructive" : "default"} className="flex-1">
              {isLiveDetecting ? "Stop Live" : "Start Live"}
            </Button>
          )}
        </div>

        {/* Accident Location */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
              <MapPin className="h-4 w-4" />
              Accident Location
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseGps}
              disabled={gpsLoading}
              className="gap-1 border-blue-300 text-blue-700"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              {gpsLoading ? "Getting GPS..." : "Use My GPS"}
            </Button>
          </div>
          <Input
            placeholder="Location name (e.g. Kathipara Junction)"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Latitude"
              value={locationLat}
              onChange={(e) => setLocationLat(e.target.value)}
              type="number"
              step="any"
            />
            <Input
              placeholder="Longitude"
              value={locationLng}
              onChange={(e) => setLocationLng(e.target.value)}
              type="number"
              step="any"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-blue-700 cursor-pointer">
            <input
              type="checkbox"
              checked={preferGps}
              onChange={(e) => setPreferGps(e.target.checked)}
              className="rounded"
            />
            Use GPS when coordinates are not entered (overrides demo video map)
          </label>
          {activeLocationLabel && (
            <p className="text-xs text-blue-600 font-medium">Active: {activeLocationLabel}</p>
          )}
          {!locationLat && !locationLng && !preferGps && videoFilename && (
            <p className="text-xs text-muted-foreground">
              Demo video location will be used for {videoFilename}
            </p>
          )}
        </div>

        {/* Sensitivity Control moved above buttons */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Sensitivity: {(threshold * 100).toFixed(0)}% (higher = fewer false alerts)
            </Label>
            <span className="text-[10px] text-slate-400 font-mono">
              {debugInfo || "Model Ready"}
            </span>
          </div>
          <Slider
            value={[threshold]}
            onValueChange={(val) => setThreshold(val[0])}
            min={0.10}
            max={0.95}
            step={0.05}
          />
        </div>

        {detectionResult && (
          <Badge variant={detectionResult.includes('Detected') && !detectionResult.includes('No') ? 'destructive' : 'secondary'} className="w-full justify-center py-2 text-md">
            {detectionResult} {detections.length > 0 ? `(${detections.length} boxes)` : ''}
          </Badge>
        )}

        {postureResult && detections.length > 0 && isMeaningfulPosture(postureResult) && (
          <PostureAnalysisDisplay posture={postureResult} />
        )}

        <div className="relative w-full bg-slate-900 rounded-lg overflow-hidden" style={{ minHeight: '600px', height: '85vh' }}>
          {uploadedImage && <img ref={imageRef} src={uploadedImage} className="w-full h-full object-contain" />}
          {uploadedVideo && (
            <video
              ref={videoRef}
              src={uploadedVideo}
              controls
              muted
              playsInline
              className="w-full h-full object-contain"
              onPlay={() => setIsLiveDetecting(true)}
              onPause={() => {
                // Only stop if the user explicitly paused via video controls
                // and we aren't in the middle of a reset
              }}
              onEnded={() => setIsLiveDetecting(false)}
            />
          )}

          {(uploadedImage || uploadedVideo) && (
            <canvas ref={overlayCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 10, width: '100%', height: '100%' }} />
          )}

          {!uploadedImage && !uploadedVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white/60">Upload media to begin</p>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
};

export default VideoFeedPanel;

