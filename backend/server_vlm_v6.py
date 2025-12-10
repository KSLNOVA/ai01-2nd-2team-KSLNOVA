import base64
import os
from datetime import datetime
from pathlib import Path
from typing import Dict

import cv2
import numpy as np
import uvicorn
import mediapipe as mp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent  # repo root
FRONTEND_DIR = ROOT_DIR / "frontend"
VIDEO_DIR = Path(__file__).resolve().parent / "video"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------
# 설정
# ---------------------------------------------------------
load_dotenv(ROOT_DIR / ".env")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MediaPipe: 카운트/최저점 프레임 및 기본 관절 지표 계산
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

# 표시할 관절 ID (MediaPipe): 어깨(11,12), 엉덩이(23,24), 무릎(25,26), 발목(27,28), 뒤꿈치(29,30), 발끝(31,32)
SUBSET_LANDMARKS = {11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32}
# 간단한 연결선
SUBSET_CONNECTIONS = [
    (11, 23), (12, 24), (23, 24),
    (23, 25), (24, 26),
    (25, 27), (26, 28),
    (27, 29), (28, 30),
    (29, 31), (30, 32),
]


# ---------------------------------------------------------
# 유틸
# ---------------------------------------------------------
def shorten_feedback(text: str, limit: int = 28) -> str:
    if not text:
        return ""
    first = text.split("\n")[0].split("。")[0].split(".")[0].split("!")[0].split("?")[0]
    trimmed = first.strip()
    if len(trimmed) > limit:
        trimmed = trimmed[:limit].rstrip() + "…"
    return trimmed


def calculate_angle(a, b, c) -> float:
    a = np.array([a[0] - b[0], a[1] - b[1], a[2] - b[2]])
    c = np.array([c[0] - b[0], c[1] - b[1], c[2] - b[2]])
    dot = np.dot(a, c)
    mag = np.linalg.norm(a) * np.linalg.norm(c)
    if mag == 0:
        return 0.0
    return float(np.degrees(np.arccos(np.clip(dot / mag, -1.0, 1.0))))


def hip_below_knee(hip_y: float, knee_y: float) -> bool:
    # 이미지 좌표계에서 y가 클수록 아래
    return hip_y > knee_y


