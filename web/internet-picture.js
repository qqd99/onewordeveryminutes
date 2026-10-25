/* Freely licensed image lookup for the current vocabulary word only.
 * Search: Wikimedia Commons MediaWiki API, browser CORS, no API key.
 * Good votes persist metadata and the image URL in IndexedDB; a shared
 * database is optional and only enabled if a writable endpoint is configured.
 */
(function(root) {
  "use strict";
  const DB_NAME = "vocab_srs_word_images_v1";
  const STORE = "approved";
  const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
  const memory = new Map();
  const candidates = new Map();
  const searches = new Map();
  let openPromise;

  function keyFor(card) {
    return JSON.stringify([
      String(card?.front || "").normalize("NFC").trim(),
      String(card?.meaning || "").trim().toLowerCase().replace(/\s+/g, " ")
    ]);
  }

  function isSearchable(card) {
    const word = String(card?.front || "").trim();
    const meaning = String(card?.meaning || "").trim();
    if (!/[\u3400-\u9fff]/u.test(word) || !meaning || meaning.length > 100) return false;
    if (/^(?:a|an|the|of|to|and|or|but|if|that|this|these|those|it|is|are|was|were|be|been|being|do|does|did|not|no|yes|very|also|too|already|because|however|hello|thanks|thank you|please|sorry|which|who|what|why|how|can|may|should|must|will|would|could|shall|have|has|had|with|without|from|for|at|in|on|by|as|about|than|then|there|here|some|any|every|many|much|few|more|less|most|only|just|quite|light|right|fine|good|bad|even|yet|still)$/i.test(meaning)) return false;
    return true;
  }

  function findQuery(card) {
    const gloss = String(card?.meaning || "").trim().toLowerCase();
    const firstSense = gloss.split(/[;/，；]|\s+\bor\b\s+|\s+\bto\b\s+/u)[0].trim();
    return (firstSense || gloss).replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").slice(0, 85);
  }

  function urlIsSafe(value, hosts) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        hosts.some(host => url.hostname === host || url.hostname.endsWith("." + host));
    } catch (_) { return false; }
  }
  function safeMetadataUrl(value) {
    return urlIsSafe(value, ["creativecommons.org", "wikimedia.org"]) ? value : "";
  }
  function plainText(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|#160);/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ").trim().slice(0, 200);
  }
  function commonsPhoto(page) {
    if (!/^File:/i.test(String(page?.title || ""))) return null;
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/(?:jpeg|png|webp)$/i.test(info.mime || "")) return null;
    const src = info.thumburl || info.url;
    if (!urlIsSafe(src, ["wikimedia.org"])) return null;
    const sourceUrl = info.descriptionurl;
    if (!urlIsSafe(sourceUrl, ["commons.wikimedia.org"])) return null;
    const md = info.extmetadata || {};
    const license = plainText(md.LicenseShortName?.value || md.UsageTerms?.value);
    const licenseUrl = safeMetadataUrl(md.LicenseUrl?.value || "");
    const permitted = /^(?:CC0|CC[- ]BY(?:[- ]SA)?\b|Public domain\b|PD[- ])|^CC BY(?:-SA)?\b/i.test(license) ||
      /creativecommons\.org\/(?:licenses\/by(?:-sa)?\/|publicdomain\/)/i.test(licenseUrl);
    if (!permitted || /\b(?:NC|ND)\b|noncommercial|no.derivatives/i.test(license)) return null;
    if (/(?:\bicon\b|\blogo\b|\bmap\b|\bflag\b|coat of arms|svg|diagram|drawing|pictogram|emoji|symbol)/i.test(page.title)) return null;
    return {
      src,
      sourceUrl,
      licenseUrl: licenseUrl || sourceUrl,
      license: license || "Open license (see source)",
      attribution: plainText(md.Artist?.value || md.Credit?.value || page.title),
      title: page.title.slice(5),
      kind: "internet",
      approved: false
    };
  }
  function searchState(card) {
    const key = keyFor(card);
    if (!searches.has(key)) searches.set(key, {
      results: [], seen: new Set(), rejected: new Set(), offset: 0, exhausted: false
    });
    return searches.get(key);
  }
  async function searchCommons(card, {signal} = {}) {
    const state = searchState(card);
    if (state.exhausted) return;
    const params = new URLSearchParams({
      action: "query", format: "json", formatversion: "2",
      generator: "search", gsrsearch: findQuery(card),
      gsrnamespace: "6", gsrlimit: "20", gsroffset: String(state.offset),
      prop: "imageinfo", iiprop: "url|mime|extmetadata",
      iiurlwidth: "620",
      iiextmetadatafilter: "LicenseShortName|LicenseUrl|UsageTerms|Artist|Credit",
      origin: "*"
    });
    const response = await fetch(COMMONS_API + "?" + params.toString(), {
      method: "GET", mode: "cors", credentials: "omit", signal
    });
    if (!response.ok) throw new Error("Wikimedia Commons search failed (HTTP " + response.status + ").");
    const payload = await response.json();
    if (payload.error) throw new Error("Commons search: " + String(payload.error.info || payload.error.code).slice(0, 130));
    const pages = payload.query?.pages || [];
    for (const page of pages) {
      const image = commonsPhoto(page);
      if (image && !state.seen.has(image.src)) {
        state.seen.add(image.src);
        state.results.push(image);
      }
    }
    if (payload.continue?.gsroffset != null && Number(payload.continue.gsroffset) > state.offset) {
      state.offset = Number(payload.continue.gsroffset);
    } else state.exhausted = true;
  }
  function checkImage(src, {signal} = {}) {
    return new Promise((resolve, reject) => {
      const picture = new Image();
      let finished = false;
      function finish(ok) {
        if (finished) return;
        finished = true;
        picture.onload = picture.onerror = null;
        signal?.removeEventListener("abort", abort);
        if (ok) resolve(src);
        else reject(new Error("Image file could not load."));
      }
      const abort = () => { picture.src = ""; finish(false); };
      if (signal?.aborted) { reject(new Error("Search cancelled.")); return; }
      signal?.addEventListener("abort", abort, {once: true});
      picture.onload = () => finish(true);
      picture.onerror = () => finish(false);
      picture.referrerPolicy = "no-referrer";
      picture.src = src;
    });
  }

  function getCandidate(card) { return candidates.get(keyFor(card)) || null; }
  function setCandidate(card, picture) { candidates.set(keyFor(card), picture); }
  function clearCandidate(card) {
    const key = keyFor(card);
    const current = candidates.get(key);
    if (current?.src) searchState(card).rejected.add(current.src);
    candidates.delete(key);
  }

  async function findFor(card, {signal, next = false} = {}) {
    if (!isSearchable(card)) throw new Error("This word does not have a clear searchable picture meaning.");
    if (next) clearCandidate(card);
    else {
      const old = getCandidate(card);
      if (old) return old;
    }
    const state = searchState(card);
    let tries = 0;
    while (tries < 4) {
      if (signal?.aborted) throw new Error("Search cancelled.");
      const photo = state.results.find(p => !state.rejected.has(p.src));
      if (photo) {
        state.rejected.add(photo.src); // Never offer the same candidate again after Bad.
        try {
          await checkImage(photo.src, {signal});
          setCandidate(card, photo);
          return photo;
        } catch (error) {
          if (signal?.aborted) throw error;
          continue;
        }
      }
      if (state.exhausted) break;
      await searchCommons(card, {signal});
      tries += 1;
    }
    throw new Error("No usable, openly licensed photo found. Try another word or retry the lookup.");
  }

  function openDb() {
    if (!root.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable."));
    if (!openPromise) openPromise = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, {keyPath: "key"});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Image database failed."));
      request.onblocked = () => reject(new Error("Image database is blocked by another tab."));
    }).catch(error => {openPromise = null; throw error;});
    return openPromise;
  }
  async function getSharedApproved(card) {
    const endpoint = String(root.AI_IMAGE_CONFIG?.approvalEndpoint || "").trim();
    if (!/^https:\/\//i.test(endpoint)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(endpoint.replace(/\/+$/, "") +
        "/approvals?key=" + encodeURIComponent(keyFor(card)), {
        signal: controller.signal, mode: "cors", credentials: "omit"
      });
      if (!response.ok) return null;
      const record = await response.json();
      if (!urlIsSafe(record?.src, ["wikimedia.org"])) return null;
      if (!urlIsSafe(record?.sourceUrl, ["commons.wikimedia.org"])) return null;
      const photo = {...record, kind: "internet", approved: true, key: keyFor(card)};
      memory.set(photo.key, photo);
      return photo;
    } catch (_) { return null; }
    finally { clearTimeout(timer); }
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
      if (record?.kind === "internet" && urlIsSafe(record.src, ["wikimedia.org"])) {
        memory.set(key, record);
        return record;
      }
      return getSharedApproved(card);
    } catch (error) {
      console.warn("Could not load approved picture:", error);
      return getSharedApproved(card);
    }
  }
  async function saveApproved(card, photo) {
    if (photo?.kind !== "internet" || !urlIsSafe(photo.src, ["wikimedia.org"]) ||
        !urlIsSafe(photo.sourceUrl, ["commons.wikimedia.org"])) {
      throw new Error("Only Wikimedia Commons photos with source information may be approved.");
    }
    const record = {
      key: keyFor(card), front: String(card.front), meaning: String(card.meaning),
      src: photo.src, sourceUrl: photo.sourceUrl, licenseUrl: photo.licenseUrl,
      license: photo.license, attribution: photo.attribution, title: photo.title,
      kind: "internet", approved: true, approvedAt: new Date().toISOString()
    };
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not save image."));
      tx.onabort = () => reject(tx.error || new Error("Image saving was aborted."));
    });
    memory.set(record.key, record);
    candidates.delete(record.key);
    return record;
  }
  async function rejectApproved(card) {
    const key = keyFor(card);
    const approved = memory.get(key);
    if (approved?.src) searchState(card).rejected.add(approved.src);
    memory.delete(key);
    if (!root.indexedDB) return;
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Unable to clear approval."));
      });
    } catch (error) { console.warn("Could not clear previous approval:", error); }
  }
  async function syncShared(record) {
    const endpoint = String(root.AI_IMAGE_CONFIG?.approvalEndpoint || "").trim();
    if (!endpoint) return {shared: false, reason: "No shared database endpoint configured."};
    if (!/^https:\/\//i.test(endpoint)) throw new Error("Shared database URL must use HTTPS.");
    const response = await fetch(endpoint.replace(/\/+$/, "") + "/approvals", {
      method: "POST", headers: {"Content-Type": "application/json"}, credentials: "omit",
      body: JSON.stringify(record), mode: "cors"
    });
    if (!response.ok) throw new Error("Shared database rejected approval (HTTP " + response.status + ").");
    return {shared: true};
  }

  root.InternetPictureSupport = Object.freeze({
    keyFor, isSearchable, findQuery, commonsPhoto, searchCommons,
    findFor, getApproved, saveApproved, rejectApproved, getCandidate, setCandidate,
    clearCandidate, syncShared, getSharedApproved, checkImage
  });
})(typeof window !== "undefined" ? window : globalThis);
