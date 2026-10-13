const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const start = source.indexOf("  let activeUtterance = null;");
const end = source.indexOf("  /* -------------------------------------------------------------\n     4. SRS ENGINE & CARD SELECTION", start);
assert.ok(start >= 0 && end > start, "web audio module must exist");
const audioModule = source.slice(start, end);

function createAudioHarness(overrides = {}, failText = null, hangText = null) {
  const spoken = [];
  const toasts = [];
  const settings = {
    volume: 100,
    readWords: true,
    readSentences: true,
    wordRepeat: 2,
    audioEngine: "online",
    ...overrides
  };
  class FakeAudio {
    constructor(url) { this.url = url; this.onended = null; this.onerror = null; }
    pause() {}
    play() {
      const url = new URL(this.url);
      const text = url.searchParams.get("q") || url.searchParams.get("audio");
      spoken.push(text);
      if (text !== hangText) {
        queueMicrotask(() => {
          if (text === failText) this.onerror?.(new Error("Failed"));
          else this.onended?.();
        });
      }
      return Promise.resolve();
    }
  }
  const timers = new Set();
  const context = {
    window: { speechSynthesis: {
      getVoices: () => [], cancel() {}, resume() {}, paused: false
    } },
    Audio: FakeAudio,
    state: { store: { settings }, availableVoices: [] },
    els: { voiceSelect: null },
    SpeechSynthesisUtterance: class {},
    console: { warn() {} },
    showToast: message => toasts.push(message),
    setTimeout: (fn, milliseconds) => {
      if (milliseconds <= 500) {
        const marker = { microtask: true, cancelled: false };
        timers.add(marker);
        queueMicrotask(() => {
          timers.delete(marker);
          if (!marker.cancelled) fn();
        });
        return marker;
      }
      return setTimeout(fn, milliseconds);
    },
    clearTimeout: handle => {
      if (handle?.microtask) handle.cancelled = true;
      else clearTimeout(handle);
    },
    URL
  };
  vm.runInNewContext(audioModule +
    "\nglobalThis.audioApi = { speak, playCardSequence, stopAudio };", context);
  return { api: context.audioApi, spoken, toasts, settings };
}

const card = {
  front: "你好",
  speechLang: "zh-CN",
  example: { text: "你好，朋友！", speechLang: "zh-CN" }
};

test("automatic sequence says word before example when enabled", async () => {
  const h = createAudioHarness();
  await h.api.playCardSequence(card);
  assert.deepEqual(h.spoken, ["你好", "你好", "你好，朋友！", "你好，朋友！"]);
});

test("disabling sentences preserves repeated word pronunciation", async () => {
  const h = createAudioHarness({ readSentences: false });
  await h.api.playCardSequence(card);
  assert.deepEqual(h.spoken, ["你好", "你好"]);
});

test("sentence can still be played manually with automatic reading off", async () => {
  const h = createAudioHarness({ readSentences: false });
  const success = await h.api.speak(card.example.text, { lang: "zh-CN", repeat: 1 });
  assert.equal(success, true);
  assert.deepEqual(h.spoken, ["你好，朋友！"]);
});

test("failed word audio is not replaced by example sentence", async () => {
  const h = createAudioHarness({}, "你好");
  await h.api.playCardSequence(card);
  assert.equal(h.spoken.length, 3); // Two Google sources + Chinese Youdao fallback.
  assert.ok(h.spoken.every(text => text === "你好"));
  assert.equal(h.toasts.length, 1);
});

test("new playback cancels stale word and prevents its sentence", async () => {
  const h = createAudioHarness({}, null, "你好");
  const oldPlayback = h.api.playCardSequence(card);
  await Promise.resolve(); // The old word has begun but not finished.
  const manualPlayback = h.api.speak("再见", { lang: "zh-CN", repeat: 1 });
  const results = await Promise.all([oldPlayback, manualPlayback]);
  assert.equal(results[1], true);
  assert.deepEqual(h.spoken, ["你好", "再见"]);
});

