const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const dir = path.join(root, "web");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "vocabulary.json"), "utf8"));
const previous = JSON.parse(fs.readFileSync(path.join(root, "vocabulary.json"), "utf8"));
const cards = manifest.packs[0].cards;
const shards = manifest.packs[0].cardFiles.map(name =>
  JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
);
const added = shards.flat();
const all = [...cards, ...added];

test("the GitHub Pages catalog contains exactly 10,000 unique Chinese cards", () => {
  assert.equal(manifest.packs[0].expectedCardCount, 10000);
  assert.equal(cards.length, 1000);
  assert.equal(shards.length, 6);
  assert.ok(shards.every(group => group.length === 1500));
  assert.equal(added.length, 9000);
  assert.equal(all.length, 10000);
  assert.equal(new Set(all.map(card => card.id)).size, 10000);
  assert.equal(new Set(all.map(card => card.front)).size, 10000);
});

test("all original cards remain exactly unchanged for existing SRS saves", () => {
  assert.deepEqual(cards, previous.packs[0].cards);
  assert.equal(manifest.packs[0].id, previous.packs[0].id);
});

test("all new cards have Chinese spelling, pinyin, English meaning, and provenance", () => {
  for (const card of added) {
    assert.match(card.id, /^cw-[a-f0-9-]+$/);
    assert.match(card.front, /[\u3400-\u9fff]/u);
    assert.ok(card.reading.trim(), "Missing pinyin for " + card.front);
    assert.ok(card.meaning.trim(), "Missing meaning for " + card.front);
    assert.doesNotMatch(card.meaning, /[\u3400-\u9fff]/u, card.front + " should have an English meaning");
    assert.ok(Number.isFinite(card.frequencyRank));
    assert.ok(card.sourceId);
    assert.ok(Array.isArray(card.sourceIds) && card.sourceIds.length > 0);
    assert.equal(card.meaningSource.license, "CC-BY-SA-4.0");
    assert.ok(card.meaningSource.sourceKey, "Missing source key on " + card.front);
  }
});

test("added vocabulary follows source frequency ranks, without skipping examples unnecessarily", () => {
  let previousRank = -Infinity;
  let withExample = 0;
  for (const card of added) {
    assert.ok(card.frequencyRank >= previousRank);
    previousRank = card.frequencyRank;
    if (card.example) {
      withExample++;
      assert.ok(card.example.text);
      assert.ok(card.example.reading);
      assert.ok(card.example.meaning);
      assert.equal(card.example.license, "CC-BY-SA-4.0");
      assert.ok(card.example.sourceId);
      assert.ok(Array.isArray(card.example.words), "Precomputed breakdown array must exist");
    }
  }
  assert.ok(withExample >= 8900, "Most new cards must have graded example sentences");
});

test("the web app loads and validates all vocabulary chunks before initializing a pack", async () => {
  const source = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  const first = source.indexOf("  async function expandVocabularyCatalog(");
  const last = source.indexOf("  async function init()", first);
  assert.ok(first >= 0 && last > first);
  const fetched = [];
  const context = {
    fetch: async name => {
      fetched.push(name);
      return {
        ok: true,
        json: async () => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
      };
    },
    Error
  };
  vm.runInNewContext(source.slice(first, last) +
    "\nglobalThis.expand = expandVocabularyCatalog;", context);
  const cat = JSON.parse(fs.readFileSync(path.join(dir, "vocabulary.json"), "utf8"));
  const expanded = await context.expand(cat);
  assert.equal(expanded.packs[0].cards.length, 10000);
  assert.deepEqual(fetched, manifest.packs[0].cardFiles);
  assert.deepEqual(expanded.packs[0].cards.slice(0, 1000), previous.packs[0].cards);
});

test("missing/corrupt vocabulary chunk fails instead of silently showing only 1,000 cards", async () => {
  const source = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  const first = source.indexOf("  async function expandVocabularyCatalog(");
  const last = source.indexOf("  async function init()", first);
  const context = {
    fetch: async () => ({ok: false, status: 404}),
    Error
  };
  vm.runInNewContext(source.slice(first, last) +
    "\nglobalThis.expand = expandVocabularyCatalog;", context);
  const fresh = JSON.parse(fs.readFileSync(path.join(dir, "vocabulary.json"), "utf8"));
  await assert.rejects(context.expand(fresh), /Could not load/);
});

test("service worker precaches all six vocabulary chunks for offline learning", () => {
  const sw = fs.readFileSync(path.join(dir, "sw.js"), "utf8");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(sw, /vocab-srs-cache-v19/);
  assert.match(html, /app\.js\?v=19/);
  assert.match(sw, /translation\\.js/);
  for (const name of manifest.packs[0].cardFiles) {
    assert.ok(sw.includes("./" + name), "PWA cache is missing " + name);
  }
});

test("vocabulary attribution and redistribution license are present", () => {
  const attribution = fs.readFileSync(path.join(dir, "VOCABULARY_SOURCES.md"), "utf8");
  assert.match(attribution, /Zhongdex by SayMei/);
  assert.match(attribution, /CC BY-SA 4\.0/);
  assert.match(attribution, /CC-CEDICT/);
  assert.ok(manifest.vocabularySources.length > 0);
});

test("both quiz modes have many same-length Chinese choices in the 10,000-word pack", () => {
  const lengths = new Map();
  for (const card of all) {
    const length = Array.from(card.front).length;
    lengths.set(length, (lengths.get(length) || 0) + 1);
  }
  for (const length of [1,2,3,4]) {
    assert.ok(lengths.get(length) >= 3, "Mode 2 has insufficient " + length + "-character options");
  }
});
