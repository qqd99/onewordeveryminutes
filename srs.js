const MINUTE_MS = 60 * 1000;

function defaultCardProgress() {
  return {
    repetitions: 0,
    intervalMinutes: 0,
    easeFactor: 2.3,
    dueAt: 0,
    lastShownAt: 0,
    lastReviewedAt: 0,
    lapses: 0,
    remembered: 0,
    forgotten: 0
  };
}

function normalizeProgress(value) {
  return { ...defaultCardProgress(), ...(value || {}) };
}

function normalizeDisplayInterval(minutes = 30) {
  return Math.min(1440, Math.max(1, Math.round(Number(minutes) || 30)));
}

/**
 * Adaptive per-card scheduling.
 *
 * The user controls only how often the extension displays a card. Each word
 * keeps its own interval and ease factor. Consecutive Remember answers grow
 * that word's interval; Forget lowers its ease and makes it due at the next
 * display opportunity.
 */
function reviewRemember(progress, displayIntervalMinutes = 30, now = Date.now()) {
  const next = normalizeProgress(progress);
  const displayMinutes = normalizeDisplayInterval(displayIntervalMinutes);
  const previousInterval = Math.max(displayMinutes, Number(next.intervalMinutes) || 0);
  const previousDueAt = Number(next.dueAt) || 0;
  const previousRepetitions = Math.max(0, Number(next.repetitions) || 0);

  // A small overdue bonus rewards successful recall after a longer delay,
  // without allowing one late review to create an extreme jump.
  const overdueMinutes = previousDueAt > 0
    ? Math.max(0, (now - previousDueAt) / MINUTE_MS)
    : 0;
  const overdueRatio = previousInterval > 0
    ? Math.min(0.35, overdueMinutes / previousInterval * 0.15)
    : 0;

  if (previousRepetitions === 0) {
    // First successful recall, or first success after a lapse.
    next.intervalMinutes = Math.max(displayMinutes * 2, Math.round(previousInterval * 1.5));
  } else {
    const growth = Math.max(1.35, next.easeFactor + overdueRatio);
    next.intervalMinutes = Math.max(
      displayMinutes * 2,
      Math.round(previousInterval * growth)
    );
  }

  next.repetitions = previousRepetitions + 1;
  next.easeFactor = Math.min(3.2, next.easeFactor + 0.08);
  next.lastReviewedAt = now;
  next.lastShownAt = now;
  next.dueAt = now + next.intervalMinutes * MINUTE_MS;
  next.remembered += 1;
  return next;
}

function reviewForget(progress, displayIntervalMinutes = 30, now = Date.now()) {
  const next = normalizeProgress(progress);
  const displayMinutes = normalizeDisplayInterval(displayIntervalMinutes);

  // A forgotten word becomes eligible at the next card-display opportunity.
  next.repetitions = 0;
  next.intervalMinutes = displayMinutes;
  next.easeFactor = Math.max(1.3, next.easeFactor - 0.25);
  next.lastReviewedAt = now;
  next.lastShownAt = now;
  next.dueAt = now + displayMinutes * MINUTE_MS;
  next.lapses += 1;
  next.forgotten += 1;
  return next;
}

function markShown(progress, displayIntervalMinutes = 30, now = Date.now()) {
  const next = normalizeProgress(progress);
  next.lastShownAt = now;

  // For a never-reviewed card, prevent it from re-entering the selector within
  // the same display slot. Reviewed cards keep their genuine SRS due date.
  if (!next.lastReviewedAt && (!next.dueAt || next.dueAt <= now)) {
    next.dueAt = now + normalizeDisplayInterval(displayIntervalMinutes) * MINUTE_MS;
  }
  return next;
}

function formatInterval(minutes) {
  const rounded = Math.max(1, Math.round(Number(minutes) || 1));
  if (rounded < 60) return `${rounded} minute${rounded === 1 ? "" : "s"}`;
  if (rounded < 1440) {
    const hours = Math.round(rounded / 60);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(rounded / 1440);
  return `${days} day${days === 1 ? "" : "s"}`;
}
