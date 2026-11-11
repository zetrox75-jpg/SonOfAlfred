# HANDOFF — AION 2 Craft Profit Manager

Updated 2026-11-05 at the end of the third session. Describes the real repository state at the
latest commit on `main`, pushed to `https://github.com/zetrox75-jpg/SonOfAlfred`. App version 0.1.1.

## Project

Windows desktop app (Tauri 2 + React 19 + TypeScript + SQLite) to manage and analyse crafting
profitability for **AION 2 Global**: recipe catalogue, market prices, full crafting chains,
inventory, profitability. Product specification: `docs/SPEC.md` (authoritative; moved verbatim
from the former root `README.md` on 2026-11-05, when the repository was restructured — see
"Repository restructure (2026-11-05)" below; never rewrite it). On 2026-10-31 the user relaxed
rules 3, 4 and 6 and sections 15.3, 16.2, 16.4 and 16.7 (marked "relaxed 2026-10-31" in the
spec, commit `b46e7c1`); the spec was synced to that wording in the 2026-10-31 handoff.

## Phase

Build plan (README section 10): steps 0-4 **done**. Step 5 (Windows finalisation): 5a-5f
implemented and checked; its validation criterion ("a clean install works on Windows and keeps
data between two launches") is still **Deferred / Not yet verified** (installers built, never
installed on a clean system). Session 3 added community data on top: aion2.exchange as default
provider, Splendent craft recipes, gamers4.life profession recipes. Per-step evidence:
`docs/PROJECT_STATUS.md` (session 3: "Session 3 (2026-10-31)").

## What exists, and where

| Area | Files |
|------|-------|
| Rust commands (`write_transaction`, backup, restore, restart, `startup_status`), `db-guard` start-up plugin, native error box | `src-tauri/src/lib.rs` |
| Migration list (single source), backup (`VACUUM INTO`), restore checks and swap, pre-migration backup, Rust tests | `src-tauri/src/backup.rs`, `src-tauri/migrations/*.sql` (v1-v6) |
| Permissions (core, read-only SQL, save + open dialogs, write chosen file, HTTP only to `https://aion2.exchange/api/*`) | `src-tauri/capabilities/default.json` |
| Domain: models (`isReliable`), profit maths, crafting plan engine (`verifiedOnly` filter), scanner, CSV validation | `src/domain/**` |
| Market provider interface + registry (README 16.3) | `src/services/market/provider.ts` |
| aion2.exchange adapter: schemas, normalization, Splendent crafts model -> recipes | `src/services/market/aion2exchange.ts` |
| The only network code: refresh, history, server list, `importCrafts`; status writes serialized | `src/services/market/refresh.ts` |
| Community recipe upsert shared by both importers | `src/services/communityRecipes.ts` |
| gamers4.life crafting graph -> recipes (local file, no network) | `src/services/craftingGraph.ts`; card on `src/features/import-export/ImportExportPage.tsx` |
| Other services: DB, catalogue, plan/price queries, CSV, cleanup, backup calls | `src/services/**` |
| Start-up gate and error boundary | `src/main.tsx`; upgrade banner in `src/app/App.tsx` |
| Pages (10) | `src/features/**` |
| Tests | `tests/*.test.ts(x)` (12 files), mock provider `tests/mocks/`, fixtures `tests/fixtures/` (aion2.exchange responses incl. `crafts.json`, `crafts-model.json`; `gamers4life/crafting-graph.json`), `scripts/e2e.mjs`, `docs/MANUAL_TESTS.md`, `tests/manual/` |
| Docs | `docs/INSTALL.md`, `docs/USER_GUIDE.md`, `docs/TECHNICAL.md`, `docs/DATA_SOURCES.md`, `docs/PROJECT_STATUS.md`, `docs/MANUAL_TESTS.md` |
| Installers (built before session 3, not validated; rebuild before use) | `src-tauri/target/release/bundle/nsis/…_x64-setup.exe`, `…/msi/…_x64_en-US.msi` |

