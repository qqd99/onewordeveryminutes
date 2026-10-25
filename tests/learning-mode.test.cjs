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

test("Mode 2 displays the selected-language prompt and hides pinyin before answering", () => {
  const render = section("  function renderCard(", "  function rateCurrentCard(");
  assert.match(render, /englishToChinese \? \(card\.meaning \|\| "—"\) : card\.front/);
  const localized = section("  let visibleTranslationGeneration = 0;", "  function renderCard(");
  assert.match(localized, /Translating meaning…/);
  assert.match(localized, /TranslationSupport\.localizePresentation/);
  assert.match(render, /pinyinReading\.hidden = englishToChinese/);
  assert.match(render, /buildChineseQuiz/);
  assert.match(render, /Choose the correct Chinese word/);
  assert.match(render, /exampleCard\.hidden = englishToChinese/);
});

test("Mode 2 reveals Chinese, pinyin, and the selected meaning language after an answer", () => {
  const answer = section("  function handleQuizAnswer(", "  function presentNextCard(");
  assert.match(answer, /Answer:/);
  assert.match(answer, /state\.currentCard\.front/);
  assert.match(answer, /state\.currentCard\.reading/);
  assert.match(answer, /els\.hanziTerm\.textContent \|\| visibleCardMeaning/);
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
  assert.match(settings, /\["chinese-to-english", "english-to-chinese", "chinese-to-picture"\]\.includes\(importedSettings\.learningMode\)/);
  assert.match(settings, /learningModeSelect\.value = state\.store\.settings\.learningMode/);
});

test("invalid learning modes in any save fall back to Mode 1", () => {
  const normalize = section("  function normalizeSaveStore(", "  function createSaveRegistry(");
  assert.match(normalize, /learningMode = "chinese-to-english"/);
  assert.match(normalize, /english-to-chinese/);
});

test("mode selector documents picture quiz and persistent selection", () => {
  assert.match(html, /Chinese → Picture/);
  assert.match(html, /Your selection is saved until changed/);
});

const picturesCode = fs.readFileSync(path.join(root, "web/picture-catalog.js"), "utf8");
function pictureHarness() {
  const context = {
    state: { store: { settings: { learningMode: "chinese-to-picture" } } },
    wasEverReviewed() { return false; },
    Math
  };
  vm.runInNewContext(picturesCode + "\n" + quizCode +
    "\nglobalThis.api = { PictureCatalog, buildPictureQuiz, getModeEligibleVocabulary, isModeEligibleCard };", context);
  return context.api;
}

test("Mode 3 uses bundled pictures only for clearly illustrated words", () => {
  assert.match(html, /value="chinese-to-picture"/);
  const { PictureCatalog, getModeEligibleVocabulary, isModeEligibleCard } = pictureHarness();
  const cards = [
    { id: "apple", front: "苹果", meaning: "apple" },
    { id: "banana", front: "香蕉", meaning: "banana" },
    { id: "dog", front: "狗", meaning: "dog" },
    { id: "hello", front: "你好", meaning: "hello" },
    { id: "light", front: "轻", meaning: "light" },
    { id: "ambiguous", front: "水果", meaning: "fruit" }
  ];
  assert.equal(PictureCatalog.pictureFor(cards[0]), "apple");
  assert.equal(PictureCatalog.pictureFor(cards[3]), null);
  assert.equal(PictureCatalog.pictureFor(cards[4]), null);
  assert.equal(PictureCatalog.pictureFor(cards[5]), null);
  assert.equal(getModeEligibleVocabulary(cards).length, 3);
  assert.equal(isModeEligibleCard(cards[0], cards), true);
  assert.equal(isModeEligibleCard(cards[3], cards), false);
});

test("Mode 3 picture choices have three distinct locally bundled SVG images", () => {
  const { PictureCatalog, buildPictureQuiz } = pictureHarness();
  const cards = [
    { id: "apple", front: "苹果", meaning: "apple" },
    { id: "banana", front: "香蕉", meaning: "banana" },
    { id: "grape", front: "葡萄", meaning: "grapes" },
    { id: "dog", front: "狗", meaning: "dog" },
    { id: "apple-other", front: "苹果果", meaning: "apple" }
  ];
  const quiz = buildPictureQuiz(cards, cards[0]);
  assert.equal(quiz.choices.length, 3);
  assert.equal(quiz.choices.filter(choice => choice.isCorrect).length, 1);
  assert.equal(new Set(quiz.choices.map(choice => choice.image)).size, 3);
  assert.ok(quiz.choices.every(choice =>
    PictureCatalog.imageHref(choice.image).startsWith("pictures/pictures-")));
  assert.equal(quiz.correctMeaning, "apple");
  assert.equal(quiz.choices.some(c => c.cardId === "apple-other"), false);
});

test("Mode 3 pictures hide all choice meanings and example until answer", () => {
  const render = section("  function renderCard(", "  function rateCurrentCard(");
  const answer = section("  function handleQuizAnswer(", "  function presentNextCard(");
  assert.match(render, /buildPictureQuiz/);
  assert.match(render, /document\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/);
  assert.match(render, /btn\.setAttribute\("aria-label",/);
  assert.match(render, /exampleCard\.hidden = englishToChinese \|\| pictureMode/);
  assert.match(answer, /isPictureMode\(\) \? visibleCardMeaning/);
  assert.match(answer, /exampleCard\.hidden = false/);
});

test("Mode 3 reveals the chosen meaning language, including after translation completes", () => {
  const localized = section("  async function localizeRenderedCard(", "  function renderCard(");
  assert.match(localized, /!englishToChinese && !isPictureMode\(\)/);
  assert.match(localized, /visibleCardMeaning = returnedMeaning/);
  assert.match(localized, /isPictureMode\(\) \? visibleCardMeaning/);
  assert.match(localized, /state\.quizAnswered/);
});

test("illustration sheets, attribution and cached offline assets are present", () => {
  const sheetPaths = Array.from({length: 9}, (_, i) => "pictures/pictures-" + (i+1) + ".svg");
  const cache = fs.readFileSync(path.join(root, "web/sw.js"), "utf8");
  const license = fs.readFileSync(path.join(root, "web/pictures/LICENSE-LUCIDE.txt"), "utf8");
  assert.match(license, /ISC License/);
  assert.match(cache, /picture-catalog\.js/);
  assert.ok(sheetPaths.every(name => {
    const svg = fs.readFileSync(path.join(root, "web", name), "utf8");
    return svg.includes("<symbol") && cache.includes("./" + name);
  }));
});
