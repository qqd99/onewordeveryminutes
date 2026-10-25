const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");

function section(first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start, `Missing section: ${first}`);
  return source.slice(start, end);
}

const sessionModule = section(
  "  function updateLearningSessionUi()",
  "  function renderCard("
);

function button() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    addEventListener(type, handler) { listeners.set(type, handler); },
    click() {
      const handler = listeners.get("click");
      assert.ok(handler, "button click handler is wired");
      handler({ currentTarget: this, target: this });
    }
  };
}

function makeHarness() {
  const selectedCard = { id: "saved", front: "好" };
  const otherCard = { id: "other", front: "错" };
  const calls = {
    render: [],
    play: [],
    schedule: 0,
    stop: 0,
    clear: []
  };
  const intervalTimerPill = {
    active: true,
    classList: {
      remove(name) {
        if (name === "active") intervalTimerPill.active = false;
      }
    }
  };
  const els = {
    flashcard: { hidden: false },
    learningSessionGate: { hidden: false },
    learningSessionTitle: { textContent: "" },
    learningSessionText: { textContent: "" },
    startLearningBtn: button(),
    pauseLearningBtn: button(),
    resumeLearningBtn: button(),
    intervalTimerPill,
    timerStatusText: { textContent: "" }
  };
  const state = {
    learningStatus: "idle",
    activePack: { cards: [selectedCard, otherCard] },
    currentCard: null,
    currentQuiz: null,
    nextReminderTime: 123,
    timerId: null,
    store: {
      currentCardId: "saved",
      progress: {},
      settings: { readWords: true, readSentences: false }
    }
  };

  const context = {
    state,
    els,
    Date,
    chooseNextCard: () => otherCard,
    getModeEligibleVocabulary: cards => cards,
    isModeEligibleCard: (card, cards) => cards.some(item => item.id === card?.id),
    getSrsDisplayMinutes: () => 15,
    renderCard(card, options) {
      calls.render.push({ card, options });
      state.currentCard = card;
    },
    playCardSequence(card) {
      calls.play.push(card);
      return Promise.resolve();
    },
    scheduleNextReminder() { calls.schedule += 1; },
    stopAudio() { calls.stop += 1; },
    clearInterval(id) { calls.clear.push(id); }
  };

  vm.runInNewContext(
    sessionModule +
    "\nglobalThis.api = { updateLearningSessionUi, setupLearningSessionControls, startLearning, pauseLearning, resumeLearning };",
    context
  );
  return { context, state, els, calls, api: context.api, selectedCard, otherCard };
}

test("page starts with no card and a Start learning button", () => {
  const h = makeHarness();
  h.api.setupLearningSessionControls();
  assert.equal(h.state.learningStatus, "idle");
  assert.equal(h.els.flashcard.hidden, true);
  assert.equal(h.els.learningSessionGate.hidden, false);
  assert.equal(h.els.startLearningBtn.hidden, false);
  assert.equal(h.els.resumeLearningBtn.hidden, true);
  assert.equal(h.els.pauseLearningBtn.hidden, true);
  assert.match(h.els.learningSessionTitle.textContent, /Ready to learn/);
  assert.equal(h.calls.render.length, 0);
});

test("Start learning shows the saved card and starts automatic playback path", () => {
  const h = makeHarness();
  h.api.setupLearningSessionControls();
  h.els.startLearningBtn.click();

  assert.equal(h.state.learningStatus, "active");
  assert.equal(h.calls.render.length, 1);
  assert.equal(h.calls.render[0].card, h.selectedCard);
  assert.equal(h.calls.render[0].options.autoPlay, true);
  assert.equal(h.els.flashcard.hidden, false);
  assert.equal(h.els.learningSessionGate.hidden, true);
  assert.equal(h.els.pauseLearningBtn.hidden, false);
  assert.equal(h.calls.schedule, 1);
});

