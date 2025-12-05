import cv2
import mediapipe as mp
import numpy as np
from streamlit_webrtc import webrtc_streamer, VideoTransformerBase
import streamlit as st
import math

# Mediapipe 초기화
mp_drawing = mp.solutions.drawing_utils # 포즈 랜드마크(관절점)와 연결선을 그릴 때 사용
mp_pose = mp.solutions.pose # 33개의 관절을 추적하는 모듈

# 각도 계산 함수
# 벡터 계산 후 내적과 크기를 이용하여 두 벡터 사이의 각도를 계산
# 예를 들어, calculate_angle(어깨, 엉덩이, 무릎) → 몸통 기울기, calculate_angle(엉덩이, 무릎, 발목) → 무릎 굽힘 정도
def calculate_angle(a, b, c):
    a = np.array([a[0] - b[0], a[1] - b[1]])
    c = np.array([c[0] - b[0], c[1] - b[1]])
    dot = np.dot(a, c)
    mag = np.linalg.norm(a) * np.linalg.norm(c)
    if mag == 0:
        return 0
    angle = np.degrees(np.arccos(dot / mag))
    return angle

# 스트림릿 웹캠 처리 클래스
class SquatTransformer(VideoTransformerBase):
    def __init__(self):
        self.pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5) # 포즈 탐지 신뢰도, 트레킹 신뢰도

    def transform(self, frame):
        img = frame.to_ndarray(format="bgr24")
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self.pose.process(img_rgb)
        
        # 추적된 관절 좌표
        if results.pose_landmarks: 
            landmarks = results.pose_landmarks.landmark

            # 관절 좌표
            left_shoulder = [landmarks[11].x, landmarks[11].y]
            right_shoulder = [landmarks[12].x, landmarks[12].y]
            left_hip = [landmarks[23].x, landmarks[23].y]
            right_hip = [landmarks[24].x, landmarks[24].y]
            left_knee = [landmarks[25].x, landmarks[25].y]
            right_knee = [landmarks[26].x, landmarks[26].y]
            left_ankle = [landmarks[27].x, landmarks[27].y]
            right_ankle = [landmarks[28].x, landmarks[28].y]

            # 각도 계산
            left_torso_angle = calculate_angle(left_shoulder, left_hip, left_knee)
            right_torso_angle = calculate_angle(right_shoulder, right_hip, right_knee)
            left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
            right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle)

            # 화면에 표시
            cv2.putText(img, f'L Shoulder Tilt: {int(left_torso_angle)}', (30,30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)
            cv2.putText(img, f'R Shoulder Tilt: {int(right_torso_angle)}', (30,60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)
            cv2.putText(img, f'L Knee Angle: {int(left_knee_angle)}', (30,90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)
            cv2.putText(img, f'R Knee Angle: {int(right_knee_angle)}', (30,120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)

            # 랜드마크 연결
            mp_drawing.draw_landmarks(img, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

        return img

# Streamlit UI
st.title("Squat Pose Tracker")
st.write("웹캠에서 스쿼트 자세를 실시간으로 인식하고 각도를 표시합니다.")

webrtc_streamer(
    key="squat-stream",
    video_transformer_factory=SquatTransformer,
    media_stream_constraints={"video": True, "audio": False},
)