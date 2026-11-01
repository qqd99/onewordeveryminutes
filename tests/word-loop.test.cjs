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

test("loop 5 uses words 6–10, then slides to 9–13 after studying 11–13", () => {
  const queueCode = extract("  function buildWordLoopQueue(", "  async function updateWordLoopCurrentMeaning(");
  const cards = Array.from({length: 15}, (_, index) => ({
    id: String(index + 1), front: String(index + 1), meaning: "Word " + (index + 1)
  }));
  const progress = {};
  const recentWordIds = [];
  const context = {
    Map, state: {activePack: {cards}, store: {recentWordIds, progress}},
    getModeEligibleVocabulary: list => list
  };
  vm.runInNewContext(queueCode + "\nglobalThis.build = buildWordLoopQueue;", context);
  const ids = () => Array.from(context.build(5), card => card.id);
  for (let i = 1; i <= 10; i++) {
    progress[String(i)] = {lastShownAt: 1000 + i};
    recentWordIds.push(String(i));
  }
  assert.deepEqual(ids(), ["6", "7", "8", "9", "10"]);
  for (let i = 11; i <= 13; i++) {
    progress[String(i)] = {lastShownAt: 1000 + i};
    recentWordIds.push(String(i));
  }
  assert.deepEqual(ids(), ["9", "10", "11", "12", "13"]);
  // An unseen word must never appear merely to fill the configured count.
  assert.ok(!ids().includes("14"));
  assert.deepEqual(Array.from(context.build(20), card => card.id), recentWordIds);
});

test("word order is based on learning history, not due dates or vocabulary order", () => {
  const queueCode = extract("  function buildWordLoopQueue(", "  async function updateWordLoopCurrentMeaning(");
  const cards = [
    {id: "4"}, {id: "2"}, {id: "3"}, {id: "1"}, {id: "5"}, {id: "unseen"}
  ];
  const progress = {
    "1": {lastShownAt: 10, dueAt: 99999},
    "2": {lastShownAt: 20, dueAt: 1},
    "3": {lastShownAt: 30, dueAt: 999},
    "4": {lastShownAt: 40, dueAt: 0},
    "5": {lastShownAt: 50, dueAt: 4}
  };
  const context = {
    Map, state: {activePack: {cards}, store: {
      recentWordIds: ["1", "2", "3", "4", "5"], progress
    }},
    getModeEligibleVocabulary: list => list
  };
  vm.runInNewContext(queueCode + "\nglobalThis.build = buildWordLoopQueue;", context);
  assert.deepEqual(Array.from(context.build(3), card => card.id), ["3", "4", "5"]);
  assert.deepEqual(Array.from(context.build(5, cards.slice(0, 3)), card => card.id), ["2", "3", "4"]);
});

test("legacy saves reconstruct word order using recorded study timestamps", () => {
  const normalizeCode = extract("  function normalizeRecentWordIds(", "  function normalizeSaveStore(");
  const context = {Object, Number, Array, Set};
  vm.runInNewContext(normalizeCode + "\nglobalThis.normalize = normalizeRecentWordIds;", context);
  const progress = {
    "2": {lastShownAt: 200}, "1": {lastShownAt: 100},
    "3": {lastReviewedAt: 300}, unseen: {}
  };
  assert.deepEqual(Array.from(context.normalize(null, progress)), ["1", "2", "3"]);
  assert.deepEqual(Array.from(context.normalize(["3", "1", "2"], progress)), ["3", "1", "2"]);
  assert.deepEqual(Array.from(context.normalize(["3", "1", "1", "invalid", "2"], progress)), ["3", "1", "2"]);
});

