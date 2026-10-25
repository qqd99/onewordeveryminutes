/* Browser-side Gemini word-image generation and approval database.
 * The published runtime config can supply a shared public key from a Pages
 * deployment secret; visitors can instead enter a key in Settings.
 */
(function(root) {
  "use strict";
  const MODEL = "gemini-3.1-flash-image";
  const DB_NAME = "vocab_srs_word_images_v1";
  const STORE = "approved";
  const memory = new Map();
  const candidates = new Map();
  let openPromise;

  function keyFor(card) {
    return JSON.stringify([
      String(card?.front || "").normalize("NFC").trim(),
      String(card?.meaning || "").trim().toLowerCase().replace(/\s+/g, " ")
    ]);
  }
  function getApiKey() {
    try {
      return String(root.localStorage?.getItem("vocab_srs_gemini_key_v1")
        || root.AI_IMAGE_CONFIG?.geminiKey || "").trim();
    } catch (_) { return String(root.AI_IMAGE_CONFIG?.geminiKey || "").trim(); }
  }
  function setApiKey(key) {
    const normalized = String(key || "").trim();
    if (normalized && !/^(?:AQ\.|AIza)[A-Za-z0-9_.-]{15,}$/.test(normalized)) {
      throw new Error("Enter a Gemini API key from Google AI Studio.");
    }
    if (!root.localStorage) throw new Error("Browser storage is unavailable.");
    if (normalized) root.localStorage.setItem("vocab_srs_gemini_key_v1", normalized);
    else root.localStorage.removeItem("vocab_srs_gemini_key_v1");
  }
  function promptFor(card) {
    const word = String(card?.front || "").trim().slice(0, 40);
    const gloss = String(card?.meaning || "").trim().slice(0, 180);
    if (!word || !gloss) throw new Error("Missing vocabulary word or definition.");
    return [
      "Create ONE unambiguous color educational illustration for a Mandarin vocabulary card.",
      "Chinese word: " + JSON.stringify(word),
      "The precise dictionary meaning to depict: " + JSON.stringify(gloss),
      "Depict only that concrete object, animal, setting or obvious physical action.",
      "Centered main subject with enough space around it to fit without cropping.",
      "Natural colors, realistic detail, clear simple background and recognisable silhouettes.",
      "Avoid unrelated people or objects. No letters, Chinese characters, labels, captions, watermarks or typography.",
      "This illustration must be immediately recognisable by a language learner."
    ].join("\n");
  }
  function openDb() {
    if (!root.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable."));
    if (!openPromise) {
      openPromise = new Promise((resolve, reject) => {
        const req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE, {keyPath: "key"});
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("Cannot open the image database."));
        req.onblocked = () => reject(new Error("Image database is blocked by another tab."));
      }).catch(error => { openPromise = null; throw error; });
    }
    return openPromise;
  }
  async function getApproved(card) {
    const key = keyFor(card);
    if (memory.has(key)) return memory.get(key);
    if (!root.indexedDB) return getSharedApproved(card);
    try {
      const db = await openDb();
      const record = await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error("Image database read failed."));
      });
      if (record) memory.set(key, record);
      return record || await getSharedApproved(card);
    } catch (error) {
      console.warn("Approved picture lookup unavailable:", error);
      return getSharedApproved(card);
    }
  }
  async function getSharedApproved(card) {
    const endpoint = String(root.AI_IMAGE_CONFIG?.approvalEndpoint || "").trim();
    if (!/^https:\/\//i.test(endpoint)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const url = endpoint.replace(/\/+$/, "") + "/approvals?key=" + encodeURIComponent(keyFor(card));
      const response = await fetch(url, {signal: controller.signal, credentials: "omit", mode: "cors"});
      if (!response.ok) return null;
      const result = await response.json();
      const src = String(result?.src || "");
      if (!/^https:\/\//i.test(src) && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(src)) return null;
      const approved = {key: keyFor(card), src, kind: "ai", approved: true, model: result.model || MODEL};
      memory.set(approved.key, approved);
      return approved;
    } catch (_) { return null; }
    finally { clearTimeout(timer); }
  }
  async function saveApproved(card, picture) {
    if (!picture?.src || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(picture.src)) {
      throw new Error("Only AI-generated pictures may be saved.");
    }
    const key = keyFor(card);
    const record = {
      key, front: String(card.front), meaning: String(card.meaning),
      src: picture.src, model: MODEL, kind: "ai", approved: true,
      approvedAt: new Date().toISOString()
    };
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not save the image."));
      tx.onabort = () => reject(tx.error || new Error("Image saving was aborted."));
    });
    memory.set(key, record);
    candidates.delete(key);
    return record;
  }
  function getCandidate(card) { return candidates.get(keyFor(card)) || null; }
  function setCandidate(card, image) { candidates.set(keyFor(card), image); }
  function clearCandidate(card) { candidates.delete(keyFor(card)); }

  async function generate(card, {signal} = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("No Gemini API key configured. Enter one in Settings.");
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
      {
        method: "POST", credentials: "omit", mode: "cors", signal,
        headers: {"Content-Type": "application/json", "x-goog-api-key": apiKey},
        body: JSON.stringify({
          contents: [{role: "user", parts: [{text: promptFor(card)}]}],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {aspectRatio: "4:3", imageSize: "512"}
          }
        })
      }
    );
    if (!response.ok) {
      let detail = "";
      try { detail = String((await response.json())?.error?.message || "").slice(0, 180); }
      catch (_) { /* HTTP status is enough. */ }
      throw new Error("Gemini error HTTP " + response.status + (detail ? ": " + detail : ""));
    }
    const data = await response.json();
    const media = (data?.candidates?.[0]?.content?.parts || [])
      .map(item => item.inlineData || item.inline_data)
      .find(item => item?.data && /^image\/(?:png|jpeg|webp)$/i.test(item.mimeType || item.mime_type || ""));
    if (!media) throw new Error("Gemini returned no image for this word.");
    if (media.data.length > 12000000) throw new Error("Generated image exceeds the storage limit.");
    return {
      src: "data:" + (media.mimeType || media.mime_type) + ";base64," + media.data,
      model: MODEL, kind: "ai", approved: false
    };
  }

  async function syncShared(record) {
    const endpoint = String(root.AI_IMAGE_CONFIG?.approvalEndpoint || "").trim();
    if (!endpoint) return {shared: false, reason: "No shared image database endpoint configured."};
    if (!/^https:\/\//i.test(endpoint)) throw new Error("Shared database URL must use HTTPS.");
    const response = await fetch(endpoint.replace(/\/+$/, "") + "/approvals", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(record), mode: "cors"
    });
    if (!response.ok) throw new Error("Shared image database rejected approval (HTTP " + response.status + ").");
    return {shared: true};
  }

  root.AiPictureSupport = Object.freeze({
    keyFor, getApiKey, setApiKey, promptFor, getApproved, saveApproved,
    getCandidate, setCandidate, clearCandidate, getSharedApproved,
    generate, syncShared, model: MODEL
  });
})(typeof window !== "undefined" ? window : globalThis);
