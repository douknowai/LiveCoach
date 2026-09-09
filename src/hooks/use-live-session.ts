'use client';

/**
 * useLiveSession：模拟直播核心状态机
 *
 * 职责：
 * 1. 摄像头/麦克风采集管理（WebRTC 规范：等待 loadedmetadata、不条件渲染、卸载清理）
 * 2. 三条并行分析链路：
 *    - 视觉链路：每 ~6s 抽帧 → /api/analyze/vision（多模态 LLM）
 *    - 语音链路：每 ~22s 一段 WAV → /api/analyze/speech（ASR + LLM）
 *    - 本地音频：AudioEngine 实时音量/停顿 → 本地规则提醒（零延迟）
 * 3. 指标引擎（MetricsEngine）与提醒节流（ReminderEngine）
 * 4. 直播流程陪练（环节推进/遗漏检测/即时点评）
 * 5. 结束保存 → /api/session/save（含 AI 复盘）→ 跳转复盘页
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AudioEngine } from '@/lib/audio-engine';
import { FaceEngine } from '@/lib/face-engine';
import { MetricsEngine, type MetricsSnapshot } from '@/lib/metrics-engine';
import { ReminderEngine } from '@/lib/reminder-engine';
import { WavRecorder } from '@/lib/wav-recorder';
import { parseOutline, DEFAULT_OUTLINE_STAGES, loadStoredProfile, METRIC_TO_REMINDER_TYPES, type StoredProfile } from '@/lib/session-config';
import type {
  AnalyzeContext,
  AudioState,
  FaceEvent,
  FaceState,
  GrowthProfile,
  LiveStage,
  MetricSample,
  Reminder,
  ReminderType,
  SpeechResult,
  SpeechSegmentRecord,
  TrainingConfig,
  VisionCheckRecord,
  VisionResult,
  VisionAnalysisResponse,
  SpeechAnalysisResponse,
} from '@/lib/types';

export type LivePhase = 'device' | 'countdown' | 'live' | 'saving' | 'ended';
export type AiLevel = 'ok' | 'warn' | 'alert';

export interface CoachNote {
  atSec: number;
  message: string;
  /** 即时点评（环节小结） */
  kind: 'stage' | 'info';
}

const VISION_INTERVAL_MS = 6000;
const VISION_FIRST_MS = 2600;
const SPEECH_INTERVAL_MS = 22000;
const SPEECH_FIRST_MS = 14000;
const LATEST_REMINDER_TTL_MS = 4200;

