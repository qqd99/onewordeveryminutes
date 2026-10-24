const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const translationScript = fs.readFileSync(path.join(root, "web", "translation.js"), "utf8");

function harness(translations = {}, status = 200, googleTranslations = {}, googleStatus = 503, deviceTranslator = null) {
  const requests = [];
  const context = vm.createContext({
    URLSearchParams,
    AbortController,
    ...(deviceTranslator ? { Translator: deviceTranslator } : {}),
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: async url => {
      const parsed = new URL(url);
      const isGoogle = parsed.hostname === "translate.googleapis.com";
      const source = parsed.searchParams.get("q");
      const languagePair = isGoogle
        ? `${parsed.searchParams.get("sl")}|${parsed.searchParams.get("tl")}`
        : parsed.searchParams.get("langpair");
      requests.push({ source, languagePair, provider: isGoogle ? "google" : "mymemory" });
      const responseStatus = isGoogle ? googleStatus : status;
      return {
        ok: responseStatus === 200,
        status: responseStatus,
        json: async () => isGoogle
          ? [[[googleTranslations[source] ?? source, source]]]
          : {
              responseStatus,
              responseData: { translatedText: translations[source] ?? source }
            }
      };

    }
  });
  vm.runInContext(translationScript, context);
  return { api: context.TranslationSupport, requests };
}

const card = {
  id: "zh-001", front: "好", meaning: "good",
  example: { text: "很好", meaning: "Very good!" }
};
const quiz = {
  correctChoiceId: "correct",
  choices: [
    { id: "wrong-1", text: "mistake" },
    { id: "correct", text: "good" },
    { id: "wrong-2", text: "make" }
  ]
};

test("English defaults to original meanings and unsupported languages safely fall back", async () => {
  const h = harness();
  assert.equal(h.api.normalizeLanguage("vi"), "vi");
  assert.equal(h.api.normalizeLanguage("unexpected"), "en");
  assert.equal(h.api.sourceLanguage({ translationLanguage: "English" }), "en");
  const presentation = await h.api.localizePresentation(card, quiz, "en");
  assert.equal(presentation.card, card);
  assert.equal(presentation.quiz, quiz);
  assert.equal(h.requests.length, 0);
});

test("Vietnamese translations keep stable quiz IDs, correct answer and source data", async () => {
  const h = harness({
    good: "tốt", mistake: "sai lầm", make: "làm",
    "Very good!": "Rất tốt!"
  });
  const original = JSON.stringify({ card, quiz });
  const presentation = await h.api.localizePresentation(card, quiz, "vi");
  assert.equal(presentation.card.meaning, "tốt");
  assert.equal(presentation.card.example.meaning, "Rất tốt!");
  assert.equal(presentation.quiz.correctChoiceId, "correct");
  assert.deepEqual(Array.from(presentation.quiz.choices, choice => choice.id),
    ["wrong-1", "correct", "wrong-2"]);
  assert.deepEqual(Array.from(presentation.quiz.choices, choice => choice.text),
    ["sai lầm", "tốt", "làm"]);
  assert.equal(JSON.stringify({ card, quiz }), original);
  assert.ok(h.requests.every(item => item.languagePair === "en|vi"));
  const before = h.requests.length;
  assert.equal(await h.api.translateText("good", "vi"), "tốt");
  assert.equal(h.requests.length, before, "successful translations should be cached");
});

test("ambiguous translations fall back to English choices and English answer", async () => {
  const h = harness({ good: "tốt", mistake: "tốt", make: "làm" });
  const presentation = await h.api.localizePresentation(card, quiz, "vi");
  assert.deepEqual(Array.from(presentation.quiz.choices, choice => choice.text),
    ["mistake", "good", "make"]);
  assert.equal(presentation.card.meaning, "good");
});

test("failed API calls keep the original definition without blocking quizzes", async () => {
  const h = harness({}, 429);
  const presentation = await h.api.localizePresentation(card, quiz, "vi");
  assert.deepEqual(Array.from(presentation.quiz.choices, choice => choice.text),
    ["mistake", "good", "make"]);
  assert.equal(presentation.card.meaning, "good");
  assert.equal(presentation.card.example.meaning, "Very good!");
});

test("HTML numeric entities from the translation service are decoded", async () => {
  const h = harness({ good: "t&#7889;t" });
  assert.equal(await h.api.translateText("good", "vi"), "tốt");
});

