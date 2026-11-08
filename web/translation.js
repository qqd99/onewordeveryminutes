/* Shared vocabulary rows. Columns are selected independently for study and meaning. */
(function (root) {
  "use strict";

  const LANGUAGES = { en: "English", vi: "Vietnamese", it: "Italian", es: "Spanish", "zh-CN": "Chinese (Mandarin)" };
  let catalog = null;
  let sources = {};
  let conceptRows = [];
  let languageIndex = new Map();
  let availableTargets = new Map();
  let legacyPacks = [];
  let studyIds = new Map();
  let loading = null;
  let packCache = new WeakMap();
  let importedRows = new WeakMap();

  function normalizeLanguage(language) {
    const value = String(language || "").trim().replace(/_/g, "-");
    const names = { English: "en", Vietnamese: "vi", Italian: "it", Spanish: "es", Chinese: "zh-CN" };
    if (names[value]) return names[value];
    if (/^(zh|cmn)(-|$)/i.test(value)) return "zh-CN";
    try { return Intl.getCanonicalLocales(value)[0] || "en"; }
    catch (_) { return "en"; }
  }

  function sourceLanguage(pack) {
    return normalizeLanguage(pack?.languageCode || pack?.speechLang || pack?.language || "en");
  }

  function wordKey(word, language) {
    return String(word || "").normalize("NFC").trim().toLocaleLowerCase(language);
  }

  function cellText(cell) {
    return cell?.forms?.join("; ") || cell?.definition || "";
  }

  function validSource(source) {
    return source?.review === "published-human-edited" && source.url && source.license;
  }

  function install(data, files) {
    if (data?.schemaVersion !== 2 || !Array.isArray(data.rowFiles) || !Array.isArray(data.imports) || !data.languages || !data.sources) {
      throw new Error("Unsupported vocabulary-column catalog.");
    }
    const nextSources = Object.assign(Object.create(null), data.sources);
    for (const name of data.rowFiles) {
      const file = files[name];
      if (!Array.isArray(file?.rows) || !file.sources) throw new Error(`Invalid vocabulary rows in ${name}.`);
      for (const [id, source] of Object.entries(file.sources)) {
        if (Object.hasOwn(nextSources, id)) throw new Error(`Duplicate published source ${id}.`);
        nextSources[id] = source;
      }
    }
    if (Object.values(nextSources).some(source => !validSource(source))) {
      throw new Error("Invalid published source.");
    }
    const nextRows = [];
    const nextIndex = new Map();
    const nextTargets = new Map();
    const rowIds = new Set();
    const add = (language, forms, record, targets) => {
      if (!nextIndex.has(language)) nextIndex.set(language, new Map());
      if (!nextTargets.has(language)) nextTargets.set(language, new Set());
      for (const target of targets) if (target !== language) nextTargets.get(language).add(target);
      for (const form of forms) {
        const key = wordKey(form, language);
        if (!nextIndex.get(language).has(key)) nextIndex.get(language).set(key, []);
        nextIndex.get(language).get(key).push(record);
      }
    };
    for (const name of data.rowFiles) {
      const file = files[name];
      for (const row of file.rows) {
        if (!row.id || rowIds.has(row.id) || !row.cells) throw new Error("Invalid or duplicate vocabulary row.");
        rowIds.add(row.id);
        for (const [language, cell] of Object.entries(row.cells)) {
          if (!data.languages[language] || !Array.isArray(cell.forms) || !cell.forms.length ||
              cell.forms.some(form => typeof form !== "string" || !form.trim()) ||
              !Array.isArray(cell.sources) || !cell.sources.length ||
              cell.sources.some(credit => !validSource(nextSources[credit.id]))) {
            throw new Error(`Invalid language cell in ${row.id}.`);
          }
          add(language, cell.forms, { row }, Object.keys(row.cells));
        }
        nextRows.push(row);
      }
    }
    // Published bilingual sources enter the same sparse row model. Their glosses
    // are definition-only cells, so prose definitions never become learning words.
    for (const item of data.imports) {
      const file = files[item.file];
      if (!validSource(nextSources[file?.sourceId]) || !Array.isArray(file?.entries)) {
        throw new Error(`Invalid dictionary source in ${item.file}.`);
      }
      file.entries.forEach((entry, index) => {
        if (!entry.headword || !Array.isArray(entry.senses) || !entry.senses.length ||
            entry.senses.some(sense => typeof sense.gloss !== "string" || !sense.gloss.trim())) {
          throw new Error(`Invalid dictionary entry in ${item.file}.`);
        }
        add(item.sourceLanguage, [entry.headword, ...(entry.aliases || [])], {
          entry, source: item.sourceLanguage, target: item.meaningLanguage,
          sourceId: file.sourceId, id: `${file.sourceId}:${index}`
        }, [item.meaningLanguage]);
      });
    }
    // Commit a fully validated model, allowing safe retries after load failures.
    catalog = data;
    sources = nextSources;
    conceptRows = nextRows;
    languageIndex = nextIndex;
    availableTargets = nextTargets;
    importedRows = new WeakMap();
    packCache = new WeakMap();
    legacyPacks = [];
    studyIds = new Map();
    Object.assign(LANGUAGES, data.languages);
  }

  async function load() {
    if (!loading) loading = (async () => {
      const response = await fetch("dictionary/catalog.json");
      if (!response.ok) throw new Error("Could not load the vocabulary columns.");
      const data = await response.json();
      const names = [...new Set([...(data.rowFiles || []), ...(data.imports || []).map(item => item.file)])];
      const files = await Promise.all(names.map(async name => {
        if (!/^[a-zA-Z0-9-]+\.json$/.test(name)) throw new Error("Invalid vocabulary file path.");
        const result = await fetch(`dictionary/${name}`);
        if (!result.ok) throw new Error(`Could not load dictionary/${name}.`);
        return [name, await result.json()];
      }));
      install(data, Object.fromEntries(files));
    })().catch(error => { loading = null; throw error; });
    return loading;
  }

  function learningLanguages() {
    return Object.keys(catalog?.languages || {}).filter(language => languageIndex.has(language));
  }

  function targetLanguages(source) {
    const targets = availableTargets.get(normalizeLanguage(source));
    return Object.keys(catalog?.languages || {}).filter(language => targets?.has(language));
  }

  function rowsFor(record) {
    if (record.row) return [record.row];
    if (!importedRows.has(record)) {
      const { entry, source, target, sourceId, id } = record;
      const term = { forms: [entry.headword], reading: entry.reading || "", sources: [{ id: sourceId, key: entry.key || entry.headword }] };
      importedRows.set(record, entry.senses.map((sense, index) => ({
        id: `${id}:${index}`, sourceKey: entry.key || "", cells: {
          [source]: term,
          [target]: { definition: sense.gloss, sources: term.sources, publishedSense: sense }
        }, sourceUrl: entry.sourceUrl
      })));
    }
    return importedRows.get(record);
  }

  function describeRow(row, target, source) {
    const cell = row.cells[target];
    const credits = [...row.cells[source].sources, ...cell.sources];
    const unique = [...new Map(credits.map(credit => [credit.id, credit])).values()];
    const first = sources[unique[0].id];
    return {
      ...cell.publishedSense, rowId: row.id, gloss: cellText(cell),
      reading: row.cells[source].reading || "", sourceId: unique[0].id,
      sourceName: unique.map(credit => sources[credit.id].name).join("; "),
      license: [...new Set(unique.map(credit => sources[credit.id].license))].join("; "),
      sourceUrl: row.sourceUrl || first.url,
      sources: unique.map(credit => ({ ...credit, ...sources[credit.id] }))
    };
  }

  function lookup(word, targetLanguage, fromLanguage, sourceKey = "") {
    const source = normalizeLanguage(fromLanguage);
    const target = normalizeLanguage(targetLanguage);
    const records = languageIndex.get(source)?.get(wordKey(word, source)) || [];
    const rows = records.flatMap(rowsFor).filter(row => row.cells[target] && (!sourceKey || row.sourceKey === sourceKey));
    const senses = rows.map(row => describeRow(row, target, source));
    return {
      status: senses.length ? "found" : "missing", headword: String(word || ""),
      sourceLanguage: source, targetLanguage: target, senses,
      text: [...new Set(senses.map(sense => sense.gloss))].join("; "),
      reading: rows[0]?.cells[source].reading || ""
    };
  }

  function localizePack(pack, targetLanguage) {
    const target = normalizeLanguage(targetLanguage);
    if (!packCache.has(pack)) packCache.set(pack, new Map());
    const cache = packCache.get(pack);
    if (cache.has(target)) return cache.get(target);
    const source = sourceLanguage(pack);
    const cards = pack.cards.flatMap(card => {
      const key = target === "en" && card.meaningSource?.source === "cc-cedict" ? card.meaningSource.sourceKey : "";
      const result = lookup(card.front, target, source, key);
      if (result.status !== "found") return [];
      const example = result.senses.flatMap(sense => sense.examples || [])[0];
      return [{ ...card, meaning: result.text, reading: card.reading || result.reading,
        speechLang: card.speechLang || pack.speechLang || source,
        dictionaryLocalized: true, meaningLanguageCode: target, dictionarySenses: result.senses,
        example: example ? { ...example, words: [] } : null }];
    });
    const result = { ...pack, cards, meaningLanguageCode: target,
      dictionaryCoverage: { covered: cards.length, total: pack.cards.length, target } };
    cache.set(target, result);
    return result;
  }

  // Legacy pack IDs exist only at the saved-progress boundary.
  function studyPacks() {
    return (catalog?.legacyStudyPacks || []).map(pack => {
      const words = new Map();
      for (const records of languageIndex.get(pack.languageCode)?.values() || []) {
        for (const record of records.filter(item => item.entry)) {
          const entry = record.entry;
          const key = wordKey(entry.headword, pack.languageCode);
          if (!words.has(key)) words.set(key, { id: `${pack.id}:${encodeURIComponent(key)}`,
            front: entry.headword, meaning: "", reading: entry.reading || "", speechLang: pack.languageCode });
        }
      }
      return { ...pack, speechLang: pack.languageCode, cards: [...words.values()] };
    });
  }

  function bindVocabulary(packs) {
    legacyPacks = packs;
    studyIds = new Map();
    for (const language of learningLanguages()) {
      const old = new Map(packs.filter(pack => sourceLanguage(pack) === language)
        .flatMap(pack => pack.cards.map(card => [wordKey(card.front, language), card])));
      const claimed = new Set();
      for (const row of conceptRows.filter(item => item.cells[language])) {
        const word = row.cells[language].forms[0];
        const legacy = old.get(wordKey(word, language));
        const id = legacy && !claimed.has(legacy.id) ? legacy.id : `row:${row.id}:${language}`;
        claimed.add(id);
        studyIds.set(`${row.id}|${language}`, { id, reading: legacy?.reading || "" });
      }
    }
  }

  function learningPack(learningLanguage, meaningLanguage) {
    const source = normalizeLanguage(learningLanguage);
    const target = normalizeLanguage(meaningLanguage);
    const rows = conceptRows.filter(row => row.cells[source]);
    const cards = rows.filter(row => row.cells[target]).map(row => {
      const cell = row.cells[source];
      const saved = studyIds.get(`${row.id}|${source}`);
      return { id: saved?.id || `row:${row.id}:${source}`, rowId: row.id,
        front: cell.forms[0], reading: saved?.reading || cell.reading || "",
        meaning: cellText(row.cells[target]), speechLang: source, example: null,
        dictionaryLocalized: true, meaningLanguageCode: target,
        dictionarySenses: [describeRow(row, target, source)] };
    });
    const includedWords = new Set(cards.map(card => wordKey(card.front, source)));
    const ids = new Set(cards.map(card => card.id));
    let total = rows.length;
    for (const pack of legacyPacks.filter(item => sourceLanguage(item) === source)) {
      total += pack.cards.filter(card => !includedWords.has(wordKey(card.front, source))).length;
      for (const card of localizePack(pack, target).cards) {
        if (!includedWords.has(wordKey(card.front, source)) && !ids.has(card.id)) {
          cards.push(card);
          ids.add(card.id);
        }
      }
    }
    return { id: `language:${source}`, languageCode: source, speechLang: source,
      name: LANGUAGES[source] || source, cards, meaningLanguageCode: target,
      dictionaryCoverage: { covered: cards.length, total, target } };
  }

  function knownCardIds() {
    return [...new Set([...legacyPacks.flatMap(pack => pack.cards.map(card => card.id)),
      ...studyIds.values()].map(value => typeof value === "string" ? value : value.id))];
  }

  async function translateText(text, target, source = "en") { return lookup(text, target, source).text; }

  async function localizePresentation(card, quiz, target, source, translateChoices = true, translateExample = true, vocabulary = []) {
    if (card.dictionaryLocalized && card.meaningLanguageCode === normalizeLanguage(target)) return { card, quiz };
    const localized = localizePack({ languageCode: source, cards: [card, ...vocabulary.filter(item => item.id !== card.id)] }, target);
    const byId = new Map(localized.cards.map(item => [item.id, item]));
    const result = byId.get(card.id);
    if (!result) return { card: { ...card, meaning: "Meaning unavailable in this vocabulary row", example: null }, quiz: null };
    if (!translateChoices || !quiz) return { card: result, quiz };
    const choices = quiz.choices.map(choice => ({ ...choice, text: byId.get(choice.cardId)?.meaning || "" }));
    if (choices.some(choice => !choice.text) || new Set(choices.map(choice => choice.text)).size !== choices.length) return { card: result, quiz: null };
    return { card: result, quiz: { ...quiz, choices, correctMeaning: result.meaning } };
  }

  root.TranslationSupport = {
    LANGUAGES, normalizeLanguage, sourceLanguage, load, install, lookup, learningLanguages,
    targetLanguages, learningPack, bindVocabulary, knownCardIds,
    localizePack, studyPacks, translateText, localizePresentation
  };
})(globalThis);
