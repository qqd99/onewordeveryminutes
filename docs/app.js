/**
 * Vocabulary SRS Web Application
 * Adaptive spaced repetition vocabulary learning
 */

(() => {
  "use strict";

  // Storage key
  const STORAGE_KEY = "vocab_srs_state_v1"; // Legacy single-save migration only
  const SAVE_SLOTS_KEY = "vocab_srs_save_slots_v1";

  // Global App State
  const state = {
    catalog: null,
    activePack: null,
    currentCard: null,
    currentQuiz: null,
    quizAnswered: false,
    selectedChoiceId: null,
    currentReviewBaseline: null,
    learningStatus: "idle", // idle | active | paused; resets on every page load
    store: {
      settings: {
        theme: "light",
        activePackId: "zh-hsk-core-1000",
        intervalHours: 0,
        intervalMinutes: 15,
        intervalSeconds: 0,
        reminderEnabled: false,
        learningMode: "chinese-to-english",
        translationLanguage: "en",
        volume: 100,
        speed: 0.85,
        readWords: true,
        readSentences: true,
        wordRepeat: 2,
        audioEngine: "auto",
        selectedVoice: "",
        notificationsEnabled: false
      },
      progress: {},
      lastCardId: null,
      currentCardId: null
    },
    timerId: null,
    nextReminderTime: null,
    availableVoices: [],
    deckFilter: "all",
    deckSearchQuery: ""
  };

  const defaultStore = JSON.parse(JSON.stringify(state.store));
  let saveSlots = null;

  // DOM Elements cache
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const els = {
    themeToggle: $("#themeToggle"),
    packSelect: $("#packSelect"),
    quickSaveSelect: $("#quickSaveSelect"),
    appModeBadge: $("#appModeBadge"),
    tabButtons: $$(".tab-button"),
    tabViews: $$(".tab-view"),
    dueBadge: $("#dueBadge"),

    // Study View
    intervalTimerPill: $("#intervalTimerPill"),
    timerStatusText: $("#timerStatusText"),
    studyDueCount: $("#studyDueCount"),
    studyNewCount: $("#studyNewCount"),
    studyReviewedCount: $("#studyReviewedCount"),
    stageBadge: $("#stageBadge"),
    speakWordBtn: $("#speakWordBtn"),
    speakSentenceBtn: $("#speakSentenceBtn"),
    speakExampleBtn: $("#speakExampleBtn"),
    flashcard: $("#flashcard"),
    learningSessionGate: $("#learningSessionGate"),
    learningSessionTitle: $("#learningSessionTitle"),
    learningSessionText: $("#learningSessionText"),
    startLearningBtn: $("#startLearningBtn"),
    pauseLearningBtn: $("#pauseLearningBtn"),
    resumeLearningBtn: $("#resumeLearningBtn"),
    hanziTerm: $("#hanziTerm"),
    pinyinReading: $("#pinyinReading"),
    quizPrompt: $("#quizPrompt"),
    choicesGrid: $("#choicesGrid"),
    revealedMeaning: $("#revealedMeaning"),
    exampleCard: $("#exampleCard"),
    exampleHanzi: $("#exampleHanzi"),
    examplePinyin: $("#examplePinyin"),
    exampleEnglish: $("#exampleEnglish"),
    exampleBreakdown: $("#exampleBreakdown"),
    breakdownChips: $("#breakdownChips"),
    newWordBtn: $("#newWordBtn"),
    forgetBtn: $("#forgetBtn"),
    rememberBtn: $("#rememberBtn"),
    nextCardBtn: $("#nextCardBtn"),

    // Deck View
    deckSearchInput: $("#deckSearchInput"),
    filterChips: $$(".filter-chips .chip"),
    deckWordList: $("#deckWordList"),
    countAll: $("#countAll"),
    countDue: $("#countDue"),
    countReviewed: $("#countReviewed"),
    countNew: $("#countNew"),

    // Stats View
    statsTotal: $("#statsTotal"),
    statsReviewed: $("#statsReviewed"),
    statsDue: $("#statsDue"),
    statsNew: $("#statsNew"),
    statsRetention: $("#statsRetention"),
    statsLapses: $("#statsLapses"),
    progressPercentText: $("#progressPercentText"),
    segmentLearned: $("#segmentLearned"),
    segmentLearning: $("#segmentLearning"),
    segmentNew: $("#segmentNew"),

    // Translate View
    translateInput: $("#translateInput"),
    clearTranslateBtn: $("#clearTranslateBtn"),
    translateCharCount: $("#translateCharCount"),
    translateStatusIndicator: $("#translateStatusIndicator"),
    speakInputBtn: $("#speakInputBtn"),
    translateBtn: $("#translateBtn"),
    translateTargetSelect: $("#translateTargetSelect"),
    translateResult: $("#translateResult"),
    resultChinese: $("#resultChinese"),
    resultPinyin: $("#resultPinyin"),
    resultEnglish: $("#resultEnglish"),
    speakResultBtn: $("#speakResultBtn"),
    copyTranslationBtn: $("#copyTranslationBtn"),
    translateWordsCard: $("#translateWordsCard"),
    translateWordsGrid: $("#translateWordsGrid"),
    sampleChips: $(".sample-chip"),

    // Settings View
    reminderEnabled: $("#reminderEnabled"),
    learningModeSelect: $("#learningModeSelect"),
    meaningLanguageSelect: $("#meaningLanguageSelect"),
    translationPromptStatus: $("#translationPromptStatus"),
    translationPromptMessage: $("#translationPromptMessage"),
    retryMeaningTranslationBtn: $("#retryMeaningTranslationBtn"),
    onDeviceTranslationRow: $("#onDeviceTranslationRow"),
    onDeviceTranslationStatus: $("#onDeviceTranslationStatus"),
    enableOnDeviceTranslationBtn: $("#enableOnDeviceTranslationBtn"),
    intervalHoursInput: $("#intervalHoursInput"),
    intervalMinutesInput: $("#intervalMinutesInput"),
    intervalSecondsInput: $("#intervalSecondsInput"),
    intervalSummaryText: $("#intervalSummaryText"),
    presetButtons: $(".preset-btn"),
    enableBrowserNotifications: $("#enableBrowserNotifications"),
    audioEngineSelect: $("#audioEngineSelect"),
    testAudioBtn: $("#testAudioBtn"),
    voiceSelect: $("#voiceSelect"),
    volumeRange: $("#volumeRange"),
    volumeLabel: $("#volumeLabel"),
    speedRange: $("#speedRange"),
    speedLabel: $("#speedLabel"),
    readWordToggle: $("#readWordToggle"),
    readSentenceToggle: $("#readSentenceToggle"),
    wordRepeatCount: $("#wordRepeatCount"),
    wordRepeatLabel: $("#wordRepeatLabel"),
    saveSlotSelect: $("#saveSlotSelect"),
    newSaveBtn: $("#newSaveBtn"),
    duplicateSaveBtn: $("#duplicateSaveBtn"),
    renameSaveBtn: $("#renameSaveBtn"),
    deleteSaveBtn: $("#deleteSaveBtn"),
    importSaveBtn: $("#importSaveBtn"),
    importSaveFile: $("#importSaveFile"),
    activeSaveInfo: $("#activeSaveInfo"),
    exportDataBtn: $("#exportDataBtn"),
    importDataBtn: $("#importDataBtn"),
    importFileInput: $("#importFileInput"),
    resetDataBtn: $("#resetDataBtn"),

    // Modal & Toast
    resetModal: $("#resetModal"),
    cancelResetBtn: $("#cancelResetBtn"),
    confirmResetBtn: $("#confirmResetBtn"),
    toastContainer: $("#toastContainer")
  };

  /* -------------------------------------------------------------
     1. STORAGE & STATE PERSISTENCE
  ------------------------------------------------------------- */
  function cloneSaveData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSaveStore(raw) {
    const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const settings = stored.settings && typeof stored.settings === "object" &&
      !Array.isArray(stored.settings) ? stored.settings : {};
    const normalized = {
      settings: { ...defaultStore.settings, ...settings },
      progress: stored.progress && typeof stored.progress === "object" &&
        !Array.isArray(stored.progress) ? cloneSaveData(stored.progress) : {},
      lastCardId: typeof stored.lastCardId === "string" ? stored.lastCardId : null,
      currentCardId: typeof stored.currentCardId === "string" ? stored.currentCardId : null
    };
    if (typeof settings.readWords !== "boolean" && typeof settings.autoSpeak === "boolean") {
      normalized.settings.readWords = settings.autoSpeak;
    }
    delete normalized.settings.autoSpeak;
    if (!["chinese-to-english", "english-to-chinese"].includes(normalized.settings.learningMode)) {
      normalized.settings.learningMode = "chinese-to-english";
    }
    normalized.settings.translationLanguage = typeof TranslationSupport !== "undefined"
      ? TranslationSupport.normalizeLanguage(normalized.settings.translationLanguage)
      : (["en", "vi", "fr", "es", "de", "ja", "ko", "zh-CN", "th", "id"]
          .includes(normalized.settings.translationLanguage)
          ? normalized.settings.translationLanguage : "en");
    return normalized;
  }

  function createSaveRegistry(store) {
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      activeId: "main",
      slots: { main: {
        name: "Main Save", createdAt: now, updatedAt: now,
        store: normalizeSaveStore(store)
      } }
    };
  }

  function loadStoredState() {
    try {
      const rawSlots = localStorage.getItem(SAVE_SLOTS_KEY);
      if (rawSlots) {
        const parsed = JSON.parse(rawSlots);
        if (parsed && parsed.slots && typeof parsed.slots === "object" &&
            !Array.isArray(parsed.slots)) {
          const cleanSlots = Object.create(null);
          for (const [id, slot] of Object.entries(parsed.slots)) {
            if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) ||
                !slot || typeof slot !== "object" || Array.isArray(slot)) continue;
            cleanSlots[id] = {
              name: String(slot.name || "Untitled save").trim().slice(0, 60),
              createdAt: slot.createdAt || new Date().toISOString(),
              updatedAt: slot.updatedAt || new Date().toISOString(),
              store: normalizeSaveStore(slot.store)
            };
          }
          const ids = Object.keys(cleanSlots);
          if (ids.length) {
            saveSlots = {
              schemaVersion: 1,
              activeId: ids.includes(parsed.activeId) ? parsed.activeId : ids[0],
              slots: cleanSlots
            };
          }
        }
      }
      if (!saveSlots) {
        const old = localStorage.getItem(STORAGE_KEY);
        saveSlots = createSaveRegistry(old ? JSON.parse(old) : defaultStore);
        // Preserve the original single-save value for safety during migration.
        persistSaveSlots();
      }
      state.store = cloneSaveData(saveSlots.slots[saveSlots.activeId].store);
    } catch (err) {
      console.warn("Could not load save slots:", err);
      if (!saveSlots) {
        // A damaged slots index must not erase a readable legacy save.
        try {
          const old = localStorage.getItem(STORAGE_KEY);
          saveSlots = createSaveRegistry(old ? JSON.parse(old) : defaultStore);
        } catch (_) {
          saveSlots = createSaveRegistry(defaultStore);
        }
      }
      state.store = cloneSaveData(saveSlots.slots[saveSlots.activeId].store);
    }
  }

  function persistSaveSlots() {
    try {
      localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saveSlots));
      return true;
    } catch (err) {
      console.warn("Could not save learning files to browser storage:", err);
      return false;
    }
  }

  function saveStoredState() {
    if (!saveSlots) return false;
    const slot = saveSlots.slots[saveSlots.activeId];
    if (!slot) return false;
    slot.store = cloneSaveData(state.store);
    slot.updatedAt = new Date().toISOString();
    return persistSaveSlots();
  }

  function renderSaveSlotControls() {
    if (!saveSlots) return;
    for (const control of [els.quickSaveSelect, els.saveSlotSelect]) {
      if (!control) continue;
      control.innerHTML = "";
      for (const [id, slot] of Object.entries(saveSlots.slots)) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = slot.name;
        control.appendChild(option);
      }
      control.value = saveSlots.activeId;
    }
    if (els.deleteSaveBtn) {
      els.deleteSaveBtn.disabled = Object.keys(saveSlots.slots).length <= 1;
    }
    if (els.activeSaveInfo) {
      const active = saveSlots.slots[saveSlots.activeId];
      const total = Object.keys(active.store.progress).length;
      els.activeSaveInfo.textContent =
        `Active: ${active.name} · ${total} cards with saved progress. Saves stay in this browser unless exported.`;
    }
  }

  function resetLearningForSaveSwitch() {
    stopAudio();
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.nextReminderTime = null;
    state.learningStatus = "idle";
    state.currentCard = null;
    state.currentQuiz = null;
    state.currentReviewBaseline = null;
    state.quizAnswered = false;
    state.selectedChoiceId = null;
  }

  // Apply the persisted preference to both dropdowns, including on a fresh load.
  function syncMeaningLanguageControls() {
    const target = state.store.settings.translationLanguage || "en";
    if (els.meaningLanguageSelect) els.meaningLanguageSelect.value = target;
    if (els.translateTargetSelect) els.translateTargetSelect.value = target;
  }

  function syncActiveSaveToPage() {
    const settings = state.store.settings;
    document.documentElement.setAttribute("data-theme", settings.theme || "light");
    els.themeToggle.textContent = settings.theme === "dark" ? "☀️" : "🌙";
    if (els.learningModeSelect) els.learningModeSelect.value = settings.learningMode;
    syncMeaningLanguageControls();
    if (els.reminderEnabled) els.reminderEnabled.checked = Boolean(settings.reminderEnabled);
    if (els.intervalHoursInput) els.intervalHoursInput.value = settings.intervalHours ?? 0;
    if (els.intervalMinutesInput) els.intervalMinutesInput.value = settings.intervalMinutes ?? 15;
    if (els.intervalSecondsInput) els.intervalSecondsInput.value = settings.intervalSeconds ?? 0;
    if (els.intervalSummaryText) {
      els.intervalSummaryText.textContent = formatTimeInterval(getTotalIntervalSeconds());
    }
    if (els.enableBrowserNotifications) {
      els.enableBrowserNotifications.checked = Boolean(settings.notificationsEnabled);
    }
    if (els.audioEngineSelect) els.audioEngineSelect.value = settings.audioEngine || "auto";
    if (els.volumeRange) els.volumeRange.value = settings.volume ?? 100;
    if (els.volumeLabel) els.volumeLabel.textContent = `${settings.volume ?? 100}%`;
    if (els.speedRange) els.speedRange.value = settings.speed ?? 0.85;
    if (els.speedLabel) els.speedLabel.textContent = `${settings.speed ?? 0.85}x`;
    if (els.readWordToggle) els.readWordToggle.checked = settings.readWords !== false;
    if (els.readSentenceToggle) els.readSentenceToggle.checked = settings.readSentences !== false;
    if (els.wordRepeatCount) els.wordRepeatCount.value = settings.wordRepeat || 2;
    if (els.wordRepeatLabel) els.wordRepeatLabel.textContent = settings.wordRepeat || 2;
    loadVoices();

    if (state.catalog?.packs?.length) {
      state.activePack = state.catalog.packs.find(pack =>
        pack.id === settings.activePackId
      ) || state.catalog.packs[0];
      if (els.packSelect) els.packSelect.value = state.activePack.id;
      updateDashboardCounts();
      renderDeckList();
    }
    updateLearningSessionUi();
    scheduleNextReminder();
    renderSaveSlotControls();
  }

  function switchSaveSlot(nextId) {
    if (!saveSlots?.slots[nextId]) return false;
    if (nextId === saveSlots.activeId) return true;
    if (!saveStoredState()) {
      showToast("Could not save current progress. Save switch cancelled.");
      renderSaveSlotControls();
      return false;
    }

    const formerId = saveSlots.activeId;
    saveSlots.activeId = nextId;
    if (!persistSaveSlots()) {
      saveSlots.activeId = formerId;
      renderSaveSlotControls();
      showToast("Storage is full or unavailable. Save switch cancelled.");
      return false;
    }

    resetLearningForSaveSwitch();
    state.store = cloneSaveData(saveSlots.slots[nextId].store);
    syncActiveSaveToPage();
    showToast(`Switched to ${saveSlots.slots[nextId].name}. Press Start learning to continue.`);
    return true;
  }

  function addSaveSlot(name, sourceStore) {
    const label = String(name || "").trim().slice(0, 60);
    if (!label) return null;
    if (Object.values(saveSlots.slots).some(slot => slot.name.toLowerCase() === label.toLowerCase())) {
      showToast("A save with this name already exists.");
      return null;
    }
    if (!saveStoredState()) {
      showToast("Could not save current progress. New save cancelled.");
      return null;
    }
    const id = `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    saveSlots.slots[id] = {
      name: label, createdAt: now, updatedAt: now,
      store: normalizeSaveStore(sourceStore)
    };
    if (!persistSaveSlots()) {
      delete saveSlots.slots[id];
      showToast("Could not create save: browser storage may be full.");
      return null;
    }
    renderSaveSlotControls();
    return id;
  }

  function setupSaveSlots() {
    renderSaveSlotControls();
    for (const control of [els.quickSaveSelect, els.saveSlotSelect]) {
      control?.addEventListener("change", event => {
        switchSaveSlot(event.target.value);
      });
    }
    els.newSaveBtn?.addEventListener("click", () => {
      const name = window.prompt("New save name:", `Save ${Object.keys(saveSlots.slots).length + 1}`);
      if (name === null) return;
      const id = addSaveSlot(name, {
        settings: cloneSaveData(state.store.settings),
        progress: {}, currentCardId: null, lastCardId: null
      });
      if (id) switchSaveSlot(id);
    });
    els.duplicateSaveBtn?.addEventListener("click", () => {
      const name = window.prompt("Duplicate save name:",
        `${saveSlots.slots[saveSlots.activeId].name} (copy)`);
      if (name === null) return;
      const id = addSaveSlot(name, state.store);
      if (id) switchSaveSlot(id);
    });
    els.renameSaveBtn?.addEventListener("click", () => {
      const slot = saveSlots.slots[saveSlots.activeId];
      const name = window.prompt("Rename save:", slot.name);
      if (name === null) return;
      const label = name.trim().slice(0, 60);
      if (!label || Object.entries(saveSlots.slots).some(([id, item]) =>
        id !== saveSlots.activeId && item.name.toLowerCase() === label.toLowerCase())) {
        showToast("Choose a different, nonempty save name.");
        return;
      }
      const oldName = slot.name;
      slot.name = label;
      if (!persistSaveSlots()) {
        slot.name = oldName;
        showToast("Could not rename save.");
      }
      renderSaveSlotControls();
    });
    els.deleteSaveBtn?.addEventListener("click", () => {
      if (Object.keys(saveSlots.slots).length <= 1) return;
      const id = saveSlots.activeId;
      const name = saveSlots.slots[id].name;
      if (!window.confirm(`Delete "${name}" and all its learning progress? Export a backup first if needed.`)) {
        return;
      }
      const previous = cloneSaveData(saveSlots);
      const nextId = Object.keys(saveSlots.slots).find(other => other !== id);
      delete saveSlots.slots[id];
      saveSlots.activeId = nextId;
      if (!persistSaveSlots()) {
        saveSlots = previous;
        showToast("Could not delete save.");
        renderSaveSlotControls();
        return;
      }
      resetLearningForSaveSwitch();
      state.store = cloneSaveData(saveSlots.slots[nextId].store);
      syncActiveSaveToPage();
      showToast(`Deleted "${name}".`);
    });

    els.importSaveBtn?.addEventListener("click", () => els.importSaveFile?.click());
    els.importSaveFile?.addEventListener("change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const imported = JSON.parse(await file.text());
        const raw = imported?.progress ?? imported?.payload?.progress ??
          imported?.chineseSrsBackupProgress ??
          (imported?.settings || imported?.schemaVersion ? null : imported);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          throw new Error("No valid progress data found.");
        }
        const validIds = new Set((state.catalog?.packs || []).flatMap(pack =>
          pack.cards.map(card => card.id)
        ));
        const progress = {};
        for (const [id, value] of Object.entries(raw)) {
          if (validIds.has(id) && value && typeof value === "object" && !Array.isArray(value)) {
            progress[id] = normalizeProgress(value);
          }
        }
        if (Object.keys(raw).length > 0 && Object.keys(progress).length === 0) {
          throw new Error("No matching vocabulary cards found.");
        }
        const settings = imported?.settings ?? imported?.payload?.settings ?? {};
        const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
          ? settings : {};
        const importedStore = normalizeSaveStore({
          settings: {
            ...state.store.settings, ...safeSettings,
            readWords: typeof safeSettings.readWords === "boolean" ? safeSettings.readWords
              : typeof safeSettings.autoSpeak === "boolean" ? safeSettings.autoSpeak
              : state.store.settings.readWords
          },
          progress,
          currentCardId: imported?.currentCardId ?? imported?.payload?.currentCardId,
          lastCardId: imported?.lastCardId ?? imported?.payload?.lastCardId
        });
        const suggested = String(imported?.saveName || file.name.replace(/\.json$/i, "") ||
          "Imported save").slice(0, 60);
        const label = window.prompt("Name for the imported save:", suggested);
        if (label === null) return;
        const id = addSaveSlot(label, importedStore);
        if (id) switchSaveSlot(id);
      } catch (err) {
        window.alert(`Could not import save file: ${err.message}`);
      } finally {
        event.target.value = "";
      }
    });
  }

  /* -------------------------------------------------------------
     2. THEME & TOAST
  ------------------------------------------------------------- */
  function applyTheme(theme) {
    state.store.settings.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    els.themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    saveStoredState();
  }

  function initTheme() {
    let savedTheme = state.store.settings.theme;
    if (!savedTheme) {
      savedTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    applyTheme(savedTheme);

    els.themeToggle.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }

  function showToast(message, duration = 3000) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /* -------------------------------------------------------------
     3. AUDIO & SPEECH SYNTHESIS ENGINE (ROBUST MULTI-PROVIDER)
  ------------------------------------------------------------- */
  let activeUtterance = null;
  let activeAudioEl = null;
  let cancelActivePlayback = null;
  let audioGeneration = 0;
  const activeUtterances = new Set(); // Keep speech objects alive until they finish.

  function isCurrentAudio(generation) {
    return generation === audioGeneration;
  }

  function recoverSpeechSynthesis() {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (err) {
      console.warn("Could not reset speech synthesis:", err);
    }
  }

  function stopAudio() {
    audioGeneration += 1;
    if (cancelActivePlayback) cancelActivePlayback();
    cancelActivePlayback = null;
    if (activeAudioEl) {
      try { activeAudioEl.pause(); } catch (_) {}
      activeAudioEl = null;
    }
    recoverSpeechSynthesis();
    activeUtterance = null;
    return audioGeneration;
  }

  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      state.availableVoices = voices || [];

      if (!els.voiceSelect) return;
      els.voiceSelect.innerHTML = "";
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "Auto-detect Chinese voice";
      els.voiceSelect.appendChild(defaultOpt);

      const zhVoices = (voices || []).filter(v => /^zh|cmn|chinese/i.test(v.lang) || /^zh|chinese/i.test(v.name));
      for (const v of zhVoices) {
        const opt = document.createElement("option");
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        els.voiceSelect.appendChild(opt);
      }

      if (state.store.settings.selectedVoice) {
        els.voiceSelect.value = state.store.settings.selectedVoice;
      }
    } catch (err) {
      console.warn("Could not load speech voices:", err);
    }
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }

  function chooseVoice(lang = "zh-CN") {
    // Chromium often populates voices after initial page load. A missing
    // explicitly named voice is not a reason to skip native TTS entirely.
    if (!state.availableVoices.length && "speechSynthesis" in window) {
      try { state.availableVoices = window.speechSynthesis.getVoices() || []; } catch (_) {}
    }
    if (!state.availableVoices.length) return null;
    const target = String(lang).toLowerCase().replace("_", "-");
    const base = target.split("-")[0];
    const matching = state.availableVoices.filter(v =>
      String(v.lang || "").toLowerCase().replace("_", "-").split("-")[0] === base
    );
    if (state.store.settings.selectedVoice) {
      const selected = matching.find(v => v.name === state.store.settings.selectedVoice);
      if (selected) return selected;
    }
    return matching.find(v => String(v.lang).toLowerCase().replace("_", "-") === target) ||
      matching[0] || null;
  }

  // The online providers are fallbacks, not a signal that playback succeeded.
  // Never progress to the example unless the word's audio actually completed.
  const ONLINE_TTS_PROVIDERS = [
    (text, lang) => `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`,
    (text, lang) => `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`
  ];

  function playOnlineOnce(url, generation, volume) {
    return new Promise(resolve => {
      if (!isCurrentAudio(generation)) { resolve(false); return; }

      const audio = new Audio(url);
      activeAudioEl = audio;
      audio.volume = volume;
      let finished = false;
      let playbackWatchdog = null;
      const settle = (success) => {
        if (finished) return;
        finished = true;
        clearTimeout(startWatchdog);
        clearTimeout(playbackWatchdog);
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
        if (!success) {
          try { audio.pause(); } catch (_) {}
        }
        if (activeAudioEl === audio) activeAudioEl = null;
        if (cancelActivePlayback === cancel) cancelActivePlayback = null;
        resolve(success && isCurrentAudio(generation));
      };
      const cancel = () => settle(false);
      cancelActivePlayback = cancel;
      const started = () => {
        if (finished || playbackWatchdog !== null) return;
        clearTimeout(startWatchdog);
        // A correctly playing sentence can last much longer than 3 seconds.
        playbackWatchdog = setTimeout(() => settle(false), 45000);
      };
      // Skip blocked or hung providers quickly, but never cut off healthy audio.
      const startWatchdog = setTimeout(() => settle(false), 3200);
      audio.onplaying = started;
      audio.onended = () => settle(true);
      audio.onerror = () => settle(false);
      try {
        const playing = audio.play();
        if (playing?.then) playing.then(started, () => settle(false));
      } catch (_) {
        settle(false);
      }
    });
  }

  async function playOnlineAudio(text, { lang = "zh-CN", repeat = 1, delayMs = 400, generation } = {}) {
    const clean = String(text || "").trim();
    if (!clean || !isCurrentAudio(generation)) return false;
    const volume = (state.store.settings.volume ?? 100) / 100;
    const providers = /^zh(?:-|$)/i.test(lang)
      ? [...ONLINE_TTS_PROVIDERS, (value) => `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(value)}&type=2`]
      : ONLINE_TTS_PROVIDERS;

    for (let count = 0; count < repeat; count += 1) {
      if (!isCurrentAudio(generation)) return false;
      let played = false;
      for (const provider of providers) {
        if (!isCurrentAudio(generation)) return false;
        played = await playOnlineOnce(provider(clean, lang), generation, volume);
        if (played) break;
      }
      if (!played) return false;
      if (count < repeat - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return isCurrentAudio(generation);
  }

  function speakNativeOnce(text, { lang, generation, voice }) {
    return new Promise(resolve => {
      if (!isCurrentAudio(generation) || !("speechSynthesis" in window) ||
          typeof SpeechSynthesisUtterance !== "function") {
        resolve(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.volume = (state.store.settings.volume ?? 100) / 100;
      utterance.rate = state.store.settings.speed ?? 0.85;
      if (voice) utterance.voice = voice;
      activeUtterances.add(utterance);
      activeUtterance = utterance;

      let settled = false;
      let started = false;
      const settle = (success) => {
        if (settled) return;
        settled = true;
        clearTimeout(startWatchdog);
        clearTimeout(finishWatchdog);
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        activeUtterances.delete(utterance);
        if (activeUtterance === utterance) activeUtterance = null;
        if (cancelActivePlayback === cancel) cancelActivePlayback = null;
        resolve(success && isCurrentAudio(generation));
      };
      const cancel = () => settle(false);
      cancelActivePlayback = cancel;

      utterance.onstart = () => {
        started = true;
      };
      utterance.onend = () => settle(true);
      utterance.onerror = () => settle(false);

      // Attempt native playback immediately. Recover promptly if the browser
      // never starts, rather than waiting five seconds before trying online.
      const startWatchdog = setTimeout(() => {
        if (!started) {
          settle(false);
          if (isCurrentAudio(generation)) recoverSpeechSynthesis();
        }
      }, 2000);
      const finishWatchdog = setTimeout(() => {
        settle(false);
        if (isCurrentAudio(generation)) recoverSpeechSynthesis();
      }, Math.min(45000, Math.max(12000, text.length * 650)));

      try {
        window.speechSynthesis.speak(utterance);
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch (_) {
        settle(false);
      }
    });
  }

  async function speakTextNative(text, { lang = "zh-CN", repeat = 1, delayMs = 400, generation } = {}) {
    const voice = chooseVoice(lang);
    // Even if getVoices() is empty, the browser may provide a working
    // default Chinese voice when utterance.lang is set to zh-CN.
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") return false;
    for (let index = 0; index < repeat; index += 1) {
      if (!isCurrentAudio(generation)) return false;
      const success = await speakNativeOnce(text, { lang, generation, voice });
      if (!success) return false;
      if (index < repeat - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return isCurrentAudio(generation);
  }

  async function speakSegment(text, { lang = "zh-CN", repeat = 2, generation } = {}) {
    if (!text || !isCurrentAudio(generation) || (state.store.settings.volume ?? 100) === 0) return false;
    const engine = state.store.settings.audioEngine || "auto";
    const count = Math.min(5, Math.max(1, Math.round(Number(repeat) || 2)));

    // Play one repetition at a time. If a native voice fails on the second
    // reading, online fallback only replaces that reading, not the whole word.
    for (let index = 0; index < count; index += 1) {
      if (!isCurrentAudio(generation)) return false;
      let succeeded = false;
      if (engine !== "online") {
        succeeded = await speakTextNative(text, { lang, repeat: 1, generation });
      }
      if (!succeeded && isCurrentAudio(generation) && engine !== "speechSynthesis") {
        succeeded = await playOnlineAudio(text, { lang, repeat: 1, generation });
      }
      if (!succeeded) return false;
      if (index + 1 < count) await new Promise(resolve => setTimeout(resolve, 250));
    }
    return isCurrentAudio(generation);
  }

  async function speak(text, { lang = "zh-CN", repeat = 2 } = {}) {
    const generation = stopAudio();
    const succeeded = await speakSegment(text, { lang, repeat, generation });
    if (!succeeded && isCurrentAudio(generation) && (state.store.settings.volume ?? 100) > 0) {
      console.warn("Audio could not start:", text);
      showToast("Audio unavailable. Try another voice or Audio Engine in Settings.");
    }
    return succeeded;
  }

  async function playCardSequence(card) {
    if (!card) return;
    const readWord = state.store.settings.readWords !== false;
    const readSentence = state.store.settings.readSentences !== false;
    const generation = stopAudio();
    if ((!readWord && !readSentence) || (state.store.settings.volume ?? 100) === 0) return;

    const repeatCount = Math.max(1, Number(state.store.settings.wordRepeat) || 2);
    if (readWord) {
      const wordPlayed = await speakSegment(card.speechText || card.front, {
        lang: card.speechLang || "zh-CN",
        repeat: repeatCount,
        generation
      });
      if (!isCurrentAudio(generation)) return;
      if (!wordPlayed) {
        // Do not silently replace a failed requested word with its sentence.
        if ((state.store.settings.volume ?? 100) > 0) {
          console.warn("Could not play the word; example playback was not substituted.");
          showToast("Word audio unavailable. Try Hear Word or another Audio Engine.");
        }
        return;
      }
    }

    const exampleText = card.example?.speechText || card.example?.text;
    if (readSentence && exampleText) {
      // Sentence-only mode starts immediately without a word or pause.
      if (readWord) await new Promise(resolve => setTimeout(resolve, 450));
      if (!isCurrentAudio(generation)) return;
      await speakSegment(exampleText, {
        lang: card.example?.speechLang || card.speechLang || "zh-CN",
        repeat: repeatCount,
        generation
      });
    }
  }

  /* -------------------------------------------------------------
     4. SRS ENGINE & CARD SELECTION
  ------------------------------------------------------------- */
  function getCardProgress(cardId) {
    if (!state.store.progress[cardId]) {
      state.store.progress[cardId] = defaultCardProgress();
    }
    return state.store.progress[cardId];
  }

  function wasEverShown(cardProgress) {
    const p = normalizeProgress(cardProgress);
    return p.lastShownAt > 0 || p.lastReviewedAt > 0 || p.remembered > 0 || p.forgotten > 0;
  }

  function wasEverReviewed(cardProgress) {
    const p = normalizeProgress(cardProgress);
    return p.lastReviewedAt > 0 || p.remembered > 0 || p.forgotten > 0;
  }

  function chooseNextCard(vocabulary, progress, lastCardId = null, now = Date.now(), displayMinutes = 15) {
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
          Math.floor((now - (p.dueAt || 0)) / (Math.max(1, displayMinutes) * 60 * 1000))
        );
        const weight = Math.min(8, 1 + p.lapses + overdueIntervals);
        for (let i = 0; i < weight; i += 1) pool.push(word);
      }
    } else if (unseen.length > 0) {
      pool = unseen;
    } else if (deferredNew.length > 0) {
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
    const chosenList = alternatives.length > 0 ? alternatives : pool;
    return chosenList[Math.floor(Math.random() * chosenList.length)] || vocabulary[0];
  }

  /* -------------------------------------------------------------
     5. MEANING QUIZ BUILDER
  ------------------------------------------------------------- */
  function buildMeaningQuiz(vocabulary, card, progress = {}) {
    const correctMeaning = String(card.meaning || "").trim();
    // Track each displayed wrong meaning back to ONE vocabulary card. A
    // meaning alone is insufficient because multiple words may share it.
    const distractorsByMeaning = new Map();

    const candidates = vocabulary.filter(w =>
      w.id !== card.id && String(w.meaning || "").trim() &&
      String(w.meaning).trim() !== correctMeaning
    );
    // Fisher-Yates avoids the biased comparator used in Array.sort.
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (const item of shuffled) {
      const text = String(item.meaning).trim();
      const previous = distractorsByMeaning.get(text);
      if (!previous && distractorsByMeaning.size < 2) {
        distractorsByMeaning.set(text, item);
      } else if (previous && !wasEverReviewed(progress[previous.id]) &&
                 wasEverReviewed(progress[item.id])) {
        // If two cards share a meaning, prefer an already-reviewed one.
        // Never accidentally mark several ambiguous cards as forgotten.
        distractorsByMeaning.set(text, item);
      }
    }

    const choices = [
      { id: "correct", cardId: card.id, text: correctMeaning, isCorrect: true },
      ...Array.from(distractorsByMeaning.entries()).map(([text, item], index) => ({
        id: `distractor-${index}`,
        cardId: item.id,
        text,
        isCorrect: false
      }))
    ];
    for (let i = choices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }

    return { choices, correctMeaning };
  }

  function chineseCharacterCount(value) {
    return Array.from(String(value || "").trim()).length;
  }

  function buildChineseQuiz(vocabulary, card, progress = {}) {
    const correctMeaning = String(card.meaning || "").trim();
    const correctWord = String(card.front || "").trim();
    const correctLength = chineseCharacterCount(correctWord);
    const distractorsByWord = new Map();

    // Cards with the exact same English meaning are excluded because they can
    // be valid answers to an English prompt too.
    const candidates = vocabulary.filter(item => {
      const word = String(item.front || "").trim();
      const meaning = String(item.meaning || "").trim();
      return item.id !== card.id && word && word !== correctWord &&
        chineseCharacterCount(word) === correctLength &&
        meaning && meaning !== correctMeaning;
    });
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (const item of shuffled) {
      const text = String(item.front).trim();
      const previous = distractorsByWord.get(text);
      if (!previous && distractorsByWord.size < 2) {
        distractorsByWord.set(text, item);
      } else if (previous && !wasEverReviewed(progress[previous.id]) &&
                 wasEverReviewed(progress[item.id])) {
        distractorsByWord.set(text, item);
      }
    }

    const choices = [
      { id: "correct", cardId: card.id, text: correctWord, isCorrect: true },
      ...Array.from(distractorsByWord.entries()).map(([text, item], index) => ({
        id: `distractor-${index}`,
        cardId: item.id,
        text,
        isCorrect: false
      }))
    ];
    for (let i = choices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }

    return { choices, correctMeaning, correctWord, correctLength };
  }

  function isEnglishToChineseMode() {
    return state.store?.settings?.learningMode === "english-to-chinese";
  }

  function getModeEligibleVocabulary(vocabulary) {
    const cards = Array.isArray(vocabulary) ? vocabulary : [];
    if (!isEnglishToChineseMode()) return cards;

    // Mode 2 must never reveal the answer by word length. Only present cards
    // whose length bucket contains at least three Chinese words, so the
    // correct answer and both distractors can all have the same length.
    const countsByLength = new Map();
    for (const card of cards) {
      const length = chineseCharacterCount(card.front);
      if (length > 0) countsByLength.set(length, (countsByLength.get(length) || 0) + 1);
    }
    return cards.filter(card =>
      (countsByLength.get(chineseCharacterCount(card.front)) || 0) >= 3
    );
  }

  function isModeEligibleCard(card, vocabulary = state.activePack?.cards || []) {
    if (!card || !isEnglishToChineseMode()) return Boolean(card);
    const targetId = card.id;
    return getModeEligibleVocabulary(vocabulary).some(item => item.id === targetId);
  }

  /* -------------------------------------------------------------
     6. UI PRESENTATION & CARD RENDERING
  ------------------------------------------------------------- */

  /**
   * Fallback word segmenter for imported cards lacking precomputed `words` breakdown.
   * Uses longest-match from vocabulary pack cards as a simple greedy tokenizer.
   */
  function extractWordsFallback(text, packCards) {
    if (!text || !packCards || packCards.length === 0) return [];

    // Build lookup from card fronts (longest first for greedy matching)
    const knownWords = packCards
      .map(c => ({ word: c.front, meaning: c.meaning }))
      .sort((a, b) => b.word.length - a.word.length);

    const punctuationRe = /^[\s，。？！、；：""''（）《》…—!?,.:;"'()\[\]]+$/;
    const result = [];
    let i = 0;
    const clean = text.trim();

    while (i < clean.length) {
      if (punctuationRe.test(clean[i])) { i++; continue; }

      // Longest-match from known vocabulary
      let matched = false;
      for (const entry of knownWords) {
        if (clean.startsWith(entry.word, i)) {
          result.push({ word: entry.word, meaning: entry.meaning });
          i += entry.word.length;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Emit single character
        result.push({ word: clean[i], meaning: "" });
        i++;
      }
    }

    return result;
  }

  function updateLearningSessionUi() {
    const active = state.learningStatus === "active";
    const paused = state.learningStatus === "paused";

    if (els.flashcard) els.flashcard.hidden = !active;
    if (els.learningSessionGate) els.learningSessionGate.hidden = active;
    if (els.pauseLearningBtn) els.pauseLearningBtn.hidden = !active;
    if (els.startLearningBtn) els.startLearningBtn.hidden = paused;
    if (els.resumeLearningBtn) els.resumeLearningBtn.hidden = !paused;

    if (!active && els.intervalTimerPill) {
      els.intervalTimerPill.classList.remove("active");
      state.nextReminderTime = null;
    }

    if (paused) {
      if (els.learningSessionTitle) els.learningSessionTitle.textContent = "Learning paused";
      if (els.learningSessionText) {
        els.learningSessionText.textContent = "No study cards will appear and reminder cards are stopped until you resume.";
      }
      if (els.timerStatusText) els.timerStatusText.textContent = "Learning paused";
    } else if (!active) {
      if (els.learningSessionTitle) els.learningSessionTitle.textContent = "Ready to learn?";
      if (els.learningSessionText) {
        els.learningSessionText.textContent = state.activePack
          ? "Press Start learning to show the first card and begin automatic pronunciation."
          : "Loading vocabulary…";
      }
      if (els.timerStatusText) els.timerStatusText.textContent = "Learning not started";
    }
  }

  function getStartingCard() {
    if (!state.activePack) return null;
    const studyCards = getModeEligibleVocabulary(state.activePack.cards);
    if (!studyCards.length) return null;
    const savedId = state.store.currentCardId;
    const saved = savedId ? studyCards.find(card => card.id === savedId) : null;
    return saved || chooseNextCard(
      studyCards,
      state.store.progress,
      null,
      Date.now(),
      getSrsDisplayMinutes()
    );
  }

  function startLearning() {
    if (!state.activePack || state.learningStatus === "active") return;
    state.learningStatus = "active";
    const card = getStartingCard();
    if (card) renderCard(card, { autoPlay: true });
    updateLearningSessionUi();
    scheduleNextReminder();
  }

  function pauseLearning() {
    if (state.learningStatus !== "active") return;
    state.learningStatus = "paused";
    stopAudio();
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    state.nextReminderTime = null;
    updateLearningSessionUi();
  }

  function resumeLearning() {
    if (state.learningStatus !== "paused" || !state.activePack) return;
    state.learningStatus = "active";

    const currentIsValid = state.currentCard &&
      state.activePack.cards.some(card => card.id === state.currentCard.id);
    if (currentIsValid) {
      updateLearningSessionUi();
      if (state.store.settings.readWords !== false ||
          state.store.settings.readSentences !== false) {
        void playCardSequence(state.currentCard);
      }
    } else {
      const card = getStartingCard();
      if (card) renderCard(card, { autoPlay: true });
      updateLearningSessionUi();
    }
    scheduleNextReminder();
  }

  function setupLearningSessionControls() {
    els.retryMeaningTranslationBtn?.addEventListener("click", () => {
      if (state.currentCard && state.currentQuiz) {
        void localizeRenderedCard(state.currentCard, state.currentQuiz, isEnglishToChineseMode());
      }
    });
    if (els.startLearningBtn) {
      els.startLearningBtn.addEventListener("click", startLearning);
    }
    if (els.pauseLearningBtn) {
      els.pauseLearningBtn.addEventListener("click", pauseLearning);
    }
    if (els.resumeLearningBtn) {
      els.resumeLearningBtn.addEventListener("click", resumeLearning);
    }
    updateLearningSessionUi();
  }

  // Only presentation text is translated; source cards and quiz IDs are immutable.
  let visibleTranslationGeneration = 0;
  let visibleCardMeaning = "";
  function showMeaningTranslationStatus(message, canRetry = false) {
    if (!els.translationPromptStatus) return;
    els.translationPromptStatus.hidden = !message;
    if (els.translationPromptMessage) els.translationPromptMessage.textContent = message;
    if (els.retryMeaningTranslationBtn) els.retryMeaningTranslationBtn.hidden = !canRetry;
  }

  async function localizeRenderedCard(card, quiz, englishToChinese) {
    const generation = ++visibleTranslationGeneration;
    const target = TranslationSupport.normalizeLanguage(state.store.settings.translationLanguage);
    if (!card || !quiz) return;

    visibleCardMeaning = card.meaning || "—";
    showMeaningTranslationStatus("");
    if (englishToChinese) {
      els.hanziTerm.textContent = target === "en"
        ? visibleCardMeaning : "Translating meaning…";
    }
    else for (const choice of quiz.choices) {
      const button = [...els.choicesGrid.querySelectorAll(".choice-btn")]
        .find(element => element.dataset.choiceId === choice.id);
      if (button?.firstElementChild) button.firstElementChild.textContent = choice.text;
    }
    els.exampleEnglish.textContent = card.example?.meaning || "";
    if (state.quizAnswered) {
      const reading = card.reading ? ` · ${card.reading}` : "";
      els.revealedMeaning.textContent = englishToChinese
        ? `Answer: ${card.front}${reading} — ${card.meaning}`
        : `Meaning: ${quiz.correctMeaning}`;
    }
    if (target === "en") return;

    let localized;
    try {
      localized = await TranslationSupport.localizePresentation(
        card, quiz, target, "en", !englishToChinese, !englishToChinese
      );
    } catch (error) {
      console.warn("Could not translate the vocabulary meaning:", error);
      localized = { card, quiz };
    }
    if (generation !== visibleTranslationGeneration || state.currentCard !== card ||
        state.currentQuiz !== quiz || state.store.settings.translationLanguage !== target) return;

    const returnedMeaning = localized.card.meaning || card.meaning || "—";
    visibleCardMeaning = returnedMeaning;
    if (englishToChinese) {
      els.hanziTerm.textContent = visibleCardMeaning;
      if (returnedMeaning === card.meaning) {
        showMeaningTranslationStatus("Showing the English original: Vietnamese translation is not available right now.", true);
      }
    }
    else for (const choice of localized.quiz.choices) {
      const button = [...els.choicesGrid.querySelectorAll(".choice-btn")]
        .find(element => element.dataset.choiceId === choice.id);
      if (button?.firstElementChild) button.firstElementChild.textContent = choice.text;
    }
    els.exampleEnglish.textContent = localized.card.example?.meaning || "";
    if (state.quizAnswered) {
      const reading = card.reading ? ` · ${card.reading}` : "";
      els.revealedMeaning.textContent = englishToChinese
        ? `Answer: ${card.front}${reading} — ${visibleCardMeaning}`
        : `Meaning: ${localized.card.meaning}`;
    }
  }

  function renderCard(card, { autoPlay = true } = {}) {
    if (state.learningStatus !== "active" || !card) return;
    // Avoid double-cancelling speech right before a new reading starts.
    // playCardSequence() handles cancellation for spoken cards.
    const automaticReadingOff = state.store.settings.readWords === false &&
      state.store.settings.readSentences === false;
    if (!autoPlay || automaticReadingOff) stopAudio();
    state.currentCard = card;
    state.quizAnswered = false;
    state.selectedChoiceId = null;
    state.currentReviewBaseline = null;
    state.store.currentCardId = card.id;
    saveStoredState();

    const progress = normalizeProgress(state.store.progress[card.id]);
    const isDue = wasEverReviewed(progress) && (progress.dueAt || 0) <= Date.now();
    const isNew = !wasEverReviewed(progress);

    // Stage Badge
    if (isNew) {
      els.stageBadge.textContent = "NEW WORD";
      els.stageBadge.className = "stage-badge";
    } else if (isDue) {
      els.stageBadge.textContent = "DUE REVIEW";
      els.stageBadge.className = "stage-badge due";
    } else {
      els.stageBadge.textContent = `INTERVAL: ${formatInterval(progress.intervalMinutes)}`;
      els.stageBadge.className = "stage-badge mastered";
    }

    // Learning direction changes only the visual quiz. Speech always uses
    // card.front / card.speechText, so Mode 2 still says the Chinese word.
    const englishToChinese = isEnglishToChineseMode();
    els.hanziTerm.textContent = englishToChinese ? (card.meaning || "—") : card.front;
    els.hanziTerm.classList.toggle("english-prompt", englishToChinese);
    els.pinyinReading.hidden = englishToChinese;
    els.pinyinReading.textContent = englishToChinese ? "" : (card.reading || "—");

    // Quiz Section
    state.currentQuiz = englishToChinese
      ? buildChineseQuiz(state.activePack.cards, card, state.store.progress)
      : buildMeaningQuiz(state.activePack.cards, card, state.store.progress);
    els.choicesGrid.innerHTML = "";
    els.revealedMeaning.hidden = true;
    els.quizPrompt.textContent = englishToChinese
      ? "Choose the correct Chinese word:"
      : "Choose the correct meaning:";

    state.currentQuiz.choices.forEach((choice, index) => {
      const btn = document.createElement("button");
      btn.className = englishToChinese ? "choice-btn choice-btn-chinese" : "choice-btn";
      btn.type = "button";
      btn.dataset.choiceId = choice.id;

      const spanText = document.createElement("span");
      spanText.textContent = choice.text;

      const keyHint = document.createElement("span");
      keyHint.className = "choice-key-hint";
      keyHint.textContent = `${index + 1}`;

      btn.appendChild(spanText);
      btn.appendChild(keyHint);

      btn.addEventListener("click", () => handleQuizAnswer(choice, btn));
      els.choicesGrid.appendChild(btn);
    });

    // Example Card & Word Breakdown
    if (card.example && card.example.text) {
      els.exampleCard.hidden = englishToChinese;
      els.exampleHanzi.textContent = card.example.text;
      els.examplePinyin.textContent = card.example.reading || "";
      els.exampleEnglish.textContent = card.example.meaning || "";

      // Render divided words with English translation & Google Translate links
      const words = card.example.words || extractWordsFallback(card.example.text, state.activePack?.cards || []);
      if (words && words.length > 0) {
        els.exampleBreakdown.hidden = false;
        els.breakdownChips.innerHTML = "";
        words.forEach(item => {
          const a = document.createElement("a");
          a.className = "word-chip";
          a.href = `https://translate.google.com/?sl=zh-TW&tl=${encodeURIComponent(state.store.settings.translationLanguage || "en")}&text=${encodeURIComponent(item.word)}&op=translate`;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.title = `Translate "${item.word}" with Google Translate`;

          const wordSpan = document.createElement("span");
          wordSpan.className = "chip-word";
          wordSpan.textContent = item.word;

          const colonSpan = document.createElement("span");
          colonSpan.className = "chip-colon";
          colonSpan.textContent = ":";

          const meaningSpan = document.createElement("span");
          meaningSpan.className = "chip-meaning";
          meaningSpan.textContent = item.meaning;

          const extSpan = document.createElement("span");
          extSpan.className = "chip-ext";
          extSpan.textContent = "↗";

          a.appendChild(wordSpan);
          a.appendChild(colonSpan);
          a.appendChild(meaningSpan);
          a.appendChild(extSpan);

          els.breakdownChips.appendChild(a);
        });
      } else {
        els.exampleBreakdown.hidden = true;
        els.breakdownChips.innerHTML = "";
      }
    } else {
      els.exampleCard.hidden = true;
      els.exampleBreakdown.hidden = true;
    }

    // Mark shown in SRS
    state.store.progress[card.id] = markShown(
      state.store.progress[card.id],
      getSrsDisplayMinutes()
    );
    saveStoredState();

    // Either switch can independently trigger automatic pronunciation.
    if (autoPlay && (state.store.settings.readWords !== false ||
                     state.store.settings.readSentences !== false)) {
      playCardSequence(card);
    }
    updateDashboardCounts();
    void localizeRenderedCard(card, state.currentQuiz, englishToChinese);
  }

  function rateCurrentCard(rating) {
    if (!state.currentCard) return;
    const id = state.currentCard.id;
    if (!state.currentReviewBaseline) {
      state.currentReviewBaseline = normalizeProgress(state.store.progress[id]);
    }
    const baseline = state.currentReviewBaseline;
    state.store.progress[id] = rating === "remember"
      ? reviewRemember(baseline, getSrsDisplayMinutes())
      : reviewForget(baseline, getSrsDisplayMinutes());
    saveStoredState();
    updateDashboardCounts();
  }

  function forgetConfusedDistractor(choice) {
    // A wrong answer is evidence of confusion about the displayed word AND
    // the word behind the selected meaning, but never introduce a new word
    // to the review history just because it appeared as a distractor.
    if (!choice || choice.isCorrect || !choice.cardId ||
        choice.cardId === state.currentCard?.id) return null;

    const confusedCard = state.activePack?.cards.find(card => card.id === choice.cardId);
    if (!confusedCard || !wasEverReviewed(state.store.progress[confusedCard.id])) {
      return null;
    }

    state.store.progress[confusedCard.id] = reviewForget(
      state.store.progress[confusedCard.id], getSrsDisplayMinutes()
    );
    saveStoredState();
    updateDashboardCounts();
    return confusedCard;
  }

  function handleQuizAnswer(choice, clickedBtn) {
    if (state.quizAnswered) return;
    state.quizAnswered = true;
    state.selectedChoiceId = choice.id;

    // Highlight buttons
    const allButtons = els.choicesGrid.querySelectorAll(".choice-btn");
    allButtons.forEach(btn => {
      btn.disabled = true;
      const choiceId = btn.dataset.choiceId;
      const c = state.currentQuiz.choices.find(item => item.id === choiceId);
      if (c && c.isCorrect) {
        btn.classList.add("correct");
      } else if (btn === clickedBtn && !c?.isCorrect) {
        btn.classList.add("wrong");
      }
    });

    // Reveal the full pair after answering. In Mode 2 the example is hidden
    // before the answer so its Chinese text cannot give the answer away.
    if (isEnglishToChineseMode()) {
      const reading = state.currentCard.reading ? ` · ${state.currentCard.reading}` : "";
      els.revealedMeaning.textContent =
        `Answer: ${state.currentCard.front}${reading} — ${els.hanziTerm.textContent || visibleCardMeaning}`;
      if (state.currentCard.example?.text) els.exampleCard.hidden = false;
    } else {
      els.revealedMeaning.textContent = `Meaning: ${state.currentQuiz.correctMeaning}`;
    }
    els.revealedMeaning.hidden = false;

    // Apply one rating per presentation. Manual Remember/Forget buttons can
    // correct it without counting an additional review of the same card.
    rateCurrentCard(choice.isCorrect ? "remember" : "forget");
    if (!choice.isCorrect) forgetConfusedDistractor(choice);

    // Result feedback stays inside the card (green/red choice + revealed answer).
    // Do not show a toast after answering, and do not restart audio.
  }

  function presentNextCard({ autoPlay = true } = {}) {
    if (!state.activePack || state.learningStatus !== "active") return;
    state.store.lastCardId = state.currentCard ? state.currentCard.id : null;
    const studyCards = getModeEligibleVocabulary(state.activePack.cards);
    if (!studyCards.length) {
      showToast("No cards can provide three same-length Chinese choices in this mode.");
      return;
    }
    const nextCard = chooseNextCard(
      studyCards,
      state.store.progress,
      state.store.lastCardId,
      Date.now(),
      getSrsDisplayMinutes()
    );
    renderCard(nextCard, { autoPlay });
  }

  /* -------------------------------------------------------------
     7. MANUAL REVIEW CONTROLS
  ------------------------------------------------------------- */
  function setupActionButtons() {
    els.speakWordBtn.addEventListener("click", () => {
      if (state.currentCard) {
        const r = Math.max(1, Number(state.store.settings.wordRepeat) || 2);
        speak(state.currentCard.speechText || state.currentCard.front, {
          lang: state.currentCard.speechLang || "zh-CN",
          repeat: r
        });
      }
    });

    els.speakSentenceBtn.addEventListener("click", () => {
      if (state.currentCard?.example?.text) {
        const r = Math.max(1, Number(state.store.settings.wordRepeat) || 2);
        speak(state.currentCard.example.speechText || state.currentCard.example.text, {
          lang: state.currentCard.example.speechLang || state.currentCard.speechLang || "zh-CN",
          repeat: r
        });
      }
    });

    els.speakExampleBtn.addEventListener("click", () => {
      if (state.currentCard?.example?.text) {
        const r = Math.max(1, Number(state.store.settings.wordRepeat) || 2);
        speak(state.currentCard.example.speechText || state.currentCard.example.text, {
          lang: state.currentCard.example.speechLang || state.currentCard.speechLang || "zh-CN",
          repeat: r
        });
      }
    });

    els.newWordBtn.addEventListener("click", () => {
      if (!state.currentCard) return;
      // Fully reset this card's review history: leaving remembered/forgotten
      // counters behind makes wasEverReviewed() classify it as reviewed.
      state.store.progress[state.currentCard.id] = {
        ...defaultCardProgress(),
        lastShownAt: Date.now()
      };
      state.currentReviewBaseline = null;
      saveStoredState();
      updateDashboardCounts();
      showToast("Card status set to New Word");
      presentNextCard({ autoPlay: true });
    });

    els.forgetBtn.addEventListener("click", () => {
      if (!state.currentCard) return;
      rateCurrentCard("forget");
      showToast("Marked as Forget (interval reset)");
    });

    els.rememberBtn.addEventListener("click", () => {
      if (!state.currentCard) return;
      rateCurrentCard("remember");
      showToast("Marked as Remember (interval increased)");
    });

    els.nextCardBtn.addEventListener("click", () => {
      presentNextCard({ autoPlay: true });
    });
  }

  /* -------------------------------------------------------------
     8. DASHBOARD STATS & DECK BROWSER
  ------------------------------------------------------------- */
  function updateDashboardCounts() {
    if (!state.activePack) return;
    const cards = state.activePack.cards;
    const now = Date.now();

    let dueCount = 0;
    let reviewedCount = 0;
    let newCount = 0;
    let rememberedCount = 0;
    let totalLapses = 0;
    let masteredCount = 0;

    for (const card of cards) {
      const p = state.store.progress[card.id];
      if (p && wasEverReviewed(p)) {
        reviewedCount += 1;
        rememberedCount += p.remembered || 0;
        totalLapses += p.lapses || 0;
        if ((p.dueAt || 0) <= now) dueCount += 1;
        if ((p.repetitions || 0) >= 3) masteredCount += 1;
      } else {
        newCount += 1;
      }
    }

    const total = cards.length;
    const retentionRate = (rememberedCount + totalLapses) > 0
      ? Math.round((rememberedCount / (rememberedCount + totalLapses)) * 100)
      : 100;

    // Header & Study Stats
    els.dueBadge.textContent = dueCount;
    els.studyDueCount.textContent = dueCount;
    els.studyNewCount.textContent = newCount;
    els.studyReviewedCount.textContent = reviewedCount;

    // Stats View
    els.statsTotal.textContent = total;
    els.statsReviewed.textContent = reviewedCount;
    els.statsDue.textContent = dueCount;
    els.statsNew.textContent = newCount;
    els.statsRetention.textContent = `${retentionRate}%`;
    els.statsLapses.textContent = totalLapses;

    // Progress Bar
    const masteredPct = Math.round((masteredCount / total) * 100);
    const learningPct = Math.round(((reviewedCount - masteredCount) / total) * 100);
    const newPct = Math.max(0, 100 - masteredPct - learningPct);

    els.progressPercentText.textContent = `${masteredPct}% mastered (${masteredCount} of ${total})`;
    els.segmentLearned.style.width = `${masteredPct}%`;
    els.segmentLearning.style.width = `${learningPct}%`;
    els.segmentNew.style.width = `${newPct}%`;

    // Deck Filter counts
    els.countAll.textContent = total;
    els.countDue.textContent = dueCount;
    els.countReviewed.textContent = reviewedCount;
    els.countNew.textContent = newCount;
  }

  function renderDeckList() {
    if (!state.activePack) return;
    const cards = state.activePack.cards;
    const now = Date.now();
    const query = state.deckSearchQuery.toLowerCase().trim();
    const filter = state.deckFilter;

    const filtered = cards.filter(card => {
      const p = state.store.progress[card.id];
      const isRev = p && wasEverReviewed(p);
      const isDue = isRev && (p.dueAt || 0) <= now;

      if (filter === "due" && !isDue) return false;
      if (filter === "reviewed" && !isRev) return false;
      if (filter === "new" && isRev) return false;

      if (query) {
        const matchesHanzi = (card.front || "").toLowerCase().includes(query);
        const matchesReading = (card.reading || "").toLowerCase().includes(query);
        const matchesMeaning = (card.meaning || "").toLowerCase().includes(query);
        return matchesHanzi || matchesReading || matchesMeaning;
      }
      return true;
    });

    els.deckWordList.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.padding = "40px 20px";
      empty.style.textAlign = "center";
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No vocabulary cards found matching your search or filter.";
      els.deckWordList.appendChild(empty);
      return;
    }

    const maxRender = 100; // Virtual limit for DOM speed
    filtered.slice(0, maxRender).forEach(card => {
      const p = state.store.progress[card.id];
      const isRev = p && wasEverReviewed(p);
      const isDue = isRev && (p.dueAt || 0) <= now;

      const row = document.createElement("div");
      row.className = "word-row-card";

      const mainInfo = document.createElement("div");
      mainInfo.className = "word-main-info";

      const hanzi = document.createElement("div");
      hanzi.className = "word-hanzi";
      hanzi.textContent = card.front;

      const readingMeaning = document.createElement("div");
      readingMeaning.className = "word-reading-meaning";

      const pinyin = document.createElement("div");
      pinyin.className = "word-pinyin";
      pinyin.textContent = card.reading || "";

      const meaning = document.createElement("div");
      meaning.className = "word-meaning";
      meaning.textContent = card.meaning || "";

      readingMeaning.appendChild(pinyin);
      readingMeaning.appendChild(meaning);
      mainInfo.appendChild(hanzi);
      mainInfo.appendChild(readingMeaning);

      const statusBox = document.createElement("div");
      statusBox.className = "word-srs-status";

      const badge = document.createElement("span");
      if (isDue) {
        badge.className = "status-badge-mini due";
        badge.textContent = "Due";
      } else if (isRev) {
        badge.className = "status-badge-mini learned";
        badge.textContent = formatInterval(p.intervalMinutes);
      } else {
        badge.className = "status-badge-mini new";
        badge.textContent = "New";
      }
      statusBox.appendChild(badge);

      const speakBtn = document.createElement("button");
      speakBtn.className = "icon-button";
      speakBtn.type = "button";
      speakBtn.textContent = "🔊";
      speakBtn.title = "Pronounce word";
      speakBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        speak(card.speechText || card.front, { lang: card.speechLang || "zh-CN", repeat: 1 });
      });
      statusBox.appendChild(speakBtn);

      row.appendChild(mainInfo);
      row.appendChild(statusBox);

      // Clicking row switches to study view and renders this card
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        switchTab("study");
        if (state.learningStatus !== "active") {
          showToast(state.learningStatus === "paused"
            ? "Resume learning before opening a study card."
            : "Start learning before opening a study card.");
          return;
        }
        if (!isModeEligibleCard(card)) {
          showToast("Mode 2 needs two other Chinese answers with the same character count.");
          return;
        }
        renderCard(card, { autoPlay: false });
      });

      els.deckWordList.appendChild(row);
    });

    if (filtered.length > maxRender) {
      const note = document.createElement("div");
      note.style.textAlign = "center";
      note.style.padding = "16px";
      note.style.color = "var(--text-muted)";
      note.style.fontSize = "13px";
      note.textContent = `Showing 100 of ${filtered.length} matching words. Refine your search to see more.`;
      els.deckWordList.appendChild(note);
    }
  }

  function setupDeckBrowser() {
    els.deckSearchInput.addEventListener("input", (e) => {
      state.deckSearchQuery = e.target.value;
      renderDeckList();
    });

    els.filterChips.forEach(chip => {
      chip.addEventListener("click", () => {
        els.filterChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        state.deckFilter = chip.dataset.filter;
        renderDeckList();
      });
    });
  }

  /* -------------------------------------------------------------
     9. REMINDER CADENCE TIMER & NOTIFICATIONS
  ------------------------------------------------------------- */

  function getSrsDisplayMinutes() {
    // The timer supports hours/minutes/seconds, but the SRS engine works
    // in whole minutes. Use the entire cadence, not only the minute field.
    return Math.max(1, Math.ceil(getTotalIntervalSeconds() / 60));
  }

  function getTotalIntervalSeconds() {
    const s = state.store.settings;
    const hours = Math.max(0, parseInt(s.intervalHours, 10) || 0);
    const minutes = Math.max(0, parseInt(s.intervalMinutes, 10) || 0);
    const seconds = Math.max(0, parseInt(s.intervalSeconds, 10) || 0);
    const total = (hours * 3600) + (minutes * 60) + seconds;
    return Math.max(5, total); // Minimum 5 seconds
  }

  function formatTimeInterval(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(" ");
  }

  function scheduleNextReminder() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }

    if (state.learningStatus !== "active") {
      state.nextReminderTime = null;
      els.intervalTimerPill.classList.remove("active");
      els.timerStatusText.textContent = state.learningStatus === "paused"
        ? "Learning paused"
        : "Learning not started";
      return;
    }

    if (!state.store.settings.reminderEnabled) {
      state.nextReminderTime = null;
      els.intervalTimerPill.classList.remove("active");
      els.timerStatusText.textContent = "Self-paced study";
      return;
    }

    const totalSeconds = getTotalIntervalSeconds();
    const intervalMs = totalSeconds * 1000;
    state.nextReminderTime = Date.now() + intervalMs;

    els.intervalTimerPill.classList.add("active");
    els.timerStatusText.textContent = `Next card in ${formatTimeInterval(totalSeconds)}`;

    state.timerId = setInterval(() => {
      triggerReminder();
    }, intervalMs);
  }

  function triggerReminder() {
    if (!state.activePack || state.learningStatus !== "active") return;
    presentNextCard({ autoPlay: true });

    // Play subtle audio cue / notification
    if (state.store.settings.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Vocabulary SRS Reminder", {
          body: `Time for your review! Next word: ${state.currentCard.front} (${state.currentCard.reading})`,
          icon: "icons/icon128.png"
        });
      } catch (err) {
        console.warn("Notification error:", err);
      }
    }
    // The new card itself is the reminder; avoid stacking an in-page toast over study.
    scheduleNextReminder();
  }


  /* -------------------------------------------------------------
     8B. TRANSLATE & WORD BREAKDOWN SECTION
  ------------------------------------------------------------- */
  const translationCache = new Map();
  let translateDebounceTimer = null;
  let translationGeneration = 0;

  async function fetchGoogleTranslate(text, target = "en") {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const cacheKey = `${target}|${trimmed}`;
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=${encodeURIComponent(target)}&dt=t&dt=rm&dt=bd&q=${encodeURIComponent(trimmed)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();

    let translation = "";
    if (Array.isArray(data[0])) {
      translation = data[0]
        .filter(item => item && item[0])
        .map(item => item[0])
        .join("");
    }

    let pinyin = "";
    if (Array.isArray(data[0])) {
      for (const item of data[0]) {
        if (item && item.length >= 4 && typeof item[3] === "string" && item[3]) {
          pinyin = item[3];
          break;
        }
      }
    }

    const result = { translation, pinyin };
    translationCache.set(cacheKey, result);
    return result;
  }

  function segmentChineseText(text) {
    if (!text) return [];
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
        const raw = Array.from(segmenter.segment(text))
          .filter(s => s.isWordLike && s.segment.trim().length > 0)
          .map(s => s.segment.trim());
        if (raw.length > 0) return raw;
      } catch (err) {
        console.warn("Intl.Segmenter error:", err);
      }
    }
    const fallbackList = extractWordsFallback(text, state.activePack?.cards || []);
    return fallbackList.map(item => item.word);
  }

  async function executeTranslation() {
    const requestId = ++translationGeneration;
    const target = TranslationSupport.normalizeLanguage(state.store.settings.translationLanguage);
    const text = els.translateInput.value.trim();
    if (!text) {
      els.translateResult.hidden = true;
      els.translateStatusIndicator.textContent = "";
      return;
    }

    els.translateStatusIndicator.textContent = "Translating…";
    els.translateBtn.disabled = true;

    try {
      let fullTrans = { translation: "", pinyin: "" };
      try {
        fullTrans = await fetchGoogleTranslate(text, target);
      } catch (err) {
        console.warn("Google translate API error:", err);
        fullTrans = { translation: "(Offline / Translation unavailable)", pinyin: "" };
      }

      const words = segmentChineseText(text);

      const allCards = state.activePack?.cards || (state.catalog?.packs?.[0]?.cards || []);
      const cardMap = new Map();
      allCards.forEach(c => {
        if (c.front) cardMap.set(c.front, c);
      });

      // Common characters & particles dictionary
      const commonWords = {
        "莫": { reading: "mò", meaning: "do not, not" },
        "形": { reading: "xíng", meaning: "appearance, shape, form" },
        "莫要": { reading: "mò yào", meaning: "do not, must not" }
      };

      const wordDetails = await Promise.all(
        words.map(async (w) => {
          const card = cardMap.get(w);
          if (card) {
            return {
              word: w,
              pinyin: card.reading || "",
              meaning: await TranslationSupport.translateText(card.meaning || "", target, "en"),
              isHsk: true
            };
          }

          if (commonWords[w]) {
            return {
              word: w,
              pinyin: commonWords[w].reading,
              meaning: await TranslationSupport.translateText(commonWords[w].meaning, target, "en"),
              isHsk: false
            };
          }

          let trans = translationCache.get(`${target}|${w}`);
          if (!trans) {
            try {
              trans = await fetchGoogleTranslate(w, target);
            } catch (e) {
              trans = { translation: "", pinyin: "" };
            }
          }

          return {
            word: w,
            pinyin: trans?.pinyin || "",
            meaning: trans?.translation || "",
            isHsk: false
          };
        })
      );

      // The input may have changed while multiple translations were loading.
      if (requestId !== translationGeneration) return;
      els.resultChinese.textContent = text;
      els.resultPinyin.textContent = fullTrans.pinyin || "";
      els.resultPinyin.hidden = !fullTrans.pinyin;
      els.resultEnglish.textContent = fullTrans.translation || "(No translation returned)";

      els.translateWordsGrid.innerHTML = "";
      if (wordDetails.length > 0) {
        els.translateWordsCard.hidden = false;
        wordDetails.forEach(item => {
          const a = document.createElement("a");
          a.className = "breakdown-word-card";
          a.href = `https://translate.google.com/?sl=zh-TW&tl=${encodeURIComponent(state.store.settings.translationLanguage || "en")}&text=${encodeURIComponent(item.word)}&op=translate`;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.title = `Look up "${item.word}" on Google Translate`;

          const topRow = document.createElement("div");
          topRow.className = "card-word-top";

          const wordSpan = document.createElement("span");
          wordSpan.className = "card-word-text";
          wordSpan.textContent = item.word;

          const metaSpan = document.createElement("div");
          metaSpan.style.display = "flex";
          metaSpan.style.alignItems = "center";
          metaSpan.style.gap = "4px";

          if (item.isHsk) {
            const hsk = document.createElement("span");
            hsk.className = "hsk-badge-pill";
            hsk.textContent = "HSK";
            metaSpan.appendChild(hsk);
          }

          const extIcon = document.createElement("span");
          extIcon.className = "card-ext-icon";
          extIcon.textContent = "↗";
          metaSpan.appendChild(extIcon);

          topRow.appendChild(wordSpan);
          topRow.appendChild(metaSpan);
          a.appendChild(topRow);

          if (item.pinyin) {
            const pinyinSpan = document.createElement("div");
            pinyinSpan.className = "card-pinyin-text";
            pinyinSpan.textContent = item.pinyin;
            a.appendChild(pinyinSpan);
          }

          if (item.meaning) {
            const meaningSpan = document.createElement("div");
            meaningSpan.className = "card-meaning-text";
            meaningSpan.textContent = item.meaning;
            a.appendChild(meaningSpan);
          }

          els.translateWordsGrid.appendChild(a);
        });
      } else {
        els.translateWordsCard.hidden = true;
      }

      els.translateResult.hidden = false;
      els.translateStatusIndicator.textContent = "Done";
      setTimeout(() => {
        if (els.translateStatusIndicator.textContent === "Done") {
          els.translateStatusIndicator.textContent = "";
        }
      }, 2000);
    } catch (err) {
      if (requestId === translationGeneration) {
        console.error("Translation execution error:", err);
        els.translateStatusIndicator.textContent = "Error translating text";
      }
    } finally {
      if (requestId === translationGeneration) els.translateBtn.disabled = false;
    }
  }

  function setupTranslateSection() {
    if (els.translateTargetSelect) {
      els.translateTargetSelect.addEventListener("change", event => {
        const target = TranslationSupport.normalizeLanguage(event.target.value);
        state.store.settings.translationLanguage = target;
        if (els.meaningLanguageSelect) els.meaningLanguageSelect.value = target;
        saveStoredState();
        if (state.currentCard && state.currentQuiz) {
          void localizeRenderedCard(state.currentCard, state.currentQuiz, isEnglishToChineseMode());
        }
        if (els.translateInput.value.trim()) executeTranslation();
      });
    }
    function updateCharCount() {
      const len = els.translateInput.value.length;
      els.translateCharCount.textContent = `${len} character${len === 1 ? "" : "s"}`;
      els.clearTranslateBtn.hidden = len === 0;
    }

    els.translateInput.addEventListener("input", () => {
      ++translationGeneration;
      els.translateBtn.disabled = false;
      updateCharCount();
      if (translateDebounceTimer) clearTimeout(translateDebounceTimer);
      const text = els.translateInput.value.trim();
      if (!text) {
        els.translateResult.hidden = true;
        els.translateStatusIndicator.textContent = "";
        return;
      }
      translateDebounceTimer = setTimeout(() => {
        executeTranslation();
      }, 650);
    });

    els.translateBtn.addEventListener("click", () => {
      if (translateDebounceTimer) clearTimeout(translateDebounceTimer);
      executeTranslation();
    });

    els.clearTranslateBtn.addEventListener("click", () => {
      ++translationGeneration;
      if (translateDebounceTimer) clearTimeout(translateDebounceTimer);
      els.translateBtn.disabled = false;
      els.translateInput.value = "";
      updateCharCount();
      els.translateResult.hidden = true;
      els.translateStatusIndicator.textContent = "";
      els.translateInput.focus();
    });

    els.speakInputBtn.addEventListener("click", () => {
      const text = els.translateInput.value.trim();
      if (text) {
        const r = Math.max(1, Number(state.store.settings.wordRepeat) || 2);
        speak(text, { lang: "zh-CN", repeat: r });
      }
    });

    els.speakResultBtn.addEventListener("click", () => {
      const text = els.resultChinese.textContent.trim();
      if (text) {
        speak(text, { lang: "zh-CN", repeat: 1 });
      }
    });

    els.copyTranslationBtn.addEventListener("click", async () => {
      const trans = els.resultEnglish.textContent.trim();
      if (trans && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(trans);
          showToast("Translation copied to clipboard!");
        } catch (e) {
          console.warn("Copy failed:", e);
        }
      }
    });

    document.querySelectorAll(".sample-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const sampleText = chip.dataset.sample;
        if (sampleText) {
          els.translateInput.value = sampleText;
          updateCharCount();
          executeTranslation();
        }
      });
    });
  }

  /* -------------------------------------------------------------
     10. SETTINGS & DATA EXPORT / IMPORT
  ------------------------------------------------------------- */
  function setupSettings() {
    if (els.meaningLanguageSelect) {
      els.meaningLanguageSelect.addEventListener("change", event => {
        const target = TranslationSupport.normalizeLanguage(event.target.value);
        state.store.settings.translationLanguage = target;
        if (els.translateTargetSelect) els.translateTargetSelect.value = target;
        saveStoredState();
        if (state.currentCard && state.currentQuiz) {
          void localizeRenderedCard(state.currentCard, state.currentQuiz, isEnglishToChineseMode());
        }
      });
    }
    // On-device translation is supported only by certain desktop browsers.
    // Creating the translator may require a user gesture to download the pack.
    if (els.onDeviceTranslationRow) {
      const supported = typeof TranslationSupport.browserTranslator === "function" &&
        Boolean(TranslationSupport.browserTranslator());
      els.onDeviceTranslationRow.hidden = !supported;
      els.enableOnDeviceTranslationBtn?.addEventListener("click", () => {
        const target = TranslationSupport.normalizeLanguage(state.store.settings.translationLanguage);
        if (target === "en") {
          els.onDeviceTranslationStatus.textContent = "Select Vietnamese or another meaning language first.";
          return;
        }
        els.onDeviceTranslationStatus.textContent = "Preparing the language pack…";
        let pending;
        try {
          // This call must start synchronously from the click event.
          pending = TranslationSupport.enableOnDeviceTranslation(target, "en", progress => {
            els.onDeviceTranslationStatus.textContent = `Downloading language pack: ${progress}%`;
          });
        } catch (error) {
          els.onDeviceTranslationStatus.textContent = error.message;
          return;
        }
        Promise.resolve(pending).then(() => {
          els.onDeviceTranslationStatus.textContent =
            "On-device translation is ready. Meanings can be translated offline.";
          if (state.currentCard && state.currentQuiz) {
            void localizeRenderedCard(state.currentCard, state.currentQuiz, isEnglishToChineseMode());
          }
        }).catch(error => {
          els.onDeviceTranslationStatus.textContent =
            "Could not enable on-device translation: " + error.message;
        });
      });
    }
    // Learning mode
    if (els.learningModeSelect) {
      els.learningModeSelect.value = state.store.settings.learningMode || "chinese-to-english";
      els.learningModeSelect.addEventListener("change", (e) => {
        const nextMode = e.target.value === "english-to-chinese"
          ? "english-to-chinese"
          : "chinese-to-english";
        state.store.settings.learningMode = nextMode;
        saveStoredState();
        showToast(nextMode === "english-to-chinese"
          ? "Mode 2 selected: English → Chinese. Applies to the next card."
          : "Mode 1 selected: Chinese → English. Applies to the next card.");
      });
    }

    // Reminder switch
    els.reminderEnabled.checked = state.store.settings.reminderEnabled;
    els.reminderEnabled.addEventListener("change", (e) => {
      state.store.settings.reminderEnabled = e.target.checked;
      saveStoredState();
      scheduleNextReminder();
    });

    // Interval Hours, Minutes, Seconds
    function updateIntervalSummary() {
      const totalSec = getTotalIntervalSeconds();
      if (els.intervalSummaryText) {
        els.intervalSummaryText.textContent = formatTimeInterval(totalSec);
      }
    }

    if (els.intervalHoursInput) {
      els.intervalHoursInput.value = state.store.settings.intervalHours || 0;
      els.intervalHoursInput.addEventListener("input", (e) => {
        state.store.settings.intervalHours = Math.max(0, parseInt(e.target.value, 10) || 0);
        updateIntervalSummary();
        saveStoredState();
        if (state.store.settings.reminderEnabled) scheduleNextReminder();
      });
    }

    if (els.intervalMinutesInput) {
      els.intervalMinutesInput.value = state.store.settings.intervalMinutes ?? 15;
      els.intervalMinutesInput.addEventListener("input", (e) => {
        state.store.settings.intervalMinutes = Math.max(0, parseInt(e.target.value, 10) || 0);
        updateIntervalSummary();
        saveStoredState();
        if (state.store.settings.reminderEnabled) scheduleNextReminder();
      });
    }

    if (els.intervalSecondsInput) {
      els.intervalSecondsInput.value = state.store.settings.intervalSeconds || 0;
      els.intervalSecondsInput.addEventListener("input", (e) => {
        state.store.settings.intervalSeconds = Math.max(0, parseInt(e.target.value, 10) || 0);
        updateIntervalSummary();
        saveStoredState();
        if (state.store.settings.reminderEnabled) scheduleNextReminder();
      });
    }

    updateIntervalSummary();

    // Preset Buttons
    document.querySelectorAll(".preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const h = parseInt(btn.dataset.hours, 10) || 0;
        const m = parseInt(btn.dataset.minutes, 10) || 0;
        const s = parseInt(btn.dataset.seconds, 10) || 0;

        state.store.settings.intervalHours = h;
        state.store.settings.intervalMinutes = m;
        state.store.settings.intervalSeconds = s;

        if (els.intervalHoursInput) els.intervalHoursInput.value = h;
        if (els.intervalMinutesInput) els.intervalMinutesInput.value = m;
        if (els.intervalSecondsInput) els.intervalSecondsInput.value = s;

        updateIntervalSummary();
        saveStoredState();
        if (state.store.settings.reminderEnabled) scheduleNextReminder();
        showToast(`Interval set to ${formatTimeInterval(getTotalIntervalSeconds())}`);
      });
    });

    // Notifications
    els.enableBrowserNotifications.checked = state.store.settings.notificationsEnabled;
    els.enableBrowserNotifications.addEventListener("change", async (e) => {
      if (e.target.checked) {
        if ("Notification" in window) {
          const permission = await Notification.requestPermission();
          if (permission === "granted") {
            state.store.settings.notificationsEnabled = true;
            showToast("Notifications enabled!");
          } else {
            state.store.settings.notificationsEnabled = false;
            e.target.checked = false;
            showToast("Notification permission was denied.");
          }
        } else {
          showToast("Browser does not support notifications.");
          e.target.checked = false;
        }
      } else {
        state.store.settings.notificationsEnabled = false;
      }
      saveStoredState();
    });

    // Audio volume & speed
    els.volumeRange.value = state.store.settings.volume ?? 100;
    els.volumeLabel.textContent = `${state.store.settings.volume ?? 100}%`;
    els.volumeRange.addEventListener("input", (e) => {
      state.store.settings.volume = Number(e.target.value);
      els.volumeLabel.textContent = `${state.store.settings.volume}%`;
      saveStoredState();
    });

    els.speedRange.value = state.store.settings.speed ?? 0.85;
    els.speedLabel.textContent = `${state.store.settings.speed ?? 0.85}x`;
    els.speedRange.addEventListener("input", (e) => {
      state.store.settings.speed = Number(e.target.value);
      els.speedLabel.textContent = `${state.store.settings.speed}x`;
      saveStoredState();
    });

    // Audio Engine Selection
    if (els.audioEngineSelect) {
      els.audioEngineSelect.value = state.store.settings.audioEngine || "auto";
      els.audioEngineSelect.addEventListener("change", (e) => {
        state.store.settings.audioEngine = e.target.value;
        saveStoredState();
        showToast(`Audio engine set to: ${e.target.options[e.target.selectedIndex].text}`);
      });
    }

    // Audio Diagnostics & Recovery Button
    if (els.testAudioBtn) {
      els.testAudioBtn.addEventListener("click", async () => {
        recoverSpeechSynthesis();
        showToast("🔊 Testing sound playback…");
        const testWord = state.currentCard?.front || "你好";
        await speak(testWord, { repeat: 1 });
        showToast("Sound test completed! Audio engine verified.");
      });
    }

    els.readWordToggle.checked = state.store.settings.readWords !== false;
    els.readWordToggle.addEventListener("change", (e) => {
      state.store.settings.readWords = e.target.checked;
      saveStoredState();
    });
    els.readSentenceToggle.checked = state.store.settings.readSentences !== false;
    els.readSentenceToggle.addEventListener("change", (e) => {
      state.store.settings.readSentences = e.target.checked;
      saveStoredState();
    });

    const currentRepeat = Math.max(1, Number(state.store.settings.wordRepeat) || 2);
    els.wordRepeatCount.value = currentRepeat;
    els.wordRepeatLabel.textContent = currentRepeat;
    els.wordRepeatCount.addEventListener("input", (e) => {
      const val = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
      state.store.settings.wordRepeat = val;
      els.wordRepeatLabel.textContent = val;
      saveStoredState();
    });

    els.voiceSelect.addEventListener("change", (e) => {
      state.store.settings.selectedVoice = e.target.value;
      saveStoredState();
      if (state.currentCard) {
        speak(state.currentCard.front, { lang: state.currentCard.speechLang || "zh-CN", repeat: 1 });
      }
    });

    // Export JSON
    els.exportDataBtn.addEventListener("click", () => {
      const backupData = {
        schemaVersion: 1,
        saveName: saveSlots.slots[saveSlots.activeId].name,
        exportedAt: new Date().toISOString(),
        settings: state.store.settings,
        progress: state.store.progress,
        currentCardId: state.store.currentCardId,
        lastCardId: state.store.lastCardId
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = backupData.saveName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "save";
      a.download = `vocabulary-srs-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Progress exported successfully!");
    });

    // Import JSON
    els.importDataBtn.addEventListener("click", () => {
      els.importFileInput.click();
    });

    els.importFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text);

        // Accept web backups and the extension's progress payload. Never
        // interpret a whole settings/metadata object as card progress.
        const importedProgress = imported?.progress ??
          imported?.payload?.progress ?? imported?.chineseSrsBackupProgress ??
          (imported?.settings || imported?.schemaVersion ? null : imported);
        if (!importedProgress || typeof importedProgress !== "object" ||
            Array.isArray(importedProgress)) {
          throw new Error("Invalid progress backup format.");
        }

        const validIds = new Set((state.catalog?.packs || []).flatMap(pack =>
          pack.cards.map(card => card.id)
        ));
        let count = 0;
        for (const [id, val] of Object.entries(importedProgress)) {
          if (!validIds.has(id) || !val || typeof val !== "object" ||
              Array.isArray(val)) continue;
          state.store.progress[id] = normalizeProgress(val);
          count += 1;
        }
        if (!count) throw new Error("No matching vocabulary progress found in backup.");
        state.currentReviewBaseline = null;

        // Backups also contain the user's audio preferences. Restore only
        // validated known fields, keeping reminder/notification permissions
        // local to this browser.
        const importedSettings = imported.settings || imported.payload?.settings;
        if (importedSettings && typeof importedSettings === "object" &&
            !Array.isArray(importedSettings)) {
          // Support both new and old backups; the switches remain independent.
          const importedReadWords = typeof importedSettings.readWords === "boolean"
            ? importedSettings.readWords : importedSettings.autoSpeak;
          if (typeof importedReadWords === "boolean") {
            state.store.settings.readWords = importedReadWords;
          }
          if (typeof importedSettings.readSentences === "boolean") {
            state.store.settings.readSentences = importedSettings.readSentences;
          }
          if (["chinese-to-english", "english-to-chinese"].includes(importedSettings.learningMode)) {
            state.store.settings.learningMode = importedSettings.learningMode;
          }
          if (["auto", "online", "speechSynthesis"].includes(importedSettings.audioEngine)) {
            state.store.settings.audioEngine = importedSettings.audioEngine;
          }
          const volume = Number(importedSettings.volume);
          if (importedSettings.volume != null && Number.isFinite(volume)) {
            state.store.settings.volume = Math.min(100, Math.max(0, volume));
          }
          const speed = Number(importedSettings.speed);
          if (importedSettings.speed != null && Number.isFinite(speed)) {
            state.store.settings.speed = Math.min(1.5, Math.max(0.5, speed));
          }
          const repeats = Number(importedSettings.wordRepeat);
          if (Number.isFinite(repeats) && repeats >= 1) {
            state.store.settings.wordRepeat = Math.min(5, Math.round(repeats));
          }
          els.readWordToggle.checked = state.store.settings.readWords !== false;
          els.readSentenceToggle.checked = state.store.settings.readSentences !== false;
          if (els.learningModeSelect) {
            els.learningModeSelect.value = state.store.settings.learningMode || "chinese-to-english";
          }
          els.audioEngineSelect.value = state.store.settings.audioEngine || "auto";
          els.volumeRange.value = state.store.settings.volume;
          els.volumeLabel.textContent = `${state.store.settings.volume}%`;
          els.speedRange.value = state.store.settings.speed;
          els.speedLabel.textContent = `${state.store.settings.speed}x`;
          els.wordRepeatCount.value = state.store.settings.wordRepeat;
          els.wordRepeatLabel.textContent = state.store.settings.wordRepeat;
        }
        saveStoredState();
        updateDashboardCounts();
        renderDeckList();
        renderSaveSlotControls();
        showToast(`Successfully imported progress for ${count} cards!`);
      } catch (err) {
        alert(`Failed to import file: ${err.message}`);
      } finally {
        els.importFileInput.value = "";
      }
    });

    // Reset Progress Modal
    function openResetModal() {
      els.resetModal.classList.add("active");
      els.resetModal.removeAttribute("hidden");
      els.resetModal.style.display = "flex";
    }

    function closeResetModal() {
      els.resetModal.classList.remove("active");
      els.resetModal.style.display = "none";
      els.resetModal.setAttribute("hidden", "");
    }

    els.resetDataBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openResetModal();
    });

    els.cancelResetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeResetModal();
    });

    els.resetModal.addEventListener("click", (e) => {
      if (e.target === els.resetModal) {
        closeResetModal();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeResetModal();
      }
    });

    els.confirmResetBtn.addEventListener("click", () => {
      state.store.progress = {};
      state.store.currentCardId = null;
      state.store.lastCardId = null;
      saveStoredState();
      updateDashboardCounts();
      renderDeckList();
      if (state.learningStatus === "active") {
        presentNextCard({ autoPlay: false });
      } else {
        state.currentCard = null;
        state.currentQuiz = null;
        updateLearningSessionUi();
      }
      closeResetModal();
      renderSaveSlotControls();
      showToast("Progress has been reset.");
    });
  }

  /* -------------------------------------------------------------
     11. KEYBOARD NAVIGATION & TABS
  ------------------------------------------------------------- */
  function switchTab(tabName) {
    els.tabButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    els.tabViews.forEach(view => {
      view.classList.toggle("active", view.id === `${tabName}View`);
    });

    if (tabName === "deck") {
      renderDeckList();
    } else if (tabName === "stats") {
      updateDashboardCounts();
    } else if (tabName === "translate") {
      if (els.translateInput) els.translateInput.focus();
    }
  }

  function setupTabs() {
    els.tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
      });
    });
  }

  function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Don't trigger shortcuts if user is typing in an input
      if (state.learningStatus !== "active" ||
          e.ctrlKey || e.metaKey || e.altKey || e.isComposing ||
          ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) ||
          document.activeElement?.isContentEditable ||
          ![...els.tabButtons].some(btn => btn.dataset.tab === "study" && btn.classList.contains("active")) ||
          els.resetModal.classList.contains("active")) {
        return;
      }

      const key = e.key;

      // 1, 2, 3 for quiz choices
      if (["1", "2", "3"].includes(key)) {
        const index = parseInt(key, 10) - 1;
        const buttons = els.choicesGrid.querySelectorAll(".choice-btn");
        if (buttons[index] && !buttons[index].disabled) {
          buttons[index].click();
        }
      } else if (key === " " || key === "Enter") {
        e.preventDefault();
        if (!state.quizAnswered) {
          // Play word audio
          if (state.currentCard) {
            const r = Math.max(1, Number(state.store.settings.wordRepeat) || 2);
            speak(state.currentCard.speechText || state.currentCard.front, {
              lang: state.currentCard.speechLang || "zh-CN",
              repeat: r
            });
          }
        } else {
          // Advance to next card
          presentNextCard({ autoPlay: true });
        }
      } else if (key === "r" || key === "R") {
        els.rememberBtn.click();
      } else if (key === "f" || key === "F") {
        els.forgetBtn.click();
      } else if (key === "n" || key === "N") {
        els.newWordBtn.click();
      } else if (key === "w" || key === "W") {
        els.speakWordBtn.click();
      } else if (key === "s" || key === "S") {
        els.speakSentenceBtn.click();
      } else if (key === "ArrowRight") {
        els.nextCardBtn.click();
      }
    });
  }

  /* -------------------------------------------------------------
     12. VOCABULARY DATA & INITIALIZATION
  ------------------------------------------------------------- */
  async function expandVocabularyCatalog(data) {
    if (!Array.isArray(data?.packs) || !data.packs.length) {
      throw new Error("Vocabulary catalog has no packs.");
    }
    for (const pack of data.packs) {
      if (!Array.isArray(pack.cards)) throw new Error("Vocabulary pack is invalid.");
      if (!Array.isArray(pack.cardFiles) || !pack.cardFiles.length) continue;

      // Fetch chunks concurrently, preserving the ranked order in cardFiles.
      // The original 1,000 cards stay first, with their exact IDs intact.
      const chunks = await Promise.all(pack.cardFiles.map(async path => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
        const cards = await response.json();
        if (!Array.isArray(cards)) throw new Error(`Invalid vocabulary file: ${path}`);
        return cards;
      }));
      pack.cards.push(...chunks.flat());
      if (pack.expectedCardCount && pack.cards.length !== pack.expectedCardCount) {
        throw new Error(`Expected ${pack.expectedCardCount} words but found ${pack.cards.length}.`);
      }
    }
    return data;
  }

  async function init() {
    loadStoredState();
    syncMeaningLanguageControls();
    // The first loadVoices() call ran before stored preferences were read.
    // Populate the selected device voice after restoring those preferences.
    loadVoices();
    initTheme();
    setupLearningSessionControls();
    setupActionButtons();
    setupDeckBrowser();
    setupTranslateSection();
    setupSettings();
    setupSaveSlots();
    setupTabs();
    setupKeyboardShortcuts();

    try {
      const response = await fetch("vocabulary.json");
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await expandVocabularyCatalog(await response.json());
      state.catalog = data;

      // Populate pack selector
      els.packSelect.innerHTML = "";
      data.packs.forEach(pack => {
        const option = document.createElement("option");
        option.value = pack.id;
        option.textContent = `${pack.name} (${pack.cards.length})`;
        els.packSelect.appendChild(option);
      });

      const activePackId = state.store.settings.activePackId || data.defaultPackId || data.packs[0].id;
      els.packSelect.value = activePackId;
      state.activePack = data.packs.find(p => p.id === activePackId) || data.packs[0];

      els.packSelect.addEventListener("change", (e) => {
        const nextPack = data.packs.find(p => p.id === e.target.value);
        if (nextPack) {
          state.activePack = nextPack;
          state.store.settings.activePackId = nextPack.id;
          state.currentCard = null;
          state.currentQuiz = null;
          state.store.currentCardId = null;
          saveStoredState();
          updateDashboardCounts();
          renderDeckList();
          if (state.learningStatus === "active") {
            presentNextCard({ autoPlay: false });
          } else {
            updateLearningSessionUi();
          }
        }
      });

      // Every page visit begins intentionally idle. Starting is a user gesture,
      // which also gives browsers the interaction needed for pronunciation.
      state.learningStatus = "idle";
      state.currentCard = null;
      state.currentQuiz = null;
      if (els.startLearningBtn) els.startLearningBtn.disabled = false;
      updateLearningSessionUi();
      updateDashboardCounts();
      renderDeckList();
      scheduleNextReminder();

      // Register PWA Service Worker for offline use
      if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("sw.js").catch(err => {
          console.log("Service Worker registration:", err.message);
        });
      }

    } catch (err) {
      console.error("Initialization error:", err);
      els.hanziTerm.textContent = "Error";
      els.pinyinReading.textContent = `Could not load vocabulary.json: ${err.message}`;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
