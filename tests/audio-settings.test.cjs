const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.join(__dirname, "..");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
function extractFunction(start, end) {
  const first = background.indexOf(start);
  const last = background.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing function boundary: ${start}`);
  return background.slice(first, last);
}
const context = vm.createContext({
  cleanText: (value) => String(value || "").trim()
});
vm.runInContext(
  background.slice(background.indexOf("const DEFAULT_SETTINGS ="), background.indexOf("let operationQueue =")) +
  extractFunction("function normalizeSettings(", "async function getStore(") +
  extractFunction("function buildCardSpeechSegments(", "async function speakCard("),
  context
);
const settings = (value) => vm.runInContext("normalizeSettings(" + JSON.stringify(value) + ")", context);
const segments = (part, readSentences) => {
  context.card = {
    front: "你好", speechText: "你好", speechLang: "zh-CN",
    example: { text: "你好！", speechLang: "zh-CN" }
  };
  context.opts = { part, readSentences };
  return Array.from(vm.runInContext("buildCardSpeechSegments(card, opts)", context), x => x.label);
};

test("sentence reading defaults on and persists an explicit off preference", () => {
  assert.equal(settings({ startedByUser: true }).readSentences, true);
  assert.equal(settings({ startedByUser: true, readSentences: false }).readSentences, false);
});
test("automatic playback omits only example audio when disabled", () => {
  assert.deepEqual(segments("all", true), ["word", "sentence"]);
  assert.deepEqual(segments("all", false), ["word"]);
  assert.deepEqual(segments("word", true), ["word"]);
  assert.deepEqual(segments("example", false), ["sentence"]);
});
test("English meanings contain no Chinese dictionary cross-references", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "vocabulary.json"), "utf8"));
  for (const pack of catalog.packs) {
    for (const card of pack.cards) {
      assert.doesNotMatch(card.meaning, /[\u3400-\u9fff]/u, `Card ${card.id}: ${card.meaning}`);
    }
  }
});

test("translation language defaults to English and validates supported choices", () => {
  assert.equal(settings({}).translationLanguage, "en");
  assert.equal(settings({ translationLanguage: "vi" }).translationLanguage, "vi");
  assert.equal(settings({ translationLanguage: "invalid" }).translationLanguage, "en");
});
