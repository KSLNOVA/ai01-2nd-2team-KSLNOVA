from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from openai import OpenAI
import json
from dotenv import load_dotenv
import os
import base64
from datetime import datetime
from pathlib import Path
import httpx
import db  # DB 모듈 임포트

load_dotenv()

app = FastAPI()

# 프론트엔드 정적 파일 경로
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# 서버 시작 시 DB 테이블 준비 (없으면 생성)
@app.on_event("startup")
async def startup_event():
    db.init_db()

# CORS 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI Client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)

# 운동 로그 저장 디렉토리
exercise_logs = []
SAVE_DIR = Path(__file__).parent / "exercise_data"
SAVE_DIR.mkdir(exist_ok=True)

# FileResponse import
from fastapi.responses import FileResponse

# YouTube API Key
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")


# ======== 이미지 분석 엔드포인트 ========
@app.post("/analyze-image")
async def analyze_image(request: Request):
    """운동 자세 이미지를 분석하여 피드백 제공 (스쿼트/숄더프레스)"""
    data = await request.json()
    
    image_data = data.get("image", "")
    rep_count = data.get("rep_count", 0)
    exercise_type = data.get("exercise_type", "squat")
    
    if not image_data:
        return {"feedback": "이미지가 없습니다."}
    
    if "," in image_data:
        image_data = image_data.split(",")[1]
    
    # 운동별 프롬프트
    prompts = {
        "squat": """스쿼트 자세 분석:
1. 깊이: 무릎 최소 각도가 60~90°면 적절한 스쿼트
2. 상체: 평균 상체 각도가 70~100° 정도면 좋음 (너무 숙이거나 세우면 안됨)
3. 속도: 하강/상승 비율이 비슷해야 좋음 (급하게 내려가거나 올라오면 안됨)""",
        "shoulder_press": """숄더프레스 자세 분석:
1. 시작 자세: 팔꿈치 각도가 약 90° (덤벨/바벨이 어깨 높이)
2. 완료 자세: 팔꿈치 각도가 160° 이상 (팔이 거의 펴짐)
3. 허리가 과도하게 젖혀지면 안 됨 (코어 긴장 유지)
4. 손목이 꺾이지 않고 일직선 유지"""
    }
    
    # 운동별 컨텍스트 메시지
    context_msg = f"{exercise_type} {rep_count}회차 자세입니다."
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"""너는 운동 자세 분석 전문가야.
{prompts.get(exercise_type, prompts['squat'])}

출력 규칙:
- 자세가 문제가 있으면 그에 맞는 피드백하세요, **한국어로 매우 짧고(10자 내외), 직관적인 피드백을 하세요.**
- 자세가 전반적으로 좋으면: "좋은 {exercise_type} 자세입니다!"
"""
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": context_msg},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}", "detail": "low"}}
                    ]
                }
            ],
            max_tokens=50
        )
        return {"feedback": response.choices[0].message.content}
    except Exception as e:
        print(f"OpenAI API 오류: {e}")
        return {"feedback": "분석 중 오류가 발생했습니다."}


# ======== LLM 채팅 엔드포인트 ========
@app.post("/chat")
async def chat(request: Request):
    """운동 관련 질의응답"""
    data = await request.json()
    message = data.get("message", "")
    
    if not message:
        return {"response": "메시지를 입력해주세요."}
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """너는 피트니스 전문 AI 트레이너야.
운동 방법, 자세, 식단, 운동 계획 등에 대해 친절하게 답변해.
스쿼트, 플랭크, 숄더프레스에 특히 전문적이야.
한국어로 간결하게 답변해 (2-3문장)."""
                },
                {"role": "user", "content": message}
            ],
            max_tokens=200
        )
        return {"response": response.choices[0].message.content}
    except Exception as e:
        print(f"Chat 오류: {e}")
        return {"response": "응답 생성 중 오류가 발생했습니다."}


# ======== 운동 로그 및 영상 저장 ========
@app.post("/save-log")
async def save_log(request: Request):
    """운동 로그 저장 (메모리)"""
    data = await request.json()
    exercise_logs.append(data)
    return {"success": True, "total_logs": len(exercise_logs)}

