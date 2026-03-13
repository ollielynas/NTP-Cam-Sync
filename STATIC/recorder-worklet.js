// recorder-worklet.js
class MultiTrackRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._recording = false;
    this.port.onmessage = (e) => {
      if (e.data === "start") this._recording = true;
      if (e.data === "stop") this._recording = false;
    };
  }

  process(inputs) {
    if (!this._recording) return true;
    // inputs[0] = mic, inputs[1] = LTC
    const mic = inputs[0]?.[0];
    const ltc = inputs[1]?.[0];
    if (mic && ltc) {
      this.port.postMessage({ mic, ltc });
    }
    return true;
  }
}

registerProcessor("multitrack-recorder", MultiTrackRecorderProcessor);
