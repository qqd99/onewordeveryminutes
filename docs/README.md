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
- **Word List & Deck Browser**: Search and filter all 1,000 HSK words by status (*Due*, *Reviewed*, *New*, or *All*). Click any word to practice it immediately or listen to pronunciation.
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
- Initial cards attempt pronunciation, and answering a quiz no longer restarts or interrupts the reading.
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
