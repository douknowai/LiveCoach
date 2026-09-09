/**
 * WavRecorder：浏览器端 WAV 音频分段录制器
 * 优先使用 AudioWorkletNode（音频线程采集，主线程零卡顿）收集麦克风 PCM；
 * 不支持 AudioWorklet 的环境自动降级为 ScriptProcessorNode。
 * 降采样至 16kHz，以 WAV(16bit PCM) base64 形式按段导出，供 ASR 接口识别。
 * （Chrome 的 MediaRecorder 只能录 webm，而 ASR 服务支持 WAV/MP3/OGG OPUS/M4A，
 *   故自行编码 WAV 保证兼容性。）
 */

const TARGET_RATE = 16000;
const WORKLET_URL = '/worklets/pcm-recorder-worklet.js';

export class WavRecorder {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private fallbackProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private totalSamples = 0;
  private started = false;

  start(stream: MediaStream): void {
    this.stop();
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.silentGain = this.ctx.createGain();
    this.silentGain.gain.value = 0; // 静音输出，避免回声
    this.started = true;

    if (this.ctx.audioWorklet) {
      void this.startWorklet();
    } else {
      this.startFallback();
    }
  }

  isStarted(): boolean {
    return this.started;
  }

  /** 导出并清空自上次调用以来累积的音频。时长不足 minSec 时返回 null（保留累积）。 */
  getSegment(minSec = 4): { base64: string; durationMs: number } | null {
    if (this.totalSamples < TARGET_RATE * minSec) return null;
    const merged = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const durationMs = Math.round((this.totalSamples / TARGET_RATE) * 1000);
    const wav = encodeWav(merged, TARGET_RATE);
    const base64 = bytesToBase64(wav);
    this.chunks = [];
    this.totalSamples = 0;
    return { base64, durationMs };
  }

  stop(): void {
    try {
      if (this.worklet) {
        this.worklet.port.onmessage = null;
        this.worklet.disconnect();
      }
      this.fallbackProcessor?.disconnect();
      this.source?.disconnect();
      this.silentGain?.disconnect();
      this.ctx?.close();
    } catch {
      /* noop */
    }
    this.worklet = null;
    this.fallbackProcessor = null;
    this.source = null;
    this.silentGain = null;
    this.ctx = null;
    this.chunks = [];
    this.totalSamples = 0;
    this.started = false;
  }

  /** AudioWorklet 主路径：音频线程采集，回调中做降采样累积 */
  private async startWorklet(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !ctx.audioWorklet) {
      this.startFallback();
      return;
    }
    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      // addModule 期间可能已 stop() 或重新 start()，避免复活旧节点
      if (this.ctx !== ctx || !this.started) return;
      const node = new AudioWorkletNode(ctx, 'pcm-recorder');
      node.port.onmessage = (e: MessageEvent) => {
        if (!this.started) return;
        const input = e.data as Float32Array;
        this.accumulate(input, ctx.sampleRate);
      };
      this.source?.connect(node);
      node.connect(this.silentGain as GainNode);
      this.worklet = node;
    } catch {
      // worklet 加载失败（如资源 404），回退 ScriptProcessor
      this.startFallback();
    }
  }

  /** 降级路径：ScriptProcessorNode（已废弃，仅兜底旧环境） */
  private startFallback(): void {
    const ctx = this.ctx;
    if (!ctx || this.fallbackProcessor) return;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!this.started) return;
      this.accumulate(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    };
    this.source?.connect(processor);
    processor.connect(this.silentGain as GainNode);
    this.fallbackProcessor = processor;
  }

  /** 降采样至 16kHz（块平均滤波）并累积，导出时由 getSegment 编码 WAV */
  private accumulate(input: Float32Array, srcRate: number): void {
    const ratio = srcRate / TARGET_RATE;
    const outLen = Math.floor(input.length / ratio);
    if (outLen <= 0) return;
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const startIdx = Math.floor(i * ratio);
      const endIdx = Math.floor((i + 1) * ratio);
      let sum = 0;
      let n = 0;
      for (let j = startIdx; j < endIdx && j < input.length; j++) {
        sum += input[j];
        n++;
      }
      out[i] = n > 0 ? sum / n : 0;
    }
    this.chunks.push(out);
    this.totalSamples += outLen;
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
