import cv2
import mediapipe as mp
import numpy as np
import streamlit as st
import time
from streamlit_webrtc import webrtc_streamer, VideoTransformerBase
from openai import OpenAI
import os

st.set_page_config(page_title="Realtime Squat Coach", layout="wide")

# -------------------------------
# OpenAI client
# -------------------------------
OPENAI_KEY = st.secrets.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
if not OPENAI_KEY:
    st.warning("OpenAI API key not found. Set st.secrets['OPENAI_API_KEY'] or env OPENAI_API_KEY.")
else:
    client = OpenAI(api_key=OPENAI_KEY)

# -------------------------------
# Mediapipe & Utilities
# -------------------------------
mp_drawing = mp.solutions.drawing_utils
mp_pose = mp.solutions.pose

def calculate_angle(a, b, c):
    a = np.array([a[0]-b[0], a[1]-b[1]])
    c = np.array([c[0]-b[0], c[1]-b[1]])
    dot = np.dot(a, c)
    mag = np.linalg.norm(a)*np.linalg.norm(c)
    if mag == 0:
        return 0.0
    cos = np.clip(dot/mag, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos)))

def get_feedback_via_llm(left_knee, right_knee, torso_angle):
    if not OPENAI_KEY:
        return "LLM key 없음."
    prompt = f"""당신은 피트니스 전문가입니다. 스쿼트 자세를 각도 데이터 기반으로 1줄만 피드백하세요.
- 왼쪽 무릎 각도: {left_knee:.1f}
- 오른쪽 무릎 각도: {right_knee:.1f}
- 상체 기울기: {torso_angle:.1f}
짧게 한 문장으로."""
    try:
        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role":"user","content":prompt}],
            max_tokens=40
        )
        return res.choices[0].message.content.strip()
    except Exception as e:
        return f"LLM 오류: {e}"

# -------------------------------
# Video Transformer
# -------------------------------
class SquatTransformer(VideoTransformerBase):
    def __init__(self):
        self.pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
        self.last_feedback_time = 0.0
        self.cooldown = 2.0
        self.latest_feedback = ""
        self.left_knee_angle = 0.0
        self.right_knee_angle = 0.0
        self.torso_angle = 0.0

    def transform(self, frame):
        img = frame.to_ndarray(format="bgr24")
        img = cv2.flip(img, 1)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self.pose.process(img_rgb)

        if results.pose_landmarks:
            lm = results.pose_landmarks.landmark

            left_shoulder = [lm[11].x, lm[11].y]
            left_hip = [lm[23].x, lm[23].y]
            left_knee = [lm[25].x, lm[25].y]
            left_ankle = [lm[27].x, lm[27].y]
            right_hip = [lm[24].x, lm[24].y]
            right_knee = [lm[26].x, lm[26].y]
            right_ankle = [lm[28].x, lm[28].y]

            self.left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
            self.right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle)
            self.torso_angle = calculate_angle(left_shoulder, left_hip, left_knee)

            h, w, _ = img.shape
            cv2.putText(img, f"L Knee: {int(self.left_knee_angle)}", (20,40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255),2)
            cv2.putText(img, f"R Knee: {int(self.right_knee_angle)}", (20,80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255),2)
            cv2.putText(img, f"Torso: {int(self.torso_angle)}", (20,120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255),2)
            mp_drawing.draw_landmarks(img, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

            if time.time() - self.last_feedback_time > self.cooldown:
                fb = get_feedback_via_llm(self.left_knee_angle, self.right_knee_angle, self.torso_angle)
                self.latest_feedback = fb
                self.last_feedback_time = time.time()

        return img

# -------------------------------
# Streamlit UI
# -------------------------------
st.title("Realtime Squat Coach")
st.write("웹캠으로 스쿼트를 추적하고 LLM 피드백 + 브라우저 음성(TTS) 출력")

# Start 버튼 + TTS 활성화
if "tts_enabled" not in st.session_state:
    st.session_state["tts_enabled"] = False
if st.button("Start feedback & Enable TTS"):
    st.session_state["coach_running"] = True
    st.session_state["tts_enabled"] = True

cols = st.columns([2,1])
with cols[0]:
    webrtc_ctx = webrtc_streamer(
        key="squat-coach",
        video_transformer_factory=SquatTransformer,
        media_stream_constraints={"video": True, "audio": False},
        async_processing=True,
        rtc_configuration={"iceServers":[{"urls":["stun:stun.l.google.com:19302"]}]},
    )

with cols[1]:
    feedback_box = st.empty()
    feedback_box.markdown("`No feedback yet.`")

# -------------------------------
# Feedback polling + TTS
# -------------------------------
if "coach_running" in st.session_state and st.session_state["coach_running"]:
    prev_feedback = ""
    try:
        while st.session_state["coach_running"]:
            latest = ""
            left = right = torso = 0.0
            if webrtc_ctx and webrtc_ctx.video_transformer:
                latest = webrtc_ctx.video_transformer.latest_feedback
                left = webrtc_ctx.video_transformer.left_knee_angle
                right = webrtc_ctx.video_transformer.right_knee_angle
                torso = webrtc_ctx.video_transformer.torso_angle

            display = f"🗣 Feedback: **{latest}**\n- L knee: {left:.1f}°, R knee: {right:.1f}°, Torso: {torso:.1f}°"
            if display != prev_feedback:
                feedback_box.markdown(display)
                prev_feedback = display

                # hidden div for JS TTS
                st.markdown(f'<div id="squat_feedback_hidden" style="display:none">{latest}</div>', unsafe_allow_html=True)

            # JS: MutationObserver
            if st.session_state["tts_enabled"]:
                st.markdown("""
                <script>
                const target = document.getElementById('squat_feedback_hidden');
                const observer = new MutationObserver(() => {
                    const txt = target.innerText.trim();
                    if (txt && txt !== window._lastSquatFeedback) {
                        window._lastSquatFeedback = txt;
                        const utter = new SpeechSynthesisUtterance(txt);
                        utter.lang = "ko-KR";
                        speechSynthesis.speak(utter);
                    }
                });
                observer.observe(target, { childList: true });
                </script>
                """, unsafe_allow_html=True)

            time.sleep(0.8)
    except Exception as e:
        st.error(f"Error: {e}")
