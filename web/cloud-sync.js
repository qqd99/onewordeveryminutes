/* Optional Supabase cloud save synchronization for the web app.
 * Uses the public Supabase Auth/REST APIs; never uses a service-role key.
 * Browser-local saves remain the primary offline copy.
 */
(function (root) {
  "use strict";

  const CONFIG_KEY = "vocab_srs_supabase_config_v1";
  const SESSION_KEY = "vocab_srs_supabase_session_v1";
  const CHECKPOINT_PREFIX = "vocab_srs_supabase_checkpoint_v1:";
  const BACKUP_KEY = "vocab_srs_cloud_pre_replace_backup_v1";

  function signature(value) {
    const data = JSON.stringify(value);
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) {
      hash ^= data.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return data.length + ":" + (hash >>> 0).toString(16);
  }

  function validateConfig(url, key) {
    const parsed = new URL(String(url || "").trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.pathname !== "/") {
      throw new Error("Use your HTTPS Supabase project URL (no path or query).");
    }
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey || /^sb_secret_|^service_role$/i.test(normalizedKey)) {
      throw new Error("Use a Supabase publishable / anon key, never a secret or service-role key.");
    }
    return { url: parsed.origin, key: normalizedKey };
  }

  function createCloudSync(options) {
    const storage = options.storage || root.localStorage;
    const fetcher = options.fetcher || root.fetch.bind(root);
    const defer = options.setTimeout || root.setTimeout.bind(root);
    const cancel = options.clearTimeout || root.clearTimeout.bind(root);
    const repeat = options.setInterval || root.setInterval.bind(root);
    const status = options.onStatus || function () {};
    let config = null;
    let session = null;
    let running = null;
    let retryTimer = null;
    let pollTimer = null;
    let conflict = false;
    let lastStatus = null;
    let rerun = false;

    function emit(mode, message) {
      lastStatus = { mode, message, email: session?.user?.email || "" };
      status(lastStatus);
    }

    function checkpointKey() {
      return CHECKPOINT_PREFIX + config.url + ":" + session.user.id;
    }
    function readCheckpoint() {
      try { return JSON.parse(storage.getItem(checkpointKey()) || "null"); }
      catch (_) { return null; }
    }
    function writeCheckpoint(revision, snapshot) {
      storage.setItem(checkpointKey(), JSON.stringify({
        revision, signature: signature(snapshot)
      }));
    }

    function storeSession(payload) {
      if (!payload?.access_token || !payload?.refresh_token || !payload?.user?.id) {
        throw new Error("Supabase did not return a valid login session.");
      }
      session = {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        user: { id: payload.user.id, email: payload.user.email || "" },
        expires_at: payload.expires_at
          ? Number(payload.expires_at) * 1000
          : Date.now() + Number(payload.expires_in || 3600) * 1000
      };
      storage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    async function request(path, init, authenticated) {
      if (!config) throw new Error("Enter your Supabase project URL and publishable key.");
      const makeRequest = async (accessToken) => {
        const response = await fetcher(config.url + path, {
          ...init,
          headers: {
            apikey: config.key,
            "Content-Type": "application/json",
            ...(authenticated ? { Authorization: "Bearer " + accessToken } : {}),
            ...(init?.headers || {})
          }
        });
        let data = null;
        try { data = await response.json(); } catch (_) {}
        if (!response.ok) {
          const message = data?.msg || data?.message || data?.error_description ||
            data?.error || "Supabase request failed (HTTP " + response.status + ")";
          const error = new Error(String(message));
          error.status = response.status;
          throw error;
        }
        return data;
      };
      if (!authenticated) return makeRequest(null);
      if (!session) throw new Error("Sign in to synchronize saves.");
      if (Date.now() >= session.expires_at - 60000) await refreshSession();
      try {
        return await makeRequest(session.access_token);
      } catch (error) {
        if (error.status !== 401) throw error;
        await refreshSession();
        return makeRequest(session.access_token);
      }
    }

    async function refreshSession() {
      if (!session?.refresh_token) throw new Error("Please sign in again.");
      const data = await fetcher(config.url + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: config.key, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!data.ok) throw new Error("Cloud session expired; sign in again.");
      storeSession(await data.json());
    }

    async function fetchRemote() {
      const rows = await request("/rest/v1/user_save_snapshots?select=revision,snapshot&user_id=eq." +
        encodeURIComponent(session.user.id), { method: "GET" }, true);
      if (!Array.isArray(rows)) throw new Error("Invalid cloud database response.");
      return rows[0] || null;
    }

    async function push(snapshot, expectedRevision) {
      const result = await request("/rest/v1/rpc/write_user_save_snapshot", {
        method: "POST",
        body: JSON.stringify({ p_expected_revision: expectedRevision, p_snapshot: snapshot })
      }, true);
      const entry = Array.isArray(result) ? result[0] : result;
      if (!entry?.applied) {
        conflict = true;
        emit("conflict", "A different browser updated your cloud save. Choose which version to keep.");
        return false;
      }
      writeCheckpoint(Number(entry.current_revision), snapshot);
      conflict = false;
      emit("synced", "All save slots synchronized.");
      return true;
    }

    function validateRemoteSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
          !snapshot.slots || typeof snapshot.slots !== "object" ||
          Array.isArray(snapshot.slots) || !Object.keys(snapshot.slots).length ||
          typeof snapshot.activeId !== "string" ||
          !Object.prototype.hasOwnProperty.call(snapshot.slots, snapshot.activeId)) {
        throw new Error("Cloud save is not a valid save-slot registry.");
      }
    }

    function adopt(remote) {
      validateRemoteSnapshot(remote.snapshot);
      const previous = options.getSnapshot();
      // Retain a local recovery copy before replacing any named save slots.
      storage.setItem(BACKUP_KEY, JSON.stringify(previous));
      options.applySnapshot(remote.snapshot);
      writeCheckpoint(Number(remote.revision), remote.snapshot);
      conflict = false;
      emit("synced", "Cloud saves downloaded to this browser.");
    }

    async function syncOnce() {
      if (!config || !session) return;
      const local = options.getSnapshot();
      const localSignature = signature(local);
      const cp = readCheckpoint();
      const remote = await fetchRemote();

      if (!remote) {
        if (cp?.revision) {
          conflict = true;
          emit("conflict", "The cloud copy is missing; choose to upload your local saves.");
        } else {
          emit("syncing", "Uploading your existing save slots...");
          await push(local, 0);
        }
        return;
      }

      validateRemoteSnapshot(remote.snapshot);
      const remoteRevision = Number(remote.revision);
      if (signature(remote.snapshot) === localSignature) {
        writeCheckpoint(remoteRevision, local);
        conflict = false;
        emit("synced", "All save slots synchronized.");
      } else if (cp && cp.revision === remoteRevision) {
        // Only this browser changed data since the last successful sync.
        emit("syncing", "Uploading local changes...");
        await push(local, remoteRevision);
      } else if (cp && cp.signature === localSignature) {
        // Only the cloud has newer changes, so it can be applied safely.
        if (options.canApply && !options.canApply()) {
          emit("pending", "A newer cloud save is available. Pause learning to apply it.");
          return;
        }
        if (signature(options.getSnapshot()) !== localSignature) {
          rerun = true;
          return;
        }
        adopt(remote);
      } else {
        // First login on another browser, or two browsers changed the same
        // save slots while offline. Never silently overwrite either copy.
        conflict = true;
        emit("conflict", "Local and cloud saves differ. Choose which copy to keep.");
      }
    }

    async function syncNow() {
      if (!session || !config) {
        emit("signedOut", "Sign in to enable cloud synchronization.");
        return;
      }
      if (running) { rerun = true; return running; }
      running = (async () => {
        try {
          emit("syncing", "Checking cloud saves...");
          await syncOnce();
        } catch (error) {
          emit(error?.name === "TypeError" ? "offline" : "error",
            "Cloud sync failed: " + error.message + ". Local saves are safe.");
        }
      })();
      try { await running; }
      finally {
        running = null;
        if (rerun) { rerun = false; scheduleSync(100); }
      }
    }

    function scheduleSync(delay = 1200) {
      if (!config || !session) return;
      if (retryTimer !== null) cancel(retryTimer);
      retryTimer = defer(() => { retryTimer = null; void syncNow(); }, delay);
    }

    function localChanged() {
      // Called after browser-local persistence succeeds. Cloud failures must
      // never block studying, creating slots, or offline settings changes.
      scheduleSync();
    }

    async function signIn(email, password) {
      if (!config) throw new Error("Save your Supabase connection first.");
      const payload = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: JSON.stringify({ email: String(email).trim(), password })
      }, false);
      storeSession(payload);
      conflict = false;
      emit("syncing", "Signed in; checking your saves...");
      await syncNow();
    }

    async function signUp(email, password) {
      if (!config) throw new Error("Save your Supabase connection first.");
      const payload = await request("/auth/v1/signup", {
        method: "POST",
        body: JSON.stringify({ email: String(email).trim(), password })
      }, false);
      if (payload?.access_token && payload?.refresh_token) {
        storeSession(payload);
        await syncNow();
        return;
      }
      emit("signedOut", "Account created. Check your email to confirm, then sign in.");
    }

    function signOut() {
      session = null;
      conflict = false;
      storage.removeItem(SESSION_KEY);
      if (retryTimer !== null) cancel(retryTimer);
      retryTimer = null;
      emit("signedOut", "Signed out. Browser-local saves remain available.");
    }

    function setConfig(url, key) {
      const next = validateConfig(url, key);
      if (config?.url !== next.url || config?.key !== next.key) signOut();
      config = next;
      storage.setItem(CONFIG_KEY, JSON.stringify(config));
      emit(session ? "synced" : "signedOut", "Connection saved. Sign in to synchronize.");
    }

    async function useCloud() {
      if (!session) throw new Error("Sign in first.");
      if (options.canApply && !options.canApply()) {
        throw new Error("Pause the study session before replacing the local save.");
      }
      const remote = await fetchRemote();
      if (!remote) throw new Error("No cloud save is available to download.");
      adopt(remote);
    }

    async function useLocal() {
      if (!session) throw new Error("Sign in first.");
      const local = options.getSnapshot();
      const remote = await fetchRemote();
      return push(local, remote ? Number(remote.revision) : 0);
    }

    function downloadBackup() {
      return storage.getItem(BACKUP_KEY);
    }

    function init() {
      try {
        const saved = JSON.parse(storage.getItem(CONFIG_KEY) || "null");
        if (saved) config = validateConfig(saved.url, saved.key);
        const restored = JSON.parse(storage.getItem(SESSION_KEY) || "null");
        if (config && restored?.access_token && restored?.refresh_token &&
            restored?.user?.id) session = restored;
      } catch (_) {
        session = null;
      }
      emit(session ? "syncing" : "signedOut", session
        ? "Restoring cloud synchronization..." : "Cloud sync is off. Saves remain in this browser.");
      if (session) scheduleSync(300);
      pollTimer = repeat(() => { if (session) void syncNow(); }, 30000);
    }

    function destroy() {
      if (pollTimer !== null) root.clearInterval(pollTimer);
      if (retryTimer !== null) cancel(retryTimer);
    }

    return {
      init, destroy, setConfig, signIn, signUp, signOut, syncNow,
      localChanged, useCloud, useLocal, downloadBackup,
      getConfig: () => config,
      getSession: () => session,
      getStatus: () => lastStatus,
      signature
    };
  }

  root.createCloudSync = createCloudSync;
})(globalThis);
