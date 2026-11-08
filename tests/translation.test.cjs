const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "web/translation.js"), "utf8");
const app = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const requests = [];
const context = vm.createContext({
  Intl,
  localStorage: { getItem() { throw new Error("Legacy machine cache must never be read"); } },
  Translator: { create() { throw new Error("Machine translation must never run"); } },
  fetch: async name => {
    assert.match(name, /^dictionary\/[a-zA-Z0-9-]+\.json$/);
    requests.push(name);
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, "web", name), "utf8")) };
  }
});
vm.runInContext(script, context);
const api = context.TranslationSupport;
let chinese;
let spanish;
test.before(async () => {
  await api.load();
  chinese = JSON.parse(fs.readFileSync(path.join(root, "web/vocabulary.json"), "utf8")).packs[0];
  chinese.cards.push(...chinese.cardFiles.flatMap(name => JSON.parse(fs.readFileSync(path.join(root, "web", name), "utf8"))));
  spanish = api.studyPacks()[0];
});

test("published dictionaries load once from local static assets", async () => {
  const before = requests.length;
  await Promise.all([api.load(), api.load()]);
  assert.equal(requests.length, before);
  assert.equal(new Set(requests).size, requests.length);
  assert.doesNotMatch(script, /translate\.google|mymemory|localStorage|root\.Translator/);
});

test("Chinese and Spanish lookup directly into either English or Vietnamese offline", async () => {
  const before = requests.length;
  assert.match(api.lookup("你好", "vi", "zh-CN").text, /chào/i);
  assert.match(api.lookup("你好", "en", "zh-CN").text, /hello/i);
  assert.match(api.lookup("hola", "vi", "es").text, /chào/i);
  assert.match(api.lookup("hola", "en", "es").text, /hello/i);
  assert.equal(await api.translateText("hola", "en", "es"), api.lookup("hola", "en", "es").text);
  assert.equal(requests.length, before);
});

test("learning-language metadata stays independent of stored meaning language", () => {
  assert.equal(api.sourceLanguage({ languageCode: "es-MX", translationLanguage: "English" }), "es-MX");
  assert.equal(api.sourceLanguage({ language: "Chinese", translationLanguage: "English" }), "zh-CN");
  assert.equal(api.sourceLanguage({ languageCode: "ja", translationLanguage: "Vietnamese" }), "ja");
  assert.equal(api.normalizeLanguage("zh_Hans"), "zh-CN");
  assert.equal(api.normalizeLanguage("pt_BR"), "pt-BR");
});

