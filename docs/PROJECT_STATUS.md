# Project status

`docs/SPEC.md` is the authoritative product specification (moved there verbatim from the
former root `README.md` on 2026-11-05; the duplicate root copy was removed). Never rewrite it.
Last synced 2026-10-31 (includes section 16, market data).
This file tracks progress against the section 10 build plan.

## Run

Prerequisites (verified 2026-10-31): Node 26.10, npm 11.19, Rust 1.99.1 (rustup, MSVC),
Visual Studio Build Tools 2026 (C++), WebView2 156.

```bash
npm install
npm run tauri dev     # Windows dev window
npm test              # Vitest: business rules, migrations, CSV import
npm run typecheck
```

Database: `%APPDATA%\com.aion2.craftprofitmanager\aion2.db`, created at startup.
Migrations: `src-tauri/migrations/`, registered in `src-tauri/src/lib.rs`.

End-to-end checks in the real window: start with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` and drive the
page over the Chrome DevTools Protocol (WebSocket at `http://127.0.0.1:9333/json/list`).

## Step 0: audit (done)

- Repo held only the specification. Nothing was deleted.
- Rust was missing and was installed with `winget install Rustlang.Rustup`.

## Step 1: runnable base (done)

| Item | Evidence |
|------|----------|
| Tauri 2 + React 19 + TS + Vite + Tailwind 4 | `npm run build`, `cargo build`, `cargo clippy` clean |
| Windows window starts, DB created | `_sqlx_migrations` v1 + v2 applied, success = 1 |
| Foreign keys enforced in the app | Settings page shows "Enforced" (read via CDP in the real window) |
| Dark theme, 10-entry menu, Alt+1..0 | Checked in the real window |
| Dashboard from real counts, empty states | Checked in the real window |

## Step 2: data and catalogue (done)

| Item | State | Evidence |
|------|-------|----------|
| Data source research | done | `docs/DATA_SOURCES.md`: no site documents an API, export or reuse permission, so none is fetched |
| Migration v2: `recipes.recipe_key` (stable key for re-import) | done | applied on the existing DB |
| Transactional writes (`write_transaction` Rust command) | done | Frontend can no longer execute SQL directly (`sql:allow-execute` removed) |
| Catalogue: search, filters (region, status, category, profession, max level, archived), sort name/category | done | real window |
| Item sheet: source, region, version, verified date, recipes producing it, ingredients, yield, "used in" | done | screenshot in real window |
| Add/edit item, add/edit recipe, archive/restore recipe | done | real window: fee edit saved, cycle refused, archive/restore |
| CSV templates + column reference | done | `data/templates/`, test checks headers match the importer |
| CSV import: validation, preview (create/update/unchanged + changed fields), error report, confirm, all-or-nothing | done | real window with demo files; unit tests |
| CSV export (import format) and full JSON export | done | Round trip export, re-import, no change is unit-tested. Save As dialog verified by the user 2026-10-31; a direct write outside the chosen path is refused |
| Only verified Global data in catalogue | done | Database ships empty; fictional demo files are region OTHER, source type demo |

Validation criterion "import, view, edit and export recipes without data loss": met.

## Step 3: calculation engine (done)

Engine: `src/domain/calculations/craftPlan.ts` (pure, no UI/DB) on top of `profit.ts`.

1. Per item, decide buy / craft (which recipe) / missing from per-unit costs; strategy per
   component: auto (cheapest complete option), buy, craft; forced recipe for alternatives.
2. Walk the decision graph consumers-first: demand is pooled per item, so a shared ingredient
   is counted once, stock is deducted once, batches are rounded once (`ceil(needed / yield)`),
   and ingredients are expanded from real runs.
3. Totals: purchases, fees, stock value; **cash cost** (owned stock free) and **economic cost**
   (owned stock at market buy price) are separate and labelled.
4. Missing price / unknown fee / forced craft without recipe never become zero: totals turn
   null and the items are listed. Stale prices and non-verified-Global recipes make the result
   "not reliable".
5. Cycles: a recipe that loops back is skipped (reported); a target that only loops stops with
   an explicit error.