class VLMFeedbackSquat:
    """
    - 카운트: 무릎 평균각 down/up으로 1회 인정.
    - 최저점 프레임과 주요 지표(깊이, 무릎 정렬, 발 접지, 상체 각도)를 VLM에 전달해 한 문장 피드백.
    - 측면 촬영을 권장하나, 정면/사선일 때도 보수적으로 안내하도록 프롬프트.
    """

    def __init__(self):
        self.last_feedback = "웹캠을 켜면 스쿼트 자세 피드백을 제공합니다."
        self.rep_count = 0
        self.is_down = False
        self.min_knee_angle = 180
        self.lowest_frame = None
        self.lowest_metrics: Dict[str, float | str] | None = None
        self.llm_running = False
        self.is_recording = False
        self.video_writer = None
        self.down_threshold = 95
        self.up_threshold = 155

    def start_recording(self):
        self.is_recording = True
        self.rep_count = 0
        self.is_down = False
        self.min_knee_angle = 180
        self.lowest_frame = None
        self.lowest_metrics = None
        filename = datetime.now().strftime("%Y%m%d_%H%M")
        path = VIDEO_DIR / f"{filename}.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self.video_writer = cv2.VideoWriter(str(path), fourcc, 10.0, (640, 480))
        print(f"Recording Started: {path}")

    def stop_recording(self):
        self.is_recording = False
        if self.video_writer:
            self.video_writer.release()
            self.video_writer = None
        print("Recording Stopped")
        return "세션 종료"

    def build_metrics(self, lm) -> Dict[str, float | str]:
        # 좌표 helper
        def coord(i):
            p = lm[i]
            return [p.x, p.y, p.z]

        # 주요 포인트
        l_sh, r_sh = coord(11), coord(12)
        l_hip, r_hip = coord(23), coord(24)
        l_knee, r_knee = coord(25), coord(26)
        l_ank, r_ank = coord(27), coord(28)
        l_heel, r_heel = coord(29), coord(30)
        l_toe, r_toe = coord(31), coord(32)

        # 각도/지표
        left_knee = calculate_angle(l_hip, l_knee, l_ank)
        right_knee = calculate_angle(r_hip, r_knee, r_ank)
        left_torso = calculate_angle(l_sh, l_hip, l_knee)
        right_torso = calculate_angle(r_sh, r_hip, r_knee)

        # 깊이: 엉덩이 주름이 무릎보다 아래인지(좌우 평균)
        depth_left = hip_below_knee(l_hip[1], l_knee[1])
        depth_right = hip_below_knee(r_hip[1], r_knee[1])
        depth_flag = depth_left and depth_right

        # 무릎 정렬: 무릎-발끝 x축 정렬(좌/우)
        knee_align_left = abs(l_knee[0] - l_toe[0])
        knee_align_right = abs(r_knee[0] - r_toe[0])

        # 발 접지: 뒤꿈치가 발끝보다 들렸는지(y축 비교)
        heel_ground_left = l_heel[1] <= l_toe[1] + 0.01
        heel_ground_right = r_heel[1] <= r_toe[1] + 0.01

        # 평균값/요약
        torso_mean = (left_torso + right_torso) / 2
        knee_mean = (left_knee + right_knee) / 2

        return {
            "left_knee": left_knee,
            "right_knee": right_knee,
            "torso_mean": torso_mean,
            "knee_mean": knee_mean,
            "depth_ok": depth_flag,
            "knee_align_left": knee_align_left,
            "knee_align_right": knee_align_right,
            "heel_ground_left": heel_ground_left,
            "heel_ground_right": heel_ground_right,
        }

    def vlm_feedback(self, frame_bgr: np.ndarray, metrics: Dict[str, float | str]):
        if not client.api_key:
            return
        if self.llm_running:
            return
        self.llm_running = True

        # 전송 대역폭 절약을 위해 크기 축소
        h, w = frame_bgr.shape[:2]
        scale = 512 / max(h, w)
        if scale < 1.0:
            frame_bgr = cv2.resize(frame_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        _, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        b64 = base64.b64encode(buf).decode("utf-8")

        prompt = f"""
        당신은 스쿼트 자세 전문가입니다. 아래 이미지는 스쿼트 1회 동작 중 최저점입니다.
        측면 촬영을 가정하고, 제공된 지표와 이미지를 함께 보고 한 문장으로 피드백하세요.
        규칙:
        - 정상 자세면 "정상 자세입니다." 한 문장.
        - 문제가 있으면 한국어 10자 내외 한 문장, 부드러운 톤. 불필요한 설명 금지.

        지표:
        - 무릎 각도(평균): {metrics.get('knee_mean', 0):.1f}°
        - 상체 각도(평균): {metrics.get('torso_mean', 0):.1f}°
        - 깊이(엉덩이 무릎 아래): {metrics.get('depth_ok')}
        - 무릎-발 정렬 L/R(|knee_x-toe_x|): {metrics.get('knee_align_left', 0):.3f} / {metrics.get('knee_align_right', 0):.3f}
        - 뒤꿈치 접지 L/R: {metrics.get('heel_ground_left')} / {metrics.get('heel_ground_right')}
        """

        def run():
            try:
                res = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "너는 스쿼트 자세 전문가야. 한 문장만 답해."},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                            ],
                        },
                    ],
                )
                msg = shorten_feedback(res.choices[0].message.content)
                self.last_feedback = msg
            except Exception as e:
                print(f"VLM error: {e}")
            finally:
                self.llm_running = False

        import threading

        threading.Thread(target=run, daemon=True).start()

    def process(self, frame_bgr: np.ndarray):
        # 녹화
        if self.is_recording and self.video_writer:
            self.video_writer.write(frame_bgr)

        # MediaPipe로 down/up + 최저점 프레임/지표 선택
        image_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = pose.process(image_rgb)
        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark
            metrics = self.build_metrics(lm)

            avg_knee = metrics["knee_mean"]

            if avg_knee < self.down_threshold:
                self.is_down = True
                # 더 낮아지면 프레임/지표 갱신
                if avg_knee < self.min_knee_angle:
                    self.min_knee_angle = avg_knee
                    self.lowest_frame = frame_bgr.copy()
                    self.lowest_metrics = metrics
            elif avg_knee > self.up_threshold and self.is_down:
                self.rep_count += 1
                self.is_down = False
                self.min_knee_angle = 180
                # rep 완료 시 최저점 기반 피드백
                if self.lowest_frame is not None and self.lowest_metrics is not None:
                    self.vlm_feedback(self.lowest_frame, self.lowest_metrics)
                else:
                    self.vlm_feedback(frame_bgr, metrics)
                self.lowest_frame = None
                self.lowest_metrics = None

            # 스켈레톤: 지정한 관절/연결만 표시
            h, w = frame_bgr.shape[:2]

            def to_xy(idx):
                p = lm[idx]
                return int(p.x * w), int(p.y * h)

            for a, b in SUBSET_CONNECTIONS:
                xa, ya = to_xy(a); xb, yb = to_xy(b)
                cv2.line(frame_bgr, (xa, ya), (xb, yb), (0, 200, 255), 2)
            for idx in SUBSET_LANDMARKS:
                x, y = to_xy(idx)
                cv2.circle(frame_bgr, (x, y), 4, (0, 255, 0), -1)

        return frame_bgr, self.last_feedback, self.last_feedback, self.rep_count


analyzer = VLMFeedbackSquat()


@app.websocket("/ws/feedback")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected (vlm v4 side-knee)")
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

            try:
                if "," in data:
                    data = data.split(",")[1]
                img_bytes = base64.b64decode(data)
                np_arr = np.frombuffer(img_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                if frame is None:
                    continue

                processed, instant, coach, reps = analyzer.process(frame)
                _, buf = cv2.imencode(".jpg", processed)
                b64 = base64.b64encode(buf).decode("utf-8")
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
                print(f"Frame error: {e}")
                continue
    except WebSocketDisconnect:
        analyzer.stop_recording()
        print("Client disconnected (vlm v4)")


# 정적 파일 서빙 (루트)
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9004)
