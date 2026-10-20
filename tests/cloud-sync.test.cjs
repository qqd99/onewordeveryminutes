const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web/cloud-sync.js"), "utf8");
const registry = (name, meaningLanguage = "vi") => ({
  schemaVersion: 1, activeId: "main",
  slots: {
    main: {
      name, createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      store: {
        settings: { translationLanguage: meaningLanguage },
        progress: {}, currentCardId: null, lastCardId: null
      }
    }
  }
});
const copy = item => JSON.parse(JSON.stringify(item));

function server() {
  const rows = new Map();
  const requests = [];
  let offline = false;
  const respond = (data, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => data
  });
  return {
    rows, requests,
    setOffline(value) { offline = value; },
    async fetch(url, init = {}) {
      if (offline) throw new TypeError("Network unavailable");
      const address = new URL(url);
      const { pathname, searchParams } = address;
      requests.push({ pathname, method: init.method || "GET", body: init.body });
      if (pathname === "/auth/v1/token" &&
          searchParams.get("grant_type") === "password") {
        const { email } = JSON.parse(init.body);
        return respond({
          access_token: "access-" + email,
          refresh_token: "refresh-" + email,
          user: { id: email, email }, expires_in: 3600
        });
      }
      if (pathname === "/auth/v1/token" &&
          searchParams.get("grant_type") === "refresh_token") {
        const email = JSON.parse(init.body).refresh_token.replace("refresh-", "");
        return respond({
          access_token: "access-" + email,
          refresh_token: "refresh-" + email,
          user: { id: email, email }, expires_in: 3600
        });
      }
      if (pathname === "/auth/v1/signup") {
        return respond({ user: { id: "unconfirmed" } });
      }
      const user = String(init.headers?.Authorization || "").replace("Bearer access-", "");
      if (pathname === "/rest/v1/user_save_snapshots") {
        const row = rows.get(user);
        return respond(row ? [copy(row)] : []);
      }
      if (pathname === "/rest/v1/rpc/write_user_save_snapshot") {
        const { p_expected_revision, p_snapshot } = JSON.parse(init.body);
        const row = rows.get(user);
        const expected = row?.revision || 0;
        if (p_expected_revision !== expected) {
          return respond([{ applied: false, current_revision: expected }]);
        }
        rows.set(user, { revision: expected + 1, snapshot: copy(p_snapshot) });
        return respond([{ applied: true, current_revision: expected + 1 }]);
      }
      return respond({ message: "Unexpected path: " + pathname }, 404);
    }
  };
}

function browser(remote, initial) {
  const items = new Map();
  const statuses = [];
  const scheduled = [];
  const local = { data: copy(initial), applyCount: 0, allowPull: true };
  const storage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
    removeItem: key => { items.delete(key); }
  };
  const ctx = vm.createContext({
    URL, JSON, Date, Math,
    setTimeout: fn => { scheduled.push(fn); return scheduled.length; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage: storage, fetch: remote.fetch.bind(remote)
  });
  vm.runInContext(source, ctx);
  const cloud = ctx.createCloudSync({
    storage, fetcher: remote.fetch.bind(remote),
    getSnapshot: () => copy(local.data),
    applySnapshot: snapshot => { local.data = copy(snapshot); local.applyCount++; },
    canApply: () => local.allowPull,
    onStatus: next => statuses.push(next),
    setTimeout: fn => { scheduled.push(fn); return scheduled.length; },
    clearTimeout: () => {},
    setInterval: () => 1
  });
  cloud.init();
  return { cloud, items, local, statuses, scheduled };
}
const cfg = browser => browser.cloud.setConfig(
  "https://learning.supabase.co", "sb_publishable_publickey");

test("without Supabase configuration, only browser-local saves are used", async () => {
  const remote = server(), a = browser(remote, registry("Local"));
  assert.equal(a.cloud.getStatus().mode, "signedOut");
  await a.cloud.syncNow();
  assert.equal(remote.requests.length, 0);
  assert.equal(a.local.data.slots.main.name, "Local");
  assert.throws(() => a.cloud.setConfig("http://insecure.example", "anon"), /HTTPS/);
  assert.throws(() => a.cloud.setConfig("https://learning.supabase.co", "sb_secret_insecure"), /never a secret/);
});

test("first browser uploads all slots; second browser explicitly adopts cloud then auto-pulls newer revisions", async () => {
  const remote = server();
  const initial = registry("My Chinese vocabulary");
  initial.slots.extra = copy(initial.slots.main);
  initial.slots.extra.name = "Exam";
  initial.slots.extra.store.progress.hao = { remembered: 5 };
  initial.activeId = "extra";
  const a = browser(remote, initial);
  cfg(a);
  await a.cloud.signIn("person@example.com", "test-pass");
  assert.equal(a.cloud.getStatus().mode, "synced");
  assert.equal(remote.rows.get("person@example.com").revision, 1);
  assert.equal(remote.rows.get("person@example.com").snapshot.slots.extra.store.progress.hao.remembered, 5);

  const b = browser(remote, registry("Empty browser", "en"));
  cfg(b);
  await b.cloud.signIn("person@example.com", "test-pass");
  assert.equal(b.cloud.getStatus().mode, "conflict",
    "A second browser must not silently lose its local save files");
  assert.equal(b.local.data.slots.main.name, "Empty browser");
  await b.cloud.useCloud();
  assert.equal(b.cloud.getStatus().mode, "synced");
  assert.deepEqual(b.local.data, initial);
  assert.equal(b.local.data.slots.extra.store.progress.hao.remembered, 5);
  assert.equal(b.local.data.slots.main.store.settings.translationLanguage, "vi");
  assert.ok(b.items.get("vocab_srs_cloud_pre_replace_backup_v1"),
    "Retain the local recovery backup before cloud download");

  a.local.data.slots.extra.store.progress.hao.remembered = 6;
  await a.cloud.syncNow();
  assert.equal(remote.rows.get("person@example.com").revision, 2);
  await b.cloud.syncNow();
  assert.equal(b.local.data.slots.extra.store.progress.hao.remembered, 6,
    "Other browsers automatically read remote progress once connected");
});

