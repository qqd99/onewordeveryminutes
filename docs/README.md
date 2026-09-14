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
  - Configurable repeat cadence (word twice, sentence twice) and speed/volume controls.
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
