# ai01-2nd-2team-KSLNOVA
The second project of NOVA - **EXERCISE COACH**

----------------------------

# 프로젝트 기획서

## 1. 프로젝트 정의
- **프로젝트 이름** : EXERCISE COACH
- **목표**  
  - 브라우저에서 웹캠 캡처 → 최하단 이미지만 FastAPI REST(`/analyze-image`)로 전송해 분석  
  - 로컬 Mediapipe Pose로 스쿼트/숄더프레스 관절 각도·rep 카운트 및 스켈레톤/캡처 표시  
  - OpenAI API로 캡처 이미지 분석 후 한국어 피드백 생성, Web Speech API로 TTS 재생  
  - YouTube Data API로 튜토리얼 임베드, 실패 시 기본 영상으로 폴백  
  - 키는 .env → env.js로 주입, 프론트는 정적 서버(`python -m http.server 5500`)에서 동작  

- **참고/참고 논문**  
  - MediaPipe 기반 운동자세 교정 시스템의 기능 개선 연구  
  - YOLOv8·Mediapipe를 이용한 운동자세 교정 자동 피드백 시스템  
  - 실시간 동작 인식 및 자세 교정 스마트 미러 피트니스 시스템

## 2. 주요 내용
- **📅 프로젝트 기간**: 2025-12-02 ~ 2025-12-12
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
      <img src="src/김채원.png" alt="김채원" width="150" height="150">
    </td>
    <td align="center">
      <img src="src/손지원.png" alt="손지원" width="150" height="150">
    </td>
    <td align="center">
      <img src="src/이주연.png" alt="이주연" width="150" height="150">
    </td>
    <td align="center">
      <img src="src/이진배.png" alt="이진배" width="150" height="150">
    </td>
  </tr>
  <tr>
    <td align="center">역할</td>
    <td align="center">팀장<br/>PM</td>
    <td align="center">Frontend</td>
    <td align="center">backend</td>
    <td align="center">backend</td>
  </tr>
<tr>
  <td align="center">담당 모듈</td>
  <td align="center">
    자세 스코어링<br/>
    TTS(Web Speech API) 제어<br/>
    텍스트→음성 변환
  </td>
  <td align="center">
    웹 UI(React)
  </td>
  <td align="center">
    MediaPipe Pose<br/>
    관절 각도 계산<br/>
  </td>
  <td align="center">
    OpenAI API 코칭/리포트<br/>
    유튜브 추천 키워드/검색
  </td>
</tr>

</table>







## 3. 일정 계획

| 작업 항목                           | 시작 날짜   | 종료 날짜   | 기간(일) |
|------------------------------------|------------|------------|---------|
| 아이디어 회의                        | 2025-12-02 | 2025-12-04 | 3       |
| 요구사항/아키텍처 정리               | 2025-12-05 | 2025-12-05 | 1       |
| 백엔드 REST 정비(exercise_server)   | 2025-12-06 | 2025-12-08 | 3       |
| 프론트 UI/Mediapipe 통합            | 2025-12-09 | 2025-12-10 | 2       |
| LLM/TTS 연동 및 통합 테스트          | 2025-12-11 | 2025-12-11 | 1       |
| 프로젝트 발표                       | 2025-12-12 | 2025-12-12 | 1       |

-----------------------------

# 작업 분할 구조 (WBS)

### 1. 📸 CV & 실시간 처리
- 웹캠 캡처 → 로컬 Mediapipe Pose 각도 계산 → 최하단 이미지 캡처만 REST(`/analyze-image`)로 전송
- 스쿼트/숄더프레스 규칙 기반 rep 카운트·instant 피드백(스켈레톤/캡처 오버레이)
- 프레임 저장/오버레이 표시(WS 사용 안 함)

### 2. 💬 LLM 코칭 & 리포트
- OpenAI API로 캡처 이미지 분석 후 한국어 피드백 생성
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
- env.js는 루트 .env 기반 생성, 정적 서버(`python -m http.server`)로 구동

---------------------------

# 📁 프로젝트 폴더 구조

