// src/App.jsx
import React, { useEffect, useRef, useState } from 'react';

// -----------------------------
// 1) .env에서 API 키 읽기
// -----------------------------
const env = typeof import.meta !== 'undefined' ? import.meta.env : {};
const fallbackEnv = typeof process !== 'undefined' ? process.env : {};

const YOUTUBE_API_KEY =
  env?.VITE_YOUTUBE_API_KEY ||
  env?.REACT_APP_YOUTUBE_API_KEY ||
  fallbackEnv?.VITE_YOUTUBE_API_KEY ||
  fallbackEnv?.REACT_APP_YOUTUBE_API_KEY ||
  '';

const OPENAI_API_KEY =
  env?.VITE_OPENAI_API_KEY ||
  env?.REACT_APP_OPENAI_API_KEY ||
  fallbackEnv?.VITE_OPENAI_API_KEY ||
  fallbackEnv?.REACT_APP_OPENAI_API_KEY ||
  '';

const EXERCISES = ['플랭크', '스쿼트'];
const FALLBACK_YT = 'https://www.youtube.com/embed/bm5Zbmr34yw';
const YT_QUERY_MAP = {
  플랭크: '플랭크 운동 자세',
  스쿼트: '스쿼트 운동 자세',
};

// 임시 지난 운동 기록 (나중에 백엔드로 교체)
const DUMMY_HISTORY = [
  { date: '2025-12-04', exercise: '플랭크', set: '3세트', summary: '허리 각도 안정적' },
  { date: '2025-12-03', exercise: '플랭크', set: '2세트', summary: '어깨 살짝 내려주기' },
  { date: '2025-12-02', exercise: '스쿼트', set: '4세트', summary: '무릎 안쪽 모임 주의' },
];

