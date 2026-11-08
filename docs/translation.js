/* Offline, directional dictionary lookup. No translation services or model output. */
(function (root) {
  "use strict";

  const LANGUAGES = { en: "English", vi: "Vietnamese", es: "Spanish", "zh-CN": "Chinese (Mandarin)" };
  let catalog = null;
  let indexes = new Map();
  let loading = null;
  let packCache = new WeakMap();

  function normalizeLanguage(language) {
    const value = String(language || "").trim().replace(/_/g, "-");
    const names = { English: "en", Vietnamese: "vi", Spanish: "es", Chinese: "zh-CN" };
    if (names[value]) return names[value];
    if (/^(zh|cmn)(-|$)/i.test(value)) return "zh-CN";
    try {
      return Intl.getCanonicalLocales(value)[0] || "en";
    } catch (_) {
      return "en";
    }
  }

  function sourceLanguage(pack) {
    return normalizeLanguage(pack?.languageCode || pack?.speechLang || pack?.language || "en");
  }

  function wordKey(word, language) {
    return String(word || "").normalize("NFC").trim().toLocaleLowerCase(language);
  }

  function pairKey(source, target) {
    return JSON.stringify([normalizeLanguage(source), normalizeLanguage(target)]);
  }

  function install(data, files) {
    if (data?.schemaVersion !== 1 || !Array.isArray(data.pairs) || !data.languages || !data.sources) {
      throw new Error("Unsupported dictionary catalog.");
    }
    const next = new Map();
    for (const pair of data.pairs) {
      const index = new Map();
      for (const name of pair.files) {
        const file = files[name];
        const source = data.sources[file?.sourceId];
        if (source?.review !== "published-human-edited" || !source.url || !source.license ||
            !Array.isArray(file?.entries)) throw new Error(`Invalid dictionary source in ${name}.`);
        for (const entry of file.entries) {
          if (typeof entry.headword !== "string" || !Array.isArray(entry.senses) ||
              !entry.senses.length || entry.senses.some(sense => typeof sense.gloss !== "string" || !sense.gloss.trim())) {
            throw new Error(`Invalid dictionary entry in ${name}.`);
          }
          const published = { ...entry, sourceId: file.sourceId, source };
          for (const word of [entry.headword, ...(entry.aliases || [])]) {
            const key = wordKey(word, pair.source);
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(published);
          }
        }
      }
      const key = pairKey(pair.source, pair.target);
      if (next.has(key)) throw new Error("Duplicate dictionary pair.");
      next.set(key, index);
    }
    // Publish only a fully validated catalog, keeping retries safe after failure.
    indexes = next;
    catalog = data;
    Object.assign(LANGUAGES, data.languages);
    packCache = new WeakMap();
  }

  async function load() {
    if (!loading) {
      loading = (async () => {
        const response = await fetch("dictionary/catalog.json");
        if (!response.ok) throw new Error("Could not load the offline dictionary catalog.");
        const data = await response.json();
        const names = [...new Set(data.pairs.flatMap(pair => pair.files))];
        const files = await Promise.all(names.map(async name => {
          if (!/^[a-zA-Z0-9-]+\.json$/.test(name)) throw new Error("Invalid dictionary file path.");
          const result = await fetch(`dictionary/${name}`);
          if (!result.ok) throw new Error(`Could not load dictionary/${name}.`);
          return [name, await result.json()];
        }));
        install(data, Object.fromEntries(files));
      })().catch(error => {
        loading = null;
        throw error;
      });
    }
    return loading;
  }

  function targetLanguages(source) {
    return (catalog?.pairs || []).filter(pair => normalizeLanguage(pair.source) === normalizeLanguage(source))
      .map(pair => pair.target);
  }

  function lookup(word, targetLanguage, fromLanguage, sourceKey = "") {
    const source = normalizeLanguage(fromLanguage);
    const target = normalizeLanguage(targetLanguage);
    const entries = indexes.get(pairKey(source, target))?.get(wordKey(word, source)) || [];
    const matching = sourceKey ? entries.filter(entry => entry.key === sourceKey) : entries;
    // A known source sense must match exactly. A different reading can change meaning.
    const selected = sourceKey ? matching : entries;
    const senses = selected.flatMap(entry => entry.senses.map(sense => ({
      ...sense, reading: entry.reading || "", sourceId: entry.sourceId,
      sourceName: entry.source.name, license: entry.source.license,
      sourceUrl: entry.sourceUrl || entry.source.url
    })));
    return {
      status: senses.length ? "found" : "missing", headword: String(word || ""),
      sourceLanguage: source, targetLanguage: target, senses,
      text: [...new Set(senses.map(sense => sense.gloss))].join("; "),
      reading: selected[0]?.reading || ""
    };
  }

  function localizePack(pack, targetLanguage) {
    const target = normalizeLanguage(targetLanguage);
    if (!packCache.has(pack)) packCache.set(pack, new Map());
    const cached = packCache.get(pack);
    if (cached.has(target)) return cached.get(target);
    const source = sourceLanguage(pack);
    const cards = pack.cards.flatMap(card => {
      // CC-CEDICT source keys apply only to that dictionary pair.
      const key = target === "en" && card.meaningSource?.source === "cc-cedict"
        ? card.meaningSource.sourceKey : "";
      const result = lookup(card.front, target, source, key);
      if (result.status !== "found") return [];
      const example = result.senses.flatMap(sense => sense.examples || [])[0];
      return [{
        ...card, meaning: result.text, reading: card.reading || result.reading,
        speechLang: card.speechLang || pack.speechLang || source,
        dictionaryLocalized: true, meaningLanguageCode: target, dictionarySenses: result.senses,
        example: example ? { ...example, words: [] } : null
      }];
    });
    const localized = {
      ...pack, cards, meaningLanguageCode: target,
      dictionaryCoverage: { covered: cards.length, total: pack.cards.length, target }
    };
    cached.set(target, localized);
    return localized;
  }

  function studyPacks() {
    return (catalog?.studyPacks || []).map(pack => {
      const words = new Map();
      for (const pair of catalog.pairs.filter(pair => pair.source === pack.languageCode)) {
        for (const entries of indexes.get(pairKey(pair.source, pair.target)).values()) {
          for (const entry of entries) {
            const key = wordKey(entry.headword, pair.source);
            if (!words.has(key)) words.set(key, {
              id: `${pack.id}:${encodeURIComponent(key)}`, front: entry.headword,
              meaning: "", reading: entry.reading || "", speechLang: pack.languageCode
            });
          }
        }
      }
      return { ...pack, speechLang: pack.languageCode, cards: [...words.values()] };
    });
  }

  async function translateText(text, target, source = "en") {
    return lookup(text, target, source).text;
  }

  async function localizePresentation(card, quiz, target, source, translateChoices = true, translateExample = true, vocabulary = []) {
    if (card.dictionaryLocalized && card.meaningLanguageCode === normalizeLanguage(target)) return { card, quiz };
    const localized = localizePack({ languageCode: source, cards: [card, ...vocabulary.filter(item => item.id !== card.id)] }, target);
    const byId = new Map(localized.cards.map(item => [item.id, item]));
    const result = byId.get(card.id);
    if (!result) return { card: { ...card, meaning: "Meaning unavailable in this offline dictionary", example: null }, quiz: null };
    if (!translateChoices || !quiz) return { card: result, quiz };
    const choices = quiz.choices.map(choice => ({ ...choice, text: byId.get(choice.cardId)?.meaning || "" }));
    if (choices.some(choice => !choice.text) || new Set(choices.map(choice => choice.text)).size !== choices.length) {
      return { card: result, quiz: null };
    }
    return { card: result, quiz: { ...quiz, choices, correctMeaning: result.meaning } };
  }

  root.TranslationSupport = {
    LANGUAGES, normalizeLanguage, sourceLanguage, load, install, lookup,
    targetLanguages, localizePack, studyPacks, translateText, localizePresentation
  };
})(globalThis);
