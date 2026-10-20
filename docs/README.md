# Vocabulary SRS — Web & GitHub Pages Version

A modern, responsive, client-side spaced repetition (SRS) web app for learning Chinese vocabulary. Built with pure HTML5, CSS3, and JavaScript — zero dependencies, zero build steps, and 100% offline-ready.

---

## 🚀 How to Host on GitHub Pages

You can host this web application on GitHub Pages for free in under 2 minutes.

### Option A: Using the Automated GitHub Actions Workflow (Recommended)

1. Push this repository to GitHub (or push the branch containing `.github/workflows/deploy.yml` and `web/`).
2. On your GitHub repository page:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push to `main` (or go to the **Actions** tab and trigger the workflow manually).
4. Your website will be live at `https://<your-username>.github.io/<repo-name>/`!

---

### Option B: Dedicated Standalone Repository

If you want a separate GitHub repository solely for the web app:

1. Create a new repository on GitHub (e.g. `chinese-srs-web`).
2. Copy the contents of the `web/` folder directly to the root of your new repository.
3. In your new repository on GitHub:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
   - Select branch `main` (or `master`) and folder `/ (root)`.
   - Click **Save**.
4. In ~30 seconds, your site will be live.

---

## 💻 Running Locally

Because this project uses standard browser APIs and native fetch for `vocabulary.json`, run any local static file server:

### Using Node / npx:
```bash
npx serve web
```

### Using Python:
```bash
# Python 3
cd web
python -m http.server 8080
```
Then open `http://localhost:8080` in your browser.

---

## ✨ Features

- **Adaptive Spaced Repetition (SRS)**: Employs the SuperMemo-2 inspired algorithm with adaptive intervals, ease factors, and lapse recovery.
- **Meaning Quiz Mode**: Challenges recall with 3 shuffled choices (1 correct and 2 distractors).
- **Audio Pronunciation**:
  - Web Speech API (`SpeechSynthesis`) with auto-selection of native Chinese voices (`zh-CN`, `cmn`).
  - Online audio fallback (Google & Youdao TTS) for unsupported platforms.
  - Configurable word repetition, sentence playback toggle (enabled by default), and speed/volume controls. Word playback completes before a sentence begins, and answering a quiz no longer restarts speech.
- **Word List & Deck Browser**: Search and filter 10,000 common Mandarin words by status (*Due*, *Reviewed*, *New*, or *All*). During an active learning session, click a word to practice it immediately; pronunciation buttons remain available separately.
- **Study Modes**:
  - **Self-Paced Study**: Review at your own speed with keyboard shortcuts (`1`, `2`, `3` for answers, `Space` for audio/next, `R` for Remember, `F` for Forget, `N` for New Word).
  - **Interval Reminder Mode**: Automatically prompts you with cards every *X* minutes with optional desktop/browser notifications.
- **Progress Export & Import**:
  - 100% compatible with the Vocabulary SRS browser extension!
  - Export your progress to JSON anytime.
  - Import backups from either the web app or the Edge extension.
- **Progressive Web App (PWA)**:
  - Works 100% offline via Service Worker cache.
  - Installable to home screen on iOS, Android, macOS, and Windows.
- **Theme Support**: Dark mode and Light mode with persistent preferences.

## Automatic sentence pronunciation

Open **Settings → Audio & Pronunciation**. Turn off **Read example sentences automatically** to hear only each card’s Chinese word. The preference is saved in the browser and included in progress backups. You can still click **Sentence** or the example card's 🔊 button to hear a sentence manually.

The audio player waits for the word to finish before reading the example, cancels any stale audio when a different card or manual playback takes over, and does not substitute sentence audio when word pronunciation fails. If the browser blocks audio, use the manual **Word** button or switch the audio engine under Settings.

On GitHub Pages, commits merged into `main` trigger `.github/workflows/deploy.yml`, which deploys the `web/` directory. This change also bumps the service worker cache version so previously installed PWAs pick up the corrected catalog and scripts on reload.

## Web audio reliability (v9)

