import { useState, useRef, useEffect, useCallback } from "react";
import { Video, Info, Upload, Play, AlertTriangle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { publishAccidentAlert } from "@/lib/accidentAlerts";
import { getLocationForVideo, recommendHospital } from "@/lib/emergencyResponse";

export interface AccidentDetectionInfo {
  videoFilename: string;
  severity: "High" | "Medium" | "Low";
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

const MAX_HISTORY = 5;
const CONSENSUS_THRESHOLD = 3; // Must detect in 3/5 frames to alert

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
  const [originalImageSize, setOriginalImageSize] = useState<{ width: number; height: number } | null>(null);

  // Detection Threshold (Sensitivity)
  const [threshold, setThreshold] = useState(0.55);

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
  const lastCapturedImageRef = useRef<string | null>(null);
  const videoFilenameRef = useRef<string>("");
  const accidentNotifiedRef = useRef(false);

  useEffect(() => {
    videoFilenameRef.current = videoFilename;
  }, [videoFilename]);

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
              const media = imageRef.current || videoRef.current;
              const isImageSource = !!imageRef.current;
              const naturalWidth = media instanceof HTMLImageElement ? media.naturalWidth : (media?.videoWidth || 640);
              const naturalHeight = media instanceof HTMLImageElement ? media.naturalHeight : (media?.videoHeight || 640);

              const rawFinal = data.detections
                .map((d: {x: number, y: number, width: number, height: number}) => ({
                  ...d,
                  x: d.x,
                  y: d.y,
                  width: d.width,
                  height: d.height,
                  label: 'Accident'
                }));

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
              // For images, we show boxes immediately (count >= 1). For video, we wait for stability (count >= 2).
              const stableBoxes = boxPersistence.current.filter(p => isImageSource ? p.count >= 1 : p.count >= 2).map(p => p.box);

              setDetections(stableBoxes);

              // Trigger on stable boxes (smoothing) OR raw detections above user threshold
              const alertBoxes = stableBoxes.length > 0 ? stableBoxes : rawFinal.filter((d: BoundingBox) => d.confidence >= threshold);

              console.log(`Detections received: ${rawFinal.length}, Stable: ${stableBoxes.length}, Alert candidates: ${alertBoxes.length}`);

              if (alertBoxes.length > 0) {
                const maxConf = Math.max(...alertBoxes.map(d => d.confidence));
                setDetectionResult(`Accident Detected! ${(maxConf * 100).toFixed(0)}%`);
                console.log(`Alert condition met. Max confidence: ${maxConf}`);

                const now = Date.now();
                // Cooldown: 5 seconds for testing/responsiveness
                if (now - lastAlertTimeRef.current > 5000) {
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
                      const mappedLocation = getLocationForVideo(videoFilenameRef.current);
                      const hospitalRec = mappedLocation
                        ? recommendHospital(mappedLocation.lat, mappedLocation.lon)
                        : null;
                      publishAccidentAlert({
                        id: `acc-${now}`,
                        createdAt: new Date().toISOString(),
                        severity: maxConf > 0.8 ? "Critical" : (maxConf > 0.7 ? "High" : "Medium"),
                        confidence: maxConf,
                        lat: mappedLocation?.lat ?? 13.0827,
                        lng: mappedLocation?.lon ?? 80.2707,
                        location: mappedLocation
                          ? `${mappedLocation.location}, Chennai`
                          : "Anna Salai, Chennai",
                        assignedHospital: hospitalRec?.name ?? "Apollo Hospital",
                        assignedPoliceStation: "Teynampet Police Station",
                        injured: Math.floor(Math.random() * 3) + 1,
                        vehicles: Math.floor(Math.random() * 2) + 1,
                        roadType: "Highway",
                        photoDataUrl: annotatedDataUrl || undefined,
                        source: imageRef.current ? "image" : "video",
                        hospitalStatus: "Pending",
                        trafficStatus: "Road Blocked",
                        investigationStatus: "Pending",
                        isNew: true
                      });

                      toast({
                        title: "🚨 Accident Alert Sent",
                        description: "Hospital and Police dashboards have been notified.",
                        variant: "destructive",
                      });
                      console.log("Alert published successfully.");
                    };
                    img.onerror = (e) => {
                      console.error("Failed to load alert image for annotation", e);
                    };
                  } else {
                    console.warn("Skipping alert: Media or Captured Image missing.");
                  }
                } else {
                  console.log(`Alert skipped: Cooldown active (${Date.now() - lastAlertTimeRef.current}ms since last)`);
                }
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

  // Notify parent once per upload so the emergency dashboard stays visible
  useEffect(() => {
    if (detectionResult && detectionResult.includes('Detected') && !detectionResult.includes('No')) {
      if (!accidentNotifiedRef.current) {
        accidentNotifiedRef.current = true;
        let severity: "High" | "Medium" | "Low" = "Medium";
        const match = detectionResult.match(/\d{2}/);
        if (match && parseInt(match[0]) > 75) {
          severity = "High";
        }
        onAccidentDetected?.({ videoFilename, severity });
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

        {/* Sensitivity Control moved above buttons */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Sensitivity: {(threshold * 100).toFixed(0)}%
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