test("web and docs use identical translation engines", () => {
  for (const dir of ["web", "docs"]) {
    assert.equal(fs.readFileSync(path.join(root, dir, "translation.js"), "utf8"),
      translationScript);
  }
});


test("reverse Chinese quiz displays Vietnamese for the screenshot's English phrase", async () => {
  const phrase = "to get out of a predicament";
  const vietnamese = "thoát khỏi tình thế khó khăn";
  const h = harness({}, 429, { [phrase]: vietnamese }, 200);
  const reverseCard = {
    id: "zh-predicament", front: "出头", meaning: phrase,
    example: { text: "出头", meaning: "To get out of a predicament." }
  };
  const reverseQuiz = {
    correctChoiceId: "correct",
    choices: [{ id: "correct", text: "出头" }, { id: "d1", text: "喇叭" }, { id: "d2", text: "亚军" }]
  };
  const translated = await h.api.localizePresentation(
    reverseCard, reverseQuiz, "vi", "en", false, false
  );
  assert.equal(translated.card.meaning, vietnamese);
  assert.equal(translated.card.example.meaning, reverseCard.example.meaning,
    "Hidden example translation must not delay the reverse quiz prompt");
  assert.equal(translated.quiz, reverseQuiz, "Chinese answer choices remain unchanged");
  assert.equal(reverseCard.meaning, phrase, "Vocabulary source data remains English");
  assert.ok(h.requests.some(request => request.provider === "google" &&
    request.source === phrase && request.languagePair === "en|vi"));
  assert.ok(!h.requests.some(request => request.source === reverseCard.example.meaning),
    "Do not request the hidden example for reverse quizzes");
});

test("reverse quiz shows translation progress and updates revealed answers", async () => {
  const source = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
  const start = source.indexOf("  let visibleTranslationGeneration = 0;");
  const end = source.indexOf("  function renderCard(", start);
  assert.ok(start >= 0 && end > start, "Must find web localized quiz renderer");

  const reverseCard = { id: "zh-predicament", front: "出头",
    reading: "chū tóu", meaning: "to get out of a predicament" };
  const reverseQuiz = { correctChoiceId: "correct", choices: [] };
  const state = {
    store: { settings: { translationLanguage: "vi" } },
    currentCard: reverseCard, currentQuiz: reverseQuiz, quizAnswered: false
  };
  const els = {
    hanziTerm: { textContent: "" },
    exampleEnglish: { textContent: "" },
    revealedMeaning: { textContent: "" }
  };
  let resolveTranslation;
  const context = vm.createContext({
    state, els,
    TranslationSupport: {
      normalizeLanguage: language => language,
      sourceLanguage: () => "zh-CN",
      localizePresentation: () => new Promise(resolve => { resolveTranslation = resolve; })
    }
  });
  vm.runInContext(source.slice(start, end) +
    "\nglobalThis.localize = localizeRenderedCard;", context);
  const pending = context.localize(reverseCard, reverseQuiz, true);
  assert.equal(els.hanziTerm.textContent, "Translating meaning…",
    "Never flash the English meaning on a Vietnamese reverse quiz");

  // The learner can answer before the asynchronous translation finishes.
  state.quizAnswered = true;
  resolveTranslation({
    card: { ...reverseCard, meaning: "thoát khỏi tình thế khó khăn" },
    quiz: reverseQuiz
  });
  await pending;
  assert.equal(els.hanziTerm.textContent, "thoát khỏi tình thế khó khăn");
  assert.match(els.revealedMeaning.textContent, /thoát khỏi tình thế khó khăn/);
  assert.equal(reverseCard.meaning, "to get out of a predicament");
});


test("on-device Vietnamese translations work even when both online services fail", async () => {
  const translations = { good: "tốt", mistake: "sai lầm", make: "làm", "Very good!": "Rất tốt!" };
  const model = {
    availability: async () => "available",
    create: async () => ({ translate: async text => translations[text] || text })
  };
  const h = harness({}, 429, {}, 503, model);
  const presentation = await h.api.localizePresentation(card, quiz, "vi");
  assert.equal(presentation.card.meaning, "tốt");
  assert.deepEqual(Array.from(presentation.quiz.choices, choice => choice.text), [
    "sai lầm", "tốt", "làm"
  ]);
  assert.equal(h.requests.length, 0, "Downloaded browser model avoids third-party APIs");
});

