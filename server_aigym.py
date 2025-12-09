import base64
import os
import threading
import time
from datetime import datetime
from typing import Dict, Tuple

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from dotenv import load_dotenv

# 초경량 YOLO 기반 ai gym 모델을 사용한 피드백 서버
# 기존 UI와 동일한 프로토콜을 유지하지만 WS 경로를 /ws/feedback_aigym 으로 분리

try:
    from ultralytics import YOLO
except Exception as e:
    YOLO = None
    print("WARNING: ultralytics 가 설치되지 않았습니다. requirements.txt 를 업데이트하고 설치하세요.")


load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL_PATH = os.getenv("AIGYM_MODEL_PATH", "./yolov11n-pose.pt")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def shorten_feedback(text: str, limit: int = 28) -> str:
    if not text:
        return ""
    first = text.split("\n")[0].split("。")[0].split(".")[0].split("!")[0].split("?")[0]
    trimmed = first.strip()
    if len(trimmed) > limit:
        trimmed = trimmed[:limit].rstrip() + "…"
    return trimmed


def calculate_angle(a, b, c) -> float:
    a = np.array([a[0] - b[0], a[1] - b[1], 0.0])
    c = np.array([c[0] - b[0], c[1] - b[1], 0.0])
    dot = np.dot(a, c)
    mag = np.linalg.norm(a) * np.linalg.norm(c)
    if mag == 0:
        return 0.0
    return float(np.degrees(np.arccos(np.clip(dot / mag, -1.0, 1.0))))


def draw_skeleton(frame: np.ndarray, kpts: Dict[str, tuple]) -> np.ndarray:
    """COCO keypoint 스켈레톤을 그린다."""
    pairs = [
        ("l_shoulder", "r_shoulder"),
        ("l_shoulder", "l_elbow"),
        ("l_elbow", "l_wrist"),
        ("r_shoulder", "r_elbow"),
        ("r_elbow", "r_wrist"),
        ("l_shoulder", "l_hip"),
        ("r_shoulder", "r_hip"),
        ("l_hip", "r_hip"),
        ("l_hip", "l_knee"),
        ("l_knee", "l_ankle"),
        ("r_hip", "r_knee"),
        ("r_knee", "r_ankle"),
    ]
    for p1, p2 in pairs:
        if p1 in kpts and p2 in kpts:
            x1, y1, _ = kpts[p1]; x2, y2, _ = kpts[p2]
            cv2.line(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 200, 255), 2)
    for name, (x, y, _) in kpts.items():
        cv2.circle(frame, (int(x), int(y)), 4, (0, 255, 0), -1)
    return frame


