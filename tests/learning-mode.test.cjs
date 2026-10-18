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
  assert.ok(start >= 0 && end > start, "Missing section: " + first);
  return source.slice(start, end);
}

const quizCode = section(
  "  function buildMeaningQuiz(",
  "  /* -------------------------------------------------------------\n     6. UI PRESENTATION"
);

function quizHarness(progress = {}) {
  const context = {
    progress,
    Math,
    wasEverReviewed(value) {
      return Boolean(value?.lastReviewedAt || value?.remembered || value?.forgotten);
    },
    state: { store: { settings: { learningMode: "chinese-to-english" } } }
  };
  vm.runInNewContext(
    quizCode +
    "\nglobalThis.api = { buildMeaningQuiz, buildChineseQuiz, isEnglishToChineseMode, chineseCharacterCount, getModeEligibleVocabulary, isModeEligibleCard };",
    context
  );
  return { api: context.api, context };
}

const hao = { id: "hao", front: "好", reading: "hǎo", meaning: "good", speechText: "好" };
const cuo = { id: "cuo", front: "错", reading: "cuò", meaning: "mistake" };
const zuo = { id: "zuo", front: "做", reading: "zuò", meaning: "make" };
const tongyi = { id: "hao-2", front: "良", reading: "liáng", meaning: "good" };

test("Mode 1 remains the default Chinese-to-English mode", () => {
  assert.match(source, /learningMode: "chinese-to-english"/);
  assert.match(html, /value="chinese-to-english"[^>]*>Mode 1/);
  assert.match(html, /value="english-to-chinese"[^>]*>Mode 2/);
});

test("Mode 2 builds one correct Chinese answer and two Chinese distractors", () => {
  const { api } = quizHarness();
  const quiz = api.buildChineseQuiz([hao, cuo, zuo], hao, {});
  assert.equal(quiz.correctMeaning, "good");
  assert.equal(quiz.correctWord, "好");
  assert.equal(quiz.choices.length, 3);
  const correct = quiz.choices.find(choice => choice.isCorrect);
  assert.equal(correct.text, "好");
  assert.equal(correct.cardId, "hao");
  assert.deepEqual(
    new Set(quiz.choices.map(choice => choice.text)),
    new Set(["好", "错", "做"])
  );
});


test("Mode 2 distractors always match the correct Chinese word length", () => {
  const { api } = quizHarness();
  const longWrong = { id: "wrong-2", front: "错误", meaning: "error" };
  const longMake = { id: "make-2", front: "制作", meaning: "produce" };
  const quiz = api.buildChineseQuiz([hao, cuo, zuo, longWrong, longMake], hao, {});
  assert.equal(quiz.choices.length, 3);
  assert.ok(quiz.choices.every(choice => Array.from(choice.text).length === 1));
  assert.equal(quiz.choices.some(choice => choice.text === "错误"), false);
  assert.equal(quiz.choices.some(choice => choice.text === "制作"), false);
});

test("two-character Mode 2 cards get only two-character answer choices", () => {
  const { api } = quizHarness();
  const target = { id: "very-good", front: "很好", meaning: "very good" };
  const wrongA = { id: "error-2", front: "错误", meaning: "error" };
  const wrongB = { id: "make-2", front: "制作", meaning: "produce" };
  const oneChar = { id: "one-char", front: "错", meaning: "mistake" };
  const quiz = api.buildChineseQuiz([target, wrongA, wrongB, oneChar], target, {});
  assert.equal(quiz.choices.length, 3);
  assert.deepEqual(
    new Set(quiz.choices.map(choice => Array.from(choice.text).length)),
    new Set([2])
  );
});

test("Mode 2 study pool excludes word lengths that cannot provide three equal-length choices", () => {
  const { api, context } = quizHarness();
  context.state.store.settings.learningMode = "english-to-chinese";
  const four = { id: "bus", front: "公共汽车", meaning: "bus" };
  const pool = api.getModeEligibleVocabulary([hao, cuo, zuo, four]);
  assert.deepEqual(new Set(pool.map(card => card.id)), new Set(["hao", "cuo", "zuo"]));
  assert.equal(api.isModeEligibleCard(four, [hao, cuo, zuo, four]), false);
  assert.equal(api.isModeEligibleCard(hao, [hao, cuo, zuo, four]), true);
});

