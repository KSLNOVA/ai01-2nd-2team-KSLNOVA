const { useEffect, useRef, useState } = React;

// window.ENV는 index.html에서 설정됨
const env = window.ENV || {};
const fallbackEnv = typeof process !== 'undefined' ? process.env : {};
const pickEnv = (...candidates) => {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
};

const YOUTUBE_API_KEY = pickEnv(
  env?.YOUTUBE_API_KEY,
  env?.VITE_YOUTUBE_API_KEY,
  env?.REACT_APP_YOUTUBE_API_KEY,
  fallbackEnv?.VITE_YOUTUBE_API_KEY,
  fallbackEnv?.REACT_APP_YOUTUBE_API_KEY
);

const OPENAI_API_KEY = pickEnv(
  env?.OPENAI_API_KEY,
  env?.VITE_OPENAI_API_KEY,
  env?.REACT_APP_OPENAI_API_KEY,
  fallbackEnv?.VITE_OPENAI_API_KEY,
  fallbackEnv?.REACT_APP_OPENAI_API_KEY
);

const IMAGE_ANALYZE_ENDPOINT =
  pickEnv(
    env?.IMAGE_ANALYZE_ENDPOINT,
    env?.VITE_IMAGE_ANALYZE_ENDPOINT,
    env?.REACT_APP_IMAGE_ANALYZE_ENDPOINT,
    fallbackEnv?.VITE_IMAGE_ANALYZE_ENDPOINT,
    fallbackEnv?.REACT_APP_IMAGE_ANALYZE_ENDPOINT
  ) || 'http://localhost:8003/analyze-image';

const EXERCISES = ['스쿼트', '숄더프레스'];
const EXERCISE_FOCUS = {
  스쿼트: ['무릎 트래킹', '엉덩이 힌지'],
  숄더프레스: ['어깨 안정성', '팔꿈치-손목 정렬'],
};
const EXERCISE_SLUG = {
  스쿼트: 'squat',
  숄더프레스: 'shoulder_press',
};
const EXERCISE_SKELETON = {
  스쿼트: {
    points: [11, 12, 23, 24, 25, 26, 27, 28],
    connections: [
      [11, 12],
      [11, 23],
      [12, 24],
      [23, 24],
      [23, 25],
      [24, 26],
      [25, 27],
      [26, 28],
    ],
  },
  숄더프레스: {
    // 상체/팔 중심
    points: [11, 12, 13, 14, 15, 16],
    connections: [
      [11, 12],
      [11, 13],
      [13, 15],
      [12, 14],
      [14, 16],
    ],
  },
};

const FALLBACK_YT = {
  스쿼트: 'https://www.youtube-nocookie.com/embed/urOSaROmTIk',
  숄더프레스: 'https://www.youtube-nocookie.com/embed/o3B-KMsXcAQ',
};
const FALLBACK_YT_ALT = {
  스쿼트: 'https://www.youtube-nocookie.com/embed/urOSaROmTIk',
  숄더프레스: 'https://www.youtube-nocookie.com/embed/o3B-KMsXcAQ',
};
const YT_QUERY_MAP = {
  스쿼트: '스쿼트 운동 자세',
  숄더프레스: '숄더프레스 운동 자세',
};
const WS_URL =
  (typeof window !== 'undefined' && window.WS_URL)
    ? window.WS_URL
    : (typeof window !== 'undefined' &&
      window.location &&
      window.location.origin &&
      window.location.origin.startsWith('http'))
      ? window.location.origin.replace(/^http/, 'ws') + '/ws/feedback'
      : 'ws://localhost:8000/ws/feedback';

const DEFAULT_HISTORY = [
  { date: '2025-12-02', exercise: '스쿼트', set: '4세트', summary: '무릎 안쪽 모임 주의' },
];

const timeLabel = () =>
  new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date());

const formatClock = (sec = 0) => {
  const total = Math.max(0, Math.floor(sec || 0));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
};