Runtime data: `%APPDATA%\com.aion2.craftprofitmanager\aion2.db`, backups in `backups\` beside it.
Isolated test app: identifier `com.aion2.craftprofitmanager.e2e`, data in
`%APPDATA%\com.aion2.craftprofitmanager.e2e\` (holds the session 3 live test data until the next
`npm run e2e`, which deletes it).

## Interface added at the end of session 3

AION 2 theme (bundled Cinzel font, `src/styles/index.css`); `ItemName` and `ItemPicker` with icons
(`src/components/item.tsx`); EN/FR switch and `tr()` (`src/i18n.ts`, `src/i18n/fr.json`, coverage
test `tests/i18n.test.ts`); French item names (`src/data/itemNamesFr.json`); update banner
(`src/app/UpdateBanner.tsx`). Status messages built in services (import results, provider errors)
are still English. Seen in the `.e2e` app only by the user.

## Added 2026-11-10 (PR #2, branch `feat/craft-log-stock-scanner`, merged into `main` 2026-11-11)

"Mark plan as crafted" on the Inventory page ("Current plan" card): after crafting in game, one
confirmed click removes the stock the plan used, keeps batch surplus and adds the crafted output.
Pure logic: `inventoryAfterCraft` in `src/domain/calculations/craftPlan.ts`, 2 tests in
`tests/craftPlan.test.ts`.

Scanner "From my stock" filter (All / Craftable now / At most 2 items to buy) and a sortable
"Items to buy" column, from `ScanRow.toAcquire` in `src/domain/calculations/scanner.ts`, 1 test in
`tests/scanner.test.ts`. Known limit: the count follows the cheapest plan, so an intermediate the
plan chose to buy counts as missing even when its materials are owned.

Craft log: **migration v6** (`0006_craft_log.sql`, table `craft_log`, registered in `backup.rs`).
"Mark plan as crafted" now also writes one log row in the same transaction (item, quantity
produced, total cost under the current valuation, sell price and estimated profit at that moment;
null when incomplete). Inventory page shows a "Craft log" card (latest 50, hidden when empty):
the user types the real sale (quantity, unit price), the commission from Settings is stored with
it, and real profit = net revenue minus the sold share of the cost (rounded up). Code:
`logCraft` / `recordSale` / `deleteCraftLog` / `CRAFT_LOG_SQL` in `src/services/planQueries.ts`,
`realizedProfit` in `src/domain/calculations/profit.ts`, `craft_log` added to the JSON export.
Tests: 3 in `tests/planQueries.test.ts`, 2 in `tests/profit.test.ts`. Decisions: a log row is
deleted with its item (`ON DELETE CASCADE`, so demo cleanup needs no change, and its preview does
not count log rows); one sale per row, re-saving replaces it; fixed fees are not logged.
**The first launch of this build upgrades the real database to v6** (automatic pre-upgrade backup).

Checks that day, after all three changes: `npx tsc --noEmit` exit 0; `npx vitest run` 13 files,
130 passed; `cargo test --lib` 4 passed; `cargo clippy --all-targets` no warnings.

`npm run e2e` on 2026-11-11: first run failed at "all 10 pages render" because the script clicked
every `nav button`, including the EN/FR switch (added in session 3), which reloads the window.
Selector fixed to `nav ul button` in `scripts/e2e.mjs`; rerun **8/8 PASS** (fresh database
migrated to v6, all 10 pages render, backup, persistence, restore). The run deleted the `.e2e`
test data, including the session 3 live data. e2e does not press "Mark plan as crafted", the
Scanner filter or the craft log sale entry.

Real-window check on 2026-11-11 in the isolated `.e2e` app (one-off CDP script, fictional UITEST
items in region OTHER, data deleted afterwards), 10/10 PASS: Scanner "Items to buy" showed 1
without stock and 0 with "Craftable now" (which ticked "Use my inventory"); opening the item from
the Scanner, then "Mark plan as crafted" and its confirm step, changed stock 9 ore -> 3, +1 ingot
surplus, +1 sword and wrote one log row (cost 70, estimated profit 215); typing a sale of 1 x 280
at 5% showed net revenue 266 and real profit 196. Not checked: French labels, the delete button,
incomplete-cost rows.

CI: both jobs had failed on every run since the workflow was added (Node 22 could not resolve
`node:sqlite` for the jsdom test; Ubuntu lacked the GTK libraries). `.github/workflows/ci.yml`
now uses Node 26 and runs the backend job on `windows-latest`; first green run on `ab0eb94`.

The user asked about reading game network
traffic to detect owned resources: refused (rule 6, SPEC 16). A screenshot-OCR inventory import
was proposed, then dropped by the user for now (open question: whether the game shows item names
as text next to quantities). Other ideas offered, not started: multi-item shopping list, price trend in the Scanner, edit/delete for markets and sources. The knowledge graph in `graphify-out/` (gitignored) was rebuilt the same day.

## Tested (exact commands and results, 2026-11-05, session 3)

```bash
npx tsc --noEmit                             # exit 0
npx vitest run                               # 13 files, 122 tests passed
cd src-tauri && cargo test --lib             # 4 passed, 0 failed
cd src-tauri && cargo clippy --all-targets   # finished, no warnings
npm run e2e                                  # 8/8 PASS on 2026-10-31, before the importers, theme,
                                             # French and updater; not rerun (keeps .e2e test data)