- **Auto** tries browser speech first, including when the browser initially reports no voices. Word pronunciation begins immediately whenever the browser permits playback; online audio is a fallback with shorter timeouts. Some browsers block automatic sound until you interact with the page; press **🔊 Word** in that case.
- **Auto-read on card presentation** controls the word, while **Read example sentences automatically** only controls the optional example after the word. Turning sentences off must not mute words. Manual pronunciation buttons work independently.
- A learning session starts only after **Start learning** is pressed; this intentional user action also gives browsers a valid interaction for automatic pronunciation. Answering a quiz no longer restarts or interrupts the reading.
- New Word now resets review history properly, SRS uses the full hours/minutes/seconds cadence, translations ignore obsolete results, and backup imports accept only known vocabulary IDs.
- New builds refresh the installed PWA's service-worker cache and JavaScript assets.

## Independent word and sentence auto-reading controls (v10)

**Settings → Audio & Pronunciation** now offers two separate switches:

- **Read word**: pronounce the current vocabulary word automatically.
- **Read sentence**: pronounce the example sentence automatically.

Both enabled reads the word before the sentence. Read word alone plays only the word; Read sentence alone plays only the sentence (without waiting for a muted word); both off disables automatic pronunciation. The manual **🔊 Word** and **🔊 Sentence** buttons work regardless of these settings.

The new **Read word** setting preserves existing users' former **Auto-read on card presentation** value. Audio settings saved in older web backups are also migrated when imported. Settings live in browser storage; GitHub Pages publishes the updated `web/` folder after a merge to `main`.

## Avoid conflicting GitHub Pages deployments

This repository currently has **two complete website directories**, `web/` and `docs/`. GitHub Actions in `.github/workflows/deploy.yml` publishes `web/`, while a branch-based GitHub Pages configuration can also build `docs/`. GitHub Pages can run both on the same push; whichever deployment finishes last may determine what visitors see. The outdated `docs/` directory was why the site could show old settings even after the web deployment succeeded.

**Until the repository's Pages source is consolidated, update both directories together.** The pull-request regression test `tests/pages-sync.test.cjs` rejects differing files between `web/` and `docs/`. This includes HTML, JavaScript, service-worker cache revisions, and vocabulary data.

For a permanent one-source setup, open the repository's **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**, keeping `.github/workflows/deploy.yml` publishing `web/`. Once that change is confirmed, consider retiring the separate `docs/` source rather than maintaining duplicates. This settings change cannot be made merely by editing web source files.

## Wrong-choice confusion reviews

When a learner chooses the wrong meaning on a Chinese vocabulary quiz, the displayed card is marked **Forget**, as before. If the selected distractor meaning comes from another vocabulary card that has already been reviewed (Remember or Forget), that particular card is **also marked Forget**. For example, choosing **mistake (错)** instead of **good** on **好** marks both 好 and 错 Forget if 错 is already in the review history.

A **New** distractor stays New; simply appearing as an answer choice does not count as learning or reviewing it. Correct answers do not affect distractors, unselected answers never change, and a second click cannot penalize the same choice twice. Each choice keeps its source card ID, so multiple words with the same English definition do not all get marked Forget. The existing manual Remember/Forget buttons can still correct the displayed card's rating.


## Start, pause, and resume learning sessions (v13)

Every page visit begins with **no study card visible**. Press **Start learning** to reveal the first card, begin the reminder countdown (when enabled), and start the configured word/sentence pronunciation. Because Start learning is a deliberate click, it also provides the browser interaction normally required before automatic audio can play.

Use **Pause learning** at any time to stop the current audio, stop the reminder timer, and hide the study card. While paused, reminder events cannot advance or display another card. **Resume learning** restores the same in-progress card, restarts pronunciation according to the Read word / Read sentence settings, and starts a fresh reminder countdown. Refreshing or reopening the page returns to the Start learning screen rather than silently resuming a session.

Session start/pause state is intentionally temporary and is not written into exported SRS progress. Vocabulary progress and the current-card ID are still persisted normally. The v13 build is kept identical in both `web/` and `docs/` so either GitHub Pages publishing path serves the same interface.

## Two quiz directions (v14)

The web app now has a persistent **Learning Mode** selector in Settings.

- **Mode 1 — Chinese → English (default):** the current Chinese word is shown and the learner chooses from three English meanings. This is the existing behavior and remains the default for current and new users.
- **Mode 2 — English → Chinese:** the English meaning is shown and the learner chooses from three Chinese words. Automatic and manual word audio still pronounce the underlying Chinese card, so a prompt such as **good** is still spoken as **好 / hǎo** rather than as the English word.

