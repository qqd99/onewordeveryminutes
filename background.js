importScripts("srs.js");

const ALARM_NAME = "chinese-word-review";
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const VOCABULARY_FILE = "vocabulary.json";
const VOCABULARY_SCHEMA_VERSION = 1;
const LEGACY_VOCABULARY_MIGRATION_VERSION = 1;
const DATA_SCHEMA_VERSION = 9;
const SYNC_BACKUP_SCHEMA_VERSION = 1;
const SYNC_BACKUP_META_KEY = "chineseSrsBackupMeta";
const SYNC_BACKUP_CHUNK_PREFIX = "chineseSrsBackupChunk";
const SYNC_BACKUP_CHUNK_SIZE = 7000;
const MAX_UPGRADE_SNAPSHOTS = 3;
const DURABLE_STATE_KEYS = [
  "settings",
  "progress",
  "lastCardId",
  "currentCardId",
  "currentCardChangedAt",
  "currentCardExpiresAt",
  "currentSlotToken",
  "lastHandledAlarmScheduledTime",
  "currentReviewDecision"
];
const DURABLE_CHANGE_KEYS = new Set(DURABLE_STATE_KEYS);

const DEFAULT_SETTINGS = {
  enabled: false,
  startedByUser: false,
  scheduleModeVersion: 2,
  intervalMinutes: 30,
  autoHideSeconds: 10,
  closeAfterAnswer: true,
  volumePercent: 100,
  autoSpeak: true,
  activePackId: null
};

let operationQueue = Promise.resolve();
let catalogMemory = null;
let catalogLoadPromise = null;
let creatingOffscreenDocument = null;
let durableBackupInFlight = null;
let durableBackupDirty = false;

function enqueue(operation) {
  const result = operationQueue.then(operation);
  operationQueue = result.catch((error) => {
    console.error("Vocabulary SRS error:", error);
  });
  return result;
}

function normalizeSettings(value) {
  const raw = value || {};
  const settings = { ...DEFAULT_SETTINGS, ...raw };

  if (raw.startedByUser !== true) {
    settings.enabled = false;
    settings.startedByUser = false;
  }

  settings.scheduleModeVersion = 2;
  // The user controls only the card appearance cadence. During migration from
  // v1.9, use its last adaptive pace as the initial fixed cadence so an update
  // does not suddenly change the user's rhythm.
  const migratedInterval = raw.intervalMinutes ?? raw.adaptiveIntervalMinutes ?? 30;
  settings.intervalMinutes = Math.min(
    1440,
    Math.max(1, Math.round(Number(migratedInterval) || 30))
  );
  settings.autoHideSeconds = Math.min(
    300,
    Math.max(5, Number(settings.autoHideSeconds) || 10)
  );
  settings.closeAfterAnswer = settings.closeAfterAnswer !== false;
  settings.volumePercent = Math.min(100, Math.max(0, Math.round(Number(settings.volumePercent ?? 100))));
  settings.autoSpeak = settings.autoSpeak !== false;
  settings.activePackId = cleanText(settings.activePackId) || null;
  return settings;
}

