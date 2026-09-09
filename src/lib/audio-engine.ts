/**
 * AudioEngine：基于 Web Audio API 的实时音频分析引擎
 * - 实时音量（RMS）监测
 * - 连续静音检测（长时间停顿/冷场）
 * - 说话占比统计（供语速/冷场判断）
 * 全部在浏览器本地计算，零延迟零成本。
 */

import type { AudioState } from './types';

export class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId = 0;
  private buffer: Float32Array<ArrayBuffer> | null = null;

  /** 每秒 10 次采样的音量历史（约最近 30 秒） */
  private volumeHistory: Array<{ t: number; v: number }> = [];
  /** 连续低于阈值的起始时间 */
  private silenceStart: number | null = null;

  private state: AudioState = {
    avgVolume: 0,
    level: 0,
    silenceSec: 0,
    speakingRatio: 0,
  };

  /** 音量阈值，低于此视为静音 */
  private static SILENCE_THRESHOLD = 0.022;

  start(stream: MediaStream): void {
    this.stop();
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    this.audioCtx = new Ctx();
    this.source = this.audioCtx.createMediaStreamSource(stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.source.connect(this.analyser);
    this.buffer = new Float32Array(
      new ArrayBuffer(this.analyser.fftSize * 4)
    );
    const loop = () => {
      this.sample();
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  /** 每帧采样一次（节流到 10Hz） */
  private lastSample = 0;
  private sample(): void {
    if (!this.analyser || !this.buffer) return;
    const now = performance.now();
    if (now - this.lastSample < 100) return;
    this.lastSample = now;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] ** 2;
    const rms = Math.sqrt(sum / this.buffer.length);
    const v = Math.min(1, rms * 6); // 归一化放大
    const t = Date.now();
    this.volumeHistory.push({ t, v });
    // 只保留最近 30 秒
    while (this.volumeHistory.length > 0 && t - this.volumeHistory[0].t > 30000) {
      this.volumeHistory.shift();
    }
    // 静音检测
    if (v < AudioEngine.SILENCE_THRESHOLD) {
      if (this.silenceStart === null) this.silenceStart = t;
    } else {
      this.silenceStart = null;
    }
    this.state.level = v;
  }

  /** 获取当前音频状态快照（每 250ms 内缓存） */
  private lastSnapshot = 0;
  getState(): AudioState {
    const now = Date.now();
    if (now - this.lastSnapshot < 250) return this.state;
    this.lastSnapshot = now;
    const recent = this.volumeHistory.filter(
      (s) => now - s.t < 30000
    );
    if (recent.length > 0) {
      const avg = recent.reduce((a, s) => a + s.v, 0) / recent.length;
      const speaking = recent.filter((s) => s.v >= AudioEngine.SILENCE_THRESHOLD).length;
      this.state.avgVolume = Math.round(avg * 1000) / 1000;
      this.state.speakingRatio = Math.round((speaking / recent.length) * 100) / 100;
    }
    this.state.silenceSec =
      this.silenceStart !== null
        ? Math.floor((now - this.silenceStart) / 1000)
        : 0;
    return this.state;
  }

  reset(): void {
    this.volumeHistory = [];
    this.silenceStart = null;
    this.state = {
      avgVolume: 0,
      level: 0,
      silenceSec: 0,
      speakingRatio: 0,
    };
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    try {
      this.source?.disconnect();
      this.audioCtx?.close();
    } catch {
      /* noop */
    }
    this.source = null;
    this.analyser = null;
    this.audioCtx = null;
    this.reset();
  }
}
