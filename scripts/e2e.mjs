// End-to-end check of the real Windows app (README step 5). Usage: npm run e2e
//
// Builds a debug app whose identifier is `com.aion2.craftprofitmanager.e2e`, so it uses its
// own data folder and never the real database, then drives it over the Chrome DevTools
// Protocol: every page renders, a write, a backup, persistence across two launches, a restore
// with automatic restart. The test data folder is deleted at the start and in `finally`.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ID = "com.aion2.craftprofitmanager.e2e";
const PORT = 9335;
const ROOT = join(import.meta.dirname, "..");
const TARGET = join(ROOT, "src-tauri", "target-e2e");
const EXE = join(TARGET, "debug", "aion2-craft-profit-manager.exe");
const DATA = join(process.env.APPDATA, ID);
const WEBVIEW = join(process.env.LOCALAPPDATA, ID);
if (!DATA.endsWith(".e2e") || !WEBVIEW.endsWith(".e2e")) throw new Error("refusing: not the isolated test folder");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) throw new Error(`check failed: ${name}`);
}

function killApp() {
  // Only processes started from the isolated build folder.
  execFileSync("powershell", ["-NoProfile", "-Command",
    `Get-CimInstance Win32_Process | ? { $_.ExecutablePath -eq '${EXE}' } | % { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
}
function cleanData() {
  for (const d of [DATA, WEBVIEW]) rmSync(d, { recursive: true, force: true });
}

async function page() {
  for (let i = 0; i < 120; i++) {
    try {
      const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((p) => p.type === "page");
      if (t) return t.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error("the app window did not appear");
}

/** Evaluates `expr` (may be async) in the window; `I` is the Tauri invoke function. */
async function evaluate(expr) {
  const ws = new WebSocket(await page());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const reply = new Promise((r) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) r(d.result); }; });
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: {
    expression: `(async () => { const I = window.__TAURI_INTERNALS__.invoke; ${expr} })()`, awaitPromise: true, returnByValue: true } }));
  const r = await reply;
  ws.close();
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluation failed");
  return r.result.value;
}

async function launch() {
  spawn(EXE, [], { detached: true, stdio: "ignore", env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } }).unref();
  await waitReady();
}
async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { if (await evaluate("return document.querySelector('nav, [role=alert]') !== null")) return; } catch { /* loading */ }
    await sleep(500);
  }
  throw new Error("the app did not finish loading");
}

const SQL = (query) => `(await I('plugin:sql|load', { db: 'sqlite:aion2.db' }), await I('plugin:sql|select', { db: 'sqlite:aion2.db', query: ${JSON.stringify(query)}, values: [] }))`;
const ITEM = "E2E TEST item (fictional)";

try {
  killApp();
  cleanData();
  console.log("Building the isolated debug app (identifier .e2e)...");
  execFileSync(process.execPath, [join(ROOT, "node_modules", "@tauri-apps", "cli", "tauri.js"), "build", "--debug", "--no-bundle",
    "--config", JSON.stringify({ identifier: ID })], { cwd: ROOT, stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: TARGET } });

  // Launch 1: fresh database, every page, a write, a backup.
  await launch();
  check("isolated identifier", (await evaluate("return I('plugin:app|identifier')")) === ID);
  const s1 = await evaluate("return I('startup_status')");
  check("startup without error, no backup for a new database", s1.error === null && s1.backup === null, JSON.stringify(s1));
  const pages = await evaluate(`
    const out = [];
    // Menu entries only: the EN/FR buttons in the nav footer reload the window.
    for (const b of [...document.querySelectorAll('nav ul button')]) {
      b.click();
      await new Promise((r) => setTimeout(r, 700));
      const main = document.querySelector('main');
      out.push({ page: b.textContent.replace(/^\\d/, ''), ok: !!main.querySelector('h1') && !/Database error|unexpected error/.test(document.body.innerText) });
    }
    return out;`);
  check("all 10 pages render without errors", pages.length === 10 && pages.every((p) => p.ok), pages.filter((p) => !p.ok).map((p) => p.page).join(", "));
  await evaluate(`return I('write_transaction', { statements: [{ sql: "INSERT INTO items (name, normalized_name, game_region) VALUES (?, lower(?), 'OTHER')", params: [${JSON.stringify(ITEM)}, ${JSON.stringify(ITEM)}] }] })`);
  const backup = join(DATA, "backups", "e2e-backup.db");
  check("backup written", (await evaluate(`await I('backup_folder'); return I('backup_database', { path: ${JSON.stringify(backup)} })`)) === backup && existsSync(backup));
  const again = await evaluate(`try { await I('backup_database', { path: ${JSON.stringify(backup)} }); return 'overwritten' } catch (e) { return String(e) }`);
  check("existing backup never overwritten", again.includes("never overwritten"), again);

  // Launch 2: separate process, data must still be there.
  killApp();
  await sleep(1000);
  await launch();
  const rows = await evaluate(`return ${SQL(`SELECT name FROM items WHERE name = '${ITEM}'`)}`);
  check("data persisted across two launches", rows.length === 1);

  // Restore: change the row, restore the backup, the app restarts itself.
  await evaluate(`return I('write_transaction', { statements: [{ sql: "UPDATE items SET name = 'E2E changed' WHERE name = ?", params: [${JSON.stringify(ITEM)}] }] })`);
  const restored = await evaluate(`return I('restore_database', { path: ${JSON.stringify(backup)} })`);
  check("restore made a safety backup", existsSync(restored.safetyBackup), restored.safetyBackup);
  await evaluate("I('restart_app'); return true").catch(() => {});
  await sleep(2000);
  await waitReady();
  const after = await evaluate(`return ${SQL(`SELECT name FROM items WHERE name = '${ITEM}'`)}`);
  check("restored data visible after restart", after.length === 1);
  console.log(`\n${results.length} checks passed.`);
} catch (e) {
  console.error(`\nE2E FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  killApp();
  await sleep(1000);
  cleanData();
  console.log(existsSync(DATA) ? `WARNING: could not delete ${DATA}` : "Test data deleted.");
}