6. `profitability()`: gross/net revenue, commission (basis points), fixed fees, profit,
   margin, ROI (profit / total cost, README 5.4), break-even unit price (README 5.5).

| Item | Evidence |
|------|----------|
| Engine tests (chain, batches, shared ingredient, alternatives, cycles, partial stock, cash vs economic, missing/stale/unreliable, buy vs craft, profitability) | `tests/craftPlan.test.ts`, 21 tests |
| Migration v3: `markets.faction` | applied in the app (schema version 3) |
| Prices: append-only manual observations per market, latest per item/type, observed sell price wins over estimate, freshness | `tests/planQueries.test.ts` |
| Inventory persisted in SQLite (0 removes the row) | `tests/planQueries.test.ts`; set in the real window |
| Settings: currency label, commission % + required source, freshness hours, active market | real window; commission unset = profit incomplete |
| Calculator page: production, cost (cash/economic), sale, profitability, buy-vs-craft for the target, pooled shopping list with inline price entry | real window, numbers match hand calculation (see below) |
| Crafting tree page: expandable tree, per-component strategy and recipe choice, branch costs, shared marker, buy-vs-craft table with "comparison incomplete" and missing list | real window, screenshot |
| Inventory page: owned quantities, stock value, plan needs / from stock / still to buy | real window |
| One shared state (target, quantity, market, strategies, valuation) for Calculator, Tree, Inventory | `src/features/crafting/workspace.tsx` |

Real-window check (fictional DEMO data, test market, 5% commission, fictional prices; all
removed afterwards): DEMO Sword x2 gave purchases 150, fees 140, total 290, net revenue 475,
profit 185, margin 38.9%, ROI 63.8%, break-even 153, matching the hand calculation. With 5 ore
owned: cash cost 240, economic cost 290. Forcing "buy" on the ingot with no ingot price gave an
incomplete total naming the missing price.

### Market data (README 16) in step 3

The calculator reads one **price book** built from stored observations of the selected market
(`src/services/planQueries.ts`). It never calls a provider. Manual prices are stored today; a
provider adapter (step 4) will write normalized observations into the same store, so the
calculator does not change. aion2.exchange (see `APIs prix Market AION 2 Global.md`) is not
integrated: its endpoints are known only from a third-party project's code, the site blocks
bots, and README 16.2 requires checking permission and terms first.

## Step 4: market and scanner (done)

| Item | Evidence |
|------|----------|
| Migration v4: README 16.4 price model. `price_kind` (lowest_listing, typical_listing, median_listing, sale_price, estimate, unknown), currency, source_ref, is_override, retrieved_at, raw_snapshot; market and source required; exact duplicates rejected | `tests/migrations.test.ts`, incl. a test that v4 keeps step 3 rows; applied to the real DB (v1-v4 success) |
| Price resolution: one market only; the kind set as buy / sell price method only (never substituted); manual override first, then fresh before stale, then provider > manual > import (README 16.6) | `tests/planQueries.test.ts` |
| Market / Prices page: market, buy and sell price methods, latest price of each kind with source, kind, age and stale flag; manual entry with kind, quantity, observation time, comment, override; provider status panel | real window |
| History page: Recharts line per price kind, shown from 2 observations; period covered; gaps longer than the freshness limit; full observation list | `tests/planQueries.test.ts` (history); real window screenshot |
| Price CSV import (market by name, observation date required, source type `import`, duplicates skipped) and inventory CSV import, with preview and confirmation | `tests/marketImport.test.ts`; real window (re-import: 0 added, 2 skipped) |
| Profit scanner: every craftable item through the step 3 engine; filters (category, profession, verified, profit sign, min margin, min ROI, fresh prices); sortable; incomplete results in a separate table, never ranked | `tests/scanner.test.ts`; real window, numbers match hand calculation |
| Dashboard: profitable crafts and best 5, from reliable results only | real window |
| Demo data cleanup (Settings): only `demo`-source records, their prices and inventory, and categories/professions left unused; demo items used by user recipes are kept and listed; one transaction | `tests/cleanup.test.ts`; preview checked in the real window |
| `write_transaction` returns rows affected per statement | used by the price import report |
| Step 3 engine unchanged; inventory is never consumed automatically | `tests/craftPlan.test.ts` unchanged and passing |

