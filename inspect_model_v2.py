import onnxruntime as ort
import numpy as np
import os

MODEL_PATH = r"c:\Users\Priya dharshini\OneDrive\Desktop\accident detection\safroute-ai-prototype-main\safroute-ai-prototype-main\public\best.onnx"

def inspect():
    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model not found at {MODEL_PATH}")
        return

    print(f"Inspecting: {MODEL_PATH}")
    session = ort.InferenceSession(MODEL_PATH)
    
    # Metadata
    for out in session.get_outputs():
        print(f"Output name: {out.name}, Shape: {out.shape}")
        
    # Dummy Inference to check values
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape # e.g. [1, 3, 640, 640]
    dummy_input = np.random.randn(1, 3, 640, 640).astype(np.float32)
    
    outputs = session.run(None, {input_name: dummy_input})
    preds = np.squeeze(outputs[0])
    
    print(f"Squeezed predictions shape: {preds.shape}")
    print(f"Sample prediction raw (first 10 values of first row): {preds[0][:10]}")
    
    # Check number of classes
    if len(preds.shape) == 2:
        num_cols = preds.shape[1]
        num_classes = num_cols - 5
        print(f"Detected number of classes: {num_classes}")
    else:
        print("Warning: Prediction shape is not 2D after squeeze. Different model format?")

if __name__ == "__main__":
    inspect()
