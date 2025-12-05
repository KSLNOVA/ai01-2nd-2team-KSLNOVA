import os
import requests
import pandas as pd
import gradio as gr
from dotenv import load_dotenv
from openai import OpenAI

# -----------------------------
# 1. .env에서 키 불러오기
# -----------------------------
load_dotenv()

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not YOUTUBE_API_KEY:
    print("[경고] .env에 YOUTUBE_API_KEY가 없습니다.")
if not OPENAI_API_KEY:
    print("[경고] .env에 OPENAI_API_KEY가 없습니다.")

client = OpenAI(api_key=OPENAI_API_KEY)

# -----------------------------
# 2. YouTube 추천 영상
# -----------------------------
def search_exercise_video(exercise: str) -> str:
    """
    운동 이름을 받아서 YouTube에서 검색하고
    embed용 URL (https://www.youtube.com/embed/...)을 리턴
    """
    if not YOUTUBE_API_KEY:
        # 키 없으면 기본 영상
        return "https://www.youtube.com/embed/bm5Zbmr34yw"

    query_map = {
        "플랭크": "플랭크 운동 자세",
        "스쿼트": "스쿼트 운동 자세",
    }
    query = query_map.get(exercise, f"{exercise} 운동 자세")

    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": 1,
        "videoEmbeddable": "true",
        "key": YOUTUBE_API_KEY,
    }

    try:
        resp = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params=params,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])
        if not items:
            return "https://www.youtube.com/embed/bm5Zbmr34yw"
        video_id = items[0]["id"]["videoId"]
        return f"https://www.youtube.com/embed/{video_id}"
    except Exception as e:
        print("YouTube API error:", e)
        return "https://www.youtube.com/embed/bm5Zbmr34yw"


def make_youtube_iframe(embed_url: str) -> str:
    """embed URL을 받아서 <iframe> HTML 생성"""
    return f"""
    <div style="width:100%; display:flex; align-items:center; justify-content:center;">
        <iframe width="100%" height="400" src="{embed_url}"
            title="YouTube video player" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
        </iframe>
    </div>
    """

# -----------------------------
# 3. 지난 운동 기록 (더미 데이터)
# -----------------------------
_dummy_history = [
    ["2025-12-04", "플랭크", "3세트", "허리 각도 안정적"],
    ["2025-12-03", "플랭크", "2세트", "어깨 살짝 내려주기"],
    ["2025-12-02", "스쿼트", "4세트", "무릎 안쪽 모임 주의"],
]

def load_history(exercise: str):
    df = pd.DataFrame(
        _dummy_history,
        columns=["날짜", "운동", "세트/시간", "요약 피드백"],
    )
    if exercise:
        df = df[df["운동"] == exercise]
    return df

def update_exercise(exercise: str):
    """운동 선택이 바뀔 때: 유튜브 + 지난 기록 업데이트"""
    embed_url = search_exercise_video(exercise)
    html = make_youtube_iframe(embed_url)
    history_df = load_history(exercise)
    return html, history_df

# -----------------------------
# 4. 자세 분석 (지금은 더미)
# -----------------------------
def analyze_pose(frame, exercise: str):
    if frame is None:
        return "웹캠을 켜면 자세 피드백이 여기에 표시됩니다."
    # TODO: 여기 나중에 YOLO / MediaPipe 붙이기
    return f"{exercise} 자세 분석 예시: 코어를 조금 더 조여 주세요."

# -----------------------------
# 5. GPT 채팅 (Gradio 6 messages 형식)
# -----------------------------
def chat_with_gpt(history, message: str, exercise: str):
    """
    history: [{"role": "...", "content": "..."}, ...] 형식 (Gradio 6)
    """
    if history is None:
        history = []

    if not message:
        return history, ""

    messages = [
        {
            "role": "system",
            "content": (
                "너는 운동 자세를 알려주는 트레이너야. "
                "전문적이지만 말은 쉽게, 한국어로 답변해."
            ),
        }
    ]

    for msg in history:
        if (
            isinstance(msg, dict)
            and "role" in msg
            and "content" in msg
            and isinstance(msg["content"], str)
        ):
            messages.append(
                {"role": msg["role"], "content": msg["content"]}
            )

    messages.append(
        {"role": "user", "content": f"[현재 운동: {exercise}] {message}"}
    )

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
        )
        reply_text = resp.choices[0].message.content
    except Exception as e:
        print("OpenAI API error:", repr(e))
        reply_text = f"LLM 호출 중 오류가 발생했습니다: {e}"

    history = history + [
        {"role": "user", "content": message},
        {"role": "assistant", "content": reply_text},
    ]
    return history, ""

