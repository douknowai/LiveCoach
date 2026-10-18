/**
 * MetricsEngine：八维直播能力指标的评分引擎
 *
 * 公正性设计（评分原则）：
 * 1. 证据先行：维度只有收到真实评估信号才标记 observed，
 *    未观测维度不冒充分数、不参与 overall 聚合（UI 显示「待观测」）；
 * 2. 双层信号：LLM 直接给出的 0-100 分作为锚（EMA 平滑融合），
 *    离散信号（good/poor 等）做小幅修正——罚快、奖稳、有据可恢复；
 * 3. 无效信号不评分：静音降级 / AI 分析失败的兜底数据由调用方拦截，
 *    不进入引擎，杜绝「不说话反而涨分」；
 * 4. 时长公平：终评 finalSnapshot 用整场每秒时间积分平均，
 *    结束前突击表现无法拉高总分；挂机不说话不会因时间流逝涨内容分；
 * 5. 口头禅按密度惩罚（次数/字数），不再「1 个和 8 个同罪」。
 */

import type { MetricKey, VisionResult, SpeechResult } from './types';
import { METRIC_KEYS } from './types';

const INIT_SCORE = 75;
/** EMA 锚定系数：视觉 6s/次较密，语音 22s/次较稀（响应需更快） */
const EMA_ALPHA_VISION = 0.35;
const EMA_ALPHA_SPEECH = 0.5;
/** overall 维度权重：内容 1.3 > 镜头/语言 1.2 > 表情/互动/感染力 1.1 > 其余 1（复盘校准分复用同一权重） */
export const WEIGHTS: Record<MetricKey, number> = {
  cameraPresence: 1.2,
  expression: 1.1,
  posture: 1,
  language: 1.2,
  pacing: 1,
  content: 1.3,
  interaction: 1.1,
  charisma: 1.1,
};

export interface MetricsSnapshot {
  metrics: Record<MetricKey, number>;
  /** 各维度本场是否收到过真实评估信号 */
  observed: Record<MetricKey, boolean>;
  /** 已观测维度占比 0-1（0 = 观测启动中） */
  coverage: number;
  overall: number;
}

/** 开场占位快照：全部未观测，overall 为占位值（UI 用 coverage 识别） */
export function createInitialSnapshot(): MetricsSnapshot {
  return {
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, INIT_SCORE])) as Record<MetricKey, number>,
    observed: Object.fromEntries(METRIC_KEYS.map((k) => [k, false])) as Record<MetricKey, boolean>,
    coverage: 0,
    overall: INIT_SCORE,
  };
}

export class MetricsEngine {
  private scores: Record<MetricKey, number>;
  /** 各维度证据计数（收到的真实信号次数） */
  private evidence: Record<MetricKey, number>;
  /** 信号级冷却表（key = 维度:信号，避免同维度多信号互相挤占冷却） */
  private lastSignal: Record<string, number> = {};
  /** 整场时间积分：每秒累积各维度分数，用于时间平均终评 */
  private sumScores: Record<MetricKey, number>;
  private weightedSec = 0;
  /** 整场综合分采样点（评分曲线用） */
  samples: Array<{ atSec: number; overall: number }> = [];

  constructor() {
    this.scores = Object.fromEntries(METRIC_KEYS.map((k) => [k, INIT_SCORE])) as Record<MetricKey, number>;
    this.evidence = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Record<MetricKey, number>;
    this.sumScores = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Record<MetricKey, number>;
  }

  private bump(key: MetricKey, delta: number): void {
    this.scores[key] = Math.min(100, Math.max(0, this.scores[key] + delta));
  }

  private markEvidence(key: MetricKey): void {
    this.evidence[key] += 1;
  }

  /** 信号级冷却：返回 true 表示仍在冷却中（本次忽略） */
  private cooled(key: MetricKey, signal: string, cooldownMs: number, now: number): boolean {
    const k = `${key}:${signal}`;
    if (now - (this.lastSignal[k] ?? 0) < cooldownMs) return true;
    this.lastSignal[k] = now;
    return false;
  }

  /** EMA 锚定：向 LLM 直接评分移动一步（无有效分时跳过，不产生证据） */
  private anchor(key: MetricKey, llmScore: unknown, alpha: number): void {
    if (typeof llmScore !== 'number' || llmScore < 0 || llmScore > 100) return;
    this.markEvidence(key);
    this.scores[key] = this.scores[key] + alpha * (Math.round(llmScore) - this.scores[key]);
  }