@app.post("/save-session")
async def save_session(request: Request):
    """운동 세션 저장 (파일 + DB): 로그 + 영상 + 종합 리포트"""
    data = await request.json()
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    date_str = datetime.now().strftime("%Y-%m-%d")
    exercise_type = data.get("exercise", "unknown")
    reps = data.get("reps", 0)
    duration = data.get("duration", 0)
    feedbacks = data.get("feedbacks", [])
    
    # 세션 폴더 생성
    session_dir = SAVE_DIR / f"{timestamp}_{exercise_type}"
    session_dir.mkdir(exist_ok=True)
    
    # 1. 로그 저장 (JSON)
    log_data = {
        "exercise": exercise_type,
        "reps": reps,
        "duration": duration,
        "date": data.get("date", timestamp),
        "feedbacks": feedbacks
    }
    log_file = session_dir / "log.json"
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)
    
    # 2. 영상 저장 (WebM)
    video_path = None
    video_data = data.get("video", "")
    if video_data:
        if "," in video_data:
            video_data = video_data.split(",")[1]
        video_bytes = base64.b64decode(video_data)
        video_file = session_dir / "exercise.webm"
        with open(video_file, "wb") as f:
            f.write(video_bytes)
        video_path = str(video_file)
    
    # 3. GPT로 종합 리포트 생성
    summary_report = None
    if feedbacks and len(feedbacks) > 0:
        try:
            feedback_text = "\n".join([f"- {fb}" for fb in feedbacks if fb])
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": f"""당신은 운동 자세 분석 전문가입니다.
아래는 사용자의 {exercise_type} 운동 중 받은 피드백 목록입니다.
이 피드백들을 종합하여 3-4문장의 운동 리포트를 작성하세요.
- 잘한 점
- 개선이 필요한 점  
- 다음 운동 시 주의사항
을 포함해주세요. 한국어로 간결하게 작성하세요."""
                    },
                    {
                        "role": "user",
                        "content": f"운동: {exercise_type}\n횟수: {reps}회\n시간: {duration}초\n\n받은 피드백:\n{feedback_text}"
                    }
                ],
                max_tokens=300
            )
            summary_report = response.choices[0].message.content
            print(f"✅ 종합 리포트 생성 완료")
        except Exception as e:
            print(f"종합 리포트 생성 오류: {e}")
            summary_report = f"총 {reps}회 운동 완료. 피드백: " + ", ".join(feedbacks[:3])
    
    # 4. DB에 저장 ✅
    record_id = db.save_exercise_record(
        date=date_str,
        exercise_type=exercise_type,
        reps=reps,
        duration=duration,
        video_path=video_path,
        summary_report=summary_report
    )
    
    return {
        "success": True,
        "record_id": record_id,
        "saved_path": str(session_dir),
        "log_file": str(log_file),
        "summary_report": summary_report
    }

@app.get("/get-logs")
async def get_logs(limit: int = 20):
    """저장된 운동 로그 조회 (DB에서)"""
    records = db.get_all_records(limit=limit)
    return {"logs": records}


@app.get("/video/{session_folder}/{filename}")
async def serve_video(session_folder: str, filename: str):
    """저장된 운동 영상 제공"""
    video_file = SAVE_DIR / session_folder / filename
    if video_file.exists():
        return FileResponse(
            path=str(video_file),
            media_type="video/webm",
            filename=filename
        )
    return {"error": "영상을 찾을 수 없습니다."}


# ======== YouTube 검색 엔드포인트 ========
@app.get("/search-youtube")
async def search_youtube(exercise: str = "squat"):
    """운동 카테고리별 유튜브 영상 검색"""
    
    # 운동별 검색어
    search_queries = {
        "squat": "스쿼트 자세 튜토리얼",
        "shoulder_press": "숄더프레스 덤벨 자세 튜토리얼"
    }
    
    query = search_queries.get(exercise, "운동 자세 튜토리얼")
    
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet",
                    "q": query,
                    "type": "video",
                    "maxResults": 5,
                    "key": YOUTUBE_API_KEY
                }
            )
            data = response.json()
            
            videos = []
            for item in data.get("items", []):
                videos.append({
                    "videoId": item["id"]["videoId"],
                    "title": item["snippet"]["title"],
                    "thumbnail": item["snippet"]["thumbnails"]["medium"]["url"]
                })
            
            return {"videos": videos}
    except Exception as e:
        print(f"YouTube API 오류: {e}")
        return {"videos": [], "error": str(e)}


# ======== 프론트엔드 정적 파일 서빙 ========
@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """루트 경로에서 index.html 제공"""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return index_path.read_text(encoding="utf-8")
    return HTMLResponse("<h1>Frontend not found</h1>", status_code=404)


# 정적 파일 마운트 (src, styles, env.js 등)
app.mount("/src", StaticFiles(directory=str(FRONTEND_DIR / "src")), name="src")
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# uvicorn exercise_server:app --host 0.0.0.0 --port 8003
# 브라우저에서 http://localhost:8003 접속