# -----------------------------
# 6. Gradio 레이아웃 (+ 최소 CSS)
# -----------------------------
with gr.Blocks() as demo:
    # 👉 여기 CSS 한 덩어리만 UI에 영향 줌
    gr.HTML(
        """
        <style>
        /* 1) 전송 버튼만 진한 회색으로 */
        #send_button button {
            background-color: #4b5563 !important;  /* slate-600 */
            border-color: #4b5563 !important;
            color: #f9fafb !important;
        }
        #send_button button:hover {
            filter: brightness(1.05);
        }

        /* 2) 라디오·체크박스 원(inner-dot) 색만 회색으로 */
        input[type="radio"],
        input[type="checkbox"] {
            accent-color: #4b5563;
        }

        /* 3) 박스들 테두리만 살짝 더 진하게 */
        .gr-panel, .gr-box, .gr-group, .gr-block {
            border-color: #cbd5e1 !important;  /* slate-300 */
            border-width: 1px !important;
        }

        /* 4) 지난 운동 기록 표는 배경 흰색으로 (회색 헤더 제거) */
        .gr-dataframe table thead th {
            background-color: #ffffff !important;
            color: #111827 !important;
        }
        .gr-dataframe table tbody td {
            background-color: #ffffff !important;
            color: #111827 !important;
        }
        </style>
        """
    )

    gr.Markdown("# 🏋🏻 운동 자세 AI Agent")

    with gr.Row():
        # ----- 왼쪽: 운동 선택 + 채팅 -----
        with gr.Column(scale=1, min_width=260):
            gr.Markdown("## 🗃️ 운동 카테고리")
            exercise_radio = gr.Radio(
                ["플랭크", "스쿼트"],
                value="플랭크",
                label="운동 선택",
            )

            gr.Markdown("## 💬 채팅 (LLM)")
            chatbox = gr.Chatbot(
                label="코칭 챗봇",
                height=320,
            )
            chat_input = gr.Textbox(
                label="질문 입력",
                placeholder="운동하면서 궁금한 점을 물어보세요.",
                lines=2,
            )
            # ★ elem_id를 달아서 위 CSS에서 이 버튼만 타겟팅
            send_btn = gr.Button("전송", variant="primary", elem_id="send_button")

        # ----- 가운데: 유튜브 + 웹캠 + 피드백 -----
        with gr.Column(scale=3, min_width=640):
            gr.HTML("<div style='height:40px;'></div>")  # 살짝 아래로

            with gr.Row():
                youtube_html = gr.HTML(label="유튜브 추천 영상")
                webcam = gr.Image(
                    label="사용자 웹캠",
                    sources=["webcam"],
                    type="numpy",
                    streaming=True,
                    height=400,       # 유튜브와 높이 맞추기
                )

            gr.HTML("<div style='height:20px;'></div>")

            feedback_box = gr.Textbox(
                label="🗣️ 자세 피드백",
                lines=4,
                interactive=False,
                placeholder=" 🗣️여기에 자세 피드백이 표시됩니다.",
            )

        # ----- 오른쪽: 지난 운동 기록 -----
        with gr.Column(scale=1, min_width=260):
            gr.Markdown("## 📂 지난 운동 기록")
            history_df = gr.Dataframe(
                headers=["날짜", "운동", "세트/시간", "요약 피드백"],
                interactive=False,
            )

    # -------------------------
    # 7. 이벤트 연결
    # -------------------------

    exercise_radio.change(
        fn=update_exercise,
        inputs=exercise_radio,
        outputs=[youtube_html, history_df],
    )

    demo.load(
        fn=update_exercise,
        inputs=exercise_radio,
        outputs=[youtube_html, history_df],
    )

    webcam.stream(
        fn=analyze_pose,
        inputs=[webcam, exercise_radio],
        outputs=feedback_box,
    )

    send_btn.click(
        fn=chat_with_gpt,
        inputs=[chatbox, chat_input, exercise_radio],
        outputs=[chatbox, chat_input],
    )

demo.launch()
