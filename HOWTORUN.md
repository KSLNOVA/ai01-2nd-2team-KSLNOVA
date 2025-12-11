# HOW TO RUN 

로컬 Mediapipe로 스켈레톤/카운트 계산 → 최하단 캡처 이미지를 OpenAI API로 보내 피드백을 받는 흐름입니다.

## 0. 필수 경로/파일
- `backend/exercise_server.py`
- `frontend/index.html`
- `frontend/src/App.jsx`
- `frontend/src/main.jsx`
- `frontend/src/styles/main.css`
- `requirements.txt`
- `frontend/.env` → `frontend/env.js` ( `python generate_env_js.py` 로 생성)



## 1. requirements.txt 설치
루트에서 실행 (conda 권장)
```bash
# 예시: conda create -n exercise-coach python=3.10.19
# conda activate exercise-coach
pip install -r requirements.txt
```

## 2. api-key 설정
1) .env에 들어가야할 내용
```bash
OPENAI_API_KEY='your key'
YOUTUBE_API_KEY='your key'
IMAGE_ANALYZE_ENDPOINT=http://localhost:8003/analyze-image
```

2) env.js 생성 (frontend에서 실행)
```bash
cd frontend
python generate_env_js.py
```

3) env.js이 아래와 같이 생성되면 성공
```javascript
window.ENV = {
  YOUTUBE_API_KEY: 'your key',
  OPENAI_API_KEY: 'your key',
  IMAGE_ANALYZE_ENDPOINT: "http://localhost:8003/analyze-image",
};
```


## 3. 백엔드 실행(서버 띄워놓은채)
```bash
cd backend
export OPENAI_API_KEY="your_actual_key"
export YOUTUBE_API_KEY="your_actual_key"
uvicorn exercise_server:app --host 0.0.0.0 --port 8003
```

## 4. 프론트 실행(백엔드 서버 띄워놓은채 **Ctrl+Shift+`**) -> 새 터미널 창 생김
```bash
cd frontend
python -m http.server 5500
```

## 5. 브라우저 접속
- 주소: `http://localhost:5500/index.html`
- 개발자도구 Network에서 “Disable cache” 체크 후 **Ctrl+Shift+R**
- 카메라 권한 허용, 오른쪽 패널 열기

## 6. 동작 흐름
- 웹캠 → Mediapipe Pose(로컬) → 스쿼트 최하단 자동 캡처
- 캡처에는 스켈레톤(노란 라인 + 빨간 포인트) 포함
- 캡처를 `/analyze-image`(port 8003)로 전송 → 중앙 “자세 피드백”에 표시
- 카운트는 상단/사이드바 모두 누적 표시, WS 연결은 사용하지 않음
