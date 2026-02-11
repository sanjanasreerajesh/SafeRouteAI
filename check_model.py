import onnxruntime as ort
import numpy as np

sess = ort.InferenceSession(r"c:\Users\Priya dharshini\OneDrive\Desktop\accident detection\safroute-ai-prototype-main\safroute-ai-prototype-main\public\best.onnx")
out_shape = sess.get_outputs()[0].shape
dummy = np.zeros((1, 3, 640, 640), dtype=np.float32)
res = sess.run(None, {sess.get_inputs()[0].name: dummy})[0]

with open("model_results.txt", "w") as f:
    f.write(f"SHAPE: {out_shape}\n")
    f.write(f"RES_SHAPE: {res.shape}\n")
    if len(res.shape) == 3:
        f.write(f"SAMPLE: {res[0,0,:10]}\n")
        f.write(f"NUM_CLASSES: {res.shape[2] - 5}\n")
    elif len(res.shape) == 2:
        f.write(f"SAMPLE: {res[0,:10]}\n")
        f.write(f"NUM_CLASSES: {res.shape[1] - 5}\n")