test("browser language pack can be enabled explicitly after a click", async () => {
  let modelsCreated = 0;
  const progress = [];
  const model = {
    availability: async () => "downloadable",
    create(options) {
      modelsCreated++;
      options.monitor({ addEventListener(type, callback) {
        assert.equal(type, "downloadprogress");
        callback({ loaded: 0.5 });
      } });
      return Promise.resolve({ translate: async text => text === "good" ? "tốt" : text });
    }
  };
  const h = harness({}, 429, {}, 503, model);
  assert.equal(h.api.browserTranslator(), model);
  const enabling = h.api.enableOnDeviceTranslation("vi", "en", pct => progress.push(pct));
  assert.equal(modelsCreated, 1, "Download starts synchronously within click handler");
  await enabling;
  assert.deepEqual(progress, [50]);
  assert.equal(await h.api.translateText("good", "vi"), "tốt");
  assert.equal(h.requests.length, 0);
});

test("unsupported on-device translation continues using online API fallback", async () => {
  const h = harness({ good: "tốt" }, 200, {}, 503, {
    availability: async () => "unavailable",
    create: () => { throw new Error("Do not download automatically"); }
  });
  assert.equal(await h.api.translateText("good", "vi"), "tốt");
  assert.ok(h.requests.some(request => request.provider === "mymemory"));
});

test("reverse quiz keeps original meaning readable with a separate retry indicator", async () => {
  const source = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
  const start = source.indexOf("  let visibleTranslationGeneration = 0;");
  const end = source.indexOf("  function renderCard(", start);
  const card = { id: "original", front: "出头", meaning: "to get out of a predicament" };
  const quiz = { choices: [{ id: "correct", text: "出头" }] };
  const state = {
    store: { settings: { translationLanguage: "vi" } },
    currentCard: card, currentQuiz: quiz, quizAnswered: false
  };
  const els = {
    hanziTerm: { textContent: "" },
    exampleEnglish: { textContent: "" }, revealedMeaning: { textContent: "" },
    translationPromptStatus: { hidden: true },
    translationPromptMessage: { textContent: "" },
    retryMeaningTranslationBtn: { hidden: true }
  };
  const context = vm.createContext({
    state, els, console,
    TranslationSupport: {
      normalizeLanguage: x => x,
      sourceLanguage: () => "zh-CN",
      localizePresentation: async () => ({ card, quiz })
    }
  });
  vm.runInContext(source.slice(start, end) +
    "\nglobalThis.localize = localizeRenderedCard;", context);
  await context.localize(card, quiz, true);
  assert.equal(els.hanziTerm.textContent, "to get out of a predicament",
    "Do not inject an error label into the vocabulary meaning");
  assert.equal(els.translationPromptStatus.hidden, false);
  assert.equal(els.retryMeaningTranslationBtn.hidden, false);
  assert.match(els.translationPromptMessage.textContent, /translation unavailable/i);
  state.store.settings.translationLanguage = "en";
  await context.localize(card, quiz, true);
  assert.equal(els.translationPromptStatus.hidden, true);
});


test("active Chinese learning pack supplies Chinese source, not its English definition language", () => {
  const h = harness();
  assert.equal(h.api.sourceLanguage({
    language: "Chinese", languageCode: "zh-CN",
    translationLanguage: "English", speechLang: "zh-CN"
  }), "zh-CN");
  assert.equal(h.api.sourceLanguage({
    language: "Chinese", translationLanguage: "English"
  }), "zh-CN");
  assert.equal(h.api.sourceLanguage({ languageCode: "ja", translationLanguage: "English" }), "ja");
});

test("Chinese cards and all answer meanings translate directly from Chinese to Vietnamese", async () => {
  const h = harness({
    "好": "tốt", "错": "sai lầm", "做": "làm", "很好": "rất tốt"
  });
  const sourcedQuiz = {
    correctChoiceId: "correct",
    choices: [
      { id: "wrong-1", cardId: "wrong-cuo", text: "mistake", isCorrect: false },
      { id: "correct", cardId: card.id, text: "good", isCorrect: true },
      { id: "wrong-2", cardId: "wrong-zuo", text: "make", isCorrect: false }
    ]
  };
  const wordCards = [card, { id: "wrong-cuo", front: "错" }, { id: "wrong-zuo", front: "做" }];
  const original = JSON.stringify({ card, sourcedQuiz, wordCards });
  const result = await h.api.localizePresentation(
    card, sourcedQuiz, "vi", "zh-CN", true, true, wordCards
  );
  assert.equal(result.card.meaning, "tốt");
  assert.equal(result.card.example.meaning, "rất tốt");
  assert.deepEqual(Array.from(result.quiz.choices, choice => choice.text),
    ["sai lầm", "tốt", "làm"]);
  assert.deepEqual(Array.from(result.quiz.choices, choice => choice.cardId),
    ["wrong-cuo", card.id, "wrong-zuo"]);
  assert.equal(JSON.stringify({ card, sourcedQuiz, wordCards }), original);
  assert.deepEqual(new Set(h.requests.map(request => request.source)),
    new Set(["好", "错", "做", "很好"]));
  assert.ok(h.requests.every(request => request.languagePair === "zh-CN|vi"));
  assert.ok(!h.requests.some(request => ["good", "mistake", "make", "Very good!"].includes(request.source)));
});