```
ai01-2nd-2team-KSLNOVA/
├── README.md                 # 프로젝트 개요/문서
├── HOWTORUN.md               # 실행 가이드
├── requirements.txt          # 백엔드 의존성
├── .gitignore
├── frontend/
│   ├── index.html            # 정적 엔트리(React CDN)
│   ├── env.js                # .env 기반으로 생성되는 프런트 런타임 설정
│   ├── .env                  # 프런트용 키/엔드포인트(깃 미추적)
│   ├── generate_env_js.py    # .env → env.js 변환 스크립트
│   └── src/
│       ├── App.jsx           # 메인 UI/로직
│       ├── main.jsx          # ReactDOM 렌더 부트스트랩
│       └── styles/main.css   # 스타일
└── backend/
    ├── exercise_server.py    # FastAPI REST (OpenAI/YouTube/로그 저장)
    └── exercise_data/        # 로그·캡처 저장 폴더
```

---------------------------

# 요구사항 정의서

## 1. 기능 요구사항
- [FR-01] 브라우저에서 웹캠을 켜고 로컬 Mediapipe로 관절 좌표·각도를 계산한다.
- [FR-02] 스쿼트/숄더프레스 규칙으로 rep 카운트·최하단 캡처를 수행하고, 스켈레톤/캡처를 UI에 표시한다.
- [FR-03] 최하단 캡처 이미지를 FastAPI REST(`/analyze-image`)로 전송해 OpenAI API 기반 피드백을 받는다.
- [FR-04] 브라우저 Web Speech API로 텍스트 피드백을 음성(TTS)으로 재생한다.
- [FR-05] YouTube Data API(또는 수동 ID/링크)로 튜토리얼 영상을 임베드하고, 실패 시 기본 영상으로 대체한다.
- [FR-06] 운동 변경 시 세션 상태(카운트/로그/피드백)를 초기화한다.
- [FR-07] API 키·엔드포인트는 `.env → env.js`로 주입해 프론트에서 사용한다.
- [FR-08] 필요 시 세션 종료 시 카메라 스트림을 정지하고, 시작 시 재요청한다.

## 2. 비기능 요구사항
- [NFR-01] 로컬 데모 기준 저지연(수백 ms~1s) 피드백을 목표로 한다.
- [NFR-02] API 키 누락/쿼터 초과 시 기본 안내·대체 영상으로 폴백한다.
- [NFR-03] 키 노출 방지를 위해 .env → env.js 생성, env.js는 Git에 포함하지 않는다.
- [NFR-04] 외부 네트워크(OpenAI/YouTube) 실패 시에도 최소한 카메라 스트림·기본 영상은 동작해야 한다.

---------------------------

# 프로젝트 설계서

## 1. 시스템 아키텍처
1. **사용자(브라우저)**: 웹캠 ON, 운동 선택(스쿼트/숄더프레스), 튜토리얼 시청·채팅·TTS 청취  
2. **Frontend(UI)**: React(JSX/CDN) 단일 페이지, 로컬 Mediapipe로 관절/rep 계산·스켈레톤 표시, 최하단 캡처를 REST로 전송, 튜토리얼/채팅/TTS UI  
3. **FastAPI REST 서버(`exercise_server.py`)**: `/analyze-image`로 캡처 이미지 수신 → OpenAI API로 한국어 피드백 생성, `/chat`으로 질의응답, `/search-youtube`로 추천 검색  
4. **LLM 모듈(OpenAI API)**: 캡처 기반 피드백/채팅 응답 생성  
5. **튜토리얼/검색**: YouTube Data API로 추천/검색, 실패 시 기본·nocookie 영상 폴백  
6. **TTS**: 브라우저 Web Speech API, 쿨다운/중복 방지, 다시 듣기 지원  
7. **데이터/로그**: 프론트 메모리 세션(역사/rep/feedback), 선택 시 `exercise_data/`에 로그·영상 저장(서버)

## 2. 기술 스택
## 📚 TECH STACKS

**Frontend**
<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=0B1E2D"/>
  <img src="https://img.shields.io/badge/Babel-F9DC3E?style=for-the-badge&logo=babel&logoColor=000"/>
  <img src="https://img.shields.io/badge/REST%20API-0F172A?style=for-the-badge&logo=fastapi&logoColor=white"/>
  <img src="https://img.shields.io/badge/Web%20Speech%20API-7C3AED?style=for-the-badge&logoColor=white"/>
  <img src="https://img.shields.io/badge/YouTube%20Data%20API-FF0000?style=for-the-badge&logo=youtube&logoColor=white"/>
