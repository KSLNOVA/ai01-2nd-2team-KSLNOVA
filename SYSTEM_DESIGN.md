# 시스템 설계서 (요약)

## 1. 아키텍처 개요
- **프론트**: React 18 (CDN+JSX), 웹캠 캡처, WebSocket 전송, 분석 프레임/튜토리얼/채팅/TTS UI
- **백엔드**: FastAPI + uvicorn, `/ws/feedback` WebSocket
- **CV**: MediaPipe Pose로 관절 좌표/각도 계산, 운동 규칙(스쿼트·플랭크)로 instant 피드백/rep 카운트
- **LLM**: OpenAI Chat Completions(gpt-4o-mini)로 코칭/리포트 생성
- **TTS**: 브라우저 Web Speech API, 쿨다운/중복 방지
- **튜토리얼**: YouTube Data API 추천/검색, 실패 시 기본·nocookie 영상 폴백, 수동 ID/링크 입력

## 2. 데이터 흐름
1) 브라우저: 웹캠 ON → 캔버스로 프레임 캡처 → base64 JPEG를 WS로 전송  
2) 서버: 프레임 복호화 → MediaPipe Pose 분석 → 각도/rep/instant 피드백 산출 → 처리된 프레임(base64)과 함께 JSON 반환  
3) LLM: rep 완료/에러 시 서버에서 OpenAI API 호출 → `coach_feedback`/리포트 텍스트를 WS 응답에 포함  
4) 프론트: 텍스트 피드백 표시, TTS 재생(쿨다운), 운동별 로그/상태 관리  
5) 튜토리얼: 운동 선택/검색 → YouTube API 호출 → iframe 임베드, 실패 시 기본 영상 고정 또는 수동 입력

## 3. API/엔드포인트
- WebSocket: `ws://<host>:8000/ws/feedback`
  - 클라이언트 → 서버: base64 JPEG 프레임, 제어 메시지 `START_RECORDING`/`STOP_RECORDING`/`SET_EXERCISE:<name>`
  - 서버 → 클라이언트: `{type: "FEEDBACK", instant_feedback, coach_feedback, reps, is_recording, image}`  
    리포트 시 `{type: "REPORT", content}`
- HTTP 정적: `index.html`, `run.jsx`, `run.css`, `env.js`
- OpenAI API: `POST https://api.openai.com/v1/chat/completions` (server: python client도 사용)
- YouTube Data API: `GET https://www.googleapis.com/youtube/v3/search` (프론트)

## 4. 환경 변수/키
- `OPENAI_API_KEY`, `YOUTUBE_API_KEY` → `.env` → `env.js` 생성 (`generate_env_js.py`)
- `env.js`/`.env`는 Git 미포함, 키 누락/쿼터 초과 시 안내·폴백 처리

## 5. 배포/운영 가이드 (로컬 기준)
- 프론트: `python -m http.server 8000` → `http://localhost:8000/index.html`
- 백엔드: `python server.py` (포트 8000, WebSocket 지원 위해 `uvicorn[standard]` 권장)
- 키 주입: `.env` 작성 후 `python generate_env_js.py`
- 녹화물: `video/` (gitignore 처리), 데이터 참고용: `dataset/xyz_distances.csv`
