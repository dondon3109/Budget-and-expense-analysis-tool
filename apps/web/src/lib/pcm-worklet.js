class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const floats = input[0];
      const pcm16 = new Int16Array(floats.length);
      for (let i = 0; i < floats.length; i++) {
        const s = Math.max(-1, Math.min(1, floats[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Transfer the buffer to avoid copy
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