async function getStore() {
  const data = await chrome.storage.local.get([
    "settings",
    "progress",
    "lastCardId",
    "currentCardId",
    "currentCardChangedAt",
    "currentCardExpiresAt",
    "currentSlotToken",
    "lastHandledAlarmScheduledTime",
    "currentReviewDecision"
  ]);

  return {
    settings: normalizeSettings(data.settings),
    progress: normalizeProgressStore(data.progress),
    lastCardId: data.lastCardId || null,
    currentCardId: data.currentCardId || null,
    currentCardChangedAt: Number(data.currentCardChangedAt) || 0,
    currentCardExpiresAt: Number(data.currentCardExpiresAt) || 0,
    currentSlotToken: data.currentSlotToken || null,
    lastHandledAlarmScheduledTime: Number(data.lastHandledAlarmScheduledTime) || 0,
    currentReviewDecision: normalizeReviewDecision(data.currentReviewDecision)
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simpleHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}


function normalizeProgressStore(progress) {
  const normalized = {};
  for (const [cardId, value] of Object.entries(progress || {})) {
    if (!cardId) continue;
    normalized[cardId] = normalizeProgress(value);
  }
  return normalized;
}

function normalizeReviewDecision(value) {
  if (!value || typeof value !== "object") return null;
  const cardId = cleanText(value.cardId);
  const slotToken = cleanText(value.slotToken);
  const rating = value.rating === "remember"
    ? "remember"
    : value.rating === "forget"
      ? "forget"
      : value.rating === "new"
        ? "new"
        : null;
  if (!cardId || !slotToken || !rating || !value.baseProgress) return null;
  return {
    cardId,
    slotToken,
    rating,
    ratedAt: Number(value.ratedAt) || 0,
    baseProgress: normalizeProgress(value.baseProgress),
    baseSettings: value.baseSettings ? normalizeSettings(value.baseSettings) : null,
    quizChoiceId: cleanText(value.quizChoiceId) || null,
    quizCorrect: value.quizCorrect === true
      ? true
      : value.quizCorrect === false
        ? false
        : null
  };
}

function getCurrentSlotDecision(store, cardId = store?.currentCardId) {
  const decision = normalizeReviewDecision(store?.currentReviewDecision);
  if (!decision || !cardId) return null;
  return decision.cardId === cardId &&
    decision.slotToken === store.currentSlotToken
      ? decision
      : null;
}

function currentSlotWasHandled(store, cardId, progress = null) {
  if (getCurrentSlotDecision(store, cardId)) return true;
  const normalized = normalizeProgress(progress || store?.progress?.[cardId]);
  return Boolean(
    cardId &&
    cardId === store?.currentCardId &&
    Number(store?.currentCardChangedAt) > 0 &&
    normalized.lastReviewedAt >= Number(store.currentCardChangedAt)
  );
}

function compactProgressStore(progress) {
  return Object.entries(normalizeProgressStore(progress)).map(([cardId, value]) => [
    cardId,
    value.repetitions,
    value.intervalMinutes,
    Math.round(value.easeFactor * 100),
    value.dueAt,
    value.lastShownAt,
    value.lastReviewedAt,
    value.lapses,
    value.remembered,
    value.forgotten
  ]);
}

function expandProgressStore(entries) {
  const progress = {};
  for (const row of Array.isArray(entries) ? entries : []) {
    if (!Array.isArray(row) || !row[0]) continue;
    progress[row[0]] = normalizeProgress({
      repetitions: Number(row[1]) || 0,
      intervalMinutes: Number(row[2]) || 0,
      easeFactor: Math.max(1.3, (Number(row[3]) || 230) / 100),
      dueAt: Number(row[4]) || 0,
      lastShownAt: Number(row[5]) || 0,
      lastReviewedAt: Number(row[6]) || 0,
      lapses: Number(row[7]) || 0,
      remembered: Number(row[8]) || 0,
      forgotten: Number(row[9]) || 0
    });
  }
  return progress;
}

function hasMeaningfulDurableState(data) {
  return Boolean(
    data?.dataInitialized === true ||
    data?.settings ||
    Object.keys(data?.progress || {}).length > 0 ||
    data?.currentCardId ||
    data?.lastCardId
  );
}

function buildDurablePayload(data, savedAt = Date.now()) {
  return {
    schemaVersion: SYNC_BACKUP_SCHEMA_VERSION,
    savedAt,
    extensionVersion: chrome.runtime.getManifest().version,
    settings: normalizeSettings(data.settings),
    progress: compactProgressStore(data.progress),
    lastCardId: data.lastCardId || null,
    currentCardId: data.currentCardId || null,
    currentCardChangedAt: Number(data.currentCardChangedAt) || 0,
    currentCardExpiresAt: Number(data.currentCardExpiresAt) || 0,
    currentSlotToken: data.currentSlotToken || null,
    lastHandledAlarmScheduledTime: Number(data.lastHandledAlarmScheduledTime) || 0,
    currentReviewDecision: normalizeReviewDecision(data.currentReviewDecision)
  };
}

function payloadToLocalPatch(payload) {
  return {
    settings: normalizeSettings(payload?.settings),
    progress: expandProgressStore(payload?.progress),
    lastCardId: payload?.lastCardId || null,
    currentCardId: payload?.currentCardId || null,
    currentCardChangedAt: Number(payload?.currentCardChangedAt) || 0,
    currentCardExpiresAt: Number(payload?.currentCardExpiresAt) || 0,
    currentSlotToken: payload?.currentSlotToken || null,
    lastHandledAlarmScheduledTime: Number(payload?.lastHandledAlarmScheduledTime) || 0,
    currentReviewDecision: normalizeReviewDecision(payload?.currentReviewDecision)
  };
}

function backupChunkKey(index) {
  return `${SYNC_BACKUP_CHUNK_PREFIX}${index}`;
}

async function readSyncBackup() {
  if (!chrome.storage?.sync) return null;

  const metaResult = await chrome.storage.sync.get(SYNC_BACKUP_META_KEY);
  const meta = metaResult[SYNC_BACKUP_META_KEY];
  if (!meta || Number(meta.chunkCount) < 1) return null;

  const chunkKeys = Array.from(
    { length: Number(meta.chunkCount) },
    (_, index) => backupChunkKey(index)
  );
  const chunks = await chrome.storage.sync.get(chunkKeys);
  const serialized = chunkKeys.map((key) => chunks[key] || "").join("");
  if (!serialized || simpleHash(serialized) !== meta.checksum) {
    throw new Error("The synchronized progress backup is incomplete.");
  }

  const payload = JSON.parse(serialized);
  if (Number(payload.schemaVersion) !== SYNC_BACKUP_SCHEMA_VERSION) {
    throw new Error("The synchronized progress backup uses an unsupported format.");
  }
  return { payload, meta };
}

async function restoreSyncBackupIfLocalDataIsMissing() {
  const local = await chrome.storage.local.get([
    ...DURABLE_STATE_KEYS,
    "dataInitialized"
  ]);
  if (hasMeaningfulDurableState(local)) return false;

  try {
    const backup = await readSyncBackup();
    if (!backup) return false;

    await chrome.storage.local.set({
      ...payloadToLocalPatch(backup.payload),
      dataSchemaVersion: DATA_SCHEMA_VERSION,
      dataInitialized: true,
      restoredFromSyncAt: Date.now(),
      durableBackupStatus: {
        ok: true,
        savedAt: Number(backup.meta.savedAt) || Number(backup.payload.savedAt) || 0,
        restoredAt: Date.now(),
        source: "sync"
      }
    });
    return true;
  } catch (error) {
    await chrome.storage.local.set({
      durableBackupStatus: {
        ok: false,
        error: error.message,
        checkedAt: Date.now()
      }
    });
    console.warn("Could not restore synchronized SRS progress:", error);
    return false;
  }
}

async function snapshotBeforeUpgrade(details) {
  if (details?.reason !== "update") return;

  const current = await chrome.storage.local.get([
    ...DURABLE_STATE_KEYS,
    "upgradeSnapshots"
  ]);
  if (!hasMeaningfulDurableState(current)) return;

  const snapshots = Array.isArray(current.upgradeSnapshots)
    ? current.upgradeSnapshots.slice(-MAX_UPGRADE_SNAPSHOTS + 1)
    : [];
  snapshots.push({
    fromVersion: details.previousVersion || null,
    toVersion: chrome.runtime.getManifest().version,
    savedAt: Date.now(),
    payload: buildDurablePayload(current)
  });
  await chrome.storage.local.set({ upgradeSnapshots: snapshots });
}

async function migrateDurableStorage(details = null) {
  await restoreSyncBackupIfLocalDataIsMissing();
  await snapshotBeforeUpgrade(details);

  const current = await chrome.storage.local.get([
    ...DURABLE_STATE_KEYS,
    "dataSchemaVersion"
  ]);
  const now = Date.now();
  await chrome.storage.local.set({
    settings: normalizeSettings(current.settings),
    progress: normalizeProgressStore(current.progress),
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    dataInitialized: true,
    lastKnownExtensionVersion: chrome.runtime.getManifest().version,
    lastMigrationAt: now,
    lastUpgradeFromVersion: details?.reason === "update"
      ? (details.previousVersion || null)
      : null
  });
}

async function writeDurableSyncBackup() {
  if (!chrome.storage?.sync) {
    throw new Error("Synchronized extension storage is unavailable.");
  }

  const local = await chrome.storage.local.get(DURABLE_STATE_KEYS);
  const savedAt = Date.now();
  const payload = buildDurablePayload(local, savedAt);
  const serialized = JSON.stringify(payload);
  const checksum = simpleHash(serialized);
  const chunks = [];
  for (let start = 0; start < serialized.length; start += SYNC_BACKUP_CHUNK_SIZE) {
    chunks.push(serialized.slice(start, start + SYNC_BACKUP_CHUNK_SIZE));
  }

  const existingResult = await chrome.storage.sync.get(SYNC_BACKUP_META_KEY);
  const existingMeta = existingResult[SYNC_BACKUP_META_KEY] || {};
  if (
    existingMeta.checksum === checksum &&
    Number(existingMeta.schemaVersion) === SYNC_BACKUP_SCHEMA_VERSION
  ) {
    await chrome.storage.local.set({
      durableBackupStatus: {
        ok: true,
        savedAt: Number(existingMeta.savedAt) || savedAt,
        source: "sync",
        unchanged: true
      }
    });
    return;
  }

  const writeObject = {};
  chunks.forEach((chunk, index) => {
    writeObject[backupChunkKey(index)] = chunk;
  });
  writeObject[SYNC_BACKUP_META_KEY] = {
    schemaVersion: SYNC_BACKUP_SCHEMA_VERSION,
    chunkCount: chunks.length,
    checksum,
    savedAt,
    extensionVersion: chrome.runtime.getManifest().version
  };
  await chrome.storage.sync.set(writeObject);

  const oldCount = Number(existingMeta.chunkCount) || 0;
  if (oldCount > chunks.length) {
    const obsoleteKeys = [];
    for (let index = chunks.length; index < oldCount; index += 1) {
      obsoleteKeys.push(backupChunkKey(index));
    }
    if (obsoleteKeys.length) await chrome.storage.sync.remove(obsoleteKeys);
  }

  await chrome.storage.local.set({
    durableBackupStatus: {
      ok: true,
      savedAt,
      source: "sync",
      chunkCount: chunks.length
    }
  });
}

function requestDurableBackup() {
  durableBackupDirty = true;
  if (durableBackupInFlight) return durableBackupInFlight;

  durableBackupInFlight = (async () => {
    while (durableBackupDirty) {
      durableBackupDirty = false;
      try {
        await writeDurableSyncBackup();
      } catch (error) {
        await chrome.storage.local.set({
          durableBackupStatus: {
            ok: false,
            error: error.message,
            checkedAt: Date.now()
          }
        });
        console.warn("Could not synchronize SRS progress backup:", error);
      }
    }
  })().finally(() => {
    durableBackupInFlight = null;
    if (durableBackupDirty) requestDurableBackup();
  });

  return durableBackupInFlight;
}


function normalizeLookupText(value) {
  return cleanText(value).toLocaleLowerCase().replace(/\s+/g, "");
}

function normalizeCard(rawCard, pack) {
  const id = cleanText(rawCard?.id);
  const front = cleanText(rawCard?.front ?? rawCard?.hanzi);
  const reading = cleanText(rawCard?.reading ?? rawCard?.pinyin);
  const meaning = cleanText(rawCard?.meaning);
  if (!id || !front || !meaning) return null;

  const rawExample = rawCard?.example && typeof rawCard.example === "object"
    ? rawCard.example
    : {};
  const exampleText = cleanText(rawExample.text ?? rawCard?.exampleText);
  const exampleReading = cleanText(rawExample.reading ?? rawCard?.exampleReading ?? rawCard?.examplePinyin);
  const exampleMeaning = cleanText(rawExample.meaning ?? rawCard?.exampleMeaning);

  return {
    id,
    front,
    reading,
    meaning,
    speechText: cleanText(rawCard?.speechText) || front,
    speechLang: cleanText(rawCard?.speechLang) || pack.speechLang,
    fallbackSpeechText: cleanText(rawCard?.fallbackSpeechText) || reading,
    fallbackSpeechLang: cleanText(rawCard?.fallbackSpeechLang) || "en-US",
    example: {
      text: exampleText,
      reading: exampleReading,
      meaning: exampleMeaning,
      speechText: cleanText(rawExample.speechText) || exampleText,
      speechLang: cleanText(rawExample.speechLang) || pack.speechLang,
      source: cleanText(rawExample.source) || null,
      sourceId: cleanText(rawExample.sourceId) || null
    },
    packId: pack.id,
    packName: pack.name,
    frontLabel: pack.frontLabel,
    readingLabel: pack.readingLabel,
    meaningLabel: pack.meaningLabel,
    exampleLabel: pack.exampleLabel,
    exampleReadingLabel: pack.exampleReadingLabel,
    exampleMeaningLabel: pack.exampleMeaningLabel,
    sourceLevel: cleanText(rawCard?.sourceLevel) || null
  };
}

function normalizePack(rawPack) {
  const pack = {
    id: cleanText(rawPack?.id),
    name: cleanText(rawPack?.name),
    language: cleanText(rawPack?.language) || "Language",
    languageCode: cleanText(rawPack?.languageCode),
    translationLanguage: cleanText(rawPack?.translationLanguage) || "English",
    speechLang: cleanText(rawPack?.speechLang) || cleanText(rawPack?.languageCode) || "en-US",
    frontLabel: cleanText(rawPack?.frontLabel) || "Word",
    readingLabel: cleanText(rawPack?.readingLabel) || "Pronunciation",
    meaningLabel: cleanText(rawPack?.meaningLabel) || "Meaning",
    exampleLabel: cleanText(rawPack?.exampleLabel) || "Common sentence",
    exampleReadingLabel: cleanText(rawPack?.exampleReadingLabel) || "Sentence pronunciation",
    exampleMeaningLabel: cleanText(rawPack?.exampleMeaningLabel) || "Sentence meaning",
    description: cleanText(rawPack?.description),
    source: rawPack?.source || null,
    exampleSources: Array.isArray(rawPack?.exampleSources) ? rawPack.exampleSources : [],
    cards: []
  };
  if (!pack.id || !pack.name) return null;

  const seenIds = new Set();
  for (const rawCard of Array.isArray(rawPack?.cards) ? rawPack.cards : []) {
    const card = normalizeCard(rawCard, pack);
    if (!card || seenIds.has(card.id)) continue;
    seenIds.add(card.id);
    pack.cards.push(card);
  }
  return pack.cards.length ? pack : null;
}

function normalizeCatalog(rawCatalog) {
  if (Number(rawCatalog?.schemaVersion) !== VOCABULARY_SCHEMA_VERSION) {
    throw new Error("vocabulary.json uses an unsupported schema version.");
  }

  const packs = (Array.isArray(rawCatalog?.packs) ? rawCatalog.packs : [])
    .map(normalizePack)
    .filter(Boolean);
  if (!packs.length) throw new Error("vocabulary.json does not contain a usable word pack.");

  const requestedDefault = cleanText(rawCatalog?.defaultPackId);
  const defaultPackId = packs.some((pack) => pack.id === requestedDefault)
    ? requestedDefault
    : packs[0].id;

  return {
    schemaVersion: VOCABULARY_SCHEMA_VERSION,
    catalogVersion: Number(rawCatalog?.catalogVersion) || 1,
    defaultPackId,
    packs
  };
}

async function loadVocabularyCatalog(forceReload = false) {
  if (forceReload) {
    catalogMemory = null;
    catalogLoadPromise = null;
  }
  if (catalogMemory) return catalogMemory;
  if (catalogLoadPromise) return catalogLoadPromise;

  catalogLoadPromise = (async () => {
    const response = await fetch(chrome.runtime.getURL(VOCABULARY_FILE), { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load vocabulary.json (${response.status}).`);
    const catalog = normalizeCatalog(await response.json());
    catalogMemory = catalog;
    return catalog;
  })().finally(() => {
    catalogLoadPromise = null;
  });

  return catalogLoadPromise;
}

function packSummaries(catalog) {
  return catalog.packs.map((pack) => ({
    id: pack.id,
    name: pack.name,
    language: pack.language,
    languageCode: pack.languageCode,
    translationLanguage: pack.translationLanguage,
    speechLang: pack.speechLang,
    frontLabel: pack.frontLabel,
    readingLabel: pack.readingLabel,
    meaningLabel: pack.meaningLabel,
    exampleLabel: pack.exampleLabel,
    exampleReadingLabel: pack.exampleReadingLabel,
    exampleMeaningLabel: pack.exampleMeaningLabel,
    description: pack.description,
    count: pack.cards.length
  }));
}

function resolvePack(catalog, settings = null) {
  const requestedId = cleanText(settings?.activePackId);
  return catalog.packs.find((pack) => pack.id === requestedId) ||
    catalog.packs.find((pack) => pack.id === catalog.defaultPackId) ||
    catalog.packs[0];
}

function allCatalogCards(catalog) {
  return catalog.packs.flatMap((pack) => pack.cards);
}

function mergeMigratedProgress(existing, incoming) {
  if (!existing) return normalizeProgress(incoming);
  if (!incoming) return normalizeProgress(existing);
  const a = normalizeProgress(existing);
  const b = normalizeProgress(incoming);
  const newer = a.lastReviewedAt >= b.lastReviewedAt ? a : b;
  return {
    ...newer,
    repetitions: Math.max(a.repetitions, b.repetitions),
    intervalMinutes: Math.max(a.intervalMinutes, b.intervalMinutes),
    easeFactor: Math.max(a.easeFactor, b.easeFactor),
    dueAt: Math.max(a.dueAt, b.dueAt),
    lastShownAt: Math.max(a.lastShownAt, b.lastShownAt),
    lastReviewedAt: Math.max(a.lastReviewedAt, b.lastReviewedAt),
    lapses: a.lapses + b.lapses,
    remembered: a.remembered + b.remembered,
    forgotten: a.forgotten + b.forgotten
  };
}

async function migrateLegacyVocabularyData(catalog) {
  const data = await chrome.storage.local.get([
    "legacyVocabularyMigrationVersion",
    "vocabularyCache",
    "progress",
    "currentCardId",
    "lastCardId",
    "settings"
  ]);
  if (Number(data.legacyVocabularyMigrationVersion) >= LEGACY_VOCABULARY_MIGRATION_VERSION) {
    return;
  }

  const allCards = allCatalogCards(catalog);
  const byId = new Map(allCards.map((card) => [card.id, card]));
  const byExact = new Map();
  const byFront = new Map();
  for (const card of allCards) {
    byExact.set(`${normalizeLookupText(card.front)}|${normalizeLookupText(card.reading)}`, card);
    if (!byFront.has(normalizeLookupText(card.front))) {
      byFront.set(normalizeLookupText(card.front), card);
    }
  }

  const aliases = new Map();
  for (const legacyCard of Array.isArray(data.vocabularyCache) ? data.vocabularyCache : []) {
    const legacyId = cleanText(legacyCard?.id);
    if (!legacyId) continue;
    if (byId.has(legacyId)) {
      aliases.set(legacyId, legacyId);
      continue;
    }
    const front = cleanText(legacyCard?.front ?? legacyCard?.hanzi);
    const reading = cleanText(legacyCard?.reading ?? legacyCard?.pinyin);
    const target = byExact.get(`${normalizeLookupText(front)}|${normalizeLookupText(reading)}`) ||
      byFront.get(normalizeLookupText(front));
    if (target) aliases.set(legacyId, target.id);
  }

  const oldProgress = normalizeProgressStore(data.progress);
  const migratedProgress = { ...oldProgress };
  let migratedCount = 0;
  for (const [oldId, newId] of aliases) {
    if (oldId === newId || !oldProgress[oldId]) continue;
    migratedProgress[newId] = mergeMigratedProgress(migratedProgress[newId], oldProgress[oldId]);
    delete migratedProgress[oldId];
    migratedCount += 1;
  }

  const settings = normalizeSettings(data.settings);
  const selectedPack = resolvePack(catalog, settings);
  settings.activePackId = selectedPack.id;

  await chrome.storage.local.set({
    settings,
    progress: migratedProgress,
    currentCardId: aliases.get(data.currentCardId) || data.currentCardId || null,
    lastCardId: aliases.get(data.lastCardId) || data.lastCardId || null,
    legacyVocabularyMigrationVersion: LEGACY_VOCABULARY_MIGRATION_VERSION,
    vocabularyCatalogVersion: catalog.catalogVersion,
    vocabularyMigrationReport: {
      migratedCount,
      completedAt: Date.now(),
      source: "legacy-cache-to-vocabulary-json"
    }
  });

  await chrome.storage.local.remove([
    "vocabularyCache",
    "vocabularyVersion",
    "vocabularyUpdatedAt",
    "vocabularyError"
  ]);
}

async function ensureVocabulary(forceReload = false, settingsOverride = null) {
  const catalog = await loadVocabularyCatalog(forceReload);
  const settings = settingsOverride
    ? normalizeSettings(settingsOverride)
    : normalizeSettings((await chrome.storage.local.get("settings")).settings);
  const pack = resolvePack(catalog, settings);

  return {
    vocabulary: pack.cards,
    allCards: allCatalogCards(catalog),
    ready: true,
    loading: false,
    source: VOCABULARY_FILE,
    error: null,
    pack,
    packs: packSummaries(catalog),
    catalog
  };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}


function deterministicRank(seed, value) {
  return parseInt(simpleHash(`${seed}|${value}`), 36) || 0;
}

function meaningChoiceId(cardId, meaning) {
  return `meaning-${simpleHash(`${cardId}|${normalizeLookupText(meaning)}`)}`;
}

function buildMeaningQuiz(vocabulary, card, slotToken = null) {
  if (!card?.id || !card.meaning) {
    throw new Error("This card does not have a meaning quiz.");
  }

  const correctMeaning = cleanText(card.meaning);
  const correctKey = normalizeLookupText(correctMeaning);
  const seed = `${slotToken || "fixed"}|${card.id}`;
  const uniqueDistractors = new Map();

  for (const candidate of Array.isArray(vocabulary) ? vocabulary : []) {
    if (!candidate?.id || candidate.id === card.id) continue;
    const meaning = cleanText(candidate.meaning);
    const key = normalizeLookupText(meaning);
    if (!meaning || !key || key === correctKey || uniqueDistractors.has(key)) continue;
    uniqueDistractors.set(key, meaning);
  }

  const distractors = [...uniqueDistractors.values()]
    .sort((a, b) => deterministicRank(seed, a) - deterministicRank(seed, b))
    .slice(0, 2);

  if (distractors.length < 2) {
    throw new Error("This vocabulary pack needs at least three different meanings for quiz mode.");
  }

  const choices = [correctMeaning, ...distractors]
    .map((text) => ({
      id: meaningChoiceId(card.id, text),
      text
    }))
    .sort((a, b) => deterministicRank(`${seed}|order`, a.id) - deterministicRank(`${seed}|order`, b.id));

  return {
    choices,
    correctChoiceId: meaningChoiceId(card.id, correctMeaning)
  };
}

function buildMeaningQuizState(vocabulary, card, store) {
  const quiz = buildMeaningQuiz(vocabulary, card, store?.currentSlotToken);
  const decision = getCurrentSlotDecision(store, card.id);
  return {
    ...quiz,
    answered: Boolean(decision?.quizChoiceId),
    selectedChoiceId: decision?.quizChoiceId || null,
    correct: decision?.quizCorrect === true
      ? true
      : decision?.quizCorrect === false
        ? false
        : null,
    rating: decision?.rating || null
  };
}

function wasEverShown(cardProgress) {
  const p = normalizeProgress(cardProgress);
  return p.lastShownAt > 0 || p.lastReviewedAt > 0 || p.remembered > 0 || p.forgotten > 0;
}

function wasEverReviewed(cardProgress) {
  const p = normalizeProgress(cardProgress);
  return p.lastReviewedAt > 0 || p.remembered > 0 || p.forgotten > 0;
}

function chooseCard(vocabulary, progress, lastCardId = null, now = Date.now(), displayMinutes = 30) {
  // Genuine SRS reviews always take priority over introducing a new card.
  // The previous selector put shown-but-unreviewed New Word cards into the
  // same due pool, which could crowd out actual repetitions.
  const dueReviewed = vocabulary.filter((word) => {
    const cardProgress = progress[word.id];
    return cardProgress &&
      wasEverReviewed(cardProgress) &&
      (normalizeProgress(cardProgress).dueAt || 0) <= now;
  });

  const unseen = vocabulary.filter((word) => !wasEverShown(progress[word.id]));
  const deferredNew = vocabulary.filter((word) => {
    const cardProgress = progress[word.id];
    return cardProgress &&
      wasEverShown(cardProgress) &&
      !wasEverReviewed(cardProgress);
  });

  let pool;
  if (dueReviewed.length > 0) {
    pool = [];
    for (const word of dueReviewed) {
      const p = normalizeProgress(progress[word.id]);
      const overdueIntervals = Math.max(
        0,
        Math.floor((now - (p.dueAt || 0)) / (Math.max(1, displayMinutes) * MINUTE_MS))
      );
      const weight = Math.min(8, 1 + p.lapses + overdueIntervals);
      for (let i = 0; i < weight; i += 1) pool.push(word);
    }
  } else if (unseen.length > 0) {
    pool = unseen;
  } else if (deferredNew.length > 0) {
    // New Word means “not learned yet”, not “a due SRS review”. Revisit these
    // only after never-seen cards are exhausted, oldest shown first.
    pool = [...deferredNew]
      .sort((a, b) => {
        const aShown = normalizeProgress(progress[a.id]).lastShownAt || 0;
        const bShown = normalizeProgress(progress[b.id]).lastShownAt || 0;
        return aShown - bShown;
      })
      .slice(0, Math.min(12, deferredNew.length));
  } else {
    pool = [...vocabulary]
      .sort((a, b) => {
        const aDue = normalizeProgress(progress[a.id]).dueAt || Number.MAX_SAFE_INTEGER;
        const bDue = normalizeProgress(progress[b.id]).dueAt || Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      })
      .slice(0, Math.min(12, vocabulary.length));
  }

  const alternatives = pool.filter((word) => word.id !== lastCardId);
  return randomItem(alternatives.length > 0 ? alternatives : pool);
}

async function updateActionState(settings) {
  await chrome.action.setBadgeText({ text: settings.enabled ? "ON" : "" });
  if (settings.enabled) {
    await chrome.action.setBadgeBackgroundColor({ color: "#3659d9" });
  }
  await chrome.action.setTitle({
    title: settings.enabled
      ? "Vocabulary SRS — web reminders running"
      : "Vocabulary SRS — press Start"
  });
}

function displayIntervalMinutes(settings) {
  return Math.min(
    1440,
    Math.max(1, Math.round(Number(settings?.intervalMinutes) || 30))
  );
}

function intervalMilliseconds(settings) {
  return displayIntervalMinutes(settings) * MINUTE_MS;
}

function earliestReviewedDueAt(vocabulary, progress) {
  let earliest = Number.POSITIVE_INFINITY;
  for (const word of Array.isArray(vocabulary) ? vocabulary : []) {
    const cardProgress = progress?.[word.id];
    if (!cardProgress || !wasEverReviewed(cardProgress)) continue;
    const dueAt = Number(normalizeProgress(cardProgress).dueAt) || 0;
    if (dueAt > 0 && dueAt < earliest) earliest = dueAt;
  }
  return Number.isFinite(earliest) ? earliest : null;
}

function computeNextDisplayTime(settings, now = Date.now()) {
  return now + intervalMilliseconds(settings);
}

async function ensureFixedCadenceMigration() {
  const data = await chrome.storage.local.get(["settings", "currentCardExpiresAt"]);
  if (Number(data.settings?.scheduleModeVersion) >= 2) return;

  const settings = normalizeSettings({
    ...(data.settings || {}),
    scheduleModeVersion: 2,
    intervalMinutes: data.settings?.intervalMinutes ?? data.settings?.adaptiveIntervalMinutes ?? 30
  });
  const existingExpiry = Number(data.currentCardExpiresAt) || 0;
  const currentCardExpiresAt = settings.enabled
    ? (existingExpiry > Date.now() ? existingExpiry : computeNextDisplayTime(settings))
    : 0;
  await chrome.storage.local.set({ settings, currentCardExpiresAt });
}

async function scheduleNextAlarm(settings, when = null) {
  await chrome.alarms.clear(ALARM_NAME);

  if (!settings.enabled) {
    await updateActionState(settings);
    return null;
  }

  const scheduledTime = Math.max(
    Date.now() + 1000,
    Number(when) || Date.now() + intervalMilliseconds(settings)
  );

  await chrome.alarms.create(ALARM_NAME, { when: scheduledTime });
  await updateActionState(settings);
  return scheduledTime;
}

function findCard(vocabulary, cardId) {
  return cardId ? vocabulary.find((word) => word.id === cardId) || null : null;
}

function createSlotToken(now = Date.now()) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}-${randomPart}`;
}

async function selectAndStoreCurrentCard(vocabulary, store, now = Date.now()) {
  const card = chooseCard(
    vocabulary,
    store.progress,
    store.currentCardId || store.lastCardId,
    now,
    displayIntervalMinutes(store.settings)
  ) || vocabulary[0];
  if (!card) throw new Error("The active vocabulary pack has no cards.");

  store.progress[card.id] = markShown(
    store.progress[card.id],
    displayIntervalMinutes(store.settings),
    now
  );
  store.currentCardId = card.id;
  store.currentCardChangedAt = now;
  store.currentSlotToken = createSlotToken(now);
  store.currentCardExpiresAt = store.settings.enabled
    ? now + intervalMilliseconds(store.settings)
    : 0;
  store.lastCardId = card.id;
  store.currentReviewDecision = null;

  await chrome.storage.local.set({
    progress: store.progress,
    currentCardId: store.currentCardId,
    currentCardChangedAt: store.currentCardChangedAt,
    currentCardExpiresAt: store.currentCardExpiresAt,
    currentSlotToken: store.currentSlotToken,
    lastCardId: store.lastCardId,
    currentReviewDecision: null
  });

  return card;
}

async function ensureFixedCurrentCard(vocabulary, store, { rotateIfExpired = false } = {}) {
  if (!Array.isArray(vocabulary) || vocabulary.length === 0) {
    throw new Error("The active vocabulary pack has no usable cards.");
  }
  const now = Date.now();
  let card = findCard(vocabulary, store.currentCardId);

  if (!card?.id) {
    store.currentCardId = null;
    store.currentCardChangedAt = 0;
    store.currentSlotToken = null;
    card = await selectAndStoreCurrentCard(vocabulary, store, now);
  } else if (
    rotateIfExpired &&
    store.settings.enabled &&
    store.currentCardExpiresAt > 0 &&
    store.currentCardExpiresAt <= now
  ) {
    card = await selectAndStoreCurrentCard(vocabulary, store, now);
    await scheduleNextAlarm(store.settings, store.currentCardExpiresAt);
  }

  return card;
}


async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    return contexts.length > 0;
  }

  if (typeof clients !== "undefined") {
    const matchedClients = await clients.matchAll();
    return matchedClients.some((client) => client.url === offscreenUrl);
  }

  return false;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) {
    throw new Error("This Edge version does not support hidden audio playback.");
  }

  if (await hasOffscreenDocument()) return;

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play online pronunciation for scheduled vocabulary cards."
    }).finally(() => {
      creatingOffscreenDocument = null;
    });
  }

  await creatingOffscreenDocument;
}