Real-window check (fictional values, removed afterwards): two markets differing only by faction;
prices entered in Elyos were invisible in Asmodian. With sell method "completed sale", the
calculator used the 250 sale and ignored the 260 listing: total 290, net revenue 475, profit 185
(same as step 3). A 3-day-old price lost to a fresh one.

### aion2.exchange adapter (done; enabled by default since 2026-10-31)

Investigation (2026-10-31): operator-published Swagger at `/api/docs` ("Aion2Market API" 0.1.0,
"Read-only market data"); robots.txt allows `User-agent: *` with `Content-Signal: search=yes,
ai-train=no, use=reference` and disallows AI agents; no terms page; Cloudflare `max-age=3600`.
The AI assistant did not fetch the API; the user saved four responses in a browser
(`tests/fixtures/aion2exchange/`, see its README).

| Safeguard | Implementation | Evidence |
|-----------|----------------|----------|
| Disabled by default; explicit activation | `provider.aion2exchange` status in settings, `enabled: false` until the user ticks the acknowledgement and presses Enable (Settings) | real window: "Status: disabled", Enable greyed out until ticked |
| Unofficial notice | Settings card: community service, no terms, `use=reference` undefined, permission **not confirmed**, listings never sales, exact requests and User-Agent | real window |
| No live request in implementation or tests | adapter is pure (`src/services/market/aion2exchange.ts`); only `refresh.ts` calls `fetch`, only from buttons; a test fails if the adapter module calls `fetch` | `tests/aion2exchange.test.ts`; DB had 0 provider prices after the check |
| Tests on the 4 validated fixtures | schemas, normalization, URLs, cache, storage | 17 tests |
| Listings never completed sales | every observation stored as `lowest_listing`; `sold_*` fields never stored as sales | tests: sell method "completed sale" finds no price |
| Region / server / faction separation | a market is bound to one server (`markets.provider_server`, migration v5, unique); only GLOBAL catalogue items are matched | tests: other server gets nothing; KR items never matched |
| One-hour cache, refresh on explicit action | `canRefresh` per request key (`servers`, `items:<server>`, `prices:<server>:<item>`); buttons disabled until the hour has passed; server list reused for the hour | tests |
| Network limited to the documented endpoints | capability `http:default` allows only `https://aion2.exchange/api/*`; URL builders only make `/servers`, `/items`, `/items/{id}/prices` with numeric ids | real window: `https://blocked.invalid/x` refused by the app ("url not allowed on the configured scope"); tests reject non-numeric ids |
| Honest User-Agent, timeout, errors | `AION2-Craft-Profit-Manager/0.1.0 (desktop app; user-initiated refresh)`; 15 s connect + request timeout; clear messages for timeout, HTTP 429, other HTTP errors, non-JSON, unexpected schema; last error kept in the status panel; nothing stored on error | code + schema tests |
| No regression | step 3 engine, inventory, calculator, scanner untouched | all earlier tests unchanged and passing |

**Not verified, by design:** no request has been made to aion2.exchange by the app. The first
real refresh happens only when the user enables the provider and presses a button. Until the
operator confirms what `use=reference` allows, permission to use the API in this app remains
unconfirmed (stated in the in-app notice).

**Update 2026-10-31 (the table above records the earlier state):** the user authorized the API
(README rule 6 relaxed). The provider is now enabled by default and is the default market
provider; Settings can still disable it, and the notice says so. `units_sold` / `sold_avg_price`
are kept in the raw snapshot under `community_unconfirmed`, never as sales. Provider actions run
one at a time, so a refresh ending after "Disable" cannot re-enable it (test in
`tests/marketRefresh.test.tsx`). Known and unknown terms: `docs/DATA_SOURCES.md`.

## Step 5: Windows finalisation (implemented; validation criterion Deferred / Not yet verified)

Approved order: 5a -> 5b -> 5c -> 5d -> 5e -> 5f.

