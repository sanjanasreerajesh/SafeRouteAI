import cv2
import numpy as np
import base64
import json
import os
from contextlib import asynccontextmanager

import onnxruntime as ort
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from database.session import init_db
from notifications.websocket_manager import hospital_ws_manager
from notifications.police_websocket_manager import police_ws_manager
from posture_analysis import PostureAnalyzer, POSTURE_ENABLED
from routers.detect_accident import router as detect_accident_router
from routers.hospital_registry import router as hospital_registry_router
from routers.nearest_police import router as nearest_police_router
from routers.police_registry import router as police_registry_router

load_dotenv()

# ================= CONFIG =================
IMG_SIZE = 640
CONF_THRES = 0.45
IOU_THRES = 0.45
ACCIDENT_CLASS_ID = 0
MIN_BOX_AREA_RATIO = 0.005  # ignore tiny boxes (common false positives)

# Temporal confirmation — require N consecutive frames before alerting
ACCIDENT_CONFIRM_FRAMES = 5   # ~1 sec at ~5 FPS

# ================= FASTAPI =================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database tables on startup."""
    init_db()
    print("Database initialized")
    yield


app = FastAPI(title="SafeRoute AI", lifespan=lifespan)

app.include_router(detect_accident_router)
app.include_router(hospital_registry_router)
app.include_router(nearest_police_router)
app.include_router(police_registry_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= MODEL LOAD =================
MODEL_PATH = "best.onnx"
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name

print("ONNX model loaded:", MODEL_PATH)

# ================= GLOBAL STATE =================
# (per-connection state lives inside websocket_endpoint)

# ================= UTILITIES =================
def letterbox(img, new_shape=(640, 640)):
    shape = img.shape[:2]
    ratio = min(new_shape[0] / shape[0], new_shape[1] / shape[1])

    new_unpad = (int(round(shape[1] * ratio)), int(round(shape[0] * ratio)))
    dw = new_shape[1] - new_unpad[0]
    dh = new_shape[0] - new_unpad[1]
    dw /= 2
    dh /= 2

    img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

    top, bottom = int(np.floor(dh)), int(np.ceil(dh))
    left, right = int(np.floor(dw)), int(np.ceil(dw))

    img = cv2.copyMakeBorder(
        img, top, bottom, left, right,
        cv2.BORDER_CONSTANT, value=(114, 114, 114)
    )

    return img, ratio, dw, dh

def preprocess(frame):
    img, ratio, dw, dh = letterbox(frame, (IMG_SIZE, IMG_SIZE))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = img.astype(np.float32) / 255.0
    img = np.transpose(img, (2, 0, 1))
    img = np.expand_dims(img, axis=0)
    return img, ratio, dw, dh

# ================= HEALTH =================
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": MODEL_PATH,
        "input_shape": session.get_inputs()[0].shape,
        "output_shape": session.get_outputs()[0].shape
    }