function buildCardSpeechSegments(card, { part = "all", repeat = 2, volume = 1 } = {}) {
  const count = Math.min(4, Math.max(1, Number(repeat) || 2));
  const segments = [];

  if (part === "all" || part === "word") {
    segments.push({
      label: "word",
      text: card.speechText || card.front,
      fallbackText: card.fallbackSpeechText || card.reading || "",
      fallbackLang: card.fallbackSpeechLang || "en-US",
      lang: card.speechLang || "en-US",
      rate: 0.82,
      repeat: count,
      volume
    });
  }

  if ((part === "all" || part === "example") && card.example?.text) {
    segments.push({
      label: "sentence",
      text: card.example.speechText || card.example.text,
      fallbackText: "",
      fallbackLang: card.example.speechLang || card.speechLang || "en-US",
      lang: card.example.speechLang || card.speechLang || "en-US",
      rate: 0.78,
      repeat: count,
      volume
    });
  }

  if (!segments.length) {
    throw new Error(part === "example" ? "This card has no example sentence." : "No speech text is available.");
  }
  return segments;
}

async function speakCard(card, { repeat = 2, part = "all", countdownContext = null, volumePercent = 100 } = {}) {
  if (!card) throw new Error("No word is selected.");

  await ensureOffscreenDocument();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const volume = Math.min(1, Math.max(0, Number(volumePercent) / 100));
  const segments = buildCardSpeechSegments(card, { part, repeat, volume });
  const existingState = await chrome.storage.local.get("pendingSpeechCountdown");
  const inheritedCountdown = !countdownContext?.tabId &&
    existingState.pendingSpeechCountdown?.cardId === card.id
      ? existingState.pendingSpeechCountdown
      : null;
  const effectiveCountdown = countdownContext?.tabId ? countdownContext : inheritedCountdown;
  const pendingSpeechCountdown = effectiveCountdown?.tabId
    ? {
        requestId,
        tabId: Number(effectiveCountdown.tabId),
        cardId: card.id,
        slotToken: effectiveCountdown.slotToken || null,
        createdAt: Date.now()
      }
    : null;

  // Save the request and countdown destination before playback starts, so even a
  // very short cached pronunciation cannot finish before its context exists.
  await chrome.storage.local.set({
    lastSpeechRequestId: requestId,
    lastSpeechCardId: card.id,
    lastSpeechRequestedAt: Date.now(),
    lastSpeechError: null,
    pendingSpeechCountdown
  });

  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "PLAY_ONLINE_TTS",
    requestId,
    cardId: card.id,
    segments
  });

  if (!response?.ok || response.accepted !== true) {
    await chrome.storage.local.set({ pendingSpeechCountdown: null });
    throw new Error(response?.error || "The hidden pronunciation page did not accept the request.");
  }

  return {
    ok: true,
    queued: true,
    requestId,
    segmentCount: segments.length,
    part,
    engine: "background online audio"
  };
}