node scripts/release.mjs 0.1.1               # exit 0: signed NSIS 4.3 MB, MSI 5.9 MB, latest.json
```

The isolated `.e2e` app was rebuilt with
`CARGO_TARGET_DIR=src-tauri/target-e2e node node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --config '{"identifier":"com.aion2.craftprofitmanager.e2e"}'`
(this keeps its data, unlike `npm run e2e`). In it, the **user** pressed the buttons; the assistant
only read the database (read-only):

| Check | Result |
|-------|--------|
| Provider enabled by default | `enabled: true`, no acknowledgement click |
| Refresh prices, Kromede · Asmodian (EU), server 12316, opt-in ticked | 499 `lowest_listing` prices, source `aion2.exchange`, observed + retrieved times, 0 sale prices, 0 duplicates; 499 community items added; 357 skipped |
| `units_sold` / `sold_avg_price` | **0 rows** contain them (fixture test passes). Cause not found: the live `/api/items` response may omit them. Unresolved |
| Import Splendent crafts | 19 recipes, Global community, fee NULL, note present; all 23 materials priced on Kromede |
| Import crafting graph (Asmodian) | 745 recipes, fees from the file, source `gamers4.life crafting graph` authorized |
| Scanner code on that data (quantity 1, commission 0 because none is set) | 399 items, 52 complete, 6 profitable before commission, 347 incomplete (no sell price 282, missing buy price 216, unknown fee 91; overlapping) |

Not verified: MT-1 checks 4 (stale display) and 6 (no cross-server fallback, only one market);
the Scanner screen itself with commission set; clean install (Deferred); native Save/Open dialogs.

## Known bugs, blockers, unfinished work

- No known failing test.
- **Commission is not set** in the `.e2e` data (and possibly not in the real DB): the Scanner then
  marks every result "incomplete (commission not set)". The in-game commission rate is unknown to
  the project; the user must enter it (Settings).
- **`units_sold` / `sold_avg_price` not stored live** (see above). Next step: the user opens
  `https://aion2.exchange/api/items?sort=key&order=asc&window=24h&limit=1000&offset=0&server=12316`
  in a browser and searches for `units_sold`.
- Splendent recipes: fee unknown (NULL) -> incomplete until the user enters a fee; quantities are
  the model's expected materials rounded up; morph/conversion routes (17 in the model) not
  imported, so costs are an upper bound.
- gamers4.life graph: region not stated (English names match aion2.exchange Global items);
  476 recipes per race have no inputs and are skipped; same-name variants merged into one item
  (a sell price may belong to one variant only); combo chance and combo item ignored.
- A failed refresh still uses up the one-hour slot (time recorded before the request). Possibly
  intended; undocumented.
- **Clean-install test: Deferred / Not yet verified.** Procedure: `docs/INSTALL.md`.
- Not available: XLSX import; edit/delete UI for markets and sources; item archiving; nested
  categories; code signing.
- The real DB still contains 4 DEMO items and 2 DEMO recipes (fictional, region OTHER): Settings >
  Demo / test data removes them.
- `docs/player-test-wind-elixir.png` is an untracked screenshot from an earlier test; not committed.
- A collaborator invitation for GitHub user `Kaamll` was requested; the GitHub CLI is not installed,
  so the user was given the website steps. Not confirmed as sent.
- The Claude desktop app is an MSIX package: processes it starts may see a virtualized `%APPDATA%`.
  In session 3 the `.e2e` database was readable at the normal path; for the real database, prefer a
  backup file from the user.

## Decisions and assumptions

- Money = integers in the smallest unit. Commission in basis points, revenue rounded down. ROI =
  profit / total cost (README 5.4).
- Missing price, unknown fee (`craft_fee` NULL) or forced craft without recipe never become zero:
  results are "incomplete".
- Reliability (rule 3 relaxed): Global `verified` or `community` = reliable by default; KR/TW
  never. The "Verified Global recipes only" filter (Calculator bar, Scanner filters) excludes
  community recipes from that analysis. `user_provided` and `unverified` are not reliable.
- Prices: `price_kind` says what a number is (listing ≠ sale). One market = region + server +
  faction. Resolution: chosen kind only, manual override > fresh > provider > manual > import.
