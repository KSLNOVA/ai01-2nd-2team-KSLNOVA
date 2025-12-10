const { useEffect, useRef, useState } = React;

const WS_URL =
  (typeof window !== 'undefined' && window.WS_URL)
    ? window.WS_URL
    : (typeof window !== 'undefined' &&
        window.location &&
        window.location.origin &&
        window.location.origin.startsWith('http'))
      ? window.location.origin.replace(/^http/, 'ws') + '/ws/feedback'
      : 'ws://localhost:9006/ws/feedback';

function AppV9() {
  const [feedback, setFeedback] = useState('정면/측면 카메라를 연결하세요.');
  const [reps, setReps] = useState(0);
  const [wsStatus, setWsStatus] = useState('connecting');
  const [frontImage, setFrontImage] = useState('');
  const [sideImage, setSideImage] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [devices, setDevices] = useState([]);
  const [frontDeviceId, setFrontDeviceId] = useState('');
  const [sideDeviceId, setSideDeviceId] = useState('');

  const wsRef = useRef(null);
  const frontVideoRef = useRef(null);
  const sideVideoRef = useRef(null);
  const frontCanvasRef = useRef(null);
  const sideCanvasRef = useRef(null);
  const frontStreamRef = useRef(null);
  const sideStreamRef = useRef(null);

  // WebSocket 연결
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setWsStatus('connecting');
    let active = true;

    ws.onopen = () => {
      if (!active) return;
      setWsStatus('connected');
    };
    ws.onclose = () => {
      if (!active) return;
      setWsStatus('disconnected');
    };
    ws.onerror = () => {
      if (!active) return;
      setWsStatus('error');
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'FEEDBACK') {
        if (data.image_front) setFrontImage(data.image_front);
        if (data.image_side) setSideImage(data.image_side);
        if (data.instant_feedback) setFeedback(data.instant_feedback);
        if (typeof data.reps === 'number') setReps(data.reps);
        setIsRecording(data.is_recording);
      }
    };

    return () => {
      active = false;
      ws.close();
    };
  }, []);

  // 카메라 열기/재열기
  const openStreams = async (frontId, sideId) => {
    try {
      // 기존 트랙 종료
      if (frontStreamRef.current) frontStreamRef.current.getTracks().forEach((t) => t.stop());
      if (sideStreamRef.current) sideStreamRef.current.getTracks().forEach((t) => t.stop());

      // deviceId는 exact로 지정해야 다른 카메라가 확실히 선택됨
      const frontConstraints = frontId
        ? { video: { deviceId: { exact: frontId } } }
        : { video: true };
      const sideConstraints = sideId
        ? { video: { deviceId: { exact: sideId } } }
        : { video: true };

      const frontStream = await navigator.mediaDevices.getUserMedia(frontConstraints);
      const sideStream = await navigator.mediaDevices.getUserMedia(sideConstraints);

      if (frontVideoRef.current) frontVideoRef.current.srcObject = frontStream;
      if (sideVideoRef.current) sideVideoRef.current.srcObject = sideStream;
      frontStreamRef.current = frontStream;
      sideStreamRef.current = sideStream;
      setCameraError('');
    } catch (err) {
      console.error('Camera error', err);
      setCameraError('카메라 권한/장치를 확인하세요.');
    }
  };

  // 장치 목록 조회
  useEffect(() => {
    async function initDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter((d) => d.kind === 'videoinput');
        setDevices(videos);
        if (!videos.length) {
          setCameraError('카메라를 찾을 수 없습니다.');
          return;
        }
        const fId = videos[0].deviceId;
        const sId = videos.length > 1 ? videos[1].deviceId : videos[0].deviceId;
        setFrontDeviceId(fId);
        setSideDeviceId(sId);
        await openStreams(fId, sId);
      } catch (err) {
        console.error('Camera error', err);
        setCameraError('카메라 권한/장치를 확인하세요.');
      }
    }
    initDevices();
    return () => {
      if (frontStreamRef.current) frontStreamRef.current.getTracks().forEach((t) => t.stop());
      if (sideStreamRef.current) sideStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 장치 변경 시 재연결
  useEffect(() => {
    if (!frontDeviceId && !sideDeviceId) return;
    openStreams(frontDeviceId, sideDeviceId);
  }, [frontDeviceId, sideDeviceId]);

  // 프레임 전송 루프 (front+side JSON)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const fv = frontVideoRef.current;
      const sv = sideVideoRef.current;
      const fc = frontCanvasRef.current;
      const sc = sideCanvasRef.current;
      if (!fv || !sv || !fc || !sc) return;

      // front
      fc.width = fv.videoWidth || 0;
      fc.height = fv.videoHeight || 0;
      const fctx = fc.getContext('2d');
      fctx.drawImage(fv, 0, 0, fc.width, fc.height);
      const b64Front = fc.width && fc.height ? fc.toDataURL('image/jpeg', 0.8) : '';

      // side
      sc.width = sv.videoWidth || 0;
      sc.height = sv.videoHeight || 0;
      const sctx = sc.getContext('2d');
      sctx.drawImage(sv, 0, 0, sc.width, sc.height);
      const b64Side = sc.width && sc.height ? sc.toDataURL('image/jpeg', 0.8) : '';

      if (b64Front || b64Side) {
        wsRef.current.send(JSON.stringify({ front: b64Front, side: b64Side }));
      }
    }, 120); // 약 8fps
    return () => clearInterval(interval);
  }, []);

  const toggleRecording = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (isRecording) {
      wsRef.current.send('STOP_RECORDING');
    } else {
      wsRef.current.send('START_RECORDING');
    }
    setIsRecording(!isRecording);
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>듀얼 카메라 스쿼트 피드백 (v9)</h1>
          <div className="sub">정면/측면 스켈레톤을 동시에 확인하세요.</div>
        </div>
        <div className={`pill ${wsStatus}`}>
          WS: {wsStatus}
        </div>
      </header>

      {cameraError && <div className="error">{cameraError}</div>}

      <div className="panel">
        <div className="panel-title">카메라 선택</div>
        <div className="grid-two">
          <div>
            <div className="sub">정면 카메라</div>
            <select
              value={frontDeviceId}
              onChange={(e) => setFrontDeviceId(e.target.value)}
              className="select"
            >
              {devices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `카메라 ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="sub">측면 카메라</div>
            <select
              value={sideDeviceId}
              onChange={(e) => setSideDeviceId(e.target.value)}
              className="select"
            >
              {devices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `카메라 ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid-two">
        <div className="panel">
          <div className="panel-title">정면 카메라</div>
          <div className="video-shell">
            <video ref={frontVideoRef} autoPlay muted playsInline className="webcam" />
            {frontImage && <img src={frontImage} className="overlay" alt="front processed" />}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">측면 카메라</div>
          <div className="video-shell">
            <video ref={sideVideoRef} autoPlay muted playsInline className="webcam" />
            {sideImage && <img src={sideImage} className="overlay" alt="side processed" />}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">피드백</div>
        <div className="feedback-box">{feedback}</div>
        <div className="meta">Reps: {reps}</div>
        <button className="primary" onClick={toggleRecording}>
          {isRecording ? '녹화 중지' : '녹화 시작'}
        </button>
      </div>

      <canvas ref={frontCanvasRef} style={{ display: 'none' }} />
      <canvas ref={sideCanvasRef} style={{ display: 'none' }} />
    </div>
  );
}