async function closeAllWebReviewCards({ exceptTabId = null, clearPresentationLock = true } = {}) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(async (tab) => {
    if (!tab?.id || tab.id === exceptTabId || !canInjectIntoUrl(tab.url)) return;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "CLOSE_VOCAB_SRS_CARD",
        clearPresentationLock
      });
    } catch (_) {
      // Most tabs do not have the content script loaded yet.
    }
  }));
}

async function setActiveReviewSurface(kind, extra = {}) {
  const surface = {
    kind,
    token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    openedAt: Date.now(),
    ...extra
  };
  await chrome.storage.local.set({ activeReviewSurface: surface });
  return surface;
}

async function activatePopupSurface() {
  await closeAllWebReviewCards({ clearPresentationLock: true });
  return setActiveReviewSurface("popup");
}

function canInjectIntoUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

async function showCardOnActiveWebPage(card, slotToken = null, intervalMinutes = 30, autoHideSeconds = 10, waitForSpeech = true, closeAfterAnswer = true) {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs.find((candidate) => candidate.id && canInjectIntoUrl(candidate.url));
  if (!tab?.id) return { shown: false, reason: "no-supported-web-tab" };

  // A webpage reminder is a review surface. It supersedes every older review
  // surface, including another tab's card and an open toolbar popup.
  await closeAllWebReviewCards({ exceptTabId: tab.id, clearPresentationLock: true });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_VOCAB_SRS_CARD",
      card,
      slotToken,
      suppressWindowMs: Math.min(5 * MINUTE_MS, Math.max(15000, Number(intervalMinutes || 30) * MINUTE_MS * 0.2)),
      autoHideMs: Math.min(300000, Math.max(5000, Number(autoHideSeconds || 10) * 1000)),
      waitForSpeech,
      closeAfterAnswer
    });
    const shown = response?.shown !== false;
    if (shown) {
      await setActiveReviewSurface("web", { tabId: tab.id, cardId: card.id, slotToken });
    }
    return {
      shown,
      duplicate: response?.duplicate === true,
      tabId: tab.id
    };
  } catch (error) {
    console.warn("Could not show the vocabulary card on the active webpage:", error);
    return { shown: false, reason: error.message };
  }
}


