import cv2
import numpy as np
import base64
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import mediapipe as mp
from collections import deque
from openai import OpenAI
import os
from dotenv import load_dotenv
import threading
import time
from datetime import datetime

# ---------------------------------------------------------
# 1. 설정 및 초기화
# ---------------------------------------------------------
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MediaPipe 설정
mp_drawing = mp.solutions.drawing_utils
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

# 짧은 피드백만 남기는 헬퍼
def shorten_feedback(text: str, limit: int = 28) -> str:
    if not text:
        return ""
    first = text.split("\n")[0].split("。")[0].split(".")[0].split("!")[0].split("?")[0]
    trimmed = first.strip()
    if len(trimmed) > limit:
        trimmed = trimmed[:limit].rstrip() + "…"
    return trimmed

# ---------------------------------------------------------
# 2. 유틸리티 함수
# ---------------------------------------------------------
def calculate_angle(a, b, c):
    a = np.array([a[0] - b[0], a[1] - b[1], a[2] - b[2]])
    c = np.array([c[0] - b[0], c[1] - b[1], c[2] - b[2]])
    dot = np.dot(a, c)
    mag = np.linalg.norm(a) * np.linalg.norm(c)
    if mag == 0: return 0
    return np.degrees(np.arccos(np.clip(dot / mag, -1.0, 1.0)))

