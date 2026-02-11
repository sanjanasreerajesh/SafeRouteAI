import onnxruntime as ort
import os

MODEL_PATH = r"c:\Users\Priya dharshini\OneDrive\Desktop\accident detection\backend\best.onnx"

if not os.path.exists(MODEL_PATH):
    print(f"Model not found at {MODEL_PATH}")
else:
    session = ort.InferenceSession(MODEL_PATH)
    out = session.get_outputs()[0]
    print(f"Output name: {out.name}")
    print(f"Output shape: {out.shape}")
    print(f"Output type: {out.type}")
    
    # Check classes if metadata is available
    meta = session.get_modelmeta().custom_metadata_map
    print(f"Metadata: {meta}")
