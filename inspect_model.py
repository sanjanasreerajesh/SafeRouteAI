import onnxruntime as ort
import os

MODEL_PATH = r"c:\Users\Priya dharshini\OneDrive\Desktop\accident detection\safroute-ai-prototype-main\safroute-ai-prototype-main\public\best.onnx"

if not os.path.exists(MODEL_PATH):
    print("Model not found")
else:
    session = ort.InferenceSession(MODEL_PATH)
    out = session.get_outputs()[0]
    print(f"Output name: {out.name}")
    print(f"Output shape: {out.shape}")
    print(f"Output type: {out.type}")