### 5a backup and restore (done)

| Item | Implementation | Evidence |
|------|----------------|----------|
| Consistent backup under WAL | `VACUUM INTO` on the live pool (`src-tauri/src/backup.rs`), then `PRAGMA integrity_check` on the copy | Rust test: a row still only in the WAL is in the backup |
| Never overwrite | refused if the file exists; SQLite also refuses a non-empty target; save dialog defaults to a new timestamped name in `backups/` | Rust test; real window |
| Restore validation | source opened read-only; integrity, `_sqlx_migrations` exactly 1..n with our checksums, all succeeded, n <= latest; staged copy re-checked | Rust tests: text file, newer schema (v99), edited checksum refused |
| Safety and rollback | safety backup of the live DB first; pool write lock; files moved aside and moved back if the swap fails; clear message with the safety backup path if even that fails | Rust test: failed swap leaves the original; real window restore + restart |
| Explicit confirmation | Settings > Backup and restore: pick file, then "Replace ALL current data?" panel with Cancel / "Replace my data and restart" | real window (card and buttons); native dialogs not driven |

### 5b backup before migrations (done)

Verified in `tauri-plugin-sql` 2.6.0 source: registered migrations run inside the plugin's own
setup for `preload` databases, otherwise in its `load` command; Tauri sets plugins up in
registration order, before any window exists (`tauri` 2.12.5 `app.rs`). So migrations are no
longer registered with the plugin and `preload` was removed. A `db-guard` plugin, registered first,
runs `backup::prepare`: if the database has history and a migration is pending, it writes
`backups/aion2-pre-v<N>-<time>.db` with `VACUUM INTO` and checks it; if that fails, no migration
runs. Same SQL, so the stored checksums still match.

| Evidence | Result |
|----------|--------|
| Rust test `startup_backs_up_before_migrating` | new DB: no backup; v4 DB: v4 backup with the row, then v5; failed backup: still v4; newer schema: refused |
| Real window, copy of the real DB (v5) | no error, no backup (checksums match) |
| Real window, v4 test DB | `aion2-pre-v5-...db` (v4, row kept), live DB v5 with the row; banner shown |

### 5c error handling (done)

| Failure | What the user sees | Evidence |
|---------|--------------------|----------|
| Startup DB check / upgrade fails, or schema newer than the app | full-window "The database could not be opened" with the reason; no page loads | real window with a v99 test DB |
| Render crash | error boundary with message, JS stack and component stack (selectable); data note | real window, crash forced through React internals |
| Tauri cannot start, or a panic | native message box + `%TEMP%ion2-craft-profit-manager-error.log` | code review only (not triggered) |
| DB connection on first use (no preload) | existing per-page "Database error" box | real window: write before any page load works (`writeTransaction` loads first) |

### 5d end-to-end script (done)

`npm run e2e` (`scripts/e2e.mjs`, no new dependency) builds a debug app with identifier
`com.aion2.craftprofitmanager.e2e` into `src-tauri/target-e2e`, so it has its own data folder; it
refuses to run unless both folders end in `.e2e`, deletes them at start and in `finally`, and only
stops processes started from that build. Checks over CDP: identifier, startup status, all 10 pages
render with no error box, write, backup, no overwrite, **persistence across two separate
launches**, restore + safety backup + automatic restart + restored data. Result 2026-10-31: 8/8
PASS; a first run that failed on argument quoting still deleted the test data.

### 5e production build (artifacts built; clean-install test: Deferred / Not yet verified)

`npx tauri build` (release, LTO) on 2026-10-31, exit 0. The Tauri CLI downloaded its packaging
tools from GitHub (NSIS 3.13, nsis_tauri_utils 0.5.3, WiX 3.14). Artifacts actually generated:

| Artifact | Size | SHA-256 |
|----------|------|---------|
| `src-tauri/target/release/bundle/nsis/AION 2 Craft Profit Manager_0.1.0_x64-setup.exe` | 3.73 MiB | `73967932C02E105A4DA9B69213781662F11B980EBF81E1BA6050B055988B967B` |
| `src-tauri/target/release/bundle/msi/AION 2 Craft Profit Manager_0.1.0_x64_en-US.msi` | 5.07 MiB | `A9106A2C712A7665B4D202A86516F0AF02686DF21A11B9754B36B2577149702A` |