  /** 离散信号修正（带证据标记与信号级冷却） */
  private fix(
    delta: number,
    key: MetricKey,
    signal: string,
    cooldownMs: number,
    now: number
  ): void {
    if (this.cooled(key, signal, cooldownMs, now)) return;
    this.markEvidence(key);
    this.bump(key, delta);
  }

  /** 应用视觉分析结果（6s/次）：LLM 分锚定 + 离散行为修正 */
  applyVision(v: VisionResult): void {
    const now = Date.now();
    const fix = (delta: number, key: MetricKey, signal: string, cooldownMs = 12000) =>
      this.fix(delta, key, signal, cooldownMs, now);

    // ── LLM 直接评分锚定（0-100，综合全帧判断） ──
    this.anchor('cameraPresence', v.scores?.cameraPresence, EMA_ALPHA_VISION);
    this.anchor('expression', v.scores?.expression, EMA_ALPHA_VISION);
    this.anchor('posture', v.scores?.posture, EMA_ALPHA_VISION);

    // ── 离散行为修正（罚快奖稳） ──
    // 镜头表现：距离/注视/构图
    if (v.distance === 'ok') fix(0.6, 'cameraPresence', 'distance');
    else fix(-2, 'cameraPresence', 'distance');
    if (v.lookingAtCamera === 'yes') fix(0.6, 'cameraPresence', 'gaze');
    else if (v.lookingAtCamera === 'no') fix(-1.5, 'cameraPresence', 'gaze');
    if (v.framePosition === 'center') fix(0.4, 'cameraPresence', 'frame');
    else fix(-1.2, 'cameraPresence', 'frame');
    // 肢体表现：低头/歪头/体态/晃动
    if (v.headDown) fix(-1.5, 'posture', 'headDown');
    if (v.headTilt === 'ok') fix(0.4, 'posture', 'tilt');
    else if (v.headTilt === 'obvious') fix(-1.5, 'posture', 'tilt');
    else fix(-0.8, 'posture', 'tilt');
    if (v.bodyPosture === 'upright') fix(0.4, 'posture', 'body');
    else fix(-1.2, 'posture', 'body');
    if (v.movement === 'stable') fix(0.4, 'posture', 'move');
    else fix(-1.2, 'posture', 'move');
    // 表情管理：微笑 + 表情自然度（表情状态归表情维度，而非感染力）
    if (v.smile === 'good') fix(0.7, 'expression', 'smile');
    else if (v.smile === 'neutral') fix(-0.4, 'expression', 'smile');
    else fix(-1.8, 'expression', 'smile');
    if (v.expression === 'natural') fix(0.4, 'expression', 'expr');
    else if (v.expression === 'stiff') fix(-1, 'expression', 'expr');
    else fix(-1.2, 'expression', 'expr');
    // 感染力：视觉能量（视觉只提供部分证据，语音链路为主）
    if (v.energy === 'high') fix(0.6, 'charisma', 'vEnergy');
    else if (v.energy === 'low') fix(-1.2, 'charisma', 'vEnergy');
  }

  /** 应用语音分析结果（22s/次，要求有真实转写内容；降级数据由调用方拦截） */
  applySpeech(s: SpeechResult): void {
    const now = Date.now();
    const fix = (delta: number, key: MetricKey, signal: string, cooldownMs = 15000) =>
      this.fix(delta, key, signal, cooldownMs, now);

    // ── LLM 直接评分锚定 ──
    this.anchor('language', s.scores?.language, EMA_ALPHA_SPEECH);
    this.anchor('interaction', s.scores?.interaction, EMA_ALPHA_SPEECH);
    this.anchor('content', s.scores?.content, EMA_ALPHA_SPEECH);

    // ── 离散行为修正 ──
    // 直播节奏：语速
    if (s.speechRate === 'normal') fix(0.8, 'pacing', 'rate');
    else fix(-1.5, 'pacing', 'rate');
    // 语言表达：口头禅密度（次数/字数；1 次口头禅不应与满篇口头禅同罪）
    const chars = Math.max(s.transcript.length, 1);
    const fillerCount = s.fillerWords.reduce(
      (a, f) => a + (typeof f?.count === 'number' && f.count > 0 ? f.count : 1),
      0
    );
    const fillerRatio = fillerCount / chars;
    if (fillerRatio === 0 && chars >= 30) fix(0.6, 'language', 'filler');
    else if (fillerRatio > 0.05) fix(-1.5, 'language', 'filler');
    else if (fillerRatio > 0.02) fix(-0.8, 'language', 'filler');
    // 互动能力
    if (s.interaction === 'good') fix(0.5, 'interaction', 'inter');
    else if (s.interaction === 'none') fix(-1, 'interaction', 'inter');
    // 感染力：语音能量（主导证据源）
    if (s.energy === 'high') fix(0.8, 'charisma', 'sEnergy');
    else if (s.energy === 'low') fix(-1.2, 'charisma', 'sEnergy');
    // 内容：跑题
    if (!s.onTopic) fix(-1.5, 'content', 'topic');
  }

