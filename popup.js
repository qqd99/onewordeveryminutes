const els = {
  startStop: document.querySelector("#startStop"),
  runningBadge: document.querySelector("#runningBadge"),
  startHint: document.querySelector("#startHint"),
  pack: document.querySelector("#pack"),
  intervalMinutes: document.querySelector("#intervalMinutes"),
  autoHideSeconds: document.querySelector("#autoHideSeconds"),
  closeAfterAnswer: document.querySelector("#closeAfterAnswer"),
  volumePercent: document.querySelector("#volumePercent"),
  volumeValue: document.querySelector("#volumeValue"),
  autoSpeak: document.querySelector("#autoSpeak"),
  save: document.querySelector("#save"),
  term: document.querySelector("#term"),
  reading: document.querySelector("#reading"),
  meaningPrompt: document.querySelector("#meaningPrompt"),
  meaningChoices: document.querySelector("#meaningChoices"),
  meaning: document.querySelector("#meaning"),
  exampleLabel: document.querySelector("#exampleLabel"),
  exampleText: document.querySelector("#exampleText"),
  exampleReading: document.querySelector("#exampleReading"),
  exampleMeaning: document.querySelector("#exampleMeaning"),
  stageLabel: document.querySelector("#stageLabel"),
  feedback: document.querySelector("#feedback"),
  manualReviewPanel: document.querySelector("#manualReviewPanel"),
  newWord: document.querySelector("#newWord"),
  remember: document.querySelector("#remember"),
  forget: document.querySelector("#forget"),
  speakWord: document.querySelector("#speakWord"),
  speakSentence: document.querySelector("#speakSentence"),
  speechStatus: document.querySelector("#speechStatus"),
  wordStat: document.querySelector("#wordStat"),
  reviewedStat: document.querySelector("#reviewedStat"),
  newStat: document.querySelector("#newStat"),
  dueStat: document.querySelector("#dueStat"),
  rememberedStat: document.querySelector("#rememberedStat"),
  nextReminder: document.querySelector("#nextReminder"),
  vocabularyStatus: document.querySelector("#vocabularyStatus"),
  dataStatus: document.querySelector("#dataStatus"),
  showNow: document.querySelector("#showNow"),
  reset: document.querySelector("#reset")
};

let currentCard = null;
let remindersRunning = false;
let reviewedThisSlot = false;
let currentRating = null;
let currentQuiz = null;
let renderedCardId = null;
let refreshTimer = null;
let refreshInFlight = false;
let popupSurfaceToken = null;

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.ok === false) {
        reject(new Error(response?.error || "The extension did not respond."));
        return;
      }
      resolve(response);
    });
  });
}

