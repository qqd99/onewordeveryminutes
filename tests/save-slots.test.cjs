const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const start = source.indexOf("  function cloneSaveData(");
const end = source.indexOf("  /* -------------------------------------------------------------\n     2. THEME & TOAST", start);
assert.ok(start >= 0 && end > start, "Save file engine must exist");
const saveCode = source.slice(start, end);

function control() {
  const events = new Map();
  return {
    value: "", checked: false, disabled: false, children: [],
    addEventListener(type, fn) { events.set(type, fn); },
    appendChild(child) { this.children.push(child); },
    fire(type = "click", event = {}) {
      const handler = events.get(type);
      assert.ok(handler, "Missing event handler: " + type);
      return handler({ target: this, ...event });
    }
  };
}

function createHarness(legacy = null, existingSlots = null) {
  const items = new Map();
  if (legacy !== null) items.set("vocab_srs_state_v1", JSON.stringify(legacy));
  if (existingSlots !== null) items.set("vocab_srs_save_slots_v1", JSON.stringify(existingSlots));
  const els = {
    quickSaveSelect: control(), saveSlotSelect: control(),
    newSaveBtn: control(), duplicateSaveBtn: control(),
    renameSaveBtn: control(), deleteSaveBtn: control(),
    importSaveBtn: control(), importSaveFile: control(),
    activeSaveInfo: control(), themeToggle: control(),
    meaningLanguageSelect: control(), translateTargetSelect: control()
  };
  const state = {
    store: {
      settings: {
        theme: "light", learningMode: "chinese-to-english", activePackId: "hsk",
        translationLanguage: "en",
        intervalHours: 0, intervalMinutes: 15, intervalSeconds: 0,
        readWords: true, readSentences: true,
        volume: 100, wordRepeat: 2, audioEngine: "auto"
      },
      progress: {}, currentCardId: null, lastCardId: null
    },
    learningStatus: "idle", currentCard: null, currentQuiz: null,
    timerId: null, nextReminderTime: null, activePack: null, catalog: null
  };
  const counters = { stop: 0, clear: [], toasts: [], prompts: [], confirms: [] };
  const replies = [];
  const doc = {
    createElement: () => ({ value: "", textContent: "" }),
    documentElement: { setAttribute() {} }
  };
  const ctx = {
    state, els, document: doc,
    localStorage: {
      getItem: key => items.get(key) ?? null,
      setItem: (key, value) => { items.set(key, value); }
    },
    window: {
      prompt(_message, initial) {
        counters.prompts.push(initial);
        return replies.shift() ?? null;
      },
      confirm(message) {
        counters.confirms.push(message);
        return replies.shift() === true;
      },
      alert(message) { counters.toasts.push(message); }
    },
    showToast: message => counters.toasts.push(message),
    stopAudio: () => { counters.stop += 1; },
    clearInterval: id => counters.clear.push(id),
    formatTimeInterval: () => "15m",
    getTotalIntervalSeconds: () => 900,
    loadVoices() {}, updateDashboardCounts() {}, renderDeckList() {},
    updateLearningSessionUi() {}, scheduleNextReminder() {},
    normalizeProgress: progress => progress,
    console: { warn() {} },
    Date, Math
  };
  vm.runInNewContext(
    'const STORAGE_KEY = "vocab_srs_state_v1";\n' +
    'const SAVE_SLOTS_KEY = "vocab_srs_save_slots_v1";\n' +
    'const defaultStore = JSON.parse(JSON.stringify(state.store));\n' +
    'let saveSlots = null;\n' +
    saveCode +
    '\nglobalThis.api = { loadStoredState, saveStoredState, switchSaveSlot, addSaveSlot, renderSaveSlotControls, setupSaveSlots, normalizeSaveStore, syncMeaningLanguageControls };',
    ctx
  );
  ctx.api.loadStoredState();
  ctx.api.setupSaveSlots();
  return { state, els, api: ctx.api, items, replies, counters };
}