async function startCountdownOnTab(tabId, { cardId = null, slotToken = null, speechOk = true } = {}) {
  if (!tabId) return { started: false, reason: "no-tab" };
  try {
    const response = await chrome.tabs.sendMessage(Number(tabId), {
      type: "START_VOCAB_SRS_COUNTDOWN",
      cardId,
      slotToken,
      speechOk
    });
    return response || { started: false, reason: "no-response" };
  } catch (error) {
    // The user may have closed or navigated away from the tab while audio played.
    return { started: false, reason: error.message };
  }
}

async function presentCard(card, vocabulary, store, { showOverlay = true, speak = true, forceSpeak = false } = {}) {
  const progress = normalizeProgress(store.progress[card.id]);
  const displayCard = {
    ...card,
    stageLabel: progress.lastReviewedAt > 0
      ? (progress.repetitions > 0 ? "REVIEW" : "LEARNING")
      : "NEW WORD",
    quiz: buildMeaningQuizState(vocabulary, card, store)
  };
  const results = { card: displayCard, overlay: null, speech: null };
  const shouldSpeak = Boolean(speak && (forceSpeak || store.settings.autoSpeak));

  if (showOverlay) {
    results.overlay = await showCardOnActiveWebPage(
      displayCard,
      store.currentSlotToken,
      displayIntervalMinutes(store.settings),
      store.settings.autoHideSeconds,
      shouldSpeak,
      store.settings.closeAfterAnswer
    );
  }

  const presentationWasDuplicate = results.overlay?.duplicate === true;

  if (shouldSpeak && !presentationWasDuplicate) {
    try {
      const countdownContext = results.overlay?.shown && results.overlay?.tabId
        ? {
            tabId: results.overlay.tabId,
            cardId: card.id,
            slotToken: store.currentSlotToken
          }
        : null;
      results.speech = await speakCard(card, {
        repeat: 2,
        part: "all",
        countdownContext,
        volumePercent: store.settings.volumePercent
      });
    } catch (error) {
      console.warn("Automatic pronunciation failed:", error);
      await chrome.storage.local.set({
        lastSpeechError: error.message,
        lastSpokenAt: Date.now(),
        pendingSpeechCountdown: null
      });
      if (results.overlay?.shown && results.overlay?.tabId) {
        await startCountdownOnTab(results.overlay.tabId, {
          cardId: card.id,
          slotToken: store.currentSlotToken,
          speechOk: false
        });
      }
      results.speech = { ok: false, error: error.message };
    }
  }

  return results;
}


