/**
 * MetricsEngine：八维直播能力指标的滑动评分引擎
 * - 每个维度维护一个 0-100 的分数，初始 75
 * - AI 分析结果（vision/speech）驱动分数上下浮动
 * - 正向事件缓步抬升，问题事件快速拉低
 * - 输出 overall 综合分，供实时仪表盘与复盘使用
 */

import type { MetricKey, VisionResult, SpeechResult } from './types';
import { METRIC_KEYS } from './types';

const INIT_SCORE = 75;

export interface MetricsSnapshot {
  metrics: Record<MetricKey, number>;
  overall: number;
}

export class MetricsEngine {
  private scores: Record<MetricKey, number>;
  /** 各维度最近一次收到信号的时间，防止短时间重复惩罚 */
  private lastSignal: Partial<Record<MetricKey, number>> = {};
  /** 整场时间采样点 */
  samples: Array<{ atSec: number; overall: number }> = [];

  constructor() {
    this.scores = Object.fromEntries(
      METRIC_KEYS.map((k) => [k, INIT_SCORE])
    ) as Record<MetricKey, number>;
  }

  /** 应用视觉分析结果 */
  applyVision(v: VisionResult): void {
    const now = Date.now();
    const ok = (delta: number, key: MetricKey, cooldownMs = 6000) => {
      if (now - (this.lastSignal[key] ?? 0) < cooldownMs) return;
      this.lastSignal[key] = now;
      this.bump(key, delta);
    };
    // 镜头表现
    if (v.distance === 'ok') ok(1.2, 'cameraPresence');
    else ok(-4, 'cameraPresence');
    if (v.framePosition === 'center') ok(0.8, 'cameraPresence', 10000);
    else ok(-2.5, 'cameraPresence');
    if (v.headTilt === 'ok') ok(0.8, 'posture', 10000);
    else ok(-3, 'posture');
    if (v.movement === 'stable') ok(0.8, 'posture', 12000);
    else ok(-2.5, 'posture');
    // 表情
    if (v.smile === 'good') ok(1.5, 'expression');
    else if (v.smile === 'neutral') ok(-0.8, 'expression');
    else ok(-3.5, 'expression');
    if (v.expression === 'natural') ok(0.8, 'charisma', 10000);
    else ok(-2, 'charisma');
    if (v.energy === 'high') ok(1.2, 'charisma');
    else if (v.energy === 'low') ok(-2.5, 'charisma');
    if (v.lookingAtCamera === 'yes') ok(1.2, 'cameraPresence', 8000);
    else if (v.lookingAtCamera === 'no') ok(-3, 'cameraPresence');
  }

  /** 应用语音分析结果 */
  applySpeech(s: SpeechResult): void {
    const now = Date.now();
    const ok = (delta: number, key: MetricKey, cooldownMs = 8000) => {
      if (now - (this.lastSignal[key] ?? 0) < cooldownMs) return;
      this.lastSignal[key] = now;
      this.bump(key, delta);
    };
    if (s.speechRate === 'normal') ok(1.5, 'pacing');
    else ok(-2.5, 'pacing');
    if (s.fillerWords.length === 0) ok(1.2, 'language');
    else ok(-2.5, 'language');
    if (s.interaction === 'good') ok(2.5, 'interaction');
    else if (s.interaction === 'none') ok(-3, 'interaction');
    if (s.energy === 'high') ok(1.5, 'charisma');
    else if (s.energy === 'low') ok(-2.5, 'charisma');
    if (s.onTopic) ok(1.5, 'content');
    else ok(-3, 'content');
  }

  /** 本地事件驱动（音频引擎/流程引擎/端侧视觉引擎） */
  applyEvent(
    event:
      | 'silence' | 'resume' | 'quiet' | 'stageAdvance' | 'stageMiss'
      | 'headDown' | 'headTilt' | 'lookingAway' | 'noFace' | 'smileGood'
  ): void {
    switch (event) {
      case 'silence':
        this.bump('pacing', -2.5);
        this.bump('charisma', -1.5);
        break;
      case 'resume':
        this.bump('pacing', 1);
        break;
      case 'quiet':
        this.bump('language', -2);
        break;
      case 'stageAdvance':
        this.bump('content', 2);
        break;
      case 'stageMiss':
        this.bump('content', -3);
        break;
      // ── 端侧视觉事件（即时层） ──
      case 'headDown':
        this.bump('posture', -2.5);
        this.bump('cameraPresence', -1.5);
        break;
      case 'headTilt':
        this.bump('posture', -2);
        break;
      case 'lookingAway':
        this.bump('cameraPresence', -2.5);
        this.bump('interaction', -1);
        break;
      case 'noFace':
        this.bump('cameraPresence', -4);
        this.bump('charisma', -2);
        break;
      case 'smileGood':
        this.bump('expression', 2);
        this.bump('charisma', 1);
        break;
    }
  }

  /** 录制时长越长，内容完整度基础分缓慢上升（持续讲内容） */
  tick(elapsedSec: number): void {
    if (elapsedSec % 15 === 0) this.bump('content', 0.5);
  }

  private bump(key: MetricKey, delta: number): void {
    this.scores[key] = Math.min(100, Math.max(0, this.scores[key] + delta));
  }

  snapshot(): MetricsSnapshot {
    const vals = METRIC_KEYS.map((k) => this.scores[k]);
    // overall 按维度权重：镜头/语言 1.2，内容 1.3，表情/互动/魅力 1.1，其余 1
    const weights: Record<MetricKey, number> = {
      cameraPresence: 1.2,
      expression: 1.1,
      posture: 1,
      language: 1.2,
      pacing: 1,
      content: 1.3,
      interaction: 1.1,
      charisma: 1.1,
    };
    let sum = 0;
    let wsum = 0;
    METRIC_KEYS.forEach((k) => {
      sum += this.scores[k] * weights[k];
      wsum += weights[k];
    });
    const overall = Math.round((sum / wsum) * 10) / 10;
    return {
      metrics: { ...this.scores },
      overall: Math.round(overall),
    };
  }

  recordSample(atSec: number): void {
    const s = this.snapshot();
    this.samples.push({ atSec, overall: s.overall });
    if (this.samples.length > 240) this.samples.shift();
  }
}