class AIGymAnalyzer:
    """YOLOv11 ai gym 모델 기반 피드백 생성기."""

    def __init__(self):
        self.model = self._load_model()
        self.coach_feedback = ""
        self.is_recording = False
        self.video_writer = None
        self.rep_count = 0
        self.is_squat_down = False
        self.min_knee_angle = 180

    def _load_model(self):
        if YOLO is None:
            return None
        if not os.path.exists(MODEL_PATH):
            print(f"WARNING: ai gym 모델 경로가 없습니다: {MODEL_PATH}")
        try:
            return YOLO(MODEL_PATH)
        except Exception as e:
            print(f"YOLO 모델 로드 실패: {e}")
            return None

    def start_recording(self):
        self.is_recording = True
        self.rep_count = 0
        self.is_squat_down = False
        self.min_knee_angle = 180
        if not os.path.exists("video"):
            os.makedirs("video")
        filename = datetime.now().strftime("%Y%m%d_%H%M")
        filepath = os.path.join("video", f"{filename}.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self.video_writer = cv2.VideoWriter(filepath, fourcc, 10.0, (640, 480))
        print(f"Recording Started: {filepath}")

    def stop_recording(self):
        self.is_recording = False
        if self.video_writer:
            self.video_writer.release()
            self.video_writer = None
        print("Recording Stopped")
        return "세션 종료. 요약 리포트는 추후 추가 예정입니다."

    def _extract_keypoints(self, frame) -> Dict[str, Tuple[float, float, float]]:
        """YOLO keypoints -> 필요한 관절 좌표 사전 반환."""
        if self.model is None:
            return {}
        results = self.model(frame, verbose=False)
        if not results or len(results) == 0:
            return {}
        result = results[0]
        if result.keypoints is None or len(result.keypoints) == 0:
            return {}

        # COCO keypoint 순서 기준 (0 nose ... 16 right_ankle)
        pts = result.keypoints.xy[0].cpu().numpy()
        def pt(idx):
            x, y = pts[idx]
            return (float(x), float(y), 0.0)

        return {
            "l_shoulder": pt(5),
            "r_shoulder": pt(6),
            "l_elbow": pt(7),
            "r_elbow": pt(8),
            "l_wrist": pt(9),
            "r_wrist": pt(10),
            "l_hip": pt(11),
            "r_hip": pt(12),
            "l_knee": pt(13),
            "r_knee": pt(14),
            "l_ankle": pt(15),
            "r_ankle": pt(16),
        }

    def maybe_llm_feedback(self, angles: dict):
        if not client.api_key:
            return

        def run_llm():
            prompt = f"""
            당신은 스쿼트/플랭크 자세 전문가입니다.
            아래 관절 각도를 보고 문제 여부를 판단하고 피드백을 주세요.

            규칙:
            - 자세가 정상일 때: "정상 자세입니다." 딱 한 문장.
            - 문제가 있으면: 한국어 10자 내외, 직관적 한 문장.
            - 불필요한 설명 금지.

            왼쪽 상체 각도: {angles.get('left_torso', 0):.1f}
            오른쪽 상체 각도: {angles.get('right_torso', 0):.1f}
            왼쪽 무릎 각도: {angles.get('left_knee', 0):.1f}
            오른쪽 무릎 각도: {angles.get('right_knee', 0):.1f}
            """
            try:
                res = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "너는 스쿼트/플랭크 자세 전문가야, 잘못된 부분을 짧게 말해줘"},
                        {"role": "user", "content": prompt},
                    ],
                )
                msg = res.choices[0].message.content
                self.coach_feedback = shorten_feedback(msg)
            except Exception as e:
                print(f"LLM Error: {e}")

        threading.Thread(target=run_llm, daemon=True).start()

    def process_frame(self, frame_bgr):
        # 녹화
        if self.is_recording and self.video_writer:
            self.video_writer.write(frame_bgr)

        kpts = self._extract_keypoints(frame_bgr)
        if not kpts:
            return frame_bgr, "사람을 찾을 수 없습니다.", self.coach_feedback, self.rep_count

        l_sh, r_sh = kpts["l_shoulder"], kpts["r_shoulder"]
        l_hip, r_hip = kpts["l_hip"], kpts["r_hip"]
        l_knee, r_knee = kpts["l_knee"], kpts["r_knee"]
        l_ankle, r_ankle = kpts["l_ankle"], kpts["r_ankle"]

        left_torso = calculate_angle(l_sh, l_hip, l_knee)
        right_torso = calculate_angle(r_sh, r_hip, r_knee)
        left_knee = calculate_angle(l_hip, l_knee, l_ankle)
        right_knee = calculate_angle(r_hip, r_knee, r_ankle)
        avg_knee = (left_knee + right_knee) / 2.0

        self.maybe_llm_feedback(
            {
                "left_torso": left_torso,
                "right_torso": right_torso,
                "left_knee": left_knee,
                "right_knee": right_knee,
            }
        )

        # 간단한 스쿼트 rep 카운트 (무릎 각도 기준)
        if avg_knee < 90:
            self.is_squat_down = True
            self.min_knee_angle = min(self.min_knee_angle, avg_knee)
        elif avg_knee > 160 and self.is_squat_down:
            self.rep_count += 1
            self.is_squat_down = False
            self.min_knee_angle = 180

        # 스켈레톤 직접 렌더링 (추가 YOLO 추론 없이)
        annotated = draw_skeleton(frame_bgr.copy(), kpts)

        return annotated, self.coach_feedback, self.coach_feedback, self.rep_count


analyzer = AIGymAnalyzer()


@app.websocket("/ws/feedback_aigym")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected (ai gym)")
    try:
        while True:
            data = await websocket.receive_text()

            if data == "START_RECORDING":
                analyzer.start_recording()
                continue
            if data == "STOP_RECORDING":
                report = analyzer.stop_recording()
                await websocket.send_json({"type": "REPORT", "content": report})
                continue
            if data.startswith("SET_EXERCISE:"):
                # ai gym 모델은 운동명을 별도로 쓰지 않지만 프로토콜 호환을 위해 수신
                continue

            # 이미지 처리
            try:
                if "," in data:
                    data = data.split(",")[1]
                image_bytes = base64.b64decode(data)
                np_arr = np.frombuffer(image_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                if frame is None:
                    continue

                processed, instant, coach, reps = analyzer.process_frame(frame)
                _, buffer = cv2.imencode(".jpg", processed)
                b64 = base64.b64encode(buffer).decode("utf-8")
                await websocket.send_json(
                    {
                        "type": "FEEDBACK",
                        "image": f"data:image/jpeg;base64,{b64}",
                        "instant_feedback": instant,
                        "coach_feedback": coach,
                        "reps": reps,
                        "is_recording": analyzer.is_recording,
                    }
                )
            except Exception as e:
                print(f"Frame Error: {e}")
                continue
    except WebSocketDisconnect:
        analyzer.stop_recording()
        print("Client disconnected (ai gym)")


app.mount("/", StaticFiles(directory=".", html=True), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8500)