async function rotateCurrentCardAndPresent(alarm = null) {
  const store = await getStore();
  if (!store.settings.enabled) return null;

  const now = Date.now();
  const scheduledTime = Number(alarm?.scheduledTime) || 0;

  // Exactly-once alarm guard. A repeated event with the same (or older)
  // scheduled timestamp is ignored even if the service worker restarts.
  if (scheduledTime && scheduledTime <= store.lastHandledAlarmScheduledTime) {
    if (store.currentCardExpiresAt > now) {
      await scheduleNextAlarm(store.settings, store.currentCardExpiresAt);
    }
    return null;
  }

  // A stale, early, or duplicate alarm must never advance the vocabulary.
  if (store.currentCardExpiresAt > now + 1000) {
    await scheduleNextAlarm(store.settings, store.currentCardExpiresAt);
    return null;
  }

  // Claim this alarm before any network/audio work. The operation queue plus
  // this persisted claim prevents a second service-worker invocation from
  // presenting another word for the same scheduled event.
  const claimedAlarmTime = scheduledTime || now;
  await chrome.storage.local.set({
    lastHandledAlarmScheduledTime: Math.max(
      store.lastHandledAlarmScheduledTime,
      claimedAlarmTime
    )
  });
  store.lastHandledAlarmScheduledTime = claimedAlarmTime;

  const vocabularyState = await ensureVocabulary(false);
  const vocabulary = vocabularyState.vocabulary;
  let card = findCard(vocabulary, store.currentCardId);
  const currentProgress = card
    ? normalizeProgress(store.progress[card.id])
    : null;
  const currentWasHandled = Boolean(
    card && currentSlotWasHandled(store, card.id, currentProgress)
  );

  if (!card || currentWasHandled) {
    // Only a rated word is replaced by a new one at the next interval.
    card = await selectAndStoreCurrentCard(vocabulary, store, now);
  } else {
    // The timed card was ignored or closed. Keep the same word, but give
    // this interval a new presentation token so it can appear and speak again.
    store.progress[card.id] = markShown(
      store.progress[card.id],
      displayIntervalMinutes(store.settings),
      now
    );
    store.currentSlotToken = createSlotToken(now);
    store.currentCardExpiresAt = now + intervalMilliseconds(store.settings);
    await chrome.storage.local.set({
      progress: store.progress,
      currentSlotToken: store.currentSlotToken,
      currentCardExpiresAt: store.currentCardExpiresAt
    });
  }

  await scheduleNextAlarm(store.settings, store.currentCardExpiresAt);
  await presentCard(card, vocabulary, store, { showOverlay: true, speak: true });
  return card;
}

async function presentCurrentWord({ manual = false } = {}) {
  const store = await getStore();
  if (!manual && !store.settings.enabled) return null;

  const vocabularyState = await ensureVocabulary(false);
  const card = await ensureFixedCurrentCard(vocabularyState.vocabulary, store);
  const result = await presentCard(card, vocabularyState.vocabulary, store, {
    showOverlay: true,
    speak: true,
    forceSpeak: manual
  });
  return { card, ...result };
}

async function reviewCard(cardId, requestedRating, quizMeta = null) {
  const store = await getStore();
  const vocabularyState = await ensureVocabulary(false);
  const card = findCard(vocabularyState.allCards, cardId);
  if (!card) throw new Error("Vocabulary card not found.");

  const rating = ["new", "forget", "remember"].includes(requestedRating)
    ? requestedRating
    : requestedRating === true
      ? "remember"
      : "forget";
  const oldProgress = normalizeProgress(store.progress[cardId]);
  const isCurrentSlot = cardId === store.currentCardId;
  const decision = normalizeReviewDecision(store.currentReviewDecision);
  const sameReview = Boolean(
    isCurrentSlot &&
    decision &&
    decision.cardId === cardId &&
    decision.slotToken === store.currentSlotToken
  );

  if (!sameReview && isCurrentSlot && store.currentCardChangedAt > 0 && oldProgress.lastReviewedAt >= store.currentCardChangedAt) {
    return {
      card,
      progress: oldProgress,
      alreadyReviewed: true,
      currentRating: null,
      corrected: false,
      message: "This review was saved by an older version and cannot be changed. Rating correction is available from the next card."
    };
  }

  const incomingQuizChoiceId = cleanText(quizMeta?.choiceId) || null;
  const incomingQuizCorrect = quizMeta?.correct === true
    ? true
    : quizMeta?.correct === false
      ? false
      : null;
  const sameQuizChoice = !incomingQuizChoiceId || decision?.quizChoiceId === incomingQuizChoiceId;

  if (sameReview && decision.rating === rating && sameQuizChoice) {
    const sameMessages = {
      new: "Still marked New Word. It remains unreviewed; use the popup to change this choice if needed.",
      forget: "Still marked Forget. This word is due at the next suitable display slot; use the popup to change this choice if needed.",
      remember: "Still marked Remember. This word keeps its automatically calculated review date; use the popup to change this choice if needed."
    };
    return {
      card,
      progress: oldProgress,
      alreadyReviewed: true,
      currentRating: rating,
      corrected: false,
      message: sameMessages[rating]
    };
  }

  const now = Date.now();
  const baseProgress = sameReview
    ? normalizeProgress(decision.baseProgress)
    : oldProgress;
  const baseSettings = sameReview && decision.baseSettings
    ? normalizeSettings(decision.baseSettings)
    : normalizeSettings(store.settings);
  const ratedAt = sameReview && decision.ratedAt ? decision.ratedAt : now;
  const displayMinutes = displayIntervalMinutes(baseSettings);
  const nextProgress = rating === "remember"
    ? reviewRemember(baseProgress, displayMinutes, ratedAt)
    : rating === "forget"
      ? reviewForget(baseProgress, displayMinutes, ratedAt)
      : normalizeProgress(baseProgress);

  const nextDecision = {
    cardId,
    slotToken: store.currentSlotToken || createSlotToken(store.currentCardChangedAt || now),
    rating,
    ratedAt,
    baseProgress,
    baseSettings,
    quizChoiceId: incomingQuizChoiceId || (sameReview ? decision.quizChoiceId : null),
    quizCorrect: incomingQuizCorrect !== null
      ? incomingQuizCorrect
      : (sameReview ? decision.quizCorrect : null)
  };

  store.progress[cardId] = nextProgress;
  store.currentReviewDecision = nextDecision;
  // Rating a word changes only that word's SRS interval. The user-selected
  // card appearance cadence and the already scheduled next display stay fixed.
  await chrome.storage.local.set({
    progress: store.progress,
    currentReviewDecision: nextDecision
  });

  const corrected = sameReview && decision.rating !== rating;
  let message;
  if (rating === "new") {
    message = corrected
      ? "Changed to New Word. It remains unreviewed; another card will appear at the next fixed display interval."
      : "Marked New Word. It remains unreviewed; another card will appear at the next fixed display interval.";
  } else if (rating === "remember") {
    message = corrected
      ? `Changed to Remember. Scheduled again in ${formatInterval(nextProgress.intervalMinutes)}.`
      : `Marked Remember. Scheduled again in ${formatInterval(nextProgress.intervalMinutes)}.`;
  } else {
    message = corrected
      ? `Changed to Forget. This word will return in ${formatInterval(nextProgress.intervalMinutes)}.`
      : `Marked Forget. This word will return in ${formatInterval(nextProgress.intervalMinutes)}.`;
  }

  return {
    card,
    progress: nextProgress,
    alreadyReviewed: false,
    currentRating: rating,
    corrected,
    message
  };
}


