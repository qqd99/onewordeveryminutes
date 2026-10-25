# Vocabulary SRS — Web & GitHub Pages Version

A modern, responsive, client-side spaced repetition (SRS) web app for learning Chinese vocabulary. Built with pure HTML5, CSS3, and JavaScript — zero dependencies and zero build steps. Text and locally bundled picture quizzes work offline after the app has been cached.

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
  - Preserves compatible existing SRS progress and imported backups.
  - Export your progress to JSON anytime.
  - Import JSON backups exported by the web app or older versions.
- **Progressive Web App (PWA)**:
  - Core learning and photo quizzes work offline after the PWA caches its vocabulary and bundled photo files.
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

## Translate vocabulary meanings and sentences

Open **Settings → Meaning language** to choose Vietnamese (Tiếng Việt), French, Spanish, German, Japanese, Korean, Chinese, Thai or Indonesian. English is the default. Chinese-to-meaning quizzes display translated multiple-choice meanings; meaning-to-Chinese mode translates the question prompt. The study card also translates example-sentence meanings without changing Chinese pronunciation, card IDs or SRS history.

The **Translate** tab has a **To** selector linked to the same preference so sentences can be translated from Chinese to Vietnamese and other supported languages. Known word breakdown meanings are translated too. The web app translates directly from the active learning-language text (Chinese words and sentences in the current pack), using Google Translate or MyMemory as an online fallback rather than translating stored English definitions. Translations require internet access (unless already cached) and can be rate-limited; original English meanings remain available if a request fails. The base vocabulary data and offline English learning are unchanged.


## When vocabulary meanings stay in English

Vietnamese and other translations normally use the public Google Translate and
MyMemory services, which may fail because of network restrictions, daily usage
limits, or browser security policies. The web app keeps the original English
meaning readable and shows a small **Retry translation** control instead of
making an error message part of the vocabulary prompt. Retry sends another
request and does not alter card IDs or learning progress.

On compatible desktop browsers (such as recent Chrome or Edge versions), open
**Settings → Meaning language**, choose **Vietnamese**, then click
**Enable on-device translation**. The browser may download a Vietnamese language
pack the first time. Once available, subsequent translations can work offline,
without relying on Google/MyMemory and without creating an account. This control
is hidden if the browser does not provide the Translator API. Other browsers
continue using the public APIs and previously cached translations. Some words
or phrases may still be left in English if no translator is available.

## Stable repetition counts (v24)

For **Word repeat count** values from 3 to 10, short Chinese words and example sentences use **small groups of up to five repetitions per speech request**, with natural punctuation pauses. This avoids the common browser and online-TTS failure where the first two readings play, later asynchronous speech requests fail, and the app reports *Word audio unavailable*. Native Web Speech and online fallback both use the same repeated Chinese text; a failed native batch can fall back to one online recording rather than making five unrelated requests. Counts of 1 or 2 retain the existing per-repeat behavior. Very long text is kept on the segmented path to avoid provider length limits.

Changing cards or pausing still cancels the current reading. The v24 service-worker cache and assets are synchronized in both `web/` and `docs/`.

## Translate directly from the learning language (v25)

The study-card translator now uses the actual vocabulary word in the selected learning language as its source. In the Chinese pack, **好 → tốt** is requested as **zh-CN → vi**, not by translating its stored English definition “good.” Mode 1 translates each multiple-choice meaning from the Chinese word behind that option, and Mode 2 translates the English-facing prompt from the current Chinese card. Example-sentence meanings use the original Chinese sentence as the source whenever they are translated. The standalone Translate tab already translated Chinese sentences directly; its known-word breakdown also now uses each Chinese word rather than English definitions.

For other learning packs, the source language is resolved from the pack's `languageCode` / `speechLang` / `language` fields instead of the language of its stored definitions. Browser on-device translation uses the same source and target languages. The underlying vocabulary data and SRS progress remain unchanged. If a provider is unavailable, the existing English definition is retained as a readable fallback. Both GitHub Pages publishing paths use the same v25 cache.

## Word repeat count fix and web-only repository (v26)

**Word repeat count** supports integers from 1 to 10. The web player, manual pronunciation, saved settings, and imported backups use the selected number instead of stopping at five. The PWA cache is updated so existing installations retrieve the corrected playback code.

The maintained application is the standalone website in `web/` (with `docs/` kept in sync for branch-based Pages). Browser-extension-only source files have been removed; the website and offline PWA require no extension.

## Automatic speech reliability (v27)

