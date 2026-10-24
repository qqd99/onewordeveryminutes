# Vocabulary SRS — Web App

A browser-based Chinese vocabulary spaced-repetition app. No browser extension or plugin is required.

**Live site:** https://qqd99.github.io/onewordeveryminutes/

## Getting started

Visit the live site, click **Start learning**, and select a vocabulary pack. Under **Settings → Audio & Pronunciation**, set **Word repeat count** from 1 to 10. The selected count controls automatic and manual word readings (and example sentence readings when enabled). Settings and study progress are saved in your browser; you can export a JSON backup.

## Repository layout

- `web/` — the standalone website deployed by GitHub Actions to GitHub Pages.
- `docs/` — an identical website copy for branch-based GitHub Pages configurations.
- `tests/` — Node.js regression tests for the website.
- `.github/workflows/` — deployment and test workflows.

The web app is HTML, CSS, and vanilla JavaScript with no build-time dependencies. It can run as an offline-capable PWA after its assets have been cached.

## Developing locally

Run `python3 -m http.server 8000 --directory web` and open http://localhost:8000.

Run `node --test tests/*.test.cjs` for regression tests.

For implementation details and deployment instructions, see [the web app documentation](web/README.md). Attribution for included vocabulary sources is documented in `web/VOCABULARY_SOURCES.md`.

This repository maintains **only the web version**. Older browser-extension code has been removed.