test("two offline edits conflict without overwriting either browser or remote", async () => {
  const remote = server();
  const a = browser(remote, registry("A"));
  cfg(a); await a.cloud.signIn("person@example.com", "pass");
  const b = browser(remote, registry("B"));
  cfg(b); await b.cloud.signIn("person@example.com", "pass");
  await b.cloud.useCloud();

  a.local.data.slots.main.store.progress.one = { remembered: 2 };
  b.local.data.slots.main.store.progress.two = { forgotten: 1 };
  await a.cloud.syncNow();
  await b.cloud.syncNow();
  assert.equal(b.cloud.getStatus().mode, "conflict");
  assert.ok(b.local.data.slots.main.store.progress.two);
  assert.equal(remote.rows.get("person@example.com").snapshot.slots.main.store.progress.two, undefined);
  assert.ok(remote.rows.get("person@example.com").snapshot.slots.main.store.progress.one);

  // User explicitly chooses the local copy. The SQL compare-and-swap RPC
  // prevents overwriting another concurrent revision unintentionally.
  await b.cloud.useLocal();
  assert.equal(remote.rows.get("person@example.com").revision, 3);
  assert.ok(remote.rows.get("person@example.com").snapshot.slots.main.store.progress.two);
});

test("offline cloud failure leaves existing local saves and session available", async () => {
  const remote = server();
  const a = browser(remote, registry("Offline friendly"));
  cfg(a); await a.cloud.signIn("person@example.com", "pass");
  remote.setOffline(true);
  a.local.data.slots.main.store.progress.hao = { remembered: 7 };
  await a.cloud.syncNow();
  assert.equal(a.local.data.slots.main.store.progress.hao.remembered, 7);
  assert.equal(a.cloud.getStatus().mode, "offline");
  assert.ok(a.cloud.getSession());
  remote.setOffline(false);
  await a.cloud.syncNow();
  assert.equal(remote.rows.get("person@example.com").snapshot.slots.main.store.progress.hao.remembered, 7);
  a.cloud.signOut();
  assert.equal(a.cloud.getSession(), null);
  assert.equal(a.local.data.slots.main.store.progress.hao.remembered, 7);
});

test("cloud update is postponed while a user is actively studying", async () => {
  const remote = server(), a = browser(remote, registry("A"));
  cfg(a); await a.cloud.signIn("person@example.com", "pass");
  const b = browser(remote, registry("B"));
  cfg(b); await b.cloud.signIn("person@example.com", "pass");
  await b.cloud.useCloud();
  a.local.data.slots.main.store.progress.hao = { remembered: 9 };
  await a.cloud.syncNow();

  b.local.allowPull = false;
  await b.cloud.syncNow();
  assert.equal(b.cloud.getStatus().mode, "pending");
  assert.equal(b.local.applyCount, 1);
  b.local.allowPull = true;
  await b.cloud.syncNow();
  assert.equal(b.local.data.slots.main.store.progress.hao.remembered, 9);
});

test("cloud credentials are separate from exported saves and tests enforce database RLS", async () => {
  const remote = server(), a = browser(remote, registry("Private"));
  cfg(a); await a.cloud.signIn("person@example.com", "pass");
  assert.ok(!JSON.stringify(a.local.data).includes("access-person@example.com"));
  assert.ok(!JSON.stringify(a.local.data).includes("sb_publishable"));
  assert.ok(!Array.from(a.items.values()).some(value => String(value).includes("test-pass")));

  const sql = fs.readFileSync(path.join(root, "supabase", "schema.sql"), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\) = user_id/i);
  assert.match(sql, /p_expected_revision/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute .*write_user_save_snapshot/s);
});

test("web and docs ship the same cloud sync code and web UI references it", () => {
  assert.equal(fs.readFileSync(path.join(root, "docs", "cloud-sync.js"), "utf8"), source);
  for(const site of ["web", "docs"]) {
    const html = fs.readFileSync(path.join(root, site, "index.html"), "utf8");
    for (const id of [
      "cloudProjectUrl", "cloudPublishableKey", "cloudEmail", "cloudPassword",
      "cloudSignInBtn", "cloudSignUpBtn", "cloudSignOutBtn", "cloudSyncStatus",
      "cloudUseLocalBtn", "cloudUseCloudBtn"
    ]) assert.ok(html.includes('id="' + id + '"'), "Missing cloud control " + id);
    assert.ok(html.includes('cloud-sync.js?v=22'));
  }
});