</p>

**Backend**
<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white"/>
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white"/>
  <img src="https://img.shields.io/badge/Uvicorn-1E90FF?style=for-the-badge&logo=python&logoColor=white"/>
  <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white"/>
  <img src="https://img.shields.io/badge/httpx-0F172A?style=for-the-badge&logo=python&logoColor=white"/>
</p>

**CV / 분석**
<p align="center">
  <img src="https://img.shields.io/badge/MediaPipe%20-00C7B7?style=for-the-badge&logo=google&logoColor=white"/>
  <img src="https://img.shields.io/badge/OpenAI%20Vision-412991?style=for-the-badge&logo=openai&logoColor=white"/>
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

    subgraph CLIENT["웹 브라우저 (React + Mediapipe)"]
        U["사용자 · 웹캠 ON · 운동 선택"]
        UI["UI/JS · 로컬 Pose 각도·rep 계산 · 스켈레톤 표시 · 튜토리얼 · TTS"]
    end

    subgraph SERVER["FastAPI / exercise_server.py"]
        REST["REST: /analyze-image /chat /search-youtube /save-log /save-session"]
        LOGS["exercise_data/ (로그·영상 저장)"]
    end

    YT["YouTube Data API (튜토리얼 검색)"]
    OA["OpenAI API (피드백/채팅 응답)"]

    U -->|"웹캠 스트림"| UI
    UI -->|"캡처 이미지 전송"| REST
    REST --> OA --> REST
    REST -->|"피드백 JSON"| UI
    UI -->|"검색 키워드"| REST
    REST -->|"추천 결과"| UI
    REST --> LOGS
```
---------------------------

# 데이터 연동 정의서

## 1. 데이터 정의
- 입력: 웹캠 프레임(로컬 처리), 최하단 캡처(base64 JPEG), 운동 선택(스쿼트/숄더프레스), 채팅 메시지  
- 출력: 코칭 피드백 텍스트, rep 카운트, 캡처 이미지, 튜토리얼 영상 링크
- 외부 키: `OPENAI_API_KEY`, `YOUTUBE_API_KEY` (.env → env.js), 공개 저장소에 포함 금지
- 로컬 파일: `exercise_data/`(로그·영상 저장), `env.js`(런타임용)

## 2. 연동 방식
- REST `/analyze-image`: 프론트 캡처 이미지 → 서버 → OpenAI → 피드백 JSON 반환
- REST `/chat`, `/search-youtube`, `/save-log`, `/save-session`: 채팅·추천·로그/영상 저장 처리
- HTTP 정적 서빙: `frontend/index.html`, `frontend/src/*`, `frontend/env.js`
- OpenAI API: 서버에서 피드백/채팅 생성
- YouTube Data API: 서버에서 추천 검색, 실패 시 프론트에서 기본 영상 폴백

--------------------------

# 클라우드 아키텍처 설계서

## 1. 아키텍처 개요
- 기본은 로컬(정적 서버 + FastAPI REST) 데모로 동작하며, 필요 시 아래와 같이 클라우드에 배포 가능:
  - 프론트: 정적 호스팅(S3/CloudFront, Vercel 등) + env 주입(frontend/env.js)
  - 백엔드: FastAPI + uvicorn (예: EC2/Cloud Run), REST 엔드포인트(`/analyze-image`, `/chat`, `/search-youtube`, `/save-log`, `/save-session`)
  - 비공개 키: 서버 환경변수로 관리, env.js에는 넣지 않음

## 2. 설계 이미지
```
[Browser]
  - frontend/index.html + src/* (React + Mediapipe)
  - frontend/env.js (키/엔드포인트 주입)
        |
        v
[Backend - FastAPI REST]
  - /analyze-image (캡처 → OpenAI → 피드백)
  - /chat
  - /search-youtube
  - /save-log, /save-session (exercise_data/ 저장)
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
- **프로젝트 이름**: EXERCISE COACH(EC)
- **기간**: [2025-12-02 ~ 2025-12-12]
- **팀 구성원**: 김채원(팀장), 손지원, 이주연, 이진배

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
