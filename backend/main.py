import cv2
import numpy as np
import base64
import json
import onnxruntime as ort
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# ================= CONFIG =================
IMG_SIZE = 640
CONF_THRES = 0.6
IOU_THRES = 0.45
ACCIDENT_CLASS_ID = 0

# 🔑 TEMPORAL CONFIRMATION (IMPORTANT)
ACCIDENT_CONFIRM_FRAMES = 6   # ~0.5 sec at ~12 FPS

# ================= FASTAPI =================
app = FastAPI()

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
accident_frame_counter = 0

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

# ================= WEBSOCKET =================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global accident_frame_counter
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
                if confidence < CONF_THRES:
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

                boxes.append([x1, y1, x2 - x1, y2 - y1])
                scores.append(confidence)

            # ================= TEMPORAL LOGIC =================
            detections = []

            if boxes:
                accident_frame_counter += 1
            else:
                accident_frame_counter = 0

            # 🚨 Confirm accident only after N frames
            if accident_frame_counter >= ACCIDENT_CONFIRM_FRAMES:
                indices = cv2.dnn.NMSBoxes(
                    boxes, scores, CONF_THRES, IOU_THRES
                )

                if len(indices) > 0:
                    for i in indices.flatten():
                        detections.append({
                            "x": boxes[i][0],
                            "y": boxes[i][1],
                            "width": boxes[i][2],
                            "height": boxes[i][3],
                            "confidence": round(scores[i], 2),
                            "class_id": ACCIDENT_CLASS_ID,
                            "confirmed": True
                        })
            else:
                detections = []  # ❌ suppress early detections

            await websocket.send_json({"detections": detections})

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print("WebSocket error:", e)

# ================= RUN =================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