async function activatePopupSurface() {
  const result = await sendMessage({
    type: "ACTIVATE_REVIEW_SURFACE",
    surface: "popup"
  });
  popupSurfaceToken = result.surface?.token || null;
  return result.surface || null;
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function renderPackOptions(packs, activePackId) {
  const selectedBefore = els.pack.value;
  els.pack.replaceChildren();
  for (const pack of packs || []) {
    const option = document.createElement("option");
    option.value = pack.id;
    option.textContent = `${pack.name} (${Number(pack.count).toLocaleString()})`;
    els.pack.appendChild(option);
  }
  els.pack.value = activePackId || selectedBefore || packs?.[0]?.id || "";
}

function renderRunningState(data) {
  const settings = data?.settings || { enabled: false, intervalMinutes: 30, autoHideSeconds: 10 };
  remindersRunning = Boolean(settings.enabled);
  els.runningBadge.textContent = remindersRunning ? "RUNNING" : "STOPPED";
  els.runningBadge.classList.toggle("running", remindersRunning);
  els.runningBadge.classList.toggle("stopped", !remindersRunning);
  els.startStop.textContent = remindersRunning
    ? "Stop reminders"
    : "Start reminders";
  els.startStop.classList.toggle("stop", remindersRunning);
  const displayMinutes = Number(settings.intervalMinutes) || 30;
  els.startHint.textContent = remindersRunning
    ? `Next display: ${formatDate(data?.currentCardExpiresAt)}. One card appears every ${displayMinutes} minute${displayMinutes === 1 ? "" : "s"}; each word keeps its own adaptive review date.`
    : `The displayed word and sentence stay fixed while stopped. Choose x minutes, then press Start.`;
}

function confirmationMessage(rating, { corrected = false, alreadyReviewed = false } = {}) {
  const prefix = corrected ? "Changed to" : alreadyReviewed ? "Still marked" : "Marked";
  if (rating === "new") {
    return `${prefix} New Word. It stays unreviewed; the schedule will introduce another card automatically.`;
  }
  if (rating === "remember") {
    return `${prefix} Remember. This word’s own review interval was increased automatically.`;
  }
  if (rating === "forget") {
    return `${prefix} Forget. This word becomes eligible again at the next display opportunity.`;
  }
  return "Choose New Word, Forget, or Remember for this card.";
}

function renderReviewState({ preserveFeedback = false } = {}) {
  const canCorrect = Boolean(currentCard && currentQuiz?.answered);
  els.manualReviewPanel.hidden = !canCorrect;
  els.newWord.disabled = !canCorrect;
  els.remember.disabled = !canCorrect;
  els.forget.disabled = !canCorrect;
  els.newWord.classList.toggle("selected", currentRating === "new");
  els.remember.classList.toggle("selected", currentRating === "remember");
  els.forget.classList.toggle("selected", currentRating === "forget");

  if (currentRating === "new") els.stageLabel.textContent = "NEW WORD";
  else if (currentRating === "remember") els.stageLabel.textContent = "REVIEW";
  else if (currentRating === "forget") els.stageLabel.textContent = "LEARNING";

  if (!preserveFeedback && !els.feedback.textContent.trim() && currentQuiz?.answered && currentRating) {
    els.feedback.textContent = currentQuiz.correct === true
      ? "Correct. This word was marked Remember."
      : currentQuiz.correct === false
        ? "Incorrect. This word was marked Forget; the correct meaning is shown."
        : confirmationMessage(currentRating, { alreadyReviewed: true });
  }
}

function renderMeaningQuiz() {
  els.meaningChoices.replaceChildren();
  const quiz = currentQuiz || { choices: [] };
  const answered = Boolean(quiz.answered);
  els.meaningPrompt.textContent = answered ? "Answer result" : "Choose the correct meaning";
  els.meaning.hidden = !answered;
  els.meaning.textContent = answered && currentCard ? `Meaning: ${currentCard.meaning}` : "";
  if (currentCard?.example?.meaning) {
    els.exampleMeaning.hidden = !answered;
  }

  for (const choice of quiz.choices || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "meaning-choice";
    button.textContent = choice.text;
    button.dataset.choiceId = choice.id;
    button.disabled = answered || !currentCard;
    if (answered) {
      button.classList.toggle("correct", choice.id === quiz.correctChoiceId);
      button.classList.toggle("wrong", choice.id === quiz.selectedChoiceId && choice.id !== quiz.correctChoiceId);
      button.classList.toggle("dimmed", choice.id !== quiz.selectedChoiceId && choice.id !== quiz.correctChoiceId);
    }
    button.addEventListener("click", () => answerMeaning(choice.id));
    els.meaningChoices.appendChild(button);
  }
}

function setQuizBusy(busy) {
  for (const button of els.meaningChoices.querySelectorAll("button")) {
    button.disabled = busy || Boolean(currentQuiz?.answered);
  }
}

async function answerMeaning(choiceId) {
  if (!currentCard || currentQuiz?.answered) return;
  setQuizBusy(true);
  els.feedback.textContent = "Checking your answer…";
  try {
    const result = await sendMessage({
      type: "ANSWER_MEANING_QUIZ",
      cardId: currentCard.id,
      choiceId
    });
    currentQuiz = result.quiz;
    currentRating = result.currentRating || result.quiz?.rating || (result.quiz?.correct ? "remember" : "forget");
    reviewedThisSlot = true;
    renderMeaningQuiz();
    renderReviewState({ preserveFeedback: true });
    els.feedback.textContent = result.quiz?.correct
      ? "Correct. This word was marked Remember."
      : "Incorrect. This word was marked Forget; the correct meaning is now shown.";
  } catch (error) {
    els.feedback.textContent = error.message;
    setQuizBusy(false);
  }
}

function renderDashboard(data) {
  const settings = data?.settings || {
    enabled: false,
    intervalMinutes: 30,
    autoHideSeconds: 10,
    autoSpeak: true,
    activePackId: null
  };
  const vocabulary = data?.vocabulary || {};
  const packs = Array.isArray(vocabulary.packs) ? vocabulary.packs : [];
  const activePackId = vocabulary.pack?.id || settings.activePackId || packs[0]?.id || "";
  const pack = vocabulary.pack || packs.find((item) => item?.id === activePackId) || packs[0] || {
    id: activePackId,
    name: "Vocabulary",
    speechLang: "the selected language"
  };
  const card = data?.card || null;

  if (!card?.id) {
    currentCard = null;
    reviewedThisSlot = false;
    currentRating = null;
    currentQuiz = null;
    els.term.textContent = "Loading…";
    els.reading.textContent = "";
    els.reading.hidden = true;
    els.meaningPrompt.textContent = "Preparing meaning quiz";
    els.meaningChoices.replaceChildren();
    els.meaning.textContent = "";
    els.meaning.hidden = true;
    els.manualReviewPanel.hidden = true;
    els.exampleLabel.textContent = "COMMON SENTENCE";
    els.exampleText.textContent = "Loading example…";
    els.exampleReading.textContent = "";
    els.exampleReading.hidden = true;
    els.exampleMeaning.textContent = "";
    els.exampleMeaning.hidden = true;
    els.speakWord.disabled = true;
    els.speakSentence.disabled = true;
    els.newWord.disabled = true;
    els.remember.disabled = true;
    els.forget.disabled = true;
    throw new Error("No current vocabulary card was returned. Reload the extension once to repair it.");
  }

  const cardChanged = Boolean(renderedCardId && renderedCardId !== card.id);
  renderedCardId = card.id;
  currentCard = card;
  reviewedThisSlot = Boolean(data.reviewedThisSlot);
  currentRating = data.currentRating || null;
  currentQuiz = data.quiz || { choices: [], answered: false };
  if (cardChanged) {
    els.feedback.textContent = "A new interval started. This is the current card.";
  }
  const example = card.example || {};

  els.term.textContent = card.front || "";
  els.reading.textContent = card.reading || "";
  els.reading.hidden = !card.reading;
  renderMeaningQuiz();
  els.exampleLabel.textContent = (card.exampleLabel || pack.exampleLabel || "Common sentence").toUpperCase();
  els.exampleText.textContent = example.text || "No example sentence yet.";
  els.exampleReading.textContent = example.reading || "";
  els.exampleReading.hidden = !example.reading;
  els.exampleMeaning.textContent = example.meaning || "";
  els.exampleMeaning.hidden = !example.meaning || !currentQuiz?.answered;
  els.speakWord.disabled = false;
  els.speakSentence.disabled = !example.text;

  els.stageLabel.textContent = data.cardProgress?.lastReviewedAt
    ? (Number(data.cardProgress?.repetitions) > 0 ? "REVIEW" : "LEARNING")
    : "NEW WORD";
  els.intervalMinutes.value = Number(settings.intervalMinutes) || 30;
  els.autoHideSeconds.value = Number(settings.autoHideSeconds) || 10;
  els.closeAfterAnswer.checked = settings.closeAfterAnswer !== false;
  els.volumePercent.value = Math.min(100, Math.max(0, Number(settings.volumePercent ?? 100)));
  els.volumeValue.textContent = `${Math.round(Number(els.volumePercent.value) || 0)}%`;
  els.autoSpeak.checked = settings.autoSpeak !== false;
  renderPackOptions(packs, activePackId);

  els.wordStat.textContent = Number(data.stats?.total ?? vocabulary.count ?? 0).toLocaleString();
  els.reviewedStat.textContent = Number(data.stats?.reviewed || 0).toLocaleString();
  els.newStat.textContent = Number(data.stats?.newWords ?? Math.max(0, Number(data.stats?.total || 0) - Number(data.stats?.reviewed || 0))).toLocaleString();
  els.dueStat.textContent = Number(data.stats?.dueNow || 0).toLocaleString();
  els.rememberedStat.textContent = Number(data.stats?.rememberedClicks || 0).toLocaleString();

  renderRunningState({ ...data, settings });
  renderReviewState({ preserveFeedback: cardChanged });

  const autoHideSeconds = Number(settings.autoHideSeconds) || 10;
  const displayMinutes = Number(settings.intervalMinutes) || 30;
  els.nextReminder.textContent = settings.enabled
    ? `Next card: ${formatDate(data.nextReminderAt)}. Display cadence: every ${displayMinutes} minute${displayMinutes === 1 ? "" : "s"}. Word review dates adjust automatically.`
    : "Reminders have not started.";

  const vocabularyCount = Number(vocabulary.count ?? data.stats?.total ?? 0);
  els.vocabularyStatus.textContent =
    `Loaded from vocabulary.json: ${pack.name || "Vocabulary"}, ${vocabularyCount.toLocaleString()} words with example sentences.`;
  const answerCloseText = settings.closeAfterAnswer !== false
    ? "Answered cards reveal the result and close immediately."
    : "Answered cards stay open until you close them.";
  els.speechStatus.textContent =
    `Automatic audio: word ×2, then sentence ×2 in ${pack.speechLang || "the selected language"} at ${Math.round(Number(settings.volumePercent ?? 100))}% volume. Unanswered cards use the saved countdown after playback; ${answerCloseText}`;

  if (data.dataProtection?.syncBackedUp) {
    els.dataStatus.textContent =
      `Progress protected locally and backed up: ${formatDate(data.dataProtection.lastBackupAt)}.`;
  } else {
    const detail = data.dataProtection?.backupError
      ? ` ${data.dataProtection.backupError}`
      : " Edge will retry automatically.";
    els.dataStatus.textContent =
      `Progress protected locally; synchronized backup is pending.${detail}`;
  }
}

async function refresh({ retry = true } = {}) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const data = await sendMessage({ type: "GET_DASHBOARD" });
    renderDashboard(data);
  } catch (error) {
    if (retry && /undefined|current vocabulary card|did not respond/i.test(error.message)) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      refreshInFlight = false;
      return refresh({ retry: false });
    }
    throw error;
  } finally {
    refreshInFlight = false;
  }
}

