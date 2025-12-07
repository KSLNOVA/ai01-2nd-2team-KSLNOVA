import React, { useEffect, useRef, useState } from 'react';
import './run.css';

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
const EXERCISE_FOCUS = {
  플랭크: ['코어 안정성', '어깨-골반 정렬'],
  스쿼트: ['무릎 트래킹', '엉덩이 힌지'],
};

const FEEDBACK_PRESETS = {
  플랭크: [
    '코어를 단단하게 잠그고 어깨를 살짝 뒤로 열어 주세요.',
    '골반이 말리지 않도록 시선은 45도 아래를 바라봅니다.',
    '발끝부터 정수리까지 일직선으로 만들고 호흡을 길게 유지하세요.',
  ],
  스쿼트: [
    '무릎과 발끝이 같은 방향을 보도록 천천히 내려옵니다.',
    '엉덩이를 먼저 뒤로 빼며 척추는 중립을 유지하세요.',
    '가슴을 열고 무릎이 안쪽으로 말리지 않게 의식합니다.',
  ],
};

const FALLBACK_YT = 'https://www.youtube.com/embed/bm5Zbmr34yw';
const YT_QUERY_MAP = {
  플랭크: '플랭크 운동 자세',
  스쿼트: '스쿼트 운동 자세',
};

const DUMMY_HISTORY = [
  { date: '2025-12-04', exercise: '플랭크', set: '3세트', summary: '허리 각도 안정적' },
  { date: '2025-12-03', exercise: '플랭크', set: '2세트', summary: '어깨 살짝 내려주기' },
  { date: '2025-12-02', exercise: '스쿼트', set: '4세트', summary: '무릎 안쪽 모임 주의' },
];

const timeLabel = () =>
  new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date());