async function answerMeaningQuiz(cardId, choiceId) {
  const store = await getStore();
  if (cardId !== store.currentCardId) {
    throw new Error("This quiz card is no longer active.");
  }

  const vocabularyState = await ensureVocabulary(false);
  const card = findCard(vocabularyState.allCards, cardId);
  if (!card) throw new Error("Vocabulary card not found.");
  const pack = vocabularyState.catalog.packs.find((item) => item.id === card.packId);
  const quizVocabulary = pack?.cards || vocabularyState.vocabulary;
  const quiz = buildMeaningQuiz(quizVocabulary, card, store.currentSlotToken);
  const selectedChoice = quiz.choices.find((choice) => choice.id === cleanText(choiceId));
  if (!selectedChoice) throw new Error("That meaning choice is no longer valid.");

  const correct = selectedChoice.id === quiz.correctChoiceId;
  const rating = correct ? "remember" : "forget";
  const review = await reviewCard(cardId, rating, {
    choiceId: selectedChoice.id,
    correct
  });

  return {
    ...review,
    quiz: {
      ...quiz,
      answered: true,
      selectedChoiceId: selectedChoice.id,
      correct,
      rating
    },
    selectedMeaning: selectedChoice.text,
    correctMeaning: card.meaning
  };
}

async function getDashboard() {
  const store = await getStore();
  const vocabularyState = await ensureVocabulary(false);
  const vocabulary = Array.isArray(vocabularyState.vocabulary)
    ? vocabularyState.vocabulary
    : [];
  if (!vocabularyState.pack?.id) {
    throw new Error("The active vocabulary pack could not be resolved.");
  }
  const card = await ensureFixedCurrentCard(vocabulary, store);
  if (!card?.id) {
    throw new Error("The current vocabulary card could not be initialized.");
  }
  const freshStore = await getStore();
  const now = Date.now();

  const progressValues = vocabulary
    .map((word) => freshStore.progress[word.id])
    .filter(Boolean)
    .map(normalizeProgress);
  const reviewed = progressValues.filter((p) => p.lastReviewedAt > 0).length;
  const rememberedClicks = progressValues.reduce((sum, p) => sum + p.remembered, 0);
  const forgottenClicks = progressValues.reduce((sum, p) => sum + p.forgotten, 0);
  const dueNow = vocabulary.filter((word) => {
    const p = freshStore.progress[word.id];
    return p && wasEverReviewed(p) && (normalizeProgress(p).dueAt || 0) <= now;
  }).length;

  const cardProgress = normalizeProgress(freshStore.progress[card.id]);
  const currentDecision = getCurrentSlotDecision(freshStore, card.id);
  const reviewedThisSlot = currentSlotWasHandled(freshStore, card.id, cardProgress);
  const currentRating = currentDecision?.rating || null;
  const alarm = await chrome.alarms.get(ALARM_NAME);
  const protection = await chrome.storage.local.get([
    "durableBackupStatus",
    "restoredFromSyncAt",
    "lastKnownExtensionVersion",
    "lastUpgradeFromVersion"
  ]);

  return {
    ok: true,
    settings: freshStore.settings,
    card,
    cardProgress,
    reviewedThisSlot,
    currentRating,
    quiz: buildMeaningQuizState(vocabulary, card, freshStore),
    currentCardChangedAt: freshStore.currentCardChangedAt,
    currentCardExpiresAt: freshStore.currentCardExpiresAt,
    vocabulary: {
      count: vocabulary.length,
      ready: true,
      loading: false,
      source: vocabularyState.source,
      error: null,
      pack: {
        id: vocabularyState.pack.id,
        name: vocabularyState.pack.name,
        language: vocabularyState.pack.language,
        languageCode: vocabularyState.pack.languageCode,
        translationLanguage: vocabularyState.pack.translationLanguage,
        speechLang: vocabularyState.pack.speechLang,
        frontLabel: vocabularyState.pack.frontLabel,
        readingLabel: vocabularyState.pack.readingLabel,
        meaningLabel: vocabularyState.pack.meaningLabel,
        exampleLabel: vocabularyState.pack.exampleLabel,
        exampleReadingLabel: vocabularyState.pack.exampleReadingLabel,
        exampleMeaningLabel: vocabularyState.pack.exampleMeaningLabel,
        description: vocabularyState.pack.description
      },
      packs: vocabularyState.packs
    },
    dataProtection: {
      local: true,
      schemaVersion: DATA_SCHEMA_VERSION,
      syncBackedUp: protection.durableBackupStatus?.ok === true,
      lastBackupAt: Number(protection.durableBackupStatus?.savedAt) || 0,
      backupError: protection.durableBackupStatus?.ok === false
        ? (protection.durableBackupStatus.error || "Backup unavailable.")
        : null,
      restoredFromSyncAt: Number(protection.restoredFromSyncAt) || 0,
      version: protection.lastKnownExtensionVersion || chrome.runtime.getManifest().version,
      upgradedFrom: protection.lastUpgradeFromVersion || null
    },
    stats: {
      total: vocabulary.length,
      reviewed,
      newWords: Math.max(0, vocabulary.length - reviewed),
      dueNow,
      rememberedClicks,
      forgottenClicks
    },
    schedule: {
      displayIntervalMinutes: displayIntervalMinutes(freshStore.settings),
      repetitionMode: "adaptive-per-card",
      earliestReviewedDueAt: earliestReviewedDueAt(vocabulary, freshStore.progress)
    },
    nextReminderAt: alarm?.scheduledTime || freshStore.currentCardExpiresAt || null
  };
}

async function initialize(details = null) {
  await migrateDurableStorage(details);
  await ensureFixedCadenceMigration();
  const catalog = await loadVocabularyCatalog();
  await migrateLegacyVocabularyData(catalog);

  let store = await getStore();
  const resolvedPack = resolvePack(catalog, store.settings);
  if (!resolvedPack?.id) {
    throw new Error("No usable vocabulary pack is available.");
  }
  if (store.settings.activePackId !== resolvedPack.id) {
    store.settings = { ...store.settings, activePackId: resolvedPack.id };
  }
  if (store.currentCardId && !resolvedPack.cards.some((card) => card.id === store.currentCardId)) {
    store.currentCardId = null;
    store.currentCardChangedAt = 0;
    store.currentCardExpiresAt = 0;
    store.currentSlotToken = null;
    store.currentReviewDecision = null;
  }
  await chrome.storage.local.set({
    settings: store.settings,
    progress: store.progress,
    currentCardId: store.currentCardId,
    currentCardChangedAt: store.currentCardChangedAt,
    currentCardExpiresAt: store.currentCardExpiresAt,
    currentSlotToken: store.currentSlotToken,
    currentReviewDecision: store.currentReviewDecision
  });

  if (!store.settings.enabled) {
    await scheduleNextAlarm(store.settings);
    await requestDurableBackup();
    return;
  }

  const vocabularyState = await ensureVocabulary(false, store.settings);
  await ensureFixedCurrentCard(vocabularyState.vocabulary, store);
  const freshStore = await getStore();
  const nextTime = freshStore.currentCardExpiresAt > Date.now()
    ? freshStore.currentCardExpiresAt
    : Date.now() + 1000;
  await scheduleNextAlarm(freshStore.settings, nextTime);
  await requestDurableBackup();
}

chrome.runtime.onInstalled.addListener((details) => {
  enqueue(() => initialize(details));
});

