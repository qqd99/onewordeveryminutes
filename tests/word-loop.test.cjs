const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "web/style.css"), "utf8");

function extract(first, last) {
  const start = app.indexOf(first);
  const end = app.indexOf(last, start);
  assert.ok(start >= 0 && end > start, "Missing app section: " + first);
  return app.slice(start, end);
}

test("word-loop queue prioritizes the current word, due reviews, then unseen words", () => {
  const queueCode = extract("  function buildWordLoopQueue(", "  function updateWordLoopPreview(");
  const now = Date.now();
  const cards = [
    {id:"new-a",front:"新一",meaning:"new one"},
    {id:"due-later",front:"迟",meaning:"late"},
    {id:"current",front:"现在",meaning:"now"},
    {id:"deferred",front:"暂",meaning:"deferred"},
    {id:"due-first",front:"早",meaning:"early"},
    {id:"future",front:"后",meaning:"future"},
    {id:"new-b",front:"新二",meaning:"new two"}
  ];
  const progress = {
    "due-later": {lastReviewedAt:now-1000,dueAt:now-1000},
    current: {lastReviewedAt:now-1000,dueAt:now+50000},
    deferred: {lastShownAt:now-5000},
    "due-first": {lastReviewedAt:now-10000,dueAt:now-10000},
    future: {lastReviewedAt:now-1000,dueAt:now+100000}
  };
  const context = {
    Date,
    Set,
    state: {activePack:{cards},currentCard:cards[2],store:{progress}},
    getModeEligibleVocabulary: list => list,
    normalizeProgress: p => ({dueAt:p?.dueAt||0,lastShownAt:p?.lastShownAt||0}),
    wasEverShown: p => Boolean(p?.lastShownAt||p?.lastReviewedAt||p?.remembered||p?.forgotten),
    wasEverReviewed: p => Boolean(p?.lastReviewedAt||p?.remembered||p?.forgotten)
  };
  vm.runInNewContext(queueCode + "\nglobalThis.build = buildWordLoopQueue;", context);
  const ids = Array.from(context.build(5), card => card.id);
  assert.deepEqual(ids, ["current","due-first","due-later","new-a","new-b"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("word loop runs indefinitely, wraps to its first word, and can be stopped", () => {
  assert.match(app, /while \(wordLoopState\.active && token === wordLoopState\.token\)/);
  assert.match(app, /wordLoopState\.index = \(wordLoopState\.index \+ 1\) % wordLoopState\.queue\.length/);
  assert.match(app, /function stopWordLoop\(/);
  assert.match(app, /els\.stopWordLoopBtn\?\.addEventListener\("click", \(\) => stopWordLoop\(\)\)/);
  assert.match(app, /repeat: wordLoopState\.repeats/);
  assert.match(app, /speechText \|\| card\.front/);
});

test("loop settings persist the word count and repetition count", () => {
  assert.match(app, /wordLoopCount: 10/);
  assert.match(app, /settings\.wordLoopCount = Math\.max\(1, Math\.min\(10000/);
  assert.match(app, /settings\.wordRepeat = Math\.max\(1, Math\.min\(10/);
  assert.match(app, /saveStoredState\(\);\s*updateWordLoopPreview\(\);/);
  assert.match(html, /id="wordLoopCount"/);
  assert.match(html, /id="wordRepeatCount" class="input-number" min="1" max="10"/);
});

test("Save settings persists all essential and advanced preferences", () => {
  const setup = extract("  function setupSettings()", "  /* -------------------------------------------------------------\n     11. KEYBOARD");
  for (const setting of [
    "settings.theme =", "settings.activePackId =", "settings.learningMode =",
    "settings.translationLanguage =", "settings.audioEngine =", "settings.selectedVoice =",
    "settings.volume =", "settings.speed =", "settings.readWords =",
    "settings.readSentences =", "settings.wordRepeat =", "settings.wordLoopCount =",
    "saveStoredState()"
  ]) assert.ok(setup.includes(setting), "Save settings is missing " + setting);
  assert.match(html, /id="saveSettingsBtn"/);
  assert.match(html, /id="settingsSaveStatus"/);
});

test("settings are simplified and old reminder/diagnostic controls are absent", () => {
  for (const id of [
    "wordLoopPanel", "learningModeSelect", "meaningLanguageSelect",
    "readWordToggle", "readSentenceToggle", "volumeRange", "speedRange",
    "audioEngineSelect", "voiceSelect", "saveSlotSelect", "exportDataBtn"
  ]) assert.ok(html.includes('id="' + id + '"'), "Missing control: " + id);
  for (const id of [
    "reminderEnabled", "enableBrowserNotifications", "intervalHoursInput",
    "testAudioBtn", "onDeviceTranslationRow"
  ]) assert.ok(!html.includes('id="' + id + '"'), "Unnecessary setting remains: " + id);
  assert.match(css, /\.word-loop-panel/);
  assert.match(css, /\.settings-savebar/);
  assert.match(html, /Save files and backups/);
});

test("word-loop and settings markup is mirrored by the app script and cache version", () => {
  assert.match(html, /app\.js\?v=35/);
  assert.match(html, /style\.css\?v=35/);
  const sw = fs.readFileSync(path.join(root, "web/sw.js"), "utf8");
  assert.match(sw, /vocab-srs-cache-v35/);
  assert.match(sw, /\.\/app\.js\?v=35/);
  assert.match(sw, /\.\/style\.css\?v=35/);
});
