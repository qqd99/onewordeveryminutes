const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "web/ai-picture.js"), "utf8");
const app = fs.readFileSync(path.join(root, "web/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const card = { id: "a1", front: "苹果", meaning: "apple", reading: "píng guǒ" };

function harness(options = {}) {
  const values = new Map();
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const context = {
    localStorage,
    AI_IMAGE_CONFIG: options.config || {geminiKey: "", approvalEndpoint: ""},
    indexedDB: options.indexedDB,
    fetch: options.fetch || (() => { throw new Error("Unexpected API call"); }),
    AbortController, setTimeout, clearTimeout,
    console: {warn() {}}
  };
  vm.runInNewContext(code, context);
  return {...context, api: context.AiPictureSupport, values};
}

function mockIndexedDb() {
  const data = new Map();
  const db = {
    objectStoreNames: {contains: () => false},
    createObjectStore() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            get(key) {
              const req = {};
              queueMicrotask(() => { req.result = data.get(key); req.onsuccess?.(); });
              return req;
            },
            put(record) {
              data.set(record.key, record);
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
    indexedDB: {
      open() {
        const req = {};
        queueMicrotask(() => {
          req.result = db;
          req.onupgradeneeded?.();
          req.onsuccess?.();
        });
        return req;
      }
    }
  };
}

test("Gemini API integration is in frontend but credential is absent from source control", () => {
  assert.match(code, /gemini-3\.1-flash-image/);
  assert.match(code, /x-goog-api-key/);
  assert.doesNotMatch(code, /AQ\.[A-Za-z0-9_-]{20,}/);
  assert.match(html, /aiGeminiKeyInput/);
  assert.match(html, /ai-image-config\.js\?v=32/);
  assert.match(html, /ai-picture\.js\?v=32/);
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8");
  assert.ok(workflow.includes("secrets.GEMINI_IMAGE_API_KEY"));
  assert.ok(workflow.includes("web/ai-image-config.js"));
});

test("Gemini prompt targets one word only and generated responses use inlineData", async () => {
  let calls = 0;
  const h = harness({
    config: {geminiKey:"AQ.testingkeyfortheunitmocktokenonly999", approvalEndpoint:""},
    fetch: async (url, init) => {
      calls += 1;
      assert.match(url, /gemini-3\.1-flash-image:generateContent$/);
      assert.equal(init.headers["x-goog-api-key"], "AQ.testingkeyfortheunitmocktokenonly999");
      const body = JSON.parse(init.body);
      assert.equal(body.contents.length, 1);
      assert.match(body.contents[0].parts[0].text, /苹果/);
      assert.match(body.contents[0].parts[0].text, /apple/);
      assert.deepEqual(Array.from(body.generationConfig.responseModalities), ["TEXT","IMAGE"]);
      return {
        ok: true,
        json: async () => ({candidates:[{content:{parts:[
          {text:"done"}, {inlineData:{mimeType:"image/png",data:"aGVsbG8="}}
        ]}}]})
      };
    }
  });
  const generated = await h.api.generate(card);
  assert.equal(generated.src, "data:image/png;base64,aGVsbG8=");
  assert.equal(generated.kind, "ai");
  assert.equal(generated.approved, false);
  assert.equal(calls, 1);
});

test("a browser key can override a configured deployment key", () => {
  const h = harness({config: {geminiKey:"AQ.deploymentbrowserkeytest99"}});
  assert.equal(h.api.getApiKey(), "AQ.deploymentbrowserkeytest99");
  h.api.setApiKey("AQ.overridebrowserkeytest999");
  assert.equal(h.api.getApiKey(), "AQ.overridebrowserkeytest999");
  h.api.setApiKey("");
  assert.equal(h.api.getApiKey(), "AQ.deploymentbrowserkeytest99");
});

test("Good approval persists to IndexedDB and can be reused after reloading", async () => {
  const db = mockIndexedDb();
  const h1 = harness({indexedDB: db.indexedDB});
  const image = {src:"data:image/png;base64,aGVsbG8=",kind:"ai",approved:false};
  const record = await h1.api.saveApproved(card, image);
  assert.equal(record.approved, true);
  assert.equal(record.front, "苹果");
  assert.equal((await h1.api.getApproved(card)).src, image.src);
  const h2 = harness({indexedDB: db.indexedDB});
  assert.equal((await h2.api.getApproved(card)).src, image.src);
  assert.equal(db.data.size, 1);
  assert.equal(await h2.api.getApproved({...card,meaning:"different"}), null);
});

test("unapproved images are session candidates and never automatically stored", async () => {
  const db = mockIndexedDb();
  const h = harness({indexedDB:db.indexedDB});
  const image = {src:"data:image/png;base64,aGVsbG8=",kind:"ai",approved:false};
  h.api.setCandidate(card,image);
  assert.equal(h.api.getCandidate(card), image);
  assert.equal(await h.api.getApproved(card), null);
  assert.equal(db.data.size, 0);
  h.api.clearCandidate(card);
  assert.equal(h.api.getCandidate(card), null);
});

test("approved image voting is attached exclusively to the target word", () => {
  const from = app.indexOf("  async function hydrateTargetAiPhoto(");
  const to = app.indexOf("  async function loadPicturePhotos(", from);
  const block = app.slice(from,to);
  assert.ok(from > 0 && to > from);
  assert.match(block, /const card = state\.currentCard, quiz = state\.currentQuiz/);
  assert.match(app, /const correctIndex = quiz\.choices\.findIndex\(choice => choice\.isCorrect\)/);
  assert.match(block, /AiPictureSupport\.generate\(card/);
  assert.match(block, /AiPictureSupport\.saveApproved\(card, quiz\.aiPicture\)/);
  assert.match(block, /state\.quizAnswered/);
  assert.match(html, /Good — save for this word/);
  assert.match(html, /Bad — regenerate this word only/);
  assert.doesNotMatch(block, /AiPictureSupport\.generate\(.*distractor/);
});

test("AI image options keep current local-photo fallback and reveal localized meanings", () => {
  assert.match(app, /Promise\.all\(\s*quiz\.choices\.map\(choice => PictureCatalog\.loadPhoto\(choice\.image\)\)/);
  assert.match(app, /Meaning:.*visibleCardMeaning/);
  assert.match(app, /void hydrateTargetAiPhoto\(card, quiz\)/);
  const css = fs.readFileSync(path.join(root, "web/style.css"), "utf8");
  assert.match(css, /ai-picture-review/);
  assert.match(css, /object-fit: contain/);
});
