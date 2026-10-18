const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");

function section(first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start, "Missing app section: " + first);
  return source.slice(start, end);
}

test("choosing a quiz answer does not create an in-page toast", () => {
  const answer = section("  function handleQuizAnswer(", "  function presentNextCard(");
  assert.doesNotMatch(answer, /showToast\(/);
  assert.match(answer, /rateCurrentCard\(/);
  assert.match(answer, /forgetConfusedDistractor\(/);
});

test("reminder card changes do not create an in-page toast", () => {
  const reminder = section("  function triggerReminder()", "  /* -------------------------------------------------------------\n     8B. TRANSLATE");
  assert.doesNotMatch(reminder, /showToast\(/);
  assert.match(reminder, /presentNextCard\(\{ autoPlay: true \}\)/);
});

test("optional browser system notification remains available", () => {
  const reminder = section("  function triggerReminder()", "  /* -------------------------------------------------------------\n     8B. TRANSLATE");
  assert.match(reminder, /new Notification\("Vocabulary SRS Reminder"/);
  assert.match(reminder, /notificationsEnabled/);
});