function App() {
  const [exercise, setExercise] = useState('스쿼트');
  const [youtubeUrl, setYoutubeUrl] = useState(FALLBACK_YT['스쿼트']);
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
  const [analysisNote, setAnalysisNote] = useState('로컬 분석 중…');
  const [feedbackExercise, setFeedbackExercise] = useState('');
  // 팀원 image_feedback 기능을 사이드바에 표시하기 위한 상태
  const [imgRepCount, setImgRepCount] = useState(0);
  const [imgKneeAngle, setImgKneeAngle] = useState(0);
  const [imgPoseState, setImgPoseState] = useState('🧍');
  const [imgCaptured, setImgCaptured] = useState('');
  const [imgFeedback, setImgFeedback] = useState('최하단에서 이미지를 캡처해 AI가 분석합니다.');
  const [imgStatus, setImgStatus] = useState('대기 중');
  const imgRepRef = useRef(0);

  // 운동 기록 저장 (날짜, 운동명, 횟수, 시간, 영상)
  const [exerciseHistory, setExerciseHistory] = useState([]);
  // 비디오 팝업 모달 상태
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoModalUrl, setVideoModalUrl] = useState('');
  // 리포트 팝업 모달 상태
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportModalContent, setReportModalContent] = useState('');
  // 녹화 관련
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  // 피드백 수집 배열
  const feedbackHistoryRef = useRef([]);

  const videoRef = useRef(null);
  const startCameraRef = useRef(null);
  const poseCanvasRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const synthRef = useRef(null);
  const voiceRef = useRef(null);
  const lastSpokenRef = useRef('');
  const ttsEnabledRef = useRef(false);
  const processedFrameRef = useRef('');
  const exerciseRef = useRef('스쿼트');
  const repRef = useRef(0);
  const durationRef = useRef(0);
  const isRecordingRef = useRef(false);
  const lastFrameTsRef = useRef(0);
  const lastSpokenAtRef = useRef(0);
  const videoErrorRef = useRef(0);
  const poseLandmarkerRef = useRef(null);
  const frameIndexRef = useRef(0);
  const smoothedLmRef = useRef(null);
  const poseLoopStopRef = useRef(false);
  const imgProcessingRef = useRef(false);

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
    if (showLeftPanel && showRightPanel) return '280px 1fr 380px';
    if (showLeftPanel) return '280px 1fr';
    if (showRightPanel) return '1fr 280px';
    return '1fr';
  };

  const [isRecording, setIsRecording] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const wsRef = useRef(null); // 더 이상 사용하지 않지만 기존 구조 유지
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
    // 앱 시작 시 DB에서 운동 기록 불러오기
    const fetchExerciseHistory = async () => {
      try {
        const res = await fetch('http://localhost:8003/get-logs?limit=50');
        const data = await res.json();
        if (data.logs && Array.isArray(data.logs)) {
          const records = data.logs.map((log) => ({
            id: log.id,
            date: log.date,
            exercise: log.exercise_type,
            repCount: log.reps,
            duration: formatClock(log.duration),
            durationSec: log.duration,
            videoUrl: log.video_path ? (() => {
              // video_path 예: "backend/exercise_data/20251211_123456_squat/exercise.webm"
              const parts = log.video_path.replace(/\\/g, '/').split('/');
              const filename = parts.pop(); // exercise.webm
              const sessionFolder = parts.pop(); // 20251211_123456_squat
              return `http://localhost:8003/video/${sessionFolder}/${filename}`;
            })() : '',
            summary: '저장된 기록',
            summaryReport: log.summary_report || '',
          }));
          setExerciseHistory(records);
        }
      } catch (err) {
        console.error('운동 기록 불러오기 실패:', err);
      }
    };
    fetchExerciseHistory();
  }, []);

  useEffect(() => {
    isRecordingRef.current = isRecording;
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
  // WS 비활성화: 기존 루프 제거

  const toggleRecording = () => {
    if (isRecording) {
      // 녹화 종료 및 저장
      const finalDuration = sessionStart
        ? Math.max(1, Math.round((Date.now() - sessionStart) / 1000))
        : sessionDuration;
      setSessionDuration(finalDuration);

      // MediaRecorder 종료
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      // 녹화된 비디오 Blob 생성 및 운동 기록 저장
      const saveExerciseRecord = async () => {
        let videoUrl = '';
        let videoBase64 = '';
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          videoUrl = URL.createObjectURL(blob);

          // 비디오를 Base64로 변환 (백엔드 저장용)
          try {
            const reader = new FileReader();
            videoBase64 = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          } catch (err) {
            console.error('비디오 변환 오류:', err);
          }
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = formatClock(finalDuration);

        const newRecord = {
          id: Date.now(),
          date: dateStr,
          exercise: exerciseRef.current,
          repCount: repRef.current,
          duration: timeStr,
          durationSec: finalDuration,
          videoUrl: videoUrl,
          summary: imgFeedback || '운동 완료',
          summaryReport: '', // 백엔드에서 받을 예정
        };

        // 수집된 피드백 배열
        const collectedFeedbacks = feedbackHistoryRef.current.length > 0
          ? feedbackHistoryRef.current
          : [imgFeedback || '운동 완료'];

        // 백엔드 DB에 저장 및 종합 리포트 생성
        try {
          const res = await fetch('http://localhost:8003/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              exercise: exerciseRef.current,
              reps: repRef.current,
              duration: finalDuration,
              date: dateStr,
              video: videoBase64,
              feedbacks: collectedFeedbacks,
            }),
          });
          const data = await res.json();
          if (data.summary_report) {
            newRecord.summaryReport = data.summary_report;
          }
          console.log('✅ 운동 기록이 DB에 저장되었습니다.');
        } catch (err) {
          console.error('DB 저장 오류:', err);
        }

        setExerciseHistory((prev) => [newRecord, ...prev]);
        recordedChunksRef.current = [];
        feedbackHistoryRef.current = []; // 피드백 수집 초기화
      };

      // MediaRecorder가 중지 후 데이터를 저장하도록 약간 지연
      setTimeout(saveExerciseRecord, 300);

      setIsRecording(false);
      isRecordingRef.current = false;
      imgProcessingRef.current = false;
      imgRepRef.current = 0;
      setImgRepCount(0);
      setImgStatus('대기 중');
      setImgCaptured('');
      // 웹캠 종료
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
        setCameraReady(false);
      }
      setAnalysisNote('로컬 분석 중지');
    } else {
      // 웹캠 다시 시작
      if (startCameraRef.current) {
        startCameraRef.current();
      }
      setIsRecording(true);
      isRecordingRef.current = true;
      setRepCount(0);
      repRef.current = 0;
      setCoachingLog([]); // 로그 초기화
      setProcessedFrame('');
      setAnalysisNote('로컬 분석 준비 중…');
      const startedAt = Date.now();
      setSessionStart(startedAt);
      durationRef.current = 0;
      setSessionDuration(0);
      setFeedback('운동을 시작합니다! 자세를 잡아주세요.');
      setFeedbackExercise(exerciseRef.current);
      recordedChunksRef.current = [];
      feedbackHistoryRef.current = []; // 피드백 수집 초기화

      // 웹캠 스트림이 준비되면 녹화 시작
      setTimeout(() => {
        if (videoRef.current && videoRef.current.srcObject) {
          try {
            const stream = videoRef.current.srcObject;
            const options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options.mimeType = 'video/webm';
            }
            const recorder = new MediaRecorder(stream, options);
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                recordedChunksRef.current.push(e.data);
              }
            };
            recorder.start(1000); // 1초마다 데이터 수집
            mediaRecorderRef.current = recorder;
          } catch (err) {
            console.error('녹화 시작 오류:', err);
          }
        }
      }, 500);
    }
  };

  // 비디오 팝업 열기
  const openVideoModal = (url) => {
    setVideoModalUrl(url);
    setVideoModalOpen(true);
  };

  // 비디오 팝업 닫기
  const closeVideoModal = () => {
    setVideoModalOpen(false);
    setVideoModalUrl('');
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
    setIsRecording(false);
    setSessionStart(null);
    setSessionDuration(0);
    durationRef.current = 0;
    repRef.current = 0;
    setRepCount(0);
    setProcessedFrame('');
    setAnalysisNote('로컬 분석 중…');
    setTtsHistory([]);
    setFeedbackExercise(exerciseRef.current);
    setCoachingLog([]);
    const defaultFeedback = '웹캠을 켜면 자세 피드백이 여기에 표시됩니다.';
    setFeedback(defaultFeedback);
    appendLog(`${exercise} 세션 준비 완료. 포커스: ${focusLine}`);
  }, [exercise, focusLine]);

  useEffect(() => {
    let cancelled = false;

    async function fetchYoutube() {
      // 기본 영상 먼저 깔아두기 (API 실패 시 바로 표시)
      const fb = videoErrorRef.current > 0 ? FALLBACK_YT_ALT[exercise] : FALLBACK_YT[exercise];
      setYoutubeUrl(fb);
      if (videoPinned) {
        setYoutubeError('수동으로 고정된 영상입니다. 기본 추천을 보려면 해제하세요.');
        return;
      }
      setYoutubeError('');

      if (!YOUTUBE_API_KEY) {
        setYoutubeUrl(FALLBACK_YT[exercise]);
        setYoutubeError('.env에 YOUTUBE_API_KEY가 없어 기본 영상을 사용합니다.');
        return;
      }
      if (youtubeBlockedRef.current) {
        setYoutubeUrl(FALLBACK_YT[exercise]);
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
          setYoutubeUrl(FALLBACK_YT[exercise]);
          setYoutubeError('검색 결과가 없어 기본 영상을 사용합니다.');
          return;
        }
        const videoId = items[0] && items[0].id && items[0].id.videoId;
        if (!videoId) {
          setYoutubeUrl(FALLBACK_YT[exercise]);
          setYoutubeError('videoId가 없어 기본 영상을 사용합니다.');
          return;
        }
        if (!cancelled) setYoutubeUrl(`https://www.youtube.com/embed/${videoId}`);
      } catch (err) {
        console.error('YouTube API error:', err);
        youtubeBlockedRef.current = true;
        setYoutubeUrl(FALLBACK_YT[exercise]);
        setYoutubeError('YouTube API 호출이 차단되었습니다. 링크/ID를 직접 입력해 주세요.');
      }
    }

    fetchYoutube();

    return () => {
      cancelled = true;
    };
  }, [exercise, videoPinned]);

  useEffect(() => {
    const startCamera = async () => {
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
    };
    startCameraRef.current = startCamera;
    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
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

  // 팀원 image_feedback 로직을 기존 웹캠 스트림으로 계산하여 값만 사이드바에 표시
  useEffect(() => {
    if (!cameraReady || !videoRef.current) return;
    let cancelled = false;
    poseLoopStopRef.current = false;

    const SMOOTHING_FACTOR = 0.7;
    const STANDING_THRESHOLD = 160;
    const SQUAT_THRESHOLD = 110;
    const VISIBILITY_THRESHOLD = 0.7;
    let cycleState = 'STANDING';
    let minKneeAngle = 180;
    let capturedImage = null;

    const smoothLandmarks = (current) => {
      if (!smoothedLmRef.current) {
        smoothedLmRef.current = current.map((lm) => ({ ...lm }));
        return smoothedLmRef.current;
      }
      for (let i = 0; i < current.length; i++) {
        smoothedLmRef.current[i].x =
          smoothedLmRef.current[i].x * (1 - SMOOTHING_FACTOR) + current[i].x * SMOOTHING_FACTOR;
        smoothedLmRef.current[i].y =
          smoothedLmRef.current[i].y * (1 - SMOOTHING_FACTOR) + current[i].y * SMOOTHING_FACTOR;
        smoothedLmRef.current[i].z =
          smoothedLmRef.current[i].z * (1 - SMOOTHING_FACTOR) + current[i].z * SMOOTHING_FACTOR;
      }
      return smoothedLmRef.current;
    };

    const checkFullBodyVisibility = (landmarks) => {
      // 숄더프레스는 상체(허리 위)만 보여도 OK, 단 팔은 보여야 함
      if (exerciseRef.current === '숄더프레스') {
        // 어깨(11,12), 팔꿈치(13,14), 손목(15,16)
        const upperBodyPoints = [11, 12, 13, 14, 15, 16];
        for (const idx of upperBodyPoints) {
          const lm = landmarks[idx];
          if (!lm) return false;
          // 화면 안에 있는지
          if (lm.x < 0 || lm.x > 1 || lm.y < 0 || lm.y > 1) return false;
          // 신뢰도 체크
          if (lm.visibility !== undefined && lm.visibility < VISIBILITY_THRESHOLD) return false;
        }
        return true;
      }

      // 스쿼트는 전신(특히 발)까지 보여야 함
      const lowerBodyPoints = [23, 24, 25, 26, 27, 28];
      for (const idx of lowerBodyPoints) {
        const lm = landmarks[idx];
        if (!lm) return false;
        if (lm.y > 1.0 || lm.y < 0) return false;
        if (lm.visibility !== undefined && lm.visibility < VISIBILITY_THRESHOLD) return false;
      }
      return true;
    };

    const calculateAngle = (a, b, c) => {
      const AB = [a.x - b.x, a.y - b.y];
      const CB = [c.x - b.x, c.y - b.y];
      const dot = AB[0] * CB[0] + AB[1] * CB[1];
      const magnitude = Math.hypot(...AB) * Math.hypot(...CB);
      if (magnitude === 0) return 180;
      return Math.acos(Math.max(-1, Math.min(1, dot / magnitude))) * (180 / Math.PI);
    };

    const captureCanvas = () => {
      const canvas = hiddenCanvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/jpeg', 0.8);
    };

    const sendImageForAnalysis = async (imageData, count) => {
      const endpoint = IMAGE_ANALYZE_ENDPOINT;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: imageData,
            rep_count: count,
            exercise_type: EXERCISE_SLUG[exerciseRef.current] || 'squat',
            hold_time: 0,
          }),
        });
        const data = await res.json();
        return data.feedback;
      } catch (err) {
        console.error('이미지 분석 호출 오류', err);
        return null;
      }
    };

    const onCycleComplete = async () => {
      if (imgProcessingRef.current || !capturedImage) return;
      imgProcessingRef.current = true;
      imgRepRef.current += 1;
      const nextRep = imgRepRef.current;
      setImgRepCount(nextRep);
      setRepCount(nextRep); // 상단 바 카운트도 동기화
      setImgStatus('📸 이미지 분석 중...');
      const feedbackText = await sendImageForAnalysis(capturedImage, nextRep);
      const safeFeedback = feedbackText || '분석 중 오류가 발생했습니다.';
      setImgFeedback(safeFeedback);
      setFeedback(safeFeedback); // 중앙 피드백도 동일하게 표시
      // 피드백 수집 배열에 추가
      if (isRecordingRef.current && safeFeedback) {
        feedbackHistoryRef.current.push(safeFeedback);
      }
      setImgStatus(`✅ ${nextRep}회 완료`);
      speakFeedback(safeFeedback, exerciseRef.current);
      capturedImage = null;
      minKneeAngle = 180;
      imgProcessingRef.current = false;
    };

    const startLoop = async () => {
      try {
        if (!poseLandmarkerRef.current) {
          const vision = window.TasksVision;
          if (!vision) {
            setImgStatus('모델 로드 실패 (TasksVision 없음)');
            return;
          }
          const fileset = await vision.FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
          );
          poseLandmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        }
        setImgStatus('✅ 준비 완료! 스쿼트를 시작하세요');
      } catch (err) {
        console.error('Pose 모델 로드 오류', err);
        setImgStatus('모델 로딩 실패');
        return;
      }

      hiddenCanvasRef.current = hiddenCanvasRef.current || document.createElement('canvas');
      const hCanvas = hiddenCanvasRef.current;
      const hCtx = hCanvas.getContext('2d');
      const poseCanvas = poseCanvasRef.current;
      const poseCtx = poseCanvas ? poseCanvas.getContext('2d') : null;

      const loop = () => {
        if (poseLoopStopRef.current || cancelled) return;
        const videoEl = videoRef.current;
        if (!videoEl || videoEl.readyState < 2) {
          requestAnimationFrame(loop);
          return;
        }
        const vw = videoEl.videoWidth || 640;
        const vh = videoEl.videoHeight || 480;
        if (hCanvas.width !== vw || hCanvas.height !== vh) {
          hCanvas.width = vw;
          hCanvas.height = vh;
        }
        if (poseCanvas && (poseCanvas.width !== vw || poseCanvas.height !== vh)) {
          poseCanvas.width = vw;
          poseCanvas.height = vh;
        }
        hCtx.drawImage(videoEl, 0, 0, vw, vh);
        if (poseCtx) {
          poseCtx.clearRect(0, 0, vw, vh);
        }

        if (poseLandmarkerRef.current) {
          const results = poseLandmarkerRef.current.detectForVideo(videoEl, performance.now());
          if (results.landmarks && results.landmarks[0]) {
            const lm = smoothLandmarks(results.landmarks[0]);
            const fullBodyOk = checkFullBodyVisibility(lm);
            if (!fullBodyOk) {
              setImgStatus('⚠️ 전신이 보이도록 위치해주세요');
              requestAnimationFrame(loop);
              return;
            }
            const hip = lm[23].z < lm[24].z ? lm[23] : lm[24];
            const knee = lm[25].z < lm[26].z ? lm[25] : lm[26];
            const ankle = lm[27].z < lm[28].z ? lm[27] : lm[28];
            const kneeAngle = calculateAngle(hip, knee, ankle);
            if (exerciseRef.current === '숄더프레스') {
              setImgKneeAngle('—');
            } else {
              setImgKneeAngle(kneeAngle.toFixed(1));
            }

            // 스켈레톤 오버레이 (운동별)
            if (poseCtx) {
              const skeleton = EXERCISE_SKELETON[exerciseRef.current] || EXERCISE_SKELETON['스쿼트'];
              const points = skeleton.points || [];
              const lineColor = '#ffcc00'; // 눈에 띄는 노란색 라인
              const pointColor = '#ff4444'; // 눈에 띄는 빨간색 포인트
              poseCtx.strokeStyle = lineColor;
              poseCtx.lineWidth = 3;
              poseCtx.fillStyle = pointColor;
              const connections = skeleton.connections || [];
              const drawSkeleton = (ctx) => {
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = 3;
                ctx.fillStyle = pointColor;
                connections.forEach(([a, b]) => {
                  if (lm[a] && lm[b]) {
                    ctx.beginPath();
                    ctx.moveTo(lm[a].x * vw, lm[a].y * vh);
                    ctx.lineTo(lm[b].x * vw, lm[b].y * vh);
                    ctx.stroke();
                  }
                });
                points.forEach((idx) => {
                  if (lm[idx]) {
                    ctx.beginPath();
                    ctx.arc(lm[idx].x * vw, lm[idx].y * vh, 5, 0, Math.PI * 2);
                    ctx.fill();
                  }
                });
              };
              drawSkeleton(poseCtx);
              if (hCtx) {
                drawSkeleton(hCtx); // 캡처 이미지에도 스켈레톤 포함
              }
            }

            if (exerciseRef.current === '숄더프레스') {
              // 숄더프레스 전용 로직 (팔꿈치 각도 기반)
              // 12(우어깨)-14(우팔꿈치)-16(우손목), 11(좌어깨)-13(좌팔꿈치)-15(좌손목)
              // 여기선 오른쪽(12-14-16) 예시, 혹은 둘 중 잘 보이는 쪽 사용
              // 편의상 오른쪽 기준 or 평균
              const rightElbowAngle = calculateAngle(lm[12], lm[14], lm[16]);
              const leftElbowAngle = calculateAngle(lm[11], lm[13], lm[15]);
              const avgElbowAngle = (rightElbowAngle + leftElbowAngle) / 2;

              setImgKneeAngle(`${avgElbowAngle.toFixed(0)}`); // UI에 팔꿈치 각도 표시

              // State Machine for Shoulder Press
              // DOWN (Start): 팔꿈치 < 100도
              // UP (End): 팔꿈치 > 150도

              if (cycleState === 'STANDING') { // 초기 상태 (준비)
                setImgPoseState('READY');
                if (avgElbowAngle < 100) {
                  cycleState = 'DOWN';
                  setImgStatus('⬆️ 위로 미세요');
                  setImgPoseState('💪');
                }
              } else if (cycleState === 'DOWN') {
                if (avgElbowAngle > 150) {
                  cycleState = 'UP';
                  setImgStatus('⬇️ 다시 내리세요');
                  setImgPoseState('🙌');

                  // 최상단 도달 시점이니 여기서 캡처할 수도 있고, 
                  // 혹은 가장 수축된 순간이니 이때 분석? 
                  // 보통 숄더프레스는 "내렸을 때"가 아니라 "밀어 올린 후 버틸 때" or "내려서 준비자세"가 중요.
                  // 요구사항: "숄더프레스 동작을 해야 카운터가 올라가도록" -> UP 상태 찍고 다시 DOWN 오면 1회?
                }
              } else if (cycleState === 'UP') {
                // 다시 내려오면 1회 인정
                if (avgElbowAngle < 110) {
                  cycleState = 'DOWN';
                  setImgStatus('✅ 1회 완료');
                  setImgPoseState('💪');
                  onCycleComplete(); // 카운트 증가 + 이미지 분석(필요시)

                  // 캡처는 "가장 힘든 구간" or "자세가 무너질 구간".
                  // 숄더프레스는 팔이 벌어지거나 허리가 꺾이는 게 문제.
                  // DOWN 상태(시작점)이나 UP 상태(끝점) 중 하나 캡처.
                  // 여기선 onCycleComplete 내부 로직 따라감 (현재 capturedImage가 없으면 분석 안 함)
                  // 필요하면 UP 상태에서 capturedImage = captureCanvas() 수행
                }
              }

              // 숄더프레스용 캡처 로직 (예: UP 상태에서 캡처)
              if (cycleState === 'UP' && !capturedImage) {
                // 팔 다 폈을 때 자세 캡처
                capturedImage = captureCanvas();
                setImgCaptured(capturedImage);
              }

            } else {
              // 스쿼트 로직 (기존 유지)
              if (cycleState === 'STANDING') {
                setImgPoseState('🧍');
                if (kneeAngle < STANDING_THRESHOLD - 10) {
                  cycleState = 'SQUATTING';
                  minKneeAngle = kneeAngle;
                  setImgStatus('⬇️ 하강 중...');
                  setImgPoseState('⬇️');
                }
              } else if (cycleState === 'SQUATTING') {
                if (kneeAngle < minKneeAngle) {
                  minKneeAngle = kneeAngle;
                  if (kneeAngle < SQUAT_THRESHOLD) {
                    capturedImage = captureCanvas();
                    setImgCaptured(capturedImage);
                    setImgStatus('📸 최하단 캡처!');
                  }
                }
                if (kneeAngle > minKneeAngle + 20 && minKneeAngle < SQUAT_THRESHOLD) {
                  cycleState = 'RISING';
                  setImgStatus('⬆️ 상승 중...');
                  setImgPoseState('⬆️');
                }
                if (kneeAngle > STANDING_THRESHOLD) {
                  cycleState = 'STANDING';
                  minKneeAngle = 180;
                  capturedImage = null;
                  setImgStatus('❌ 더 깊이 앉으세요');
                  setImgPoseState('🧍');
                }
              } else if (cycleState === 'RISING') {
                if (kneeAngle > STANDING_THRESHOLD) {
                  cycleState = 'STANDING';
                  setImgPoseState('🧍');
                  onCycleComplete();
                }
              }
            }
          }
        }
        requestAnimationFrame(loop);
      };

      loop();
    };

    startLoop();

    return () => {
      cancelled = true;
      poseLoopStopRef.current = true;
    };
  }, [cameraReady]);

  const speakFeedback = (text, exerciseName) => {
    if (!ttsEnabledRef.current || !synthRef.current || !ttsSupported || !isRecordingRef.current) return;
    const say = (text || '').trim();
    if (!say) return;
    if (lastSpokenRef.current === say) return;
    if (exerciseName && exerciseName !== exerciseRef.current) return;
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
    const usedExercise = exerciseName || exerciseRef.current;
    setTtsHistory((prev) => [{ time: timeLabel(), exercise: usedExercise, text: say }, ...prev].slice(0, 6));
  };

  useEffect(() => {
    if (!ttsEnabled) return;
    if (!feedback || !feedback.trim()) return;
    if (lastSpokenRef.current === feedback.trim()) return;
    speakFeedback(feedback, feedbackExercise);
  }, [feedback, feedbackExercise, ttsEnabled]);

  const normalizeEmbedUrl = (val) => {
    const raw = (val || '').trim();
    if (!raw) return null;

    // watch?v=ID 또는 youtu.be/ID → ID 추출
    const watchMatch = raw.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    const shortMatch = raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    const idMatch = raw.match(/([A-Za-z0-9_-]{11})/);
    const vid = (watchMatch && watchMatch[1]) || (shortMatch && shortMatch[1]) || (idMatch && idMatch[1]);
    if (vid) return `https://www.youtube-nocookie.com/embed/${vid}`;

    // http(s)지만 ID가 안 보이면 그대로 (외부 링크 포함)
    if (/^https?:\/\//i.test(raw)) return raw;

    // 그 외는 유효하지 않은 입력으로 간주
    return null;
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
      setYoutubeUrl(FALLBACK_YT[exercise]);
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
    if (!url) {
      setYoutubeError('영상 ID/링크를 확인해 주세요.');
      return;
    }
    setYoutubeUrl(url);
    setVideoPinned(true);
    setYoutubeError('');
    appendLog('튜토리얼 영상을 수동으로 변경했습니다.');
  };

  const resetVideoPin = () => {
    setVideoPinned(false);
    setYoutubeError('');
    setVideoInput('');
    setYoutubeUrl(FALLBACK_YT[exercise]);
  };

  const handleVideoRequest = async (raw) => {
    const text = (raw || '').trim();
    const direct = text.match(/^영상[:：]\s*(.+)$/i);
    const search = text.match(/^영상\s*검색\s+(.+)/i);

    if (direct) {
      const target = direct[1].trim();
      if (!target) return false;
      const url = normalizeEmbedUrl(target);
      if (!url) {
        setYoutubeError('영상 ID/링크를 확인해 주세요.');
        return false;
      }
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
      const botMsg = { role: 'assistant', content: replyText, exercise: exerciseRef.current };
      setChatMessages((prev) => [...prev, botMsg]);
      appendLog('LLM 코칭 응답이 도착했습니다.');
    } catch (err) {
      console.error('OpenAI API error:', err);
      const botMsg = {
        role: 'assistant',
        content: `LLM 호출 중 오류가 발생했습니다: ${err.message || err}`,
        exercise: exerciseRef.current,
      };
      setChatMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleVideoError = () => {
    videoErrorRef.current += 1;
    setVideoPinned(false);
    const next = videoErrorRef.current > 1 ? FALLBACK_YT_ALT[exercise] : FALLBACK_YT[exercise];
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
            <h1 className="app-title">EXERCISE COACH</h1>
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
              <div className="stat-label">{`${exercise} 횟수`}</div>
              <div className="stat-value">{repCount} 회</div>
              <div className="stat-meta">{sessionDuration ? `${sessionDuration}초 진행` : '운동 준비'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">경과 시간</div>
              <div className="stat-value">{formatClock(sessionDuration)}</div>
              <div className="stat-meta">{isRecording ? '진행 중' : '대기'}</div>
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
                    height="420"
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
                    <span className="section-title">{`${exercise} 라이브 + 분석 뷰`}</span>
                    <div className="media-labels">
                      <span className="media-label">{cameraReady ? 'Live' : '대기'}</span>
                      <span className="media-label media-label-live">로컬 분석</span>
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
                        style={{ transform: 'scaleX(-1)', width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <canvas
                        ref={poseCanvasRef}
                        className="pose-overlay"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          pointerEvents: 'none',
                          width: '100%',
                          height: '100%',
                          transform: 'scaleX(-1)',
                        }}
                      />
                      {processedFrame ? (
                        <img
                          src={processedFrame}
                          alt="분석 결과 프레임"
                          className="analysis-frame"
                          style={{ transform: 'scaleX(-1)' }}
                        />
                      ) : null}
                      <canvas ref={canvasRef} style={{ display: 'none' }} />
                      {isRecording && (
                        <div className="recording-indicator">
                          <span className="rec-dot">●</span> REC
                        </div>
                      )}
                    </div>
                    <div className="analysis-note">
                      {processedFrame
                        ? `${exercise} 분석 프레임 표시 중`
                        : analysisNote}
                    </div>
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
                      <span className="micro-pill">{`${exercise} ${repCount}회`}</span>
                      <span className="micro-pill">{sessionDuration ? `${sessionDuration}초` : '대기'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="feedback-section">
                <div className="feedback-header">
                  <div>
                    <h3 className="section-title">자세 피드백</h3>
                    <div className="section-caption">이미지 분석 결과를 여기서 확인하세요.</div>
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
                <div className="feedback-actions" />
              </div>
            </div>

            {showRightPanel && (
              <div className="panel">
                <div className="panel-header">이미지 기반 피드백</div>
                <div className="stat-card" style={{ marginBottom: 10 }}>
                  <div className="stat-label">{`${exercise} 횟수`}</div>
                  <div className="stat-value" style={{ fontSize: 28 }}>{imgRepCount}</div>
                  <div className="stat-meta">{imgStatus}</div>
                </div>
                {exercise !== '숄더프레스' ? (
                  <div className="stat-card" style={{ marginBottom: 10 }}>
                    <div className="stat-label">무릎 각도</div>
                    <div className="stat-value" style={{ fontSize: 24 }}>
                      {`${imgKneeAngle}°`}
                    </div>
                    <div className="stat-meta">자세 상태: {imgPoseState}</div>
                  </div>
                ) : (
                  <div className="stat-card" style={{ marginBottom: 10 }}>
                    <div className="stat-label">팔꿈치 각도</div>
                    <div className="stat-value" style={{ fontSize: 24 }}>
                      {`${imgKneeAngle}°`}
                    </div>
                    <div className="stat-meta">자세 상태: {imgPoseState}</div>
                  </div>
                )}
                <div className="stat-card" style={{ marginBottom: 10 }}>
                  <div className="stat-label">캡처된 이미지</div>
                  {imgCaptured ? (
                    <img src={imgCaptured} alt="캡처" style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
                  ) : (
                    <div className="helper-text">최하단에서 자동으로 캡처됩니다.</div>
                  )}
                </div>
                <div className="panel-header">지난 운동 기록</div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="table-cell">날짜</th>
                        <th className="table-cell">운동</th>
                        <th className="table-cell">횟수</th>
                        <th className="table-cell">시간</th>
                        <th className="table-cell">영상</th>
                        <th className="table-cell">리포트</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exerciseHistory.length === 0 ? (
                        <tr>
                          <td className="table-cell" colSpan={6}>
                          </td>
                        </tr>
                      ) : (
                        exerciseHistory.map((record) => (
                          <tr key={record.id}>
                            <td className="table-cell">{record.date}</td>
                            <td className="table-cell">{record.exercise}</td>
                            <td className="table-cell">{record.repCount}회</td>
                            <td className="table-cell">{record.duration}</td>
                            <td className="table-cell">
                              {record.videoUrl ? (
                                <button
                                  className="ghost-button"
                                  style={{ padding: '4px 8px', fontSize: '12px' }}
                                  onClick={() => openVideoModal(record.videoUrl)}
                                >
                                  ▶ 재생
                                </button>
                              ) : (
                                <span style={{ color: '#666', fontSize: '12px' }}>없음</span>
                              )}
                            </td>
                            <td className="table-cell">
                              {record.summaryReport ? (
                                <button
                                  className="ghost-button"
                                  style={{ padding: '4px 8px', fontSize: '12px' }}
                                  onClick={() => {
                                    setReportModalContent(record.summaryReport);
                                    setReportModalOpen(true);
                                  }}
                                >
                                  📋 보기
                                </button>
                              ) : (
                                <span style={{ color: '#666', fontSize: '12px' }}>-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
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
          </button>
        </div>
      </div>

      {/* 비디오 팝업 모달 */}
      {videoModalOpen && (
        <div
          className="video-modal-overlay"
          onClick={closeVideoModal}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="video-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              backgroundColor: '#1a1a1a',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          >
            <button
              onClick={closeVideoModal}
              style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#ff4444',
                color: '#fff',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(255, 68, 68, 0.4)',
              }}
            >
              ×
            </button>
            <div style={{ marginBottom: '12px', color: '#fff', fontSize: '16px', fontWeight: 600 }}>
            </div>
            <video
              src={videoModalUrl}
              controls
              autoPlay
              style={{
                maxWidth: '80vw',
                maxHeight: '70vh',
                borderRadius: '8px',
                backgroundColor: '#000',
              }}
            />
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <a
                href={videoModalUrl}
                download={`exercise_${Date.now()}.webm`}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4CAF50',
                  color: '#fff',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  display: 'inline-block',
                }}
              >
                📥 다운로드
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 종합 리포트 팝업 모달 */}
      {reportModalOpen && (
        <div
          className="report-modal-overlay"
          onClick={() => setReportModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="report-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '500px',
              width: '90%',
              backgroundColor: '#1a1a1a',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          >
            <button
              onClick={() => setReportModalOpen(false)}
              style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#ff4444',
                color: '#fff',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(255, 68, 68, 0.4)',
              }}
            >
              ×
            </button>
            <div style={{ marginBottom: '16px', color: '#4CAF50', fontSize: '18px', fontWeight: 700 }}>
              📋 종합 리포트
            </div>
            <div
              style={{
                color: '#e0e0e0',
                fontSize: '15px',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {reportModalContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
