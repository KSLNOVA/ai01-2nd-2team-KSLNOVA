# ai01-2nd-2team-KSLNOVA
The second project of NOVA - **운동 자세 교정 AI Agent**

----------------------------

# 프로젝트 기획서

## 1. 프로젝트 정의
- **프로젝트 이름(가칭)** : 🏋🏻운동 자세 AI Agent
- **목표 (현재 범위)**  
  - 웹캠 프레임을 브라우저에서 캡처하여 FastAPI WebSocket으로 전송  
  - MediaPipe Pose 기반 관절 각도 계산으로 스쿼트/플랭크 실시간 피드백·rep 카운트  
  - OpenAI API로 코칭/리포트 텍스트 생성, 브라우저 Web Speech API로 TTS 재생  
  - YouTube Data API(또는 ID/링크 직접 입력)로 튜토리얼 임베드, 실패 시 기본 영상 대체  
  - 프론트엔드만으로 키 관리(.env → env.js), 로컬 HTTP 서버에서 즉시 데모 가능

- **참고/참고 논문**  
  - MediaPipe 기반 운동자세 교정 시스템의 기능 개선 연구  
  - YOLOv8·Mediapipe를 이용한 운동자세 교정 자동 피드백 시스템  
  - 실시간 동작 인식 및 자세 교정 스마트 미러 피트니스 시스템

## 2. 주요 내용
- **📅 프로젝트 기간**: 2025-12-02 ~ 2025-12-10
- **👨🏻‍👩🏻‍👧🏻‍👦🏻 팀원 소개**

<table>
  <tr>
    <th></th>
    <th>김채원</th>
    <th>손지원</th>
    <th>이주연</th>
    <th>이진배</th>
  </tr>
  <tr>
    <td></td>
    <td align="center">
      <img src="https://placehold.co/150x150" alt="김채원" width="150" height="150">
    </td>
    <td align="center">
      <img src="https://placehold.co/150x150" alt="손지원" width="150" height="150">
    </td>
    <td align="center">
      <img src="https://placehold.co/150x150" alt="이주연" width="150" height="150">
    </td>
    <td align="center">
      <img src="https://placehold.co/150x150" alt="이진배" width="150" height="150">
    </td>
  </tr>
  <tr>
    <td>역할</td>
    <td>TTS / 팀장</td>
    <td>UI</td>
    <td>CV</td>
    <td>LLM</td>
  </tr>
<tr>
  <td>담당 모듈</td>
  <td>
    자세 스코어링<br/>
    TTS 엔진 선정<br/>
    텍스트→음성 변환
  </td>
  <td>
    웹 UI<br/>
    웹캠
  </td>
  <td>
    YOLO<br/>
    MediaPipe<br/>
    관절각도계산
  </td>
  <td>
    vLLM 세팅<br/>
    유튜브 추천 키워드
  </td>
</tr>

</table>







## 3. 일정 계획

| 작업 항목                  | 시작 날짜   | 종료 날짜   | 기간(일) |
|---------------------------|------------|------------|---------|
| 아이디어 회의               | 2025-12-02 | 2025-12-04 | 3       |
| CV                       | 2025-01-08 | 2025-01-14 | 7       |
| LLM                       | 2025-01-15 | 2025-01-21 | 7       |
| TTS                       | 2025-01-22 | 2025-01-28 | 7       |
| 피드백                      | 2025-01-29 | 2025-02-04 | 7       |
| UI                       | 2025-02-05 | 2025-02-07 | 3       |
| 프로젝트 발표               | 2025-12-10 | 2025-12-10 | 1       |

-----------------------------

# 작업 분할 구조 (WBS)

### 1. 📸 CV & 실시간 처리
- 웹캠 캡처 → WebSocket 전송 → MediaPipe Pose 각도 계산
- 스쿼트/플랭크 규칙 기반 rep 카운트·instant 피드백
- 처리된 프레임 이미지 반환(오버레이) 및 저장 옵션(video/)

### 2. 💬 LLM 코칭 & 리포트
- OpenAI API로 코칭 문구/세션 리포트 생성
- 운동 선택에 따라 코칭 필터링 및 세션별 로그
- 오류 시 기본 안내로 폴백

### 3. 🗣️ TTS
- Web Speech API로 브라우저에서 음성 재생
- 발화 중복·쿨다운 제어, 음성 다시듣기

### 4. 🎬 튜토리얼/검색
- YouTube Data API로 운동별 추천 영상 검색
- API 실패 시 기본/노쿠키 영상 대체, 수동 ID/링크 입력 지원

