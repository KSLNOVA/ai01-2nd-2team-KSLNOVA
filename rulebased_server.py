from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    descent_frames = lowest_idx + 1 if lowest_idx > 0 else 1
    ascent_frames = len(knee_angles) - lowest_idx
    
    return {
        "frame_count": len(cycle_data),
        "duration_sec": round(duration_ms / 1000, 2),
        "knee_min": round(min_knee, 1),
        "knee_max": round(max_knee, 1),
        "torso_avg": round(avg_torso, 1),
        "torso_range": round(max_torso - min_torso, 1),
        "descent_frames": descent_frames,
        "ascent_frames": ascent_frames
    }


def rule_based_feedback(analysis: dict) -> str:
    """룰 베이스 피드백 생성 (관대한 기준)"""
    if not analysis:
        return "데이터 부족"
    
    problems = []
    
    # 1. 깊이 체크 (무릎 각도) - 더 관대하게
    knee_min = analysis["knee_min"]
    if knee_min > 110:  # 110° 이상만 문제
        problems.append("더 깊이 앉으세요")
    
    # 2. 상체 각도 체크 - 더 관대하게
    torso_avg = analysis["torso_avg"]
    if torso_avg < 60:  # 60° 미만만 문제
        problems.append("상체를 세우세요")
    elif torso_avg > 110:  # 110° 이상만 문제
        problems.append("상체가 너무 세웠어요")
    
    # 3. 속도 균형 체크 - 더 관대하게
    descent = analysis["descent_frames"]
    ascent = analysis["ascent_frames"]
    if descent > 0 and ascent > 0:
        ratio = descent / ascent
        if ratio < 0.3:  # 0.3 미만만 문제
            problems.append("천천히 내려가세요")
        elif ratio > 3.0:  # 3.0 이상만 문제
            problems.append("천천히 올라오세요")
    
    # 결과 반환
    if not problems:
        return "좋은 스쿼트입니다!"
    else:
        return problems[0]  # 가장 중요한 문제 하나만 반환


@app.post("/feedback")
async def feedback(request: Request):
    data = await request.json()
    
    # 사이클 데이터 받기
    cycle_data = data.get("cycle_data", [])
    
    if not cycle_data or len(cycle_data) < 5:
        return {"feedback": "데이터가 충분하지 않습니다."}
    
    # 사이클 분석
    analysis = analyze_cycle_data(cycle_data)
    
    # 룰 베이스 피드백 생성
    feedback_msg = rule_based_feedback(analysis)
    
    return {"feedback": feedback_msg, "analysis": analysis}


# uvicorn rule_based_server:app --host 0.0.0.0 --port 8001
