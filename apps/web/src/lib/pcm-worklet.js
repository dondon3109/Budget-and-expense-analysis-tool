/* global sampleRate */
// Emits 16 kHz Int16 PCM regardless of the context rate: the worker labels every
// chunk as 16 kHz, so a device-rate context (Firefox) is averaged down here.
const TARGET_RATE = 16000;

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.sum = 0;
    this.count = 0;
    this.phase = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const floats = input[0];
    const out = [];
    for (let i = 0; i < floats.length; i++) {
      this.sum += floats[i];
      this.count += 1;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        out.push(this.sum / this.count);
        this.sum = 0;
        this.count = 0;
      }
    }
    if (out.length === 0) return true;
    const pcm16 = new Int16Array(out.length);
    for (let i = 0; i < out.length; i++) {
      const s = Math.max(-1, Math.min(1, out[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    // Transfer the buffer to avoid copy
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