test("real Mode 2 vocabulary has no answer-length leak for any eligible card", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "web/vocabulary.json"), "utf8"));
  const cards = catalog.packs[0].cards;
  const { api, context } = quizHarness();
  context.state.store.settings.learningMode = "english-to-chinese";
  const eligible = api.getModeEligibleVocabulary(cards);
  assert.ok(eligible.length > 0);
  for (const card of eligible) {
    const quiz = api.buildChineseQuiz(cards, card, {});
    assert.equal(quiz.choices.length, 3, card.front + " must have three choices");
    const correctLength = Array.from(card.front).length;
    assert.ok(
      quiz.choices.every(choice => Array.from(choice.text).length === correctLength),
      card.front + " leaked its answer by character count"
    );
  }
});

test("Mode 2 excludes another Chinese card with the same English meaning", () => {
  const { api } = quizHarness();
  const quiz = api.buildChineseQuiz([hao, tongyi, cuo, zuo], hao, {});
  assert.equal(quiz.choices.some(choice => choice.cardId === "hao-2"), false);
  assert.equal(quiz.choices.some(choice => choice.text === "良"), false);
});

test("Mode 2 choices retain source IDs for wrong-answer Forget logic", () => {
  const { api } = quizHarness();
  const quiz = api.buildChineseQuiz([hao, cuo, zuo], hao, {});
  for (const choice of quiz.choices) {
    assert.ok(["hao", "cuo", "zuo"].includes(choice.cardId));
  }
  const wrong = quiz.choices.find(choice => choice.text === "错");
  assert.equal(wrong.cardId, "cuo");
  assert.equal(wrong.isCorrect, false);
});

test("Mode 2 visual prompt is English and pinyin is hidden before answering", () => {
  const render = section("  function renderCard(", "  function rateCurrentCard(");
  assert.match(render, /englishToChinese \? \(card\.meaning \|\| "—"\) : card\.front/);
  assert.match(render, /pinyinReading\.hidden = englishToChinese/);
  assert.match(render, /buildChineseQuiz/);
  assert.match(render, /Choose the correct Chinese word/);
  assert.match(render, /exampleCard\.hidden = englishToChinese/);
});

test("Mode 2 reveals Chinese, pinyin, and English after an answer", () => {
  const answer = section("  function handleQuizAnswer(", "  function presentNextCard(");
  assert.match(answer, /Answer:/);
  assert.match(answer, /state\.currentCard\.front/);
  assert.match(answer, /state\.currentCard\.reading/);
  assert.match(answer, /state\.currentCard\.meaning/);
  assert.match(answer, /exampleCard\.hidden = false/);
});

test("automatic word audio stays Chinese in both modes", () => {
  const audio = section("  async function playCardSequence(", "  \/\* -------------------------------------------------------------\n     4. SRS ENGINE");
  assert.match(audio, /card\.speechText \|\| card\.front/);
  assert.doesNotMatch(audio, /card\.meaning/);
});

test("learning mode setting persists and backup import validates both modes", () => {
  const settings = section("  function setupSettings()", "  \/\* -------------------------------------------------------------\n     11. KEYBOARD");
  assert.match(settings, /state\.store\.settings\.learningMode = nextMode/);
  assert.match(settings, /\["chinese-to-english", "english-to-chinese"\]\.includes\(importedSettings\.learningMode\)/);
  assert.match(settings, /learningModeSelect\.value = state\.store\.settings\.learningMode/);
});

test("invalid stored learning modes fall back to Mode 1", () => {
  const load = section("  function loadStoredState()", "  function saveStoredState()");
  assert.match(load, /learningMode = "chinese-to-english"/);
  assert.match(load, /english-to-chinese/);
});

test("mode selector copy explicitly says audio remains Chinese", () => {
  assert.match(html, /Audio remains Chinese in both modes/);
});
