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