@app.get("/api/geocode/reverse")
async def reverse_geocode(lat: float, lon: float):
    """Reverse geocode coordinates to a human-readable place name."""
    import json
    import urllib.error
    import urllib.request

    url = (
        f"https://nominatim.openstreetmap.org/reverse?"
        f"lat={lat}&lon={lon}&format=json&addressdetails=1&zoom=18"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "SafRoute-AccidentDetection/1.0", "Accept-Language": "en"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Reverse geocode failed: {exc}")
        return {"location": f"{lat:.4f}, {lon:.4f}", "lat": lat, "lon": lon}

    location = data.get("display_name")
    if not location:
        addr = data.get("address", {})
        parts = [
            addr.get("road") or addr.get("pedestrian") or addr.get("footway"),
            addr.get("suburb") or addr.get("neighbourhood") or addr.get("quarter"),
            addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county"),
            addr.get("state"),
        ]
        location = ", ".join(p for p in parts if p)

    return {
        "location": location or f"{lat:.4f}, {lon:.4f}",
        "lat": lat,
        "lon": lon,
    }

# ================= WEBSOCKET =================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    accident_frame_counter = 0
    posture_sent_for_event = False
    posture_analyzer = PostureAnalyzer() if POSTURE_ENABLED else None
    await websocket.accept()
    print("WebSocket connected")

    try:
        while True:
            msg = await websocket.receive_text()
            data = json.loads(msg)
            image_data = data.get("image")

            if not image_data or "," not in image_data:
                await websocket.send_json({"detections": []})
                continue

            _, encoded = image_data.split(",", 1)
            frame = cv2.imdecode(
                np.frombuffer(base64.b64decode(encoded), np.uint8),
                cv2.IMREAD_COLOR
            )

            if frame is None:
                await websocket.send_json({"detections": []})
                continue

            h, w = frame.shape[:2]
            frame_area = h * w
            client_threshold = float(data.get("threshold", CONF_THRES))
            effective_thres = max(CONF_THRES, client_threshold)

            input_tensor, ratio, dw, dh = preprocess(frame)
            preds = session.run(None, {input_name: input_tensor})[0]
            preds = np.squeeze(preds)

            boxes, scores = [], []

            for det in preds:
                cx, cy, bw, bh = det[:4]
                obj_conf = det[4]
                class_scores = det[5:]

                class_id = int(np.argmax(class_scores))
                class_conf = class_scores[class_id]
                confidence = float(obj_conf * class_conf)

                if class_id != ACCIDENT_CLASS_ID:
                    continue
                if confidence < effective_thres:
                    continue

                # ---- BBOX RESTORATION ----
                x1 = cx - bw / 2
                y1 = cy - bh / 2
                x2 = cx + bw / 2
                y2 = cy + bh / 2

                x1 -= dw
                x2 -= dw
                y1 -= dh
                y2 -= dh

                x1 /= ratio
                y1 /= ratio
                x2 /= ratio
                y2 /= ratio

                x1, y1, x2, y2 = map(int, [x1, y1, x2, y2])

                x1 = max(0, min(x1, w))
                y1 = max(0, min(y1, h))
                x2 = max(0, min(x2, w))
                y2 = max(0, min(y2, h))

                if x2 <= x1 or y2 <= y1:
                    continue

                box_area = (x2 - x1) * (y2 - y1)
                if box_area < frame_area * MIN_BOX_AREA_RATIO:
                    continue

                boxes.append([x1, y1, x2 - x1, y2 - y1])
                scores.append(confidence)

            # ================= TEMPORAL LOGIC =================
            detections = []

            if boxes:
                accident_frame_counter += 1
            else:
                accident_frame_counter = 0
                posture_sent_for_event = False

            # Confirm accident only after N consecutive frames; send unconfirmed
            # boxes meanwhile so the frontend can build frame consensus.
            indices = cv2.dnn.NMSBoxes(
                boxes, scores, effective_thres, IOU_THRES
            ) if boxes else []

            confirmed = accident_frame_counter >= ACCIDENT_CONFIRM_FRAMES

            if len(indices) > 0:
                for i in indices.flatten():
                    detections.append({
                        "x": boxes[i][0],
                        "y": boxes[i][1],
                        "width": boxes[i][2],
                        "height": boxes[i][3],
                        "confidence": round(scores[i], 2),
                        "class_id": ACCIDENT_CLASS_ID,
                        "confirmed": confirmed,
                    })

            if not confirmed:
                posture_sent_for_event = False
                if posture_analyzer:
                    posture_analyzer.reset()

            # Posture analysis only on the first confirmed frame (one per accident event)
            response = {"detections": detections}
            if (
                detections
                and posture_analyzer is not None
                and not posture_sent_for_event
                and accident_frame_counter == ACCIDENT_CONFIRM_FRAMES
            ):
                best = max(detections, key=lambda d: d["confidence"])
                x, y, bw, bh = best["x"], best["y"], best["width"], best["height"]
                posture_result = posture_analyzer.analyze_posture(
                    frame, bbox=(x, y, bw, bh)
                )
                response["posture"] = posture_result
                response["accident"] = True
                response["confidence"] = best["confidence"]
                response["posture_final"] = True
                posture_sent_for_event = True

            await websocket.send_json(response)

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print("WebSocket error:", e)


# ================= HOSPITAL WEBSOCKET (real-time alerts) =================
@app.websocket("/ws/hospital/{registry_id}")
async def hospital_alert_websocket(websocket: WebSocket, registry_id: str):
    """Registered hospitals connect here to receive live accident alerts."""
    await hospital_ws_manager.connect(registry_id, websocket)
    print(f"Hospital WebSocket connected: {registry_id}")
    try:
        while True:
            # Keep connection alive; hospitals may send acks
            await websocket.receive_text()
    except WebSocketDisconnect:
        hospital_ws_manager.disconnect(registry_id, websocket)
        print(f"Hospital WebSocket disconnected: {registry_id}")


# ================= POLICE WEBSOCKET (real-time alerts) =================
@app.websocket("/ws/police/{registry_id}")
async def police_alert_websocket(websocket: WebSocket, registry_id: str):
    """Registered police stations connect here to receive live accident alerts."""
    await police_ws_manager.connect(registry_id, websocket)
    print(f"Police WebSocket connected: {registry_id}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        police_ws_manager.disconnect(registry_id, websocket)
        print(f"Police WebSocket disconnected: {registry_id}")


# ================= RUN =================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
