# Shared vocabulary columns

Choose **Learning language** and **Meaning language** above the study screen. Both selections read cells from the same vocabulary rows. The study screen keeps its one-word layout.

Each shared row represents a published concept, with a cell for each available language. For example, row `ids:1-310` contains Italian `acqua`, English `water`, Spanish `agua`, Vietnamese `nước` and Chinese `水`. Selecting Italian and Vietnamese supplies `acqua` as the prompt and `nước` as its meaning. Selecting English and Italian uses `water` and `acqua` from that same row.

## Included columns

There are 1,310 aligned concept rows with Italian, English, Spanish and Vietnamese cells. Published Chinese concept mappings supply 570 Chinese cells. Cells are linked through explicit IDS and Concepticon identifiers. Matching spelling or English glosses never creates an alignment.

The larger existing published dictionaries supplement the shared rows. They are imported into sparse, sense-specific rows. A prose dictionary gloss becomes a definition-only meaning cell. It cannot become a learning prompt merely by reversing a translation. Source files remain separate to preserve their licenses and provenance.

| Learning language | English meanings | Vietnamese meanings |
| --- | --- | --- |
| Chinese | 10,155 study entries | 1,136 study entries |
| Spanish | 5,151 study entries | 5,627 study entries |
| Italian | 1,310 concepts | 1,310 concepts |
| English | — | 1,310 concepts |
| Vietnamese | 1,310 concepts | — |

Other column combinations use their shared populated rows. Italian–Chinese, for example, covers 570 concepts. Missing cells are omitted from study and marked unavailable in lookup. Homographs keep separate row identifiers. Meaning changes retain the current row when it is covered. Reviews are scoped to the learning language, while meaning-language changes retain review history.

Existing Chinese and Spanish word IDs remain accepted at the saved-progress boundary. Old named-pack backups migrate to a learning-language selection, and modern backups retain both language choices. The raw original vocabulary remains available for migration and lookup.

The PWA caches all row and reference files during installation. Open the site online once and allow installation to finish before using it offline. Audio and internet picture features have their own connectivity requirements.

Published human editing describes editorial origin. The data can contain errors, outdated terminology and contextual ambiguity. The app preserves source distinctions and published labels.

## Attribution and redistribution

