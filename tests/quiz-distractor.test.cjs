const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const srs = fs.readFileSync(path.join(root, "web/srs.js"), "utf8");

function section(first, last) {
  const start = app.indexOf(first);
  const end = app.indexOf(last, start);
  assert.ok(start !== -1 && end > start, `Missing app code section: ${first}`);
  return app.slice(start, end);
}

const quizModule = section("  function wasEverShown(", "  /* -------------------------------------------------------------\n     6. UI PRESENTATION");
const ratingModule = section("  function rateCurrentCard(", "  function presentNextCard(");

const cards = [
  { id: "hao", front: "好", meaning: "good" },
  { id: "cuo", front: "错", meaning: "mistake" },
  { id: "zuo", front: "做", meaning: "make" }
];

function reviewed({ forgotten = false } = {}) {
  return forgotten
    ? { repetitions: 0, lastReviewedAt: 100, forgotten: 1, lapses: 1, dueAt: 100 }
    : { repetitions: 2, lastReviewedAt: 100, remembered: 2, dueAt: 100 };
}

function harness(progress = {}, vocabulary = cards) {
  const classes = new Map();
  const buttons = [];
  const toasts = [];
  const state = {
    currentCard: vocabulary[0],
    activePack: { cards: vocabulary },
    store: { progress },
    currentReviewBaseline: null,
    quizAnswered: false,
    selectedChoiceId: null
  };
  const els = {
    choicesGrid: { querySelectorAll: () => buttons },
    revealedMeaning: { textContent: "", hidden: true }
  };
  const sandbox = {
    state, els, Date,
    getSrsDisplayMinutes: () => 15,
    saveStoredState() {},
    updateDashboardCounts() {},
    showToast: message => toasts.push(message)
  };
  vm.runInNewContext(
    srs + "\n" + quizModule + "\n" + ratingModule +
    "\nglobalThis.quiz = buildMeaningQuiz;" +
    "\nglobalThis.answer = handleQuizAnswer;" +
    "\nglobalThis.rate = rateCurrentCard;", sandbox
  );
  const quiz = sandbox.quiz(vocabulary, vocabulary[0], state.store.progress);
  state.currentQuiz = quiz;
  for (const choice of quiz.choices) {
    const tags = [];
    const button = {
      dataset: { choiceId: choice.id },
      disabled: false,
      classList: { add: tag => tags.push(tag) },
      tags
    };
    buttons.push(button);
    classes.set(choice.id, button);
  }
  function choose(text) {
    const choice = quiz.choices.find(option => option.text === text);
    assert.ok(choice, `Choice missing: ${text}`);
    sandbox.answer(choice, classes.get(choice.id));
    return choice;
  }
  return { state, quiz, classes, toasts, choose, rate: sandbox.rate, answer: sandbox.answer };
}

test("wrong answer forgets both the displayed word and a previously remembered distractor", () => {
  const h = harness({
    hao: reviewed(), cuo: reviewed(), zuo: reviewed()
  });
  assert.equal(h.choose("mistake").cardId, "cuo");
  assert.equal(h.state.store.progress.hao.repetitions, 0);
  assert.equal(h.state.store.progress.hao.forgotten, 1);
  assert.equal(h.state.store.progress.cuo.repetitions, 0);
  assert.equal(h.state.store.progress.cuo.forgotten, 1);
  assert.equal(h.state.store.progress.cuo.lapses, 1);
  assert.equal(h.state.store.progress.zuo.forgotten, undefined);
  assert.match(h.toasts[0], /好 and 错 marked Forget/);
});

test("a distractor already in Forget category is forgotten again when chosen", () => {
  const h = harness({ hao: reviewed(), cuo: reviewed({ forgotten: true }) });
  h.choose("mistake");
  assert.equal(h.state.store.progress.cuo.forgotten, 2);
  assert.equal(h.state.store.progress.cuo.lapses, 2);
  assert.equal(h.state.store.progress.cuo.repetitions, 0);
});

test("a never-reviewed distractor remains New, even if it was shown before", () => {
  const unchanged = { lastShownAt: 123456, dueAt: 500000 };
  const h = harness({ hao: reviewed(), cuo: unchanged });
  h.choose("mistake");
  assert.equal(h.state.store.progress.hao.forgotten, 1);
  assert.equal(h.state.store.progress.cuo, unchanged);
  assert.deepEqual(h.state.store.progress.cuo, { lastShownAt: 123456, dueAt: 500000 });
});

test("correct answer remembers only the displayed word", () => {
  const previous = reviewed();
  const h = harness({ hao: reviewed(), cuo: previous });
  h.choose("good");
  assert.equal(h.state.store.progress.hao.remembered, 3);
  assert.equal(h.state.store.progress.cuo, previous);
  assert.equal(h.toasts[0], "Correct! SRS interval increased.");
});

test("only the selected wrong meaning is forgotten, not the other option", () => {
  const makeProgress = reviewed();
  const h = harness({ hao: reviewed(), cuo: reviewed(), zuo: makeProgress });
  h.choose("mistake");
  assert.equal(h.state.store.progress.zuo, makeProgress);
});

test("double clicking a wrong choice cannot rate either card twice", () => {
  const h = harness({ hao: reviewed(), cuo: reviewed() });
  const selected = h.choose("mistake");
  const fakeButton = h.classes.get(selected.id);
  // The handler must reject events after a quiz has been answered.
  const src = section("  function handleQuizAnswer(", "  function presentNextCard(");
  assert.match(src, /if \(state.quizAnswered\) return/);
  assert.equal(fakeButton.disabled, true);
  const prevHao = h.state.store.progress.hao;
  const prevCuo = h.state.store.progress.cuo;
  h.answer(selected, fakeButton);
  assert.equal(h.state.quizAnswered, true);
  assert.equal(h.state.store.progress.hao, prevHao);
  assert.equal(h.state.store.progress.cuo, prevCuo);
  assert.equal(prevHao.forgotten, 1);
  assert.equal(prevCuo.forgotten, 1);
  assert.equal(h.toasts.length, 1);
});

test("a later manual rating corrects the shown word without undoing distractor Forget", () => {
  const h = harness({ hao: reviewed(), cuo: reviewed() });
  h.choose("mistake");
  h.rate("remember");
  assert.equal(h.state.store.progress.hao.forgotten, 0);
  assert.equal(h.state.store.progress.hao.remembered, 3);
  assert.equal(h.state.store.progress.cuo.forgotten, 1);
});

test("duplicate English meanings choose an existing reviewed vocabulary card", () => {
  const vocab = [
    ...cards,
    { id: "cuo-new", front: "误", meaning: "mistake" }
  ];
  const h = harness({ hao: reviewed(), cuo: reviewed() }, vocab);
  const selected = h.choose("mistake");
  assert.equal(selected.cardId, "cuo");
  assert.equal(h.state.store.progress.cuo.forgotten, 1);
  assert.equal(h.state.store.progress["cuo-new"], undefined);
});

test("all wrong quiz options retain source card IDs without mutating the vocabulary", () => {
  const original = JSON.stringify(cards);
  const h = harness({});
  assert.equal(h.quiz.choices.find(choice => choice.isCorrect).cardId, "hao");
  for (const choice of h.quiz.choices.filter(choice => !choice.isCorrect)) {
    assert.ok(cards.some(word => word.id === choice.cardId));
  }
  assert.equal(JSON.stringify(cards), original);
});
