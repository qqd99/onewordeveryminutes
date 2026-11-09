# Assistant-generated vocabulary

The user authorized direct use of assistant-generated translations on 9 November 2026. The app activates the entries in `assistant-core.json` automatically and prefers them for their exact concept and language cells. Study and dictionary results identify their origin.

## Current coverage

This batch contains **3,200 assistant-authored cells covering 80 noun concepts in 40 modern languages**. Arabic, Korean, Hindi and traditional-script Mandarin are included. The application has 371 language columns after combining these entries with the existing published source varieties.

The authored languages are English, Vietnamese, Italian, Spanish, French, German, Portuguese, Dutch, Swedish, Norwegian Bokmål, Danish, Finnish, Polish, Czech, Slovak, Hungarian, Romanian, Greek, Russian, Ukrainian, Bulgarian, Serbian, Croatian, Turkish, Modern Standard Arabic, Hebrew, Persian, Hindi, Bengali, Urdu, simplified-script Mandarin, traditional-script Mandarin, Japanese, Korean, Thai, Indonesian, Malay, Filipino, Swahili and Catalan.

This batch covers water, fire, sky and weather, geographic features, plants, basic foods, family members, common animals, body parts, household objects, school, books, time, roads, boats and a few tools. The full list of exact concepts and translations is in `assistant-core.json` and the authoring script.

The remaining concepts and source varieties retain their published entries. Settings reports the number of generated and published meanings for the selected pair. A study card identifies the learning word's origin separately from the meaning's origin. A generated learning word can be paired with a published meaning, and the reverse is also possible.

## Origin and quality

These translations were authored by the OpenAI assistant in this repository's Codex conversation. Their text was composed in the authoring script. The build formats that text into cells and makes no translation-service requests. Chinese pinyin and Japanese kana readings in this batch were also authored by the assistant and refer to each cell's first form.

The batch has **no independent human review**. Generated entries can contain errors and contextual ambiguities. A generated flag records origin and carries no claim of correctness. The existing 356 published language varieties have not all been rewritten. Rare dialects, historical languages and reconstructed languages remain outside this authored batch.

Concept IDs identify the intended sense. Body-part terms refer to anatomy, wood refers to material, hair refers to head hair, and cow refers to a female bovine. A cell can contain several valid forms. Kinship vocabulary can distinguish age and speaker gender, so alternatives such as older and younger siblings are retained. Regional, grammatical and usage distinctions may require more detailed sense rows in future batches.

## Storage and rebuilding

Run `python scripts/build-assistant-translations.py` to format the authored source into `web/dictionary/assistant-core.json` and register it under `generatedFiles` in the catalog. The script uses Python's standard library and performs no network requests. Mirror the result to `docs/` when publishing.

Generated files use a separate schema with a source record, language names and sense-specific rows. The loader validates all files before replacing its current state. An entry must match an existing concept ID and its exact label. Duplicate generated cells and unknown concepts are rejected. Published data stays in its original files with its original attribution.

Generated cells take precedence during study and lookup. Lookup also accepts the original published spellings for the same concept. Saved review IDs remain bound through the original cells, preserving history when an authored spelling changes. Missing generated cells use the existing source entries, with their published origin displayed.

The source field `license` displays the origin label “Assistant-generated content.” This label records how the text was produced. Existing published-source licenses continue to apply to their respective data and concept metadata.
