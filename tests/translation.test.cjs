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
  api.bindVocabulary([chinese, spanish]);
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
    assert.ok(sense.gloss);
    assert.ok(sense.rowId);
    assert.ok(sense.sources.every(source => source.review === "published-human-edited"));
    if (sense.sourceId === "es-vi") {
      assert.ok(sense.partOfSpeech);
      assert.match(sense.sourceUrl, /^https:\/\/vi.wiktionary.org\/wiki\//);
      assert.equal(sense.license, "CC-BY-SA-4.0");
    }
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
  assert.equal(vi.cards.length, 959);
  const greeting = vi.cards.find(card => card.front === "你好");
  assert.equal(greeting.id, "w001");
  assert.equal(greeting.speechLang, "zh-CN");
  assert.match(greeting.meaning, /chào/i);
  assert.equal(greeting.meaningLanguageCode, "vi");
  assert.equal(JSON.stringify(chinese), original);
  assert.equal(api.localizePack(chinese, "vi"), vi);
  assert.equal(api.localizePack(chinese, "fr").cards.length, 0);
});

test("legacy Spanish progress is retained while target choices come from shared columns", () => {
  assert.equal(spanish.languageCode, "es");
  assert.equal(spanish.cards.length, 8549);
  assert.equal(new Set(spanish.cards.map(card => card.id)).size, spanish.cards.length);
  assert.equal(api.localizePack(spanish, "en").cards.length, 4646);
  assert.equal(api.localizePack(spanish, "vi").cards.length, 5122);
  assert.deepEqual(new Set(api.targetLanguages("es")), new Set(["en", "vi", "it", "zh-CN"]));
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
  assert.equal(state.activePack.cards.length, 1136);
  assert.equal(state.store.progress, progress);
  assert.equal(state.currentCard, null);
  assert.equal(state.currentQuiz, null);
  assert.equal(presented, 1);
  assert.equal(els.meaningLanguageSelect.value, "vi");
  state.store.settings.learningLanguage = "es";
  ctx.apply();
  assert.equal(state.activePack.languageCode, "es");
  assert.equal(state.activePack.cards.length, 5627);
  assert.ok(state.activePack.cards.every(card => card.speechLang === "es"));
  state.store.settings.learningLanguage = "it";
  state.store.settings.translationLanguage = "en";
  ctx.apply();
  state.currentCard = state.activePack.cards.find(card => card.rowId === "ids:1-310");
  const currentId = state.currentCard.id;
  ctx.isModeEligibleCard = () => true;
  ctx.renderCard = card => { state.currentCard = card; };
  ctx.change("vi");
  assert.equal(state.currentCard.id, currentId);
  assert.equal(state.currentCard.front, "acqua");
  assert.equal(state.currentCard.meaning, "nước");
});

test("another language column works through the shared row format", () => {
  const ctx = { Intl };
  vm.runInNewContext(script, ctx);
  const source = { name: "Test fixture", review: "published-human-edited", url: "https://example.org", license: "test" };
  const data = { schemaVersion: 2, languages: { de: "German", en: "English", vi: "Vietnamese" },
    sources: {}, rowFiles: ["board.json"], imports: [] };
  const cell = text => ({ forms: [text], sources: [{ id: "fixture", key: text }] });
  const files = { "board.json": { sources: { fixture: source }, rows: [
    { id: "house", cells: { de: cell("Haus"), en: cell("house"), vi: cell("nhà") } },
    { id: "tree", cells: { de: cell("Baum"), en: cell("tree") } }
  ] } };
  ctx.TranslationSupport.install(data, files);
  ctx.TranslationSupport.bindVocabulary([]);
  assert.equal(ctx.TranslationSupport.lookup("Haus", "vi", "de").text, "nhà");
  assert.equal(ctx.TranslationSupport.lookup("nhà", "de", "vi").text, "Haus");
  assert.equal(ctx.TranslationSupport.learningPack("de", "vi").cards.length, 1);
  assert.equal(ctx.TranslationSupport.learningPack("de", "en").cards.length, 2);
  assert.equal(ctx.TranslationSupport.lookup("Baum", "vi", "de").status, "missing");
  const invalid = structuredClone(files);
  invalid["board.json"].sources.fixture.review = "machine-generated";
  assert.throws(() => ctx.TranslationSupport.install(data, invalid), /Invalid published source/);
  assert.equal(ctx.TranslationSupport.lookup("Haus", "vi", "de").text, "nhà");
  const duplicateSources = structuredClone(data);
  duplicateSources.rowFiles.push("extra.json");
  const duplicateFiles = { ...files, "extra.json": { sources: { fixture: source }, rows: [] } };
  assert.throws(() => ctx.TranslationSupport.install(duplicateSources, duplicateFiles), /Duplicate published source/);
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
  for (const name of ["catalog.json", ...data.rowFiles, ...data.imports.map(item => item.file)]) {
    assert.ok(sw.includes(`./dictionary/${name}`), name);
    assert.deepEqual(fs.readFileSync(path.join(root, "web/dictionary", name)), fs.readFileSync(path.join(root, "docs/dictionary", name)));
  }
  assert.equal(fs.readFileSync(path.join(root, "docs/translation.js"), "utf8"), script);
});

