# Vocabulary SRS for Microsoft Edge

Vocabulary SRS shows one vocabulary card on the active webpage, reads the word twice and its common sentence twice, and schedules every word with spaced repetition.

## Two separate schedules

### 1. Card appearance interval — chosen by the user

Choose **x minutes** in Settings. One card appears every x minutes. This cadence stays fixed until you change it.

### 2. Word repetition interval — automatic per word

There is no manual repetition-time setting. Every word keeps its own history and review date:

- **Forget** lowers that word’s ease and makes it eligible at the next display opportunity.
- **Remember** increases that word’s interval automatically.
- Consecutive Remember answers expand the interval progressively.
- A later Forget reduces the interval and slows future growth for that word.
- Due reviewed cards are selected before unseen words.
- **New Word** leaves the card unreviewed and allows another card at the next display interval.

The display cadence does not speed up or slow down when you rate a word. Only that word’s repetition schedule changes.

## Updating without losing progress

Extract each release over the same `vocabulary-srs-edge` folder and click **Reload** in `edge://extensions`. Do not remove the extension. The stable extension ID, card IDs, local progress, upgrade snapshots, and synchronized backup are preserved.

## Vocabulary management

All packs and cards remain in one file: `vocabulary.json`. See `VOCABULARY_PACK_GUIDE.md` for adding more Chinese words or another language.


## Meaning quiz (1.11.0)

The word meaning is hidden until the learner chooses one of three shuffled meanings. The background service worker validates the choice. A correct answer applies Remember; a wrong answer applies Forget. The correct meaning is then revealed. The extension popup keeps manual New Word, Forget, and Remember controls available after answering so a saved status can still be corrected.

## Answer-aware card countdown (1.11.1)

- Before an answer is chosen, the card uses the user-configured countdown after automatic audio finishes.
- After a correct or incorrect answer is chosen, the card waits for any active reading to finish and then closes after exactly 3 seconds.
- If the answer is chosen after audio has already finished, the immediate countdown starts immediately.
- Pressing Hear after answering pauses the close timer and starts a fresh immediate countdown when that reading finishes.

## Playback and answer-close settings (1.12.0)

- **Close the reminder card after choosing an answer** is enabled by default. When enabled, an answered card waits for active reading to finish, then closes after 3 seconds. When disabled, the answered card stays open until the learner closes it manually or a later interval replaces it.
- **Speech volume** is adjustable from 0% to 100%. The value applies to word audio, sentence audio, automatic playback, manual Hear buttons, online pronunciation, and the system-speech fallback.
- Both preferences are stored with the rest of the update-safe settings and synchronized backup.

## Automatic sentence audio

In Settings, **Read the word automatically** controls automatic pronunciation. The separate **Read example sentences automatically** checkbox (on by default) controls whether the example sentence follows the word. When turned off, automatic playback reads only the current word twice. **Hear sentence** on a card still plays the sentence manually, even with automatic sentence reading disabled.

The word and example audio use the selected pack's speech language. If an audio request has been replaced by a newer one, old pronunciation fallbacks are stopped instead of interrupting the new card. Meanings are English definitions (rather than Chinese dictionary cross-references).

## Translate meanings to Vietnamese or other languages (1.14.0)

In the Edge extension popup, open **Settings → Meaning language**, select **Vietnamese (Tiếng Việt)** (or another supported language) and click **Save settings**. Word meanings, three quiz answers and example-sentence meanings are translated for display; the original vocabulary JSON and word IDs stay unchanged so spaced-repetition progress remains intact. Word/sentence speech continues in the pack's source language.

Translations are requested from the public [MyMemory API](https://mymemory.translated.net/doc/spec.php) only when needed, with a bounded local cache. An internet connection and service availability are required for uncached translations. If translation fails or becomes ambiguous, the original meanings remain available. This setting is saved with your SRS settings and backup. The web version offers the same **Meaning language** setting.
