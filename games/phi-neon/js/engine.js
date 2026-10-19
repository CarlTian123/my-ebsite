/* PHI:NEON — game engine
 * Phigros-style judgement line, notes, holds, drags, flicks, effects.
 */
(function () {
  "use strict";

  const AUDIO = window.PHINEON_AUDIO;
  const CHARTS = window.PHINEON_CHARTS;

  const WIN = { perfect: 0.045, good: 0.09, bad: 0.14, miss: 0.16 };
  const KEY_LANES = { d: -0.34, f: -0.11, j: 0.11, k: 0.34 };
  const KEY_LABEL = { d: "D", f: "F", j: "J", k: "K" };
  const LANE_S = [-0.34, -0.11, 0.11, 0.34];
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function ease(u) { return u * u * (3 - 2 * u); }
  function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ */
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = 1;
      this.w = 0;
      this.h = 0;
      this.phase = "idle";
      this.song = null;
      this.chart = null;
      this.notes = [];
      this.line = [];
      this.speed = 500;
      this.halfLen = 300;
      this.laneHalf = 460;
      this.shake = 0;
      this.shakeT = 0;
      this.fx = [];
      this.stars = [];
      this.auto = false;
      this.offset = 0;
      this.hints = true;
      this.counts = { perfect: 0, good: 0, bad: 0, miss: 0 };
      this.combo = 0;
      this.maxCombo = 0;
      this.judged = 0;
      this.total = 0;
      this.score = 0;
      this.acc = 1;
      this.onFinish = null;
      this._lastHud = "";
      this._audio = AUDIO.getMusic();
      this._audio.addEventListener("ended", () => {
        if (this.phase === "playing") this.finish();
      });
      this._boundKey = this._onKeyDown.bind(this);
      this._boundKeyUp = this._onKeyUp.bind(this);
      this._boundResize = this.resize.bind(this);
      window.addEventListener("resize", this._boundResize);
      window.addEventListener("keydown", this._boundKey);
      window.addEventListener("keyup", this._boundKeyUp);
      this._bindPointer();
      this._makeStars();
      this.resize();
    }

    /* ---------------- setup ---------------- */
    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.speed = this.h * 0.64;
      this.halfLen = Math.min(this.w * 0.46, this.h * 0.56);
      this.laneHalf = this.halfLen * 1.55;
      this.noteW = clamp(Math.min(this.w, this.h) * 0.145, 52, 132);
      this.noteH = this.noteW * 0.19;
    }

    _makeStars() {
      this.stars = [];
      for (let i = 0; i < 70; i++) {
        this.stars.push({
          x: Math.random(), y: Math.random(),
          r: Math.random() * 1.6 + 0.4,
          a: Math.random() * 0.5 + 0.1,
          ph: Math.random() * TAU,
          sp: Math.random() * 0.012 + 0.004,
        });
      }
    }

    _bindPointer() {
      const c = this.canvas;
      const getS = (e) => {
        const l = this.lineAt(this.tc || 0);
        const x = e.clientX, y = e.clientY;
        const lx = l.x * this.w, ly = l.y * this.h;
        const cos = Math.cos(l.a), sin = Math.sin(l.a);
        const s = ((x - lx) * cos + (y - ly) * sin) / this.laneHalf;
        return clamp(s, -1, 1);
      };
      c.addEventListener("pointerdown", (e) => {
        if (this.phase !== "playing") return;
        e.preventDefault();
        AUDIO.init();
        if (this.auto) return;
        const s = getS(e);
        this._hitInput(s, "p" + e.pointerId);
        this._pointers.set(e.pointerId, { s, x: e.clientX, y: e.clientY, t: performance.now() });
      }, { passive: false });
      c.addEventListener("pointermove", (e) => {
        if (this.phase !== "playing" || this.auto) return;
        const p = this._pointers && this._pointers.get(e.pointerId);
        if (!p) return;
        const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (d > 34 && performance.now() - p.t < 320) {
          this._hitInput(getS(e), "swipe", true);
          p.t = 0;
        }
      });
      const end = (e) => {
        if (this._pointers) this._pointers.delete(e.pointerId);
        this._releaseSource("p" + e.pointerId);
      };
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
      c.addEventListener("pointerleave", end);
      if (!this._pointers) this._pointers = new Map();
    }

    load(songId, diff, opts) {
      this.song = CHARTS.SONGS[songId];
      this.chart = CHARTS.getChart(songId, diff);
      this.notes = this.chart.notes.map((n) => ({
        ...n,
        status: "pending", // pending | holding | done
        judge: null,
        headJudge: null,
        holdEnd: n.type === "hold" ? n.t + n.dur : 0,
        registered: false,
        auto: false,
      }));
      this.line = this.chart.line;
      this.total = this.notes.length;
      this.counts = { perfect: 0, good: 0, bad: 0, miss: 0 };
      this.combo = 0;
      this.maxCombo = 0;
      this.judged = 0;
      this.score = 0;
      this.acc = 1;
      this.fx = [];
      this.shake = 0;
      this.shakeT = 0;
      this.startTc = 0;
      this.tc = 0;
      this._held = new Map();
      this._pointers = new Map();
      this._keysDown = new Set();
      this._lastHud = "";
      this.auto = !!(opts && opts.auto);
      this.offset = (opts && opts.offset) || 0;
      this.hints = !(opts && opts.hints === false);
      this.bg = null;
      this.bgBlur = null;
      this.theme = this.song.theme || { bg: "grid", hit: "ring", note: "capsule", line: "neon" };
      this._loadBackground();
      this._makeSprites();
      this._themeSprites();
      this._spawnT = 0;
    }

    _loadBackground() {
      const img = new Image();
      img.onload = () => {
        this.bg = img;
        const cw = 360, ch = Math.max(200, Math.round(360 * (this.h / this.w)));
        const cv = document.createElement("canvas");
        cv.width = cw; cv.height = ch;
        const c = cv.getContext("2d");
        try { c.filter = "blur(9px)"; } catch (e) {}
        const r = Math.max(cw / img.width, ch / img.height) * 1.14;
        const w = img.width * r, h = img.height * r;
        c.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
        this.bgBlur = cv;
      };
      img.src = this.song.cover;
    }

    /* ---------------- sprites ---------------- */
    _makeSprites() {
      const accent = this.song.accent;
      const accent2 = this.song.accent2;
      const rgb = (hex, a) => {
        const h = hex.replace("#", "");
        const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
        const n = parseInt(v, 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
      };
      const mk = (w, h, paint) => {
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        paint(cv.getContext("2d"), w, h);
        return cv;
      };
      const W = 360, H = 108;
      const pad = 30, bw = W - pad * 2, bh = 48, x = pad, y = (H - bh) / 2;

      // TAP — glass capsule with a hot white core, twin rails and a diamond mark
      this.spriteTap = mk(W, H, (c) => {
        c.save();
        c.shadowColor = accent; c.shadowBlur = 26;
        const g = c.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.14, "#e9feff");
        g.addColorStop(0.48, accent);
        g.addColorStop(0.83, "#123a52");
        g.addColorStop(1, "#081a2a");
        c.fillStyle = g;
        roundRect(c, x, y, bw, bh, bh / 2);
        c.fill();
        c.restore();

        c.save();
        roundRect(c, x + 2, y + 2, bw - 4, bh - 4, (bh - 4) / 2);
        c.clip();
        const ig = c.createLinearGradient(0, y, 0, y + bh);
        ig.addColorStop(0, "rgba(255,255,255,.34)");
        ig.addColorStop(0.32, "rgba(255,255,255,0)");
        ig.addColorStop(0.72, "rgba(0,0,0,0)");
        ig.addColorStop(1, "rgba(0,4,12,.55)");
        c.fillStyle = ig; c.fillRect(x, y, bw, bh);
        c.restore();

        c.strokeStyle = "rgba(255,255,255,.88)"; c.lineWidth = 4.6;
        roundRect(c, x, y, bw, bh, bh / 2); c.stroke();

        const cg = c.createLinearGradient(x + 34, 0, x + bw - 34, 0);
        cg.addColorStop(0, "rgba(255,255,255,0)");
        cg.addColorStop(0.16, "rgba(255,255,255,.65)");
        cg.addColorStop(0.5, "#ffffff");
        cg.addColorStop(0.84, "rgba(255,255,255,.65)");
        cg.addColorStop(1, "rgba(255,255,255,0)");
        c.save();
        c.shadowColor = "#ffffff"; c.shadowBlur = 12;
        c.fillStyle = cg;
        roundRect(c, x + 34, y + bh / 2 - 2.4, bw - 68, 4.8, 2.4);
        c.fill();
        c.restore();

        c.fillStyle = "rgba(255,255,255,.58)";
        roundRect(c, x + 27, y + 5, bw - 54, 3, 1.5); c.fill();
        const tg = c.createLinearGradient(0, y + bh - 18, 0, y + bh);
        tg.addColorStop(0, rgb(accent2, 0));
        tg.addColorStop(0.62, rgb(accent2, 0.30));
        tg.addColorStop(1, rgb(accent2, 0));
        c.fillStyle = tg;
        c.fillRect(x + 22, y + bh - 18, bw - 44, 16);

        c.save();
        c.translate(W / 2, H / 2); c.rotate(Math.PI / 4);
        c.shadowColor = "#ffffff"; c.shadowBlur = 14;
        c.fillStyle = "rgba(255,255,255,.97)";
        c.fillRect(-2.7, -2.7, 5.4, 5.4);
        c.restore();
      });

      // DRAG — thin gold ribbon with jewelled end caps
      this.spriteDrag = mk(W, H, (c) => {
        const hh = 26, yy = (H - hh) / 2;
        c.save();
        c.shadowColor = "#ffd34d"; c.shadowBlur = 22;
        const g = c.createLinearGradient(0, yy, 0, yy + hh);
        g.addColorStop(0, "#fffbe0");
        g.addColorStop(0.42, "#ffd34d");
        g.addColorStop(0.78, "#c98a22");
        g.addColorStop(1, "#6e4210");
        c.fillStyle = g;
        roundRect(c, x, yy, bw, hh, hh / 2);
        c.fill();
        c.restore();
        c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 3.2;
        roundRect(c, x, yy, bw, hh, hh / 2); c.stroke();
        c.fillStyle = "rgba(255,255,255,.92)";
        roundRect(c, x + 22, yy + hh / 2 - 1.8, bw - 44, 3.6, 1.8); c.fill();
        c.fillStyle = "rgba(255,255,255,.9)";
        for (const cx of [x + 11, x + bw - 11]) {
          c.save(); c.translate(cx, H / 2); c.rotate(Math.PI / 4);
          c.fillRect(-3.4, -3.4, 6.8, 6.8); c.restore();
        }
        c.fillStyle = "rgba(90,52,6,.55)";
        roundRect(c, W / 2 - 12, yy + 6, 24, 3, 1.5); c.fill();
      });

      // FLICK — magenta blade with outer wings + three chevrons
      this.spriteFlick = mk(W, H, (c) => {
        c.save();
        c.shadowColor = accent2; c.shadowBlur = 26;
        const g = c.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.16, "#ffe9fb");
        g.addColorStop(0.5, accent2);
        g.addColorStop(0.84, "#4a0c36");
        g.addColorStop(1, "#1c0617");
        c.fillStyle = g;
        roundRect(c, x, y, bw, bh, bh / 2);
        c.fill();
        c.restore();
        c.strokeStyle = "rgba(255,255,255,.88)"; c.lineWidth = 4.6;
        roundRect(c, x, y, bw, bh, bh / 2); c.stroke();
        c.strokeStyle = rgb(accent2, 0.55); c.lineWidth = 1;
        roundRect(c, x + 3, y + 3, bw - 6, bh - 6, (bh - 6) / 2); c.stroke();

        // outer arrow wings
        c.save();
        c.strokeStyle = "rgba(255,255,255,.45)"; c.lineWidth = 1.6;
        for (const d of [-1, 1]) {
          c.beginPath();
          c.moveTo(W / 2 + d * 60, y + 9);
          c.lineTo(W / 2 + d * 78, H / 2);
          c.lineTo(W / 2 + d * 60, y + bh - 9);
          c.stroke();
        }
        c.restore();

        // chevrons
        c.save();
        c.strokeStyle = "rgba(255,255,255,.97)"; c.lineWidth = 3.4; c.lineCap = "round";
        c.shadowColor = "#ffffff"; c.shadowBlur = 12;
        for (let i = -1; i <= 1; i++) {
          const cx = W / 2 + i * 21;
          c.beginPath();
          c.moveTo(cx - 6, y + 12);
          c.lineTo(cx + 7, H / 2);
          c.lineTo(cx - 6, y + bh - 12);
          c.stroke();
        }
        c.restore();

        c.fillStyle = "rgba(255,255,255,.55)";
        roundRect(c, x + 22, y + 5, 26, 2.5, 1.2); c.fill();
        roundRect(c, x + bw - 48, y + 5, 26, 2.5, 1.2); c.fill();
        const fg = c.createLinearGradient(0, y + bh - 18, 0, y + bh);
        fg.addColorStop(0, rgb(accent, 0));
        fg.addColorStop(0.62, rgb(accent, 0.30));
        fg.addColorStop(1, rgb(accent, 0));
        c.fillStyle = fg;
        c.fillRect(x + 22, y + bh - 18, bw - 44, 16);
      });

      // HOLD — cyan anchor head with a double ring
      this.spriteHold = mk(W, H, (c) => {
        c.save();
        c.shadowColor = accent; c.shadowBlur = 28;
        const g = c.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.15, "#ecfeff");
        g.addColorStop(0.5, accent);
        g.addColorStop(0.86, "#123a52");
        g.addColorStop(1, "#081a2a");
        c.fillStyle = g;
        roundRect(c, x, y, bw, bh, bh / 2);
        c.fill();
        c.restore();
        c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 3.4;
        roundRect(c, x, y, bw, bh, bh / 2); c.stroke();

        c.save();
        c.shadowColor = "#ffffff"; c.shadowBlur = 16;
        c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 2.6;
        c.beginPath(); c.arc(W / 2, H / 2, 10.5, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = rgb(accent2, 0.85); c.lineWidth = 1.4;
        c.beginPath(); c.arc(W / 2, H / 2, 15, 0, Math.PI * 2); c.stroke();
        c.fillStyle = "rgba(255,255,255,.96)";
        c.beginPath(); c.arc(W / 2, H / 2, 3.4, 0, Math.PI * 2); c.fill();
        c.restore();

        c.fillStyle = "rgba(255,255,255,.62)";
        roundRect(c, x + 24, y + 5.5, bw - 48, 3, 1.5); c.fill();
        const hg = c.createLinearGradient(0, y + bh - 18, 0, y + bh);
        hg.addColorStop(0, rgb(accent2, 0));
        hg.addColorStop(0.62, rgb(accent2, 0.30));
        hg.addColorStop(1, rgb(accent2, 0));
        c.fillStyle = hg;
        c.fillRect(x + 22, y + bh - 18, bw - 44, 16);
      });

      // cached radial glows for particles (drawn much faster than per-frame gradients)
      const mkGlow = (hex) => mk(64, 64, (c) => {
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.18, rgb(hex, 0.96));
        g.addColorStop(0.52, rgb(hex, 0.30));
        g.addColorStop(1, rgb(hex, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
      });
      this.glowAccent = mkGlow(accent);
      this.glowAccent2 = mkGlow(accent2);
      this.glowWhite = mkGlow("#ffffff");
      this.glowGold = mkGlow("#ffd34d");
    }

    /* ---------------- per-song visual theme ---------------- */
    // Each track carries its own note materials, hit burst, backdrop and line trim.
    _themeSprites() {
      const th = (this.theme && this.theme.note) || "capsule";
      if (th === "capsule") return;
      const accent = this.song.accent, accent2 = this.song.accent2;
      const W = 360, H = 108;
      const paint = (cv) => {
        const c = cv.getContext("2d");
        c.save();
        c.globalCompositeOperation = "source-atop";
        if (th === "ice") {
          c.strokeStyle = "rgba(255,255,255,.42)";
          c.lineWidth = 1.6;
          for (let i = 0; i < 7; i++) {
            const x = 34 + i * 48;
            c.beginPath();
            c.moveTo(x, 10);
            c.lineTo(x + 28, H - 10);
            c.stroke();
          }
          c.fillStyle = "rgba(226,250,255,.12)";
          c.fillRect(0, 0, W, H);
          c.fillStyle = "rgba(255,255,255,.30)";
          c.fillRect(40, 8, W - 80, 2);
        } else if (th === "bolt") {
          c.fillStyle = "rgba(26,6,0,.24)";
          for (let i = 0; i < 5; i++) {
            const x = 26 + i * 66;
            c.beginPath();
            c.moveTo(x, 4); c.lineTo(x + 13, 4);
            c.lineTo(x + 4, H - 4); c.lineTo(x - 9, H - 4);
            c.closePath(); c.fill();
          }
          c.strokeStyle = this._rgba(accent2, 0.9);
          c.lineWidth = 3.2;
          c.beginPath(); c.moveTo(26, H / 2); c.lineTo(W - 26, H / 2); c.stroke();
          c.fillStyle = "rgba(255,255,255,.22)";
          c.fillRect(24, H / 2 - 7, W - 48, 2);
        } else if (th === "soft") {
          const g = c.createLinearGradient(0, 0, W, H);
          g.addColorStop(0, "rgba(255,214,176,.34)");
          g.addColorStop(0.48, "rgba(255,180,150,.10)");
          g.addColorStop(1, "rgba(120,86,132,.30)");
          c.fillStyle = g; c.fillRect(0, 0, W, H);
          c.fillStyle = "rgba(255,255,255,.16)";
          roundRect(c, 48, 15, W - 96, 11, 6); c.fill();
          c.fillStyle = "rgba(60,30,50,.16)";
          roundRect(c, 48, H - 26, W - 96, 8, 4); c.fill();
        } else if (th === "shell") {
          c.strokeStyle = "rgba(226,255,252,.40)";
          c.lineWidth = 1.5;
          for (let r = 9; r < 36; r += 9) {
            c.beginPath(); c.arc(W / 2, H / 2, r, 0, TAU); c.stroke();
          }
          const g = c.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, "rgba(222,255,252,.22)");
          g.addColorStop(0.5, "rgba(90,220,220,.05)");
          g.addColorStop(1, "rgba(6,42,52,.34)");
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        }
        c.restore();
      };
      paint(this.spriteTap);
      paint(this.spriteDrag);
      paint(this.spriteFlick);
      paint(this.spriteHold);
    }

    _themeBg(tc, l) {
      const c = this.ctx, w = this.w, h = this.h;
      const th = (this.theme && this.theme.bg) || "grid";
      if (th === "grain") { this._bgGrain(tc); return; }
      const accent = this.song.accent, accent2 = this.song.accent2;
      const beatSec = 60 / this.song.bpm;
      const pulse = Math.pow(1 - ((tc % beatSec) / beatSec), 3);
      c.save();
      c.globalCompositeOperation = "lighter";

      if (th === "grid") {
        const horizon = h * 0.60;
        for (let i = -9; i <= 9; i++) {
          c.strokeStyle = this._rgba(accent2, 0.055);
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(w / 2 + i * w * 0.018, horizon);
          c.lineTo(w / 2 + i * w * 0.17, h);
          c.stroke();
        }
        for (let i = 0; i < 10; i++) {
          const z = (i / 10 + tc * 0.16) % 1;
          const y = horizon + (h - horizon) * z * z;
          c.strokeStyle = this._rgba(accent2, 0.04 + z * 0.10);
          c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
        }
      } else if (th === "aurora") {
        for (let k = 0; k < 5; k++) {
          const y0 = h * (0.10 + k * 0.062);
          c.beginPath();
          for (let x = 0; x <= w; x += w / 22) {
            const y = y0
              + Math.sin(x * 0.0062 + tc * 0.34 + k * 1.7) * h * 0.05
              + Math.sin(x * 0.014 - tc * 0.21 + k * 2.1) * h * 0.017;
            if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          const col = k % 2 ? accent2 : accent;
          c.strokeStyle = this._rgba(col, 0.020 + 0.014 * Math.sin(tc * 0.6 + k));
          c.lineWidth = h * 0.048;
          c.stroke();
          c.strokeStyle = this._rgba("#ffffff", 0.012);
          c.lineWidth = h * 0.008;
          c.stroke();
        }
      } else if (th === "hazard") {
        const sw = h * 0.055, off = (tc * 30) % (sw * 2);
        for (const band of [[0, h * 0.075], [h * 0.925, h]]) {
          c.save();
          c.beginPath(); c.rect(0, band[0], w, band[1] - band[0]); c.clip();
          c.fillStyle = this._rgba(accent2, 0.085);
          const bh = band[1] - band[0];
          for (let x = -h; x < w + h; x += sw * 2) {
            c.beginPath();
            c.moveTo(x + off, band[0]);
            c.lineTo(x + sw + off, band[0]);
            c.lineTo(x + sw - bh + off, band[1]);
            c.lineTo(x - bh + off, band[1]);
            c.closePath(); c.fill();
          }
          c.restore();
        }
        for (let i = 0; i < 30; i++) {
          const sx = ((i * 131) % 100) / 100 * w;
          const sp = 26 + (i % 7) * 10;
          const sy = h - ((tc * sp + i * 91) % (h * 1.04));
          const a = 0.10 + 0.14 * (0.5 + 0.5 * Math.sin(tc * 3.4 + i));
          c.fillStyle = this._rgba(i % 5 === 0 ? accent2 : accent, a);
          c.beginPath(); c.arc(sx, sy, 1.0 + (i % 3) * 0.7, 0, TAU); c.fill();
        }
        const hy = h * 0.50;
        const hg = c.createLinearGradient(0, hy - h * 0.05, 0, hy + h * 0.05);
        hg.addColorStop(0, this._rgba(accent, 0));
        hg.addColorStop(0.5, this._rgba(accent, 0.10 + pulse * 0.12));
        hg.addColorStop(1, this._rgba(accent, 0));
        c.fillStyle = hg;
        c.fillRect(0, hy - h * 0.05, w, h * 0.1);
      } else if (th === "caustics") {
        for (let k = 0; k < 7; k++) {
          const y0 = h * (0.06 + k * 0.055);
          c.beginPath();
          for (let x = 0; x <= w; x += w / 26) {
            const y = y0 + Math.sin(x * 0.010 + tc * 0.42 + k * 1.3) * h * 0.022
              + Math.sin(x * 0.026 - tc * 0.31 + k) * h * 0.008;
            if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.strokeStyle = this._rgba(k % 2 ? accent : accent2, 0.055);
          c.lineWidth = 1.4;
          c.stroke();
        }
        for (let i = 0; i < 24; i++) {
          const bx = ((i * 167) % 100) / 100 * w + Math.sin(tc * 0.7 + i) * w * 0.012;
          const by = h - ((tc * (16 + (i % 6) * 7) + i * 113) % (h * 1.02));
          const br = 1.6 + (i % 4) * 1.1;
          c.strokeStyle = this._rgba("#d9fffb", 0.10 + 0.08 * Math.sin(tc + i));
          c.lineWidth = 0.9;
          c.beginPath(); c.arc(bx, by, br, 0, TAU); c.stroke();
        }
        const ug = c.createRadialGradient(w * 0.5, h * 1.05, 0, w * 0.5, h * 1.05, h * 0.9);
        ug.addColorStop(0, this._rgba(accent, 0.10 + pulse * 0.04));
        ug.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = ug;
        c.fillRect(0, 0, w, h);
      }
      c.restore();
    }

    _bgGrain(tc) {
      const c = this.ctx, w = this.w, h = this.h;
      // warm window light that drifts with the beat
      const beatSec = 60 / this.song.bpm;
      const pulse = Math.pow(1 - ((tc % beatSec) / beatSec), 2);
      const lg = c.createLinearGradient(0, h * 0.18, 0, h * 0.55);
      lg.addColorStop(0, "rgba(255,196,150," + (0.055 + pulse * 0.03).toFixed(3) + ")");
      lg.addColorStop(1, "rgba(255,150,120,0)");
      c.fillStyle = lg;
      c.fillRect(0, h * 0.18, w, h * 0.4);
      // floating dust
      c.save();
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < 46; i++) {
        const dx = ((i * 193) % 100) / 100 * w + Math.sin(tc * 0.32 + i * 1.7) * w * 0.02;
        const dy = ((i * 79) % 100) / 100 * h + Math.cos(tc * 0.22 + i) * h * 0.02;
        const a = 0.06 + 0.10 * (0.5 + 0.5 * Math.sin(tc * 1.7 + i * 2.3));
        c.fillStyle = "rgba(255,226,196," + a.toFixed(3) + ")";
        c.beginPath(); c.arc(dx, dy, 0.8 + (i % 3) * 0.5, 0, TAU); c.fill();
      }
      c.restore();
      // scanlines
      if (!this._scan) {
        const sc = document.createElement("canvas");
        sc.width = 4; sc.height = 4;
        const sx = sc.getContext("2d");
        sx.fillStyle = "rgba(0,0,0,.16)";
        sx.fillRect(0, 0, 4, 1);
        this._scan = sc;
      }
      const pat = c.createPattern(this._scan, "repeat");
      c.fillStyle = pat;
      c.fillRect(0, 0, w, h);
      // film grain
      if (!this._noise) {
        const nv = document.createElement("canvas");
        nv.width = 160; nv.height = 120;
        const nx = nv.getContext("2d");
        const id = nx.createImageData(160, 120);
        for (let i = 0; i < id.data.length; i += 4) {
          const v = 110 + Math.random() * 120;
          id.data[i] = v; id.data[i + 1] = v * 0.92; id.data[i + 2] = v * 0.82;
          id.data[i + 3] = Math.random() * 46;
        }
        nx.putImageData(id, 0, 0);
        this._noise = nv;
      }
      const ox = (Math.random() * 160) | 0, oy = (Math.random() * 120) | 0;
      c.globalAlpha = 0.55;
      for (let y = -oy; y < h; y += 120) {
        for (let x = -ox; x < w; x += 160) c.drawImage(this._noise, x, y);
      }
      c.globalAlpha = 1;
    }



    /* ---------------- lifecycle ---------------- */
    start(songId, diff, opts) {
      this.load(songId, diff, opts);
      this.phase = "playing";
      AUDIO.init();
      AUDIO.setVolume((opts && opts.volume) != null ? opts.volume : 0.8);
      this.startWall = performance.now();
      this.startAudioTime = 0;
      this.useAudio = true;
      const p = AUDIO.playTrack(songId);
      this.tc = 0;
      this._raf = requestAnimationFrame(this._loop.bind(this));
      if (p && p.catch) {
        p.catch(() => {
          this.useAudio = false;
          this.startWall = performance.now();
        });
      }
    }

    restart() {
      if (!this.song) return;
      const songId = this.song.id;
      const diff = this.chart.diff;
      const opts = { auto: this.auto, offset: this.offset, hints: this.hints };
      this.cancel();
      this.start(songId, diff, opts);
    }

    cancel() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      AUDIO.pause();
    }

    pause() {
      if (this.phase !== "playing") return;
      this.phase = "paused";
      this.pauseTc = this.tc;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      AUDIO.pause();
    }

    resume() {
      if (this.phase !== "paused") return;
      this.phase = "playing";
      this.startWall = performance.now() - this.pauseTc * 1000;
      AUDIO.resume();
      this._raf = requestAnimationFrame(this._loop.bind(this));
    }

    stop() {
      this.phase = "idle";
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      AUDIO.stop();
    }

    finish() {
      if (this.phase === "finished") return;
      this.phase = "finished";
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      AUDIO.pause();
      // resolve anything still pending as miss
      for (const n of this.notes) {
        if (n.status === "pending") this._miss(n, true);
        else if (n.status === "holding") this._completeHold(n);
      }
      const result = this._result();
      if (this.onFinish) this.onFinish(result);
    }

    _loop(now) {
      if (this.phase !== "playing") return;
      let tc;
      if (this.useAudio) {
        tc = AUDIO.time() + this.offset / 1000;
        if (this._audio.ended) { this.finish(); return; }
      } else {
        tc = (now - this.startWall) / 1000 + this.offset / 1000;
      }
      this.tc = tc;
      this._update(tc);
      this._render(tc);
      if (tc >= this.chart.duration + 0.6) { this.finish(); return; }
      this._raf = requestAnimationFrame(this._loop.bind(this));
    }

    /* ---------------- input ---------------- */
    _onKeyDown(e) {
      if (this.phase !== "playing") return;
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k in KEY_LANES) {
        e.preventDefault();
        if (this.auto) return;
        if (this._keysDown.has(k)) return;
        this._keysDown.add(k);
        this._hitInput(KEY_LANES[k], k);
      } else if (k === "arrowleft") { this._arrow(-0.34, e); }
      else if (k === "arrowdown") { this._arrow(-0.11, e); }
      else if (k === "arrowup") { this._arrow(0.11, e); }
      else if (k === "arrowright") { this._arrow(0.34, e); }
    }

    _arrow(s, e) {
      e.preventDefault();
      if (this.auto) return;
      this._hitInput(s, "arrow");
    }

    _onKeyUp(e) {
      const k = e.key.toLowerCase();
      this._keysDown.delete(k);
      this._releaseSource(k);
    }

    _releaseSource(id) {
      const note = this._held.get(id);
      if (note) {
        this._held.delete(id);
        if (note.status === "holding" && this.tc < note.holdEnd - 0.1) this._breakHold(note);
      }
    }

    _hitInput(s, source, isSwipe) {
      const tc = this.tc;
      let best = null, bestCost = 1e9;
      for (const n of this.notes) {
        if (n.status !== "pending") continue;
        if (n.type === "drag") continue;
        const dt = tc - n.t;
        if (Math.abs(dt) > WIN.bad + 0.02) continue;
        const ds = Math.abs(s - n.s);
        if (ds > 0.185) continue;
        const cost = Math.abs(dt) * 2.6 + ds;
        if (cost < bestCost) { bestCost = cost; best = n; }
      }
      if (!best) return;
      const dt = tc - best.t;
      const j = Math.abs(dt) <= WIN.perfect ? "perfect" : Math.abs(dt) <= WIN.good ? "good" : "bad";
      if (best.type === "hold") {
        best.status = "holding";
        best.headJudge = j;
        best.headDt = dt;
        this._held.set(source, best);
        this._hitFx(best, j, true);
        AUDIO.hit(j, best.s, "hold", this.song.id);
      } else {
        this._register(best, j);
        this._hitFx(best, j, false);
        AUDIO.hit(j, best.s, best.type, this.song.id);
      }
    }

    _register(n, j) {
      if (n.registered) return;
      n.registered = true;
      n.status = "done";
      n.judge = j;
      this.counts[j]++;
      this.judged++;
      if (j === "perfect" || j === "good") {
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      } else {
        this.combo = 0;
      }
      this._updateScore();
      this._showJudge(j);
      if (this.combo === 50 || (this.combo >= 100 && this.combo % 100 === 0)) this._comboFx();
    }

    _miss(n, silent) {
      if (n.registered) return;
      n.registered = true;
      n.status = "done";
      n.judge = "miss";
      this.counts.miss++;
      this.judged++;
      this.combo = 0;
      this._updateScore();
      if (!silent) this._showJudge("miss");
    }

    _completeHold(n) {
      if (n.registered) return;
      const j = n.headJudge || "perfect";
      this._register(n, j);
      this._hitFx(n, j, false, true);
      AUDIO.hit(j, n.s, "tail", this.song.id);
    }

    _breakHold(n) {
      if (n.registered) return;
      n.registered = true;
      n.status = "done";
      n.judge = "miss";
      this.counts.miss++;
      this.judged++;
      this.combo = 0;
      this._updateScore();
      this._showJudge("miss");
    }

    _updateScore() {
      const pts = this.counts.perfect + this.counts.good * 0.65 + this.counts.bad * 0.3;
      this.acc = this.judged ? pts / this.judged : 1;
      const finalPotential = 900000 * (pts / Math.max(1, this.total)) + 100000 * (this.maxCombo / Math.max(1, this.total));
      this.score = Math.round(finalPotential * (this.judged / Math.max(1, this.total)));
    }

    _result() {
      const j = this.counts;
      const pts = j.perfect + j.good * 0.65 + j.bad * 0.3;
      const acc = pts / Math.max(1, this.total);
      const score = Math.round(900000 * acc + 100000 * (this.maxCombo / Math.max(1, this.total)));
      let rank = "F";
      if (j.miss === 0 && j.bad === 0 && j.good === 0) rank = "PHI";
      else if (j.miss === 0 && j.bad === 0) rank = "FC";
      else if (score >= 950000) rank = "S";
      else if (score >= 900000) rank = "A";
      else if (score >= 800000) rank = "B";
      else if (score >= 700000) rank = "C";
      return {
        song: this.song, diff: this.chart.diff, level: this.chart.level,
        score, acc, rank, counts: j, maxCombo: this.maxCombo, total: this.total,
      };
    }

    /* ---------------- update ---------------- */
    _update(tc) {
      // auto play
      if (this.auto) {
        for (const n of this.notes) {
          if (n.status === "pending" && tc >= n.t - 0.004) {
            if (n.type === "hold") {
              n.status = "holding"; n.headJudge = "perfect"; n.auto = true;
              this._hitFx(n, "perfect", true);
              AUDIO.hit("perfect", n.s, "hold", this.song.id);
            } else {
              this._register(n, "perfect");
              this._hitFx(n, "perfect", false);
              AUDIO.hit("perfect", n.s, n.type, this.song.id);
            }
          } else if (n.status === "holding" && n.auto && tc >= n.holdEnd) {
            this._completeHold(n);
          }
        }
      }

      // drags auto + misses + holds
      for (const n of this.notes) {
        if (n.status === "pending") {
          if (n.type === "drag" && tc >= n.t) {
            this._register(n, "perfect");
            this._hitFx(n, "perfect", false);
            AUDIO.hit("perfect", n.s, "drag", this.song.id);
          } else if (tc > n.t + WIN.miss) {
            this._miss(n, false);
          }
        } else if (n.status === "holding") {
          if (n.auto && tc >= n.holdEnd) this._completeHold(n);
          else if (!n.auto && tc >= n.holdEnd - 0.02) this._completeHold(n);
        }
      }

      // effects
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i];
        f.life -= 1 / 60;
        if (f.delay > 0) { f.delay -= 1 / 60; continue; }
        if (f.kind === "spark" || f.kind === "shard") {
          f.vy += (f.gravity || 0) / 60;
          f.vx *= f.drag || 0.97; f.vy *= f.drag || 0.97;
          f.x += f.vx / 60; f.y += f.vy / 60;
        } else if (f.kind === "puff") {
          f.x += f.vx / 60; f.y += f.vy / 60;
          f.vx *= 0.94; f.vy *= 0.94;
        } else if (f.kind === "bubble") {
          f.y -= f.vy / 60;
          f.x += Math.sin(f.life * 5.2 + f.ph) * 0.38;
        }
        if (f.life <= 0) this.fx.splice(i, 1);
      }
      this.lineFlash = Math.max(0, (this.lineFlash || 0) * 0.86);
      if (this.shake > 0.2) this.shake *= 0.9; else this.shake = 0;
      this._updateHud(tc);
    }

    _hitFx(n, j, head, tail) {
      const l = this.lineAt(this.tc);
      const cos = Math.cos(l.a), sin = Math.sin(l.a);
      const x = l.x * this.w + cos * n.s * this.laneHalf;
      const y = l.y * this.h + sin * n.s * this.laneHalf;
      const kind = tail ? "tail" : n.type;
      const base = kind === "flick" ? this.song.accent2 : kind === "drag" ? "#ffd34d" : this.song.accent;
      const judgeCol = j === "perfect" ? "#ffffff" : j === "good" ? "#ffe6a1" : j === "bad" ? "#ffb37a" : "#ff5b84";
      const perfect = j === "perfect";
      const strong = perfect ? 1 : j === "good" ? 0.7 : 0.42;
      const power = kind === "tail" ? strong * 0.65 : strong;
      const nw = this.noteW;
      const rnd = (a, b) => a + Math.random() * (b - a);

      // core flash
      this.fx.push({ kind: "flash", x, y, life: 0.22 * (0.75 + power * 0.35), max: 0.22 * (0.75 + power * 0.35), r: nw * (head ? 1.15 : 1.45) * (0.7 + power * 0.45), color: base });

      // twin shock rings
      this.fx.push({ kind: "ring", x, y, life: 0.5, max: 0.5, r0: nw * 0.12, r1: nw * (head ? 0.7 : 0.95), width: 2.2, color: base });
      if (perfect) this.fx.push({ kind: "ring", x, y, life: 0.42, max: 0.42, r0: nw * 0.06, r1: nw * 0.58, width: 1.0, color: judgeCol, delay: 0.055 });

      // a light-wave running along the judgement line
      this.fx.push({ kind: "line", x, y, a: l.a, life: 0.4, max: 0.4, len: nw * 2.0, color: base });

      // radial sparks with velocity trails
      const ns = perfect ? 13 : j === "good" ? 8 : 4;
      for (let i = 0; i < ns; i++) {
        const a = Math.random() * TAU;
        const sp = rnd(100, 540) * (0.55 + power * 0.45);
        const life = rnd(0.26, 0.7);
        this.fx.push({
          kind: "spark", x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(0, 90),
          life, max: life, size: rnd(1.8, 4.6) * (0.7 + power * 0.5),
          gravity: 520, drag: 0.965,
          color: Math.random() < 0.18 ? "#ffffff" : Math.random() < 0.28 ? this.song.accent2 : base,
        });
      }

      // fast shards along the line tangent
      const nsh = perfect ? 5 : 3;
      for (let i = 0; i < nsh; i++) {
        const a = l.a + (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.6, 0.6);
        const sp = rnd(320, 820);
        const life = rnd(0.2, 0.42);
        this.fx.push({
          kind: "shard", x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life, max: life, len: rnd(16, 40), width: rnd(1.8, 3.6),
          gravity: 170, drag: 0.955,
          color: Math.random() < 0.34 ? "#ffffff" : base,
        });
      }

      // slow motes for a perfect hit
      if (perfect) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU, sp = rnd(15, 70);
          const life = rnd(0.5, 1.0);
          this.fx.push({
            kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life, max: life, size: rnd(0.7, 1.5), gravity: -18, drag: 0.98,
            color: Math.random() < 0.35 ? "#ffffff" : base,
          });
        }
      }

      if (perfect) {
        for (let i = 0; i < 2; i++) {
          const ga = Math.random() * TAU, gr = rnd(4, nw * 0.55);
          const glife = rnd(0.3, 0.55);
          this.fx.push({
            kind: "glint", x: x + Math.cos(ga) * gr, y: y + Math.sin(ga) * gr,
            life: glife, max: glife, size: rnd(5, 13), rot: Math.random() * Math.PI,
            color: Math.random() < 0.35 ? "#ffffff" : base,
          });
        }
      }

      if (perfect) {
        for (let i = 0; i < 2; i++) {
          this.fx.push({
            kind: "ray", x, y, a: l.a + (i * Math.PI) / 2,
            life: 0.3, max: 0.3, len: nw * (i % 2 ? 1.4 : 2.3),
            width: i % 2 ? 0.8 : 1.0, color: i % 2 ? this.song.accent2 : base,
          });
        }
      }

      // ---- per-track hit signature ----
      const style = (this.theme && this.theme.hit) || "ring";
      if (style === "shard") {
        for (let i = 0; i < (perfect ? 6 : 3); i++) {
          const a = Math.random() * TAU, sp = rnd(120, 430);
          const life = rnd(0.3, 0.62);
          this.fx.push({
            kind: "shard", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
            life, max: life, len: rnd(22, 54), width: rnd(2.2, 4.4),
            gravity: 120, drag: 0.97,
            color: Math.random() < 0.5 ? "#e8fbff" : this.song.accent2,
          });
        }
        this.fx.push({ kind: "glint", x, y, life: 0.34, max: 0.34, size: nw * 0.42, rot: Math.random() * Math.PI, color: "#ffffff" });
      } else if (style === "spark") {
        for (let i = 0; i < (perfect ? 8 : 4); i++) {
          const a = Math.random() * TAU, sp = rnd(180, 640);
          const life = rnd(0.3, 0.82);
          this.fx.push({
            kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + rnd(-40, 30),
            life, max: life, size: rnd(1.6, 4.0), gravity: -170, drag: 0.958,
            color: Math.random() < 0.3 ? "#ffffff" : Math.random() < 0.5 ? this.song.accent2 : base,
          });
        }
        this.fx.push({ kind: "ring", x, y, life: 0.34, max: 0.34, r0: nw * 0.2, r1: nw * 1.5, width: 3.4, color: this.song.accent2 });
        this.shake = Math.min(7.5, this.shake + (perfect ? 1.2 : 0.4));
      } else if (style === "dust") {
        for (let i = 0; i < (perfect ? 7 : 4); i++) {
          const a = Math.random() * TAU, sp = rnd(12, 95);
          const life = rnd(0.5, 0.95);
          this.fx.push({
            kind: "puff", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 8,
            life, max: life, size: nw * rnd(0.05, 0.15),
            color: Math.random() < 0.5 ? this.song.accent2 : "#ffd9b0",
          });
        }
        for (let i = 0; i < (perfect ? 4 : 2); i++) {
          const a = Math.random() * TAU, sp = rnd(20, 90);
          const life = rnd(0.4, 0.8);
          this.fx.push({
            kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(10, 44),
            life, max: life, size: rnd(1.2, 2.2), gravity: -12, drag: 0.955,
            color: Math.random() < 0.5 ? "#fff2dd" : this.song.accent2,
          });
        }
        this.shake *= 0.25;
      } else if (style === "ripple") {
        for (let i = 0; i < 3; i++) {
          const life = 0.5 + i * 0.22;
          this.fx.push({
            kind: "ring", x, y, life, max: life,
            r0: nw * 0.1, r1: nw * (0.7 + i * 0.5), width: 1.4,
            color: i === 1 ? this.song.accent2 : base, delay: i * 0.06,
          });
        }
        for (let i = 0; i < (perfect ? 4 : 2); i++) {
          const life = rnd(0.45, 0.95);
          this.fx.push({
            kind: "bubble", x: x + rnd(-nw * 0.4, nw * 0.4), y, ph: Math.random() * 6,
            vy: rnd(26, 78), life, max: life, size: rnd(2, 5.2), color: "#d6fffa",
          });
        }
        this.shake *= 0.5;
      }

      this.lineFlash = Math.min(1.0, (this.lineFlash || 0) + (perfect ? 0.3 : 0.14));
      if (perfect) this.shake = Math.min(5.5, this.shake + (kind === "flick" ? 1.5 : kind === "tail" ? 0.5 : 0.85));
      if (this.fx.length > 360) this.fx.splice(0, this.fx.length - 360);
    }

    _comboFx() {
      const l = this.lineAt(this.tc);
      const x = l.x * this.w, y = l.y * this.h;
      const col = this.song.accent;
      this.fx.push({ kind: "flash", x, y, life: 0.5, max: 0.5, r: this.halfLen * 0.85, color: col });
      this.fx.push({ kind: "ring", x, y, life: 0.72, max: 0.72, r0: this.noteW * 0.9, r1: this.halfLen * 1.3, width: 2.0, color: col });
      this.fx.push({ kind: "ring", x, y, life: 0.6, max: 0.6, r0: this.noteW * 0.5, r1: this.halfLen * 0.9, width: 1.0, color: "#ffffff", delay: 0.08 });
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * TAU, sp = 120 + Math.random() * 420;
        const life = 0.35 + Math.random() * 0.5;
        this.fx.push({
          kind: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life, max: life, size: 1.2 + Math.random() * 2.2, gravity: 260, drag: 0.97,
          color: Math.random() < 0.4 ? "#ffffff" : Math.random() < 0.5 ? this.song.accent2 : col,
        });
      }
      this.lineFlash = Math.min(2.2, (this.lineFlash || 0) + 0.9);
      if (window.PHINEON_AUDIO) window.PHINEON_AUDIO.milestone(this.combo, this.song.id);
    }

    _showJudge(j) {
      const el = document.getElementById("judge");
      if (!el) return;
      el.className = "judge " + j;
      el.textContent = j.toUpperCase();
      void el.offsetWidth;
      el.classList.add("show");
    }

    _updateHud(tc) {
      const s = String(this.score).padStart(7, "0");
      const a = (this.acc * 100).toFixed(2) + "%";
      const combo = this.combo;
      const key = s + "|" + a + "|" + combo;
      if (key === this._lastHud) return;
      this._lastHud = key;
      const scoreEl = document.getElementById("score");
      const accEl = document.getElementById("acc");
      const comboEl = document.getElementById("combo");
      const comboNum = document.getElementById("comboNum");
      if (scoreEl) scoreEl.textContent = s;
      if (accEl) accEl.textContent = a;
      if (comboEl && comboNum) {
        comboNum.textContent = combo;
        comboEl.classList.toggle("on", combo >= 2);
      }
      const pf = document.getElementById("progressFill");
      if (pf) pf.style.width = clamp((tc / this.chart.duration) * 100, 0, 100) + "%";
    }

    /* ---------------- line sampling ---------------- */
    lineAt(t) {
      const L = this.line;
      if (!L || !L.length) return { x: 0.5, y: 0.55, a: 0 };
      if (t <= L[0].t) return L[0];
      for (let i = 1; i < L.length; i++) {
        if (t <= L[i].t) {
          const p0 = L[i - 1], p1 = L[i];
          const u = ease(clamp((t - p0.t) / Math.max(0.0001, p1.t - p0.t), 0, 1));
          let da = p1.a - p0.a;
          da = ((da + Math.PI) % TAU + TAU) % TAU - Math.PI;
          return { x: lerp(p0.x, p1.x, u), y: lerp(p0.y, p1.y, u), a: p0.a + da * u };
        }
      }
      return L[L.length - 1];
    }

    /* ---------------- render ---------------- */
    _render(tc) {
      const c = this.ctx, w = this.w, h = this.h;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      const l = this.lineAt(tc);
      c.save();
      if (this.shake) {
        c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      }
      this._drawBg(tc, l);
      this._drawLaneHints(tc, l);

      const cos = Math.cos(l.a), sin = Math.sin(l.a);
      const nx = sin, ny = -cos;
      const lx = l.x * w, ly = l.y * h;
      const speed = this.speed;
      const maxD = speed * 1.9;

      // hold bodies
      for (const n of this.notes) {
        if (n.type !== "hold" || n.status === "done") continue;
        const d = (n.t - tc) * speed;
        if (d > maxD + n.dur * speed || d < -n.dur * speed - 40) continue;
        const alpha = n.status === "holding" ? 1 : clamp(1 - (d - maxD * 0.8) / (maxD * 0.3), 0, 1);
        this._drawHoldBody(c, n, lx, ly, cos, sin, nx, ny, d, speed, alpha);
      }

      // notes, far to near
      const list = [];
      for (const n of this.notes) {
        if (n.status === "done") continue;
        const d = (n.t - tc) * speed;
        if (d > maxD || d < -this.noteW * 0.8) continue;
        list.push([n, d]);
      }
      list.sort((a, b) => b[1] - a[1]);
      for (const [n, d] of list) {
        const alpha = clamp((maxD - d) / (maxD * 0.16), 0, 1);
        this._drawNote(c, n, lx, ly, cos, sin, nx, ny, d, alpha);
      }

      this._drawLine(c, lx, ly, l, tc);
      this._drawFx(c);
      c.restore();
      // thin bezel drawn last so no stray edge pixels survive
      c.fillStyle = "rgba(3,5,12,0.95)";
      c.fillRect(0, 0, w, 3);
      c.fillRect(0, 0, 3, h);
      c.fillRect(w - 3, 0, 3, h);
    }

    _drawBg(tc, l) {
      const c = this.ctx, w = this.w, h = this.h;
      c.fillStyle = "#04050c";
      c.fillRect(0, 0, w, h);
      const t = tc;
      // sharp cover, slowly drifting behind the playfield
      if (this.bg) {
        const img = this.bg;
        const r = Math.max(w / img.width, h / img.height) * 1.18;
        const zoom = 1 + Math.sin(t * 0.16) * 0.018;
        const iw = img.width * r * zoom, ih = img.height * r * zoom;
        c.save();
        c.translate(w / 2, h / 2);
        c.rotate(Math.sin(t * 0.05) * 0.012);
        c.globalAlpha = 0.34;
        c.drawImage(img, -iw / 2, -ih / 2, iw, ih);
        c.restore();
      }
      // blurred cover adds glow / colour bleed
      if (this.bgBlur) {
        const img = this.bgBlur;
        const r = Math.max(w / img.width, h / img.height) * 1.06;
        const zoom = 1 + Math.sin(t * 0.18) * 0.012;
        const iw = img.width * r * zoom, ih = img.height * r * zoom;
        c.globalAlpha = 0.45;
        c.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
        c.globalAlpha = 1;
      }
      // knock the artwork back so notes always read on top
      c.fillStyle = "rgba(3,6,14,0.50)";
      c.fillRect(0, 0, w, h);
      // tint gradients
      const g = c.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.48, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(6,10,22,0.10)");
      g.addColorStop(0.55, "rgba(4,6,14,0.68)");
      g.addColorStop(1, "rgba(2,3,9,0.95)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const ag = c.createLinearGradient(0, 0, w, h);
      ag.addColorStop(0, this._rgba(this.song.accent, 0.10));
      ag.addColorStop(0.5, "rgba(0,0,0,0)");
      ag.addColorStop(1, this._rgba(this.song.accent2, 0.10));
      c.fillStyle = ag;
      c.fillRect(0, 0, w, h);

      // stars
      for (const s of this.stars) {
        s.y -= s.sp * 0.06;
        if (s.y < -0.02) { s.y = 1.02; s.x = Math.random(); }
        const a = s.a * (0.55 + 0.45 * Math.sin(t * 1.4 + s.ph));
        c.fillStyle = "rgba(210,235,255," + a.toFixed(3) + ")";
        c.beginPath();
        c.arc(s.x * w, s.y * h, s.r, 0, TAU);
        c.fill();
      }

      // beat pulse ring around line center
      const beatSec = 60 / this.song.bpm;
      const ph = (tc % beatSec) / beatSec;
      const pulse = Math.pow(1 - ph, 4);
      const lx = l.x * w, ly = l.y * h;
      c.save();
      c.globalCompositeOperation = "lighter";
      const pr = Math.max(w, h) * (0.18 + pulse * 0.22);
      const pg = c.createRadialGradient(lx, ly, 0, lx, ly, pr);
      pg.addColorStop(0, this._rgba(this.song.accent, 0.10 + pulse * 0.08));
      pg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = pg;
      c.fillRect(0, 0, w, h);
      c.restore();

      // impact flash
      const imp = this._impact(tc);
      if (imp > 0) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.fillStyle = this._rgba(this.song.accent, imp * 0.10);
        c.fillRect(0, 0, w, h);
        c.restore();
      }

      // per-track stage show
      this._themeBg(tc, l);
    }

    _impact(tc) {
      const bars = (window.TRACK_META[this.song.id] || {}).impacts || [];
      const barSec = (60 / this.song.bpm) * 4;
      let f = 0;
      for (const b of bars) {
        const dt = Math.abs(tc - b * barSec);
        if (dt < 0.4) f = Math.max(f, Math.pow(1 - dt / 0.4, 3));
      }
      return f;
    }

    _drawLaneHints(tc, l) {
      if (!this.hints || tc > 14) return;
      const a = clamp(1 - (tc - 9) / 5, 0, 1) * 0.55;
      if (a <= 0) return;
      const c = this.ctx;
      const cos = Math.cos(l.a), sin = Math.sin(l.a);
      const lx = l.x * this.w, ly = l.y * this.h;
      c.save();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = "600 10px 'SFMono-Regular', Menlo, monospace";
      const labels = ["D", "F", "J", "K"];
      for (let i = 0; i < 4; i++) {
        const s = LANE_S[i];
        const x = lx + cos * s * this.laneHalf;
        const y = ly + sin * s * this.laneHalf;
        c.strokeStyle = "rgba(220,245,255," + (a * 0.35).toFixed(3) + ")";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x - sin * 7, y + cos * 7);
        c.lineTo(x + sin * 7, y - cos * 7);
        c.stroke();
        c.fillStyle = "rgba(220,245,255," + a.toFixed(3) + ")";
        if (this.touch) {
          c.beginPath();
          c.arc(x - sin * 18, y + cos * 18, 2.6, 0, TAU);
          c.fill();
        } else {
          c.fillText(labels[i], x - sin * 18, y + cos * 18);
        }
      }
      c.restore();
    }

    _drawHoldBody(c, n, lx, ly, cos, sin, nx, ny, d, speed, alpha) {
      const tailD = (n.t + n.dur - this.tc) * speed;
      if (tailD <= 1) return;
      // The head is the point closest to the line; the body extends toward the
      // future (up-screen). While the head is still approaching it sits at
      // -d; once it has crossed the line the body is clipped at the line.
      const bottom = d > 0 ? -d : 0;
      const top = -tailD;
      const hgt = bottom - top;
      if (hgt <= 1) return;
      const w = this.noteW * 0.58, x = lx + cos * n.s * this.laneHalf, y = ly + sin * n.s * this.laneHalf;
      c.save();
      c.translate(x, y);
      c.rotate(Math.atan2(sin, cos));
      const grad = c.createLinearGradient(0, bottom, 0, top);
      grad.addColorStop(0, this._rgba(this.song.accent, 0.54 * alpha));
      grad.addColorStop(0.32, this._rgba(this.song.accent, 0.24 * alpha));
      grad.addColorStop(1, this._rgba(this.song.accent, 0.07 * alpha));
      c.save();
      c.shadowColor = this.song.accent; c.shadowBlur = 14;
      c.fillStyle = grad;
      roundRect(c, -w / 2, top, w, hgt, w / 2);
      c.fill();
      c.restore();
      const sg = c.createLinearGradient(0, bottom, 0, top);
      sg.addColorStop(0, this._rgba(this.song.accent, 0.55 * alpha));
      sg.addColorStop(0.55, this._rgba(this.song.accent, 0.18 * alpha));
      sg.addColorStop(1, this._rgba(this.song.accent, 0.03 * alpha));
      c.strokeStyle = sg;
      c.lineWidth = 1.0;
      c.stroke();
      // inner light near the head
      const glowH = Math.min(hgt, 80);
      const g2 = c.createLinearGradient(0, bottom, 0, bottom - glowH);
      g2.addColorStop(0, "rgba(255,255,255,.38)");
      g2.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g2;
      roundRect(c, -w * 0.12, bottom - glowH, w * 0.24, glowH, w * 0.12);
      c.fill();

      // energy travelling up the hold body
      c.save();
      roundRect(c, -w / 2, top, w, hgt, w / 2);
      c.clip();
      const flow = ((this.tc * 0.65) % 1);
      const fy = top + flow * hgt;
      const fg = c.createLinearGradient(0, fy - 26, 0, fy + 26);
      fg.addColorStop(0, "rgba(255,255,255,0)");
      fg.addColorStop(0.5, "rgba(255,255,255,.19)");
      fg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = fg;
      c.fillRect(-w / 2, fy - 26, w, 52);
      c.restore();

      c.restore();
    }

    _drawNote(c, n, lx, ly, cos, sin, nx, ny, d, alpha) {
      const x = lx + cos * n.s * this.laneHalf + nx * d;
      const y = ly + sin * n.s * this.laneHalf + ny * d;
      let sprite = this.spriteTap;
      if (n.type === "drag") sprite = this.spriteDrag;
      else if (n.type === "flick") sprite = this.spriteFlick;
      else if (n.type === "hold") sprite = this.spriteHold;
      const nw = n.type === "drag" ? this.noteW * 0.92 : this.noteW;
      const nh = nw * 0.34;
      const glowCol = n.type === "flick" ? this.song.accent2 : n.type === "drag" ? "#ffd34d" : this.song.accent;

      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.rotate(Math.atan2(sin, cos));

      // proximity halo: notes catch light as they reach the judgement line
      const near = clamp(1 - Math.abs(d) / (this.noteW * 1.5), 0, 1);
      if (near > 0.02) {
        c.save();
        c.globalCompositeOperation = "lighter";
        const rg = c.createRadialGradient(0, 0, 0, 0, 0, nw * 0.8);
        rg.addColorStop(0, this._rgba(glowCol, 0.22 * near));
        rg.addColorStop(0.55, this._rgba(glowCol, 0.07 * near));
        rg.addColorStop(1, this._rgba(glowCol, 0));
        c.fillStyle = rg;
        c.beginPath(); c.arc(0, 0, nw * 0.8, 0, TAU); c.fill();
        c.restore();
      }

      if (n.type === "hold" && n.status === "holding") {
        c.shadowColor = this.song.accent;
        c.shadowBlur = 26;
      }
      c.drawImage(sprite, -nw / 2, -nh / 2, nw, nh);
      c.shadowBlur = 0;

      // travelling specular sweep clipped to the note body
      const bodyH = ((n.type === "drag" ? 26 : 48) / 108) * nh;
      const bodyW = nw * (300 / 360);
      const u = (((this.tc * 0.42 + n.s * 0.31) % 1) + 1) % 1;
      const sx = -bodyW / 2 + u * bodyW;
      c.save();
      c.beginPath();
      roundRect(c, -bodyW / 2, -bodyH / 2, bodyW, bodyH, bodyH / 2);
      c.clip();
      const lg = c.createLinearGradient(sx - bodyW * 0.14, 0, sx + bodyW * 0.14, 0);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(0.5, "rgba(255,255,255,.30)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = lg;
      c.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
      c.restore();

      c.restore();
    }

    _drawLine(c, lx, ly, l, tc) {
      const len = this.halfLen * 1.16;
      const beatSec = 60 / this.song.bpm;
      const ph = (tc % beatSec) / beatSec;
      const pulse = Math.pow(1 - ph, 5);
      const imp = this._impact(tc);
      const lf = this.lineFlash || 0;
      c.save();
      c.translate(lx, ly);
      c.rotate(l.a);
      c.globalCompositeOperation = "lighter";
      // wide glow
      const g = c.createLinearGradient(-len, 0, len, 0);
      g.addColorStop(0, this._rgba(this.song.accent, 0));
      g.addColorStop(0.18, this._rgba(this.song.accent, 0.30 + pulse * 0.25 + imp * 0.3 + lf * 0.22));
      g.addColorStop(0.5, this._rgba(this.song.accent, 0.55 + pulse * 0.35 + imp * 0.4 + lf * 0.3));
      g.addColorStop(0.82, this._rgba(this.song.accent, 0.30 + pulse * 0.25 + imp * 0.3 + lf * 0.22));
      g.addColorStop(1, this._rgba(this.song.accent, 0));
      c.fillStyle = g;
      c.fillRect(-len, -4 - pulse * 2 - imp * 3 - lf * 3, len * 2, (8 + pulse * 4 + imp * 6 + lf * 6));
      c.globalCompositeOperation = "source-over";
      // core
      const cg = c.createLinearGradient(-len, 0, len, 0);
      cg.addColorStop(0, "rgba(255,255,255,0)");
      cg.addColorStop(0.2, "rgba(255,255,255,.92)");
      cg.addColorStop(0.5, "#ffffff");
      cg.addColorStop(0.8, "rgba(255,255,255,.92)");
      cg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = cg;
      c.fillRect(-len, -1.0 - pulse * 0.3 - lf * 0.35, len * 2, 2.0 + pulse * 0.6 + lf * 0.8);
      // end diamonds
      c.fillStyle = "rgba(255,255,255,.9)";
      for (const sx of [-1, 1]) {
        c.save();
        c.translate(sx * len * 0.92, 0);
        c.rotate(Math.PI / 4);
        c.fillRect(-3, -3, 6, 6);
        c.restore();
      }
      // per-track line trim
      const trim = (this.theme && this.theme.line) || "neon";
      if (trim === "hard") {
        c.globalCompositeOperation = "lighter";
        c.fillStyle = this._rgba(this.song.accent2, 0.32);
        for (let i = -7; i <= 7; i++) c.fillRect(i * len * 0.115 - 1.5, -9 - pulse * 2, 3, 18 + pulse * 4);
        c.fillStyle = this._rgba(this.song.accent, 0.55);
        c.fillRect(-len * 0.9, -2.5, len * 0.18, 5);
        c.fillRect(len * 0.72, -2.5, len * 0.18, 5);
      } else if (trim === "crystal") {
        c.globalCompositeOperation = "lighter";
        c.strokeStyle = this._rgba("#e6f8ff", 0.28);
        c.lineWidth = 1;
        for (let i = -6; i <= 6; i++) {
          if (!i) continue;
          c.save();
          c.translate(i * len * 0.14, 0);
          c.rotate(Math.PI / 4);
          c.strokeRect(-4.5, -4.5, 9, 9);
          c.restore();
        }
      } else if (trim === "soft") {
        c.strokeStyle = "rgba(255,222,190,.30)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-len * 0.9, 6.5); c.lineTo(len * 0.9, 6.5);
        c.moveTo(-len * 0.9, -6.5); c.lineTo(len * 0.9, -6.5);
        c.stroke();
      } else if (trim === "float") {
        for (let i = -10; i <= 10; i++) {
          const x = i * len * 0.09;
          const yy = Math.sin(tc * 1.6 + i * 0.7) * 3.5;
          c.fillStyle = this._rgba("#d9fffb", 0.24);
          c.beginPath(); c.arc(x, yy, 1.4, 0, TAU); c.fill();
        }
      }
      c.restore();
    }

    _glowFor(color) {
      if (color === "#ffffff") return this.glowWhite;
      if (color === this.song.accent2) return this.glowAccent2;
      if (color === "#ffd34d") return this.glowGold;
      return this.glowAccent;
    }

    _drawFx(c) {
      const clamp01 = (v) => clamp(v, 0, 1);
      const easeOut = (u) => 1 - Math.pow(1 - u, 3);
      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      for (const f of this.fx) {
        if (f.delay > 0) continue;
        const k = clamp01(f.life / f.max);
        const u = 1 - k;
        if (f.kind === "flash") {
          const r = f.r * (0.5 + 0.5 * easeOut(u));
          c.globalAlpha = 0.28 * k * k;
          c.drawImage(this._glowFor(f.color), f.x - r, f.y - r, r * 2, r * 2);
          c.globalAlpha = 0.1 * k * k;
          c.fillStyle = "#ffffff";
          c.beginPath(); c.arc(f.x, f.y, Math.max(1, f.r * 0.12), 0, TAU); c.fill();
          c.globalAlpha = 1;
        } else if (f.kind === "ring") {
          const r = f.r0 + (f.r1 - f.r0) * easeOut(u);
          c.strokeStyle = this._rgba(f.color, k * 0.62);
          c.lineWidth = f.width * k + 0.4;
          c.beginPath(); c.arc(f.x, f.y, r, 0, TAU); c.stroke();
          c.strokeStyle = this._rgba("#ffffff", k * 0.12);
          c.lineWidth = 0.8;
          c.beginPath(); c.arc(f.x, f.y, r * 0.96, 0, TAU); c.stroke();
        } else if (f.kind === "line") {
          c.save();
          c.translate(f.x, f.y);
          c.rotate(f.a);
          const reach = f.len * (0.25 + easeOut(u) * 0.9);
          const lg = c.createLinearGradient(-reach, 0, reach, 0);
          lg.addColorStop(0, this._rgba(f.color, 0));
          lg.addColorStop(0.35, this._rgba(f.color, 0.18 * k));
          lg.addColorStop(0.5, this._rgba("#ffffff", 0.38 * k));
          lg.addColorStop(0.65, this._rgba(f.color, 0.18 * k));
          lg.addColorStop(1, this._rgba(f.color, 0));
          c.strokeStyle = lg;
          c.lineWidth = 0.9 + k * 1.6;
          c.beginPath(); c.moveTo(-reach, 0); c.lineTo(reach, 0); c.stroke();
          c.restore();
        } else if (f.kind === "glint") {
          c.save();
          c.translate(f.x, f.y);
          c.rotate(f.rot);
          const gs = f.size * (0.35 + k * 0.9);
          c.strokeStyle = this._rgba(f.color, k * 0.9);
          c.lineWidth = 1.15;
          c.lineCap = "round";
          c.beginPath();
          c.moveTo(-gs, 0); c.lineTo(gs, 0);
          c.moveTo(0, -gs * 0.58); c.lineTo(0, gs * 0.58);
          c.stroke();
          c.fillStyle = this._rgba("#ffffff", k);
          c.beginPath(); c.arc(0, 0, Math.max(0.6, 1.4 * k), 0, TAU); c.fill();
          c.restore();
        } else if (f.kind === "ray") {
          c.save();
          c.translate(f.x, f.y);
          c.rotate(f.a);
          const reach = f.len * (0.35 + easeOut(u) * 0.85);
          const lg = c.createLinearGradient(-reach, 0, reach, 0);
          lg.addColorStop(0, this._rgba(f.color, 0));
          lg.addColorStop(0.42, this._rgba(f.color, 0.18 * k));
          lg.addColorStop(0.5, this._rgba(f.color, 0.42 * k));
          lg.addColorStop(0.58, this._rgba(f.color, 0.18 * k));
          lg.addColorStop(1, this._rgba(f.color, 0));
          c.strokeStyle = lg;
          c.lineWidth = Math.max(0.4, f.width * k);
          c.lineCap = "round";
          c.beginPath(); c.moveTo(-reach, 0); c.lineTo(reach, 0); c.stroke();
          c.restore();
        } else if (f.kind === "puff") {
          const r = f.size * (0.8 + easeOut(u) * 1.9);
          c.globalAlpha = k * 0.18;
          c.fillStyle = this._rgba(f.color, 0.5);
          c.beginPath(); c.arc(f.x, f.y, r, 0, TAU); c.fill();
          c.globalAlpha = k * 0.12;
          c.fillStyle = this._rgba("#fff4e2", 0.55);
          c.beginPath(); c.arc(f.x, f.y, r * 0.5, 0, TAU); c.fill();
          c.globalAlpha = 1;
        } else if (f.kind === "bubble") {
          const r = f.size * (0.65 + u * 0.5);
          c.globalAlpha = k * 0.7;
          c.strokeStyle = this._rgba(f.color, 0.85);
          c.lineWidth = 1.1;
          c.beginPath(); c.arc(f.x, f.y, r, 0, TAU); c.stroke();
          c.globalAlpha = k * 0.45;
          c.fillStyle = "rgba(255,255,255,.6)";
          c.beginPath(); c.arc(f.x - r * 0.28, f.y - r * 0.3, r * 0.22, 0, TAU); c.fill();
          c.globalAlpha = 1;
        } else if (f.kind === "shard") {
          c.globalAlpha = k;
          c.strokeStyle = f.color;
          c.lineWidth = Math.max(0.5, f.width * (0.4 + k * 0.8));
          c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x - f.vx * 0.024, f.y - f.vy * 0.024); c.stroke();
          const sgs = f.width * 4.2 * k;
          c.globalAlpha = k * 0.45;
          c.drawImage(this._glowFor(f.color), f.x - sgs / 2, f.y - sgs / 2, sgs, sgs);
          c.globalAlpha = 1;
        } else {
          // spark: a bright head with a short motion trail
          const sp = Math.hypot(f.vx, f.vy) || 1;
          const tx = f.x - (f.vx / sp) * f.size * (2.6 + k * 4.2);
          const ty = f.y - (f.vy / sp) * f.size * (2.6 + k * 4.2);
          const gs = f.size * (3.0 + k * 2.4);
          c.globalAlpha = k * 0.55;
          c.drawImage(this._glowFor(f.color), f.x - gs / 2, f.y - gs / 2, gs, gs);
          c.globalAlpha = k * 0.9;
          c.strokeStyle = f.color;
          c.lineWidth = Math.max(0.6, f.size * (0.35 + k * 0.75));
          c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(tx, ty); c.stroke();
          c.fillStyle = "#ffffff";
          c.globalAlpha = k * 0.55;
          c.beginPath(); c.arc(f.x, f.y, Math.max(0.4, f.size * 0.3 * k), 0, TAU); c.fill();
          c.globalAlpha = 1;
        }
      }
      c.restore();
    }

    _rgba(hex, a) {
      if (hex.startsWith("rgba")) return hex;
      const h = hex.replace("#", "");
      const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
      const n = parseInt(v, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
  }

  window.PHINEON_GAME = { Game };
})();
