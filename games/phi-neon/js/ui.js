/* PHI:NEON — ui / screens */
(function () {
  "use strict";

  const AUDIO = window.PHINEON_AUDIO;
  const CHARTS = window.PHINEON_CHARTS;
  const { Game } = window.PHINEON_GAME;
  const IS_TOUCH = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 0;
  const SONGS = CHARTS.SONGS;

  const $ = (id) => document.getElementById(id);
  const game = new Game($("game"));

  const SETTINGS_KEY = "phineon-settings-v1";
  const BEST_KEY = "phineon-best-v1";
  const defaults = { volume: 0.8, sfx: 0.7, offset: 0, auto: false, hints: true };
  let settings = { ...defaults };
  let bests = {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...defaults, ...JSON.parse(raw) };
    const braw = localStorage.getItem(BEST_KEY);
    if (braw) bests = JSON.parse(braw) || {};
  } catch (e) {}
  function saveBests() { try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) {} }

  let currentSong = null;
  let lastDiff = "IN";
  let lastSongId = null;
  let paused = false;
  let settingsFrom = null;
  let lastSfxPreview = 0;

  /* ---------------- menu ---------------- */
  function buildMenu() {
    const list = $("songList");
    list.innerHTML = "";
    const total = Object.keys(SONGS).length;
    $("trackCount").textContent = String(total).padStart(2, "0");
    const coverDim = {
      "neon-pulse": 0.92, frostlight: 0.78, "ion-rush": 0.74,
      "velvet-static": 0.86, "glass-tide": 0.82,
    };
    Object.values(SONGS).forEach((song, i) => {
      const hd = CHARTS.getChart(song.id, "HD");
      const inn = CHARTS.getChart(song.id, "IN");
      const card = document.createElement("button");
      card.className = "song-card";
      card.style.setProperty("--card-accent", song.accent);
      card.style.setProperty("--card-accent2", song.accent2);
      card.style.setProperty("--cover-dim", coverDim[song.id] != null ? coverDim[song.id] : 0.9);
      card.setAttribute("aria-label", song.title + " / 选择难度");
      card.innerHTML = `
        <div class="song-cover-wrap">
          <img class="song-cover" src="${song.cover}" alt="${song.title}" draggable="false" />
          <div class="song-play"><i>▶</i></div>
        </div>
        <div class="song-info">
          <div class="song-index">TRACK ${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
          <div class="song-title">${song.title}</div>
          <div class="song-artist">${song.artist}</div>
          <div class="song-tags">
            <span class="song-tag">${song.tag}</span>
            <span class="song-tag">${song.bpm} BPM</span>
            <span class="song-tag">1:30</span>
          </div>
          <div class="song-levels">
            <span class="lv-pill">HD <b>${song.levels.HD}</b> · ${hd.count}</span>
            <span class="lv-pill in">IN <b>${song.levels.IN}</b> · ${inn.count}</span>
          </div>
        </div>`;
      const best = bests[song.id + ":IN"] || bests[song.id + ":HD"];
      if (best) {
        const badge = document.createElement("div");
        badge.className = "song-best";
        badge.innerHTML = `<span>BEST</span><b>${best.rank}</b><em>${String(best.score).padStart(7, "0")}</em>`;
        card.appendChild(badge);
      }
      card.addEventListener("click", () => openDiff(song));
      list.appendChild(card);
    });
  }

  /* ---------------- difficulty ---------------- */
  function openDiff(song) {
    AUDIO.init();
    currentSong = song;
    const hd = CHARTS.getChart(song.id, "HD");
    const inn = CHARTS.getChart(song.id, "IN");
    $("diffCover").src = song.cover;
    $("diffTag").textContent = song.tag;
    $("diffTitle").textContent = song.title;
    $("diffArtist").textContent = song.artist;
    $("diffDesc").textContent = song.desc;
    $("diffBpm").textContent = song.bpm;
    $("diffNotes").textContent = inn.count;
    $("btnHD").querySelector("b").textContent = song.levels.HD;
    $("btnIN").querySelector("b").textContent = song.levels.IN;
    $("hdCount").textContent = hd.count + " NOTES";
    $("inCount").textContent = inn.count + " NOTES";
    $("diffOverlay").classList.remove("hidden");
  }

  function closeDiff() { $("diffOverlay").classList.add("hidden"); }

  /* ---------------- start / stop ---------------- */
  function startGame(songId, diff) {
    const song = SONGS[songId];
    lastSongId = songId;
    lastDiff = diff;
    closeDiff();
    $("menu").classList.add("hidden");
    document.body.classList.add("playing");
    $("resultOverlay").classList.add("hidden");
    $("pauseOverlay").classList.add("hidden");
    $("settingsOverlay").classList.add("hidden");
    const stage = $("stage");
    stage.style.setProperty("--accent", song.accent);
    stage.style.setProperty("--accent2", song.accent2);
    $("hudTitle").textContent = song.title;
    $("hudArtist").textContent = song.artist;
    $("hudDiff").textContent = diff + " " + song.levels[diff];
    $("hudDiff").style.background = song.accent;
    $("hud").classList.remove("hidden");
    $("autoTag").classList.toggle("hidden", !settings.auto);
    $("score").textContent = "0000000";
    $("acc").textContent = "100.00%";
    $("comboNum").textContent = "0";
    $("combo").classList.remove("on");
    $("progressFill").style.width = "0%";
    $("judge").className = "judge";
    paused = false;
    game.auto = settings.auto;
    game.hints = settings.hints;
    game.touch = IS_TOUCH;
    if (IS_TOUCH) {
      $("touchHint").classList.remove("hidden");
      clearTimeout(window.__phineonTouchTimer);
      window.__phineonTouchTimer = setTimeout(() => $("touchHint").classList.add("hidden"), 4200);
    }
    game.onFinish = showResult;
    game.start(songId, diff, {
      auto: settings.auto,
      offset: settings.offset,
      hints: settings.hints,
      volume: settings.volume,
    });
  }

  function quitToMenu() {
    game.stop();
    document.body.classList.remove("playing");
    paused = false;
    $("hud").classList.add("hidden");
    $("pauseOverlay").classList.add("hidden");
    $("resultOverlay").classList.add("hidden");
    $("settingsOverlay").classList.add("hidden");
    buildMenu();
    $("menu").classList.remove("hidden");
    if (currentSong) {
      $("stage").style.setProperty("--accent", "#38f4ff");
      $("stage").style.setProperty("--accent2", "#ff3ec8");
    }
  }

  function pauseGame() {
    if (game.phase !== "playing") return;
    paused = true;
    game.pause();
    $("pauseOverlay").classList.remove("hidden");
  }

  function resumeGame() {
    if (game.phase !== "paused") return;
    paused = false;
    $("pauseOverlay").classList.add("hidden");
    game.resume();
  }

  /* ---------------- results ---------------- */
  function showResult(res) {
    paused = false;
    document.body.classList.remove("playing");
    $("hud").classList.add("hidden");
    $("pauseOverlay").classList.add("hidden");
    $("resultOverlay").classList.remove("hidden");
    const rankEl = $("resultRank");
    rankEl.textContent = res.rank;
    rankEl.className = "result-rank" + (res.rank === "PHI" ? " phi" : "") + (res.rank.length > 1 ? " small" : "");
    $("resultTitle").textContent = res.song.title;
    $("resultDiff").textContent = res.diff + " " + res.level;
    $("resultScore").textContent = String(res.score).padStart(7, "0");
    $("resultAcc").textContent = (res.acc * 100).toFixed(2);
    $("resultBgmark").textContent = res.song.title;
    const bkey = res.song.id + ":" + res.diff;
    const prev = bests[bkey];
    const isNew = !prev || res.score > prev.score || (res.score === prev.score && res.acc > prev.acc);
    if (isNew) { bests[bkey] = { score: res.score, acc: res.acc, rank: res.rank }; saveBests(); }
    $("resultRecord").innerHTML = isNew
      ? `<span class="new-record">NEW RECORD</span><em>BEST ${String(res.score).padStart(7, "0")}</em>`
      : `<span>BEST</span><em>${String(prev.score).padStart(7, "0")} · ${prev.rank}</em>`;
    $("resultStats").innerHTML = `
      <div class="result-stat"><span>PERFECT</span><b class="perfect">${res.counts.perfect}</b></div>
      <div class="result-stat"><span>GOOD</span><b class="good">${res.counts.good}</b></div>
      <div class="result-stat"><span>BAD</span><b class="bad">${res.counts.bad}</b></div>
      <div class="result-stat"><span>MISS</span><b class="miss">${res.counts.miss}</b></div>
      <div class="result-stat"><span>MAX COMBO</span><b>${res.maxCombo} / ${res.total}</b></div>
      <div class="result-stat"><span>ACCURACY</span><b>${(res.acc * 100).toFixed(2)}%</b></div>`;
    $("resultRank").style.textShadow = res.rank === "PHI"
      ? "0 0 50px rgba(255,211,77,.75)"
      : "0 0 40px " + res.song.accent + "88";
  }

  /* ---------------- settings ---------------- */
  function applySettings() {
    AUDIO.setVolume(settings.volume);
    AUDIO.setSfxVolume(settings.sfx);
    $("setVolume").value = Math.round(settings.volume * 100);
    $("setVolumeVal").textContent = Math.round(settings.volume * 100);
    $("setSfx").value = Math.round(settings.sfx * 100);
    $("setSfxVal").textContent = Math.round(settings.sfx * 100);
    $("setOffset").value = settings.offset;
    $("setOffsetVal").textContent = (settings.offset > 0 ? "+" : "") + settings.offset + " ms";
    $("setAuto").classList.toggle("on", settings.auto);
    $("setAuto").setAttribute("aria-pressed", String(settings.auto));
    $("setHints").classList.toggle("on", settings.hints);
    $("setHints").setAttribute("aria-pressed", String(settings.hints));
    $("autoTag").classList.toggle("hidden", !settings.auto || $("hud").classList.contains("hidden"));
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function openSettings(from) {
    settingsFrom = from || "menu";
    $("settingsOverlay").classList.remove("hidden");
    if (from === "pause") $("pauseOverlay").classList.add("hidden");
  }

  function closeSettings() {
    $("settingsOverlay").classList.add("hidden");
    if (settingsFrom === "pause" && game.phase === "paused") $("pauseOverlay").classList.remove("hidden");
    settingsFrom = null;
  }

  /* ---------------- wiring ---------------- */
  $("btnSettings").addEventListener("click", () => openSettings("menu"));
  $("settingsClose").addEventListener("click", closeSettings);
  $("diffClose").addEventListener("click", closeDiff);
  $("btnHD").addEventListener("click", () => { if (currentSong) startGame(currentSong.id, "HD"); });
  $("btnIN").addEventListener("click", () => { if (currentSong) startGame(currentSong.id, "IN"); });

  $("btnResume").addEventListener("click", resumeGame);
  $("btnPauseSettings").addEventListener("click", () => openSettings("pause"));
  $("btnRestart").addEventListener("click", () => {
    $("pauseOverlay").classList.add("hidden");
    paused = false;
    game.restart();
  });
  $("btnQuit").addEventListener("click", quitToMenu);
  $("btnAgain").addEventListener("click", () => {
    if (lastSongId) startGame(lastSongId, lastDiff);
  });
  $("btnBack").addEventListener("click", quitToMenu);

  $("setVolume").addEventListener("input", (e) => {
    settings.volume = +e.target.value / 100;
    $("setVolumeVal").textContent = e.target.value;
    AUDIO.setVolume(settings.volume);
    saveSettings();
  });
  $("setSfx").addEventListener("input", (e) => {
    settings.sfx = +e.target.value / 100;
    $("setSfxVal").textContent = e.target.value;
    AUDIO.setSfxVolume(settings.sfx);
    if (!AUDIO.getContext || !AUDIO.getContext()) AUDIO.init();
    const now = performance.now();
    if (now - lastSfxPreview > 110) {
      lastSfxPreview = now;
      AUDIO.hit("perfect", 0, "tap", (currentSong && currentSong.id) || "neon-pulse");
    }
    saveSettings();
  });
  $("setOffset").addEventListener("input", (e) => {
    settings.offset = +e.target.value;
    $("setOffsetVal").textContent = (settings.offset > 0 ? "+" : "") + settings.offset + " ms";
    game.offset = settings.offset;
    saveSettings();
  });
  $("setAuto").addEventListener("click", () => {
    settings.auto = !settings.auto;
    game.auto = settings.auto;
    applySettings();
    saveSettings();
  });
  $("setHints").addEventListener("click", () => {
    settings.hints = !settings.hints;
    game.hints = settings.hints;
    applySettings();
    saveSettings();
  });

  $("diffOverlay").addEventListener("pointerdown", (e) => {
    if (e.target === $("diffOverlay")) closeDiff();
  });
  $("settingsOverlay").addEventListener("pointerdown", (e) => {
    if (e.target === $("settingsOverlay")) closeSettings();
  });

  document.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "Escape") {
      if (!$("settingsOverlay").classList.contains("hidden")) { closeSettings(); return; }
      if (!$("diffOverlay").classList.contains("hidden")) { closeDiff(); return; }
      if (!$("pauseOverlay").classList.contains("hidden")) { resumeGame(); return; }
      if (game.phase === "playing") pauseGame();
      return;
    }
    if ((k === "r" || k === "R") && (game.phase === "playing" || game.phase === "paused")) {
      e.preventDefault();
      $("pauseOverlay").classList.add("hidden");
      paused = false;
      game.restart();
      return;
    }
    if ((k === " " || k === "p" || k === "P") && game.phase === "playing") {
      e.preventDefault();
      pauseGame();
    }
  });

  document.addEventListener("pointerdown", () => AUDIO.init(), { once: true });

  buildMenu();
  applySettings();
  window.addEventListener("resize", () => { if (game.phase === "idle") game.resize(); });

  // expose for debugging / console
  document.body.classList.toggle("touch-device", IS_TOUCH);
  game.touch = IS_TOUCH;
  $("btnPause").addEventListener("click", pauseGame);
  $("btnPause").addEventListener("pointerdown", (e) => e.stopPropagation());
  window.PHINEON = { game, settings, startGame, isTouch: IS_TOUCH };
})();
