from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import json
from dotenv import load_dotenv
import os
import base64
from datetime import datetime
from pathlib import Path
import httpx

load_dotenv()

app = FastAPI()

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

# YouTube API Key
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")


# ======== 이미지 분석 엔드포인트 ========
@app.post("/analyze-image")
async def analyze_image(request: Request):
    """운동 자세 이미지를 분석하여 피드백 제공 (스쿼트/플랭크)"""
    data = await request.json()
    
    image_data = data.get("image", "")
    rep_count = data.get("rep_count", 0)
    exercise_type = data.get("exercise_type", "squat")
    hold_time = data.get("hold_time", 0)  # 플랭크용 유지 시간
    
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
        "plank": """플랭크 자세 분석:
1. 몸이 어깨-엉덩이-발목이 일직선이어야 함 (160~185° 범위)
2. 엉덩이가 너무 올라가면(pike) 안 됨 - "엉덩이를 내려주세요"
3. 엉덩이가 너무 처지면(sag) 안 됨 - "엉덩이를 올려주세요"
4. 목이 자연스럽게 척추와 일직선이어야 함
5. 코어에 힘을 주고 있는지 확인""",
        "shoulder_press": """숄더프레스 자세 분석:
1. 시작 자세: 팔꿈치 각도가 약 90° (덤벨/바벨이 어깨 높이)
2. 완료 자세: 팔꿈치 각도가 160° 이상 (팔이 거의 펴짐)
3. 팔꿈치가 너무 벌어지면 안 됨 (어깨 부상 위험)
4. 허리가 과도하게 젖혀지면 안 됨 (코어 긴장 유지)
5. 손목이 꺾이지 않고 일직선 유지"""
    }
    
    # 운동별 컨텍스트 메시지
    if exercise_type == "plank":
        context_msg = f"플랭크 {hold_time}초 유지 중 자세입니다."
    else:
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
- 자세가 전반적으로 좋으면: "좋은 {exercise_type}입니다!"
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
    """운동 세션 저장 (파일): 로그 + 영상"""
    data = await request.json()
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    exercise_type = data.get("exercise", "unknown")
    
    # 세션 폴더 생성
    session_dir = SAVE_DIR / f"{timestamp}_{exercise_type}"
    session_dir.mkdir(exist_ok=True)
    
    # 1. 로그 저장 (JSON)
    log_data = {
        "exercise": exercise_type,
        "reps": data.get("reps", 0),
        "duration": data.get("duration", 0),
        "hold_time": data.get("hold_time", 0),  # 플랭크용
        "date": data.get("date", timestamp),
        "feedbacks": data.get("feedbacks", [])
    }
    log_file = session_dir / "log.json"
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)
    
    # 2. 영상 저장 (WebM)
    video_data = data.get("video", "")
    if video_data:
        if "," in video_data:
            video_data = video_data.split(",")[1]
        video_bytes = base64.b64decode(video_data)
        video_file = session_dir / "exercise.webm"
        with open(video_file, "wb") as f:
            f.write(video_bytes)
    
    return {
        "success": True,
        "saved_path": str(session_dir),
        "log_file": str(log_file)
    }

@app.get("/get-logs")
async def get_logs():
    """저장된 운동 로그 조회"""
    return {"logs": exercise_logs[-10:]}


# ======== YouTube 검색 엔드포인트 ========
@app.get("/search-youtube")
async def search_youtube(exercise: str = "squat"):
    """운동 카테고리별 유튜브 영상 검색"""
    
    # 운동별 검색어
    search_queries = {
        "squat": "스쿼트 자세 튜토리얼",
        "plank": "플랭크 자세 튜토리얼",
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


# uvicorn exercise_server:app --host 0.0.0.0 --port 8003
