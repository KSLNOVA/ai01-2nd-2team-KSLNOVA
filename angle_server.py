from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import json

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
OPENAI_API_KEY = "api"
client = OpenAI(api_key=OPENAI_API_KEY)


def analyze_cycle_data(cycle_data: list) -> dict:
    """사이클 데이터에서 주요 특성 추출"""
    if not cycle_data:
        return {}
    
    knee_angles = [d["knee"] for d in cycle_data]
    torso_angles = [d["torso"] for d in cycle_data]
    
    # 시간 정보
    duration_ms = cycle_data[-1]["time"] - cycle_data[0]["time"]
    
    # 무릎 분석
    min_knee = min(knee_angles)
    max_knee = max(knee_angles)
    
    # 상체 분석
    min_torso = min(torso_angles)
    max_torso = max(torso_angles)
    avg_torso = sum(torso_angles) / len(torso_angles)
    
    # 하강/상승 구간 찾기
    lowest_idx = knee_angles.index(min_knee)
    descent_data = knee_angles[:lowest_idx+1] if lowest_idx > 0 else []
    ascent_data = knee_angles[lowest_idx:] if lowest_idx < len(knee_angles)-1 else []
    
    return {
        "frame_count": len(cycle_data),
        "duration_sec": round(duration_ms / 1000, 2),
        "knee": {
            "min": round(min_knee, 1),
            "max": round(max_knee, 1),
            "range": round(max_knee - min_knee, 1)
        },
        "torso": {
            "min": round(min_torso, 1),
            "max": round(max_torso, 1),
            "avg": round(avg_torso, 1),
            "range": round(max_torso - min_torso, 1)
        },
        "descent_frames": len(descent_data),
        "ascent_frames": len(ascent_data)
    }


@app.post("/feedback")
async def feedback(request: Request):
    data = await request.json()
    
    # 사이클 데이터 받기
    cycle_data = data.get("cycle_data", [])
    rep_count = data.get("rep_count", 0)
    
    if not cycle_data or len(cycle_data) < 5:
        return {"feedback": "데이터가 충분하지 않습니다."}
    
    # 사이클 분석
    analysis = analyze_cycle_data(cycle_data)
    
    prompt = f"""
당신은 스쿼트 자세 전문가입니다.
사용자가 스쿼트 {rep_count}회차를 완료했습니다.
아래는 이번 스쿼트 사이클의 분석 데이터입니다:

## 사이클 정보
- 소요 시간: {analysis['duration_sec']}초
- 하강 프레임: {analysis['descent_frames']}, 상승 프레임: {analysis['ascent_frames']}

## 무릎 각도 (hip-knee-ankle)
- 최소 각도 (가장 깊이 앉았을 때): {analysis['knee']['min']}°
- 최대 각도 (서있을 때): {analysis['knee']['max']}°

## 상체 각도 (shoulder-hip-knee)
- 평균: {analysis['torso']['avg']}°
- 변동 범위: {analysis['torso']['range']}°

---

평가 기준:
1. 깊이: 무릎 최소 각도가 110° 이하면 적절한 스쿼트, 110° 이상만 문제
2. 상체: 평균 상체 각도가 50~120° 범위면 좋음 (50° 미만이면 너무 숙임, 120° 이상이면 너무 세움)
3. 속도: 하강/상승 비율이 0.3~3.0 범위면 좋음 (0.3 미만이면 너무 빨리 내려감, 3.0 이상이면 너무 빨리 올라옴)

출력 규칙:
- 자세가 문제가 있으면 그에 맞는 피드백하세요, **한국어로 매우 짧고(10자 내외), 직관적인 피드백을 하세요.**
- 자세가 전반적으로 좋으면: "좋은 스쿼트입니다!"
"""
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "너는 스쿼트 자세 분석 전문가야. 한 사이클 데이터를 보고 짧고 정확한 피드백을 제공해."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=100,
        temperature=0.5
    )

    message = res.choices[0].message.content
    return {"feedback": message}


# uvicorn 2:app --host 0.0.0.0 --port 8000