test("web HTML exposes two independent word and sentence switches", () => {
  const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
  assert.match(html, /id="readWordToggle"/);
  assert.match(html, /id="readSentenceToggle"/);
  assert.match(source, /readWords: true/);
  assert.match(source, /readSentences: true/);
  assert.match(source, /state\.store\.settings\.readWords = e\.target\.checked/);
  assert.match(source, /state\.store\.settings\.readSentences = e\.target\.checked/);
});

test("the deployed web vocabulary has English-only definitions", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, "web/vocabulary.json"), "utf8"));
  const rootData = JSON.parse(fs.readFileSync(path.join(root, "vocabulary.json"), "utf8"));
  for (const [index, pack] of data.packs.entries()) {
    assert.equal(pack.cards.length, rootData.packs[index].cards.length);
    for (const [cardIndex, entry] of pack.cards.entries()) {
      assert.equal(entry.id, rootData.packs[index].cards[cardIndex].id);
      assert.equal(entry.meaning, rootData.packs[index].cards[cardIndex].meaning);
      assert.doesNotMatch(entry.meaning, /[\u3400-\u9fff]/u);
    }
  }
});

function createNativeHarness({ readSentences = false, failSecond = false } = {}) {
  const nativeSpoken = [];
  const onlineSpoken = [];
  const state = {
    store: { settings: {
      volume: 100, readWords: true, readSentences,
      audioEngine: "auto", wordRepeat: 2, speed: 0.85
    } },
    availableVoices: [] // This is common while Chromium loads its voice list.
  };
  const voiceEngine = {
    paused: false,
    getVoices: () => [],
    cancel() {},
    resume() {},
    speak(utterance) {
      nativeSpoken.push(utterance.text);
      const attempt = nativeSpoken.length;
      queueMicrotask(() => utterance.onstart?.());
      queueMicrotask(() => {
        if (failSecond && attempt === 2) utterance.onerror?.({ error: "voice-unavailable" });
        else utterance.onend?.();
      });
    }
  };
  class FakeOnlineAudio {
    constructor(url) { this.url = url; }
    pause() {}
    play() {
      const uri = new URL(this.url);
      onlineSpoken.push(uri.searchParams.get("q") || uri.searchParams.get("audio"));
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
  }
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  const context = {
    window: { speechSynthesis: voiceEngine },
    Audio: FakeOnlineAudio,
    SpeechSynthesisUtterance: FakeUtterance,
    state, els: { voiceSelect: null },
    showToast() {}, console: { warn() {} },
    setTimeout: (fn, delay) => delay <= 500 ? queueMicrotask(fn) : setTimeout(fn, delay),
    clearTimeout: (id) => { if (id !== undefined && id !== null) clearTimeout(id); },
    URL
  };
  vm.runInNewContext(audioModule +
    "\nglobalThis.audioApi = { speak, playCardSequence, stopAudio };", context);
  return { api: context.audioApi, state, nativeSpoken, onlineSpoken };
}

test("word begins immediately with sentence option off, even before voices load", async () => {
  const h = createNativeHarness({ readSentences: false });
  const playback = h.api.playCardSequence(card);
  // The first word must already be submitted to native speech synchronously,
  // without waiting for the example or a Google TTS timeout.
  assert.deepEqual(h.nativeSpoken, ["你好"]);
  await playback;
  assert.deepEqual(h.nativeSpoken, ["你好", "你好"]);
  assert.deepEqual(h.onlineSpoken, []);
});

test("native voice failure on the second repeat falls back only once", async () => {
  const h = createNativeHarness({ readSentences: false, failSecond: true });
  await h.api.playCardSequence(card);
  assert.deepEqual(h.nativeSpoken, ["你好", "你好"]);
  assert.deepEqual(h.onlineSpoken, ["你好"]);
});

test("sentence-on sequence uses the native voice for both segments", async () => {
  const h = createNativeHarness({ readSentences: true });
  await h.api.playCardSequence(card);
  assert.deepEqual(h.nativeSpoken,
    ["你好", "你好", "你好，朋友！", "你好，朋友！"]);
});

test("initial web card attempts automatic speech and does not restart on quiz answer", () => {
  assert.match(source, /renderCard\(initialCard, \{ autoPlay: true \}\)/);
  const answer = source.slice(source.indexOf("  function handleQuizAnswer("),
    source.indexOf("  function presentNextCard("));
  assert.doesNotMatch(answer, /playCardSequence\(/);
});

test("SRS timing includes configured hours and seconds", () => {
  const first = source.indexOf("  function getSrsDisplayMinutes()");
  const last = source.indexOf("  function formatTimeInterval(", first);
  assert.ok(first > 0 && last > first);
  const ctx = { state: { store: { settings: {
    intervalHours: 1, intervalMinutes: 2, intervalSeconds: 30
  } } } };
  vm.runInNewContext(source.slice(first, last) +
    "\nglobalThis.calculate = getSrsDisplayMinutes", ctx);
  assert.equal(ctx.calculate(), 63);
});

test("SRS New Word action clears old review counters", () => {
  const pos = source.indexOf("els.newWordBtn.addEventListener");
  const next = source.indexOf("els.forgetBtn.addEventListener", pos);
  assert.ok(pos >= 0 && next > pos);
  const newAction = source.slice(pos, next);
  assert.match(newAction, /defaultCardProgress\(\)/);
  assert.doesNotMatch(newAction, /progress\.lastReviewedAt = 0/);
});

test("repeated Remember/Forget actions correct the same review instead of double counting", () => {
  const first = source.indexOf("  function rateCurrentCard(");
  const last = source.indexOf("  function handleQuizAnswer(", first);
  assert.ok(first > 0 && last > first);
  const srs = fs.readFileSync(path.join(root, "web/srs.js"), "utf8");
  const state = {
    currentCard: { id: "word-1" },
    currentReviewBaseline: null,
    store: { progress: { "word-1": { lastShownAt: 123 } } }
  };
  const context = {
    state, getSrsDisplayMinutes: () => 30,
    saveStoredState() {}, updateDashboardCounts() {}
  };
  vm.runInNewContext(srs + "\nglobalThis.srsReady = true;" +
    source.slice(first, last) + "\nglobalThis.rate = rateCurrentCard;", context);
  context.rate("remember");
  context.rate("remember");
  assert.equal(state.store.progress["word-1"].remembered, 1);
  assert.equal(state.store.progress["word-1"].repetitions, 1);
  context.rate("forget");
  assert.equal(state.store.progress["word-1"].remembered, 0);
  assert.equal(state.store.progress["word-1"].forgotten, 1);
});

test("audio preferences survive backup restore without changing notification permissions", () => {
  const importCode = source.slice(source.indexOf("// Backups also contain the user's audio preferences."),
    source.indexOf("saveStoredState();", source.indexOf("// Backups also contain the user's audio preferences.")));
  assert.match(importCode, /importedSettings\.readWords/);
  assert.match(importCode, /importedSettings\.readSentences/);
  assert.match(importCode, /importedSettings\.autoSpeak/);
  assert.doesNotMatch(importCode, /state\.store\.settings\.notificationsEnabled = /);
  assert.doesNotMatch(importCode, /state\.store\.settings\.reminderEnabled = /);
});

test("online audio startup timeout does not truncate an already playing sentence", async () => {
  const timers = [];
  let active;
  class FakeAudio {
    constructor() { active = this; }
    pause() {}
    play() { return Promise.resolve(); }
  }
  const ctx = {
    window: { speechSynthesis: { cancel() {}, paused: false } },
    state: { store: { settings: { volume: 100 } }, availableVoices: [] },
    els: { voiceSelect: null },
    Audio: FakeAudio,
    SpeechSynthesisUtterance: class {},
    setTimeout: (callback, ms) => {
      const handle = { callback, ms, cancelled: false };
      timers.push(handle);
      return handle;
    },
    clearTimeout: handle => { if (handle) handle.cancelled = true; },
    console: { warn() {} }, URL
  };
  vm.runInNewContext(audioModule +
    "\nglobalThis.audioApi = { playOnlineOnce };", ctx);
  const playing = ctx.audioApi.playOnlineOnce("https://example.test/audio", 0, 1);
  await Promise.resolve(); // FakeAudio.play() settled: HTML Audio started.
  const startupTimeout = timers.find(handle => handle.ms === 3200);
  assert.ok(startupTimeout);
  assert.equal(startupTimeout.cancelled, true);
  const completionTimeout = timers.find(handle => handle.ms === 45000);
  assert.ok(completionTimeout);
  // Simulate a sentence that outlasts the old 3200ms single watchdog.
  if (!startupTimeout.cancelled) startupTimeout.callback();
  active.onended();
  assert.equal(await playing, true);
  assert.equal(completionTimeout.cancelled, true);
});

test("online audio that never starts is cancelled quickly", async () => {
  const timers = [];
  let active;
  class HungAudio {
    constructor() { active = this; }
    pause() { this.paused = true; }
    play() { return new Promise(() => {}); }
  }
  const ctx = {
    window: { speechSynthesis: { cancel() {}, paused: false } },
    state: { store: { settings: { volume: 100 } }, availableVoices: [] },
    els: { voiceSelect: null },
    Audio: HungAudio,
    SpeechSynthesisUtterance: class {},
    setTimeout: (callback, ms) => {
      const handle = { callback, ms, cancelled: false };
      timers.push(handle);
      return handle;
    },
    clearTimeout: handle => { if (handle) handle.cancelled = true; },
    console: { warn() {} }, URL
  };
  vm.runInNewContext(audioModule +
    "\nglobalThis.audioApi = { playOnlineOnce };", ctx);
  const result = ctx.audioApi.playOnlineOnce("https://example.test/audio", 0, 1);
  timers.find(handle => handle.ms === 3200).callback();
  assert.equal(await result, false);
  assert.equal(active.paused, true);
});

test("word off, sentence on: plays only the sentence automatically", async () => {
  const h = createAudioHarness({ readWords: false, readSentences: true });
  await h.api.playCardSequence(card);
  assert.deepEqual(h.spoken, ["你好，朋友！", "你好，朋友！"]);
});

test("word off, sentence off: does not play either segment automatically", async () => {
  const h = createAudioHarness({ readWords: false, readSentences: false });
  await h.api.playCardSequence(card);
  assert.deepEqual(h.spoken, []);
});

test("word on, sentence off: automatic playback still says word twice", async () => {
  const h = createAudioHarness({ readWords: true, readSentences: false });
  await h.api.playCardSequence(card);
  assert.deepEqual(h.spoken, ["你好", "你好"]);
});

test("word off is not a master mute: manually requested word still plays", async () => {
  const h = createAudioHarness({ readWords: false, readSentences: false });
  const ok = await h.api.speak(card.front, { lang: "zh-CN", repeat: 1 });
  assert.equal(ok, true);
  assert.deepEqual(h.spoken, ["你好"]);
});

test("old saved autoSpeak preference migrates into the new Read word option", () => {
  const first = source.indexOf("  function loadStoredState() {");
  const last = source.indexOf("  function saveStoredState() {", first);
  assert.ok(first > 0 && last > first);
  const state = { store: {
    settings: { readWords: true, readSentences: true },
    progress: {}, lastCardId: null, currentCardId: null
  } };
  const stored = { settings: { autoSpeak: false, readSentences: true } };
  const ctx = {
    state,
    localStorage: { getItem: () => JSON.stringify(stored) },
    console: { warn() {} }
  };
  vm.runInNewContext('const STORAGE_KEY = "vocab_srs_state_v1";\n' +
    source.slice(first, last) + '\nglobalThis.load = loadStoredState;', ctx);
  ctx.load();
  assert.equal(state.store.settings.readWords, false);
  assert.equal(state.store.settings.readSentences, true);
  assert.equal(Object.hasOwn(state.store.settings, "autoSpeak"), false);
  stored.settings = { readWords: true, autoSpeak: false, readSentences: false };
  ctx.load();
  assert.equal(state.store.settings.readWords, true, "New setting takes precedence");
  assert.equal(state.store.settings.readSentences, false);
});

test("UI has no master autoplay toggle that blocks sentence-only playback", () => {
  const render = source.slice(source.indexOf("  function renderCard("),
    source.indexOf("  function rateCurrentCard("));
  assert.match(render, /settings\.readWords !== false/);
  assert.match(render, /settings\.readSentences !== false/);
  assert.doesNotMatch(render, /settings\.autoSpeak/);
});