# ---------------------------------------------------------
# 3. SquatAnalyzer 클래스 (핵심 로직)
# ---------------------------------------------------------
class SquatAnalyzer:
    def __init__(self):
        self.reset_session()

    def reset_session(self):
        self.is_recording = False
        self.video_writer = None
        self.rep_count = 0
        self.is_squat_down = False
        self.session_history = [] # 전체 세션 로그
        self.current_rep_errors = [] # 현재 Rep의 에러들
        self.last_feedback_time = 0
        self.sequence_buffer = deque(maxlen=30)
        self.coach_feedback = ""

    def start_recording(self):
        self.is_recording = True
        self.rep_count = 0
        self.session_history = []
        
        # video 폴더 생성
        if not os.path.exists("video"):
            os.makedirs("video")
            
        # 파일명 생성 (YYYYMMDD_HHMM.mp4)
        filename = datetime.now().strftime("%Y%m%d_%H%M")
        filepath = os.path.join("video", f"{filename}.mp4")
        
        # VideoWriter 설정 (해상도 640x480 가정 - 실제 입력 크기에 맞춰야 좋지만 일단 고정)
        # 코덱: 'mp4v' or 'avc1'
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        self.video_writer = cv2.VideoWriter(filepath, fourcc, 10.0, (640, 480)) # FPS 10 (클라이언트 전송 주기와 맞춤)
        print(f"Recording Started: {filepath}")

    def stop_recording(self):
        self.is_recording = False
        if self.video_writer:
            self.video_writer.release()
            self.video_writer = None
        print("Recording Stopped")
        return self.generate_final_report()

    def detect_realtime_errors(self, l_knee_ang, r_knee_ang, l_hip, r_hip, l_knee, r_knee, l_shoulder, r_shoulder):
        """실시간(Instant) 피드백: 즉각적인 위험 경고"""
        warnings = []
        
        # 1. 무릎 말림 (Knee Valgus)
        # 엉덩이 너비보다 무릎 너비가 현저히 좁을 때 (0.8배 미만)
        hip_width = abs(l_hip[0] - r_hip[0])
        knee_width = abs(l_knee[0] - r_knee[0])
        if knee_width < hip_width * 0.8:
            warnings.append("무릎이 안으로 모입니다! 무릎을 벌리세요.")
            self.current_rep_errors.append("무릎 말림")

        # 2. 골반 불균형 (Asymmetry)
        # 좌우 골반의 Y좌표(높이) 차이가 클 때
        if abs(l_hip[1] - r_hip[1]) > 0.05: # 화면 높이의 5% 이상 차이
            warnings.append("골반이 삐뚤어졌습니다. 균형을 잡으세요.")
            self.current_rep_errors.append("골반 불균형")

        # 3. 상체 쏠림 (Forward Lean)
        # 엉덩이-어깨의 X좌표 차이가 너무 클 때 (상체가 앞으로 많이 숙여짐)
        # 간단히: (어깨 X - 엉덩이 X)의 절대값이 특정 임계값 초과 시
        # 주의: 측면 뷰에서만 유효할 수 있음. 정면에서는 어깨 높이 차이 등으로 판단해야 하나 여기선 단순화.
        # 정면 뷰 가정: 어깨와 엉덩이의 수직 정렬이 크게 벗어나면 경고 (하지만 정면 스쿼트는 X차가 거의 없음)
        # 여기서는 "어깨 높이 차이"로 상체 기울어짐(좌우)을 체크하거나, 
        # 깊이 앉았을 때 무릎 각도 대비 상체 각도를 봐야 함.
        # 일단 "좌우 어깨 높이 차이"로 상체 기울기를 체크하겠습니다.
        if abs(l_shoulder[1] - r_shoulder[1]) > 0.04:
            warnings.append("상체가 기울어졌습니다.")
            self.current_rep_errors.append("상체 기울짐")

        # 4. 깊이 체크 (실시간으로는 '너무 깊음'만 체크, '덜 앉음'은 Rep 완료 시 판단)
        avg_knee = (l_knee_ang + r_knee_ang) / 2
        if avg_knee < 60:
            warnings.append("너무 깊게 앉았습니다! 부상 위험.")
            
        return warnings

    def analyze_rep_completion(self, websocket):
        """Rep 완료 시 호출: LLM 코치 피드백 생성 (비동기)"""
        if not self.current_rep_errors:
            return

        # 가장 빈번한 에러 추출
        from collections import Counter
        error_counts = Counter(self.current_rep_errors)
        most_common_error = error_counts.most_common(1)[0][0]
        
        self.session_history.append(f"Rep {self.rep_count}: {most_common_error}")
        self.current_rep_errors = [] # 초기화

        # LLM 호출 (별도 스레드)
        def run_llm():
            try:
                prompt = f"""
                당신은 스쿼트 코치입니다.
                - 실수: {most_common_error}

                규칙:
                - 자세가 정상이면 반드시 "정상 자세입니다." 한 문장만 말하기.
                - 문제가 있으면 한국어 10자 내외, 한 문장만.
                - 불필요한 설명 금지.
                """
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "system", "content": "헬스 트레이너"}, {"role": "user", "content": prompt}]
                )
                advice = response.choices[0].message.content

                # WebSocket으로 전송 (비동기 루프에 메시지 주입은 복잡하므로, 여기선 print만 하거나 구조 변경 필요)
                # 간단하게 구현하기 위해 전역 변수나 큐를 쓸 수도 있지만, 
                # FastAPI WebSocket은 async라 스레드에서 직접 send가 까다로움.
                # 여기서는 'coach_feedback' 변수에 저장해두고 메인 루프에서 가져가게 함.
                self.coach_feedback = shorten_feedback(advice)
            except Exception as e:
                print(f"LLM Error: {e}")

        threading.Thread(target=run_llm).start()

    def detect_plank_errors(self, l_shoulder, r_shoulder, l_elbow, r_elbow, l_hip, r_hip, l_ankle, r_ankle, l_ear, r_ear):
        warnings = []
        
        # 1. 엉덩이 처짐/들림 (Sagging/High Hips)
        # 어깨-엉덩이-발목 각도 계산 (직선이어야 함, 약 170~180도)
        # 여기서는 간단히 Y좌표(높이) 비교로 판단
        # 어깨와 발목을 잇는 선보다 엉덩이가 현저히 아래(Y가 큼)면 처짐, 위(Y가 작음)면 들림
        
        # 왼쪽 기준 (측면 뷰 가정)
        # 직선 방정식: y = mx + c (어깨와 발목을 지나는)
        if l_ankle[0] != l_shoulder[0]:
            m = (l_ankle[1] - l_shoulder[1]) / (l_ankle[0] - l_shoulder[0])
            c = l_shoulder[1] - m * l_shoulder[0]
            expected_hip_y = m * l_hip[0] + c
            
            # 오차 허용 범위
            threshold = 0.05 
            
            if l_hip[1] > expected_hip_y + threshold:
                warnings.append("허리가 꺾였습니다! 배에 힘을 주세요.")
                self.current_rep_errors.append("허리 꺾임")
            elif l_hip[1] < expected_hip_y - threshold:
                warnings.append("엉덩이가 너무 높습니다. 몸을 일직선으로 만드세요.")
                self.current_rep_errors.append("엉덩이 들림")

        # 2. 어깨 위치 (Shoulder Alignment)
        # 팔꿈치가 어깨 바로 아래 있어야 함 (X좌표 비교)
        if abs(l_shoulder[0] - l_elbow[0]) > 0.05:
            warnings.append("팔꿈치를 어깨 바로 아래에 두세요.")
            self.current_rep_errors.append("팔꿈치 위치 불량")

        # 3. 고개 떨굼 (Head Drop)
        # 귀가 어깨보다 너무 아래에 있으면 (Y좌표 비교)
        # 플랭크 시 몸이 수평이라면 귀와 어깨 높이가 비슷해야 함
        if l_ear[1] > l_shoulder[1] + 0.05:
             warnings.append("고개를 드세요. 시선은 바닥을 향하세요.")
             self.current_rep_errors.append("고개 떨굼")

        return warnings

    def process_frame(self, image):
        # 1. 영상 녹화
        if self.is_recording and self.video_writer:
            self.video_writer.write(image)

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = pose.process(image_rgb)
        
        instant_feedback = ""
        coach_feedback = getattr(self, 'coach_feedback', "")
        
        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark
            
            def get_coords(index):
                return [lm[index].x, lm[index].y, lm[index].z]

            l_shoulder = get_coords(11); r_shoulder = get_coords(12)
            l_elbow    = get_coords(13); r_elbow    = get_coords(14)
            l_wrist    = get_coords(15); r_wrist    = get_coords(16)
            l_hip      = get_coords(23); r_hip      = get_coords(24)
            l_knee     = get_coords(25); r_knee     = get_coords(26)
            l_ankle    = get_coords(27); r_ankle    = get_coords(28)
            l_ear      = get_coords(7);  r_ear      = get_coords(8) # 귀 좌표 추가
            # fdb 스타일 각도 계산
            left_torso_angle = calculate_angle(l_shoulder, l_hip, l_knee)
            right_torso_angle = calculate_angle(r_shoulder, r_hip, r_knee)
            left_knee_angle = calculate_angle(l_hip, l_knee, l_ankle)
            right_knee_angle = calculate_angle(r_hip, r_knee, r_ankle)

            # 운동별 로직 분기
            current_ex = getattr(self, 'current_exercise', '스쿼트')

            if current_ex == '스쿼트':
                # fdb 스타일: 각도 기반 LLM 피드백만 사용 (기존 실시간/rep 로직 제거)
                self.maybe_llm_feedback({
                    "left_torso": left_torso_angle,
                    "right_torso": right_torso_angle,
                    "left_knee": left_knee_angle,
                    "right_knee": right_knee_angle,
                })
            elif current_ex == '플랭크':
                # 플랭크도 동일하게 각도 기반 LLM 피드백만 사용
                self.maybe_llm_feedback({
                    "left_torso": left_torso_angle,
                    "right_torso": right_torso_angle,
                    "left_knee": left_knee_angle,
                    "right_knee": right_knee_angle,
                })

            mp_drawing.draw_landmarks(image, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

        # 화면에는 최신 코치 피드백만 전달 (기존 경고/rep 피드백 제거)
        instant_feedback = getattr(self, 'coach_feedback', "")
        coach_feedback = instant_feedback

        return image, instant_feedback, coach_feedback, self.rep_count

    def maybe_llm_feedback(self, angles: dict):
        """fdb_server 스타일 각도 기반 LLM 호출 (쿨다운 없이 즉시)"""
        if not client.api_key:
            return

        def run_llm():
            prompt = f"""
            당신은 스쿼트 자세 전문가입니다.
            다음의 관절 각도 데이터를 보고 문제 여부를 판단하고 피드백 해주세요.
            
            규칙: 
            - 네가 판단했을 때 자세가 **정상**이면 반드시 다음처럼 짧게 말해라: "정상 자세입니다."
            - 자세가 **문제가 있으면** 그에 맞는 피드백하세요, **한국어로 매우 짧고(10자 내외), 직관적인 피드백을 하세요.**

            출력 규칙:
            - 한 문장만 출력.
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
                        {"role": "system", "content": "너는 스쿼트 자세 전문가야, 내 자세 중 잘못된 부분을 지적해줘"},
                        {"role": "user", "content": prompt},
                    ],
                )
                msg = res.choices[0].message.content
                self.coach_feedback = shorten_feedback(msg)
            except Exception as e:
                print(f"LLM Error (angles): {e}")

        threading.Thread(target=run_llm, daemon=True).start()

    def generate_final_report(self):
        if not self.session_history:
            return "운동 기록이 충분하지 않습니다."
            
        summary = "\n".join(self.session_history)
        prompt = f"""
        사용자가 {getattr(self, 'current_exercise', '운동')} 세션을 마쳤습니다. 다음은 기록된 실수들입니다:
        {summary}
        
        전체적인 피드백과 개선점을 요약해서 한국어로 리포트를 작성해주세요.
        """
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": "전문 트레이너"}, {"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"리포트 생성 실패: {e}"

# 전역 분석기 인스턴스
analyzer = SquatAnalyzer()

# ---------------------------------------------------------
# 5. WebSocket 엔드포인트
# ---------------------------------------------------------
@app.websocket("/ws/feedback")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected")
    
    try:
        while True:
            data = await websocket.receive_text()
            
            # 제어 메시지 처리
            if data == "START_RECORDING":
                analyzer.start_recording()
                continue
            elif data == "STOP_RECORDING":
                report = analyzer.stop_recording()
                await websocket.send_json({"type": "REPORT", "content": report})
                continue
            elif data.startswith("SET_EXERCISE:"):
                ex_name = data.split(":")[1]
                analyzer.current_exercise = ex_name
                analyzer.reset_session() # 운동 변경 시 세션 초기화
                print(f"Exercise set to: {ex_name}")
                continue
            
            # 이미지 데이터 처리
            try:
                if "," in data:
                    data = data.split(",")[1]
                
                image_bytes = base64.b64decode(data)
                np_arr = np.frombuffer(image_bytes, np.uint8)
                image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                
                if image is None: continue
                
                # 분석 실행
                processed_image, instant_fb, coach_fb, reps = analyzer.process_frame(image)
                
                # 인코딩 및 전송
                _, buffer = cv2.imencode('.jpg', processed_image)
                processed_base64 = base64.b64encode(buffer).decode('utf-8')
                
                response = {
                    "type": "FEEDBACK",
                    "image": f"data:image/jpeg;base64,{processed_base64}",
                    "instant_feedback": instant_fb,
                    "coach_feedback": coach_fb,
                    "reps": reps,
                    "is_recording": analyzer.is_recording
                }
                await websocket.send_json(response)
                
            except Exception as e:
                print(f"Frame Error: {e}")
                continue
                
    except WebSocketDisconnect:
        analyzer.stop_recording() # 연결 끊기면 저장 종료
        print("Client disconnected")

# 정적 파일 서빙 (현재 디렉토리) - WebSocket 등 다른 라우트보다 나중에 정의해야 함
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