  /** 本地事件驱动（音频引擎/流程引擎/端侧视觉引擎，均已自带节流） */
  applyEvent(
    event:
      | 'silence' | 'resume' | 'quiet' | 'stageAdvance' | 'stageMiss'
      | 'headDown' | 'headTilt' | 'lookingAway' | 'noFace' | 'smileGood'
  ): void {
    switch (event) {
      case 'silence':
        this.markEvidence('pacing');
        this.markEvidence('charisma');
        this.bump('pacing', -2.5);
        this.bump('charisma', -0.5);
        break;
      case 'resume':
        this.markEvidence('pacing');
        this.bump('pacing', 1);
        break;
      case 'quiet':
        this.markEvidence('language');
        this.bump('language', -2);
        break;
      case 'stageAdvance':
        this.markEvidence('content');
        this.bump('content', 2);
        break;
      case 'stageMiss':
        this.markEvidence('content');
        this.bump('content', -3);
        break;
      // ── 端侧视觉事件（即时层） ──
      case 'headDown':
        this.markEvidence('posture');
        this.markEvidence('cameraPresence');
        this.bump('posture', -2.5);
        this.bump('cameraPresence', -1.5);
        break;
      case 'headTilt':
        this.markEvidence('posture');
        this.bump('posture', -2);
        break;
      // 视线离镜属镜头表现，不再错扣互动能力
      case 'lookingAway':
        this.markEvidence('cameraPresence');
        this.bump('cameraPresence', -2.5);
        break;
      // 人已离镜，谈不上感染力，只罚镜头表现
      case 'noFace':
        this.markEvidence('cameraPresence');
        this.bump('cameraPresence', -4);
        break;
      case 'smileGood':
        this.markEvidence('expression');
        this.markEvidence('charisma');
        this.bump('expression', 2);
        this.bump('charisma', 1);
        break;
    }
  }

  /**
   * 每秒调用：整场时间积分（终评用）+ 内容分规则。
   * 内容分只随「真实讲话」缓慢增长（最近窗口说话占比 ≥30%），
   * 挂机/静场不因时间流逝涨分。
   */
  tick(elapsedSec: number, speakingRatio = 0): void {
    METRIC_KEYS.forEach((k) => {
      this.sumScores[k] += this.scores[k];
    });
    this.weightedSec += 1;
    if (elapsedSec > 0 && elapsedSec % 15 === 0 && speakingRatio >= 0.3) {
      this.markEvidence('content');
      this.bump('content', 0.3);
    }
  }

  /** 聚合：overall 只加权聚合已观测维度；尚无任何观测时返回占位分 */
  private aggregate(scores: Record<MetricKey, number>): MetricsSnapshot {
    const observed = Object.fromEntries(
      METRIC_KEYS.map((k) => [k, this.evidence[k] > 0])
    ) as Record<MetricKey, boolean>;
    const observedKeys = METRIC_KEYS.filter((k) => observed[k]);
    let sum = 0;
    let wsum = 0;
    for (const k of observedKeys) {
      sum += scores[k] * WEIGHTS[k];
      wsum += WEIGHTS[k];
    }
    const overall =
      observedKeys.length === 0
        ? INIT_SCORE
        : Math.round(sum / wsum);
    return {
      metrics: { ...scores },
      observed,
      coverage: observedKeys.length / METRIC_KEYS.length,
      overall,
    };
  }

  /** 实时快照：当前瞬时分数（实时仪表盘用） */
  snapshot(): MetricsSnapshot {
    return this.aggregate(this.scores);
  }

  /**
   * 终评快照：整场每秒时间积分平均。
   * 每一秒的表现在总分中权重相同，结束前突击表现无法拉高总分。
   */
  finalSnapshot(): MetricsSnapshot {
    if (this.weightedSec === 0) return this.snapshot();
    const avg = Object.fromEntries(
      METRIC_KEYS.map((k) => [k, Math.round(this.sumScores[k] / this.weightedSec)])
    ) as Record<MetricKey, number>;
    return this.aggregate(avg);
  }

  recordSample(atSec: number): void {
    const s = this.snapshot();
    this.samples.push({ atSec, overall: s.overall });
    if (this.samples.length > 240) this.samples.shift();
  }
}
