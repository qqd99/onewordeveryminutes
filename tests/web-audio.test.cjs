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
    autoSpeak: true,
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

test("web HTML exposes sentence switch and JS saves the preference", () => {
  const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
  assert.match(html, /id="readSentencesToggle"/);
  assert.match(source, /readSentences: true/);
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