export function useLiveSession(config: TrainingConfig) {
  const router = useRouter();

  // ── 采集 refs ──
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── 引擎实例 ──
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const faceEngineRef = useRef<FaceEngine | null>(null);
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const metricsRef = useRef<MetricsEngine>(new MetricsEngine());
  const reminderEngineRef = useRef<ReminderEngine>(new ReminderEngine());

  // ── 流程状态 ──
  const stagesRef = useRef<LiveStage[]>([]);
  const lastMatchedRef = useRef<number>(-1);
  const currentLabelRef = useRef<string>('开播准备');
  const startedAtRef = useRef<number>(0);
  const phaseRef = useRef<LivePhase>('device');
  const elapsedRef = useRef<number>(0);
  const visionChecksRef = useRef<VisionCheckRecord[]>([]);
  const speechSegmentsRef = useRef<SpeechSegmentRecord[]>([]);
  const lastTranscriptRef = useRef<string>('');
  const busyVisionRef = useRef(false);
  const busySpeechRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const lastSilenceAlertRef = useRef<number>(0);
  const wasSilentRef = useRef(false);
  const configRef = useRef<TrainingConfig>(config);
  const savedRef = useRef(false);
  const welcomeAbortRef = useRef<AbortController | null>(null);
  const growthRef = useRef<GrowthProfile | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // ── UI 状态 ──
  const [phase, setPhase] = useState<LivePhase>('device');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [welcomeText, setWelcomeText] = useState('');
  const [latestReminder, setLatestReminder] = useState<Reminder | null>(null);
  const [coachNotes, setCoachNotes] = useState<CoachNote[]>([]);
  const [metricsSnap, setMetricsSnap] = useState<MetricsSnapshot>(() => ({
    metrics: {
      cameraPresence: 75, expression: 75, posture: 75, language: 75,
      pacing: 75, content: 75, interaction: 75, charisma: 75,
    },
    overall: 75,
  }));
  const [audioState, setAudioState] = useState<AudioState>({
    avgVolume: 0, level: 0, silenceSec: 0, speakingRatio: 0,
  });
  const [faceState, setFaceState] = useState<FaceState>({
    engine: 'off', faceFound: false, pitchOffset: 0, yawOffset: 0,
    rollDeg: 0, gazeOnCamera: 1, smile: 0, calibrated: false,
  });
  const [stages, setStages] = useState<LiveStage[]>([]);
  const [currentLabel, setCurrentLabel] = useState('开播准备');
  const [aiLevel, setAiLevel] = useState<AiLevel>('ok');
  const [latestVision, setLatestVision] = useState<VisionResult | null>(null);
  const [latestSpeech, setLatestSpeech] = useState<SpeechResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ vision: 0, speech: 0 });
  const [aiStatus, setAiStatus] = useState<'idle' | 'watching' | 'listening'>('idle');

  const phaseSync = (p: LivePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ── 初始化流程环节 ──
  useEffect(() => {
    const names = configRef.current.outline.trim()
      ? parseOutline(configRef.current.outline)
      : DEFAULT_OUTLINE_STAGES;
    stagesRef.current = names.map((name, index) => ({
      index,
      name: name.slice(0, 24),
      enteredAtSec: -1,
      completed: false,
    }));
    setStages([...stagesRef.current]);
  }, []);

  // ── 提醒注入（经节流） ──
  const pushReminder = useCallback(
    (r: Omit<Reminder, 'atSec'>): Reminder | null => {
      const sec = elapsedRef.current;
      const full = reminderEngineRef.current.push(r, sec);
      if (!full) return null;
      setReminders((prev) => [full, ...prev].slice(0, 80));
      setLatestReminder(full);
      window.setTimeout(() => {
        setLatestReminder((cur) => (cur === full ? null : cur));
      }, LATEST_REMINDER_TTL_MS);
      return full;
    },
    []
  );

  // ── 端侧视觉事件 → 即时提醒（本地 24Hz 推理，秒级响应；与 LLM 6s 抽帧链路互补） ──
  const onFaceEvent = useCallback(
    (e: FaceEvent) => {
      const map: Record<
        FaceEvent['kind'],
        { type: ReminderType; message: string; priority: 1 | 2 | 3; event: 'headDown' | 'headTilt' | 'lookingAway' | 'noFace' | 'smileGood' }
      > = {
        noFace: { type: 'position', message: '画面中没有检测到人脸，请回到镜头前', priority: 1, event: 'noFace' },
        headDown: { type: 'head', message: '经常低头看稿件，抬起头面对镜头更有亲和力', priority: 2, event: 'headDown' },
        headTilt: { type: 'posture', message: '头部歪斜时间较长，注意坐姿端正', priority: 2, event: 'headTilt' },
        lookingAway: { type: 'gaze', message: '视线离开了镜头，多与观众进行眼神交流', priority: 2, event: 'lookingAway' },
        smileGood: { type: 'praise', message: '微笑状态很好，很有亲和力，保持！', priority: 3, event: 'smileGood' },
      };
      const m = map[e.kind];
      metricsRef.current.applyEvent(m.event);
      pushReminder({ type: m.type, message: m.message, priority: m.priority, source: 'face' });
    },
    [pushReminder]
  );

  // ── 端侧视觉引擎惰性加载（模型失败不影响主流程，自动回退纯 LLM 链路） ──
  const ensureFaceEngine = useCallback(async () => {
    if (faceEngineRef.current || !videoRef.current) return;
    const engine = new FaceEngine();
    engine.onEvent = onFaceEvent;
    engine.onState = (s: FaceState) => setFaceState(s);
    faceEngineRef.current = engine;
    await engine.init(videoRef.current);
  }, [onFaceEvent]);

  // ── 摄像头初始化 ──
  const initCamera = useCallback(async (): Promise<boolean> => {
    setCameraError(null);
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => undefined);
          setCameraReady(true);
          void ensureFaceEngine();
        };
      } else {
        setCameraReady(true);
      }
      return true;
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === 'NotAllowedError') {
        setCameraError('未授权摄像头/麦克风。请在浏览器地址栏权限设置中允许访问后重试。');
      } else if (e?.name === 'NotFoundError') {
        setCameraError('未检测到摄像头或麦克风设备，请检查设备连接。');
      } else if (e?.name === 'NotReadableError') {
        setCameraError('摄像头被其他应用占用，请关闭占用后重试。');
      } else {
        setCameraError('设备初始化失败，请检查浏览器兼容性（建议使用 Chrome/Edge）。');
      }
      return false;
    }
  }, [ensureFaceEngine]);

  // ── 截帧 ──
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || video.readyState < 2) return null;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const w = 640;
    const h = Math.round(video.videoHeight * (w / video.videoWidth));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.62);
  }, []);

  /** 端侧视觉状态摘要（随分析上下文送 LLM 参考提升判断准确性） */
  const buildFaceState = (): AnalyzeContext['faceState'] => {
    const fs = faceEngineRef.current?.getState();
    if (!fs || fs.engine !== 'ready') return null;
    return {
      faceFound: fs.faceFound,
      pitchOffset: fs.pitchOffset,
      yawOffset: fs.yawOffset,
      rollDeg: fs.rollDeg,
      gazeOnCamera: fs.gazeOnCamera,
      smile: fs.smile,
    };
  };

  /** AI 教练开场欢迎语：SSE 流式打字机（依据教练人格 + 学员画像 + 成长档案个性化生成） */
  const fetchWelcome = useCallback(async () => {
    welcomeAbortRef.current?.abort();
    const ac = new AbortController();
    welcomeAbortRef.current = ac;
    setWelcomeText('');
    const c = configRef.current;
    let stored: StoredProfile | null = null;
    try {
      stored = loadStoredProfile();
    } catch {
      stored = null;
    }
    try {
      const res = await fetch('/api/coach/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachStyle: c.coachStyle,
          learner: c.learner,
          focusMetrics: c.focusMetrics,
          growth: stored?.growth ?? null,
          topic: c.topic,
          taskType: c.taskType,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          const m = frame.match(/^data: (.*)$/);
          if (!m || m[1] === '[DONE]') continue;
          try {
            const parsed = JSON.parse(m[1]) as { delta?: string };
            if (parsed.delta) setWelcomeText((t) => t + parsed.delta);
          } catch {
            // 忽略不完整帧
          }
        }
      }
    } catch {
      // 用户离开或网络失败：欢迎语静默降级，不影响直播主流程
    }
  }, []);

  // ── 构建分析上下文 ──
  const buildContext = useCallback((): AnalyzeContext => {
    const c = configRef.current;
    const audio = audioEngineRef.current?.getState() ?? {
      avgVolume: 0, level: 0, silenceSec: 0, speakingRatio: 0,
    };
    return {
      taskType: c.taskType,
      topic: c.topic,
      product: c.product,
      persona: c.persona,
      audience: c.audience,
      outline: c.outline,
      script: c.script,
      elapsedSec: elapsedRef.current,
      currentStage: currentLabelRef.current,
      recentReminders: reminderEngineRef.current
        .all()
        .slice(-6)
        .map((r) => ({ type: r.type, message: r.message, atSec: r.atSec })),
      audioState: {
        silenceSec: audio.silenceSec,
        speakingRatio: audio.speakingRatio,
        avgVolume: audio.avgVolume,
      },
      faceState: buildFaceState(),
      lastTranscript: lastTranscriptRef.current,
      coachStyle: c.coachStyle,
      learner: c.learner,
      focusMetrics: c.focusMetrics,
      growth: growthRef.current,
    };
  }, []);

  // ── 环节推进处理 ──
  const applyStageJudgement = useCallback(
    (judged: { current: string; matchedIndex: number; offTopic: boolean }) => {
      const stagesNow = stagesRef.current;
      if (judged.matchedIndex >= 0 && judged.matchedIndex < stagesNow.length) {
        const idx = judged.matchedIndex;
        const prev = lastMatchedRef.current;
        if (idx !== prev) {
          // 标记中间遗漏环节
          if (prev >= 0 && idx > prev) {
            for (let i = prev + 1; i < idx; i++) {
              if (stagesNow[i].enteredAtSec < 0) {
                stagesNow[i].enteredAtSec = elapsedRef.current;
                stagesNow[i].completed = false;
              }
            }
            const missed = stagesNow
              .slice(prev + 1, idx)
              .filter((s) => !s.completed)
              .map((s) => s.name);
            if (missed.length > 0) {
              metricsRef.current.applyEvent('stageMiss');
              pushReminder({
                type: 'content',
                message: `流程中「${missed[0]}」可能还未介绍`,
                priority: 1,
                source: 'local',
              });
            }
          }
          // 环节小结（即时点评）
          if (prev >= 0 && idx > prev && stagesNow[prev].enteredAtSec >= 0) {
            stagesNow[prev].completed = true;
            const dur = elapsedRef.current - stagesNow[prev].enteredAtSec;
            const stats = reminderEngineRef.current.stats();
            const issueCount = Object.entries(stats)
              .filter(([t]) => t !== 'praise' && t !== 'stage')
              .reduce((a, [, n]) => a + n, 0);
            const note: CoachNote = {
              atSec: elapsedRef.current,
              kind: 'stage',
              message: `「${stagesNow[prev].name}」完成（约 ${Math.round(dur / 60) || 1} 分钟内），继续保持${issueCount > 2 ? '，注意刚提醒过的问题' : ''}。下一环节：${stagesNow[idx].name}`,
            };
            setCoachNotes((p) => [note, ...p].slice(0, 20));
            metricsRef.current.applyEvent('stageAdvance');
          }
          if (stagesNow[idx].enteredAtSec < 0) {
            stagesNow[idx].enteredAtSec = elapsedRef.current;
          }
          stagesNow[idx].completed = stagesNow[idx].completed || idx <= lastMatchedRef.current;
          lastMatchedRef.current = idx;
          setStages([...stagesNow]);
        }
        currentLabelRef.current = stagesNow[idx].name;
        setCurrentLabel(stagesNow[idx].name);
      } else if (judged.current && judged.current !== currentLabelRef.current) {
        currentLabelRef.current = judged.current.slice(0, 24);
        setCurrentLabel(currentLabelRef.current);
      }
    },
    [pushReminder]
  );

  // ── 视觉检查 ──
  const runVisionCheck = useCallback(
    async (isFirst: boolean) => {
      if (busyVisionRef.current || phaseRef.current !== 'live') return;
      const frame = captureFrame();
      if (!frame) return;
      busyVisionRef.current = true;
      setAiStatus('watching');
      try {
        const res = await fetch('/api/analyze/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: frame,
            ctx: buildContext(),
            isFirstCheck: isFirst,
          }),
        });
        const data = (await res.json()) as VisionAnalysisResponse;
        if (!data.ok || !data.vision) return;
        const v = data.vision;
        setLatestVision(v);
        metricsRef.current.applyVision(v);
        const rec: VisionCheckRecord = {
          atSec: elapsedRef.current,
          level: v.level,
          smile: v.smile,
          distance: v.distance,
          headTilt: v.headTilt,
          lookingAtCamera: v.lookingAtCamera,
          energy: v.energy,
        };
        visionChecksRef.current.push(rec);
        setAiLevel(v.level === 'ok' ? 'ok' : v.level);
        setCounts((c) => ({ ...c, vision: c.vision + 1 }));
        if (data.stage) applyStageJudgement(data.stage);
        // AI 建议提醒 → 节流入列
        for (const r of data.reminders ?? []) {
          pushReminder({
            type: r.type as ReminderType,
            message: r.message,
            priority: r.priority,
            source: 'vision',
          });
        }
      } catch {
        // 网络抖动静默重试下一轮
      } finally {
        busyVisionRef.current = false;
        setAiStatus('idle');
      }
    },
    [buildContext, captureFrame, pushReminder, applyStageJudgement]
  );

  // ── 语音检查 ──
  const runSpeechCheck = useCallback(async () => {
    if (busySpeechRef.current || phaseRef.current !== 'live') return;
    const recorder = wavRecorderRef.current;
    if (!recorder) return;
    const seg = recorder.getSegment(5);
    if (!seg) return;
    busySpeechRef.current = true;
    setAiStatus('listening');
    try {
      const res = await fetch('/api/analyze/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: seg.base64, durationMs: seg.durationMs, ctx: buildContext() }),
      });
      const data = (await res.json()) as SpeechAnalysisResponse;
      if (!data.ok || !data.speech) return;
      const s = data.speech;
      setLatestSpeech(s);
      metricsRef.current.applySpeech(s);
      if (s.transcript) lastTranscriptRef.current = s.transcript;
      const rec: SpeechSegmentRecord = {
        atSec: elapsedRef.current,
        text: s.transcript.slice(0, 400),
        speechRate: s.speechRate,
        interaction: s.interaction,
      };
      if (s.transcript) speechSegmentsRef.current.push(rec);
      setCounts((c) => ({ ...c, speech: c.speech + 1 }));
      if (data.stage) applyStageJudgement(data.stage);
      for (const r of data.reminders ?? []) {
        pushReminder({ type: r.type as ReminderType, message: r.message, priority: r.priority, source: 'speech' });
      }
    } catch {
      // 静默重试
    } finally {
      busySpeechRef.current = false;
      setAiStatus('idle');
    }
  }, [buildContext, pushReminder, applyStageJudgement]);

  // ── 本地音频规则（每秒检查） ──
  const runLocalAudioRules = useCallback(() => {
    const audio = audioEngineRef.current;
    if (!audio) return;
    const st = audio.getState();
    setAudioState({ ...st });

    if (st.silenceSec >= 8 && Date.now() - lastSilenceAlertRef.current > 26000) {
      lastSilenceAlertRef.current = Date.now();
      wasSilentRef.current = true;
      metricsRef.current.applyEvent('silence');
      pushReminder({
        type: 'pause',
        message: '已经停顿较长时间，可以进入下一环节',
        priority: 1,
        source: 'local',
      });
    } else if (st.silenceSec < 2 && wasSilentRef.current) {
      wasSilentRef.current = false;
      metricsRef.current.applyEvent('resume');
    } else if (
      st.avgVolume < 0.025 &&
      st.speakingRatio < 0.1 &&
      st.silenceSec < 3 &&
      elapsedRef.current > 30 &&
      Date.now() - lastSilenceAlertRef.current > 35000
    ) {
      lastSilenceAlertRef.current = Date.now();
      metricsRef.current.applyEvent('quiet');
      pushReminder({
        type: 'volume',
        message: '声音有点小，观众可能听不清',
        priority: 2,
        source: 'local',
      });
    }
  }, [pushReminder]);

  // ── 分析循环（开播与保存失败回退共用） ──
  const startLoops = useCallback(() => {
    // 视觉循环（首帧 2.6s 基线检查后进入常规轮询）
    const v1 = window.setTimeout(() => {
      void runVisionCheck(true);
    }, VISION_FIRST_MS);
    const vLoop = window.setInterval(() => void runVisionCheck(false), VISION_INTERVAL_MS);
    // 语音循环
    const s1 = window.setTimeout(() => void runSpeechCheck(), SPEECH_FIRST_MS);
    const sLoop = window.setInterval(() => void runSpeechCheck(), SPEECH_INTERVAL_MS);
    // 秒表 + 本地音频规则 + 指标采样
    const tick = window.setInterval(() => {
      if (phaseRef.current !== 'live') return;
      elapsedRef.current += 1;
      const sec = elapsedRef.current;
      setElapsedSec(sec);
      runLocalAudioRules();
      metricsRef.current.tick(sec);
      if (sec % 15 === 0) {
        metricsRef.current.recordSample(sec);
        setMetricsSnap(metricsRef.current.snapshot());
      }
    }, 1000);

    timersRef.current = [v1, vLoop, s1, sLoop, tick];
  }, [runVisionCheck, runSpeechCheck, runLocalAudioRules]);

  // ── 开播 ──
  const startLive = useCallback(() => {
    if (phaseRef.current === 'live') return;
    startedAtRef.current = Date.now();
    elapsedRef.current = 0;
    savedRef.current = false;

    // 引擎初始化
    metricsRef.current = new MetricsEngine();
    reminderEngineRef.current = new ReminderEngine();
    growthRef.current = loadStoredProfile().growth ?? null;
    reminderEngineRef.current.setFocusTypes(
      configRef.current.focusMetrics.flatMap((k) => METRIC_TO_REMINDER_TYPES[k] ?? [])
    );
    if (streamRef.current) {
      if (!audioEngineRef.current) audioEngineRef.current = new AudioEngine();
      audioEngineRef.current.start(streamRef.current);
      if (!wavRecorderRef.current) wavRecorderRef.current = new WavRecorder();
      wavRecorderRef.current.start(streamRef.current);
    }
    // 端侧视觉引擎：开启事件发射并重新校准姿态基线
    faceEngineRef.current?.arm();
    // AI 教练开场欢迎语（流式打字机，失败静默降级不影响直播）
    void fetchWelcome();

    phaseSync('live');
    setReminders([]);
    setCoachNotes([]);
    setLatestReminder(null);
    setSaveError(null);
    startLoops();
  }, [startLoops, fetchWelcome]);

  // ── 倒计时 ──
  const beginCountdown = useCallback(() => {
    if (!streamRef.current) return;
    phaseSync('countdown');
    setCountdown(3);
    let n = 3;
    const cd = window.setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        window.clearInterval(cd);
        startLive();
      }
    }, 1000);
    timersRef.current.push(cd);
  }, [startLive]);

  // ── 停止所有循环 ──
  const stopLoops = useCallback(() => {
    timersRef.current.forEach((t) => {
      window.clearTimeout(t);
      window.clearInterval(t);
    });
    timersRef.current = [];
    audioEngineRef.current?.stop();
    wavRecorderRef.current?.stop();
  }, []);

  // ── 结束并保存 ──
  const endLive = useCallback(async () => {
    if (phaseRef.current !== 'live' && phaseRef.current !== 'saving') return;
    if (savedRef.current) return;
    savedRef.current = true;
    stopLoops();
    phaseSync('saving');

    const c = configRef.current;
    const snap = metricsRef.current.snapshot();
    const durationSec = elapsedRef.current;
    const remindersAll = reminderEngineRef.current.all();
    faceEngineRef.current?.disarm();

    try {
      const res = await fetch('/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: c.studentName,
          taskType: c.taskType,
          topic: c.topic,
          product: c.product,
          persona: c.persona,
          audience: c.audience,
          outline: c.outline,
          script: c.script,
          durationSec,
          metrics: snap.metrics,
          metricSamples: metricsRef.current.samples,
          reminders: remindersAll,
          stageTimeline: stagesRef.current,
          speechSegments: speechSegmentsRef.current,
          visionChecks: visionChecksRef.current,
        }),
      });
      const data = (await res.json()) as { ok: boolean; id?: string; error?: string };
      if (!data.ok || !data.id) {
        throw new Error(data.error ?? '保存失败');
      }
      phaseSync('ended');
      router.push(`/review/${data.id}`);
    } catch (err) {
      savedRef.current = false;
      setSaveError(err instanceof Error ? err.message : '保存失败，请重试');
      phaseSync('live');
      // 重启完整分析循环（视觉/语音/秒表），允许学生继续直播或再次结束
      startLoops();
    }
  }, [router, stopLoops, startLoops]);

  // ── 中止（不保存） ──
  const abort = useCallback(() => {
    stopLoops();
    faceEngineRef.current?.disarm();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    router.push('/setup');
  }, [router, stopLoops]);

  // ── 卸载清理 ──
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => {
        window.clearTimeout(t);
        window.clearInterval(t);
      });
      welcomeAbortRef.current?.abort();
      audioEngineRef.current?.stop();
      wavRecorderRef.current?.stop();
      faceEngineRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    // refs & state
    videoRef,
    phase,
    cameraReady,
    cameraError,
    countdown,
    elapsedSec,
    reminders,
    welcomeText,
    latestReminder,
    coachNotes,
    metricsSnap,
    audioState,
    faceState,
    stages,
    currentLabel,
    aiLevel,
    latestVision,
    latestSpeech,
    saveError,
    counts,
    aiStatus,
    // actions
    initCamera,
    beginCountdown,
    startLive,
    endLive,
    abort,
  };
}

export type { MetricSample };