### 5. 💻 프론트엔드 UX
- React(바닐라 JSX+CDN) 단일 페이지, 분석 뷰/튜토리얼/채팅 UI
- 운동 전환 시 상태 초기화, 키 없음·API 실패 시 안내

---------------------------

# 요구사항 정의서

## 1. 기능 요구사항
- [FR-01] 브라우저에서 웹캠을 켜고 프레임을 WebSocket으로 실시간 전송한다.
- [FR-02] 서버는 MediaPipe Pose(확장 여지: YOLO)로 관절 좌표·각도를 계산한다.
- [FR-03] 스쿼트/플랭크 규칙으로 instant 피드백과 rep 카운트를 계산해 반환한다.
- [FR-04] OpenAI API로 코칭 문구·세션 리포트를 생성해 UI에 표시한다.
- [FR-05] 브라우저 Web Speech API로 텍스트 피드백을 음성으로 재생한다.
- [FR-06] 사용자 채팅(Q&A)을 LLM으로 처리해 운동별 답변을 제공한다.
- [FR-07] 운동 선택에 맞춰 YouTube 추천/검색을 수행하고, 실패 시 기본 영상으로 대체한다.
- [FR-08] 운동 변경 시 세션 상태·로그를 초기화하고 잘못된 운동의 피드백이 섞이지 않도록 한다.

## 2. 비기능 요구사항
- [NFR-01] 로컬 데모 기준 저지연(수백 ms~1s) 피드백을 목표로 한다.
- [NFR-02] API 키 누락/쿼터 초과 시 기본 안내·대체 영상으로 폴백한다.
- [NFR-03] 키 노출 방지를 위해 .env → env.js 생성, env.js는 Git에 포함하지 않는다.
- [NFR-04] 외부 네트워크(OpenAI/YouTube) 실패 시에도 최소한 카메라 스트림·기본 영상은 동작해야 한다.

---------------------------

# 프로젝트 설계서

## 1. 시스템 아키텍처 (현재 구현 기준)
1. **사용자(브라우저)**: 웹캠 ON, 운동 선택(스쿼트/플랭크), 튜토리얼 시청·채팅·TTS 청취  
2. **Frontend(UI)**: React(JSX/CDN) 단일 페이지, 웹캠 캡처 → WebSocket 전송, 분석 프레임/튜토리얼/채팅/TTS 표시  
3. **WebSocket 서버(FastAPI)**: `/ws/feedback`에서 프레임 수신·복호화, MediaPipe Pose로 각도·rep 계산, instant/코칭 피드백 JSON 송신  
4. **LLM 모듈(OpenAI API)**: 코칭 문구·세션 리포트 생성, 운동별로 필터링 후 프론트에 전달  
5. **튜토리얼/검색**: YouTube Data API로 추천/검색, 실패 시 기본·nocookie 영상 폴백  
6. **TTS**: 브라우저 Web Speech API, 쿨다운/중복 방지, 다시 듣기 지원  
7. **데이터/로그**: 프론트 메모리 세션(역사/rep/feedback), 선택 시 video/에 녹화 파일 저장(로컬)

## 2. 기술 스택
## 📚 TECH STACKS

**Frontend**
<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=0B1E2D"/>
  <img src="https://img.shields.io/badge/Babel-F9DC3E?style=for-the-badge&logo=babel&logoColor=000"/>
  <img src="https://img.shields.io/badge/WebSocket-111827?style=for-the-badge&logo=websocket&logoColor=white"/>
  <img src="https://img.shields.io/badge/Web%20Speech%20API-7C3AED?style=for-the-badge&logoColor=white"/>
  <img src="https://img.shields.io/badge/YouTube%20Data%20API-FF0000?style=for-the-badge&logo=youtube&logoColor=white"/>
</p>

**Backend**
<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white"/>
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white"/>
  <img src="https://img.shields.io/badge/Uvicorn-1E90FF?style=for-the-badge&logo=python&logoColor=white"/>
  <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white"/>
</p>

**CV / 분석**
<p align="center">
  <img src="https://img.shields.io/badge/MediaPipe-00C7B7?style=for-the-badge&logo=google&logoColor=white"/>
  <img src="https://img.shields.io/badge/OpenCV-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white"/>
  <img src="https://img.shields.io/badge/YOLO-000000?style=for-the-badge&logo=github&logoColor=white"/>
</p>

**운영/도구**
<p align="center">
  <img src="https://img.shields.io/badge/dotenv-00B894?style=for-the-badge&logo=dotenv&logoColor=white"/>
  <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white"/>
  <img src="https://img.shields.io/badge/Static%20Hosting-0F172A?style=for-the-badge&logo=html5&logoColor=white"/>
