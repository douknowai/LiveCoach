/**
 * FaceEngine：端侧视觉引擎（MediaPipe FaceLandmarker，浏览器本地推理）
 *
 * 定位：与 LLM 视觉链路（/api/analyze/vision，每 6s 抽帧）互补的「即时层」——
 * - 本地 24Hz 推理，零成本零延迟，负责低头 / 歪头 / 视线偏离 / 离镜 / 微笑
 *   等结构性姿态的秒级发现与即时提醒；
 * - LLM 链路继续负责语义级判断（表情自然度、构图、精神状态等）。
 *
 * 技术要点：
 * - 模型与 wasm 全部本地静态资源（public/models、public/mediapipe/wasm），零 CDN 依赖；
 * - GPU delegate 优先，失败自动降级 CPU，再失败置 failed（上层自动回退纯 LLM 模式）；
 * - 姿态用 landmark 几何比例（额头 10 / 鼻尖 1 / 下巴 152、脸颊 234/454、眼角 33/133/362/263、
 *   虹膜中心 468/473）而非矩阵欧拉角，规避坐标系符号约定歧义；
 * - 开播后前 2.5s 采样个人姿态基线（中位数），事件按「相对基线偏移 + 持续时长」判定，
 *   兼容不同脸型与坐姿，避免绝对阈值误报；
 * - 持续性去抖（hold）+ 引擎内冷却（cooldown）双层防抖，事件最终仍经 ReminderEngine 节流。
 */

