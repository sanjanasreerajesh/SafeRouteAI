import cv2
import numpy as np
import onnxruntime as ort

class YOLOv5Detector:
    def __init__(self, model_path, input_size=(640, 640)):
        self.input_size = input_size
        self.session = ort.InferenceSession(
            model_path, providers=["CPUExecutionProvider"]
        )
        self.input_name = self.session.get_inputs()[0].name

    def letterbox(self, img, new_shape=(640, 640)):
        shape = img.shape[:2]
        ratio = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
        new_unpad = (int(round(shape[1] * ratio)), int(round(shape[0] * ratio)))
        dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
        dw /= 2
        dh /= 2

        img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

        top, bottom = int(dh - 0.1), int(dh + 0.1)
        left, right = int(dw - 0.1), int(dw + 0.1)

        img = cv2.copyMakeBorder(
            img, top, bottom, left, right,
            cv2.BORDER_CONSTANT, value=(114, 114, 114)
        )

        return img, ratio, dw, dh

    def preprocess(self, frame):
        img, ratio, dw, dh = self.letterbox(frame, self.input_size)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        img = np.expand_dims(img, axis=0)
        return img, ratio, dw, dh

    def detect(self, frame, conf_threshold=0.6, iou_threshold=0.45):
        h, w = frame.shape[:2]
        input_tensor, ratio, dw, dh = self.preprocess(frame)

        preds = self.session.run(None, {self.input_name: input_tensor})[0]
        preds = np.squeeze(preds)

        boxes, scores = [], []

        for det in preds:
            obj_conf = det[4]
            if obj_conf < conf_threshold:
                continue

            class_scores = det[5:]
            class_id = np.argmax(class_scores)

            # ✅ only accident class
            if class_id != 0:
                continue

            conf = obj_conf * class_scores[class_id]
            if conf < conf_threshold:
                continue

            x, y, bw, bh = det[:4]

            x1 = int((x - bw / 2 - dw) / ratio)
            y1 = int((y - bh / 2 - dh) / ratio)
            x2 = int((x + bw / 2 - dw) / ratio)
            y2 = int((y + bh / 2 - dh) / ratio)

            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            boxes.append([x1, y1, x2 - x1, y2 - y1])
            scores.append(float(conf))

        indices = cv2.dnn.NMSBoxes(
            boxes, scores, conf_threshold, iou_threshold
        )

        results = []
        if len(indices) > 0:
            for i in indices.flatten():
                results.append({
                    "x": boxes[i][0],
                    "y": boxes[i][1],
                    "width": boxes[i][2],
                    "height": boxes[i][3],
                    "confidence": round(scores[i] * 100, 2),
                    "label": "Accident"
                })

        return results


