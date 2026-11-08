# Offline dictionaries

Select the learning language in the vocabulary-pack selector. Select English or Vietnamese as the meaning language in Settings or the Dictionary tab. Only installed, directional dictionary pairs appear in the meaning-language selector.

All dictionary lookups, study meanings, quiz choices, deck search and word-loop meanings use local published dictionary data. Missing words are excluded from study for that pair. Missing lookups are marked unavailable. Word-by-word results retain individual senses, parts of speech, usage labels and source credits. Sentence translation is available only when the exact phrase is a published dictionary entry.

The PWA caches the dictionary files during installation. Open the site online once and allow installation to finish before using it offline. Audio and internet picture features have their own connectivity requirements.

## Coverage in this release

| Learning language | Meaning language | Covered study words | Total pack words |
| --- | --- | --- | --- |
| Chinese | English | 9,978 | 10,000 |
| Chinese | Vietnamese | 646 | 10,000 |
| Spanish | English | 4,645 | 8,549 |
| Spanish | Vietnamese | 4,290 | 8,549 |

Chinese–English lookups additionally cover the full imported CC-CEDICT dictionary. Vietnamese lookup data also includes words outside the study pack. Spanish pack words are the union of its two dictionaries, with stable IDs derived from normalized headwords. Dictionary ordering does not imply frequency ranking.

Published human editing describes the source's editorial origin. Entries can still have errors, outdated senses, extraction errors and contextual ambiguity. This release preserves published meanings and source distinctions. It does not certify individual translations as perfect. Definitions in different meaning languages have independent senses and may cover different usages of a headword.

Existing Chinese card IDs and saved review progress are retained. A card excluded for a missing meaning remains in the original catalog and its saved progress remains available when selecting a pair that covers it. Original vocabulary annotations are retained in vocabulary JSON. Study examples use published dictionary examples for the selected pair when supplied by the source.

## Attribution and redistribution

**CC-CEDICT contributors.** Chinese–English definitions and readings are adapted into `zh-en.json`. Traditional forms are retained as lookup aliases. Source keys retain traditional spelling, simplified spelling and reading. Licensed under Creative Commons Attribution–ShareAlike 4.0. [CC-CEDICT source and project](https://www.mdbg.net/chinese/dictionary?page=cedict), [CC BY-SA 4.0 license](https://creativecommons.org/licenses/by-sa/4.0/).

**Vietnamese Wiktionary contributors, extracted by Kaikki.org using Wiktextract.** Chinese–Vietnamese and Spanish–Vietnamese entries are adapted into `cmn-vi.json`, `zh-vi.json` and `es-vi.json`. The adaptation selects gloss-bearing entries, excludes romanizations, retains glosses, sense identifiers, parts of speech, labels, attributed source-page links and translated examples, and follows explicit source redirects as aliases. Content is redistributed under Creative Commons Attribution–ShareAlike 4.0. The original source also offers GFDL. [Source downloads and licensing](https://kaikki.org/viwiktionary/), [Wiktionary copyright terms](https://en.wiktionary.org/wiki/Wiktionary:Copyrights), [CC BY-SA 4.0 license](https://creativecommons.org/licenses/by-sa/4.0/).

**WikDict by Karl Bartel, based on Wiktionary contributors via DBnary.** `es-en-wikdict.json` supplies published English translations for existing Spanish study headwords absent from FreeDict. Parts of speech and original Spanish sense definitions are retained. The adaptation is licensed under Creative Commons Attribution–ShareAlike 3.0 Unported. [WikDict download and attribution](https://www.wikdict.com/page/download), [original TEI source](https://download.wikdict.com/dictionaries/tei/recommended/spa-eng.tei), [CC BY-SA 3.0 license](https://creativecommons.org/licenses/by-sa/3.0/).

**FreeDict Spanish–English 0.3.1 contributors, copyright 1999–2019.** `es-en.json` adapts the headwords and translated senses from the manually maintained FreeDict TEI dictionary, originally derived from Ergane. This dataset is separately licensed under GNU GPL version 2 or later. The complete corresponding TEI source, with original notices and contributor history, is included in `sources/spa-eng.tei`. The conversion source is included in `sources/build-dictionary.py` and `scripts/build-dictionary.py` in the repository and its FreeDict conversion is available under GPL version 2 or later. The full license is included in `sources/GPL-2.0.txt`. [FreeDict source repository](https://github.com/freedict/fd-dictionaries/tree/master/spa-eng).

CC-CEDICT and Vietnamese Wiktionary adaptations retain CC BY-SA 4.0. The WikDict supplement retains CC BY-SA 3.0. Keep the source credits, license links and modification notices when redistributing. The FreeDict data remains a separate GPL-licensed dataset. Source URLs, retrieval dates and input SHA-256 hashes are recorded in `catalog.json`. These dictionary licenses apply to the corresponding data. Existing vocabulary attribution is recorded in the site's `VOCABULARY_SOURCES.md`.

## Adding another language pair

Add a language name under `languages` in `catalog.json`, using a BCP 47 language code. Add a directional pair with `source`, `target` and local JSON `files`. Each file contains a `sourceId` referring to an attributed source in the catalog, and an `entries` array. Each source must declare its name, URL, license and `review` value `published-human-edited`. Add only data whose editorial origin and redistribution rights you have checked.

```json
{
  "sourceId": "your-published-dictionary",
  "entries": [{
    "headword": "casa",
    "reading": "",
    "senses": [{
      "gloss": "house",
      "partOfSpeech": "noun",
      "labels": [],
      "examples": [{"text": "La casa es grande.", "meaning": "The house is big."}]
    }]
  }]
}
```

The example illustrates the file format. Optional entry fields include `aliases`, `key` and `sourceUrl`. Senses remain separate and can include a source sense `id`. Translations are directional. Add a separately sourced reverse pair to support the reverse direction. Add a `studyPacks` item with a stable `id`, `languageCode` and `name` to derive study cards from that language's dictionary headwords. An existing vocabulary pack can instead supply its own stable cards.

Include every new data file in the service worker asset list, bump its cache version and mirror `web/` to `docs/`. Verify the source and target pair, missing-entry behavior, source licenses, cached operation and progress IDs before publishing.

## Rebuilding this release

Download the six original inputs identified by `catalog.json` into a local directory, using filenames `cedict.gz`, `mandarin-vi.jsonl`, `chinese-vi.jsonl`, `spanish-vi.jsonl`, `spa-eng.tei` and `wikdict-spa-eng.tei`. Include the full GPL version 2 license as `GPL-2.0.txt`. Run `python scripts/build-dictionary.py INPUT_DIRECTORY` from the repository. The script uses Python's standard library and performs no network requests. Review source changes, update retrieval dates and coverage counts, and synchronize the publication directories afterward.