Rebuilt 2026-10-31 07:15 from commit `8e2d3db` (null item name fix). They predate the provider
interface and the retrieval-time label: rebuild before MT-1 check 3.

Not validated: no clean Windows environment is available to the assistant (Windows Sandbox is not
installed here; enabling it needs administrator rights). The installers were not run on this PC,
because the installed app would use the real database. The step 5 criterion (clean install works
and keeps data between two launches) is therefore **not yet met**.

**Clean-install test: Deferred / Not yet verified** (decided by the user on 2026-10-31: continue
with the documentation and run the test later). Procedure: `docs/INSTALL.md`, "Clean-install test".
Persistence across two launches *is* verified for the app itself by `npm run e2e` (isolated debug
build), but not through either installer on a clean system.
Unsigned installers: Windows SmartScreen may warn. WebView2: default `downloadBootstrapper`
(internet needed if WebView2 is missing).

### 5f documentation (done)

| Document | Content |
|----------|---------|
| `docs/INSTALL.md` | installers, SmartScreen, WebView2, data and backup locations, backup, restore (in app and by hand), migration safety, troubleshooting, known limitations, clean-install test procedure |
| `docs/USER_GUIDE.md` | first steps, screens, how to read results, provider, demo data |
| `docs/TECHNICAL.md` | architecture, DB access, commands, migrations and start-up guard, restore internals, permissions, tests and checks |

### Market refresh tests (2026-10-31, after step 5)

| Layer | What | Result |
|-------|------|--------|
| Automated | `tests/marketRefresh.test.tsx` (jsdom): Market page rendered with `MockMarketDataProvider` (`tests/mocks/`, fictional fixture `tests/fixtures/market/mock-prices.json`, `_fixture: true`, `_source: "mock"`), user click on Refresh prices; checks one provider call, price + source + observed/retrieved timestamps, stale shown as stale, missing shown as `-`, no cross-server fallback, no network (all fetch/invoke spied) | `npm test -- tests/marketRefresh.test.tsx`: 1 passed; mutation check (tooltip without retrieval time) fails as expected |
| Manual | `docs/MANUAL_TESTS.md` MT-1, run by the human operator only; read-only helper `tests/manual/read-market-results.mjs` | before fix `8e2d3db`: 0 prices stored; retest at `7ddc064` (Kromede Asmodian, EU): **9 of 10 test items priced**, 494 not in catalogue, 353 skipped. Checks 2-8 not reported yet |
| Automated | Opt-in "add listed items missing from my catalogue": adapter test (items created once, Global, community, provider source, category, priced; NOT EXISTS guard against duplicates) and Market page test (checkbox, new item priced, search suggestion) | 103/103 |

Live finding fixed in `8e2d3db`: the API schema allows `name: null` for items; one such item made
the whole `/api/items` response fail validation, so nothing was stored. Price labels now also show
the retrieval time (hover: "Observed … · retrieved …", README 16.4).

### Session 3 (2026-10-31): relaxed rules, community recipes

The user relaxed README rules 3, 4 and 6 and sections 15.3, 16.2, 16.4 and 16.7 (commit
`b46e7c1`). Work in commit `f14be67`:

| Change | Where | Evidence |
|--------|-------|----------|
| aion2.exchange enabled by default, source recorded as authorized (`is_authorized = 1`, also fixed on older DBs at the next refresh) | `aion2exchange.ts` (`defaultStatus`, `SOURCE.authorized`), `provider.ts` | tests; live `.e2e` refresh: `enabled: true` without a click |
| Provider status writes serialized (a refresh ending after Disable cannot re-enable) | `refresh.ts` (`serial`) | `tests/marketRefresh.test.tsx`: fails without the lock, passes with it |
| `units_sold` / `sold_avg_price` kept in `raw_snapshot.community_unconfirmed`, never a sale | `aion2exchange.ts` | fixture test passes; **live refresh stored 0 rows with them (cause not found)** |
| Global `community` data reliable by default; "Verified Global recipes only" filter on Calculator and Profit Scanner | `domain/models` (`isReliable`), `craftPlan.ts` (`verifiedOnly`), `planQueries.ts`, `workspace.tsx`, `ScannerPage.tsx`, Dashboard "Reliable Global" | `profit.test.ts`, `craftPlan.test.ts`, `planQueries.test.ts` |
| Splendent crafts import (`/api/crafts/model`), 1 recipe per target, expected quantities rounded up, fee NULL | `aion2exchange.ts` (`craftRecipeStatements`), `refresh.ts` (`importCrafts`), Market page button | `tests/crafts.test.ts` (7); live `.e2e`: 19 Kromede recipes written |
| gamers4.life crafting graph import from a saved file, one race at a time | `src/services/craftingGraph.ts`, Import / Export card | `tests/craftingGraph.test.ts` (7); live `.e2e`: 745 Asmodian recipes written |
| Shared upsert for community recipes (keeps a fee the user changed) | `src/services/communityRecipes.ts` | both test files |

Live run in the isolated `.e2e` app (Kromede · Asmodian (EU), server 12316), read-only checks of
its database: 499 prices (`lowest_listing`, source + times), 19 Splendent + 745 profession
recipes. The real scanner code on that data, quantity 1, **commission not set (0 used)**: 399
craftable items, 52 complete, 6 profitable (top: Splendent Star Dragon Lord Necklace and Gloves,
about +35M each before commission); 347 incomplete (no sell price 282, missing buy price 216,
unknown fee 91; overlapping).

### Mark plan as crafted (2026-11-10)

| Item | Evidence |
|------|----------|
| `inventoryAfterCraft` (pure): stock used is removed, batch surplus kept, the target's whole crafted output added; bought-only items unchanged | `tests/craftPlan.test.ts`, 2 new tests (24 in the file) |
| Inventory page, "Current plan" card: "Mark plan as crafted" button, second click confirms, one transaction; hidden when an item of the plan has no usable recipe | `src/features/crafting/InventoryPage.tsx`; type-checked only, **not yet seen in a real window** |

Stock still never changes on its own: only this user-pressed button applies a plan.

### Scanner: craftable from stock (2026-11-10)

| Item | Evidence |
|------|----------|
| `ScanRow.toAcquire`: distinct items the plan still has to buy, plus components with no usable recipe; 0 = craftable now; null when no plan | `tests/scanner.test.ts`, 1 new test (6 in the file) |
| Scanner page: "From my stock" filter (All / Craftable now / At most 2 items to buy), which turns "Use my inventory" on; sortable "Items to buy" column | `src/features/scanner/ScannerPage.tsx`; type-checked only, **not yet seen in a real window** |

Known limit: the count follows the cheapest plan. An intermediate the plan chose to buy counts as
missing even when its own materials are owned.

### Craft log with real profit (2026-11-10)

| Item | Evidence |
|------|----------|
| Migration v6: `craft_log` (quantity > 0, sold quantity <= crafted, commission in basis points, null cost / estimate allowed, row deleted with its item) | `tests/migrations.test.ts` (table present); `tests/planQueries.test.ts`, 3 new tests; `cargo test --lib` runs the migration list. **Not yet applied to the real database** |
| "Mark plan as crafted" also logs the batch in the same transaction: quantity produced, total cost under the current valuation, sell price and estimated profit at that moment (null when incomplete) | `src/features/crafting/InventoryPage.tsx`; type-checked only |
| `realizedProfit`: net revenue minus the sold share of the cost, share rounded up; unknown cost gives revenue only | `tests/profit.test.ts`, 2 new tests |
| Inventory page "Craft log" card (latest 50): real sale entry (quantity, unit price, commission from Settings stored with it), real profit beside the estimate, two-click delete | type-checked only, **not yet seen in a real window** |
| `craft_log` included in the JSON export | `src/services/catalogue.ts` |

Limits: one sale per log row (saving again replaces it); fixed fees are not logged; the demo
cleanup preview does not count log rows removed with a demo item.