test("lookups retain senses, parts of speech, labels, source pages and licenses", () => {
  const result = api.lookup("casa", "vi", "es");
  assert.ok(result.senses.length > 1);
  for (const sense of result.senses) {
    assert.ok(sense.partOfSpeech);
    assert.ok(sense.gloss);
    assert.match(sense.sourceUrl, /^https:\/\/vi.wiktionary.org\/wiki\//);
    assert.equal(sense.license, "CC-BY-SA-4.0");
  }
  const chineseResult = api.lookup("行", "en", "zh-CN");
  assert.ok(new Set(chineseResult.senses.map(sense => sense.reading)).size > 1);
});

test("NFC and case normalization preserve Spanish accents", () => {
  assert.equal(api.lookup("HOLA", "vi", "es").text, api.lookup("hola", "vi", "es").text);
  assert.equal(api.lookup("cafe\u0301", "vi", "es").text, api.lookup("café", "vi", "es").text);
  assert.notEqual(api.lookup("si", "vi", "es").text, api.lookup("sí", "vi", "es").text);
});

test("missing pairs, missing senses and unknown words never pivot or substitute English", async () => {
  for (const [word, target, source, key] of [
    ["not-a-published-word", "vi", "zh-CN"], ["hola", "fr", "es"],
    ["hello", "es", "en"], ["你好", "vi", "zh-CN", "wrong-source-sense"]
  ]) {
    assert.equal(api.lookup(word, target, source, key).status, "missing");
    assert.equal(api.lookup(word, target, source, key).text, "");
  }
  assert.equal(await api.translateText("unknown unpublished phrase", "vi", "es"), "");
});

test("pack projection changes meanings while retaining IDs, source cards and saved progress", () => {
  const original = JSON.stringify(chinese);
  const en = api.localizePack(chinese, "en");
  const vi = api.localizePack(chinese, "vi");
  assert.equal(en.cards.length, 9978);
  assert.equal(vi.cards.length, 646);
  const greeting = vi.cards.find(card => card.front === "你好");
  assert.equal(greeting.id, "w001");
  assert.equal(greeting.speechLang, "zh-CN");
  assert.match(greeting.meaning, /chào/i);
  assert.equal(greeting.meaningLanguageCode, "vi");
  assert.equal(JSON.stringify(chinese), original);
  assert.equal(api.localizePack(chinese, "vi"), vi);
  assert.equal(api.localizePack(chinese, "fr").cards.length, 0);
});

test("Spanish study pack and target choices come from installed dictionary pairs", () => {
  assert.equal(spanish.languageCode, "es");
  assert.equal(spanish.cards.length, 8549);
  assert.equal(new Set(spanish.cards.map(card => card.id)).size, spanish.cards.length);
  assert.equal(api.localizePack(spanish, "en").cards.length, 4645);
  assert.equal(api.localizePack(spanish, "vi").cards.length, 4290);
  assert.deepEqual(Array.from(api.targetLanguages("es")), ["en", "vi"]);
  assert.equal(api.targetLanguages("ja").length, 0);
});

test("published examples have meanings in the selected target language", () => {
  const vi = api.localizePack(spanish, "vi");
  const card = vi.cards.find(item => item.front === "en");
  assert.ok(card.example.text);
  assert.ok(card.example.meaning);
  const en = api.localizePack(spanish, "en").cards.find(item => item.front === "casa");
  assert.equal(en.example, null);
});

test("quiz builders consume projected meanings and retain the correct card identity", () => {
  const cards = api.localizePack(spanish, "vi").cards;
  const target = cards.find(card => card.front === "hola");
  const start = app.indexOf("  function buildMeaningQuiz(");
  const end = app.indexOf("  function buildPictureQuiz(", start);
  const ctx = { Math, wasEverReviewed: () => false };
  vm.runInNewContext(app.slice(start, end) + "\nglobalThis.build = buildMeaningQuiz;", ctx);
  const quiz = ctx.build(cards, target);
  assert.equal(quiz.choices.length, 3);
  assert.equal(quiz.choices.find(choice => choice.isCorrect).cardId, target.id);
  assert.equal(quiz.choices.find(choice => choice.isCorrect).text, target.meaning);
  assert.equal(new Set(quiz.choices.map(choice => choice.text)).size, 3);
});

test("switching meaning language reprojects the active pack without changing review history", () => {
  const progress = { w001: { remembered: 3 } };
  const state = { catalog: { packs: [chinese, spanish] },
    activePack: api.localizePack(chinese, "en"), currentCard: {}, currentQuiz: {}, learningStatus: "active",
    store: { settings: { activePackId: chinese.id, translationLanguage: "en" }, progress } };
  const control = () => ({ value: "", children: [], appendChild(child) { this.children.push(child); } });
  const els = { meaningLanguageSelect: control(), translateTargetSelect: control(), translateResult: {} };
  let presented = 0;
  const ctx = {
    state, els, TranslationSupport: api, wordLoopState: { active: false },
    document: { createElement: control, querySelector: () => null, querySelectorAll: () => [] },
    stopAudio() {}, loadVoices() {}, saveStoredState() {}, updateDashboardCounts() {}, renderDeckList() {},
    updateWordLoopPreview() {}, updateLearningSessionUi() {}, presentNextCard() { presented++; }
  };
  const start = app.indexOf("  function syncMeaningLanguageControls(");
  const end = app.indexOf("  function syncActiveSaveToPage(", start);
  vm.runInNewContext("let translationGeneration = 0; let visibleTranslationGeneration = 0;\n" + app.slice(start, end) +
    "\nglobalThis.change = changeMeaningLanguage; globalThis.apply = applyDictionaryLanguage;", ctx);
  ctx.change("vi");
  assert.equal(state.activePack.cards.length, 646);
  assert.equal(state.store.progress, progress);
  assert.equal(state.currentCard, null);
  assert.equal(state.currentQuiz, null);
  assert.equal(presented, 1);
  assert.equal(els.meaningLanguageSelect.value, "vi");
  state.store.settings.activePackId = spanish.id;
  ctx.apply();
  assert.equal(state.activePack.languageCode, "es");
  assert.equal(state.activePack.cards.length, 4290);
  assert.ok(state.activePack.cards.every(card => card.speechLang === "es"));
});

test("new BCP 47 language pairs require only attributed data and catalog metadata", () => {
  const ctx = { Intl };
  vm.runInNewContext(script, ctx);
  const data = { schemaVersion: 1, languages: { de: "German", vi: "Vietnamese" },
    sources: { fixture: { name: "Test fixture", review: "published-human-edited", url: "https://example.org", license: "test" } },
    pairs: [{ source: "de", target: "vi", files: ["de-vi.json"] }],
    studyPacks: [{ id: "german", languageCode: "de", name: "German" }] };
  const files = { "de-vi.json": { sourceId: "fixture", entries: [{ headword: "Haus", senses: [{ gloss: "nhà" }] }] } };
  ctx.TranslationSupport.install(data, files);
  assert.equal(ctx.TranslationSupport.lookup("Haus", "vi", "de").text, "nhà");
  const invalid = structuredClone(data);
  invalid.sources.fixture.review = "machine-generated";
  assert.throws(() => ctx.TranslationSupport.install(invalid, files), /Invalid dictionary source/);
  assert.equal(ctx.TranslationSupport.lookup("Haus", "vi", "de").text, "nhà");
});

test("failed dictionary loads can be retried without publishing partial data", async () => {
  let fail = true;
  const ctx = { Intl, fetch: async name => {
    if (fail && name.endsWith("es-en.json")) return { ok: false };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, "web", name), "utf8")) };
  } };
  vm.runInNewContext(script, ctx);
  await assert.rejects(ctx.TranslationSupport.load(), /Could not load/);
  assert.equal(ctx.TranslationSupport.lookup("hola", "en", "es").status, "missing");
  fail = false;
  await ctx.TranslationSupport.load();
  assert.equal(ctx.TranslationSupport.lookup("hola", "en", "es").status, "found");
});

test("service worker precaches each dictionary and the published copies match", () => {
  const sw = fs.readFileSync(path.join(root, "web/sw.js"), "utf8");
  const data = JSON.parse(fs.readFileSync(path.join(root, "web/dictionary/catalog.json"), "utf8"));
  for (const name of ["catalog.json", ...data.pairs.flatMap(pair => pair.files)]) {
    assert.ok(sw.includes(`./dictionary/${name}`), name);
    assert.deepEqual(fs.readFileSync(path.join(root, "web/dictionary", name)), fs.readFileSync(path.join(root, "docs/dictionary", name)));
  }
  assert.equal(fs.readFileSync(path.join(root, "docs/translation.js"), "utf8"), script);
});
