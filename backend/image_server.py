import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI
import base64

app = FastAPI()

# CORS 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI Client (환경변수에서 키 로드)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


@app.post("/analyze-image")
async def analyze_image(request: Request):
    """스쿼트 최하단 이미지를 분석하여 피드백 제공"""
    data = await request.json()
    
    # Base64 이미지 데이터 받기
    image_data = data.get("image", "")
    rep_count = data.get("rep_count", 0)
    
    if not image_data:
        return {"feedback": "이미지가 없습니다."}

    if not client:
        return {"feedback": "OPENAI_API_KEY가 설정되지 않았습니다. 서버 환경변수를 확인하세요."}
    
    # data:image/jpeg;base64, 형식에서 base64 부분만 추출
    if "," in image_data:
        image_data = image_data.split(",")[1]
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """너는 스쿼트 자세 분석 전문가야. 
사용자가 스쿼트 최하단 자세 이미지를 보내면 자세를 분석해.

평가 기준:
1. 깊이: 무릎 최소 각도가 60~90°면 적절한 스쿼트
2. 상체: 평균 상체 각도가 70~100° 정도면 좋음 (너무 숙이거나 세우면 안됨)
3. 속도: 하강/상승 비율이 비슷해야 좋음 (급하게 내려가거나 올라오면 안됨)

출력 규칙:
- 자세가 문제가 있으면 그에 맞는 피드백하세요, **한국어로 매우 짧고(10자 내외), 직관적인 피드백을 하세요.**
- 자세가 전반적으로 좋으면: "좋은 스쿼트입니다!"
"""
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"이것은 스쿼트 {rep_count}회차 최하단 자세입니다. 자세를 분석해주세요."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}",
                                "detail": "low"  # 빠른 분석을 위해 low 사용
                            }
                        }
                    ]
                }
            ],
            max_tokens=100
        )
        
        feedback = response.choices[0].message.content
        return {"feedback": feedback}
        
    except Exception as e:
        print(f"OpenAI API 오류: {e}")
        return {"feedback": "분석 중 오류가 발생했습니다."}


# uvicorn image_server:app --host 0.0.0.0 --port 8002