function slots(h) {
  return JSON.parse(h.items.get("vocab_srs_save_slots_v1"));
}

test("legacy single save migrates into Main Save with progress and settings intact", () => {
  const legacy = {
    settings: { learningMode: "english-to-chinese", autoSpeak: false, readSentences: true },
    progress: { hao: { remembered: 4, ease: 2.3, dueAt: 77 } },
    currentCardId: "hao", lastCardId: "cuo"
  };
  const h = createHarness(legacy);
  assert.equal(slots(h).activeId, "main");
  assert.equal(slots(h).slots.main.name, "Main Save");
  assert.equal(h.state.store.progress.hao.remembered, 4);
  assert.equal(h.state.store.settings.readWords, false);
  assert.equal(h.state.store.settings.learningMode, "english-to-chinese");
  assert.equal(h.state.store.currentCardId, "hao");
  assert.deepEqual(JSON.parse(h.items.get("vocab_srs_state_v1")), legacy,
    "Old single-save data must remain untouched as a migration backup");
});

test("new save starts empty but inherits preferences and switching does not mix progress", () => {
  const h = createHarness();
  h.state.store.progress.hao = { remembered: 2 };
  h.state.store.currentCardId = "hao";
  h.state.store.settings.learningMode = "english-to-chinese";
  const fresh = {
    settings: { ...h.state.store.settings }, progress: {},
    currentCardId: null, lastCardId: null
  };
  const id = h.api.addSaveSlot("Second save", fresh);
  assert.ok(id);
  h.state.learningStatus = "active";
  h.state.timerId = 4;
  assert.equal(h.api.switchSaveSlot(id), true);
  assert.equal(h.state.learningStatus, "idle");
  assert.equal(h.state.currentCard, null);
  assert.equal(h.counters.stop, 1);
  assert.deepEqual(h.counters.clear, [4]);
  assert.equal(Object.keys(h.state.store.progress).length, 0);
  assert.equal(h.state.store.settings.learningMode, "english-to-chinese");
  h.state.store.progress.cuo = { forgotten: 3 };
  assert.equal(h.api.saveStoredState(), true);
  assert.equal(h.api.switchSaveSlot("main"), true);
  assert.equal(h.state.store.progress.hao.remembered, 2);
  assert.equal(h.state.store.progress.cuo, undefined);
  assert.equal(h.api.switchSaveSlot(id), true);
  assert.equal(h.state.store.progress.cuo.forgotten, 3);
  assert.equal(h.state.store.progress.hao, undefined);
});

test("duplicate save creates a separate editable snapshot", () => {
  const h = createHarness();
  h.state.store.progress.hao = { remembered: 5 };
  const id = h.api.addSaveSlot("Cloned", h.state.store);
  assert.ok(id);
  h.api.switchSaveSlot(id);
  h.state.store.progress.hao.remembered = 1;
  h.api.saveStoredState();
  h.api.switchSaveSlot("main");
  assert.equal(h.state.store.progress.hao.remembered, 5);
});

test("save creation, renaming, and deletion work through UI controls", () => {
  const h = createHarness();
  h.replies.push("Exam practice");
  h.els.newSaveBtn.fire();
  const newId = slots(h).activeId;
  assert.notEqual(newId, "main");
  assert.equal(slots(h).slots[newId].name, "Exam practice");
  h.replies.push("Renamed exam");
  h.els.renameSaveBtn.fire();
  assert.equal(slots(h).slots[newId].name, "Renamed exam");
  h.replies.push(true);
  h.els.deleteSaveBtn.fire();
  assert.equal(slots(h).slots[newId], undefined);
  assert.equal(slots(h).activeId, "main");
  assert.equal(h.els.deleteSaveBtn.disabled, true);
  assert.equal(h.state.learningStatus, "idle");
});