- Provider actions (refresh, history, crafts import, enable/disable) run one at a time
  (`serial` in `refresh.ts`) because each rewrites the whole status row.
- Community recipe imports upsert by `recipe_key` (`aion2.exchange:splendent:<race>:<key>`,
  `gamers4.life:<recipe id>`): a re-import replaces ingredients and notes, keeps fee, status and
  archive state the user changed.
- Splendent quantities: per attempt x expected attempts summed over steps, rounded up (user's
  choice over fractional quantities). Kina listed as an ingredient (gamers4.life) is added to the fee.
- Migrations run in `db-guard`, never in the SQL plugin; add them only in `backup.rs` `MIGRATIONS`.
- Backups never overwrite and are never deleted by the app.
- Python on this PC writes cp1252 by default: always pass `encoding="utf-8"` when patching files.
  Long inline heredocs in the Bash tool can break on quotes: write scripts to the scratchpad instead.

## Data sources and verification status

No AION 2 data ships with the app; nothing is `verified`. All imported data is `community`.
Details, known and unknown terms: `docs/DATA_SOURCES.md`.
- **aion2.exchange** (user-authorized 2026-10-31): prices (`lowest_listing` per Global server),
  Splendent crafts model. Only the app calls it, on a user's button press, at most once per hour
  per request. **AI assistants must never fetch the site** (robots.txt disallows AI agents); the
  user saves responses as fixtures.
- **gamers4.life crafting graph** (user-authorized as community data): profession recipes, read
  from a file the user saved.
- **gamers4.life item list** (robots.txt allows all agents): French item names and the icon list
  via `npm run item-data`. Icons are loaded from gamers4.life when shown (webview cache 7 days);
  nothing is bundled or published, so installers can go on public GitHub Releases.
- Other recipe sites: references only. KR/TW data must stay in its own labelled space.

## App updates

Tauri updater: `npm.cmd run release -- <x.y.z>`, then upload `bundle/upload/` to GitHub release
`v<x.y.z>` (`docs/INSTALL.md`, "Publishing an update"). Endpoint:
`releases/latest/download/latest.json`. Private key outside the repo:
`~/.tauri/aion2-craft-profit-manager.key` (no password). 0.1.1 is the first version with the updater;
a real update from 0.1.1 to a later version has not been tested yet.

## Next tasks, in priority order

0. Publish v0.1.1: GitHub release with all files of `src-tauri/target/release/bundle/upload/`, then
   install it once by hand (0.1.0 has no updater) and prove the updater with a later version.
1. With the user: set the commission (Settings), then check the Profit Scanner screen in the
   `.e2e` app (or the real app after a backup) and report the profitable recipes.
2. Resolve the empty `units_sold` (browser check above); adjust the parser only if the live field
   names differ from the fixture.
3. Import the crafts model's morph/conversion routes as community recipes (lower Splendent costs),
   if the user wants it.
4. Clean-install test of both installers (Deferred / Not yet verified), by the user:
   `docs/INSTALL.md`; rebuild the installers first (they predate session 3). Mark step 5 done
   only if it passes.
5. User check of the native Save/Open dialogs in Settings > Backup and restore.
6. Later, only if asked: XLSX import, market/source editing, item archiving.

## Next session instructions

1. Read `README.md` in full first. It is the authoritative product specification: never rewrite,
   shorten or reorder it.
2. Read this `HANDOFF.md`, `docs/PROJECT_STATUS.md`, `docs/DATA_SOURCES.md` and `docs/TECHNICAL.md`.
3. Inspect the actual repository (`git log`, `git status`) instead of assuming this summary is
   complete.
4. Re-check the skills available in the session and read the relevant ones before working.
5. Re-run `npx tsc --noEmit`, `npx vitest run`, and in `src-tauri` `cargo test --lib` and
   `cargo clippy --all-targets`; compare with the results above. `npm run e2e` is safe (isolated
   data) but deletes the `.e2e` test data.
6. Continue from the first unfinished priority above without recreating completed work. Do not
   mark step 5 done before the clean-install test passes.
7. Never fetch aion2.exchange (or any site that disallows AI agents) with AI-agent tooling; the
   app's own provider calls are user-authorized. Ask the user to save responses as fixtures.
8. Never test against the real database: use the `.e2e` identifier.
9. Communicate only in English (README 15.1), even if the user writes in another language, and
   keep following every requirement in the README.

**First action:** run `git log --oneline -5` and `git status`, then the checks in step 5, then ask
the user whether release v0.1.1 is published (task 0).