test("Mode 2 English prompt meaning comes directly from the underlying Chinese card", async () => {
  const h = harness({ "出头": "vươn lên" });
  const c = { id: "rise", front: "出头", meaning: "to get out of a predicament",
    example: { text: "他终于出头了。", meaning: "He finally succeeded." } };
  const reverse = { choices: [
    { id: "correct", cardId: "rise", text: "出头", isCorrect: true },
    { id: "wrong", cardId: "other", text: "喇叭", isCorrect: false }
  ] };
  const out = await h.api.localizePresentation(c, reverse, "vi", "zh-CN", false, false);
  assert.equal(out.card.meaning, "vươn lên");
  assert.equal(out.quiz, reverse);
  assert.equal(out.card.example.meaning, c.example.meaning);
  assert.ok(h.requests.every(request => request.source === "出头" &&
    request.languagePair === "zh-CN|vi"));
});

test("failed direct translation preserves original English definitions, not untranslated Chinese", async () => {
  const h = harness({}, 429);
  const q = {
    choices: [
      { id: "wrong", cardId: "other", text: "mistake", isCorrect: false },
      { id: "correct", cardId: card.id, text: "good", isCorrect: true }
    ]
  };
  const out = await h.api.localizePresentation(card, q, "vi", "zh-CN", true, true,
    [card, { id: "other", front: "错" }]);
  assert.equal(out.card.meaning, "good");
  assert.equal(out.card.example.meaning, "Very good!");
  assert.deepEqual(Array.from(out.quiz.choices, choice => choice.text), ["mistake", "good"]);
  assert.ok(h.requests.every(request => request.languagePair === "zh-CN|vi"));
});

test("identical Chinese-to-Vietnamese translations keep English quiz alternatives", async () => {
  const h = harness({ "好": "tốt", "错": "tốt" });
  const q = { choices: [
    { id: "correct", cardId: card.id, text: "good", isCorrect: true },
    { id: "wrong", cardId: "cuo", text: "mistake", isCorrect: false }
  ] };
  const out = await h.api.localizePresentation(card, q, "vi", "zh-CN", true, false,
    [card, { id: "cuo", front: "错" }]);
  assert.equal(out.quiz, q);
  assert.equal(out.card.meaning, "good");
});

test("on-device translator is requested for Chinese-to-Vietnamese, not English-to-Vietnamese", async () => {
  const pairs = [];
  const model = {
    availability: async options => {
      pairs.push(options);
      return "available";
    },
    create: async () => ({ translate: async text => text === "好" ? "tốt" : text })
  };
  const h = harness({}, 429, {}, 503, model);
  assert.equal(await h.api.translateText("好", "vi", "zh-CN"), "tốt");
  assert.ok(pairs.some(pair => pair.sourceLanguage === "zh-CN" &&
    pair.targetLanguage === "vi"));
  assert.equal(h.requests.length, 0);
});

test("Translate tab's known-word breakdown uses source word rather than English definition", () => {
  const app = fs.readFileSync(path.join(root, "web", "app.js"), "utf8");
  assert.match(app, /TranslationSupport\.sourceLanguage\(state\.activePack\)/);
  assert.match(app, /translateLearningWord\(w, target, card\.meaning \|\| ""\)/);
  assert.doesNotMatch(app, /TranslationSupport\.translateText\(card\.meaning \|\| "", target, "en"\)/);
  assert.match(app, /TranslationSupport\.enableOnDeviceTranslation\(\s*target, TranslationSupport\.sourceLanguage\(state\.activePack\)/);
});
