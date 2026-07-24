"""
Posture Analysis Module
=======================
Isolated module for analyzing human posture within accident bounding boxes.
Uses MediaPipe Pose when available. If disabled or unavailable, returns Unknown
without affecting the accident detection pipeline.
"""

from __future__ import annotations

import os
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

# Set to "false" to disable posture analysis entirely
POSTURE_ENABLED = os.environ.get("POSTURE_ENABLED", "true").lower() != "false"

HISTORY_SIZE = 15
CONSECUTIVE_THRESHOLD = 10
MOTIONLESS_FRAMES = 8
MOTION_THRESHOLD = 0.015

# MediaPipe landmark indices
NOSE = 0
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26

STATUS_RISK_MAP = {
    "Stable": "Low",
    "Conscious": "Medium",
    "Possible Injury": "High",
    "Critical": "Critical",
    "Unknown": "Unknown",
}

_pose_landmarker = None
_mediapipe_available = False
_MODEL_FILENAME = "pose_landmarker_lite.task"


def _get_model_path() -> Optional[str]:
    module_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(module_dir, _MODEL_FILENAME)
    return model_path if os.path.isfile(model_path) else None


def _init_mediapipe():
    """Lazy-load MediaPipe Pose Landmarker (Tasks API)."""
    global _pose_landmarker, _mediapipe_available
    if _pose_landmarker is not None or not POSTURE_ENABLED:
        return

    try:
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python.core import base_options as base_opts

        model_path = _get_model_path()
        if not model_path:
            print(f"Posture Analysis: model not found ({_MODEL_FILENAME})")
            return

        options = vision.PoseLandmarkerOptions(
            base_options=base_opts.BaseOptions(model_asset_path=model_path),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=5,
            min_pose_detection_confidence=0.4,
            min_pose_presence_confidence=0.4,
            min_tracking_confidence=0.4,
        )
        _pose_landmarker = vision.PoseLandmarker.create_from_options(options)
        _mediapipe_available = True
        print("Posture Analysis: MediaPipe Pose Landmarker loaded")
    except Exception as exc:
        print(f"Posture Analysis: MediaPipe unavailable ({exc})")
        _mediapipe_available = False


def _visible(landmark, threshold: float = 0.5) -> bool:
    return landmark.visibility >= threshold


def _midpoint(a, b) -> Tuple[float, float]:
    return ((a.x + b.x) / 2, (a.y + b.y) / 2)


def _body_angle_from_vertical(shoulder_mid: Tuple[float, float], hip_mid: Tuple[float, float]) -> float:
    dx = hip_mid[0] - shoulder_mid[0]
    dy = hip_mid[1] - shoulder_mid[1]
    if abs(dy) < 1e-6:
        return 90.0
    angle_rad = np.arctan2(abs(dx), abs(dy))
    return float(np.degrees(angle_rad))


def _classify_single_pose(landmarks, body_angle: float) -> str:
    """Classify posture for one detected person."""
    nose = landmarks[NOSE]
    l_sh = landmarks[LEFT_SHOULDER]
    r_sh = landmarks[RIGHT_SHOULDER]
    l_hip = landmarks[LEFT_HIP]
    r_hip = landmarks[RIGHT_HIP]
    l_knee = landmarks[LEFT_KNEE]
    r_knee = landmarks[RIGHT_KNEE]

    sh_mid = _midpoint(l_sh, r_sh)
    hip_mid = _midpoint(l_hip, r_hip)

    head_above_shoulders = nose.y < min(l_sh.y, r_sh.y) - 0.02
    shoulders_above_hips = sh_mid[1] < hip_mid[1] - 0.02

    # Horizontal lying: body nearly parallel to ground
    if body_angle >= 55:
        return "Possible Injury"

    # Standing: vertical torso, head above shoulders
    if body_angle <= 25 and head_above_shoulders and shoulders_above_hips:
        torso_height = hip_mid[1] - sh_mid[1]
        if torso_height > 0.12:
            return "Stable"

    # Sitting: upright upper body, compact vertical span
    if body_angle <= 35 and head_above_shoulders:
        knee_visible = _visible(l_knee) or _visible(r_knee)
        if knee_visible:
            avg_knee_y = (l_knee.y + r_knee.y) / 2
            if avg_knee_y > hip_mid[1]:
                return "Conscious"
        if 0.08 <= (hip_mid[1] - sh_mid[1]) <= 0.18:
            return "Conscious"

    # Leaning / ambiguous upright
    if body_angle <= 40 and head_above_shoulders:
        return "Conscious"

    if body_angle >= 40:
        return "Possible Injury"

    return "Conscious"