Checks on 2026-11-10, after all three changes: `npx tsc --noEmit` exit 0; `npx vitest run` 13
files, 130 tests passed; `cargo test --lib` 4 passed; `cargo clippy --all-targets` no warnings.

`npm run e2e` on 2026-11-11: **8/8 PASS** after a script fix (`scripts/e2e.mjs` clicked the EN/FR
switch as if it were a menu entry, reloading the window; it now clicks `nav ul button` only). The
run covers a fresh database at v6 and the render of all 10 pages, not the three new interactions.

## Features: finished, partial, not available (README 12)

| Status | Features |
|--------|----------|
| Finished and tested | Catalogue (search, filters, item sheet, add/edit, recipe archive); CSV import with preview and all-or-nothing write (items, recipes, prices, inventory); CSV and JSON export; calculation engine (chains, batches, stock, shared ingredients, alternatives, cycles, cash vs economic cost, profitability, break-even); calculator, crafting tree, buy-vs-craft; scanner; market prices with kinds, freshness, history chart; inventory; dashboard; demo data cleanup; backup / restore; backup before migrations; start-up and render error screens; end-to-end script |
| Built, not fully verified | NSIS and MSI installers (**clean-install test Deferred / Not yet verified**); native error box for start failures (not triggered); native Save/Open dialogs of backup/restore (not driven by the assistant); in-app updater from 0.1.1 (not yet proven by a real update) |
| Partial | aion2.exchange price adapter: default provider, enabled by default (user-authorized 2026-10-31); live refresh and Splendent import checked in the `.e2e` app; MT-1 checks 4 and 6 not tested; no pagination beyond 1000 items. Community recipe imports (Splendent model, gamers4.life graph): built, tested, run once in the `.e2e` app; morph/conversion routes and combo chances not used. Item icons: loaded from gamers4.life when shown, letter tile when offline and uncached, 116 listed files missing on the site |
| Not available | Verified AION 2 Global recipe/item/price data (only community data, imported by the user; nothing shipped); XLSX import; edit/delete of markets and sources; item archiving; nested categories; code signing |

## Known gaps and assumptions

- In-game commission rounding is unknown. Revenue is rounded down (conservative).
- An unknown `craft_fee` (NULL) makes a cost incomplete. Write 0 when there is no fee.
- Buy/craft decisions use per-unit costs; batch rounding and stock are applied afterwards.
- With cycles, the cost of an item can depend on the order items are visited (memoized).
- Default buy and sell price methods are both "lowest active listing" until changed on the Market page.
- aion2.exchange: user-authorized 2026-10-31; terms unknown (recorded in `docs/DATA_SOURCES.md`).
  `/api/items` is requested with `limit=1000` (957 items on the fixture date): if the API grows past
  1000 items, the refresh reports that only part was requested (no pagination yet).
  Items are matched to the catalogue by exact name (case/spacing ignored), Global items only.
  The undocumented `sold_*` statistics are kept in the raw snapshot under `community_unconfirmed`,
  never used or shown as sales.
- Providers implement `MarketDataProvider` (`src/services/market/provider.ts`, README 16.3) and are
  registered by id; a market's `provider_server` is `<provider id>:<server id>`. Real provider:
  aion2.exchange (`refresh.ts`). The second implementation is the test-only mock provider.
- Price import rows that fail the format check are not also checked for unknown items/markets
  in the same pass: fix the reported errors and re-import to see the rest.
- XLSX is not read: save as CSV UTF-8 from Excel.
- Market and source deletion/editing UI does not exist yet; items cannot be archived; categories are flat.
- Installers are not code-signed.
- The 4 DEMO items and 2 DEMO recipes are still in the local database: remove them with
  Settings > Demo / test data.
- Git repository (branch `main`) since 2026-10-31; pushed to `https://github.com/zetrox75-jpg/SonOfAlfred` on 2026-10-31.
- Same-name item variants in the gamers4.life graph are merged into one item (the market and the
  catalogue identify items by name); a sell price may belong to only one of the variants.

## Next

See `HANDOFF.md`, "Next tasks, in priority order".
