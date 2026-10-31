# HANDOFF — AION 2 Craft Profit Manager

Updated 2026-10-31 at the end of the second session, after step 5 (5a-5f). Describes the real
repository state.

## Project

Windows desktop app (Tauri 2 + React 19 + TypeScript + SQLite) to manage and analyse crafting
profitability for **AION 2 Global**: verified recipe catalogue, market prices, full crafting
chains, inventory, profitability. Product specification: `README.md` (authoritative; identical
copy of `README_AION2_Craft_Profit_Manager.md`; never rewrite it).

## Phase

Build plan (README section 10): steps 0-4 **done**. Step 5 (Windows finalisation): 5a-5f
implemented and checked, but its validation criterion ("a clean install works on Windows and keeps
data between two launches") is **Deferred / Not yet verified**: the installers were built, never
installed on a clean system. The user chose on 2026-10-31 to continue with the docs and test later.
Per-step evidence: `docs/PROJECT_STATUS.md`. Feature list (finished / partial / not available):
same file.

## What exists, and where

| Area | Files |
|------|-------|
| Rust commands (`write_transaction`, backup, restore, restart, `startup_status`), `db-guard` start-up plugin, native error box | `src-tauri/src/lib.rs` |
| Migration list (single source), backup (`VACUUM INTO`), restore checks and swap, pre-migration backup, Rust tests | `src-tauri/src/backup.rs`, `src-tauri/migrations/*.sql` (v1-v5) |
| Permissions (core, read-only SQL, save + open dialogs, write chosen file, HTTP only to `https://aion2.exchange/api/*`) | `src-tauri/capabilities/default.json` |
| Domain: models, profit maths, crafting plan engine, scanner, CSV validation | `src/domain/**` |
| Services: DB, catalogue, plan/price queries, CSV, cleanup, backup calls, aion2.exchange adapter + refresh | `src/services/**` |
| Start-up gate and error boundary | `src/main.tsx`; upgrade banner in `src/app/App.tsx` |
| Pages (10), Settings > Backup and restore | `src/features/**` |
| Tests: Vitest; end-to-end script; manual tests | `tests/*.test.ts(x)`, mock provider `tests/mocks/`, fixtures `tests/fixtures/`; `scripts/e2e.mjs` (`npm run e2e`); `docs/MANUAL_TESTS.md`, `tests/manual/` |
| Market provider interface + registry (README 16.3) | `src/services/market/provider.ts`; aion2.exchange registered in `refresh.ts` |
| Docs | `docs/INSTALL.md`, `docs/USER_GUIDE.md`, `docs/TECHNICAL.md`, `docs/DATA_SOURCES.md`, `docs/PROJECT_STATUS.md` |
| Installers (built, not validated) | `src-tauri/target/release/bundle/nsis/…_x64-setup.exe`, `…/msi/…_x64_en-US.msi` |

Runtime data: `%APPDATA%\com.aion2.craftprofitmanager\aion2.db`, backups in `backups\` beside it.

## Tested (exact commands and results, 2026-10-31)

```bash
npx tsc --noEmit                             # no errors
npx vitest run                               # 10 files, 103 tests passed (incl. Market refresh, jsdom)
npm run build                                # built (Recharts chunk > 500 kB warning only)
cd src-tauri && cargo clippy --all-targets   # no warnings
cd src-tauri && cargo test --lib             # 4 passed (backup.rs)
npm run e2e                                  # 8/8 PASS (isolated .e2e app, two launches, restore)
npx tauri build                              # exit 0: NSIS setup.exe 3.73 MiB, MSI 5.07 MiB
```

Real-window checks (isolated identifier `com.aion2.craftprofitmanager.e2e`, own ports and
`CARGO_TARGET_DIR=src-tauri/target-e2e`, data deleted afterwards): backup/restore refusals and
round trip (5a); real-DB copy starts without error or backup, v4 test DB gets `pre-v5` backup then
upgrade (5b); v99 DB shows the start-up error screen, forced render crash shows the error boundary
with stacks (5c). Not verified: native Save/Open dialogs, native error box, **clean install of
either installer (Deferred / Not yet verified)**. The aion2.exchange provider was never enabled
and never called.

## Known bugs, blockers, unfinished work

- No known failing test or bug.
- **Clean-install test: Deferred / Not yet verified.** Procedure: `docs/INSTALL.md`,
  "Clean-install test" (Windows Sandbox not enabled on this PC; enabling needs admin + reboot).
- aion2.exchange: **permission unconfirmed** (no terms; robots.txt `use=reference` undefined; AI
  agents disallowed, so an assistant must never fetch it). Adapter disabled by default; never run
  live. `limit=1000` without pagination. Not modified in session 2.
- Not available: XLSX import; edit/delete UI for markets and sources; item archiving; nested
  categories; item icons; code signing; auto-update.
- The real DB still contains 4 DEMO items and 2 DEMO recipes (fictional, region OTHER): Settings >
  Demo / test data removes them.
- Git repository (branch `main`, no remote) since 2026-10-31; first commit `22e8094`. Ignored: build
  output, `target-e2e`, `graphify-out`, and `src-tauri/aion2-cpm-*.json` (a JSON data export from an
  earlier session's export test; kept on disk, not committed).
- `src-tauri/target-e2e/` holds the isolated test build (safe to delete; `npm run e2e` rebuilds it).
- A `tauri dev` instance on the real DB (ports 1420/9333) from an earlier session was running
  during this session and was left alone; it was no longer running at the end.

- Live aion2.exchange test (MT-1, `docs/MANUAL_TESTS.md`): first run stored 0 prices; fixed in
  `8e2d3db` (nullable item name). Retest by the user at `7ddc064`: 9 of 10 test items priced on
  Kromede Asmodian. Checks 2-8 and the new opt-in (check 9) not yet reported.
- The Claude desktop app is an MSIX package: processes started by the assistant see a virtualized
  `%APPDATA%` (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\...`), not the user's real
  database. Ask the user for a backup file (or read files under `...\backups\` that the user saved)
  instead of trusting reads of `%APPDATA%\com.aion2.craftprofitmanager\aion2.db`.

## Decisions and assumptions

- Money = integers in the smallest unit; products via BigInt. Commission in basis points, revenue
  rounded down (in-game rounding unknown). ROI = profit / total cost (README 5.4).
- Missing price, unknown fee (`craft_fee` NULL) or forced craft without recipe never become zero:
  results are "incomplete".
- Plan engine: per-unit decisions, then demand pooled per item. Cash vs economic cost kept separate.
- Prices: `price_kind` says what a number is (listing ≠ sale). One market = region + server +
  faction. Resolution: chosen kind only, manual override > fresh > provider > manual > import.
- Inventory is never consumed automatically.
- Migrations are run by `db-guard` (registered before `tauri-plugin-sql`), **not** by the SQL
  plugin, so a checked backup always precedes them; no SQL `preload`. Add migrations only in
  `backup.rs` `MIGRATIONS` (details `docs/TECHNICAL.md`).
- Backups never overwrite and are never deleted by the app. Restore refuses newer or mismatched
  schema histories and files with a live `-wal`.
- Python on this PC writes cp1252 by default: always pass `encoding="utf-8"` when patching files.

## Data sources and verification status

No AION 2 recipe, item or price data ships with the app; nothing is verified Global yet.
Community recipe sites document no API, export or reuse permission (references only).
Market: aion2.exchange adapter as above; others not used. Details: `docs/DATA_SOURCES.md`.

## Next tasks, in priority order

1. Finish MT-1 checks 2-9 with the user (`docs/MANUAL_TESTS.md`); check 9 = opt-in "Also add listed
   items missing from my catalogue". Installers predate the provider interface: rebuild before
   using them.
2. Clean-install test of both installers (Deferred / Not yet verified), by the user on a clean
   Windows environment: `docs/INSTALL.md`, "Clean-install test". Record the result in
   `docs/PROJECT_STATUS.md`; mark step 5 done only if it passes.
3. User check of the native Save/Open dialogs in Settings > Backup and restore.
4. Later features, only if the user asks: XLSX import, market/source editing, item archiving.

## Next session instructions

1. Read `README.md` in full first. It is the authoritative product specification: never rewrite,
   shorten or reorder it.
2. Read this `HANDOFF.md`, `docs/PROJECT_STATUS.md`, `docs/DATA_SOURCES.md` and `docs/TECHNICAL.md`.
3. Inspect the actual repository instead of assuming this summary is complete.
4. Re-check the skills available in the session and read the relevant ones before working.
5. Re-run `npx tsc --noEmit`, `npx vitest run`, `cargo test --lib` and `cargo clippy --all-targets`
   (in `src-tauri`) and compare with the results above. `npm run e2e` is safe (isolated data).
6. Continue from the first unfinished priority (the deferred clean-install test, which needs the
   user) without recreating completed work. Do not mark step 5 done before it passes.
7. Never fetch aion2.exchange (or any site that disallows AI agents) yourself; never enable the
   provider on the user's behalf; do not modify the adapter unless asked.
8. Never test against the real database: use the `.e2e` identifier as in `scripts/e2e.mjs`.
9. Communicate only in English (README 15.1), even if the user writes in another language, and
   keep following every requirement in the README.
