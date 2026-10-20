/* English-meaning translation helper for the web app. */
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
    const names = {
      English: "en", Vietnamese: "vi", French: "fr", Spanish: "es",
      German: "de", Japanese: "ja", Korean: "ko", Chinese: "zh-CN",
      Thai: "th", Indonesian: "id"
    };
    return names[pack?.translationLanguage] || "en";
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

  // Prefer the same Google endpoint already used by the web app's Translate tab.
  // MyMemory is a fallback: its anonymous quota can be exhausted independently.
  async function requestMeaningTranslation(original, target, fromLanguage) {
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

  async function localizePresentation(card, quiz, targetLanguage, fromLanguage = "en", translateChoices = true, translateExample = true) {
    const target = normalizeLanguage(targetLanguage);
    if (target === "en" || target === fromLanguage) return { card, quiz };
    const choices = translateChoices && Array.isArray(quiz?.choices) ? quiz.choices : [];
    const [localizedChoices, localizedMeaning, localizedExample] = await Promise.all([
      Promise.all(choices.map(choice => translateText(choice.text, target, fromLanguage))),
      translateText(card.meaning, target, fromLanguage),
      translateExample ? translateText(card.example?.meaning || "", target, fromLanguage) : (card.example?.meaning || "")
    ]);

    const keys = localizedChoices.map(value => value.toLocaleLowerCase().replace(/\s+/g, ""));
    // Ambiguous translated answers must not make a multiple-choice quiz unfair.
    const distinct = new Set(keys).size === keys.length;
    const displayedQuiz = choices.length && distinct
      ? {
          ...quiz,
          choices: choices.map((choice, index) => ({ ...choice, text: localizedChoices[index] }))
        }
      : quiz;
    const correctOption = distinct && choices.length
      ? displayedQuiz.choices.find(choice => choice.id === quiz.correctChoiceId)
      : null;

    return {
      card: {
        ...card,
        meaning: choices.length && !distinct ? card.meaning : (correctOption?.text || localizedMeaning),
        example: card.example ? { ...card.example, meaning: localizedExample } : card.example
      },
      quiz: displayedQuiz
    };
  }

  root.TranslationSupport = {
    LANGUAGES, normalizeLanguage, sourceLanguage, translateText, localizePresentation
  };
})(globalThis);