test("the shared concept rows contain native Italian, English, Spanish and Vietnamese columns", () => {
  const board = JSON.parse(fs.readFileSync(path.join(root, "web/dictionary/concepts.json"), "utf8"));
  assert.equal(board.rows.length, 1310);
  assert.equal(new Set(board.rows.map(row => row.id)).size, 1310);
  for (const row of board.rows) {
    for (const language of ["it", "en", "es", "vi"]) {
      assert.ok(row.cells[language].forms.length);
      assert.ok(row.cells[language].sources.every(credit => board.sources[credit.id].review === "published-human-edited"));
    }
  }
  const water = board.rows.find(row => row.id === "ids:1-310");
  assert.equal(water.cells.it.forms[0], "acqua");
  assert.equal(water.cells.en.forms[0], "water");
  assert.equal(water.cells.es.forms[0], "agua");
  assert.equal(water.cells.vi.forms[0], "nước");
  assert.equal(water.cells["zh-CN"].forms[0], "水");
});

test("Italian study takes its prompt and meaning from the same row", () => {
  const english = api.learningPack("it", "en");
  const vietnamese = api.learningPack("it", "vi");
  assert.equal(english.cards.length, 1310);
  assert.equal(vietnamese.cards.length, 1310);
  const a = english.cards.find(card => card.rowId === "ids:1-310");
  const b = vietnamese.cards.find(card => card.rowId === "ids:1-310");
  assert.equal(a.front, "acqua");
  assert.equal(a.meaning, "water");
  assert.equal(b.meaning, "nước");
  assert.equal(a.id, b.id);
  assert.equal(a.speechLang, "it");
  assert.ok(api.learningLanguages().includes("it"));
  assert.ok(api.targetLanguages("it").includes("vi"));
});

test("the same cells support English and Vietnamese as learning languages", () => {
  for (const [language, word] of [["en", "water"], ["vi", "nước"]]) {
    const card = api.learningPack(language, "it").cards.find(item => item.rowId === "ids:1-310");
    assert.equal(card.front, word);
    assert.equal(card.meaning, "acqua");
    assert.equal(card.speechLang, language);
  }
  assert.notEqual(api.learningPack("en", "it").cards[0].id, api.learningPack("it", "en").cards[0].id);
  assert.equal(api.learningPack("it", "zh-CN").cards.length, 570);
});

test("old Chinese word IDs remain valid and language-column IDs survive meaning changes", () => {
  const original = chinese.cards.find(card => card.front === "水");
  const card = api.learningPack("zh-CN", "vi").cards.find(item => item.rowId === "ids:1-310");
  assert.equal(card.id, original.id);
  assert.ok(api.knownCardIds().includes("w001"));
  assert.ok(api.knownCardIds().includes(api.learningPack("it", "vi").cards[0].id));
  const originalReading = original.reading;
  assert.equal(card.reading, originalReading);
});

test("definition-only supplementary cells cannot become English learning prompts", () => {
  const prose = "to get out of a predicament";
  assert.equal(api.lookup(prose, "it", "en").status, "missing");
  assert.equal(api.learningPack("en", "vi").cards.some(card => card.front === prose), false);
});

test("matching English spellings never join unrelated rows", () => {
  const ctx = { Intl };
  vm.runInNewContext(script, ctx);
  const credit = { id: "fixture", key: "bank" };
  const cell = form => ({ forms: [form], sources: [credit] });
  const data = { schemaVersion: 2, languages: { en: "English", de: "German", vi: "Vietnamese", it: "Italian" },
    sources: {}, imports: [], rowFiles: ["rows.json"] };
  const files = { "rows.json": { sources: { fixture: { name: "Fixture", review: "published-human-edited", url: "https://example.org", license: "test" } }, rows: [
    { id: "financial-bank", cells: { en: cell("bank"), de: cell("Bank") } },
    { id: "river-bank", cells: { en: cell("bank"), vi: cell("bờ sông"), it: cell("sponda") } }
  ] } };
  ctx.TranslationSupport.install(data, files);
  assert.equal(ctx.TranslationSupport.lookup("Bank", "vi", "de").status, "missing");
  assert.equal(ctx.TranslationSupport.lookup("Bank", "it", "de").status, "missing");
  assert.equal(ctx.TranslationSupport.lookup("bank", "it", "en").text, "sponda");
  const duplicate = structuredClone(files);
  duplicate["rows.json"].rows.push(duplicate["rows.json"].rows[0]);
  assert.throws(() => ctx.TranslationSupport.install(data, duplicate), /duplicate vocabulary row/);
  assert.equal(ctx.TranslationSupport.lookup("bank", "it", "en").text, "sponda");
});

test("valid meanings of an ambiguous learning word are excluded from distractors", () => {
  const cards = [
    { id: "water", front: "nước", meaning: "acqua", dictionarySenses: [{ rowId: "water" }] },
    { id: "country", front: "nước", meaning: "paese", dictionarySenses: [{ rowId: "country" }] },
    { id: "country-synonym", front: "quốc gia", meaning: "paese", dictionarySenses: [{ rowId: "country" }] },
    { id: "fire", front: "lửa", meaning: "fuoco", dictionarySenses: [{ rowId: "fire" }] },
    { id: "mountain", front: "núi", meaning: "montagna", dictionarySenses: [{ rowId: "mountain" }] }
  ];
  const start = app.indexOf("  function buildMeaningQuiz(");
  const end = app.indexOf("  function chineseCharacterCount(", start);
  const ctx = { Math, wasEverReviewed: () => false };
  vm.runInNewContext(app.slice(start, end) + "\nglobalThis.build = buildMeaningQuiz;", ctx);
  const quiz = ctx.build(cards, cards[0]);
  assert.equal(quiz.choices.length, 3);
  assert.equal(quiz.choices.some(choice => choice.text === "paese"), false);
  assert.equal(quiz.choices.find(choice => choice.isCorrect).text, "acqua");
});
