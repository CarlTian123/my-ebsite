/* PHI:NEON — audio manager
 * HTMLAudioElement for the soundtrack + tiny WebAudio synth for hit SFX.
 */
(function () {
  "use strict";

  const TRACK_SRC = {
    "neon-pulse": "audio/neon-pulse.m4a",
    frostlight: "audio/frostlight.m4a",
    "ion-rush": "audio/ion-rush.m4a",
    "velvet-static": "audio/velvet-static.m4a",
    "glass-tide": "audio/glass-tide.m4a",
  };

  const A = {
    ctx: null,
    music: new Audio(),
    master: null,
    sfxGain: null,
    volume: 0.8,
    sfxLevel: 0.7,
    ready: false,
  };
  A.music.preload = "auto";
  A.music.crossOrigin = "anonymous";

  function init() {
    if (A.ctx) {
      if (A.ctx.state === "suspended") A.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = 0.9;
    A.master.connect(A.ctx.destination);
    A.sfxGain = A.ctx.createGain();
    A.sfxGain.gain.value = A.sfxLevel * 0.8;
    A.sfxGain.connect(A.master);
    // one short noise buffer for the transient "tick" of every hit
    const nlen = Math.max(1, Math.floor(A.ctx.sampleRate * 0.035));
    A.noiseBuf = A.ctx.createBuffer(1, nlen, A.ctx.sampleRate);
    const nd = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nlen, 2.4);
    A.ready = true;
  }

  function setVolume(v) {
    A.volume = Math.max(0, Math.min(1, v));
    A.music.volume = A.volume;
  }

  function setSfxVolume(v) {
    A.sfxLevel = Math.max(0, Math.min(1, v));
    if (A.sfxGain) A.sfxGain.gain.value = A.sfxLevel * 0.8;
  }

  function playTrack(songId) {
    A.songId = songId;
    return new Promise((resolve, reject) => {
      A.music.pause();
      A.music.src = TRACK_SRC[songId];
      A.music.currentTime = 0;
      A.music.volume = A.volume;
      const p = A.music.play();
      if (p && p.then) p.then(resolve).catch(reject);
      else resolve();
    });
  }

  function pause() { A.music.pause(); }
  function resume() { return A.music.play().catch(() => {}); }
  function stop() { A.music.pause(); A.music.currentTime = 0; }
  function seek(t) { try { A.music.currentTime = t; } catch (e) {} }
  function time() { return A.music.currentTime || 0; }
  function duration() { return A.music.duration || 90; }

  function env(gain, t0, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  // Melodic hit feedback: the pitch follows the lane so rapid hits become a
  // phrase in the song's key (A minor / D minor), with a crisp transient.
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19];
  const MAJOR_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  const ROOTS = { "neon-pulse": 220.0, frostlight: 293.66, "ion-rush": 185.0, "velvet-static": 311.13, "glass-tide": 277.18 };
  function rootFor(songId) { return ROOTS[songId] || 220.0; }
  function scaleFor(songId) { return songId === "velvet-static" ? MAJOR_SCALE : SCALE; }

  function hit(type, pan, kind, songId) {
    if (!A.ctx || A.ctx.state === "suspended") return;
    const t0 = A.ctx.currentTime;
    const p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
    const out = p || A.sfxGain;
    if (p) {
      p.pan.value = Math.max(-0.85, Math.min(0.85, (pan || 0) * 1.8));
      p.connect(A.sfxGain);
    }
    const root = rootFor(songId || A.songId);
    const sc = scaleFor(songId || A.songId);
    const ps = Math.max(-1, Math.min(1, (pan || 0) / 0.34));
    const idx = Math.max(0, Math.min(sc.length - 1, Math.round((ps + 1) / 2 * (sc.length - 1))));
    let semi = sc[idx];
    if (kind === "drag") semi += 12;
    if (kind === "tail") semi += 7;
    let freq = root * Math.pow(2, semi / 12);
    const bright = type === "perfect";
    if (bright) freq *= 2;
    else if (type === "bad") freq *= 0.5;
    else if (type === "good") freq *= 1.0;

    // body: a short pitched mallet, doubled an octave up when perfect
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * (bright ? 1.012 : 0.985), t0 + 0.09);
    const peak = bright ? 0.16 : type === "bad" ? 0.075 : 0.11;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === "tail" ? 0.16 : 0.13));
    o.connect(g).connect(out);
    o.start(t0); o.stop(t0 + 0.18);

    if (bright) {
      const o2 = A.ctx.createOscillator();
      const g2 = A.ctx.createGain();
      o2.type = "sine";
      o2.frequency.setValueAtTime(freq * 2, t0);
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(0.055, t0 + 0.002);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
      o2.connect(g2).connect(out);
      o2.start(t0); o2.stop(t0 + 0.1);
    }

    // transient click (noise) — makes the hit read even over a dense mix
    if (A.noiseBuf) {
      const ns = A.ctx.createBufferSource();
      ns.buffer = A.noiseBuf;
      const hp = A.ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 2400; hp.Q.value = 0.7;
      const ng = A.ctx.createGain();
      ng.gain.setValueAtTime(bright ? 0.075 : 0.045, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
      ns.connect(hp).connect(ng).connect(out);
      ns.start(t0); ns.stop(t0 + 0.05);
    }

    // small low thump for perfect taps, gives the hit physical weight
    if (bright && kind !== "drag" && kind !== "tail") {
      const bo = A.ctx.createOscillator();
      const bg = A.ctx.createGain();
      bo.type = "sine";
      bo.frequency.setValueAtTime(128, t0);
      bo.frequency.exponentialRampToValueAtTime(68, t0 + 0.1);
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.085, t0 + 0.004);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      bo.connect(bg).connect(out);
      bo.start(t0); bo.stop(t0 + 0.14);
    }
  }

  // short in-key arpeggio at combo milestones
  function milestone(combo, songId) {
    if (!A.ctx || A.ctx.state === "suspended") return;
    const t0 = A.ctx.currentTime;
    const root = rootFor(songId || A.songId);
    const notes = combo >= 200 ? [0, 7, 12, 19] : [0, 7, 12];
    notes.forEach((semi, i) => {
      const o = A.ctx.createOscillator();
      const g = A.ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(root * Math.pow(2, semi / 12) * 2, t0 + i * 0.055);
      const t = t0 + i * 0.055;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(A.sfxGain);
      o.start(t); o.stop(t + 0.24);
    });
  }

  window.PHINEON_AUDIO = { init, setVolume, setSfxVolume, playTrack, pause, resume, stop, seek, time, duration, hit, milestone, getMusic: () => A.music, getContext: () => A.ctx, getSfxGain: () => A.sfxGain };
})();
