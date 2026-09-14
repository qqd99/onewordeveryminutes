/**
 * Vocabulary SRS Web Application
 * Adaptive spaced repetition vocabulary learning
 */

(() => {
  "use strict";

  // Storage key
  const STORAGE_KEY = "vocab_srs_state_v1";

  // Global App State
  const state = {
    catalog: null,
    activePack: null,
    currentCard: null,
    currentQuiz: null,
    quizAnswered: false,
    selectedChoiceId: null,
    store: {
      settings: {
        theme: "light",
        activePackId: "zh-hsk-core-1000",
        intervalMinutes: 15,
        reminderEnabled: false,
        volume: 100,
        speed: 0.85,
        autoSpeak: true,
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

  // DOM Elements cache
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const els = {
    themeToggle: $("#themeToggle"),
    packSelect: $("#packSelect"),
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
    hanziTerm: $("#hanziTerm"),
    pinyinReading: $("#pinyinReading"),
    quizPrompt: $("#quizPrompt"),
    choicesGrid: $("#choicesGrid"),
    revealedMeaning: $("#revealedMeaning"),
    exampleCard: $("#exampleCard"),
    exampleHanzi: $("#exampleHanzi"),
    examplePinyin: $("#examplePinyin"),
    exampleEnglish: $("#exampleEnglish"),
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

    // Settings View
    reminderEnabled: $("#reminderEnabled"),
    intervalMinutesInput: $("#intervalMinutesInput"),
    enableBrowserNotifications: $("#enableBrowserNotifications"),
    voiceSelect: $("#voiceSelect"),
    volumeRange: $("#volumeRange"),
    volumeLabel: $("#volumeLabel"),
    speedRange: $("#speedRange"),
    speedLabel: $("#speedLabel"),
    autoSpeakToggle: $("#autoSpeakToggle"),
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
  function loadStoredState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.store = {
          settings: { ...state.store.settings, ...(parsed.settings || {}) },
          progress: parsed.progress || {},
          lastCardId: parsed.lastCardId || null,
          currentCardId: parsed.currentCardId || null
        };
      }
    } catch (err) {
      console.warn("Could not read local storage state:", err);
    }
  }

  function saveStoredState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
    } catch (err) {
      console.warn("Could not save state to local storage:", err);
    }
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
     3. AUDIO & SPEECH SYNTHESIS ENGINE
  ------------------------------------------------------------- */
  let activeUtterance = null;
  let activeAudioEl = null;

  function stopAudio() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (activeAudioEl) {
      try {
        activeAudioEl.pause();
      } catch (_) {}
      activeAudioEl = null;
    }
    activeUtterance = null;
  }

  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    state.availableVoices = voices;

    els.voiceSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Auto-detect Chinese voice";
    els.voiceSelect.appendChild(defaultOpt);

    const zhVoices = voices.filter(v => /^zh|cmn|chinese/i.test(v.lang) || /^zh|chinese/i.test(v.name));
    for (const v of zhVoices) {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      els.voiceSelect.appendChild(opt);
    }

    if (state.store.settings.selectedVoice) {
      els.voiceSelect.value = state.store.settings.selectedVoice;
    }
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }

  function chooseVoice(lang = "zh-CN") {
    if (!state.availableVoices.length) return null;
    if (state.store.settings.selectedVoice) {
      const chosen = state.availableVoices.find(v => v.name === state.store.settings.selectedVoice);
      if (chosen) return chosen;
    }
    const target = lang.toLowerCase();
    const base = target.split("-")[0];
    return state.availableVoices.find(v => v.lang.toLowerCase() === target) ||
      state.availableVoices.find(v => v.lang.toLowerCase().startsWith(base)) ||
      state.availableVoices.find(v => /chinese/i.test(v.name)) ||
      null;
  }

  function speakTextNative(text, { lang = "zh-CN", repeat = 1, delayMs = 400 }) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window) || !text) {
        resolve();
        return;
      }

      const voice = chooseVoice(lang);
      const volume = (state.store.settings.volume ?? 100) / 100;
      const rate = state.store.settings.speed ?? 0.85;

      let count = 0;
      function speakOnce() {
        if (count >= repeat) {
          resolve();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.volume = volume;
        utterance.rate = rate;
        if (voice) utterance.voice = voice;

        utterance.onend = () => {
          count += 1;
          if (count < repeat) {
            setTimeout(speakOnce, delayMs);
          } else {
            resolve();
          }
        };

        utterance.onerror = () => {
          // If error or cancelled, resolve to avoid hanging
          resolve();
        };

        activeUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      }

      speakOnce();
    });
  }

  function playOnlineAudioFallback(text, { lang = "zh-CN", repeat = 1, delayMs = 400 }) {
    return new Promise((resolve) => {
      const clean = encodeURIComponent(String(text || "").trim());
      const volume = (state.store.settings.volume ?? 100) / 100;
      const url = `https://dict.youdao.com/dictvoice?audio=${clean}&type=2`;

      let count = 0;
      function playNext() {
        if (count >= repeat) {
          resolve();
          return;
        }
        const audio = new Audio(url);
        activeAudioEl = audio;
        audio.volume = volume;
        audio.onended = () => {
          count += 1;
          if (count < repeat) {
            setTimeout(playNext, delayMs);
          } else {
            resolve();
          }
        };
        audio.onerror = () => {
          resolve(); // Resolve anyway on network or decode error
        };
        audio.play().catch(() => resolve());
      }
      playNext();
    });
  }

  async function speak(text, { lang = "zh-CN", repeat = 2 }) {
    stopAudio();
    if (!text || (state.store.settings.volume ?? 100) === 0) return;

    try {
      // Check if native speech synthesis has usable voice
      const voice = chooseVoice(lang);
      if (voice || "speechSynthesis" in window) {
        await speakTextNative(text, { lang, repeat });
      } else {
        await playOnlineAudioFallback(text, { lang, repeat });
      }
    } catch (err) {
      console.warn("Speech playback error:", err);
    }
  }

  async function playCardSequence(card) {
    if (!card) return;
    stopAudio();
    const wordText = card.speechText || card.front;
    const exampleText = card.example?.speechText || card.example?.text;

    // Word twice
    await speak(wordText, { lang: card.speechLang || "zh-CN", repeat: 2 });

    // Example sentence twice (if available)
    if (exampleText) {
      await new Promise(r => setTimeout(r, 450));
      await speak(exampleText, { lang: card.example?.speechLang || card.speechLang || "zh-CN", repeat: 2 });
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
  function buildMeaningQuiz(vocabulary, card) {
    const correctMeaning = String(card.meaning || "").trim();
    const uniqueDistractors = new Set();

    const candidates = vocabulary.filter(w => w.id !== card.id && w.meaning && w.meaning !== correctMeaning);
    // Shuffle candidates
    const shuffled = [...candidates].sort(() => 0.5 - Math.random());

    for (const item of shuffled) {
      const text = String(item.meaning || "").trim();
      if (text && text !== correctMeaning && !uniqueDistractors.has(text)) {
        uniqueDistractors.add(text);
        if (uniqueDistractors.size >= 2) break;
      }
    }

    const choices = [
      { id: "correct", text: correctMeaning, isCorrect: true },
      ...Array.from(uniqueDistractors).map((text, index) => ({
        id: `distractor-${index}`,
        text,
        isCorrect: false
      }))
    ].sort(() => 0.5 - Math.random());

    return { choices, correctMeaning };
  }

  /* -------------------------------------------------------------
     6. UI PRESENTATION & CARD RENDERING
  ------------------------------------------------------------- */
  function renderCard(card, { autoSpeak = true } = {}) {
    state.currentCard = card;
    state.quizAnswered = false;
    state.selectedChoiceId = null;
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

    // Term & Pinyin
    els.hanziTerm.textContent = card.front;
    els.pinyinReading.textContent = card.reading || "—";

    // Quiz Section
    state.currentQuiz = buildMeaningQuiz(state.activePack.cards, card);
    els.choicesGrid.innerHTML = "";
    els.revealedMeaning.hidden = true;
    els.quizPrompt.textContent = "Choose the correct meaning:";

    state.currentQuiz.choices.forEach((choice, index) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
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

    // Example Card
    if (card.example && card.example.text) {
      els.exampleCard.hidden = false;
      els.exampleHanzi.textContent = card.example.text;
      els.examplePinyin.textContent = card.example.reading || "";
      els.exampleEnglish.textContent = card.example.meaning || "";
    } else {
      els.exampleCard.hidden = true;
    }

    // Mark shown in SRS
    state.store.progress[card.id] = markShown(
      state.store.progress[card.id],
      state.store.settings.intervalMinutes
    );
    saveStoredState();

    updateDashboardCounts();

    // Auto audio
    if (autoSpeak && state.store.settings.autoSpeak) {
      playCardSequence(card);
    }
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

    // Show revealed meaning
    els.revealedMeaning.textContent = `Meaning: ${state.currentQuiz.correctMeaning}`;
    els.revealedMeaning.hidden = false;

    // Apply SRS algorithm
    const now = Date.now();
    const intervalMins = state.store.settings.intervalMinutes;
    if (choice.isCorrect) {
      state.store.progress[state.currentCard.id] = reviewRemember(
        state.store.progress[state.currentCard.id],
        intervalMins,
        now
      );
      showToast("Correct! SRS interval increased.");
    } else {
      state.store.progress[state.currentCard.id] = reviewForget(
        state.store.progress[state.currentCard.id],
        intervalMins,
        now
      );
      showToast("Incorrect. Word scheduled for review.");
    }

    saveStoredState();
    updateDashboardCounts();

    // Play word audio and sentence audio
    if (state.store.settings.autoSpeak) {
      playCardSequence(state.currentCard);
    }
  }

  function presentNextCard({ autoSpeak = true } = {}) {
    if (!state.activePack) return;
    state.store.lastCardId = state.currentCard ? state.currentCard.id : null;
    const nextCard = chooseNextCard(
      state.activePack.cards,
      state.store.progress,
      state.store.lastCardId,
      Date.now(),
      state.store.settings.intervalMinutes
    );
    renderCard(nextCard, { autoSpeak });
  }

  /* -------------------------------------------------------------
     7. MANUAL REVIEW CONTROLS
  ------------------------------------------------------------- */
  function setupActionButtons() {
    els.speakWordBtn.addEventListener("click", () => {
      if (state.currentCard) {
        speak(state.currentCard.speechText || state.currentCard.front, {
          lang: state.currentCard.speechLang || "zh-CN",
          repeat: 2
        });
      }
    });

    els.speakSentenceBtn.addEventListener("click", () => {
      if (state.currentCard?.example?.text) {
        speak(state.currentCard.example.speechText || state.currentCard.example.text, {
          lang: state.currentCard.example.speechLang || state.currentCard.speechLang || "zh-CN",
          repeat: 2
        });
      }
    });

    els.speakExampleBtn.addEventListener("click", () => {
      if (state.currentCard?.example?.text) {
        speak(state.currentCard.example.speechText || state.currentCard.example.text, {
          lang: state.currentCard.example.speechLang || state.currentCard.speechLang || "zh-CN",
          repeat: 2
        });
      }
    });

    els.newWordBtn.addEventListener("click", () => {
      if (!state.currentCard) return;
      const progress = normalizeProgress(state.store.progress[state.currentCard.id]);
      progress.lastReviewedAt = 0;
      progress.repetitions = 0;
      progress.intervalMinutes = 0;
      state.store.progress[state.currentCard.id] = progress;
      saveStoredState();
      updateDashboardCounts();
      showToast("Card status set to New Word");
      presentNextCard({ autoSpeak: true });
    });

    els.forgetBtn.addEventListener("click", () => {
      if (!state.currentCard) return;
      state.store.progress[state.currentCard.id] = reviewForget(
        state.store.progress[state.currentCard.id],
        state.store.settings.intervalMinutes
      );
      saveStoredState();
      updateDashboardCounts();
      showToast("Marked as Forget (interval reset)");
    });

    els.rememberBtn.addEventListener("click", () => {
      if (!state.currentCard) return;
      state.store.progress[state.currentCard.id] = reviewRemember(
        state.store.progress[state.currentCard.id],
        state.store.settings.intervalMinutes
      );
      saveStoredState();
      updateDashboardCounts();
      showToast("Marked as Remember (interval increased)");
    });

    els.nextCardBtn.addEventListener("click", () => {
      presentNextCard({ autoSpeak: true });
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
        renderCard(card, { autoSpeak: false });
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
  function scheduleNextReminder() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }

    if (!state.store.settings.reminderEnabled) {
      els.intervalTimerPill.classList.remove("active");
      els.timerStatusText.textContent = "Self-paced study";
      return;
    }

    const intervalMinutes = Math.max(1, Number(state.store.settings.intervalMinutes) || 15);
    const intervalMs = intervalMinutes * 60 * 1000;
    state.nextReminderTime = Date.now() + intervalMs;

    els.intervalTimerPill.classList.add("active");
    els.timerStatusText.textContent = `Next card in ${intervalMinutes}m`;

    state.timerId = setInterval(() => {
      triggerReminder();
    }, intervalMs);
  }

  function triggerReminder() {
    if (!state.activePack) return;
    presentNextCard({ autoSpeak: state.store.settings.autoSpeak });

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
    showToast("⏰ Reminder: Next card is due!");
    scheduleNextReminder();
  }

  /* -------------------------------------------------------------
     10. SETTINGS & DATA EXPORT / IMPORT
  ------------------------------------------------------------- */
  function setupSettings() {
    // Reminder switch
    els.reminderEnabled.checked = state.store.settings.reminderEnabled;
    els.reminderEnabled.addEventListener("change", (e) => {
      state.store.settings.reminderEnabled = e.target.checked;
      saveStoredState();
      scheduleNextReminder();
    });

    // Interval minutes
    els.intervalMinutesInput.value = state.store.settings.intervalMinutes;
    els.intervalMinutesInput.addEventListener("change", (e) => {
      state.store.settings.intervalMinutes = Math.max(1, Number(e.target.value) || 15);
      saveStoredState();
      if (state.store.settings.reminderEnabled) scheduleNextReminder();
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

    els.autoSpeakToggle.checked = state.store.settings.autoSpeak !== false;
    els.autoSpeakToggle.addEventListener("change", (e) => {
      state.store.settings.autoSpeak = e.target.checked;
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
      a.download = `vocabulary-srs-progress-${new Date().toISOString().slice(0, 10)}.json`;
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

        // Merge progress: handles both direct backup format and Edge extension storage dump
        const importedProgress = imported.progress || imported.chineseSrsBackupProgress || imported;
        if (typeof importedProgress === "object" && importedProgress !== null) {
          let count = 0;
          for (const [id, val] of Object.entries(importedProgress)) {
            if (val && typeof val === "object") {
              state.store.progress[id] = normalizeProgress(val);
              count += 1;
            }
          }
          saveStoredState();
          updateDashboardCounts();
          renderDeckList();
          showToast(`Successfully imported progress for ${count} cards!`);
        } else {
          throw new Error("Invalid progress backup format.");
        }
      } catch (err) {
        alert(`Failed to import file: ${err.message}`);
      } finally {
        els.importFileInput.value = "";
      }
    });

    // Reset Progress Modal
    els.resetDataBtn.addEventListener("click", () => {
      els.resetModal.hidden = false;
    });

    els.cancelResetBtn.addEventListener("click", () => {
      els.resetModal.hidden = true;
    });

    els.confirmResetBtn.addEventListener("click", () => {
      state.store.progress = {};
      state.store.currentCardId = null;
      state.store.lastCardId = null;
      saveStoredState();
      updateDashboardCounts();
      renderDeckList();
      presentNextCard({ autoSpeak: false });
      els.resetModal.hidden = true;
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
      if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
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
            speak(state.currentCard.speechText || state.currentCard.front, { repeat: 1 });
          }
        } else {
          // Advance to next card
          presentNextCard({ autoSpeak: true });
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
     12. INITIALIZATION
  ------------------------------------------------------------- */
  async function init() {
    loadStoredState();
    initTheme();
    setupActionButtons();
    setupDeckBrowser();
    setupSettings();
    setupTabs();
    setupKeyboardShortcuts();

    try {
      const response = await fetch("vocabulary.json");
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
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
          saveStoredState();
          updateDashboardCounts();
          renderDeckList();
          presentNextCard({ autoSpeak: false });
        }
      });

      // Show initial card
      let initialCard = null;
      if (state.store.currentCardId) {
        initialCard = state.activePack.cards.find(c => c.id === state.store.currentCardId);
      }
      if (!initialCard) {
        initialCard = chooseNextCard(
          state.activePack.cards,
          state.store.progress,
          null,
          Date.now(),
          state.store.settings.intervalMinutes
        );
      }

      renderCard(initialCard, { autoSpeak: false });
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