Automatic reading now divides 6–10 repetitions into batches of at most five, and long example sentences into even smaller batches. This avoids lengthy native utterances and online TTS requests that can fail while reading. Native speech completion and online audio duration limits now account for slower/longer readings. Manual **Hear word** and automatic card playback use the same batching logic; interruption by a new card still cancels stale playback.

## Offline photographic quiz (v30)

Go to **Settings → Learning Mode → Mode 3 — Chinese → Picture**. Each save slot persists this mode across page reloads and backup imports until it is changed.

The quiz presents a Chinese word and three **real photographs**. Picture choices never reveal textual meanings before the answer; after the choice, the correct meaning appears in Vietnamese or whatever learning language is selected. SRS grading, study audio, and the other text learning modes are unchanged.

This version includes **56 hand-mapped JPEG photographs saved in both `web/photos/` and `docs/photos/`**. There are **no live image searches, Google Images scraping, Wikipedia API calls, or externally hosted photo URLs** at quiz time. Each JPEG is pre-cached by the service worker for offline use; they can be served instantly from the same website when loading succeeds. If a file genuinely fails, use the Retry button or reload the website. Localized meanings may still need internet access unless the translation cache or on-device translation is available.

The current collection focuses on concrete vocabulary with clear visual depictions (fruit, vegetables, animals, objects, transport, and places). **Unmapped vocabulary is excluded only from picture mode**, rather than receiving an incorrect or generic image; these words remain available in Modes 1 and 2. The 56 images do not cover all 10,000 words yet. More photos can be added by adding a file and matching Chinese vocabulary in `picture-catalog.js`.

All image sources, authors, and licenses are documented in [`photos/SOURCES.md`](photos/SOURCES.md), including Wikimedia Commons per-file terms, Fruits-360 CC BY-SA 4.0 and historical MIT-licensed examples. Google Images results alone do not grant redistribution rights, so only sources with explicit reuse permissions were used.

## AI-generated image review (v32)

In **Mode 3 — Chinese → Picture**, the 56 curated local photographs remain the instant fallback. If an approved AI illustration already exists for the **current Chinese word and meaning**, that illustration is reused. Otherwise the browser requests **one** new image for the current word via Google's `gemini-2.5-flash-image` API. The other two distractor pictures remain unchanged and are **never generated or judged**. The quiz can still be answered while an AI image is loading.

After answering, the learner may click **Good — save for this word** or **Bad — regenerate this word only**. Only clicking Good writes the generated image to an IndexedDB object store in that browser. Rejected or unreviewed candidates are not written to the approved-image database. Approved images are reused on future visits to the same browser and retained independently of vocabulary progress save slots. A different sense/English gloss gets a different approval key.

### Gemini API key provisioning

The published application can use a **site-wide Gemini API key provided at deploy time** (GitHub repository **Settings → Secrets and variables → Actions → New repository secret**, named `GEMINI_IMAGE_API_KEY`). The GitHub Pages deploy workflow writes `ai-image-config.js` to the deployed artifact using that secret. The live key is **deliberately accessible to every website visitor**: do not treat it as secret after deployment, and restrict usage/quota, billing and API permissions accordingly. The actual key must **not** be committed to this repository: GitHub secret scanning blocks live keys. Alternatively, each visitor may enter their own key in the app's Settings (stored locally in that browser). Without either key, local photos continue to work.

### Shared community approval database

A static GitHub Pages site cannot directly write a shared database. Approved AI images are **saved in IndexedDB on the approving user's device** without any extra setup. Cross-user sharing is wired through an **optional separate HTTPS service**. Configure the GitHub Actions *repository variable* `AI_IMAGE_APPROVAL_ENDPOINT` (without trailing slash) when such a service has been deployed. The client calls `GET <endpoint>/approvals?key=<URL-encoded JSON array [Chinese word, English gloss]>` to reuse another user's approved image and `POST <endpoint>/approvals` with a JSON record (`key`, `src` base64 data URI, `front`, `meaning`, `model`, `approvedAt`) after Good. The GET response should include a safe HTTPS image `src` or supported image data URI. The service is not deployed or supplied by GitHub Pages; no worldwide/shared persistence should be claimed until you connect one. Upload failures do not discard the local approval. Because these endpoints allow public image submissions, deploy with spam controls, storage limits, and moderation.

Gemini image generation incurs API usage and can be rate-limited or unavailable. Original local photographs remain usable whenever generation fails. Image judgments are only shown after revealing the correct answer.