Mode 2 hides the pinyin and Chinese example sentence until the learner answers, so the page does not visually reveal the correct Chinese choice in advance. After answering, the full Chinese word, pinyin, English meaning, and example sentence are revealed. Distractor choices retain their vocabulary-card IDs, so the reviewed-distractor Forget behavior works in both quiz modes. Cards with the exact same English meaning are not used as distractors for an English prompt, avoiding two simultaneously valid Chinese answers.

Changing the learning mode while a card is already open applies to the next card. The selected mode is stored in browser settings, included in web backups, and validated when imported. The v14 PWA cache is published identically through both `web/` and `docs/`.

## Equal-length Chinese choices in Mode 2 (v15)

Mode 2 no longer allows answer length to reveal the correct Chinese word. The correct answer and both distractors always have the **same Chinese character count**. A one-character answer is paired only with one-character distractors, a two-character answer only with two-character distractors, and so on.

Mode 2 requires two other Chinese words of the same character length. The expanded 10,000-word catalog contains enough alternatives for its common 1–4 character lengths, including **公共汽车**, so the earlier four-character limitation no longer applies. Cards with unusual lengths and too few alternatives remain excluded from Mode 2 to prevent answer-length clues.

The v15 regression suite checks the full deployed vocabulary catalog so every eligible Mode 2 card produces exactly three choices of identical character length. The update is mirrored through both `web/` and `docs/`.

## Quiet quiz feedback (v16)

Study cards no longer create the dark in-page toast popups after a quiz answer. Correct/incorrect feedback stays inside the card through the green/red answer styling and the revealed answer, while SRS Remember/Forget updates continue normally.

Reminder-driven card changes also no longer display the in-page **Reminder: Next card is due!** toast. If desktop/browser notifications are enabled in Settings, the optional system notification remains available. Other operational toasts (for settings, imports, errors, and manual actions) are unchanged.

The v16 PWA cache is mirrored through both `web/` and `docs/`.

## Multiple named save files (v17)

The web app now supports separate **Save Files** in Settings, plus a quick-save selector in the top header. Your former single-browser save is automatically migrated to **Main Save** without changing any existing learning progress.

- **New save:** starts with no reviewed cards, while inheriting your current learning/audio preferences.
- **Duplicate:** creates an independent copy of the current learning progress and settings.
- **Switch:** autosaves the old save, stops audio/reminders, and returns to the **Start learning** screen; selecting the previous save brings back its own cards, progress, quiz mode and other settings.
- **Rename / Delete:** organize save slots. Deleting requires confirmation, and the only remaining save cannot be deleted.
- **Export JSON:** downloads the currently selected save with its name, progress and settings.
- **Import as new save:** opens an existing vocabulary backup JSON into its own slot without modifying the current one. The original **Import JSON** action still merges progress into the selected slot, so existing backups remain compatible.

Named save slots are stored automatically in **browser localStorage** and do not sync across devices or browsers. Keep downloaded backups if you want to transfer between devices or protect against clearing browser data. All slots share the vocabulary catalog but store learning progress independently. Session start/pause status is temporary and not saved.

## Common Chinese 10,000 vocabulary (v18)

The website now loads **10,000 distinct simplified Chinese words** in the existing vocabulary pack, preserving all original 1,000 card IDs, meanings, examples and progress. The additional 9,000 entries are selected in ascending subtitle-corpus frequency-rank order from the HSK 3.0 (2026) Zhongdex canon. They provide pinyin, English definitions, frequency rank, and **8,997 sourced graded example sentences**. All newer entries retain dictionary and sentence provenance.

For faster, more reliable downloads, the original 1,000 cards remain in `vocabulary.json` and the added 9,000 are loaded from six `vocabulary/common-01.json`–`common-06.json` files during initialization. The app verifies the final card count before enabling Start learning, and the service worker precaches all six files for offline study. The pack ID stays `zh-hsk-core-1000` for backward compatibility with existing browser saves, even though its display name is now **Common Chinese — 10,000 Words**.

**Attribution and license:** The added vocabulary and derived example data are CC BY-SA 4.0, adapted from [Zhongdex by SayMei](https://github.com/saymei/zhongdex), [CC-CEDICT](https://cc-cedict.org), and HSK 3.0 (2026). See [VOCABULARY_SOURCES.md](VOCABULARY_SOURCES.md). The frequency order reflects the HSK source's subtitle-corpus rankings; the overall 10,000-word pack intentionally retains the previous 1,000 cards, so it is not advertised as an exact top-10,000 corpus ranking.
