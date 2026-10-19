/* PHI:NEON — charts
 * All note times are in seconds. s is -1..1 along the judgement line.
 * Types: tap / drag / flick / hold (hold has dur, seconds)
 */
(function () {
  "use strict";

  const META = window.TRACK_META;

  const SONGS = {
    "neon-pulse": {
      id: "neon-pulse",
      title: "NEON PULSE",
      artist: "DSH SOUND LAB",
      bpm: 176,
      duration: 90,
      cover: "img/neon-pulse.png",
      accent: "#38f4ff",
      accent2: "#ff3ec8",
      tag: "DRUM & BASS",
      desc: "疾驰的霓虹脉冲。四分音符铺底，十六分音符在副歌里炸开。",
      levels: { HD: 10, IN: 14 },
      theme: { bg: "grid", hit: "ring", note: "capsule", line: "neon" },
    },
    frostlight: {
      id: "frostlight",
      title: "FROSTLIGHT",
      artist: "DSH SOUND LAB",
      bpm: 144,
      duration: 90,
      cover: "img/frostlight.png",
      accent: "#7fe3ff",
      accent2: "#d9b8ff",
      tag: "MELODIC FUTURE BASS",
      desc: "冰晶折射的微光。长按与滑动，跟着旋律呼吸。",
      levels: { HD: 9, IN: 13 },
      theme: { bg: "aurora", hit: "shard", note: "ice", line: "crystal" },
    },
    "ion-rush": {
      id: "ion-rush",
      title: "ION RUSH",
      artist: "DSH SOUND LAB",
      bpm: 200,
      duration: 90,
      cover: "img/ion-rush.png",
      accent: "#ff5a2e",
      accent2: "#ffd24a",
      tag: "HARDCORE / SPEEDCORE",
      desc: "反应堆超载的 200 BPM。四拍底鼓与失真贝斯轮番轰击，副歌密到不留空隙。",
      levels: { HD: 11, IN: 15 },
      theme: { bg: "hazard", hit: "spark", note: "bolt", line: "hard" },
    },
    "velvet-static": {
      id: "velvet-static",
      title: "VELVET STATIC",
      artist: "DSH SOUND LAB",
      bpm: 88,
      duration: 90,
      cover: "img/velvet-static.png",
      accent: "#ffb27a",
      accent2: "#c39bff",
      tag: "LO-FI JAZZ-HOP",
      desc: "磁带底噪里的黄昏。慢拍鼓刷、电钢和弦，和一段慵懒的弱音小号。",
      levels: { HD: 8, IN: 12 },
      theme: { bg: "grain", hit: "dust", note: "soft", line: "soft" },
    },
    "glass-tide": {
      id: "glass-tide",
      title: "GLASS TIDE",
      artist: "DSH SOUND LAB",
      bpm: 112,
      duration: 90,
      cover: "img/glass-tide.png",
      accent: "#5ff0e0",
      accent2: "#4d8bff",
      tag: "AMBIENT / IDM",
      desc: "深水下的玻璃回声。长音铺底，琶音像气泡一样升起，节拍偶尔缺席。",
      levels: { HD: 9, IN: 13 },
      theme: { bg: "caustics", hit: "ripple", note: "shell", line: "float" },
    },
  };

  function chartFor(songId, diff) {
    const song = SONGS[songId];
    const meta = META[songId];
    const beat = 60 / song.bpm;
    const bar = beat * 4;
    const isIN = diff === "IN";
    const notes = [];
    const line = [];

    const at = (b, be) => b * bar + be * beat;
    function N(b, be, type, s, durBeats) {
      const t = at(b, be);
      const n = { t: +t.toFixed(5), type, s: +s.toFixed(4) };
      if (type === "hold") n.dur = +(durBeats * beat).toFixed(5);
      notes.push(n);
    }
    function L(b, be, x, y, a) {
      line.push({ t: +at(b, be).toFixed(5), x, y, a });
    }
    function tapGrid(b, beats, sArr, type) {
      for (let i = 0; i < beats.length; i++) {
        N(b, beats[i], type || "tap", sArr[i % sArr.length]);
      }
    }

    const zig = [-0.30, -0.15, 0.02, 0.16, 0.30, 0.16, 0.02, -0.15];
    const wave = [-0.30, -0.10, 0.10, 0.30, 0.18, 0.00, -0.18, -0.30];
    const alt = [-0.26, 0.26, -0.20, 0.20, -0.14, 0.14, -0.08, 0.08];
    const eight = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    const quarter = [0, 1, 2, 3];
    const sFor = (b, i) => (b % 3 === 0 ? wave : b % 3 === 1 ? zig : alt)[i % 8];

    if (songId === "neon-pulse") {
      // ---------------- line choreography ----------------
      L(0, 0, 0.50, 0.575, 0);
      L(6, 0, 0.50, 0.575, 0);
      L(8, 0, 0.49, 0.565, -0.03);
      L(10, 0, 0.47, 0.555, 0.05);
      L(12, 0, 0.53, 0.55, -0.06);
      L(14, 0, 0.50, 0.54, 0.03);
      L(16, 0, 0.50, 0.56, 0.10);
      for (let b = 18; b <= 30; b += 2) {
        L(b, 0, b % 4 === 0 ? 0.44 : 0.56, 0.55 + (b % 6) * 0.004, b % 4 === 0 ? -0.14 : 0.14);
      }
      L(31, 0, 0.50, 0.53, 0.04);
      L(32, 0, 0.50, 0.43, 0.16);
      L(34, 0, 0.44, 0.46, -0.22);
      L(36, 0, 0.54, 0.42, 0.30);
      L(37, 0, 0.50, 0.47, 0.62);
      L(38, 0, 0.50, 0.51, 1.10);
      L(39, 0, 0.50, 0.53, 1.57);
      L(40, 0, 0.50, 0.54, 0.10);
      L(42, 0, 0.43, 0.55, -0.15);
      L(44, 0, 0.57, 0.50, 0.20);
      L(46, 0, 0.50, 0.54, 0.00);
      L(47, 0, 0.50, 0.54, 1.10);
      L(48, 0, 0.50, 0.54, 2.20);
      L(49, 0, 0.50, 0.54, 3.40);
      L(50, 0, 0.50, 0.54, 4.80);
      L(51, 0, 0.50, 0.54, 6.2832);
      L(53, 0, 0.56, 0.52, 0.12);
      L(55, 0, 0.45, 0.55, -0.10);
      L(56, 0, 0.50, 0.52, 0.00);
      L(57, 0, 0.46, 0.50, -0.12);
      L(58, 0, 0.54, 0.52, 0.12);
      L(60, 0, 0.50, 0.55, 0.00);
      L(66, 0, 0.50, 0.58, 0.00);

      // ---------------- intro / first motif ----------------
      N(2, 0, "tap", -0.10);
      N(4, 0, "tap", 0.12);
      N(5, 2, "drag", -0.06);
      for (let b = 7; b <= 9; b++) {
        N(b, 0, "tap", -0.18);
        N(b, 1.5, "drag", 0.0);
        N(b, 2.5, "tap", 0.20);
        if (isIN) N(b, 3.25, "drag", -0.06);
      }

      // build 1
      for (let b = 10; b <= 13; b++) {
        const steps = isIN ? eight : quarter;
        for (let i = 0; i < steps.length; i++) {
          N(b, steps[i], b === 13 && i === steps.length - 1 && isIN ? "flick" : "tap", sFor(b, i));
        }
        if (isIN) N(b, 3.25, "drag", 0.34);
      }
      if (isIN) {
        N(14, 0, "hold", -0.22, 2.0);
        for (let i = 0; i < 8; i++) N(14, 2 + i * 0.25, "tap", i % 2 ? 0.16 : -0.16);
        N(15, 0, "hold", 0.22, 3.0);
        N(15, 1.5, "drag", -0.34);
        N(15, 2.5, "drag", 0.34);
        for (let i = 0; i < 8; i++) N(15, 2 + i * 0.25, "tap", i % 2 ? 0.10 : -0.10);
        N(15, 3.5, "flick", -0.28);
      } else {
        N(14, 0, "hold", -0.20, 2.0);
        N(14, 2, "tap", 0.20);
        N(15, 0, "hold", 0.20, 2.0);
        N(15, 2, "tap", -0.20);
        N(15, 3.0, "tap", 0.30);
      }

      // ---------------- drop 1 ----------------
      for (let b = 16; b <= 31; b++) {
        const burst = isIN && (b === 20 || b === 28);
        const impact = b === 16 || b === 24;
        if (impact) {
          N(b, 0, "flick", -0.30);
          N(b, 0, "tap", 0.30);
        }
        if (burst) {
          for (let i = 0; i < 4; i++) N(b, i * 0.5, "tap", zig[i]);
          for (let i = 0; i < 8; i++) N(b, 2 + i * 0.25, "tap", i % 2 ? 0.28 : -0.28);
        } else {
          for (let i = impact ? 1 : 0; i < 8; i++) {
            let type = "tap";
            if (isIN && b % 4 === 3 && i === 7) type = "flick";
            N(b, i * 0.5, type, sFor(b, i));
          }
        }
        if (isIN && !burst) {
          N(b, 3.25, "drag", b % 2 ? -0.33 : 0.33);
          if (b % 2 === 0) N(b, 1.25, "drag", 0.0);
        }
        if ((b === 23 || b === 31) && isIN) {
          N(b, 2.0, "hold", -0.28, 2.0);
        }
      }
      // drop 1 extra texture
      if (isIN) {
        N(19, 1.25, "drag", 0.18);
        N(27, 0.75, "drag", -0.18);
        N(27, 2.75, "drag", 0.18);
      }

      // ---------------- break ----------------
      N(32, 0, "hold", -0.24, 7.5);
      N(33, 1.0, "drag", 0.24);
      N(33, 2.0, "drag", 0.30);
      N(33, 3.0, "drag", 0.24);
      if (isIN) {
        N(34, 0, "hold", 0.26, 3.5);
        for (let i = 0; i < 4; i++) N(34, 1 + i * 0.5, "drag", -0.2 + i * 0.1);
        N(35, 0, "hold", -0.26, 2.5);
        N(35, 2.5, "drag", 0.0);
        N(35, 3.5, "drag", 0.30);
        N(36, 0, "hold", 0.0, 4.0);
        tapGrid(36, [0.5, 1, 1.5, 2.5, 3, 3.5], [-0.30, -0.10, 0.10, 0.30, 0.10, -0.10], "drag");
        for (let i = 0; i < 4; i++) N(37, i, "drag", zig[i]);
        for (let i = 0; i < 8; i++) N(38, i * 0.5, "tap", sFor(38, i));
        N(38, 1.75, "flick", 0.32);
        for (let i = 0; i < 8; i++) N(39, i * 0.5, i === 7 ? "flick" : "tap", sFor(39, i));
        N(39, 3.0, "hold", -0.30, 2.0);
      } else {
        N(34, 0, "tap", -0.24);
        N(34, 2, "tap", 0.24);
        N(35, 0, "drag", 0.0);
        for (let i = 0; i < 4; i++) N(36 + (i >> 1), (i % 2) * 2, "tap", i % 2 ? 0.24 : -0.24);
        N(37, 0, "drag", 0.0);
        N(38, 0, "tap", -0.2);
        N(38, 2, "tap", 0.2);
        N(39, 0, "tap", -0.25);
        N(39, 2, "tap", 0.25);
      }

      // ---------------- drop 2 ----------------
      for (let b = 40; b <= 55; b++) {
        const impact = b === 40 || b === 48;
        if (impact) {
          N(b, 0, "flick", -0.32);
          N(b, 0, "tap", 0.32);
        }
        const burst = isIN && (b % 8 === 4 || b % 8 === 6);
        if (burst) {
          for (let i = 0; i < 4; i++) N(b, i * 0.5, "tap", zig[i]);
          for (let i = 0; i < 8; i++) N(b, 2 + i * 0.25, i % 4 === 3 ? "flick" : "tap", i % 2 ? 0.24 : -0.24);
        } else {
          for (let i = impact ? 1 : 0; i < 8; i++) {
            let type = "tap";
            if (isIN && b % 4 === 2 && i === 3) type = "flick";
            N(b, i * 0.5, type, b % 2 ? alt[i] : wave[i]);
          }
        }
        if (isIN) {
          if (!burst) N(b, 3.25, "drag", b % 2 ? 0.34 : -0.34);
          if (b % 4 === 0) N(b, 1.25, "drag", 0.34);
        }
        if (b === 44 || b === 52) N(b, 0, "hold", 0.0, 2.0);
      }
      if (isIN) {
        N(43, 3.5, "flick", -0.32);
        N(45, 1.75, "drag", 0.0);
        N(51, 1.0, "hold", -0.30, 3.0);
        N(51, 2.5, "drag", 0.30);
        N(55, 2.0, "flick", 0.32);
      }

      // ---------------- finale ----------------
      N(56, 0, "hold", 0.0, 4.0);
      if (isIN) {
        N(56, 0, "flick", -0.32);
        for (let i = 0; i < 4; i++) N(56, 0.5 + i * 0.5, "drag", i % 2 ? 0.30 : -0.30);
      }
      for (let i = 0; i < 8; i++) N(57, i * 0.5, i === 7 ? "flick" : "tap", i % 2 ? 0.26 : -0.26);
      if (isIN) {
        for (let i = 0; i < 12; i++) N(58, i * 0.25, "tap", i % 2 ? 0.12 : -0.12);
        N(58, 3.5, "flick", 0.32);
      } else {
        for (let i = 0; i < 4; i++) N(58, i, "tap", i % 2 ? 0.22 : -0.22);
      }
      N(59, 0, "hold", -0.2, 3.0);
      N(59, 1.5, "drag", 0.2);
      N(59, 2.5, "drag", 0.3);

      // ---------------- outro ----------------
      N(60, 0, "flick", 0.0);
      N(60, 2.0, "tap", -0.24);
      N(60, 3.0, "tap", 0.24);
      N(62, 0, "drag", -0.18);
      N(62, 2, "tap", 0.18);
      N(64, 0, "drag", 0.0);
      N(65, 2, "tap", -0.1);
    }

    if (songId === "frostlight") {
      // ---------------- line choreography ----------------
      L(0, 0, 0.50, 0.58, 0);
      L(8, 0, 0.50, 0.575, 0);
      L(10, 0, 0.47, 0.57, -0.04);
      L(12, 0, 0.53, 0.56, 0.05);
      L(14, 0, 0.50, 0.55, 0);
      L(16, 0, 0.50, 0.56, 0.07);
      L(18, 0, 0.43, 0.555, -0.12);
      L(20, 0, 0.57, 0.545, 0.12);
      L(22, 0, 0.48, 0.56, -0.06);
      L(24, 0, 0.54, 0.55, 0.10);
      L(26, 0, 0.46, 0.555, -0.10);
      L(28, 0, 0.52, 0.54, 0.06);
      L(30, 0, 0.50, 0.45, 0.14);
      L(32, 0, 0.44, 0.46, -0.22);
      L(34, 0, 0.56, 0.43, 0.26);
      L(35, 0, 0.50, 0.47, 0.55);
      L(36, 0, 0.50, 0.50, 0.95);
      L(37, 0, 0.50, 0.53, 1.45);
      L(38, 0, 0.50, 0.55, 0.08);
      L(40, 0, 0.44, 0.55, -0.12);
      L(42, 0, 0.56, 0.545, 0.12);
      L(44, 0, 0.47, 0.555, -0.08);
      L(46, 0, 0.53, 0.55, 0.10);
      L(47, 0, 0.50, 0.55, 0.80);
      L(48, 0, 0.50, 0.55, 1.60);
      L(49, 0, 0.50, 0.55, 2.40);
      L(50, 0, 0.50, 0.56, 0.00);
      L(52, 0, 0.50, 0.57, 0.00);
      L(54, 0, 0.50, 0.58, 0.00);

      // ---------------- intro ----------------
      N(2, 0, "tap", 0.0);
      N(4, 0, "tap", -0.15);
      N(5, 2, "drag", 0.15);
      for (let b = 6; b <= 7; b++) {
        N(b, 0, "tap", -0.20);
        N(b, 2, "tap", 0.20);
        if (isIN) N(b, 1.0, "drag", 0.0);
      }

      // build
      for (let b = 8; b <= 13; b++) {
        const steps = isIN ? eight : quarter;
        for (let i = 0; i < steps.length; i++) {
          N(b, steps[i], "tap", sFor(b + 1, i));
        }
        if (isIN && b % 2 === 1) N(b, 2.75, "drag", 0.33);
      }
      if (isIN) {
        N(14, 0, "hold", -0.18, 2.0);
        N(14, 2, "drag", 0.28);
        for (let i = 0; i < 8; i++) N(14, 2 + i * 0.25, "tap", i % 2 ? 0.14 : -0.14);
        N(15, 0, "hold", 0.18, 2.5);
        N(15, 1.0, "drag", -0.30);
        for (let i = 0; i < 8; i++) N(15, 2 + i * 0.25, i === 7 ? "flick" : "tap", i % 2 ? 0.10 : -0.10);
      } else {
        N(14, 0, "hold", -0.20, 2.0);
        N(14, 2, "tap", 0.22);
        N(15, 0, "hold", 0.20, 2.0);
        N(15, 2, "tap", -0.22);
      }

      // ---------------- drop 1 ----------------
      for (let b = 16; b <= 29; b++) {
        const impact = b === 16;
        if (impact) {
          N(b, 0, "flick", -0.30);
          N(b, 0, "tap", 0.30);
        }
        const burst = isIN && (b === 20 || b === 24 || b === 28);
        if (burst) {
          for (let i = 0; i < 4; i++) N(b, i * 0.5, "tap", b % 2 ? zig[i] : wave[i]);
          for (let i = 0; i < 8; i++) N(b, 2 + i * 0.25, "tap", i % 2 ? 0.26 : -0.26);
        } else {
          for (let i = impact ? 1 : 0; i < 8; i++) {
            N(b, i * 0.5, isIN && b === 26 && i === 6 ? "flick" : "tap", b % 2 ? alt[i] : zig[i]);
          }
        }
        if (isIN && !burst) {
          N(b, 3.25, "drag", b % 2 ? 0.32 : -0.32);
          if (b % 4 === 0) N(b, 1.25, "drag", -0.05);
        }
        if (b === 19 || b === 27) N(b, 2.0, "hold", 0.0, 2.0);
      }

      // ---------------- break ----------------
      N(30, 0, "hold", -0.22, 4.0);
      N(30, 2.0, "drag", 0.22);
      N(31, 1.0, "drag", 0.28);
      if (isIN) {
        N(31, 0, "tap", 0.14);
        N(31, 2, "tap", -0.14);
        N(32, 0, "hold", 0.24, 3.5);
        for (let i = 0; i < 4; i++) N(32, 1 + i * 0.5, "drag", -0.2 + i * 0.12);
        N(33, 0, "hold", -0.24, 2.5);
        N(33, 2.5, "drag", 0.0);
        N(34, 0, "hold", 0.0, 4.0);
        tapGrid(34, [0.5, 1, 1.5, 2.5, 3], [-0.3, -0.1, 0.1, 0.3, 0.1], "drag");
        for (let i = 0; i < 4; i++) N(35, i, "drag", zig[i]);
        for (let i = 0; i < 8; i++) N(36, i * 0.5, "tap", sFor(36, i));
        N(36, 1.75, "flick", 0.30);
        for (let i = 0; i < 8; i++) N(37, i * 0.5, i === 7 ? "flick" : "tap", sFor(37, i));
      } else {
        N(31, 0, "tap", 0.18);
        N(31, 2, "tap", -0.18);
        N(32, 0, "hold", 0.22, 2.0);
        N(33, 0, "tap", -0.2);
        N(33, 2, "tap", 0.2);
        for (let i = 0; i < 6; i++) N(35, i, "drag", i % 2 ? 0.2 : -0.2);
        N(36, 0, "tap", -0.2);
        N(36, 2, "tap", 0.2);
        N(37, 0, "tap", -0.22);
        N(37, 2, "tap", 0.22);
      }

      // ---------------- drop 2 ----------------
      for (let b = 38; b <= 49; b++) {
        const impact = b === 38 || b === 46;
        if (impact) {
          N(b, 0, "flick", -0.32);
          N(b, 0, "tap", 0.32);
        }
        const burst = isIN && b % 4 === 0;
        if (burst) {
          for (let i = 0; i < 4; i++) N(b, i * 0.5, "tap", b % 2 ? alt[i] : wave[i]);
          for (let i = 0; i < 8; i++) N(b, 2 + i * 0.25, i % 4 === 3 ? "flick" : "tap", i % 2 ? 0.24 : -0.24);
        } else {
          for (let i = impact ? 1 : 0; i < 8; i++) {
            N(b, i * 0.5, isIN && b % 4 === 2 && i === 3 ? "flick" : "tap", b % 2 ? wave[i] : zig[i]);
          }
        }
        if (isIN) {
          if (!burst) N(b, 3.25, "drag", b % 2 ? -0.33 : 0.33);
          if (b === 42) N(b, 2.0, "hold", 0.0, 2.0);
        }
      }
      if (isIN) {
        N(41, 1.75, "drag", 0.0);
        N(45, 1.0, "hold", -0.28, 3.0);
        N(45, 2.5, "drag", 0.28);
        N(49, 2.0, "flick", 0.30);
      }

      // ---------------- outro ----------------
      N(50, 0, "flick", 0.0);
      N(50, 2, "tap", -0.22);
      N(51, 0, "drag", 0.0);
      N(51, 2, "tap", 0.22);
      N(52, 0, "drag", -0.16);
      N(52, 2, "tap", 0.16);
      N(53, 1.0, "tap", -0.08);
    }

    // ================= ION RUSH — 200 BPM, 75 bars =================
    if (songId === "ion-rush") {
      L(0, 0, 0.50, 0.56, 0);
      L(8, 0, 0.50, 0.56, 0);
      L(10, 0, 0.46, 0.54, -0.06);
      L(12, 0, 0.54, 0.54, 0.07);
      L(14, 0, 0.50, 0.52, 0.00);
      L(16, 0, 0.50, 0.54, 0.12);
      for (let b = 18; b <= 32; b += 2) {
        L(b, 0, b % 4 === 0 ? 0.42 : 0.58, 0.52 + ((b / 2) % 3) * 0.01, b % 4 === 0 ? -0.26 : 0.26);
      }
      L(33, 0, 0.50, 0.52, 0.0);
      L(34, 0, 0.50, 0.46, 0.22);
      L(36, 0, 0.44, 0.48, -0.35);
      L(37, 0, 0.56, 0.44, 0.30);
      L(38, 0, 0.50, 0.50, 0.95);
      L(39, 0, 0.50, 0.53, 1.62);
      L(40, 0, 0.50, 0.55, 2.40);
      L(41, 0, 0.50, 0.56, 3.10);
      L(42, 0, 0.50, 0.54, 0.06);
      L(50, 0, 0.46, 0.53, -0.14);
      L(58, 0, 0.54, 0.55, 0.14);
      L(66, 0, 0.50, 0.55, 0.00);
      L(75, 0, 0.50, 0.57, 0.00);

      // intro
      N(2, 0, "tap", -0.06);
      N(4, 0, "tap", 0.10);
      N(4, 2, "tap", -0.22);
      N(5, 0, "tap", 0.22);
      N(5, 1.5, "drag", 0.0);
      for (let b = 6; b <= 7; b++) {
        N(b, 0, "tap", -0.22);
        N(b, 1, "tap", 0.22);
        N(b, 2, "tap", -0.1);
        N(b, 2.5, "tap", 0.12);
        N(b, 3, "tap", 0.3);
        if (isIN) { N(b, 1.5, "drag", 0.0); N(b, 3.5, "drag", -0.3); }
      }

      // build
      for (let b = 8; b <= 15; b++) {
        const steps = 8;
        for (let i = 0; i < steps; i++) {
          N(b, i * (4 / steps), i === steps - 1 ? "flick" : "tap", sFor(b, i));
        }
        if (isIN) {
          N(b, 0.25, "tap", 0.32);
          if (b % 2 === 0) N(b, 2.75, "drag", -0.32);
        }
      }
      N(14, 2.0, "hold", -0.26, 2.0);

      // drop 1
      for (let b = 16; b <= 33; b++) {
        const impact = b % 8 === 0;
        const burst = isIN && b % 4 === 3;
        if (impact) { N(b, 0, "flick", -0.3); N(b, 0, "tap", 0.3); }
        const from = impact ? 1 : 0;
        const upto = burst ? 4 : 8;
        for (let i = from; i < upto; i++) {
          N(b, i * 0.5, isIN && i === 7 && b % 2 === 0 ? "flick" : "tap", sFor(b, i));
        }
        if (burst) {
          for (let i = 0; i < 8; i++) {
            N(b, 2 + i * 0.25, i % 4 === 3 ? "drag" : "tap", i % 2 ? 0.26 : -0.26);
          }
        }
        if (isIN) {
          N(b, 3.5, "drag", b % 2 ? 0.34 : -0.34);
          if (b % 4 === 0) N(b, 1.25, "tap", 0.0);
        }
        if (b === 20 || b === 28) N(b, 2, "hold", 0.0, 2.0);
      }

      // break
      N(34, 0, "hold", -0.24, 4.0);
      N(35, 0, "drag", 0.26);
      N(35, 1, "drag", 0.30);
      N(35, 2, "drag", 0.24);
      if (isIN) {
        N(36, 0, "hold", 0.26, 3.0);
        for (let i = 0; i < 4; i++) N(36, 1 + i * 0.5, "drag", -0.24 + i * 0.12);
        N(37, 0, "hold", -0.26, 2.0);
        N(37, 2.5, "drag", 0.0);
        for (let i = 0; i < 8; i++) N(38, i * 0.5, "tap", sFor(38, i));
        N(38, 1.75, "flick", 0.32);
        for (let i = 0; i < 8; i++) N(39, i * 0.5, i === 7 ? "flick" : "tap", sFor(39, i));
        N(40, 0, "hold", -0.3, 2.0);
        N(40, 2, "drag", 0.3);
        for (let i = 0; i < 8; i++) N(41, i * 0.5, "tap", i % 2 ? 0.2 : -0.2);
        N(41, 3.5, "flick", 0.34);
      } else {
        N(36, 0, "tap", 0.0);
        N(36, 2, "tap", 0.2);
        N(37, 0, "hold", -0.26, 2.0);
        for (let i = 0; i < 4; i++) N(38, i, "tap", sFor(38, i * 2));
        N(39, 0, "drag", 0.0);
        N(39, 2, "tap", 0.24);
        N(40, 0, "hold", -0.3, 2.0);
        N(41, 1.0, "tap", 0.2);
      }

      // drop 2
      for (let b = 42; b <= 65; b++) {
        const impact = b % 8 === 0;
        const burst = isIN && b % 2 === 1;
        if (impact) { N(b, 0, "flick", 0.3); N(b, 0, "tap", -0.3); }
        const from = impact ? 1 : 0;
        const upto = burst ? 4 : 8;
        for (let i = from; i < upto; i++) {
          N(b, i * 0.5, isIN && i === 7 && b % 2 === 0 ? "flick" : "tap", sFor(b, i));
        }
        if (burst) {
          for (let i = 0; i < 8; i++) {
            N(b, 2 + i * 0.25, i % 4 === 3 ? "drag" : "tap", i % 2 ? -0.26 : 0.26);
          }
        }
        if (isIN) N(b, 3.5, "drag", b % 2 ? -0.34 : 0.34);
        if (b === 48 || b === 56) N(b, 2, "hold", 0.0, 2.0);
      }
      if (isIN) { N(64, 0, "hold", -0.28, 2.0); N(64, 2, "drag", 0.28); }

      // outro
      N(66, 0, "flick", 0.0);
      N(66, 2, "tap", -0.24);
      N(66, 2.5, "tap", 0.24);
      N(67, 0, "drag", -0.3);
      N(67, 1.5, "tap", 0.3);
      N(68, 0, "hold", -0.2, 2.0);
      N(68, 2, "tap", 0.2);
      N(70, 0, "tap", 0.0);
      N(71, 0, "drag", -0.12);
      N(72, 0, "tap", 0.12);
      N(74, 0, "tap", 0.0);
      if (isIN) { N(69, 0, "tap", -0.2); N(69, 1, "tap", 0.2); N(73, 0, "drag", 0.0); }
    }

    // ================= VELVET STATIC — 88 BPM, 33 bars =================
    if (songId === "velvet-static") {
      L(0, 0, 0.50, 0.58, 0);
      L(4, 0, 0.50, 0.575, 0);
      L(8, 0, 0.47, 0.57, -0.05);
      L(12, 0, 0.53, 0.565, 0.05);
      L(16, 0, 0.50, 0.55, 0.12);
      L(17, 0, 0.46, 0.54, -0.2);
      L(18, 0, 0.54, 0.56, 0.28);
      L(19, 0, 0.50, 0.55, 0.6);
      L(20, 0, 0.50, 0.56, -0.04);
      L(24, 0, 0.52, 0.55, 0.06);
      L(29, 0, 0.50, 0.57, 0);
      L(33, 0, 0.50, 0.58, 0);

      const chord = (b, be, s1, s2) => { N(b, be, "tap", s1); N(b, be, "tap", s2); };

      N(2, 0, "tap", 0.0);
      N(3, 2, "drag", 0.0);
      for (let b = 4; b <= 7; b++) {
        N(b, 0, "tap", -0.18);
        chord(b, 2, -0.2, 0.2);
        if (b % 2 === 0) N(b, 1, "tap", 0.16);
        N(b, 3, "tap", b % 2 ? 0.1 : -0.1);
        N(b, 0.5, "tap", -0.3);
        N(b, 1.5, "tap", 0.3);
        N(b, 2.5, "tap", -0.1);
        N(b, 3.5, "tap", 0.1);
        if (isIN) { N(b, 2.25, "drag", 0.0); N(b, 3.75, "drag", 0.28); }
      }

      for (let b = 8; b <= 15; b++) {
        chord(b, 0, -0.26, 0.26);
        N(b, 1, "tap", b % 2 ? 0.0 : -0.12);
        chord(b, 2, -0.3, 0.3);
        N(b, 3, "drag", b % 2 ? 0.18 : -0.18);
        if (isIN) {
          N(b, 0.5, "tap", 0.1);
          N(b, 1.5, "drag", -0.32);
          N(b, 2.5, "tap", 0.0);
          N(b, 3.5, "tap", 0.32);
        } else {
          N(b, 1.5, "tap", 0.22);
          N(b, 2.5, "tap", -0.22);
        }
        if (isIN) { N(b, 2.75, "tap", -0.36); N(b, 3.25, "tap", 0.36); }
        if (b % 4 === 0) N(b, 1.5, "hold", 0.0, 1.0);
      }

      N(16, 0, "hold", -0.22, 4.0);
      N(17, 0, "drag", 0.24);
      N(17, 2, "drag", 0.28);
      if (isIN) {
        N(17, 1, "tap", -0.3);
        N(17, 3, "tap", -0.26);
        N(18, 0, "hold", 0.24, 2.0);
        N(18, 2, "drag", 0.0);
        N(19, 0, "tap", -0.2);
        N(19, 2, "tap", 0.2);
        for (let i = 0; i < 8; i++) N(19, i * 0.5, "tap", sFor(19, i));
      } else {
        N(18, 0, "tap", 0.2);
        N(18, 2, "tap", -0.2);
        N(19, 0, "drag", 0.0);
      }

      for (let b = 20; b <= 28; b++) {
        chord(b, 0, -0.28, 0.28);
        for (let i = 1; i < 4; i++) N(b, i, "tap", i % 2 ? 0.14 : -0.14);
        if (isIN) {
          N(b, 0.5, "tap", 0.32);
          N(b, 1.5, "drag", -0.3);
          N(b, 2.5, "tap", 0.0);
          N(b, 3.5, "tap", -0.32);
        } else {
          N(b, 0.5, "tap", -0.32);
          N(b, 1.5, "tap", 0.32);
          N(b, 2.5, "tap", -0.18);
          N(b, 3.5, "tap", 0.18);
        }
        if (isIN) { N(b, 2.25, "tap", 0.36); N(b, 3.25, "tap", -0.36); }
        if (b === 24) N(b, 2, "hold", 0.0, 2.0);
      }

      chord(29, 0, -0.2, 0.2);
      N(30, 0, "tap", 0.0);
      N(30, 2, "drag", -0.16);
      chord(31, 0, -0.12, 0.12);
      N(32, 1, "tap", 0.0);
    }

    // ================= GLASS TIDE — 112 BPM, 42 bars =================
    if (songId === "glass-tide") {
      L(0, 0, 0.5, 0.56, 0);
      L(6, 0, 0.5, 0.54, 0.02);
      L(13, 0, 0.47, 0.56, -0.06);
      L(14, 0, 0.5, 0.55, 0.0);
      for (let b = 16; b <= 25; b += 3) {
        L(b, 0, b % 2 ? 0.54 : 0.46, 0.52 + ((b - 16) % 6) * 0.012, (b % 2 ? -1 : 1) * 0.14);
      }
      L(26, 0, 0.5, 0.5, 0.1);
      L(27, 0, 0.5, 0.53, 0.5);
      L(28, 0, 0.48, 0.55, 0.9);
      L(30, 0, 0.52, 0.54, 1.4);
      L(31, 0, 0.5, 0.55, 1.7);
      L(32, 0, 0.5, 0.54, 0.05);
      L(38, 0, 0.5, 0.55, 0.0);
      L(42, 0, 0.5, 0.56, 0.0);

      N(2, 0, "tap", 0.0);
      N(4, 0, "drag", -0.2);
      N(4, 2, "tap", 0.2);
      for (let b = 6; b <= 13; b++) {
        for (let i = 0; i < 8; i++) N(b, i * 0.5, "tap", sFor(b, i % 4));
        if (b % 2 === 0) N(b, 3.5, "drag", 0.28);
        if (isIN) N(b, 0.25, "tap", -0.3);
      }
      N(12, 0, "hold", -0.26, 4.0);

      for (let b = 14; b <= 25; b++) {
        const steps = 8;
        for (let i = 0; i < steps; i++) {
          const type = i === steps - 1 && b % 2 === 1 ? "drag" : "tap";
          N(b, i * (4 / steps), type, sFor(b, i));
        }
        if (isIN) { N(b, 0.25, "tap", -0.32); N(b, 3.75, "drag", 0.32); N(b, 1.5, "tap", 0.34); N(b, 2.5, "tap", -0.34); }
        if (b % 4 === 0) N(b, 1.5, "hold", 0.0, 2.0);
        if (b % 8 === 0 && isIN) {
          for (let i = 0; i < 4; i++) N(b, 2 + i * 0.25, "tap", i % 2 ? 0.22 : -0.22);
        }
      }

      N(26, 0, "hold", -0.24, 4.0);
      N(27, 0, "drag", 0.24);
      N(27, 2, "tap", 0.28);
      if (isIN) {
        N(28, 0, "drag", -0.28);
        N(28, 1.5, "tap", 0.0);
        N(28, 3, "drag", 0.28);
        N(29, 0, "hold", 0.2, 2.0);
        N(30, 0, "tap", -0.2);
        N(30, 2, "tap", 0.2);
        N(31, 0, "drag", 0.0);
      } else {
        N(28, 0, "tap", 0.2);
        N(29, 2, "drag", -0.2);
        N(30, 0, "tap", 0.0);
        N(31, 2, "tap", 0.2);
      }

      for (let b = 32; b <= 37; b++) {
        const steps = 8;
        for (let i = 0; i < steps; i++) {
          const type = i === steps - 1 && b % 2 === 0 ? "flick" : "tap";
          N(b, i * (4 / steps), type, sFor(b, i));
        }
        if (isIN) { N(b, 0.25, "tap", 0.3); N(b, 3.75, "tap", -0.3); N(b, 1.5, "tap", -0.34); N(b, 2.5, "tap", 0.34); }
        if (b === 34) N(b, 2, "hold", 0.0, 2.0);
      }

      N(38, 0, "flick", 0.0);
      N(38, 2, "tap", -0.2);
      N(39, 0, "hold", -0.24, 3.0);
      N(39, 2, "drag", 0.24);
      N(40, 0, "tap", 0.0);
      N(41, 1, "drag", -0.1);
    }

    // sort + dedupe exact duplicates
    notes.sort((a, b) => a.t - b.t || a.s - b.s);
    const seen = new Set();
    const clean = [];
    for (const n of notes) {
      const key = n.t + "|" + n.type + "|" + n.s;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push(n);
    }
    line.sort((a, b) => a.t - b.t);

    const chart = {
      songId,
      diff,
      level: song.levels[diff],
      bpm: song.bpm,
      duration: song.duration,
      notes: clean,
      line,
      count: clean.length,
      firstNote: clean.length ? clean[0].t : 0,
      lastNote: clean.length ? clean[clean.length - 1].t : 0,
    };
    chart.stats = chartStats(chart);
    return chart;
  }

  function chartStats(chart) {
    const c = { tap: 0, drag: 0, flick: 0, hold: 0, maxSameTime: 0, maxNps: 0 };
    for (const n of chart.notes) c[n.type]++;
    const buckets = {};
    for (const n of chart.notes) {
      const k = Math.floor(n.t);
      buckets[k] = (buckets[k] || 0) + 1;
    }
    let same = {};
    for (const n of chart.notes) same[n.t] = (same[n.t] || 0) + 1;
    c.maxSameTime = Math.max(0, ...Object.values(same));
    c.maxNps = Math.max(0, ...Object.values(buckets));
    return c;
  }

  const cache = {};
  function getChart(songId, diff) {
    const key = songId + "|" + diff;
    if (!cache[key]) cache[key] = chartFor(songId, diff);
    return cache[key];
  }

  window.PHINEON_CHARTS = { SONGS, getChart };
})();