def _detect_poses_in_crop(crop_bgr: np.ndarray) -> List[Dict[str, Any]]:
    """Run MediaPipe Pose Landmarker on accident crop."""
    _init_mediapipe()
    if not _mediapipe_available or _pose_landmarker is None:
        return []

    import mediapipe as mp

    h, w = crop_bgr.shape[:2]
    if h < 20 or w < 20:
        return []

    crop_rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=crop_rgb)
    result = _pose_landmarker.detect(mp_image)

    if not result.pose_landmarks:
        return []

    persons: List[Dict[str, Any]] = []
    for landmarks in result.pose_landmarks:
        key_points = [landmarks[NOSE], landmarks[LEFT_SHOULDER], landmarks[RIGHT_SHOULDER],
                      landmarks[LEFT_HIP], landmarks[RIGHT_HIP]]
        visible_count = sum(1 for p in key_points if _visible(p, 0.3))
        if visible_count < 3:
            continue

        sh_mid = _midpoint(landmarks[LEFT_SHOULDER], landmarks[RIGHT_SHOULDER])
        hip_mid = _midpoint(landmarks[LEFT_HIP], landmarks[RIGHT_HIP])
        body_angle = _body_angle_from_vertical(sh_mid, hip_mid)
        status = _classify_single_pose(landmarks, body_angle)

        persons.append({
            "status": status,
            "body_angle": round(body_angle, 1),
            "landmarks": [(p.x, p.y) for p in landmarks],
        })

    return persons


def _worst_status(statuses: List[str]) -> str:
    priority = {"Critical": 4, "Possible Injury": 3, "Conscious": 2, "Stable": 1, "Unknown": 0}
    if not statuses:
        return "Unknown"
    return max(statuses, key=lambda s: priority.get(s, 0))


def _compute_motion(current_landmarks: Optional[List], history: deque) -> str:
    if current_landmarks is None or len(history) < 3:
        return "Unknown"

    recent = list(history)[-5:]
    if len(recent) < 2:
        return "Unknown"

    movements = []
    for prev in recent:
        if prev is None:
            continue
        dists = []
        for i in range(min(len(current_landmarks), len(prev))):
            dx = current_landmarks[i][0] - prev[i][0]
            dy = current_landmarks[i][1] - prev[i][1]
            dists.append(np.sqrt(dx * dx + dy * dy))
        if dists:
            movements.append(np.mean(dists))

    if not movements:
        return "Unknown"

    avg_motion = float(np.mean(movements))
    if avg_motion < MOTION_THRESHOLD:
        return "Low"
    if avg_motion < MOTION_THRESHOLD * 3:
        return "Medium"
    return "High"


class PostureAnalyzer:
    """Per-connection analyzer with temporal smoothing."""

    def __init__(self):
        self.status_history: deque = deque(maxlen=HISTORY_SIZE)
        self.landmark_history: deque = deque(maxlen=HISTORY_SIZE)
        self.confirmed_status: str = "Unknown"
        self.motionless_counter: int = 0

    def analyze_posture(self, accident_crop: np.ndarray) -> Dict[str, Any]:
        """
        Analyze posture in a cropped accident region.

        Returns:
            { status, risk, body_angle, persons_detected, motion }
        """
        if not POSTURE_ENABLED:
            return self._unknown_result()

        if accident_crop is None or accident_crop.size == 0:
            return self._apply_temporal("Unknown", 0, 0, None)

        persons = _detect_poses_in_crop(accident_crop)

        if not persons:
            return self._apply_temporal("Unknown", 0, 0, None)

        frame_status = _worst_status([p["status"] for p in persons])
        avg_angle = round(float(np.mean([p["body_angle"] for p in persons])), 1)
        persons_count = len(persons)
        primary_landmarks = persons[0].get("landmarks")

        return self._apply_temporal(frame_status, avg_angle, persons_count, primary_landmarks)

    def _apply_temporal(
        self,
        frame_status: str,
        body_angle: float,
        persons_detected: int,
        landmarks: Optional[List],
    ) -> Dict[str, Any]:
        self.status_history.append(frame_status)
        self.landmark_history.append(landmarks)

        motion = _compute_motion(landmarks, self.landmark_history)

        # Motionless + lying -> escalate to Critical
        if frame_status == "Possible Injury" and motion == "Low":
            self.motionless_counter += 1
        else:
            self.motionless_counter = max(0, self.motionless_counter - 1)

        if self.motionless_counter >= MOTIONLESS_FRAMES:
            frame_status = "Critical"

        # Temporal confirmation: require 10 consecutive same statuses
        if len(self.status_history) >= CONSECUTIVE_THRESHOLD:
            recent = list(self.status_history)[-CONSECUTIVE_THRESHOLD:]
            if all(s == recent[0] for s in recent):
                self.confirmed_status = recent[0]

        status = self.confirmed_status if self.confirmed_status != "Unknown" else frame_status

        # Re-check critical override on confirmed status
        if self.motionless_counter >= MOTIONLESS_FRAMES:
            status = "Critical"

        return {
            "status": status,
            "risk": STATUS_RISK_MAP.get(status, "Unknown"),
            "body_angle": body_angle,
            "persons_detected": persons_detected,
            "motion": motion,
        }

    def _unknown_result(self) -> Dict[str, Any]:
        return {
            "status": "Unknown",
            "risk": "Unknown",
            "body_angle": 0,
            "persons_detected": 0,
            "motion": "Unknown",
        }

    def reset(self):
        self.status_history.clear()
        self.landmark_history.clear()
        self.confirmed_status = "Unknown"
        self.motionless_counter = 0


def analyze_posture(accident_crop: np.ndarray) -> Dict[str, Any]:
    """
    Stateless convenience wrapper (creates a new analyzer each call).
    Prefer PostureAnalyzer instance for temporal analysis across frames.
    """
    analyzer = PostureAnalyzer()
    return analyzer.analyze_posture(accident_crop)
