/* Study translation helper: source is the active learning language. */
(function (root) {
  "use strict";

  const LANGUAGES = Object.freeze({
    en: "English (original)",
    vi: "Vietnamese",
    fr: "French",
    es: "Spanish",
    de: "German",
    ja: "Japanese",
    ko: "Korean",
    "zh-CN": "Chinese (Simplified)",
    th: "Thai",
    id: "Indonesian"
  });
  const STORAGE_KEY = "vocab_srs_translation_cache_v1";
  const MAX_CACHE_ENTRIES = 400;
  const cache = new Map();
  const pending = new Map();
  let loading = null;
  let saveTimer = null;

  function normalizeLanguage(language) {
    return Object.prototype.hasOwnProperty.call(LANGUAGES, language) ? language : "en";
  }

  function sourceLanguage(pack) {
    // translationLanguage describes the language of the *stored definitions*
    // (English in the Chinese pack), not the language being learned.
    const names = {
      English: "en", Vietnamese: "vi", French: "fr", Spanish: "es",
      German: "de", Japanese: "ja", Korean: "ko", Chinese: "zh-CN",
      Thai: "th", Indonesian: "id"
    };
    const code = pack?.languageCode || pack?.speechLang;
    if (typeof code === "string" && code.trim()) {
      const normalized = code.trim().replace(/_/g, "-");
      if (LANGUAGES[normalized]) return normalized;
      const base = normalized.split("-")[0].toLowerCase();
      if (base === "zh" || base === "cmn") return "zh-CN";
      if (LANGUAGES[base]) return base;
    }
    return names[pack?.language] || names[pack?.translationLanguage] || "en";
  }

  function decodeEntities(text) {
    return String(text)
      .replace(/&#(x[\da-f]+|\d+);/gi, (entity, code) => {
        const value = code[0].toLowerCase() === "x"
          ? parseInt(code.slice(1), 16) : Number(code);
        return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
          ? String.fromCodePoint(value) : entity;
      })
      .replace(/&(amp|quot|apos|lt|gt);/gi, (entity, name) => (
        { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" }[name.toLowerCase()] || entity
      ));
  }

  async function hydrateCache() {
    if (!loading) {
      loading = (async () => {
        try {
          let saved = null;
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            saved = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
          } else if (typeof localStorage !== "undefined") {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
          }
          if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            for (const [key, value] of Object.entries(saved).slice(-MAX_CACHE_ENTRIES)) {
              if (typeof value === "string" && !cache.has(key)) cache.set(key, value);
            }
          }
        } catch (error) {
          // Learning must work even when local storage is unavailable.
        }
      })();
    }
    await loading;
  }

  function persistCacheSoon() {
    if (saveTimer !== null) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const values = Object.fromEntries(cache);
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          await chrome.storage.local.set({ [STORAGE_KEY]: values });
        } else if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        }
      } catch (error) {
        // Keep the in-memory cache if persistent storage is full or disabled.
      }
    }, 800);
  }

  // Chrome/Edge desktop may offer an on-device Translator API. A downloaded
  // language pack works even if both public translation APIs are blocked.
  // Starting a new download requires a user click, never a background request.
  const deviceTranslators = new Map();

  function browserTranslator() {
    const api = root.Translator;
    return api && typeof api.create === "function" &&
      typeof api.availability === "function" ? api : null;
  }

  function devicePair(source, target) {
    return JSON.stringify([source, target]);
  }

  async function readyDeviceTranslator(source, target) {
    const api = browserTranslator();
    if (!api) return null;
    const key = devicePair(source, target);
    if (deviceTranslators.has(key)) return deviceTranslators.get(key);
    try {
      const options = { sourceLanguage: source, targetLanguage: target };
      if (await api.availability(options) !== "available") return null;
      const creating = Promise.resolve(api.create(options)).catch(error => {
        deviceTranslators.delete(key);
        throw error;
      });
      deviceTranslators.set(key, creating);
      return await creating;
    } catch (_) {
      return null;
    }
  }

  async function enableOnDeviceTranslation(targetLanguage, sourceLanguage = "en", onProgress) {
    const api = browserTranslator();
    const target = normalizeLanguage(targetLanguage);
    if (!api) throw new Error("On-device translation is not supported by this browser.");
    if (target === sourceLanguage) return;
    const key = devicePair(sourceLanguage, target);
    if (!deviceTranslators.has(key)) {
      // create() must be invoked synchronously inside the actual user gesture
      // when it needs to download a new language pack.
      let creating;
      try {
        creating = Promise.resolve(api.create({
          sourceLanguage, targetLanguage: target,
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", event => {
              if (typeof onProgress === "function") {
                onProgress(Math.round(event.loaded * 100));
              }
            });
          }
        })).catch(error => {
          deviceTranslators.delete(key);
          throw error;
        });
      } catch (error) {
        throw new Error("Could not start on-device translation: " + error.message);
      }
      deviceTranslators.set(key, creating);
    }
    await deviceTranslators.get(key);
  }

  async function translateOnDevice(original, source, target) {
    const translator = await readyDeviceTranslator(source, target);
    if (!translator) return null;
    try {
      const translated = String(await translator.translate(original)).trim();
      if (translated && translated.toLocaleLowerCase() !== original.toLocaleLowerCase()) {
        return translated;
      }
    } catch (_) {
      // The installed model may be temporarily unavailable; try online next.
    }
    return null;
  }

  // Prefer the same Google endpoint already used by the web app's Translate tab.
  // MyMemory is a fallback: its anonymous quota can be exhausted independently.
  async function requestMeaningTranslation(original, target, fromLanguage) {
    const onDevice = await translateOnDevice(original, fromLanguage, target);
    if (onDevice) return onDevice;
    const providers = [
      {
        url: `https://translate.googleapis.com/translate_a/single?${new URLSearchParams({
          client: "gtx", sl: fromLanguage, tl: target, dt: "t", q: original
        })}`,
        timeout: 5500,
        read: data => Array.isArray(data?.[0])
          ? data[0].map(part => (part && typeof part[0] === "string") ? part[0] : "").join("")
          : ""
      },
      {
        url: `https://api.mymemory.translated.net/get?${new URLSearchParams({
          q: original, langpair: `${fromLanguage}|${target}`
        })}`,
        timeout: 6500,
        read: data => {
          if (Number(data?.responseStatus) !== 200) {
            throw new Error("Translation quota reached or request rejected");
          }
          return data?.responseData?.translatedText || "";
        }
      }
    ];

    for (const provider of providers) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), provider.timeout);
      try {
        const response = await fetch(provider.url, {
          signal: controller.signal, credentials: "omit"
        });
        if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
        const translated = decodeEntities(provider.read(await response.json())).trim();
        if (!translated || /MYMEMORY WARNING/i.test(translated) ||
            translated.toLocaleLowerCase() === original.toLocaleLowerCase()) {
          throw new Error("No translated meaning returned");
        }
        return translated;
      } catch (error) {
        // Try the other provider before falling back to the original English.
      } finally {
        clearTimeout(timeout);
      }
    }
    return original;
  }

  async function translateText(text, targetLanguage, fromLanguage = "en") {
    const original = String(text ?? "").trim();
    const target = normalizeLanguage(targetLanguage);
    if (!original || target === "en" || target === fromLanguage || original.length > 450) {
      return original;
    }
    await hydrateCache();
    const key = JSON.stringify([fromLanguage, target, original]);
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);

    const task = (async () => {
      try {
        const translated = await requestMeaningTranslation(original, target, fromLanguage);
        if (translated !== original) {
          cache.delete(key);
          cache.set(key, translated);
          while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
          persistCacheSoon();
        }
        return translated;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, task);
    return task;
  }

  async function localizePresentation(
    card, quiz, targetLanguage, fromLanguage = "en",
    translateChoices = true, translateExample = true, vocabulary = []
  ) {
    const target = normalizeLanguage(targetLanguage);
    if (target === "en" || target === fromLanguage) return { card, quiz };

    // In the Chinese pack, English meanings are only stored annotations.
    // Translate the *Chinese word itself*, never the English annotation.
    const directFromLearningLanguage = fromLanguage !== "en";
    const wordById = new Map(
      (Array.isArray(vocabulary) ? vocabulary : [])
        .filter(item => item?.id)
        .map(item => [item.id, item.front])
    );
    const choices = translateChoices && Array.isArray(quiz?.choices) ? quiz.choices : [];
    const choiceSource = choice => {
      if (!directFromLearningLanguage) return choice.text;
      if (choice.cardId === card.id || choice.isCorrect || choice.id === "correct") {
        return card.front;
      }
      return wordById.get(choice.cardId) || "";
    };

    const originalCardSource = directFromLearningLanguage ? card.front : card.meaning;
    const originalExampleSource = directFromLearningLanguage
      ? card.example?.text || "" : card.example?.meaning || "";
    const sources = choices.map(choiceSource);
    const [localizedChoices, localizedMeaning, localizedExample] = await Promise.all([
      Promise.all(choices.map((choice, index) => sources[index]
        ? translateText(sources[index], target, fromLanguage)
        : Promise.resolve(choice.text))),
      translateText(originalCardSource, target, fromLanguage),
      translateExample
        ? translateText(originalExampleSource, target, fromLanguage)
        : (card.example?.meaning || "")
    ]);

    // A failed translation must not display Chinese text as the Vietnamese
    // meaning or create a quiz with mixed Chinese / Vietnamese choices.
    const validMeaning = localizedMeaning && localizedMeaning !== originalCardSource;
    const normalizedChoices = localizedChoices.map(value =>
      String(value || "").toLocaleLowerCase().replace(/\s+/g, "")
    );
    const distinct = new Set(normalizedChoices).size === normalizedChoices.length;
    const complete = choices.every((choice, index) =>
      sources[index] && localizedChoices[index] &&
      localizedChoices[index] !== sources[index]
    );
    const translatedChoices = choices.length && complete && distinct;
    const displayedQuiz = translatedChoices
      ? {
          ...quiz,
          choices: choices.map((choice, index) => ({
            ...choice, text: localizedChoices[index]
          }))
        }
      : quiz;
    const correctOption = translatedChoices
      ? displayedQuiz.choices.find(choice =>
          choice.isCorrect || choice.id === quiz.correctChoiceId
        )
      : null;

    const translatedExample = translatedExampleAvailable(
      localizedExample, originalExampleSource, directFromLearningLanguage,
      card.example?.meaning || "", translateExample
    );
    return {
      card: {
        ...card,
        meaning: choices.length && !translatedChoices
          ? card.meaning
          : (correctOption?.text || (validMeaning ? localizedMeaning : card.meaning)),
        example: card.example ? {
          ...card.example,
          meaning: translatedExample
        } : card.example
      },
      quiz: displayedQuiz
    };
  }

  function translatedExampleAvailable(translated, source, direct, fallback, requested) {
    if (!requested) return fallback;
    if (translated && translated !== source) return translated;
    return direct ? fallback : (translated || fallback);
  }

  root.TranslationSupport = {
    LANGUAGES, normalizeLanguage, sourceLanguage, translateText, localizePresentation,
    enableOnDeviceTranslation, browserTranslator
  };
})(globalThis);