chrome.runtime.onStartup.addListener(() => {
  enqueue(() => initialize({ reason: "startup" }));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) enqueue(() => rotateCurrentCardAndPresent(alarm));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") return false;

  if (message?.target === "background" && message?.type === "TTS_RESULT") {
    sendResponse({ ok: true });
    (async () => {
      const state = await chrome.storage.local.get([
        "lastSpeechRequestId",
        "pendingSpeechCountdown"
      ]);
      // A cancelled older request must not overwrite the result of a newer one.
      if (state.lastSpeechRequestId && state.lastSpeechRequestId !== message.requestId) return;
      const completedAt = Number(message.completedAt) || Date.now();
      const pending = state.pendingSpeechCountdown;
      await chrome.storage.local.set({
        lastSpeechRequestId: message.requestId || null,
        lastSpeechCardId: message.cardId || null,
        lastSpokenAt: completedAt,
        lastSpeechEngine: message.ok ? (message.engine || "online audio") : null,
        lastSpeechError: message.ok ? null : (message.error || "Pronunciation failed."),
        pendingSpeechCountdown: null
      });

      if (pending?.requestId === message.requestId && pending.tabId) {
        await startCountdownOnTab(pending.tabId, {
          cardId: pending.cardId || message.cardId || null,
          slotToken: pending.slotToken || null,
          speechOk: message.ok !== false
        });
      }
    })().catch((error) => console.warn("Could not save pronunciation result:", error));
    return false;
  }

  enqueue(async () => {
    switch (message?.type) {
      case "ACTIVATE_REVIEW_SURFACE": {
        if (message.surface !== "popup") {
          return { ok: false, error: "Unsupported review surface." };
        }
        const surface = await activatePopupSurface();
        return { ok: true, surface };
      }

      case "GET_DASHBOARD":
        return getDashboard();

      case "START_REMINDERS": {
        const store = await getStore();
        const requestedSettings = normalizeSettings({
          ...store.settings,
          enabled: true,
          startedByUser: true,
          intervalMinutes: Number(message.settings?.intervalMinutes) || store.settings.intervalMinutes || 30,
          autoHideSeconds: Number(message.settings?.autoHideSeconds) || store.settings.autoHideSeconds || 10,
          closeAfterAnswer: message.settings?.closeAfterAnswer !== false,
          volumePercent: message.settings?.volumePercent ?? store.settings.volumePercent ?? 100,
          autoSpeak: message.settings?.autoSpeak !== false,
          activePackId: message.settings?.activePackId || store.settings.activePackId
        });
        const vocabularyState = await ensureVocabulary(false, requestedSettings);
        const settings = { ...requestedSettings, activePackId: vocabularyState.pack.id };
        const packChanged = settings.activePackId !== store.settings.activePackId;
        store.settings = settings;
        if (packChanged) {
          store.currentCardId = null;
          store.currentCardChangedAt = 0;
          store.currentSlotToken = null;
          store.currentReviewDecision = null;
        }

        const now = Date.now();
        let card = findCard(vocabularyState.vocabulary, store.currentCardId);
        const existingProgress = card ? normalizeProgress(store.progress[card.id]) : null;
        const existingWasHandled = Boolean(
          card && currentSlotWasHandled(store, card.id, existingProgress)
        );
        if (!card || existingWasHandled) {
          card = await selectAndStoreCurrentCard(vocabularyState.vocabulary, store, now);
        }

        const expiresAt = computeNextDisplayTime(settings, now);
        const slotToken = store.currentSlotToken || createSlotToken(now);
        const changedAt = store.currentCardChangedAt || now;
        await chrome.storage.local.set({
          settings,
          currentCardId: card.id,
          currentCardChangedAt: changedAt,
          currentCardExpiresAt: expiresAt,
          currentSlotToken: slotToken,
          currentReviewDecision: store.currentReviewDecision,
          lastHandledAlarmScheduledTime: 0
        });
        await scheduleNextAlarm(settings, expiresAt);

        return {
          ok: true,
          settings,
          card,
          vocabularyCount: vocabularyState.vocabulary.length,
          vocabularyReady: true,
          vocabularyError: null,
          activePack: vocabularyState.pack.name
        };
      }

      case "STOP_REMINDERS": {
        const store = await getStore();
        const settings = {
          ...store.settings,
          enabled: false,
          startedByUser: true
        };
        await chrome.storage.local.set({
          settings,
          currentCardExpiresAt: 0,
          lastHandledAlarmScheduledTime: 0
        });
        await scheduleNextAlarm(settings);
        return { ok: true, settings };
      }

      case "PLAY_NOW":
      case "SHOW_NOW": {
        const result = await presentCurrentWord({ manual: true });
        return { ok: true, ...result };
      }

      case "SPEAK_CARD": {
        const store = await getStore();
        const vocabularyState = await ensureVocabulary(false);
        const card = findCard(vocabularyState.allCards, message.cardId);
        if (!card) throw new Error("Vocabulary card not found.");
        const countdownContext = message.startCountdownAfterSpeech && sender?.tab?.id
          ? {
              tabId: sender.tab.id,
              cardId: card.id,
              slotToken: message.slotToken || null
            }
          : null;
        const speech = await speakCard(card, {
          repeat: Number(message.repeat) || 2,
          part: ["word", "example", "all"].includes(message.part) ? message.part : "all",
          countdownContext,
          volumePercent: message.volumePercent ?? store.settings.volumePercent
        });
        return { ok: true, speech };
      }

      case "ANSWER_MEANING_QUIZ": {
        return {
          ok: true,
          ...(await answerMeaningQuiz(message.cardId, message.choiceId))
        };
      }

      case "REVIEW_CARD": {
        const rating = ["new", "forget", "remember"].includes(message.rating)
          ? message.rating
          : Boolean(message.remembered)
            ? "remember"
            : "forget";
        return {
          ok: true,
          ...(await reviewCard(message.cardId, rating))
        };
      }

      case "SAVE_SETTINGS": {
        const store = await getStore();
        const requestedSettings = normalizeSettings({
          ...store.settings,
          intervalMinutes: Number(message.settings?.intervalMinutes) || store.settings.intervalMinutes || 30,
          autoHideSeconds: Number(message.settings?.autoHideSeconds) || store.settings.autoHideSeconds || 10,
          closeAfterAnswer: message.settings?.closeAfterAnswer !== false,
          volumePercent: message.settings?.volumePercent ?? store.settings.volumePercent ?? 100,
          autoSpeak: message.settings?.autoSpeak !== false,
          activePackId: message.settings?.activePackId || store.settings.activePackId
        });
        const vocabularyState = await ensureVocabulary(false, requestedSettings);
        const settings = { ...requestedSettings, activePackId: vocabularyState.pack.id };
        const packChanged = settings.activePackId !== store.settings.activePackId;
        const intervalChanged = displayIntervalMinutes(settings) !== displayIntervalMinutes(store.settings);
        store.settings = settings;

        if (packChanged) {
          store.currentCardId = null;
          store.currentCardChangedAt = 0;
          store.currentSlotToken = null;
          store.currentReviewDecision = null;
          await selectAndStoreCurrentCard(vocabularyState.vocabulary, store, Date.now());
        }

        const now = Date.now();
        const expiresAt = settings.enabled
          ? (packChanged || intervalChanged
              ? computeNextDisplayTime(settings, now)
              : (store.currentCardExpiresAt > now
                  ? store.currentCardExpiresAt
                  : computeNextDisplayTime(settings, now)))
          : 0;
        await chrome.storage.local.set({ settings, currentCardExpiresAt: expiresAt });
        await scheduleNextAlarm(settings, expiresAt || null);
        return { ok: true, settings, activePack: vocabularyState.pack.name };
      }

      case "REFRESH_VOCABULARY": {
        const vocabularyState = await ensureVocabulary(true);
        return {
          ok: true,
          vocabularyCount: vocabularyState.vocabulary.length,
          vocabularyReady: vocabularyState.ready,
          vocabularyError: vocabularyState.error || null
        };
      }

      case "FORCE_BACKUP": {
        await requestDurableBackup();
        const status = await chrome.storage.local.get("durableBackupStatus");
        return {
          ok: status.durableBackupStatus?.ok === true,
          status: status.durableBackupStatus || null
        };
      }

      case "RESET_PROGRESS": {
        const store = await getStore();
        await chrome.storage.local.set({
          progress: {},
          lastCardId: null,
          currentCardId: null,
          currentCardChangedAt: 0,
          currentCardExpiresAt: 0,
          currentSlotToken: null,
          currentReviewDecision: null,
          lastHandledAlarmScheduledTime: 0
        });

        const vocabularyState = await ensureVocabulary(false);
        const resetStore = {
          ...store,
          progress: {},
          lastCardId: null,
          currentCardId: null,
          currentCardChangedAt: 0,
          currentCardExpiresAt: 0,
          currentSlotToken: null,
          currentReviewDecision: null,
          lastHandledAlarmScheduledTime: 0
        };
        const card = await selectAndStoreCurrentCard(
          vocabularyState.vocabulary,
          resetStore,
          Date.now()
        );
        if (resetStore.settings.enabled) {
          await scheduleNextAlarm(resetStore.settings, resetStore.currentCardExpiresAt);
        }
        return { ok: true, card };
      }

      default:
        return { ok: false, error: "Unknown request." };
    }
  })
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.keys(changes).some((key) => DURABLE_CHANGE_KEYS.has(key))) {
    requestDurableBackup();
  }
});

enqueue(() => initialize({ reason: "worker-start" }));
