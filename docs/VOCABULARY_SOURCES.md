# Vocabulary sources, provenance and license

The **Common Chinese — 10,000 Words** vocabulary pack in this web app contains:

1. **1,000 existing HSK Core entries**, unchanged in this expansion (same card IDs, Chinese spellings, English meanings, readings, examples and review progress).
2. **9,000 additional simplified Mandarin headwords**, adapted from the [Zhongdex](https://github.com/saymei/zhongdex) word canon developed by **SayMei**. The headwords are prioritized by the source's corpus frequency ranks and retain their original HSK 3.0 (2026) band metadata.

## Required CC BY-SA 4.0 attribution

**Zhongdex by SayMei — https://zhongdex.org — CC BY-SA 4.0.**
Contains data from **CC-CEDICT (CC BY-SA 4.0)** and the **HSK 3.0 (2026) word list**.

- Zhongdex repository: https://github.com/saymei/zhongdex
- Original data license and required attribution: https://github.com/saymei/zhongdex/blob/main/data/LICENSE and https://github.com/saymei/zhongdex/blob/main/NOTICE
- CC-CEDICT Chinese–English dictionary: https://cc-cedict.org/
- CC BY-SA 4.0 full legal license: https://creativecommons.org/licenses/by-sa/4.0/legalcode

The newly added vocabulary, derivative definitions and examples, and the merged vocabulary database incorporating substantial licensed data, are shared under **Creative Commons Attribution–ShareAlike 4.0 International (CC BY-SA 4.0)**. Software source code is separate and retains its original code licensing. The contributors to CC-CEDICT and Zhongdex retain copyright to their respective material. The CC BY-SA 4.0 license requires attribution and compatible ShareAlike licensing when redistributing adapted vocabulary.

## What was changed

The source's 11,092 HSK entries were filtered and deduplicated against the pre-existing 1,000 cards, ranked using the source corpus frequency data, and mapped into the application's card format. Definitions with Chinese characters in the English-gloss field and variant-only descriptions were excluded. The 9,000 retained forms were divided into six 1,500-word JSON files. One selected graded example sentence was attached to each word where the source provided one (8,997 of 9,000 words). Existing 1,000 cards are preserved unchanged. This adaptation uses data from Zhongdex's HSK word canon and graded sentence records; source IDs and per-gloss source attribution were preserved.

The original upstream inputs were retrieved from:

- `saymei/zhongdex/data/hsk_bands.json`, Git blob `f261a5a75e08b9d40fc6b3632bdeca2e182d4c59`
- `saymei/zhongdex/data/sentences.jsonl`, Git blob `2f57a3e67d0451aafbe3da27079ffb570c808537`

Each added card includes `sourceId`, `sourceIds`, `meaningSource.sourceKey`, and `meaningSource.license`. Each added example retains its `sourceId` and `license`.

Frequency ranks are based on the source's corpus and are not a claim that this retained-originals pack reproduces an exact top-10,000 ranking. English definitions and sample sentences are intended for vocabulary learning, not to cover every sense or context.

## Redistribution

Anyone sharing or remixing the added vocabulary JSON or the resulting combined vocabulary database must keep proper credit, indicate their changes and follow **CC BY-SA 4.0**. Please retain this document (or equivalent attribution) with copies.
