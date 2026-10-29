const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");

function listFiles(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(prefix, entry.name);
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(fullPath, relativePath)
        : [relativePath];
    }).sort();
}

test("GitHub Pages docs/ mirrors web/ byte-for-byte", () => {
  // GitHub Pages currently has two potential publishers: its branch-based
  // docs/ build and .github/workflows/deploy.yml, which uploads web/.
  // If these directories drift, the last deployment to finish can expose
  // an old site even after the web/ workflow reports success.
  const webPath = path.join(root, "web");
  const docsPath = path.join(root, "docs");
  const webFiles = listFiles(webPath);
  const docsFiles = listFiles(docsPath);
  assert.deepEqual(docsFiles, webFiles, "Both publishable site trees must have the same files");

  for (const relativePath of webFiles) {
    const web = fs.readFileSync(path.join(webPath, relativePath));
    const docs = fs.readFileSync(path.join(docsPath, relativePath));
    assert.equal(
      crypto.createHash("sha256").update(docs).digest("hex"),
      crypto.createHash("sha256").update(web).digest("hex"),
      `Outdated GitHub Pages file: docs/${relativePath}. Copy web/${relativePath} to docs/${relativePath}.`
    );
  }
});

test("both published paths expose the two new audio switches", () => {
  for (const directory of ["web", "docs"]) {
    const html = fs.readFileSync(path.join(root, directory, "index.html"), "utf8");
    assert.match(html, /id="readWordToggle"/);
    assert.match(html, /id="readSentenceToggle"/);
    assert.doesNotMatch(html, /id="autoSpeakToggle"/);
  }
});

test("both published pages expose the translated-meaning selector and helper", () => {
  for (const directory of ["web", "docs"]) {
    const html = fs.readFileSync(path.join(root, directory, "index.html"), "utf8");
    assert.match(html, /id="meaningLanguageSelect"/);
    assert.match(html, /id="translateTargetSelect"/);
    assert.match(html, /translation\.js\?v=\d+/);
    assert.ok(fs.existsSync(path.join(root, directory, "translation.js")));
  }
});

test("both published pages allow ten word repetitions", () => {
  for (const directory of ["web", "docs"]) {
    const html = fs.readFileSync(path.join(root, directory, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(root, directory, "app.js"), "utf8");
    assert.ok(html.includes('id="wordRepeatCount" class="input-number" min="1" max="10"'));
    assert.ok(html.includes("app.js?v=35"));
    assert.ok(app.includes("const count = Math.min(10, Math.max(1, Math.round(Number(repeat) || 2)));"));
    assert.ok(!app.includes("const count = Math.min(5, Math.max(1, Math.round(Number(repeat) || 2)));"));
  }
});

test("both published pages use the bundled photographic dataset", () => {
  for (const directory of ["web", "docs"]) {
    const html = fs.readFileSync(path.join(root, directory, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(root, directory, "app.js"), "utf8");
    const catalog = fs.readFileSync(path.join(root, directory, "picture-catalog.js"), "utf8");
    const sw = fs.readFileSync(path.join(root, directory, "sw.js"), "utf8");
    assert.match(html, /value="chinese-to-picture"/);
    assert.match(html, /picture-catalog\.js\?v=30/);
    assert.match(app, /buildPictureQuiz/);
    assert.match(catalog, /PictureCatalog/);
    assert.ok(catalog.includes("photos/apple.jpg"));
    assert.ok(!catalog.includes("imageQueryUrl"));
    assert.ok(html.includes('id="wordLoopPanel"'));
    assert.match(catalog, /imageHref/);
    assert.match(html, /photoRetryBtn/);
    assert.match(sw, /vocab-srs-cache-v35/);
  }
});

test("Wikimedia Commons picture search and fallback stay synchronized across publication directories", () => {
  for (const name of ["internet-picture.js", "ai-image-config.js", "app.js", "index.html", "style.css", "sw.js"]) {
    const a = fs.readFileSync(path.join(root, "web", name));
    const b = fs.readFileSync(path.join(root, "docs", name));
    assert.deepEqual(a, b, name + " must match in web and docs");
  }
  const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
  const cache = fs.readFileSync(path.join(root, "web/sw.js"), "utf8");
  assert.ok(html.includes("internet-picture.js?v=34"));
  assert.ok(html.includes("ai-image-config.js?v=34"));
  assert.ok(html.includes("style.css?v=35"));
  assert.ok(cache.includes("vocab-srs-cache-v35"));
  assert.ok(cache.includes("internet-picture.js?v=34"));
});
