// Tiny WebAudio synth for UI feedback (no audio files needed).
(function () {
  const CP = window.CP;
  let ac = null;
  const A = (CP.audio = { muted: localStorage.getItem("cei-muted") === "1" });

  function ctx() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, dur, type, vol, when, slide) {
    if (A.muted) return;
    const c = ctx();
    const t0 = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol) {
    if (A.muted) return;
    const c = ctx();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 900;
    s.buffer = buf; g.gain.value = vol || 0.2;
    s.connect(f).connect(g).connect(c.destination);
    s.start();
  }
  A.place = (good) => {
    tone(good ? 520 : 300, 0.12, "triangle", 0.12);
    tone(good ? 780 : 240, 0.16, "triangle", 0.1, 0.08);
  };
  A.coin = () => { tone(990, 0.08, "square", 0.05); tone(1320, 0.15, "square", 0.05, 0.07); };
  A.destroy = () => { noise(0.45, 0.25); tone(120, 0.4, "sawtooth", 0.06, 0, 50); };
  A.click = () => tone(660, 0.05, "sine", 0.06);
  A.error = () => { tone(200, 0.15, "square", 0.06); tone(150, 0.2, "square", 0.06, 0.1); };
  A.tree = () => tone(880 + Math.random() * 200, 0.07, "sine", 0.05);
  A.fanfare = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "triangle", 0.12, i * 0.11));
  A.whoosh = () => { if (!A.muted) tone(80, 2.5, "sine", 0.08, 0, 400); };
  A.toggle = () => {
    A.muted = !A.muted;
    localStorage.setItem("cei-muted", A.muted ? "1" : "0");
    return A.muted;
  };
})();
