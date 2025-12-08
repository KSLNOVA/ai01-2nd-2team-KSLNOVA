const { useEffect, useRef, useState } = React;

// window.ENV는 index.html에서 설정됨
const env = window.ENV || {};
const fallbackEnv = typeof process !== 'undefined' ? process.env : {};

const YOUTUBE_API_KEY =
  env?.YOUTUBE_API_KEY ||
  env?.VITE_YOUTUBE_API_KEY ||
  env?.REACT_APP_YOUTUBE_API_KEY ||
  fallbackEnv?.VITE_YOUTUBE_API_KEY ||
  fallbackEnv?.REACT_APP_YOUTUBE_API_KEY ||
  '';

const OPENAI_API_KEY =
  env?.OPENAI_API_KEY ||
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

const FALLBACK_YT = 'https://www.youtube.com/embed/bm5Zbmr34yw';
const FALLBACK_YT_ALT = 'https://www.youtube-nocookie.com/embed/bm5Zbmr34yw';
const YT_QUERY_MAP = {
  플랭크: '플랭크 운동 자세',
  스쿼트: '스쿼트 운동 자세',
};
const WS_URL =
  (typeof window !== 'undefined' &&
    window.location &&
    window.location.origin &&
    window.location.origin.startsWith('http'))
    ? window.location.origin.replace(/^http/, 'ws') + '/ws/feedback'
    : 'ws://localhost:8000/ws/feedback';

const DEFAULT_HISTORY = [
  { date: '2025-12-04', exercise: '플랭크', set: '3세트', summary: '허리 각도 안정적' },
  { date: '2025-12-03', exercise: '플랭크', set: '2세트', summary: '어깨 살짝 내려주기' },
  { date: '2025-12-02', exercise: '스쿼트', set: '4세트', summary: '무릎 안쪽 모임 주의' },
];

const timeLabel = () =>
  new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date());

