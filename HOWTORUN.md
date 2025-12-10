# HOW TO RUN (final branch)

로컬 Mediapipe로 스켈레톤/카운트 계산 → 최하단 캡처 이미지를 OpenAI API로 보내 피드백을 받는 흐름입니다. WebSocket 서버는 사용하지 않습니다.

## 0. 필수 경로/파일
- `backend/image_server.py`
- `backend/requirements.txt`
- `frontend/index.html`
- `frontend/src/App.jsx`
- `frontend/src/main.jsx`
- `frontend/src/styles/main.css`
- `frontend/env.js` ( `.env` → `generate_env_js.py`로 생성하거나 직접 작성)



## 1. requirements.txt 설치
- 그냥 기본 파일 경로에서
```bash
pip install requirements.txt
```

## 2. api-key 설정
- .env를 준비
```bash
python generate_env_js.py
```
- env.js 생성되면 성공


## 3. 백엔드 실행(서버 띄워놓은채)
```bash
cd backend
export OPENAI_API_KEY="your_actual_key"
uvicorn image_server:app --host 0.0.0.0 --port 8002
```

## 4. 프론트 실행(백엔드 서버 띄워놓은채 **Ctrl+Shift+`**) -> 새 터미널 창 생김
```bash
cd frontend
python -m http.server 5500
```

## 5. 브라우저 접속
- 주소: `http://localhost:5500/index.html?v=img10` (캐시 무력화용 쿼리)
- 개발자도구 Network에서 “Disable cache” 체크 후 **Ctrl+Shift+R**
- 카메라 권한 허용, 오른쪽 패널 열기

## 6. 동작 흐름
- 웹캠 → Mediapipe Pose(로컬) → 스쿼트 최하단 자동 캡처
- 캡처에는 스켈레톤(노란 라인 + 빨간 포인트) 포함
- 캡처를 `/analyze-image`(port 8002)로 전송 → 중앙 “자세 피드백”에 표시
- 카운트는 상단/사이드바 모두 누적 표시, WS 연결은 사용하지 않음

## 7. 트러블슈팅
- “OPENAI_API_KEY가 설정되지 않았습니다”: 백엔드 실행 터미널에 키가 설정됐는지 확인.
- 스켈레톤 위치 어긋남: 창 크기 변경 후 새로고침(Ctrl+Shift+R). 비디오 `object-fit: contain`.
- 캐시 문제: 주소에 `?v=imgXX` 등 쿼리를 붙이거나 Disable cache 후 강제 새로고침.
