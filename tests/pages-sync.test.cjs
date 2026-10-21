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
    assert.match(html, /translation\.js\?v=21/);
    assert.ok(fs.existsSync(path.join(root, directory, "translation.js")));
  }
});
