const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "web/internet-picture.js"), "utf8");
const app = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const card = {id: "apple", front: "苹果", meaning: "apple"};
const prefix = "https://upload.wikimedia.org/wikipedia/commons/thumb/";
function image(pageId, filename, license = "CC BY-SA 4.0") {
  return {
    pageid: pageId,
    title: "File:" + filename,
    imageinfo: [{
      mime: "image/jpeg",
      thumburl: prefix + pageId + "/" + filename.replaceAll(" ", "_"),
      descriptionurl: "https://commons.wikimedia.org/wiki/File:" + filename.replaceAll(" ", "_"),
      extmetadata: {
        LicenseShortName: {value: license},
        LicenseUrl: {value: "https://creativecommons.org/licenses/by-sa/4.0/"},
        Artist: {value: "<a>Test photographer</a>"}
      }
    }]
  };
}
function harness(options = {}) {
  const ctx = {
    URLSearchParams, URL, AbortController, setTimeout, clearTimeout, console: {warn() {}},
    indexedDB: options.indexedDB,
    AI_IMAGE_CONFIG: options.config || {approvalEndpoint: ""},
    fetch: options.fetch || (() => {throw Error("Unexpected network request.");}),
    Image: options.Image || class {
      set src(value) { this.value = value; queueMicrotask(() => this.onload?.()); }
    }
  };
  vm.runInNewContext(code, ctx);
  return ctx.InternetPictureSupport;
}
function mockDb() {
  const data = new Map();
  const db = {
    objectStoreNames: {contains() {return false;}},
    createObjectStore() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            get(key) {
              const req = {};
              queueMicrotask(() => {req.result = data.get(key); req.onsuccess?.();});
              return req;
            },
            put(record) {
              data.set(record.key, record);
              queueMicrotask(() => tx.oncomplete?.());
            },
            delete(key) {
              data.delete(key);
              queueMicrotask(() => tx.oncomplete?.());
            }
          };
        }
      };
      return tx;
    }
  };
  return {
    data,
    indexedDB: {open() {
      const req = {};
      queueMicrotask(() => {req.result = db; req.onupgradeneeded?.(); req.onsuccess?.();});
      return req;
    }}
  };
}

test("Mode 3 searches Wikimedia Commons without Gemini or a browser API key", () => {
  assert.match(code, /commons\.wikimedia\.org\/w\/api\.php/);
  assert.match(code, /origin: "\*"/);
  assert.match(code, /gsrnamespace: "6"/);
  assert.match(code, /iiprop: "url\|mime\|extmetadata"/);
  assert.doesNotMatch(code, /generativelanguage|gemini.*key|x-goog-api-key/i);
  assert.match(html, /internet-picture\.js\?v=34/);
  assert.doesNotMatch(html, /aiGeminiKeyInput|Gemini API key/);
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8");
  assert.doesNotMatch(workflow, /GEMINI_IMAGE_API_KEY|PUBLIC_GEMINI_KEY/);
});

test("Wikimedia photo search filters out non-free/diagram/untrusted images and preserves attribution", () => {
  const api = harness();
  const valid = image(1, "Red apple.jpg");
  const permitted = api.commonsPhoto(valid);
  assert.equal(permitted.kind, "internet");
  assert.equal(permitted.license, "CC BY-SA 4.0");
  assert.equal(permitted.attribution, "Test photographer");
  assert.match(permitted.sourceUrl, /commons\.wikimedia\.org/);
  assert.match(permitted.licenseUrl, /creativecommons\.org/);
  const icon = image(2, "Apple icon.jpg");
  assert.equal(api.commonsPhoto(icon), null);
  const svg = image(3, "Apple drawing.svg");
  assert.equal(api.commonsPhoto(svg), null);
  const nonfree = image(4, "Red apple.jpg", "All rights reserved");
  nonfree.imageinfo[0].extmetadata.LicenseUrl.value = "";
  assert.equal(api.commonsPhoto(nonfree), null);
  const unsafe = image(5, "Red apple.jpg");
  unsafe.imageinfo[0].thumburl = "javascript:alert(1)";
  assert.equal(api.commonsPhoto(unsafe), null);
});