**Intercontinental Dictionary Series, edited by Mary Ritchie Key and Bernard Comrie, v4.4.** Italian forms are credited to Martin Maiden, English to the listed IDS contributors, and Spanish to Joan Rafel and contributors. The adaptation selects these published forms by their original IDS concept identifiers. [IDS dataset and attribution](https://github.com/intercontinental-dictionary-series/ids/tree/v4.4).

**Annika Tjuka (2024), Concept list of Vietnamese based on the Intercontinental Dictionary Series.** Vietnamese cells retain the published native-script elicitation glosses and exact IDS keys. The list was compiled from dictionaries, with partial native-speaker checks. [Dataset and source paper](https://doi.org/10.5281/zenodo.11482543), [paper](https://doi.org/10.15475/calcip.2024.1.6).

**Sun and others (1991), Chinese concept labels curated by Concepticon contributors.** Chinese cells follow published Concepticon identifiers only when an identifier matches exactly one IDS concept. The adaptation retains the original Chinese labels, including their qualifiers. [Published list and licensing](https://concepticon.clld.org/contributions/Sun-1991-1004).

These three concept-aligned sources are distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `concepts.json` records the contributors, input hashes, source IDs and individual cell source keys. The adaptation combines cells through published concept identifiers, selects the five language columns and retains missing cells. Original source labels are preserved. All source data can contain errors and contextual limitations.

**CC-CEDICT contributors.** Chinese–English definitions and readings are adapted into `zh-en.json`. Traditional forms are retained as lookup aliases. Source keys retain traditional spelling, simplified spelling and reading. Licensed under Creative Commons Attribution–ShareAlike 4.0. [CC-CEDICT source and project](https://www.mdbg.net/chinese/dictionary?page=cedict), [CC BY-SA 4.0 license](https://creativecommons.org/licenses/by-sa/4.0/).

**Vietnamese Wiktionary contributors, extracted by Kaikki.org using Wiktextract.** Chinese–Vietnamese and Spanish–Vietnamese entries are adapted into `cmn-vi.json`, `zh-vi.json` and `es-vi.json`. The adaptation selects gloss-bearing entries, excludes romanizations, retains glosses, sense identifiers, parts of speech, labels, attributed source-page links and translated examples, and follows explicit source redirects as aliases. Content is redistributed under Creative Commons Attribution–ShareAlike 4.0. The original source also offers GFDL. [Source downloads and licensing](https://kaikki.org/viwiktionary/), [Wiktionary copyright terms](https://en.wiktionary.org/wiki/Wiktionary:Copyrights), [CC BY-SA 4.0 license](https://creativecommons.org/licenses/by-sa/4.0/).

**WikDict by Karl Bartel, based on Wiktionary contributors via DBnary.** `es-en-wikdict.json` supplies published English translations for existing Spanish study headwords absent from FreeDict. Parts of speech and original Spanish sense definitions are retained. The adaptation is licensed under Creative Commons Attribution–ShareAlike 3.0 Unported. [WikDict download and attribution](https://www.wikdict.com/page/download), [original TEI source](https://download.wikdict.com/dictionaries/tei/recommended/spa-eng.tei), [CC BY-SA 3.0 license](https://creativecommons.org/licenses/by-sa/3.0/).

**FreeDict Spanish–English 0.3.1 contributors, copyright 1999–2019.** `es-en.json` adapts the headwords and translated senses from the manually maintained FreeDict TEI dictionary, originally derived from Ergane. This dataset is separately licensed under GNU GPL version 2 or later. The complete corresponding TEI source, with original notices and contributor history, is included in `sources/spa-eng.tei`. The conversion source is included in `sources/build-dictionary.py` and `scripts/build-dictionary.py` in the repository and its FreeDict conversion is available under GPL version 2 or later. The full license is included in `sources/GPL-2.0.txt`. [FreeDict source repository](https://github.com/freedict/fd-dictionaries/tree/master/spa-eng).

CC-CEDICT and Vietnamese Wiktionary adaptations retain CC BY-SA 4.0. The WikDict supplement retains CC BY-SA 3.0. Keep the source credits, license links and modification notices when redistributing. The FreeDict data remains a separate GPL-licensed dataset. Source URLs, retrieval dates and input SHA-256 hashes are recorded in `catalog.json`. These dictionary licenses apply to the corresponding data. Existing vocabulary attribution is recorded in the site's `VOCABULARY_SOURCES.md`.

## Adding a language column

Add the language's BCP 47 code and display name to `languages` in `catalog.json`. Add its reviewed cells to the corresponding concept rows in a file listed under `rowFiles`. The app discovers the learning and meaning choices from those cells, without a language-specific study pack.

Each row file contains a `sources` object and a `rows` array. A row has a unique stable `id`, optional `label` and `conceptId`, and `cells` keyed by language code. Each cell has a `forms` array and `sources` credits with source IDs and source-entry keys. Optional `reading` and `notes` fields preserve language-specific information. Source records require their name, URL, license and `review` value `published-human-edited`.

```json
{
  "id": "ids:1-310",
  "label": "water",
  "conceptId": "948",
  "cells": {
    "it": {"forms": ["acqua"], "sources": [{"id": "ids-4.4", "key": "170-1-310-1"}]},
    "en": {"forms": ["water"], "sources": [{"id": "ids-4.4", "key": "190-1-310-1"}]},
    "vi": {"forms": ["nước"], "sources": [{"id": "tjuka-2024", "key": "Tjuka-2024-1310-951"}]}
  }
}
```

Keep a language cell empty when a published, sense-aligned form is missing. Separate meanings of the same spelling belong in separate rows. Preserve stable row IDs when adding columns. The loader validates cell credits and rejects duplicate row IDs before replacing its current model.

The `imports` catalog field adapts older published bilingual files into definition-only sparse rows. `legacyStudyPacks` supports old progress IDs. New language columns use `rowFiles` and require no additional entry under `legacyStudyPacks`.

Include each new row file in the service worker asset list, bump the cache version and mirror `web/` to `docs/`. Verify source attribution, missing cells, both language directions, backups and offline operation before publishing.

## Rebuilding the shared rows

Run `python scripts/build-language-columns.py INPUT_DIRECTORY` with these original inputs.

- `forms.csv` and `parameters.csv` from [IDS v4.4](https://github.com/intercontinental-dictionary-series/ids/tree/v4.4/cldf).
- `Tjuka-2024-1310.tsv` from [the published Vietnamese dataset](https://zenodo.org/records/11482543).
- `Sun-1991-1004.tsv` from [the pinned Concepticon snapshot](https://github.com/concepticon/concepticon-data/blob/7b5af5fcb18113ecc3b60129bc68d08594f2596e/concepticondata/conceptlists/Sun-1991-1004.tsv).

The script uses Python's standard library and performs no network requests. Input hashes and source credits are stored in `concepts.json`.

## Rebuilding the supplementary imports

Download the six original reference inputs identified by `catalog.json` into a local directory, using filenames `cedict.gz`, `mandarin-vi.jsonl`, `chinese-vi.jsonl`, `spanish-vi.jsonl`, `spa-eng.tei` and `wikdict-spa-eng.tei`. Include the GPL version 2 license as `GPL-2.0.txt`. Run `python scripts/build-dictionary.py INPUT_DIRECTORY`. Keep `concepts.json` alongside the resulting import files. Review source changes and coverage counts, then synchronize publication directories.