test("existing names cannot be overwritten, and last save cannot be deleted", () => {
  const h = createHarness();
  const attempt = h.api.addSaveSlot("main save", h.state.store);
  assert.equal(attempt, null);
  assert.equal(Object.keys(slots(h).slots).length, 1);
  h.els.deleteSaveBtn.fire();
  assert.equal(Object.keys(slots(h).slots).length, 1);
});

test("selected save persists across reloads", () => {
  const h = createHarness();
  const id = h.api.addSaveSlot("Separate", h.state.store);
  h.api.switchSaveSlot(id);
  h.state.store.progress.cuo = { remembered: 3 };
  h.api.saveStoredState();
  const next = createHarness(null, slots(h));
  assert.equal(slots(next).activeId, id);
  assert.equal(next.state.store.progress.cuo.remembered, 3);
  assert.equal(next.els.quickSaveSelect.value, id);
  assert.equal(next.els.saveSlotSelect.value, id);
});

test("switching to unknown save leaves current progress unchanged", () => {
  const h = createHarness();
  h.state.store.progress.hao = { remembered: 8 };
  assert.equal(h.api.switchSaveSlot("not-exists"), false);
  assert.equal(slots(h).activeId, "main");
  assert.equal(h.state.store.progress.hao.remembered, 8);
});

test("import JSON file creates another save without overwriting active save", async () => {
  const h = createHarness();
  h.state.catalog = { packs: [{ id: "hsk", cards: [{ id: "hao" }, { id: "cuo" }] }] };
  h.state.store.progress.hao = { remembered: 2 };
  const file = {
    name: "backup.json",
    text: async () => JSON.stringify({
      saveName: "Imported practice",
      settings: { learningMode: "english-to-chinese" },
      progress: { cuo: { forgotten: 4 }, unknown: { remembered: 100 } }
    })
  };
  h.replies.push("Imported practice");
  const target = { files: [file], value: "backup" };
  await h.els.importSaveFile.fire("change", { target });
  assert.equal(target.value, "");
  const importedId = slots(h).activeId;
  assert.equal(slots(h).slots[importedId].name, "Imported practice");
  assert.equal(h.state.store.progress.cuo.forgotten, 4);
  assert.equal(h.state.store.progress.unknown, undefined);
  assert.equal(h.state.store.settings.learningMode, "english-to-chinese");
  h.api.switchSaveSlot("main");
  assert.equal(h.state.store.progress.hao.remembered, 2);
  assert.equal(h.state.store.progress.cuo, undefined);
});

test("restarting session on switching is enforced in source", () => {
  assert.match(source, /function resetLearningForSaveSwitch/);
  assert.match(source, /state\.learningStatus = "idle"/);
  assert.match(source, /stopAudio\(\)/);
  assert.match(source, /state\.currentCard = null/);
  assert.match(source, /state\.currentReviewBaseline = null/);
});

test("both quick header and Settings save controls are present", () => {
  for (const id of [
    "quickSaveSelect", "saveSlotSelect", "newSaveBtn", "duplicateSaveBtn",
    "renameSaveBtn", "deleteSaveBtn", "importSaveBtn", "importSaveFile"
  ]) assert.match(html, new RegExp('id="' + id + '"'));
});


test("Vietnamese meaning-language preference survives a page reload", () => {
  const firstVisit = createHarness();
  firstVisit.state.store.settings.translationLanguage = "vi";
  assert.equal(firstVisit.api.saveStoredState(), true);

  // Simulate reloading the app with its existing browser localStorage.
  const nextVisit = createHarness(null, slots(firstVisit));
  assert.equal(nextVisit.state.store.settings.translationLanguage, "vi");
  nextVisit.api.syncMeaningLanguageControls();
  assert.equal(nextVisit.els.meaningLanguageSelect.value, "vi");
  assert.equal(nextVisit.els.translateTargetSelect.value, "vi");

  // Guard against forgetting to hydrate the selects during init again.
  assert.ok(source.includes("  async function init() {\n    loadStoredState();\n    syncMeaningLanguageControls();"));
});