function App() {
  const [exercise, setExercise] = useState('플랭크');
  const [youtubeUrl, setYoutubeUrl] = useState(FALLBACK_YT);
  const [history, setHistory] = useState(
    DUMMY_HISTORY.filter((h) => h.exercise === '플랭크'),
  );
  const [feedback, setFeedback] = useState('웹캠을 켜면 자세 피드백이 여기에 표시됩니다.');
  const [chatMessages, setChatMessages] = useState([]); // {role: 'user'|'assistant', content: string}
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [youtubeError, setYoutubeError] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(true);

  const videoRef = useRef(null);
  const synthRef = useRef(null);
  const lastSpokenRef = useRef('');

  // 운동 변경 시 YouTube 검색 + 지난 운동 기록 갱신
  useEffect(() => {
    let cancelled = false;

    async function fetchYoutube() {
      setYoutubeError('');

      if (!YOUTUBE_API_KEY) {
        setYoutubeUrl(FALLBACK_YT);
        setYoutubeError('.env에 YOUTUBE_API_KEY가 없어 기본 영상을 사용합니다.');
        return;
      }

      const query = YT_QUERY_MAP[exercise] || `${exercise} 운동 자세`;
      const params = new URLSearchParams({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: '1',
        videoEmbeddable: 'true',
        key: YOUTUBE_API_KEY,
      });

      try {
        const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
        if (!resp.ok) throw new Error(`YouTube API 실패 (${resp.status})`);
        const data = await resp.json();
        const items = data?.items || [];
        if (!items.length) {
          setYoutubeUrl(FALLBACK_YT);
          setYoutubeError('검색 결과가 없어 기본 영상을 사용합니다.');
          return;
        }
        const videoId = items[0]?.id?.videoId;
        if (!videoId) {
          setYoutubeUrl(FALLBACK_YT);
          setYoutubeError('videoId가 없어 기본 영상을 사용합니다.');
          return;
        }
        if (!cancelled) setYoutubeUrl(`https://www.youtube.com/embed/${videoId}`);
      } catch (err) {
        console.error('YouTube API error:', err);
        setYoutubeUrl(FALLBACK_YT);
        setYoutubeError('YouTube API 호출 중 오류가 발생하여 기본 영상을 사용합니다.');
      }
    }

    fetchYoutube();
    setHistory(DUMMY_HISTORY.filter((h) => h.exercise === exercise));
    setFeedback(`${exercise} 자세 분석 예시: 코어를 조금 더 조여 주세요.`);

    return () => {
      cancelled = true;
    };
  }, [exercise]);

  // 웹캠 시작
  useEffect(() => {
    async function initCamera() {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
      } catch (err) {
        console.error('Camera error:', err);
      }
    }
    initCamera();

    // cleanup: 컴포넌트 unmount 시 카메라 끄기
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // TTS 준비
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) {
      setTtsSupported(false);
      return;
    }
    synthRef.current = window.speechSynthesis;
    return () => {
      synthRef.current?.cancel?.();
    };
  }, []);

  const speakFeedback = (text) => {
    if (!ttsEnabled || !synthRef.current || !ttsSupported) return;
    const say = (text || '').trim();
    if (!say) return;
    synthRef.current.cancel();
    const u = new SpeechSynthesisUtterance(say);
    u.lang = 'ko-KR';
    u.rate = 1.0;
    u.pitch = 1.0;
    synthRef.current.speak(u);
    lastSpokenRef.current = say;
  };

  // 피드백이 바뀌면 자동으로 읽어주기
  useEffect(() => {
    if (!ttsEnabled) return;
    if (!feedback?.trim()) return;
    if (lastSpokenRef.current === feedback.trim()) return;
    speakFeedback(feedback);
  }, [feedback, ttsEnabled]);

  // 채팅 전송 (OpenAI API 사용)
  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text) return;
    if (isChatting) return;

    const userMsg = { role: 'user', content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    if (!OPENAI_API_KEY) {
      const botMsg = {
        role: 'assistant',
        content: 'OPENAI_API_KEY가 설정되지 않아 기본 안내만 제공합니다. .env를 확인해 주세요.',
      };
      setChatMessages((prev) => [...prev, botMsg]);
      return;
    }

    setIsChatting(true);
    try {
      const messages = [
        {
          role: 'system',
          content: '너는 운동 자세를 알려주는 트레이너야. 전문적이지만 말은 쉽게, 한국어로 답변해.',
        },
        ...chatMessages,
        userMsg,
      ].map((m) => ({
        role: m.role,
        content: m.role === 'user' ? `[현재 운동: ${exercise}] ${m.content}` : m.content,
      }));

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
        }),
      });

      if (!resp.ok) {
        throw new Error(`OpenAI API 실패 (${resp.status})`);
      }
      const data = await resp.json();
      const replyText = data?.choices?.[0]?.message?.content || '응답을 파싱하지 못했습니다.';
      const botMsg = { role: 'assistant', content: replyText };
      setChatMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('OpenAI API error:', err);
      const botMsg = {
        role: 'assistant',
        content: `LLM 호출 중 오류가 발생했습니다: ${err.message || err}`,
      };
      setChatMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>운동 자세 AI Agent</h1>

      <div style={styles.row}>
        {/* 왼쪽: 운동 선택 + 채팅 */}
        <div style={styles.leftCol}>
          <h2 style={styles.sectionTitle}>운동 카테고리</h2>
          <div id="exercise_radio" style={styles.radioGroup}>
            {EXERCISES.map((ex) => (
              <label
                key={ex}
                style={{
                  ...styles.radioLabel,
                  ...(exercise === ex ? styles.radioLabelActive : {}),
                }}
              >
                <input
                  type="radio"
                  name="exercise"
                  value={ex}
                  checked={exercise === ex}
                  onChange={() => setExercise(ex)}
                  style={styles.radioInput}
                />
                {ex}
              </label>
            ))}
          </div>

          <h2 style={{ ...styles.sectionTitle, marginTop: 24 }}>채팅 (LLM)</h2>
          <div style={styles.chatBox}>
            {chatMessages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.chatMessage,
                  ...(m.role === 'user' ? styles.chatUser : styles.chatAssistant),
                }}
              >
                <strong>{m.role === 'user' ? '사용자' : '코치'}</strong>
                <div>{m.content}</div>
              </div>
            ))}
          </div>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="운동하면서 궁금한 점을 물어보세요."
            rows={2}
            style={styles.chatInput}
          />
          <button
            style={{
              ...styles.sendButton,
              ...(isChatting ? styles.sendButtonDisabled : {}),
            }}
            onClick={handleSend}
            disabled={isChatting}
          >
            {isChatting ? '전송 중…' : '전송'}
          </button>
        </div>

        {/* 가운데: 유튜브 + 웹캠 + 피드백 */}
        <div style={styles.centerCol}>
          <div style={{ height: 40 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={styles.videoWrapper}>
              <iframe
                width="100%"
                height="400"
                src={youtubeUrl}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              {youtubeError ? (
                <div style={styles.helperText}>{youtubeError}</div>
              ) : null}
            </div>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={styles.webcam}
            />
          </div>

          <div style={{ height: 20 }} />
          <div style={styles.feedbackHeader}>
            <h2 style={styles.sectionTitle}>자세 피드백</h2>
            <div style={styles.ttsControls}>
              {!ttsSupported ? (
                <span style={styles.ttsWarning}>브라우저가 TTS를 지원하지 않습니다.</span>
              ) : (
                <>
                  <button
                    style={{
                      ...styles.ttsButton,
                      ...(ttsEnabled ? styles.ttsButtonActive : {}),
                    }}
                    onClick={() => setTtsEnabled((v) => !v)}
                  >
                    {ttsEnabled ? 'TTS ON' : 'TTS OFF'}
                  </button>
                  <button
                    style={styles.ttsReplay}
                    onClick={() => speakFeedback(feedback)}
                    disabled={!ttsEnabled || !ttsSupported}
                  >
                    다시 듣기
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            value={feedback}
            readOnly
            rows={4}
            style={styles.feedbackBox}
          />
        </div>

        {/* 오른쪽: 지난 운동 기록 */}
        <div style={styles.rightCol}>
          <h2 style={styles.sectionTitle}>지난 운동 기록</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>날짜</th>
                <th>운동</th>
                <th>세트/시간</th>
                <th>요약 피드백</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, idx) => (
                <tr key={idx}>
                  <td>{h.date}</td>
                  <td>{h.exercise}</td>
                  <td>{h.set}</td>
                  <td>{h.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* 간단한 인라인 스타일 모음 (나중에 CSS 파일로 빼도 됨) */
const styles = {
  page: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    padding: '16px 24px',
    backgroundColor: '#f9fafb',
    minHeight: '100vh',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
  },
  row: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
  },
  leftCol: {
    flex: '0 0 260px',
    display: 'flex',
    flexDirection: 'column',
  },
  centerCol: {
    flex: 3,
    minWidth: 640,
  },
  rightCol: {
    flex: '0 0 260px',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 8,
  },
  radioGroup: {
    display: 'flex',
    gap: 8,
  },
  radioInput: {
    display: 'none',
  },
  radioLabel: {
    borderRadius: 9999,
    padding: '4px 12px',
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
    fontSize: 14,
    backgroundColor: '#ffffff',
  },
  radioLabelActive: {
    backgroundColor: '#4b5563',
    color: '#f9fafb',
    borderColor: '#4b5563',
  },
  chatBox: {
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: 8,
    height: 200,
    overflowY: 'auto',
    backgroundColor: '#ffffff',
  },
  chatMessage: {
    borderRadius: 6,
    padding: 6,
    marginBottom: 6,
    fontSize: 14,
  },
  chatUser: {
    backgroundColor: '#e5e7eb',
    alignSelf: 'flex-start',
  },
  chatAssistant: {
    backgroundColor: '#dbeafe',
    alignSelf: 'flex-end',
  },
  chatInput: {
    width: '100%',
    marginTop: 6,
    padding: 6,
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    resize: 'vertical',
    fontSize: 14,
    boxSizing: 'border-box',
  },
  sendButton: {
    marginTop: 6,
    padding: '6px 12px',
    borderRadius: 9999,
    border: 'none',
    backgroundColor: '#4b5563',
    color: '#f9fafb',
    cursor: 'pointer',
    fontSize: 14,
  },
  sendButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  videoWrapper: {
    flex: 1,
  },
  webcam: {
    flex: 1,
    height: 400,
    borderRadius: 12,
    backgroundColor: '#111827',
    objectFit: 'cover',
    transform: 'scaleX(-1)', // 좌우반전 방지 (필요 시 -1을 1로 변경)
    transformOrigin: 'center',
  },
  feedbackBox: {
    width: '100%',
    padding: 8,
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    fontSize: 14,
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#ffffff',
    fontSize: 13,
  },
  thtdCommon: {
    border: '1px solid #e5e7eb',
    padding: '4px 6px',
    textAlign: 'left',
  },
  helperText: {
    marginTop: 6,
    color: '#ef4444',
    fontSize: 12,
  },
  feedbackHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ttsControls: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  ttsButton: {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  ttsButtonActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    color: '#ecfeff',
  },
  ttsReplay: {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    backgroundColor: '#e0f2fe',
    color: '#075985',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  ttsWarning: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 700,
  },
};

// th/td 공통 스타일을 위해 한 번 더 덮어쓰기
styles.table = {
  ...styles.table,
};
