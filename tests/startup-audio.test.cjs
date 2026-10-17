const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const start = app.indexOf("  let activeUtterance = null;");
const end = app.indexOf("  /* -------------------------------------------------------------\n     4. SRS ENGINE", start);
assert.ok(start >= 0 && end > start);
const audioModule = app.slice(start, end);
const sample = {
  id: "hello", front: "你好", speechLang: "zh-CN",
  example: { text: "你好，朋友！", speechLang: "zh-CN" }
};

function makeHarness({ activated = false, exposeActivation = true, settings = {}, rejectPlayback = false } = {}) {
  const calls = [];
  const notice = { hidden: true };
  const listeners = new Map();
  const gestures = new Map();
  const button = {
    addEventListener(event, fn) { listeners.set(event, fn); },
    click() {
      const fn = listeners.get("click");
      assert.ok(fn, "Enable sound button must be wired");
      // In the real browser this click supplies user activation.
      if (sandbox.navigator.userActivation) sandbox.navigator.userActivation.hasBeenActive = true;
      fn();
    }
  };
  const store = { settings: {
    audioEngine: "online", volume: 100, wordRepeat: 2,
    readWords: true, readSentences: false, ...settings
  } };
  const state = { store, currentCard: sample, availableVoices: [] };
  class Audio {
    constructor(url) {
      this.url = url;
    }
    pause() {}
    play() {
      const url = new URL(this.url);
      const spoken = url.searchParams.get("q") || url.searchParams.get("audio");
      calls.push(spoken);
      if (rejectPlayback) {
        return Promise.reject(Object.assign(new Error("Not allowed"), { name: "NotAllowedError" }));
      }
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
  }
  const sandbox = {
    navigator: exposeActivation ? { userActivation: { hasBeenActive: activated } } : {},
    document: { addEventListener: (type, fn) => gestures.set(type, fn) },
    state,
    els: { voiceSelect: null, audioActivationNotice: notice, enableAudioBtn: button },
    window: { speechSynthesis: {
      getVoices: () => [], cancel() {}, resume() {}, paused: false
    } },
    SpeechSynthesisUtterance: class {},
    Audio, URL, console: { warn() {} }, showToast() {},
    setTimeout(fn, ms) {
      if (ms <= 500) {
        queueMicrotask(fn);
        return { immediate: true };
      }
      return setTimeout(fn, ms);
    },
    clearTimeout(handle) {
      if (!handle?.immediate) clearTimeout(handle);
    }
  };
  vm.runInNewContext(audioModule + "\nglobalThis.api = " +
    "{ playCardSequence, setupAudioActivation, speak, stopAudio };", sandbox);
  sandbox.api.setupAudioActivation();
  return { api: sandbox.api, calls, notice, button, state, sandbox, gestures };
}

async function flush() {
  for (let i = 0; i < 25; i += 1) await Promise.resolve();
}

test("first card shows clear permission prompt instead of waiting for blocked audio", async () => {
  const h = makeHarness();
  await h.api.playCardSequence(sample);
  assert.equal(h.notice.hidden, false);
  assert.deepEqual(h.calls, []);
});

test("silent reminders show newest word immediately on enable click", async () => {
  const h = makeHarness();
  await h.api.playCardSequence(sample);
  const second = { ...sample, id: "bye", front: "再见" };
  h.state.currentCard = second;
  await h.api.playCardSequence(second);
  assert.deepEqual(h.calls, []);
  h.button.click();
  assert.deepEqual(h.calls, ["再见"]); // Started inside the click handler.
  await flush();
  assert.deepEqual(h.calls, ["再见", "再见"]);
  assert.equal(h.notice.hidden, true);
});

test("once enabled, future cards play automatically with no extra click", async () => {
  const h = makeHarness();
  await h.api.playCardSequence(sample);
  h.button.click();
  await flush();
  const next = { ...sample, front: "学习" };
  await h.api.playCardSequence(next);
  assert.deepEqual(h.calls, ["你好", "你好", "学习", "学习"]);
  assert.equal(h.notice.hidden, true);
});

test("browsers that already allow audio still autoplay with no prompt", async () => {
  const h = makeHarness({ activated: true });
  await h.api.playCardSequence(sample);
  assert.deepEqual(h.calls, ["你好", "你好"]);
  assert.equal(h.notice.hidden, true);
});

test("both reading switches off does not display unnecessary audio prompt", async () => {
  const h = makeHarness({ settings: { readWords: false, readSentences: false } });
  await h.api.playCardSequence(sample);
  assert.equal(h.notice.hidden, true);
  assert.deepEqual(h.calls, []);
});

test("sentence-only preference remains independent after permission click", async () => {
  const h = makeHarness({ settings: { readWords: false, readSentences: true } });
  await h.api.playCardSequence(sample);
  assert.equal(h.notice.hidden, false);
  h.button.click();
  await flush();
  assert.deepEqual(h.calls, ["你好，朋友！", "你好，朋友！"]);
});

test("NotAllowedError shows prompt without trying each blocked TTS provider", async () => {
  const h = makeHarness({ activated: true, rejectPlayback: true });
  await h.api.playCardSequence(sample);
  assert.deepEqual(h.calls, ["你好"]); // No second / third blocked provider.
  assert.equal(h.notice.hidden, false);
});

test("newer audio cancels a stale startup request", async () => {
  const h = makeHarness();
  await h.api.playCardSequence(sample);
  h.state.currentCard = { ...sample, front: "再见" };
  h.button.click();
  await flush();
  assert.deepEqual(h.calls, ["再见", "再见"]);
});

test("web HTML includes sound unlock button and app wires it up", () => {
  const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
  assert.match(html, /id="audioActivationNotice"/);
  assert.match(html, /id="enableAudioBtn"/);
  assert.match(app, /setupAudioActivation\(\);/);
});

test("browsers without userActivation API still wait for first gesture and then autoplay", async () => {
  const h = makeHarness({ exposeActivation: false });
  await h.api.playCardSequence(sample);
  assert.equal(h.notice.hidden, false);
  assert.deepEqual(h.calls, []);
  assert.ok(h.gestures.has("pointerdown"));
  h.gestures.get("pointerdown")(); // A user's first tap on the webpage.
  await h.api.playCardSequence(sample);
  assert.deepEqual(h.calls, ["你好", "你好"]);
  assert.equal(h.notice.hidden, true);
});

test("Enable sound works on browsers without navigator.userActivation", async () => {
  const h = makeHarness({ exposeActivation: false });
  await h.api.playCardSequence(sample);
  h.button.click();
  await flush();
  assert.deepEqual(h.calls, ["你好", "你好"]);
  assert.equal(h.notice.hidden, true);
});