function App() {
  const [exercise, setExercise] = useState('플랭크');
  const [youtubeUrl, setYoutubeUrl] = useState(FALLBACK_YT);
  const [history, setHistory] = useState(DUMMY_HISTORY.filter((h) => h.exercise === '플랭크'));
  const [feedback, setFeedback] = useState('웹캠을 켜면 자세 피드백이 여기에 표시됩니다.');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [youtubeError, setYoutubeError] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [videoPinned, setVideoPinned] = useState(false);
  const [videoInput, setVideoInput] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [sessionState] = useState('대기 중');
  const [coachingLog, setCoachingLog] = useState([
    { time: '12:30', exercise: '플랭크', text: '호흡을 길게 유지하고 코어를 잠금.' },
    { time: '12:24', exercise: '스쿼트', text: '무릎이 안쪽으로 말리지 않도록 신경 쓰기.' },
  ]);
  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState('');
  const [voiceLabel, setVoiceLabel] = useState('');

  const videoRef = useRef(null);
  const synthRef = useRef(null);
  const voiceRef = useRef(null);
  const lastSpokenRef = useRef('');

  const youtubeReady = Boolean(YOUTUBE_API_KEY);

  const focusLine = (EXERCISE_FOCUS[exercise] || []).join(' · ') || '폼 안정성 유지';

  const layoutColumns = () => {
    if (showLeftPanel && showRightPanel) return '280px 1fr 280px';
    if (showLeftPanel) return '280px 1fr';
    if (showRightPanel) return '1fr 280px';
    return '1fr';
  };

  const appendLog = (text) =>
    setCoachingLog((prev) => [
      { time: timeLabel(), exercise, text },
      ...prev,
    ].slice(0, 8));

  const truncate = (text, max = 64) => {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchYoutube() {
      if (videoPinned) {
        setYoutubeError('수동으로 고정된 영상입니다. 기본 추천을 보려면 해제하세요.');
        return;
      }
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
        const items = data && data.items ? data.items : [];
        if (!items.length) {
          setYoutubeUrl(FALLBACK_YT);
          setYoutubeError('검색 결과가 없어 기본 영상을 사용합니다.');
          return;
        }
        const videoId = items[0] && items[0].id && items[0].id.videoId;
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
    const defaultFeedback =
      (FEEDBACK_PRESETS[exercise] && FEEDBACK_PRESETS[exercise][0]) ||
      `${exercise} 자세 분석 예시: 코어를 조금 더 조여 주세요.`;
    setFeedback(defaultFeedback);
    appendLog(`${exercise} 세션 준비 완료. 포커스: ${focusLine}`);

    return () => {
      cancelled = true;
    };
  }, [exercise, videoPinned, focusLine]);

  useEffect(() => {
    async function initCamera() {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        setCameraReady(true);
        setCameraError('');
      } catch (err) {
        console.error('Camera error:', err);
        setCameraReady(false);
        setCameraError('웹캠 권한을 확인해 주세요.');
      }
    }
    initCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      setCameraReady(false);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) {
      setTtsSupported(false);
      return;
    }
    synthRef.current = window.speechSynthesis;

    const assignVoice = () => {
      const list = synthRef.current && synthRef.current.getVoices ? synthRef.current.getVoices() : [];
      setVoices(list);
      const pick =
        list.find((v) => v.lang && v.lang.indexOf('ko') === 0 && /male|man|남성|boy/i.test(v.name || '')) ||
        list.find((v) => v.lang && v.lang.indexOf('ko') === 0 && /Wavenet|Standard/i.test(v.name || '')) ||
        list.find((v) => v.lang && v.lang.indexOf('ko') === 0) ||
        list[0];
      if (pick) {
        voiceRef.current = pick;
        setVoiceId(pick.name || pick.voiceURI || '');
        setVoiceLabel(pick.name || '남성 코치');
      }
    };

    assignVoice();
    const voiceListener = () => assignVoice();
    if (window.speechSynthesis && window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', voiceListener);
    }
    if (!voiceRef.current) {
      setTimeout(assignVoice, 300);
      setTimeout(assignVoice, 1200);
    }

    return () => {
      if (synthRef.current && synthRef.current.cancel) synthRef.current.cancel();
      if (window.speechSynthesis && window.speechSynthesis.removeEventListener) {
        window.speechSynthesis.removeEventListener('voiceschanged', voiceListener);
      }
    };
  }, []);

  const speakFeedback = (text) => {
    if (!ttsEnabled || !synthRef.current || !ttsSupported) return;
    const say = (text || '').trim();
    if (!say) return;
    if (synthRef.current.cancel) synthRef.current.cancel();
    const u = new SpeechSynthesisUtterance(say);
    u.lang = 'ko-KR';
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 0.98;
    u.pitch = 0.95;
    synthRef.current.speak(u);
    lastSpokenRef.current = say;
  };

  useEffect(() => {
    if (!ttsEnabled) return;
    if (!feedback || !feedback.trim()) return;
    if (lastSpokenRef.current === feedback.trim()) return;
    speakFeedback(feedback);
  }, [feedback, ttsEnabled]);

  const normalizeEmbedUrl = (val) => {
    const raw = (val || '').trim();
    if (!raw) return '';
    const idMatch = raw.match(/([A-Za-z0-9_-]{11})/);
    if (idMatch) {
      return `https://www.youtube.com/embed/${idMatch[1]}`;
    }
    if (raw.startsWith('http')) return raw;
    return `https://www.youtube.com/embed/${raw}`;
  };

  const searchAndSetVideo = async (q) => {
    if (!q || !q.trim()) return;
    if (!YOUTUBE_API_KEY) {
      setYoutubeError('YouTube 키가 없어 검색을 실행할 수 없습니다.');
      return;
    }
    const params = new URLSearchParams({
      part: 'snippet',
      q,
      type: 'video',
      maxResults: '1',
      videoEmbeddable: 'true',
      key: YOUTUBE_API_KEY,
    });
    try {
      const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      if (!resp.ok) throw new Error(`YouTube API 실패 (${resp.status})`);
      const data = await resp.json();
      const videoId = data && data.items && data.items[0] && data.items[0].id && data.items[0].id.videoId;
      if (videoId) {
        setYoutubeUrl(`https://www.youtube.com/embed/${videoId}`);
        setVideoPinned(true);
        setYoutubeError('');
        appendLog(`튜토리얼 영상을 "${q}" 검색 결과로 변경했습니다.`);
      } else {
        setYoutubeError('검색 결과가 없어 기본 영상을 유지합니다.');
      }
    } catch (err) {
      console.error('YouTube search error:', err);
      setYoutubeError('영상 검색 중 오류가 발생했습니다.');
    }
  };

  const applyVideoInput = async () => {
    const raw = videoInput.trim();
    if (!raw) return;
    const isUrl = /^https?:\/\//i.test(raw);
    const isId = /^[\w-]{11}$/.test(raw);
    const looksLikeSearch = /\s/.test(raw) || (!isUrl && !isId);

    if (raw.startsWith('검색 ') || looksLikeSearch) {
      await searchAndSetVideo(raw.replace(/^검색\s+/, ''));
      return;
    }
    const url = normalizeEmbedUrl(raw);
    setYoutubeUrl(url);
    setVideoPinned(true);
    setYoutubeError('');
    appendLog('튜토리얼 영상을 수동으로 변경했습니다.');
  };

  const resetVideoPin = () => {
    setVideoPinned(false);
    setYoutubeError('');
    setVideoInput('');
    setYoutubeUrl(FALLBACK_YT);
  };

  const handleVideoRequest = async (raw) => {
    const text = (raw || '').trim();
    const direct = text.match(/^영상[:：]\s*(.+)$/i);
    const search = text.match(/^영상\s*검색\s+(.+)/i);

    if (direct) {
      const target = direct[1].trim();
      if (!target) return false;
      const url = normalizeEmbedUrl(target);
      setYoutubeUrl(url);
      setVideoPinned(true);
      setYoutubeError('');
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '튜토리얼 영상을 요청한 링크로 변경했어요.' },
      ]);
      return true;
    }

    if (search) {
      const q = search[1].trim();
      if (!q) return false;
      await searchAndSetVideo(q);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `"${q}" 검색 결과로 영상을 바꿨어요.` },
      ]);
      return true;
    }
    return false;
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text) return;
    if (isChatting) return;

    const userMsg = { role: 'user', content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    const handledVideo = await handleVideoRequest(text);
    if (handledVideo) return;

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
      const replyText =
        data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : '응답을 파싱하지 못했습니다.';
      const botMsg = { role: 'assistant', content: replyText };
      setChatMessages((prev) => [...prev, botMsg]);
      appendLog('LLM 코칭 응답이 도착했습니다.');
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
    <div className="app-shell">
      <div className="glow" />
      <div className="app-page">
        <header className="app-header">
          <div>
            <div className="app-kicker">KSL NOVA · AI Agent</div>
            <h1 className="app-title">운동 자세 AI Agent</h1>
            <p className="app-subtitle">웹캠 기반 실시간 코칭</p>
          </div>
          <div />
        </header>

        <section className="hero-card">
          <div>
            <div className="hero-label-row">
              <span className="label">현재 운동</span>
              <span className="hero-exercise">{exercise}</span>
            </div>
            <div className="hero-focus">{focusLine}</div>
          </div>
          <div className="hero-stats">
            <div className="stat-card">
              <div className="stat-label">가장 최근 코칭</div>
              <div className="stat-value">{truncate(feedback, 38)}</div>
              <div className="stat-meta">{timeLabel()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">채팅 교환</div>
              <div className="stat-value">{chatMessages.length || 0} 회</div>
              <div className="stat-meta">LLM 응답 대기 시 상태 표시</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">오늘의 포커스</div>
              <div className="stat-value">{EXERCISE_FOCUS[exercise]?.[0] || '폼 안정성'}</div>
              <div className="stat-meta">{EXERCISE_FOCUS[exercise]?.[1] || '호흡 유지'}</div>
            </div>
          </div>
        </section>

        <div className="toolbar">
          <div className="toolbar-left">
            <span className="toolbar-note">카메라 허용 시 오른쪽에 실시간 스트림이 표시됩니다.</span>
          </div>
        </div>

        <div className="stage">
          <button
            aria-label={showLeftPanel ? '왼쪽 패널 숨기기' : '왼쪽 패널 보이기'}
            className={`edge-toggle edge-toggle-left ${showLeftPanel ? 'edge-toggle-active' : ''}`}
            onClick={() => setShowLeftPanel((v) => !v)}
          >
            {showLeftPanel ? '◀' : '▶'}
            <span className="edge-label">{showLeftPanel ? '패널 닫기' : '패널 열기'}</span>
          </button>

          <div className="grid-row" style={{ gridTemplateColumns: layoutColumns() }}>
            {showLeftPanel && (
              <div className="panel">
                <div className="panel-header">운동 카테고리</div>
                <div id="exercise_radio" className="pill-group">
                  {EXERCISES.map((ex) => (
                    <label key={ex} className={`pill ${exercise === ex ? 'pill-active' : ''}`}>
                      <input
                        type="radio"
                        name="exercise"
                        value={ex}
                        checked={exercise === ex}
                        onChange={() => setExercise(ex)}
                        className="radio-input"
                      />
                      {ex}
                    </label>
                  ))}
                </div>

                <div className="panel-header" style={{ marginTop: 12 }}>채팅 (LLM)</div>
                <div className="chat-box chat-box-230">
                  {chatMessages.length === 0 ? (
                    <div className="placeholder">질문을 입력하면 코칭이 시작됩니다.</div>
                  ) : null}
                  {chatMessages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`chat-message ${m.role === 'user' ? 'chat-user' : 'chat-assistant'}`}
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
                  className="chat-input"
                />
                <div className="chat-actions">
                  <button
                    className={`primary-button ${isChatting ? 'disabled-button' : ''}`}
                    onClick={handleSend}
                    disabled={isChatting}
                    style={{ flex: 1 }}
                  >
                    {isChatting ? '전송 중…' : '전송'}
                  </button>
                </div>
              </div>
            )}

            <div className="panel center-panel">
              <div className="media-row">
                <div className="media-card">
                  <div className="media-title-row">
                    <span className="section-title">튜토리얼 영상</span>
                    <span className="media-label">
                      {videoPinned ? '수동 영상' : youtubeReady ? '추천 영상' : '기본 영상'}
                    </span>
                  </div>
                  <iframe
                    width="100%"
                    height="320"
                    src={youtubeUrl}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="video-frame"
                  />
                  {youtubeError ? <div className="helper-text">{youtubeError}</div> : null}
                  <div className="video-controls">
                    <input
                      value={videoInput}
                      onChange={(e) => setVideoInput(e.target.value)}
                      placeholder={'영상 ID/링크 또는 "검색 스쿼트 자세"'}
                      className="video-input"
                    />
                    <div className="video-buttons">
                      <button className="secondary-button" onClick={applyVideoInput}>
                        적용
                      </button>
                      <button
                        className="ghost-button"
                        style={{ opacity: videoPinned ? 1 : 0.7 }}
                        onClick={resetVideoPin}
                      >
                        기본 추천
                      </button>
                    </div>
                  </div>
                </div>
                <div className="media-card">
                  <div className="media-title-row">
                    <span className="section-title">웹캠 스트림</span>
                    <span className="media-label">{cameraReady ? 'Live' : '대기'}</span>
                  </div>
                  <video ref={videoRef} autoPlay muted playsInline className="webcam" />
                  {cameraError ? <div className="helper-text">{cameraError}</div> : null}
                </div>
              </div>

              <div className="feedback-section">
                <div className="feedback-header">
                  <div>
                    <h3 className="section-title">자세 피드백</h3>
                    <div className="section-caption">실시간 코칭 문구가 여기에 쌓입니다.</div>
                  </div>
                  <div className="tts-controls">
                    {!ttsSupported ? (
                      <span className="tts-warning">브라우저가 TTS를 지원하지 않습니다.</span>
                    ) : (
                      <>
                        <button
                          className={`tts-button ${ttsEnabled ? 'tts-button-active' : ''}`}
                          onClick={() => setTtsEnabled((v) => !v)}
                        >
                          {ttsEnabled ? 'TTS ON' : 'TTS OFF'}
                        </button>
                        <button
                          className="tts-replay"
                          onClick={() => speakFeedback(feedback)}
                          disabled={!ttsEnabled || !ttsSupported}
                        >
                          다시 듣기
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <textarea value={feedback} readOnly rows={3} className="feedback-box" />
                <div className="feedback-actions">
                  <div className="tag-row">
                    <span className="tag">포커스</span>
                    <span className="tag-value">{focusLine}</span>
                  </div>
                </div>
                <div className="log-list">
                  {coachingLog.slice(0, 4).map((log, idx) => (
                    <div key={`${log.time}-${idx}`} className="log-item">
                      <span className="log-time">{log.time}</span>
                      <span className="log-text">{log.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {showRightPanel && (
              <div className="panel">
                <div className="panel-header">지난 운동 기록</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="table-cell">날짜</th>
                      <th className="table-cell">운동</th>
                      <th className="table-cell">세트/시간</th>
                      <th className="table-cell">요약 피드백</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, idx) => (
                      <tr key={idx}>
                        <td className="table-cell">{h.date}</td>
                        <td className="table-cell">{h.exercise}</td>
                        <td className="table-cell">{h.set}</td>
                        <td className="table-cell">{h.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="panel-header" style={{ marginTop: 16 }}>
                  라이브 코칭 로그
                </div>
                <div className="log-list">
                  {coachingLog.map((log, idx) => (
                    <div key={`${log.time}-${idx}-side`} className="log-item">
                      <span className="log-time">{log.time}</span>
                      <span className="log-text">{log.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            aria-label={showRightPanel ? '오른쪽 패널 숨기기' : '오른쪽 패널 보이기'}
            className={`edge-toggle edge-toggle-right ${showRightPanel ? 'edge-toggle-active' : ''}`}
            onClick={() => setShowRightPanel((v) => !v)}
          >
            {showRightPanel ? '▶' : '◀'}
            <span className="edge-label">{showRightPanel ? '패널 닫기' : '패널 열기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