function scheduleDashboardRefresh(delay = 60) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refresh({ retry: false }).catch((error) => {
      els.feedback.textContent = error.message;
    });
  }, delay);
}

function setReviewBusy(busy) {
  els.newWord.disabled = busy || !currentCard;
  els.remember.disabled = busy || !currentCard;
  els.forget.disabled = busy || !currentCard;
}

async function submitReview(rating) {
  if (!currentCard) return;
  setReviewBusy(true);
  els.feedback.textContent = "";
  try {
    const result = await sendMessage({
      type: "REVIEW_CARD",
      cardId: currentCard.id,
      rating
    });
    reviewedThisSlot = true;
    currentRating = result.currentRating || rating;
    renderReviewState({ preserveFeedback: true });
    els.feedback.textContent = confirmationMessage(currentRating, {
      corrected: result.corrected === true,
      alreadyReviewed: result.alreadyReviewed === true && result.corrected !== true
    });
  } catch (error) {
    els.feedback.textContent = error.message;
  } finally {
    setReviewBusy(false);
  }
}

async function speakPart(part, button, label) {
  if (!currentCard) return;
  button.disabled = true;
  try {
    const result = await sendMessage({
      type: "SPEAK_CARD",
      cardId: currentCard.id,
      part,
      repeat: 2,
      volumePercent: selectedVolumePercent()
    });
    const engine = result.speech?.engine || "background audio";
    els.feedback.textContent = `${label} queued twice.`;
    els.speechStatus.textContent = `Audio request accepted: ${engine}.`;
  } catch (error) {
    els.feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

els.newWord.addEventListener("click", () => submitReview("new"));
els.remember.addEventListener("click", () => submitReview("remember"));
els.forget.addEventListener("click", () => submitReview("forget"));
els.speakWord.addEventListener("click", () => speakPart("word", els.speakWord, "Word"));
els.speakSentence.addEventListener("click", () => speakPart("example", els.speakSentence, "Sentence"));

function selectedIntervalMinutes() {
  return Math.min(1440, Math.max(1, Math.round(Number(els.intervalMinutes.value) || 30)));
}

function selectedAutoHideSeconds() {
  return Math.min(300, Math.max(5, Number(els.autoHideSeconds.value) || 10));
}

function selectedVolumePercent() {
  return Math.min(100, Math.max(0, Math.round(Number(els.volumePercent.value) || 0)));
}

function selectedSettings() {
  return {
    intervalMinutes: selectedIntervalMinutes(),
    autoHideSeconds: selectedAutoHideSeconds(),
    closeAfterAnswer: els.closeAfterAnswer.checked,
    volumePercent: selectedVolumePercent(),
    autoSpeak: els.autoSpeak.checked,
    activePackId: els.pack.value
  };
}

els.startStop.addEventListener("click", async () => {
  els.startStop.disabled = true;
  els.feedback.textContent = remindersRunning
    ? "Stopping reminders…"
    : `Starting reminders every ${selectedIntervalMinutes()} minutes…`;

  try {
    if (remindersRunning) {
      await sendMessage({ type: "STOP_REMINDERS" });
      els.feedback.textContent = "Reminders stopped. The current card remains fixed.";
    } else {
      const result = await sendMessage({
        type: "START_REMINDERS",
        settings: selectedSettings()
      });
      const interval = Number(result.settings?.intervalMinutes) || 30;
      els.feedback.textContent =
        `Started ${result.activePack}. One card will appear every ${interval} minute${interval === 1 ? "" : "s"}; each word’s repetition interval will adapt automatically.`;
    }
    await refresh();
  } catch (error) {
    els.feedback.textContent = error.message;
  } finally {
    els.startStop.disabled = false;
  }
});

els.save.addEventListener("click", async () => {
  els.save.disabled = true;
  try {
    const result = await sendMessage({
      type: "SAVE_SETTINGS",
      settings: selectedSettings()
    });
    els.feedback.textContent = remindersRunning
      ? `Settings saved. ${result.activePack} will appear every ${Number(result.settings?.intervalMinutes) || 30} minutes.`
      : `Settings saved. ${result.activePack} is active; press Start when ready.`;
    await refresh();
  } catch (error) {
    els.feedback.textContent = error.message;
  } finally {
    els.save.disabled = false;
  }
});

els.pack.addEventListener("change", () => {
  els.feedback.textContent = "Press Save settings to switch vocabulary packs.";
});

els.volumePercent.addEventListener("input", () => {
  els.volumeValue.textContent = `${selectedVolumePercent()}%`;
});

els.showNow.addEventListener("click", async () => {
  els.showNow.disabled = true;
  try {
    const result = await sendMessage({ type: "PLAY_NOW" });
    els.feedback.textContent = result.card
      ? result.overlay?.shown
        ? `The current card is showing. If unanswered, its ${selectedAutoHideSeconds()}-second countdown begins after audio; ${els.closeAfterAnswer.checked ? "after an answer it reveals the result and closes immediately" : "after an answer it stays open until you close it"}.`
        : `Audio started at ${selectedVolumePercent()}% volume. Open a normal website tab to see the card; your saved close behavior applies after answering.`
      : "No word was available.";
    await refresh();
  } catch (error) {
    els.feedback.textContent = error.message;
  } finally {
    els.showNow.disabled = false;
  }
});

els.reset.addEventListener("click", async () => {
  const confirmed = confirm("Reset spaced-repetition progress for all vocabulary packs?");
  if (!confirmed) return;
  try {
    await sendMessage({ type: "RESET_PROGRESS" });
    els.feedback.textContent = "Progress reset. A new fixed card was selected.";
    await refresh();
  } catch (error) {
    els.feedback.textContent = error.message;
  }
});

const LIVE_REFRESH_KEYS = new Set([
  "currentCardId",
  "currentCardChangedAt",
  "currentCardExpiresAt",
  "currentSlotToken",
  "currentReviewDecision",
  "progress",
  "settings"
]);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  const surface = changes.activeReviewSurface?.newValue;
  if (surface?.kind === "web" && surface.token !== popupSurfaceToken) {
    // A webpage card opened after this toolbar popup. The newest review
    // surface wins, so close this popup rather than showing two copies.
    window.close();
    return;
  }

  if (Object.keys(changes).some((key) => LIVE_REFRESH_KEYS.has(key))) {
    scheduleDashboardRefresh();
  }
});

window.addEventListener("focus", () => scheduleDashboardRefresh(0));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleDashboardRefresh(0);
});

activatePopupSurface()
  .then(() => refresh())
  .catch((error) => {
    els.feedback.textContent = error.message;
  });