function App() {
  const [exercise, setExercise] = useState('플랭크');
  const [youtubeUrl, setYoutubeUrl] = useState(FALLBACK_YT);
  const [history, setHistory] = useState(DEFAULT_HISTORY);
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
  const [coachingLog, setCoachingLog] = useState([]);
  const [processedFrame, setProcessedFrame] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [sessionStart, setSessionStart] = useState(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [ttsHistory, setTtsHistory] = useState([]);
  const [analysisNote, setAnalysisNote] = useState('분석 프레임을 기다리는 중…');

  const videoRef = useRef(null);
  const synthRef = useRef(null);
  const voiceRef = useRef(null);
  const lastSpokenRef = useRef('');
  const ttsEnabledRef = useRef(false);
  const processedFrameRef = useRef('');
  const exerciseRef = useRef('플랭크');
  const repRef = useRef(0);
  const durationRef = useRef(0);
  const lastFrameTsRef = useRef(0);
  const lastSpokenAtRef = useRef(0);
  const videoErrorRef = useRef(0);

  const youtubeReady = Boolean(YOUTUBE_API_KEY);

  const focusLine = (EXERCISE_FOCUS[exercise] || []).join(' · ') || '폼 안정성 유지';
  const historyForExercise = history.filter((item) => item.exercise === exercise);
  const displayHistory = historyForExercise.length ? historyForExercise : history;
  const filteredCoachingLog = coachingLog.filter((log) => log.exercise === exercise);
  const filteredTtsHistory = ttsHistory.filter((log) => log.exercise === exercise);
  const sessionMeta = isRecording
    ? `${repCount} Reps · ${Math.max(sessionDuration, 1)}초`
    : '시작 버튼을 누르세요';

  const layoutColumns = () => {
    if (showLeftPanel && showRightPanel) return '280px 1fr 280px';
    if (showLeftPanel) return '280px 1fr';
    if (showRightPanel) return '1fr 280px';
    return '1fr';
  };

  const [isRecording, setIsRecording] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const youtubeBlockedRef = useRef(false);

  useEffect(() => {
    exerciseRef.current = exercise;
  }, [exercise]);

  useEffect(() => {
    repRef.current = repCount;
  }, [repCount]);

  useEffect(() => {
    durationRef.current = sessionDuration;
  }, [sessionDuration]);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  useEffect(() => {
    processedFrameRef.current = processedFrame;
  }, [processedFrame]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRecording) return;
      const gap = Date.now() - (lastFrameTsRef.current || 0);
      if (gap > 4000 && !processedFrameRef.current) {
        setAnalysisNote('분석 프레임이 도착하지 않았습니다. 서버 실행/WS 연결을 확인하세요.');
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (!sessionStart) {
      setSessionDuration(0);
      return;
    }
    const tick = () => {
      setSessionDuration(Math.max(1, Math.round((Date.now() - sessionStart) / 1000)));
    };
    tick();
    if (!isRecording) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStart, isRecording]);

  // WebSocket 연결 및 프레임 전송
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setWsStatus('connecting');
    let active = true;

    ws.onopen = () => {
      if (!active) return;
      setWsStatus('connected');
      ws.send(`SET_EXERCISE:${exerciseRef.current || exercise}`);
    };

    ws.onmessage = (event) => {
      if (!active) return;
      const data = JSON.parse(event.data);
      if (data.type === 'FEEDBACK') {
        // 실시간 피드백 처리
        if (data.instant_feedback) {
          setFeedback(data.instant_feedback);
        }
        // 코치 피드백 (LLM) 처리
        if (data.coach_feedback) {
          appendLog(data.coach_feedback);
          speakFeedback(data.coach_feedback);
        }
        // 렙 카운트 업데이트
        setRepCount(data.reps);
        setIsRecording(data.is_recording);
        if (data.image) {
          setProcessedFrame(data.image);
          lastFrameTsRef.current = Date.now();
          setAnalysisNote('서버 분석 프레임 수신 중');
        }
      } else if (data.type === 'REPORT') {
        // 최종 리포트 처리
        appendLog(`[종합 리포트] ${data.content}`);
        setFeedback('운동이 종료되었습니다. 리포트를 확인하세요.');
        const now = new Date();
        setHistory((prev) => [
          {
            date: now.toLocaleDateString('ko-KR'),
            exercise: exerciseRef.current,
            set: durationRef.current ? `${durationRef.current}초` : `${repRef.current}회`,
            summary: truncate(data.content, 72),
          },
          ...prev,
        ].slice(0, 20));
        setSessionStart(null);
        setSessionDuration(0);
        durationRef.current = 0;
      }
    };

    ws.onerror = () => {
      if (!active) return;
      setWsStatus('disconnected');
      setAnalysisNote('WebSocket 연결이 끊어졌습니다. 서버 실행/포트를 확인하세요.');
    };

    ws.onclose = () => {
      if (!active) return;
      setWsStatus('disconnected');
      setAnalysisNote('WebSocket 연결이 종료되었습니다. 서버 실행/포트를 확인하세요.');
    };

    return () => {
      active = false;
      ws.close();
    };
  }, []);

  // 프레임 전송 루프
  useEffect(() => {
    if (!cameraReady || !isRecording) return;

    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (canvas.width && canvas.height) {
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          if (!processedFrameRef.current) {
            setProcessedFrame(base64);
            setAnalysisNote('카메라 프레임 표시 중 (분석 대기)…');
          }
          wsRef.current.send(base64);
        }
      }
    }, 100); // 10 FPS

    return () => clearInterval(interval);
  }, [cameraReady, isRecording]);

  const toggleRecording = () => {
    if (!wsRef.current) return;
    if (isRecording) {
      if (sessionStart) {
        setSessionDuration(Math.max(1, Math.round((Date.now() - sessionStart) / 1000)));
      }
      wsRef.current.send('STOP_RECORDING');
      setIsRecording(false);
      setAnalysisNote('분석 프레임을 기다리는 중…');
    } else {
      wsRef.current.send('START_RECORDING');
      setIsRecording(true);
      setRepCount(0);
      repRef.current = 0;
      setCoachingLog([]); // 로그 초기화
      setProcessedFrame('');
      setAnalysisNote('카메라 프레임을 불러오는 중…');
      const startedAt = Date.now();
      setSessionStart(startedAt);
      durationRef.current = 0;
      setSessionDuration(0);
      setFeedback('운동을 시작합니다! 자세를 잡아주세요.');
    }
  };

  const appendLog = (text) =>
    setCoachingLog((prev) => [
      { time: timeLabel(), exercise: exerciseRef.current, text },
      ...prev,
    ].slice(0, 8));

  const truncate = (text, max = 64) => {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(`SET_EXERCISE:${exercise}`);
      wsRef.current.send('STOP_RECORDING');
    }
    setIsRecording(false);
    setSessionStart(null);
    setSessionDuration(0);
    durationRef.current = 0;
    repRef.current = 0;
    setRepCount(0);
    setProcessedFrame('');
    setAnalysisNote('분석 프레임을 기다리는 중…');
    setTtsHistory([]);
    setCoachingLog([]);
    const defaultFeedback = '웹캠을 켜면 자세 피드백이 여기에 표시됩니다.';
    setFeedback(defaultFeedback);
    appendLog(`${exercise} 세션 준비 완료. 포커스: ${focusLine}`);
  }, [exercise, focusLine]);

  useEffect(() => {
    let cancelled = false;

    async function fetchYoutube() {
      // 기본 영상 먼저 깔아두기 (API 실패 시 바로 표시)
      setYoutubeUrl(videoErrorRef.current > 0 ? FALLBACK_YT_ALT : FALLBACK_YT);
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
      if (youtubeBlockedRef.current) {
        setYoutubeUrl(FALLBACK_YT);
        setYoutubeError('YouTube API가 차단되어 기본 영상을 사용합니다. 링크/ID를 직접 입력해 주세요.');
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
        youtubeBlockedRef.current = true;
        setYoutubeUrl(FALLBACK_YT);
        setYoutubeError('YouTube API 호출이 차단되었습니다. 링크/ID를 직접 입력해 주세요.');
      }
    }

    fetchYoutube();

    return () => {
      cancelled = true;
    };
  }, [exercise, videoPinned]);

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
      const pick =
        list.find((v) => v.lang && v.lang.indexOf('ko') === 0 && /male|man|남성|boy/i.test(v.name || '')) ||
        list.find((v) => v.lang && v.lang.indexOf('ko') === 0 && /Wavenet|Standard/i.test(v.name || '')) ||
        list.find((v) => v.lang && v.lang.indexOf('ko') === 0) ||
        list[0];
      if (pick) {
        voiceRef.current = pick;
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
    if (!ttsEnabledRef.current || !synthRef.current || !ttsSupported) return;
    const say = (text || '').trim();
    if (!say) return;
    if (lastSpokenRef.current === say) return;
    const now = Date.now();
    const speaking = synthRef.current.speaking;
    const cooldown = now - (lastSpokenAtRef.current || 0);
    if (speaking || cooldown < 4000) return;
    const u = new SpeechSynthesisUtterance(say);
    u.lang = 'ko-KR';
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 0.98;
    u.pitch = 0.95;
    synthRef.current.speak(u);
    lastSpokenRef.current = say;
    lastSpokenAtRef.current = now;
    setTtsHistory((prev) => [{ time: timeLabel(), exercise: exerciseRef.current, text: say }, ...prev].slice(0, 6));
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
    if (youtubeBlockedRef.current) {
      setYoutubeError('YouTube API가 차단되어 검색을 건너뜁니다. 영상 ID/링크를 직접 입력하세요.');
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
      youtubeBlockedRef.current = true;
      setYoutubeUrl(FALLBACK_YT);
      setYoutubeError('YouTube API 호출이 차단되었습니다. 영상 ID/링크를 직접 입력하세요.');
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

  const handleVideoError = () => {
    videoErrorRef.current += 1;
    setVideoPinned(false);
    const next = videoErrorRef.current > 1 ? FALLBACK_YT_ALT : FALLBACK_YT;
    setYoutubeUrl(next);
    setYoutubeError('영상 재생에 실패해 기본 영상으로 전환했습니다. 필요하면 다른 영상 ID/링크를 입력하세요.');
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
              <div className="stat-label">실시간 상태</div>
              <div className="stat-value">{isRecording ? '운동 중' : '대기 중'}</div>
              <div className="stat-meta">{sessionMeta}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">현재 카운트</div>
              <div className="stat-value">{repCount} 회</div>
              <div className="stat-meta">{sessionDuration ? `${sessionDuration}초 진행` : '운동 준비'}</div>
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
            <span className="micro-pill muted">{videoPinned ? '튜토리얼: 수동' : '튜토리얼: 자동 추천'}</span>
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
                    onError={handleVideoError}
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
                <div className="media-card analysis-card">
                  <div className="media-title-row">
                    <span className="section-title">라이브 + 분석 뷰</span>
                    <div className="media-labels">
                      <span className="media-label">{cameraReady ? 'Live' : '대기'}</span>
                      <span className={`media-label ${wsStatus === 'connected' ? 'media-label-live' : ''}`}>
                        {wsStatus === 'connected' ? 'WS 연결' : 'WS 대기'}
                      </span>
                    </div>
                  </div>
                  <div className="single-video">
                    <div className="video-frame-shell analysis-shell">
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`webcam ${processedFrame ? 'webcam-hidden' : ''}`}
                      />
                      {processedFrame ? (
                        <img src={processedFrame} alt="분석 결과 프레임" className="analysis-frame" />
                      ) : null}
                      <canvas ref={canvasRef} style={{ display: 'none' }} />
                      {isRecording && (
                        <div className="recording-indicator">
                          <span className="rec-dot">●</span> REC
                        </div>
                      )}
                    </div>
                    <div className="analysis-note">{processedFrame ? '분석 프레임 표시 중' : analysisNote}</div>
                  </div>
                  {cameraError ? <div className="helper-text">{cameraError}</div> : null}
                  <div className="camera-controls">
                    <button
                      className={`primary-button ${isRecording ? 'stop-btn' : 'start-btn'}`}
                      onClick={toggleRecording}
                      style={{ flex: 1, backgroundColor: isRecording ? '#ff4444' : '#4CAF50' }}
                    >
                      {isRecording ? '운동 종료 (리포트 생성)' : '운동 시작'}
                    </button>
                    <div className="micro-meter">
                      <span className="micro-pill">{repCount} Reps</span>
                      <span className="micro-pill">{sessionDuration ? `${sessionDuration}초` : '대기'}</span>
                    </div>
                  </div>
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
                  <span className="tag">최근 TTS 코칭</span>
                  <span className="tag-value">{ttsHistory.length ? `${ttsHistory.length}개 기록` : '아직 없음'}</span>
                </div>
                <div className="tts-history">
                  {filteredTtsHistory.length === 0 ? (
                    <div className="placeholder">TTS가 재생되면 여기에서 최근 코칭 문구를 확인할 수 있어요.</div>
                  ) : (
                    filteredTtsHistory.map((item, idx) => (
                      <div key={`${item.time}-${idx}`} className="tts-history-item">
                        <span className="tts-history-time">{item.time}</span>
                        <span className="tts-history-text">{item.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
                <div className="log-list">
                  {filteredCoachingLog.slice(0, 4).length === 0 ? (
                    <div className="placeholder">운동을 시작하면 코칭 로그가 여기에 표시됩니다.</div>
                  ) : (
                    filteredCoachingLog.slice(0, 4).map((log, idx) => (
                      <div key={`${log.time}-${idx}`} className="log-item">
                        <span className="log-time">{log.time}</span>
                        <span className="log-text">{log.text}</span>
                      </div>
                    ))
                  )}
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
                    {displayHistory.length === 0 ? (
                      <tr>
                        <td className="table-cell" colSpan={4}>
                          운동 기록이 곧 여기에 채워집니다.
                        </td>
                      </tr>
                    ) : (
                      displayHistory.map((h, idx) => (
                        <tr key={idx}>
                          <td className="table-cell">{h.date}</td>
                          <td className="table-cell">{h.exercise}</td>
                          <td className="table-cell">{h.set}</td>
                          <td className="table-cell">{truncate(h.summary, 70)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <div className="panel-header" style={{ marginTop: 16 }}>
                  라이브 코칭 로그
                </div>
                <div className="log-list">
                  {filteredCoachingLog.map((log, idx) => (
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
