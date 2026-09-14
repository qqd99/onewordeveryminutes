# Release notes

## 1.13.0

- Unified the toolbar popup and webpage reminder as mutually exclusive review surfaces.
- Opening the toolbar popup closes any visible webpage vocabulary card.
- When a scheduled or manual webpage card opens, an already-open toolbar popup closes itself.
- The newest review surface is always kept. Both surfaces read the same current card, quiz answer, and SRS state.
- Clearing a superseded webpage card also clears only its presentation lock, so **Show now** can reopen the same current card without changing learning progress.

# 1.12.1

- Changed **Close the reminder immediately after choosing an answer**: the quiz result and correct meaning are revealed, saved, and the webpage reminder closes immediately on the next rendered frame.
- Removed the previous 3-second post-answer delay and the requirement to wait for speech to finish before closing.
- When the setting is off, answered cards stay open as before.
- Speech volume and all SRS progress remain unchanged.

# Release notes

## 1.12.0

- Added **Close the reminder card after choosing an answer**.
- When the option is enabled, answered cards retain the existing 3-second close behavior after reading finishes.
- When disabled, answered cards remain open until manually closed or replaced by a later interval.
- Added a **Speech volume** slider from 0% to 100%.
- Volume applies to automatic word/sentence playback, Hear buttons, online audio sources, and system-speech fallback.
- Manual Hear from the toolbar uses the current slider value, so volume can be previewed before saving.
- New settings are normalized with safe defaults and included in the existing durable/synchronized settings backup.
- Preserves existing progress, card IDs, SRS history, and folder/extension identity.

## 1.11.1

- Added a fixed 3-second post-answer countdown.
- The 3-second timer starts only after all active word/sentence audio finishes.
- Unanswered cards continue to use the user-configured countdown.
- Answering after playback has ended starts the 3-second timer immediately.
- Manual Hear playback after answering pauses and then restarts the 3-second timer.
- Preserves existing progress, settings, card IDs, and synchronized backups.

## 1.11.0

- Replaced the visible word meaning with a three-choice meaning quiz.
- Correct answers automatically apply Remember.
- Incorrect answers automatically apply Forget.
- Reveals and highlights the correct meaning after an answer.
- Uses deterministic distractors from the active vocabulary pack, shared by the webpage card and toolbar popup.
- Keeps manual status correction controls in the toolbar popup after the quiz is answered.
- Preserves all existing card IDs, progress, settings, and synchronized backups.

# Release notes

## 1.10.0 — Fixed appearance cadence, adaptive word repetition

- Restored a manually editable **Word appearance interval** from 1 to 1,440 minutes.
- One card appears every user-selected x minutes; ratings no longer alter this cadence.
- Replaced fixed 4-hour/1-day/3-day steps with per-word adaptive intervals.
- First Remember schedules a word at roughly 2× the display interval.
- Repeated Remember answers expand that word according to its own ease and history.
- Forget reduces ease, resets the success streak, and makes the word due at the next display opportunity.
- Due reviewed cards continue to take priority over new words.
- Existing v1.9 pace is migrated as the initial fixed display interval, and all progress is preserved.

## 1.9.0 — Adaptive schedule

- Removed the manually editable reminder interval.
- Added a performance-based reminder pace that automatically changes between 5 and 120 minutes.
- Forget speeds up the next reminder.
- New Word uses a moderate pace without counting the card as learned.
- Remember gradually lengthens the general pace after consecutive successful choices.
- Individual card SRS intervals remain independent: forgotten cards return soon; remembered cards move through hours, days, and longer intervals.
- The scheduler wakes at the earlier of the adaptive new-card time or the next due reviewed card.
- Correcting a rating from the toolbar also restores and recalculates the adaptive pace from the original choice.
- Existing progress, settings, and stable folder/extension IDs are retained.