test("only one target word is searched and Bad selects a different image", async () => {
  const calls = [];
  const api = harness({
    fetch: async url => {
      calls.push(url);
      return {ok: true, json: async () => ({
        query: {pages: [image(1,"Red apple.jpg"),image(2,"Green apple.jpg")]}
      })};
    }
  });
  const first = await api.findFor(card);
  assert.match(first.src, /Red_apple/);
  const again = await api.findFor(card);
  assert.equal(first.src, again.src);
  const second = await api.findFor(card, {next: true});
  assert.match(second.src, /Green_apple/);
  assert.notEqual(first.src, second.src);
  assert.equal(calls.length, 1);
  assert.ok(new URL(calls[0]).searchParams.get("gsrsearch").includes("apple"));
});

test("Good approval stores only a vetted Commons link and reuses it across browser reloads", async () => {
  const db = mockDb();
  const a = harness({indexedDB: db.indexedDB});
  const photo = a.commonsPhoto(image(1,"Red apple.jpg"));
  a.setCandidate(card, photo);
  assert.equal(await a.getApproved(card), null);
  assert.equal(db.data.size, 0, "Unapproved candidates must not be saved");
  const approved = await a.saveApproved(card, photo);
  assert.equal(approved.kind, "internet");
  assert.equal(approved.approved, true);
  assert.equal(db.data.size, 1);
  const b = harness({indexedDB: db.indexedDB});
  assert.equal((await b.getApproved(card)).src, photo.src);
  assert.equal(await b.getApproved({...card, meaning: "different"}), null);
  await b.rejectApproved(card);
  assert.equal(db.data.size, 0);
});

test("internet-searchable excludes common particles and ambiguous function words", () => {
  const api = harness();
  assert.equal(api.isSearchable(card), true);
  assert.equal(api.isSearchable({front: "河", meaning: "river"}), true);
  assert.equal(api.isSearchable({front: "你好", meaning: "hello"}), false);
  assert.equal(api.isSearchable({front: "轻", meaning: "light"}), false);
  assert.equal(api.isSearchable({front: "的", meaning: "of"}), false);
});

test("picture rating applies to correct choice only and leaves two local distractors alone", () => {
  const start = app.indexOf("  // A picture search, approval or rejection always belongs");
  const end = app.indexOf("  function renderCard(", start);
  const block = app.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(block, /quiz\.choices\.findIndex\(choice => choice\.isCorrect\)/);
  assert.match(block, /InternetPictureSupport\.findFor\(card/);
  assert.match(block, /InternetPictureSupport\.saveApproved\(card, quiz\.aiPicture\)/);
  assert.match(block, /state\.quizAnswered/);
  assert.match(block, /choice\.isCorrect && !choice\.image/);
  assert.match(block, /PictureCatalog\.loadPhoto\(choice\.image\)/);
  assert.match(block, /InternetPictureSupport\.rejectApproved\(card\)/);
  assert.match(html, /Good — save for this word/);
  assert.match(html, /Bad — find another photo for this word/);
});

test("remote image failure preserves local fallback and does not expose meanings", () => {
  const block = app.slice(app.indexOf("  async function hydrateTargetAiPhoto("),
    app.indexOf("  function renderCard("));
  assert.match(block, /Commons picture lookup unavailable/);
  assert.match(block, /Photos unavailable/);
  assert.match(app, /link.href = photo.sourceUrl/);
  assert.match(app, /isPictureMode\(\) \? visibleCardMeaning/);
  assert.match(html, /Wikimedia Commons/);
  const css = fs.readFileSync(path.join(root, "web/style.css"), "utf8");
  assert.match(css, /object-fit: contain/);
});
