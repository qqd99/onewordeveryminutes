/* Shared vocabulary rows. Columns are selected independently for study and meaning. */
(function (root) {
  "use strict";

  const LANGUAGES = { en: "English", vi: "Vietnamese", it: "Italian", es: "Spanish", "zh-CN": "Chinese (Mandarin)" };
  let catalog = null;
  let sources = {};
  let conceptRows = [];
  let languageIndex = new Map();
  let columnRows = new Map();
  let compactColumns = new Map();
  let rowLanguages = new Map();
  let rowIndex = new Map();
  let indexedColumns = new Set();
  let generatedCells = new Map();
  let generatedCounts = new Map();
  let availableTargets = new Map();
  let targetCache = new Map();
  let legacyPacks = [];
  let studyIds = new Map();
  let loading = null;
  let packCache = new WeakMap();
  let importedRows = new WeakMap();

  function normalizeLanguage(language) {
    const value = String(language || "").trim().replace(/_/g, "-");
    const names = { English: "en", Vietnamese: "vi", Italian: "it", Spanish: "es", Chinese: "zh-CN" };
    if (names[value]) return names[value];
    if (/^(zh|cmn)(?:-(?:CN|Hans))?$/i.test(value)) return "zh-CN";
    try { return Intl.getCanonicalLocales(value)[0] || "en"; }
    catch (_) { return "en"; }
  }

  function sourceLanguage(pack) {
    return normalizeLanguage(pack?.languageCode || pack?.speechLang || pack?.language || "en");
  }

  function languageDetails(language) {
    const code = normalizeLanguage(language);
    return catalog?.languageDetails?.[code] || { speechLang: code, representation: "" };
  }

  function languageLabel(language) {
    const detail = languageDetails(language);
    const representation = detail.representation || "";
    const suffix = /transcription|source representation/i.test(representation) ? ` · ${representation.toLowerCase()}` : "";
    return (LANGUAGES[language] || language) + suffix;
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

  function cellFor(row, language) {
    return generatedCells.get(row)?.get(language) || row.cells[language];
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
    const nextColumnRows = new Map();
    const nextCompact = new Map();
    const nextRowLanguages = new Map();
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
      for (const inputRow of file.rows) {
        if (!inputRow?.id || rowIds.has(inputRow.id) || !inputRow.cells) throw new Error("Invalid or duplicate vocabulary row.");
        const row = { ...inputRow, cells: { ...inputRow.cells } };
        rowIds.add(row.id);
        for (const [language, cell] of Object.entries(row.cells)) {
          if (!data.languages[language] || !Array.isArray(cell.forms) || !cell.forms.length ||
              cell.forms.some(form => typeof form !== "string" || !form.trim()) ||
              !Array.isArray(cell.sources) || !cell.sources.length ||
              cell.sources.some(credit => !validSource(nextSources[credit.id]))) {
            throw new Error(`Invalid language cell in ${row.id}.`);
          }
          if (!nextColumnRows.has(language)) nextColumnRows.set(language, []);
          nextColumnRows.get(language).push(row);
        }
        nextRows.push(row);
        nextRowLanguages.set(row, Object.keys(row.cells));
      }
    }
    const rowsById = new Map(nextRows.map(row => [row.id, row]));
    for (const name of data.rowFiles) {
      for (const [language, encoded] of Object.entries(files[name].columns || {})) {
        if (!data.languages[language] || nextCompact.has(language) || typeof encoded !== "string") throw new Error("Invalid compact language column.");
        const cells = JSON.parse(encoded);
        if (!cells || typeof cells !== "object" || Array.isArray(cells)) throw new Error("Invalid compact language column.");
        for (const [id, cell] of Object.entries(cells)) {
          const row = rowsById.get(id);
          if (!row || row.cells[language] || !Array.isArray(cell) || cell.length !== 5 ||
              !Array.isArray(cell[0]) || !cell[0].length || cell[0].some(form => typeof form !== "string" || !form.trim()) ||
              !validSource(nextSources[cell[1]]) || !Array.isArray(cell[2]) || !cell[2].length ||
              cell[2].some(key => typeof key !== "string" || !key) || typeof cell[3] !== "string" ||
              !Array.isArray(cell[4]) || cell[4].some(note => typeof note !== "string")) {
            throw new Error(`Invalid compact cell in ${id}.`);
          }
          if (!nextColumnRows.has(language)) nextColumnRows.set(language, []);
          nextColumnRows.get(language).push(row);
          nextRowLanguages.get(row).push(language);
        }
        nextCompact.set(language, encoded);
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
    const nextGenerated = new Map();
    const nextGeneratedCounts = new Map();
    const nextLanguages = { ...data.languages };
    const nextDetails = { ...data.languageDetails };
    for (const name of data.generatedFiles || []) {
      const file = files[name];
      const source = file?.source;
      if (file?.schemaVersion !== 1 || !Array.isArray(file.rows) || !file.languages ||
          !source?.id || Object.hasOwn(nextSources, source.id) || source.review !== "assistant-generated" ||
          !source.author || !source.created || !source.name || !source.url || !source.license) {
        throw new Error(`Invalid assistant translation file ${name}.`);
      }
      nextSources[source.id] = source;
      for (const [language, label] of Object.entries(file.languages)) {
        if (normalizeLanguage(language) !== language || typeof label !== "string" || !label.trim()) {
          throw new Error("Invalid assistant translation language.");
        }
        nextLanguages[language] = nextLanguages[language] || label;
        nextDetails[language] = nextDetails[language] || { speechLang: language, representation: "Assistant-generated spelling" };
      }
      for (const entry of file.rows) {
        const row = rowsById.get(entry.id);
        if (!row || entry.sense !== row.label || !entry.cells) throw new Error("Assistant translation sense does not match its concept.");
        if (!nextGenerated.has(row)) nextGenerated.set(row, new Map());
        const cells = nextGenerated.get(row);
        for (const [language, cell] of Object.entries(entry.cells)) {
          if (!file.languages[language] || cells.has(language) || !Array.isArray(cell?.forms) || !cell.forms.length ||
              cell.forms.some(form => typeof form !== "string" || !form.trim()) ||
              (cell.reading !== undefined && typeof cell.reading !== "string")) {
            throw new Error(`Invalid or duplicate assistant translation cell in ${row.id}.`);
          }
          cells.set(language, { ...cell, sources: [{ id: source.id, key: `${row.id}|${language}` }] });
          nextGeneratedCounts.set(language, (nextGeneratedCounts.get(language) || 0) + 1);
          if (!nextRowLanguages.get(row).includes(language)) {
            nextRowLanguages.get(row).push(language);
            if (!nextColumnRows.has(language)) nextColumnRows.set(language, []);
            nextColumnRows.get(language).push(row);
          }
        }
      }
    }
    // Commit a fully validated model, allowing safe retries after load failures.
    catalog = { ...data, languages: Object.fromEntries(Object.entries(nextLanguages)
      .sort((a, b) => a[1].localeCompare(b[1], "en"))), languageDetails: nextDetails };
    sources = nextSources;
    conceptRows = nextRows;
    languageIndex = nextIndex;
    columnRows = nextColumnRows;
    compactColumns = nextCompact;
    rowLanguages = nextRowLanguages;
    rowIndex = rowsById;
    indexedColumns = new Set();
    generatedCells = nextGenerated;
    generatedCounts = nextGeneratedCounts;
    availableTargets = nextTargets;
    targetCache = new Map();
    importedRows = new WeakMap();
    packCache = new WeakMap();
    legacyPacks = [];
    studyIds = new Map();
    Object.assign(LANGUAGES, nextLanguages);
  }

  async function load() {
    if (!loading) loading = (async () => {
      const response = await fetch("dictionary/catalog.json");
      if (!response.ok) throw new Error("Could not load the vocabulary columns.");
      const data = await response.json();
      const names = [...new Set([...(data.rowFiles || []), ...(data.imports || []).map(item => item.file), ...(data.generatedFiles || [])])];
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
    return Object.keys(catalog?.languages || {}).filter(language => columnRows.has(language) || languageIndex.has(language));
  }

  function prepareColumn(language, index = false) {
    const encoded = compactColumns.get(language);
    if (encoded) {
      for (const [id, cell] of Object.entries(JSON.parse(encoded))) {
        rowIndex.get(id).cells[language] = { forms: cell[0], sources: cell[2].map(key => ({ id: cell[1], key })),
          reading: cell[3], notes: cell[4] };
      }
    }
    compactColumns.delete(language);
    if (!index || indexedColumns.has(language)) return;
    if (!languageIndex.has(language)) languageIndex.set(language, new Map());
    const words = languageIndex.get(language);
    for (const row of columnRows.get(language) || []) {
      const forms = [...(row.cells[language]?.forms || []), ...(generatedCells.get(row)?.get(language)?.forms || [])];
      for (const key of new Set(forms.map(form => wordKey(form, language)))) {
        if (!words.has(key)) words.set(key, []);
        words.get(key).push({ row });
      }
    }
    indexedColumns.add(language);
  }

  function targetLanguages(source) {
    const code = normalizeLanguage(source);
    if (targetCache.has(code)) return targetCache.get(code);
    const targets = new Set(availableTargets.get(code));
    // Build the union only for the selected column, once per installation.
    // Installing hundreds of columns must not build every language pair per row.
    for (const row of columnRows.get(code) || []) {
      for (const language of rowLanguages.get(row)) if (language !== code) targets.add(language);
    }
    const result = Object.keys(catalog?.languages || {}).filter(language => targets.has(language));
    targetCache.set(code, result);
    return result;
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
    const cell = cellFor(row, target);
    const learningCell = cellFor(row, source);
    const credits = [...learningCell.sources, ...cell.sources];
    const unique = [...new Map(credits.map(credit => [credit.id, credit])).values()];
    const first = sources[unique[0].id];
    return {
      ...cell.publishedSense, rowId: row.id, gloss: cellText(cell),
      reading: learningCell.reading || "", sourceId: unique[0].id,
      learningOrigin: generatedCells.get(row)?.has(source) ? "assistant-generated" : "published-human-edited",
      meaningOrigin: generatedCells.get(row)?.has(target) ? "assistant-generated" : "published-human-edited",
      sourceName: unique.map(credit => sources[credit.id].name).join("; "),
      license: [...new Set(unique.map(credit => sources[credit.id].license))].join("; "),
      sourceUrl: row.sourceUrl || first.url,
      sources: unique.map(credit => ({ ...credit, ...sources[credit.id] }))
    };
  }

  function lookup(word, targetLanguage, fromLanguage, sourceKey = "") {
    const source = normalizeLanguage(fromLanguage);
    const target = normalizeLanguage(targetLanguage);
    prepareColumn(source, true);
    prepareColumn(target);
    const records = languageIndex.get(source)?.get(wordKey(word, source)) || [];
    const rows = records.flatMap(rowsFor).filter(row => cellFor(row, target) && (!sourceKey || row.sourceKey === sourceKey))
      .sort((a, b) => Number(generatedCells.get(b)?.has(target) || false) - Number(generatedCells.get(a)?.has(target) || false));
    const senses = rows.map(row => describeRow(row, target, source));
    return {
      status: senses.length ? "found" : "missing", headword: String(word || ""),
      sourceLanguage: source, targetLanguage: target, senses,
      text: [...new Set(senses.map(sense => sense.gloss))].join("; "),
      reading: rows.length ? cellFor(rows[0], source).reading || "" : ""
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
        learningOrigin: card.learningOrigin || "published-human-edited",
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
    for (const language of new Set(packs.map(sourceLanguage))) {
      prepareColumn(language);
      const old = new Map(packs.filter(pack => sourceLanguage(pack) === language)
        .flatMap(pack => pack.cards.map(card => [wordKey(card.front, language), card])));
      const claimed = new Set();
      // Existing concept cells claim legacy IDs before newly added WOLD cells.
      // A new homograph earlier in the list must not move a saved sense's ID.
      const rows = [...(columnRows.get(language) || [])].sort((a, b) =>
        Number(!a.cells[language] || a.cells[language].sources.every(credit => credit.id === "wold-2009")) -
        Number(!b.cells[language] || b.cells[language].sources.every(credit => credit.id === "wold-2009")));
      for (const row of rows) {
        const word = (row.cells[language] || cellFor(row, language)).forms[0];
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
    prepareColumn(source);
    prepareColumn(target);
    const rows = columnRows.get(source) || [];
    const speechLang = languageDetails(source).speechLang || source;
    const cards = rows.filter(row => cellFor(row, target)).map(row => {
      const cell = cellFor(row, source);
      const saved = studyIds.get(`${row.id}|${source}`);
      const generated = generatedCells.get(row)?.has(source);
      return { id: saved?.id || `row:${row.id}:${source}`, rowId: row.id,
        learningOrigin: generated ? "assistant-generated" : "published-human-edited",
        front: cell.forms[0], reading: generated ? cell.reading || "" : saved?.reading || cell.reading || "",
        meaning: cellText(cellFor(row, target)), speechLang, example: null,
        dictionaryLocalized: true, meaningLanguageCode: target,
        dictionarySenses: [describeRow(row, target, source)] };
    });
    const includedWords = new Set(cards.map(card => wordKey(card.front, source)));
    const ids = new Set(cards.map(card => card.id));
    let total = rows.length;
    for (const pack of legacyPacks.filter(item => sourceLanguage(item) === source)) {
      total += pack.cards.filter(card => !includedWords.has(wordKey(card.front, source)) && !ids.has(card.id)).length;
      for (const card of localizePack(pack, target).cards) {
        if (!includedWords.has(wordKey(card.front, source)) && !ids.has(card.id)) {
          cards.push(card);
          ids.add(card.id);
        }
      }
    }
    return { id: `language:${source}`, languageCode: source, speechLang,
      name: LANGUAGES[source] || source, cards, meaningLanguageCode: target,
      dictionaryCoverage: { covered: cards.length, total, target,
        generatedMeanings: cards.filter(card => card.dictionarySenses?.some(sense => sense.meaningOrigin === "assistant-generated")).length } };
  }

  function generatedCoverage() {
    return { languages: generatedCounts.size, cells: [...generatedCounts.values()].reduce((sum, count) => sum + count, 0),
      concepts: generatedCells.size };
  }

  function knownCardIds() {
    return [...new Set([...legacyPacks.flatMap(pack => pack.cards.map(card => card.id)),
      ...conceptRows.flatMap(row => rowLanguages.get(row).map(language =>
        studyIds.get(`${row.id}|${language}`)?.id || `row:${row.id}:${language}`))])];
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
    LANGUAGES, normalizeLanguage, sourceLanguage, languageDetails, languageLabel, load, install, lookup, learningLanguages,
    targetLanguages, learningPack, bindVocabulary, knownCardIds, generatedCoverage,
    localizePack, studyPacks, translateText, localizePresentation
  };
})(globalThis);
