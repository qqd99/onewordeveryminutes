const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const translationScript = fs.readFileSync(path.join(root, "translation.js"), "utf8");

function harness(translations = {}, status = 200) {
  const requests = [];
  const context = vm.createContext({
    URLSearchParams,
    AbortController,
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: async url => {
      const parsed = new URL(url);
      const source = parsed.searchParams.get("q");
      const languagePair = parsed.searchParams.get("langpair");
      requests.push({ source, languagePair });
      return {
        ok: status === 200,
        status,
        json: async () => ({
          responseStatus: status,
          responseData: { translatedText: translations[source] ?? source }
        })
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

test("web and docs use the same translation engine as the extension", () => {
  for (const dir of ["web", "docs"]) {
    assert.equal(fs.readFileSync(path.join(root, dir, "translation.js"), "utf8"),
      translationScript);
  }
});
