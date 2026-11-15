// Tiny WebAudio synth: UI sounds plus light, cheerful background music (no audio files needed).
// Everything goes through one master gain, so the mute toggle and the volume slider cover all of it.
(function () {
  const CP = window.CP;
  let ac = null, master = null, musicBus = null;
  const store = (k, d) => { const v = localStorage.getItem(k); return v === null ? d : v; };
  const A = (CP.audio = {
    muted: store("cei-muted", "0") === "1",
    volume: +store("cei-volume", "0.8"),
    music: store("cei-music", "1") === "1",
  });

  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.connect(ac.destination);
      musicBus = ac.createGain();
      musicBus.gain.value = 0.32;
      musicBus.connect(master);
      applyGain();
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function applyGain() {
    if (master) master.gain.setTargetAtTime(A.muted ? 0 : A.volume, ac.currentTime, 0.05);
  }
  function tone(freq, dur, type, vol, when, slide, bus) {
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
    o.connect(g).connect(bus || master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (A.muted) return;
    const c = ctx();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = freq || 900;
    s.buffer = buf; g.gain.value = vol || 0.2;
    s.connect(f).connect(g).connect(master);
    s.start();
  }
  A.place = (good) => {
    tone(good ? 520 : 300, 0.12, "triangle", 0.12);
    tone(good ? 780 : 240, 0.16, "triangle", 0.1, 0.08);
  };
  A.coin = () => { tone(990, 0.08, "square", 0.05); tone(1320, 0.15, "square", 0.05, 0.07); };
  A.grant = () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, "square", 0.045, i * 0.06));
  A.destroy = () => { noise(0.45, 0.25); tone(120, 0.4, "sawtooth", 0.06, 0, 50); };
  A.click = () => tone(660, 0.05, "sine", 0.06);
  A.error = () => { tone(200, 0.15, "square", 0.06); tone(150, 0.2, "square", 0.06, 0.1); };
  A.fanfare = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "triangle", 0.12, i * 0.11));
  A.whoosh = () => tone(80, 2.5, "sine", 0.08, 0, 400);
  A.radio = () => { tone(1250, 0.07, "sine", 0.05); tone(940, 0.07, "sine", 0.05, 0.09); tone(1250, 0.12, "sine", 0.05, 0.18); };
  A.blip = () => tone(1500 + Math.random() * 200, 0.02, "square", 0.012);
  A.alarm = () => { for (let i = 0; i < 3; i++) { tone(880, 0.14, "sawtooth", 0.05, i * 0.3); tone(660, 0.14, "sawtooth", 0.05, i * 0.3 + 0.15); } noise(0.8, 0.12, 400); };
  A.protest = () => { for (let i = 0; i < 5; i++) tone(180 + Math.random() * 60, 0.25, "sawtooth", 0.035, i * 0.09); };
  A.undo = () => { tone(700, 0.08, "triangle", 0.08); tone(470, 0.12, "triangle", 0.08, 0.07); };

  // ---------- background music: a gentle major-key loop (bass, chords, a wandering melody) ----------
  const STEP = 0.25; // seconds per 8th note (120 bpm)
  const CHORDS = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]]; // C  Am  F  G
  const SCALE = [72, 74, 76, 79, 81, 84]; // C major pentatonic
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let timer = null, nextT = 0, step = 0, mel = 2;
  const mrand = CP.rng(77);
  function schedule() {
    if (!ac) return;
    while (nextT < ac.currentTime + 0.3) {
      const bar = Math.floor(step / 8) % CHORDS.length, beat = step % 8;
      const ch = CHORDS[bar];
      const when = nextT - ac.currentTime;
      if (beat === 0 || beat === 4) tone(mtof(ch[0] - 24), 0.45, "triangle", 0.16, when, null, musicBus);
      if (beat % 2 === 0) tone(mtof(ch[(beat / 2) % 3]), 0.3, "sine", 0.06, when, null, musicBus);
      if (mrand() < (beat % 2 ? 0.3 : 0.62)) {
        mel = CP.clamp(mel + Math.floor(mrand() * 3) - 1, 0, SCALE.length - 1);
        tone(mtof(SCALE[mel]), 0.22, "triangle", 0.05, when, null, musicBus);
      }
      nextT += STEP;
      step++;
    }
  }
  A.startMusic = function () {
    if (!A.music || A.muted || timer) return;
    ctx();
    nextT = ac.currentTime + 0.1;
    timer = setInterval(schedule, 100);
  };
  A.stopMusic = function () {
    clearInterval(timer);
    timer = null;
  };

  A.toggle = () => {
    A.muted = !A.muted;
    localStorage.setItem("cei-muted", A.muted ? "1" : "0");
    if (ac) applyGain();
    if (A.muted) A.stopMusic();
    else if (A.wantMusic) A.startMusic();
    return A.muted;
  };
  A.setVolume = (v) => {
    A.volume = v;
    localStorage.setItem("cei-volume", String(v));
    if (ac) applyGain();
  };
  A.setMusic = (on) => {
    A.music = on;
    localStorage.setItem("cei-music", on ? "1" : "0");
    if (on && A.wantMusic) A.startMusic();
    else A.stopMusic();
  };
  // called when play starts: music runs from here on (if enabled)
  A.beginMusic = () => { A.wantMusic = true; A.startMusic(); };
})();