</p>


## 3. 설계 이미지
```mermaid
%%{init: {'themeVariables': { 'fontSize': '20px' }, 'flowchart': { 'nodeSpacing': 45, 'rankSpacing': 55 }}}%%
flowchart LR

    subgraph CLIENT["웹 브라우저 (React + Babel)"]
        U["사용자\n웹캠 ON / 운동 선택"]
        UI["UI/JS\n웹캠 프레임 캡처·표시\nYouTube 임베드\nTTS(Web Speech API)"]
    end

    subgraph SERVER["FastAPI 서버"]
        WS["WebSocket /ws/feedback\n프레임 수신·전송\n실시간 피드백 반환"]
        CV["CV 모듈\nMediaPipe Pose + 각도 계산\n(추가: YOLO 확장 여지)"]
        LLM["LLM 코치\nOpenAI API\n코칭/리포트 생성"]
        LOGS["세션 기록\nrep 카운트·리포트"]
    end

    YT["YouTube Data API\n튜토리얼 추천/검색"]

    U -->|"웹캠 스트림"| UI
    UI -->|"프레임 전송"| WS
    WS --> CV --> WS
    WS -->|"instant/코치 피드백\nrep 카운트"| UI
    WS -->|"리포트 요청"| LLM
    LLM -->|"코칭/리포트 텍스트"| WS
    UI -->|"운동/검색 키워드"| YT
    YT -->|"영상 ID/링크"| UI
    LLM -->|"코칭 문장 텍스트"| UI
```
---------------------------

# 데이터 연동 정의서

## 1. 데이터 정의
- 입력: 웹캠 프레임(base64 JPEG), 운동 선택(스쿼트/플랭크), 채팅 메시지  
- 출력: instant/코칭 피드백 텍스트, rep 카운트, 분석 프레임(base64 JPEG), 세션 리포트, 튜토리얼 영상 링크
- 외부 키: `OPENAI_API_KEY`, `YOUTUBE_API_KEY` (.env → env.js), 공개 저장소에 포함 금지
- 로컬 파일: `dataset/xyz_distances.csv`(참고용), `video/`(옵션 녹화물), `env.js`(런타임용)

## 2. 연동 방식
- WebSocket `/ws/feedback`: 프론트→서버 프레임 전송, 서버→프론트 피드백 JSON/분석 프레임 반환
- HTTP 정적 서빙: `index.html`, `run.jsx`, `run.css`, `env.js`
- OpenAI API: 채팅/코칭/리포트 생성 (서버에서 호출)
- YouTube Data API: 추천/검색 (프론트에서 호출, 실패 시 기본 영상 폴백)

--------------------------

# 클라우드 아키텍처 설계서

## 1. 아키텍처 개요
- 기본 배포는 로컬(HTTP 서버 + FastAPI WS)로 동작하며, 필요 시 다음과 같이 확장 가능:
  - 프론트: 정적 호스팅(S3/CloudFront 또는 Vercel 등) + env 주입
  - 백엔드: FastAPI + uvicorn (예: EC2/Cloud Run), WebSocket 지원
  - 비공개 키: 서버 환경변수로 관리, env.js에는 넣지 않음

## 2. 설계 이미지
```
[Browser]
  - index.html + run.jsx (React+WS)
  - env.js (키 주입)
        |
        v
[Backend - FastAPI WS]
  - /ws/feedback (프레임/피드백)
  - MediaPipe Pose, OpenAI API 호출
        |
        v
[External]
  - OpenAI API
  - YouTube Data API
```

-------------------------

# 시각화 리포트

## 1. 분석 결과 요약
- NONE

## 2. 대시보드
NONE

## 3. 제안
- NONE

--------------------------

# 프로젝트 회고

## 1. 프로젝트 개요
- **프로젝트 이름**: [프로젝트 명]
- **기간**: [YYYY-MM-DD ~ YYYY-MM-DD]
- **팀 구성원**: [팀원 이름]

---

## 2. 회고 주제
### 2.1. 잘한 점 (What went well)
- NONE

---

### 2.2. 개선이 필요한 점 (What could be improved)
- NONE

---

### 2.3. 배운 점 (Lessons learned)
- NONE

---

### 2.4. 다음 단계 (Action items)
- NONE

---

## 3. 팀원별 피드백
- NONE
---

## 4. 프로젝트 주요 결과 요약
- **성과**:
  - NONE
- **결과물**:
  - NONE

---

## 5. 자유로운 의견
- NONE