import type { FaceEvent, FaceEventKind, FaceState } from './types';
import type { FaceLandmarker, FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_URL = '/models/face_landmarker.task';

/** 检测频率：24Hz 足够姿态判定，且显著低于满帧检测的功耗 */
const LOOP_MIN_INTERVAL_MS = 1000 / 24;
/** 状态回调节流 */
const STATE_EMIT_MS = 400;
/** 开播后姿态基线校准窗口 */
const CALIB_DURATION_MS = 2500;

/** 事件持续判定时长（毫秒）：条件须连续满足才触发，避免瞬态误报 */
const HOLD: Record<FaceEventKind, number> = {
  noFace: 1600,
  headDown: 2000,
  headTilt: 3000,
  lookingAway: 2500,
  smileGood: 2500,
};

/** 引擎内冷却（毫秒）：与 ReminderEngine 冷却叠加的双保险 */
const COOLDOWN: Record<FaceEventKind, number> = {
  noFace: 25000,
  headDown: 20000,
  headTilt: 30000,
  lookingAway: 22000,
  smileGood: 60000,
};

/** 低头判定：纵向比例相对基线偏移阈值（比例 = 鼻尖在额头-下巴线段上的位置） */
const PITCH_DOWN_DELTA = 0.075;
/** 低头绝对兜底：不依赖校准（如校准期间已低头） */
const PITCH_ABS_LIMIT = 0.78;
/** 侧头判定：鼻尖横向比例偏移阈值 */
const YAW_DELTA = 0.16;
/** 歪头判定：双眼连线角度阈值（度） */
const ROLL_TILT_DEG = 13;
/** 视线偏离：gazeOnCamera 低于该值视为目光离开镜头 */
const GAZE_OFF = 0.4;
/** 微笑 blendshape 均值阈值 */
const SMILE_SCORE = 0.45;

interface HoldTrack {
  /** 条件连续满足的起始时间（null=未满足） */
  since: number | null;
  lastEmit: number;
}

/** 从 landmark 中提取的原始几何量 */
interface FaceGeometry {
  pitchRatio: number;
  yawRatio: number;
  rollDeg: number;
  gazeOnCamera: number;
}

export class FaceEngine {
  private video: HTMLVideoElement | null = null;
  private landmarker: FaceLandmarker | null = null;
  private rafId = 0;
  private running = false;
  private lastLoopT = 0;
  private lastVideoTs = -1;

  /** 事件发射开关（开播后 arm，结束 disarm） */
  private armed = false;
  /** 姿态基线校准 */
  private calibrated = false;
  private calibStart = 0;
  private calibPitches: number[] = [];
  private calibYaws: number[] = [];
  private basePitch: number | null = null;
  private baseYaw: number | null = null;

  private holds: Record<FaceEventKind, HoldTrack> = {
    noFace: { since: null, lastEmit: 0 },
    headDown: { since: null, lastEmit: 0 },
    headTilt: { since: null, lastEmit: 0 },
    lookingAway: { since: null, lastEmit: 0 },
    smileGood: { since: null, lastEmit: 0 },
  };

  private state: FaceState = {
    engine: 'off',
    faceFound: false,
    pitchOffset: 0,
    yawOffset: 0,
    rollDeg: 0,
    gazeOnCamera: 1,
    smile: 0,
    calibrated: false,
  };

  /** 事件回调（由 use-live-session 消费：节流入列提醒 + 指标事件） */
  onEvent: ((e: FaceEvent) => void) | null = null;
  /** 状态回调（UI 展示用，内部 400ms 节流） */
  onState: ((s: FaceState) => void) | null = null;

  /**
   * 加载模型并开始检测循环。GPU 失败自动降级 CPU。
   * 返回 false 表示端侧引擎不可用（上层回退纯 LLM 链路，不影响主流程）。
   */
  async init(video: HTMLVideoElement): Promise<boolean> {
    if (this.landmarker) return true;
    this.video = video;
    this.state.engine = 'loading';
    this.emitState(true);

    const vision = await import('@mediapipe/tasks-vision');
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        this.state.engine = 'ready';
        this.emitState(true);
        this.startLoop();
        return true;
      } catch {
        // 当前 delegate 不可用，尝试下一个
      }
    }
    this.state.engine = 'failed';
    this.emitState(true);
    return false;
  }

  /** 开播调用：开启事件发射并重新校准姿态基线 */
  arm(): void {
    this.armed = true;
    this.calibrated = false;
    this.calibStart = 0;
    this.calibPitches = [];
    this.calibYaws = [];
    this.basePitch = null;
    this.baseYaw = null;
    for (const k of Object.keys(this.holds) as FaceEventKind[]) {
      this.holds[k].since = null;
      this.holds[k].lastEmit = 0;
    }
  }

  /** 结束直播调用：停止事件发射（检测继续，供预览状态展示） */
  disarm(): void {
    this.armed = false;
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - this.lastLoopT < LOOP_MIN_INTERVAL_MS) return;
      const video = this.video;
      if (!video || !this.landmarker || video.readyState < 2 || !video.videoWidth) return;
      this.lastLoopT = now;
      // detectForVideo 要求时间戳单调递增；视频帧率低于 rAF 时跳过重复帧
      const ts = video.currentTime * 1000;
      if (ts <= this.lastVideoTs) return;
      this.lastVideoTs = ts;
      let res: FaceLandmarkerResult;
      try {
        res = this.landmarker.detectForVideo(video, ts);
      } catch {
        return;
      }
      this.update(res, Date.now());
    };
    loop();
  }

  private update(res: FaceLandmarkerResult, wall: number): void {
    const lms: NormalizedLandmark[] | undefined = res.faceLandmarks?.[0];
    this.state.smile = this.extractSmile(res);

    if (!lms || lms.length < 468) {
      this.state.faceFound = false;
      this.state.gazeOnCamera = 1;
      this.hold('noFace', true, wall);
      this.state.pitchOffset = 0;
      this.state.yawOffset = 0;
      this.state.rollDeg = 0;
      this.emitState();
      return;
    }

    this.state.faceFound = true;
    this.holds.noFace.since = null;

    const g = extractGeometry(lms);
    this.state.rollDeg = g.rollDeg;
    this.state.gazeOnCamera = g.gazeOnCamera;

    // ── 姿态基线校准（开播后前 2.5s） ──
    if (this.armed && !this.calibrated) {
      if (!this.calibStart) this.calibStart = wall;
      this.calibPitches.push(g.pitchRatio);
      this.calibYaws.push(g.yawRatio);
      if (wall - this.calibStart >= CALIB_DURATION_MS) {
        this.basePitch = median(this.calibPitches);
        this.baseYaw = median(this.calibYaws);
        this.calibrated = true;
        this.state.calibrated = true;
      }
    }
    const pitchBase = this.basePitch ?? 0.58;
    const yawBase = this.baseYaw ?? 0.5;
    const pitchOffset = g.pitchRatio - pitchBase;
    const yawOffset = Math.abs(g.yawRatio - yawBase);
    this.state.pitchOffset = Math.round(pitchOffset * 1000) / 1000;
    this.state.yawOffset = Math.round(yawOffset * 1000) / 1000;

    // ── 事件判定（仅在直播中发射；依赖基线的判定须等校准完成，避免默认基线误报） ──
    const gazeOff = g.gazeOnCamera < GAZE_OFF;
    const lookingAway = this.calibrated
      ? yawOffset > YAW_DELTA || (gazeOff && yawOffset > YAW_DELTA * 0.6)
      : false;
    this.hold('headDown', (this.calibrated && pitchOffset > PITCH_DOWN_DELTA) || g.pitchRatio > PITCH_ABS_LIMIT, wall);
    this.hold('headTilt', Math.abs(g.rollDeg) > ROLL_TILT_DEG, wall);
    this.hold('lookingAway', lookingAway, wall);
    this.hold('smileGood', this.state.smile > SMILE_SCORE, wall);

    this.emitState();
  }

  /** 持续性去抖 + 冷却后发射事件 */
  private hold(kind: FaceEventKind, ok: boolean, wall: number): void {
    const t = this.holds[kind];
    if (!ok) {
      t.since = null;
      return;
    }
    if (t.since === null) t.since = wall;
    if (
      this.armed &&
      wall - t.since >= HOLD[kind] &&
      wall - t.lastEmit >= COOLDOWN[kind]
    ) {
      t.lastEmit = wall;
      t.since = null;
      this.onEvent?.({ kind, atMs: wall });
    }
  }

  /** blendshapes 提取微笑程度（mouthSmileLeft/Right 均值） */
  private extractSmile(res: FaceLandmarkerResult): number {
    const cats = res.faceBlendshapes?.[0]?.categories;
    if (!cats) return 0;
    let l = 0;
    let r = 0;
    for (const c of cats) {
      if (c.categoryName === 'mouthSmileLeft') l = c.score;
      else if (c.categoryName === 'mouthSmileRight') r = c.score;
    }
    return Math.round(((l + r) / 2) * 100) / 100;
  }

  private lastStateEmit = 0;
  private emitState(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastStateEmit < STATE_EMIT_MS) return;
    this.lastStateEmit = now;
    this.onState?.({ ...this.state });
  }

  getState(): FaceState {
    return { ...this.state };
  }

  /** 释放 WASM 资源（页面卸载时调用） */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    try {
      this.landmarker?.close();
    } catch {
      // 已释放
    }
    this.landmarker = null;
    this.video = null;
    this.state.engine = 'off';
  }
}

