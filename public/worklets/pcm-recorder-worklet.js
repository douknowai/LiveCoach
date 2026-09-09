/**
 * pcm-recorder：WavRecorder 的 AudioWorklet 采集处理器
 * 替代已废弃的 ScriptProcessorNode（UI 线程占用大、易卡顿掉帧）。
 * 在音频线程累积 PCM Float32 样本，每满 4096 帧（16kHz 目标下约 256ms 原始块）
 * 通过 postMessage（Transferable）回传主线程，由主线程统一降采样与编码。
 */
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkLen = 4096;
    this.buffer = [];
    this.filled = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this.send();
      }
    };
  }

  send() {
    if (this.filled === 0) return;
    const out = new Float32Array(this.filled);
    let offset = 0;
    for (const block of this.buffer) {
      out.set(block, offset);
      offset += block.length;
    }
    this.buffer = [];
    this.filled = 0;
    this.port.postMessage(out, [out.buffer]);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;
    this.buffer.push(new Float32Array(channel));
    this.filled += channel.length;
    if (this.filled >= this.chunkLen) {
      this.send();
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PcmRecorderProcessor);