test("Pause stops audio and timer and hides the learning card", () => {
  const h = makeHarness();
  h.api.setupLearningSessionControls();
  h.els.startLearningBtn.click();
  h.state.timerId = 77;
  h.state.nextReminderTime = 999;

  h.els.pauseLearningBtn.click();

  assert.equal(h.state.learningStatus, "paused");
  assert.equal(h.calls.stop, 1);
  assert.deepEqual(h.calls.clear, [77]);
  assert.equal(h.state.timerId, null);
  assert.equal(h.state.nextReminderTime, null);
  assert.equal(h.els.flashcard.hidden, true);
  assert.equal(h.els.learningSessionGate.hidden, false);
  assert.equal(h.els.resumeLearningBtn.hidden, false);
  assert.equal(h.els.startLearningBtn.hidden, true);
  assert.match(h.els.learningSessionTitle.textContent, /paused/i);
  assert.match(h.els.timerStatusText.textContent, /paused/i);
});

test("Resume restores the same card, replays it and restarts reminder countdown", () => {
  const h = makeHarness();
  h.api.setupLearningSessionControls();
  h.els.startLearningBtn.click();
  const renderedBefore = h.calls.render.length;
  h.els.pauseLearningBtn.click();

  h.els.resumeLearningBtn.click();

  assert.equal(h.state.learningStatus, "active");
  assert.equal(h.calls.render.length, renderedBefore, "same card DOM is preserved");
  assert.deepEqual(h.calls.play, [h.selectedCard]);
  assert.equal(h.els.flashcard.hidden, false);
  assert.equal(h.els.learningSessionGate.hidden, true);
  assert.equal(h.calls.schedule, 2);
});

test("resume chooses a valid card if the pack changed while paused", () => {
  const h = makeHarness();
  h.api.setupLearningSessionControls();
  h.els.startLearningBtn.click();
  h.els.pauseLearningBtn.click();
  h.state.currentCard = { id: "removed", front: "旧" };
  h.state.store.currentCardId = null;

  h.els.resumeLearningBtn.click();

  assert.equal(h.state.learningStatus, "active");
  assert.equal(h.calls.render.at(-1).card, h.otherCard);
  assert.equal(h.calls.render.at(-1).options.autoPlay, true);
});

test("card presentation and reminders are hard-blocked while paused or idle", () => {
  const render = section("  function renderCard(", "  function rateCurrentCard(");
  const next = section("  function presentNextCard(", "  /* -------------------------------------------------------------\n     7. MANUAL REVIEW");
  const timer = section("  function scheduleNextReminder()", "  /* -------------------------------------------------------------\n     8B. TRANSLATE");

  assert.match(render, /state\.learningStatus !== "active"/);
  assert.match(next, /state\.learningStatus !== "active"/);
  assert.match(timer, /state\.learningStatus !== "active"/);
  assert.match(timer, /function triggerReminder\(\)[\s\S]*state\.learningStatus !== "active"/);
});

test("opening or refreshing the website does not render a card before Start", () => {
  const init = section("  async function init()", "  document.addEventListener");
  assert.match(init, /state\.learningStatus = "idle"/);
  assert.doesNotMatch(init, /renderCard\(/);
  assert.match(init, /startLearningBtn\.disabled = false/);
});

test("session state is intentionally not persisted in learning progress storage", () => {
  const stateHeader = source.slice(source.indexOf("  const state = {"), source.indexOf("  // DOM Elements cache"));
  const storeStart = stateHeader.indexOf("store:");
  const storeText = stateHeader.slice(storeStart);
  assert.match(stateHeader, /learningStatus: "idle"/);
  assert.doesNotMatch(storeText, /learningStatus/);
});

test("HTML contains Start, Pause and Resume controls and no Enable sound prompt", () => {
  assert.match(html, /id="startLearningBtn"/);
  assert.match(html, /id="pauseLearningBtn"/);
  assert.match(html, /id="resumeLearningBtn"/);
  assert.match(html, /id="flashcard"[^>]*hidden/);
  assert.doesNotMatch(html, /id="enableAudioBtn"/);
  assert.doesNotMatch(html, /audioActivationNotice/);
});