// ── 几何提取 ──

/**
 * landmark 几何姿态（图像坐标系，非镜像帧）：
 * - pitchRatio：鼻尖(1) 在 额头顶(10)→下巴(152) 纵向线段上的位置占比，低头时增大
 * - yawRatio：鼻尖(1) 在 左脸颊(234)→右脸颊(454) 横向线段上的位置占比，正脸≈0.5
 * - rollDeg：左右眼外角(33/263) 连线与水平线夹角
 * - gazeOnCamera：虹膜中心(468/473) 在眼眶内的居中程度（水平 + 垂直综合，1=直视镜头）
 */
function extractGeometry(lms: NormalizedLandmark[]): FaceGeometry {
  const forehead = lms[10];
  const nose = lms[1];
  const chin = lms[152];
  const cheekL = lms[234];
  const cheekR = lms[454];
  const eyeOuterL = lms[263];
  const eyeOuterR = lms[33];

  const vertSpan = chin.y - forehead.y;
  const horizSpan = cheekR.x - cheekL.x;
  const pitchRatio = vertSpan > 1e-6 ? (nose.y - forehead.y) / vertSpan : 0.58;
  const yawRatio = Math.abs(horizSpan) > 1e-6 ? (nose.x - cheekL.x) / horizSpan : 0.5;
  const rollDeg =
    (Math.atan2(eyeOuterL.y - eyeOuterR.y, eyeOuterL.x - eyeOuterR.x) * 180) / Math.PI;

  // 虹膜注视估算（468=右虹膜中心，473=左虹膜中心；不足 478 点时退化为 1）
  let gaze = 1;
  const irisR = lms[468];
  const irisL = lms[473];
  if (irisR && irisL) {
    // 右眼：外角 33 → 内角 133；左眼：内角 362 → 外角 263
    const hR = ratio(irisR.x, lms[33].x, lms[133].x);
    const hL = ratio(irisL.x, lms[362].x, lms[263].x);
    // 垂直：右眼上睑 159 下睑 145；左眼上睑 386 下睑 374
    const vR = ratio(irisR.y, lms[159].y, lms[145].y);
    const vL = ratio(irisL.y, lms[386].y, lms[374].y);
    const dev = Math.max(
      Math.abs(hR - 0.5), Math.abs(hL - 0.5),
      Math.abs(vR - 0.5) * 0.85, Math.abs(vL - 0.5) * 0.85,
    );
    gaze = Math.min(1, Math.max(0, 1 - dev / 0.32));
  }

  return {
    pitchRatio,
    yawRatio,
    rollDeg: Math.round(rollDeg * 10) / 10,
    gazeOnCamera: Math.round(gaze * 100) / 100,
  };
}

/** 虹膜在眼眶参考线段上的归一化位置（防除零） */
function ratio(v: number, a: number, b: number): number {
  return Math.abs(b - a) > 1e-6 ? (v - a) / (b - a) : 0.5;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
