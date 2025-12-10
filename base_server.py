from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

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

@app.post("/feedback")
async def feedback(request: Request):
    data = await request.json()

    # left_torso = data.get("left_torso", 0)
    # right_torso = data.get("right_torso", 0)
    # left_knee = data.get("left_knee", 0)
    # right_knee = data.get("right_knee", 0)
    
    knee = data.get("knee", 0)
    torso = data.get("torso", 0)
    

    prompt = f"""
    당신은 스쿼트 자세 전문가입니다.
    다음의 관절 각도 데이터를 보고 문제 여부를 판단하고 피드백 해주세요.
    
    출력 규칙:
    한 문장만 출력.
    불필요한 설명 금지.

    규칙: 
    네가 판단했을 때 자세가 정상이면 반드시 다음처럼 짧게 말해라: "정상 자세입니다."
    자세가 문제가 있으면 그에 맞는 피드백하세요, **한국어로 매우 짧고(10자 내외), 직관적인 피드백을 하세요.**

    현재 데이터:
    - 무릎 각도: {knee:.1f}
    - 상체 각도: {torso:.1f}
    """

    # 최신 openai 방식
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "너는 스쿼트 자세 전문가야, 내 자세 중 잘못된 부분을 지적해줘"},
            {"role": "user", "content": prompt},
        ]
    )

    message = res.choices[0].message.content
    return {"feedback": message}

# uvicorn fb_server:app --host 0.0.0.0 --port 8000