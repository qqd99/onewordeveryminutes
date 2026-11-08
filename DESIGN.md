# Vocabulary SRS design

## Direction

Minimalist, word-centered study. A warm neutral canvas, ink-colored typography and restrained forest-green states establish a quiet reading environment. The selected word and its answer choices form the primary composition. Recent-word practice appears in an expandable section afterward.

## Color

- Light canvas `#faf9f6`, content surface `#ffffff`, text `#202622`, secondary text `#616960`, divider `#dedfd8`.
- Accent `#355847`, with pale green for selection and correct answers.
- Dark canvas `#171c19`, surface `#1e2521`, text `#edf0e9`, secondary text `#b0b9ae`.
- Red appears only for incorrect answers and destructive controls.

## Typography

Use the platform sans-serif stack for controls, body text and headings. Use native CJK fonts for learned characters. UI labels use sentence case and normal tracking. The study term is the largest element. Secondary descriptions remain readable at 14 pixels or larger.

## Composition

- A compact wordmark and labeled pack and save selectors establish context.
- Text navigation uses a thin active underline.
- Main content stays within 1,000 pixels. The central study task stays within 700 pixels.
- Use whitespace and thin separators to group content. Study and dictionary results sit directly on the page.
- Lists use dividing rules. Settings use aligned rows and native disclosure controls.
- Keep the word loop below the current study task, collapsed initially.

## Interaction and accessibility

Use one consistent family of drawn stroke icons. Primary buttons are dark green. Secondary controls have quiet borders. Focus indicators remain conspicuous. Color feedback accompanies text and selection state. Respect reduced motion, support keyboard study controls, and keep all primary controls usable on narrow screens.

## Verification

Check idle, active and answered study, recent-word practice, dictionary results, missing entries, deck search, statistics, settings and backup controls in light and dark themes. Verify desktop and mobile layouts through browser automation and run the regression suite.
