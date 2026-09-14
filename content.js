(() => {
  if (globalThis.__vocabularySrsContentLoaded) return;
  globalThis.__vocabularySrsContentLoaded = true;

  const HOST_ID = "vocabulary-srs-edge-overlay-host";
  const DEFAULT_AUTO_HIDE_MS = 10000;
  let currentAutoHideMs = DEFAULT_AUTO_HIDE_MS;
  let autoHideTimer = null;
  let speechWaitTimer = null;
  let currentCardId = null;
  let currentSlotToken = null;
  let speechPending = false;
  let answerChosen = false;
  let closeAfterAnswer = true;

  function clearAutoHideTimer() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  function clearSpeechWaitTimer() {
    if (speechWaitTimer) {
      clearTimeout(speechWaitTimer);
      speechWaitTimer = null;
    }
  }

  function clearPresentationLock() {
    const root = document.documentElement;
    root?.removeAttribute("data-vocabulary-srs-slot-token");
    root?.removeAttribute("data-vocabulary-srs-shown-at");
  }

  function removeExisting({ clearLock = false } = {}) {
    clearAutoHideTimer();
    clearSpeechWaitTimer();
    currentCardId = null;
    currentSlotToken = null;
    speechPending = false;
    answerChosen = false;
    closeAfterAnswer = true;
    document.getElementById(HOST_ID)?.remove();
    if (clearLock) clearPresentationLock();
  }

  function activeAutoHideMs() {
    // Answered cards never use an automatic countdown. If closeAfterAnswer is
    // enabled they are closed immediately by revealQuiz(); otherwise they stay
    // open until the user closes them or a later interval replaces them.
    if (answerChosen) return 0;
    return currentAutoHideMs;
  }

  function closeAnsweredCardImmediately() {
    if (!closeAfterAnswer) return;
    clearAutoHideTimer();
    clearSpeechWaitTimer();
    // Give the browser one paint so the correct/wrong result and revealed
    // meaning are committed visually, then remove the reminder without a
    // fixed delay. Background audio may continue independently.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (answerChosen) removeExisting();
      });
    });
  }

  function resetAutoHideTimer() {
    clearAutoHideTimer();
    clearSpeechWaitTimer();
    if (speechPending) return;
    const duration = activeAutoHideMs();
    if (duration <= 0) return;
    autoHideTimer = setTimeout(removeExisting, duration);
  }

  function pauseAutoHideForSpeech() {
    speechPending = true;
    clearAutoHideTimer();
    clearSpeechWaitTimer();
    speechWaitTimer = setTimeout(() => {
      speechPending = false;
      resetAutoHideTimer();
    }, 90000);
  }

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

  function showCard(card, slotToken = null, suppressWindowMs = 60000, autoHideMs = DEFAULT_AUTO_HIDE_MS, waitForSpeech = true, shouldCloseAfterAnswer = true) {
    currentAutoHideMs = Math.min(300000, Math.max(5000, Number(autoHideMs) || DEFAULT_AUTO_HIDE_MS));
    const autoHideSeconds = Math.round(currentAutoHideMs / 1000);
    const root = document.documentElement;
    const now = Date.now();
    const previousToken = root?.getAttribute("data-vocabulary-srs-slot-token") || "";
    const previousShownAt = Number(root?.getAttribute("data-vocabulary-srs-shown-at")) || 0;

    if (slotToken && previousToken === slotToken) return { shown: false, duplicate: true };
    if (previousShownAt && now - previousShownAt < Math.max(5000, Number(suppressWindowMs) || 60000)) {
      return { shown: false, duplicate: true };
    }

    root?.setAttribute("data-vocabulary-srs-slot-token", String(slotToken || now));
    root?.setAttribute("data-vocabulary-srs-shown-at", String(now));
    removeExisting();
    currentCardId = card.id;
    currentSlotToken = String(slotToken || now);
    speechPending = Boolean(waitForSpeech);
    answerChosen = false;
    closeAfterAnswer = shouldCloseAfterAnswer !== false;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all:initial;position:fixed;top:20px;right:20px;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    const wrapper = document.createElement("section");
    wrapper.setAttribute("role", "dialog");
    wrapper.setAttribute("aria-label", `${card.packName || "Vocabulary"} meaning quiz`);
    wrapper.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel { width:min(410px,calc(100vw - 32px));padding:16px;color:#172033;background:#fff;border:1px solid rgba(15,23,42,.14);border-radius:16px;box-shadow:0 18px 50px rgba(15,23,42,.24);font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif; }
        .top { display:flex;align-items:center;justify-content:space-between;gap:12px; }
        .label { color:#667085;font-size:11px;font-weight:800;letter-spacing:.06em; }
        .stage { margin-left:6px;padding:3px 7px;border-radius:999px;color:#475467;background:#f2f4f7;font-size:10px;font-weight:800;letter-spacing:.05em; }
        .close { border:0;background:transparent;color:#667085;font-size:20px;line-height:1;cursor:pointer; }
        .term { margin-top:7px;text-align:center;font-size:45px;font-weight:750;line-height:1.12;overflow-wrap:anywhere; }
        .reading { margin-top:5px;text-align:center;color:#3659d9;font-size:17px;font-weight:650; }
        .prompt { margin:12px 0 7px;text-align:center;color:#475467;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase; }
        .choices { display:grid;gap:7px; }
        .choice { width:100%;min-height:42px;padding:9px 11px;text-align:left;color:#344054;background:#fff;border:1px solid #d0d5dd;border-radius:10px;font:650 13px/1.35 "Segoe UI",sans-serif;cursor:pointer; }
        .choice:hover:not(:disabled) { border-color:#8098eb;background:#f8f9ff; }
        .choice.correct { color:#067647;background:#ecfdf3;border-color:#75e0a7; }
        .choice.wrong { color:#b42318;background:#fff1f0;border-color:#f4aaa5; }
        .choice.dimmed { opacity:.62; }
        .meaning { margin:9px 4px 0;padding:9px;text-align:center;color:#344054;background:#f2f4f7;border-radius:10px;font-size:14px;font-weight:650;line-height:1.4; }
        .meaning[hidden] { display:none; }
        .hear-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px; }
        .hear { min-height:35px;color:#3659d9;background:#f5f7ff;border:1px solid #cbd5ff;border-radius:9px;font:700 12px "Segoe UI",sans-serif;cursor:pointer; }
        .example { margin-top:13px;padding:12px;background:#f8fafc;border:1px solid #e4e7ec;border-radius:12px; }
        .example-label { color:#667085;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase; }
        .example-text { margin-top:5px;color:#172033;font-size:20px;font-weight:700;line-height:1.35;text-align:center; }
        .example-reading { margin-top:4px;color:#4965d6;font-size:13px;line-height:1.35;text-align:center; }
        .example-meaning { margin-top:5px;color:#475467;font-size:12px;line-height:1.4;text-align:center; }
        .status { min-height:17px;margin:9px 0 0;text-align:center;color:#3659d9;font-size:11px;line-height:1.35; }
        button:disabled { cursor:default; }
      </style>
      <div class="panel">
        <div class="top"><div><span class="label"></span><span class="stage"></span></div><button class="close" type="button" aria-label="Close">×</button></div>
        <div class="term"></div>
        <div class="reading"></div>
        <div class="prompt">Choose the correct meaning</div>
        <div class="choices"></div>
        <div class="meaning" hidden></div>
        <div class="hear-grid">
          <button class="hear hear-word" type="button">🔊 Hear word</button>
          <button class="hear hear-sentence" type="button">🔊 Hear sentence</button>
        </div>
        <div class="example">
          <div class="example-label"></div>
          <div class="example-text"></div>
          <div class="example-reading"></div>
          <div class="example-meaning"></div>
        </div>
        <p class="status" role="status"></p>
      </div>`;

    wrapper.querySelector(".label").textContent = (card.packName || "VOCABULARY SRS").toUpperCase();
    wrapper.querySelector(".stage").textContent = card.stageLabel || "NEW WORD";
    wrapper.querySelector(".term").textContent = card.front;
    const readingElement = wrapper.querySelector(".reading");
    readingElement.textContent = card.reading || "";
    readingElement.hidden = !card.reading;

    const meaningElement = wrapper.querySelector(".meaning");
    const choicesElement = wrapper.querySelector(".choices");
    const quiz = card.quiz || { choices: [] };
    const choiceButtons = new Map();
    for (const choice of quiz.choices || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.dataset.choiceId = choice.id;
      button.textContent = choice.text;
      choicesElement.appendChild(button);
      choiceButtons.set(choice.id, button);
    }

    const example = card.example || {};
    wrapper.querySelector(".example-label").textContent = card.exampleLabel || "Common sentence";
    wrapper.querySelector(".example-text").textContent = example.text || "No example sentence yet.";
    const exampleReading = wrapper.querySelector(".example-reading");
    exampleReading.textContent = example.reading || "";
    exampleReading.hidden = !example.reading;
    const exampleMeaning = wrapper.querySelector(".example-meaning");
    exampleMeaning.textContent = example.meaning || "";
    exampleMeaning.hidden = true;

    const status = wrapper.querySelector(".status");
    status.textContent = waitForSpeech
      ? `Listen, then choose a meaning. The ${autoHideSeconds}-second countdown starts after audio finishes.`
      : `Choose a meaning. This card closes in ${autoHideSeconds} seconds.`;
    const hearWord = wrapper.querySelector(".hear-word");
    const hearSentence = wrapper.querySelector(".hear-sentence");
    hearSentence.disabled = !example.text;
    wrapper.querySelector(".close").addEventListener("click", removeExisting);

    function revealQuiz(resultQuiz) {
      answerChosen = true;
      const selectedId = resultQuiz?.selectedChoiceId || null;
      const correctId = resultQuiz?.correctChoiceId || quiz.correctChoiceId;
      const wasCorrect = resultQuiz?.correct === true;
      for (const [id, button] of choiceButtons) {
        button.disabled = true;
        button.classList.toggle("correct", id === correctId);
        button.classList.toggle("wrong", id === selectedId && id !== correctId);
        button.classList.toggle("dimmed", id !== selectedId && id !== correctId);
      }
      meaningElement.textContent = `Meaning: ${card.meaning}`;
      meaningElement.hidden = false;
      exampleMeaning.hidden = !example.meaning;
      wrapper.querySelector(".stage").textContent = wasCorrect ? "REVIEW" : "LEARNING";
      if (!closeAfterAnswer) {
        status.textContent = wasCorrect
          ? "Correct — marked Remember. This card will stay open until you close it."
          : "Incorrect — marked Forget. Correct meaning shown above; this card will stay open until you close it.";
      } else {
        status.textContent = wasCorrect
          ? "Correct — marked Remember."
          : "Incorrect — marked Forget. Correct meaning shown above.";
        closeAnsweredCardImmediately();
      }
      if (!closeAfterAnswer && !speechPending) resetAutoHideTimer();
    }

    async function answer(choiceId) {
      for (const button of choiceButtons.values()) button.disabled = true;
      status.textContent = "Checking your answer…";
      try {
        const result = await sendMessage({
          type: "ANSWER_MEANING_QUIZ",
          cardId: card.id,
          choiceId
        });
        revealQuiz(result.quiz);
      } catch (error) {
        status.textContent = error.message;
        for (const button of choiceButtons.values()) button.disabled = false;
        if (!speechPending) resetAutoHideTimer();
      }
    }

    for (const [choiceId, button] of choiceButtons) {
      button.addEventListener("click", () => answer(choiceId));
    }

    async function hear(button, part, label) {
      button.disabled = true;
      pauseAutoHideForSpeech();
      status.textContent = `Reading the ${label} twice…`;
      try {
        await sendMessage({
          type: "SPEAK_CARD",
          cardId: card.id,
          part,
          repeat: 2,
          startCountdownAfterSpeech: true,
          slotToken: currentSlotToken
        });
        status.textContent = answerChosen
          ? `${label[0].toUpperCase()}${label.slice(1)} is playing twice. This card will stay open after it finishes.`
          : `${label[0].toUpperCase()}${label.slice(1)} is playing twice. The normal countdown restarts after it finishes.`;
      } catch (error) {
        speechPending = false;
        status.textContent = `${error.message} The countdown has started.`;
        resetAutoHideTimer();
      } finally {
        button.disabled = false;
      }
    }

    hearWord.addEventListener("click", () => hear(hearWord, "word", "word"));
    hearSentence.addEventListener("click", () => hear(hearSentence, "example", "sentence"));

    shadow.appendChild(wrapper);
    (document.documentElement || document.body).appendChild(host);

    if (waitForSpeech) pauseAutoHideForSpeech();
    if (quiz.answered) revealQuiz(quiz);
    else if (!waitForSpeech) resetAutoHideTimer();

    return { shown: true, duplicate: false, autoHideMs: currentAutoHideMs, waitingForSpeech: waitForSpeech };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CLOSE_VOCAB_SRS_CARD") {
      removeExisting({ clearLock: message.clearPresentationLock === true });
      sendResponse({ ok: true, closed: true });
      return false;
    }

    if (message?.type === "SHOW_VOCAB_SRS_CARD" && message.card) {
      const result = showCard(
        message.card,
        message.slotToken || null,
        message.suppressWindowMs,
        message.autoHideMs,
        message.waitForSpeech !== false,
        message.closeAfterAnswer !== false
      );
      sendResponse({ ok: true, ...result });
      return false;
    }

    if (message?.type === "START_VOCAB_SRS_COUNTDOWN") {
      const tokenMatches = !message.slotToken || String(message.slotToken) === String(currentSlotToken);
      const cardMatches = !message.cardId || String(message.cardId) === String(currentCardId);
      if (!document.getElementById(HOST_ID) || !tokenMatches || !cardMatches) {
        sendResponse({ ok: true, started: false, reason: "card-not-active" });
        return false;
      }

      speechPending = false;
      clearSpeechWaitTimer();
      const host = document.getElementById(HOST_ID);
      const status = host?.shadowRoot?.querySelector(".status");
      const countdownMs = activeAutoHideMs();
      const seconds = Math.round(countdownMs / 1000);
      if (status) {
        if (answerChosen) {
          // An answered card with immediate-close enabled should already be gone.
          // If it remains because auto-close is disabled, keep it open.
          status.textContent = message.speechOk === false
            ? "Audio ended with a problem. Your answer is saved; this card will stay open."
            : "All reading finished. Your answer is saved; this card will stay open.";
        } else if (!host?.shadowRoot?.querySelector(".meaning:not([hidden])")) {
          status.textContent = message.speechOk === false
            ? `Audio ended with a problem. Choose a meaning; this card closes in ${seconds} seconds.`
            : `Audio finished. Choose a meaning; this card closes in ${seconds} seconds.`;
        }
      }
      resetAutoHideTimer();
      sendResponse({ ok: true, started: countdownMs > 0, autoHideMs: countdownMs, answered: answerChosen, closeAfterAnswer });
      return false;
    }

    return false;
  });
})();