test("learning history is updated on card presentation and persists across saves", () => {
  assert.match(app, /state\.store\.recentWordIds = \[\s*\.\.\.\(state\.store\.recentWordIds \|\| \[\]\)\.filter\(id => id !== card\.id\), card\.id/);
  assert.match(app, /state\.store\.recentWordIds = \[\];/);
  assert.match(app, /recentWordIds: normalizeRecentWordIds\(stored\.recentWordIds, stored\.progress\)/);
  assert.match(app, /recentWordIds: state\.store\.recentWordIds/);
  assert.match(app, /recentWordIds: imported\?\.recentWordIds/);
  assert.match(app, /buildWordLoopQueue\(requested, eligible\)/);
  assert.match(app, /state\.store\.settings\.wordLoopCount = requested/);
});

test("word loop runs indefinitely, wraps to its first word, and can be stopped", () => {
  assert.match(app, /while \(wordLoopState\.active && token === wordLoopState\.token\)/);
  assert.match(app, /wordLoopState\.index = \(wordLoopState\.index \+ 1\) % wordLoopState\.queue\.length/);
  assert.match(app, /function stopWordLoop\(/);
  assert.match(app, /els\.stopWordLoopBtn\?\.addEventListener\("click", \(\) => stopWordLoop\(\)\)/);
  assert.match(app, /repeat: wordLoopState\.repeats/);
  assert.match(app, /speechText \|\| card\.front/);
  assert.match(app, /if \(wasActive && state\.learningStatus === "active"\) scheduleNextReminder\(\)/);
  assert.match(app, /state\.nextReminderTime = null;\s*stopAudio\(\);\s*wordLoopState\.active = true/);
});

test("loop settings persist the word count and repetition count", () => {
  assert.match(app, /wordLoopCount: 10/);
  assert.match(app, /settings\.wordLoopCount = Math\.max\(1, Math\.min\(10000/);
  assert.match(app, /settings\.wordRepeat = Math\.max\(1, Math\.min\(10/);
  assert.match(app, /saveStoredState\(\);\s*updateWordLoopPreview\(\);/);
  assert.match(html, /id="wordLoopCount"/);
  assert.match(html, /id="wordRepeatLabel"/);
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

test("settings are simplified while advanced reminders and attribution remain available", () => {
  for (const id of [
    "wordLoopPanel", "learningModeSelect", "meaningLanguageSelect",
    "readWordToggle", "readSentenceToggle", "volumeRange", "speedRange",
    "audioEngineSelect", "voiceSelect", "saveSlotSelect", "exportDataBtn",
    "reminderEnabled", "intervalHoursInput", "enableBrowserNotifications"
  ]) assert.ok(html.includes('id="' + id + '"'), "Missing control: " + id);
  for (const id of [
    "testAudioBtn", "onDeviceTranslationRow"
  ]) assert.ok(!html.includes('id="' + id + '"'), "Unnecessary setting remains: " + id);
  assert.match(css, /\.word-loop-panel/);
  assert.match(css, /\.settings-savebar/);
  assert.match(html, /Save files and backups/);
  assert.match(html, /Reminder options/);
  assert.match(html, /CC-CEDICT/);
});

test("word loop shows only the current word with its meaning", () => {
  assert.match(html, /<div id="wordLoopPreview" class="word-loop-current"/);
  assert.match(html, /id="wordLoopCurrentWord"/);
  assert.match(html, /id="wordLoopCurrentReading"/);
  assert.match(html, /id="wordLoopCurrentMeaning"/);
  assert.doesNotMatch(html, /<ol id="wordLoopPreview"/);
  const preview = extract("  function updateWordLoopPreview()", "  function stopWordLoop(");
  assert.match(preview, /wordLoopState\.active \? queue\[wordLoopState.index\] : queue\[0\]/);
  assert.doesNotMatch(preview, /queue\.slice|visible\.forEach|replaceChildren/);
  assert.match(app, /TranslationSupport\.localizePresentation\(\s*card, null/);
  assert.match(preview, /card\?\.reading \|\| ""/);
  assert.match(preview, /wordLoopCurrentReading\.hidden = !card\?\.reading/);
});

test("word-loop and settings markup is mirrored by the app script and cache version", () => {
  assert.match(html, /app\.js\?v=37/);
  assert.match(html, /style\.css\?v=37/);
  const sw = fs.readFileSync(path.join(root, "web/sw.js"), "utf8");
  assert.match(sw, /vocab-srs-cache-v37/);
  assert.match(sw, /\.\/app\.js\?v=37/);
  assert.match(sw, /\.\/style\.css\?v=37/);
});
