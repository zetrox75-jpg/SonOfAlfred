# Technical documentation

Specification: `README.md` (authoritative). Progress: `docs/PROJECT_STATUS.md`. Session state:
`HANDOFF.md`. Data provenance: `docs/DATA_SOURCES.md`.

## Stack

Tauri 2 (Rust) + React 19 + TypeScript + Vite + Tailwind 4 + SQLite (`tauri-plugin-sql`, sqlx) +
Recharts + Zod + Vitest. Windows x64. Prerequisites and run commands: `docs/PROJECT_STATUS.md`, "Run".

## Layout

| Path | Role |
|------|------|
| `src/domain/` | Pure logic, no UI or DB: models (Zod), `calculations/profit.ts`, `calculations/craftPlan.ts` (plan engine), `calculations/scanner.ts`, CSV validation |
| `src/services/` | DB access and SQL statements (`db.ts`, `catalogue*.ts`, `planQueries.ts`, `plan.ts`, `cleanup.ts`, `csv.ts`), backup UI calls (`backup.ts`), market adapter (`market/aion2exchange.ts`, pure) and refresh (`market/refresh.ts`, the only `fetch`) |
| `src/features/` | One folder per screen; shared plan state in `crafting/workspace.tsx` |
| `src/main.tsx` | Start-up gate (`startup_status`) and error boundary |
| `src-tauri/src/lib.rs` | Commands, `db-guard` plugin, panic/start-up error box |
| `src-tauri/src/backup.rs` | Migration list, backup, restore checks, pre-migration backup (+ Rust tests) |
| `src-tauri/migrations/` | Versioned SQL migrations |
| `src-tauri/capabilities/default.json` | Permissions |
| `tests/` | Vitest (node:sqlite on the real migrations), fixtures |
| `scripts/e2e.mjs` | End-to-end test of the real app |

## Database access

- Reads: frontend `Database.select` through `tauri-plugin-sql` (`sql:default`, read-only API).
  The connection opens on first use (`getDb()`), there is no `preload`.
- Writes: only the Rust command `write_transaction(statements)`: one transaction, all or nothing,
  rows affected per statement. `sql:allow-execute` is not granted.
- Money is stored as integers in the smallest unit; commission in basis points.

## Rust commands

| Command | Purpose |
|---------|---------|
| `write_transaction` | All-or-nothing writes |
| `startup_status` | `{ error, backup }` from the start-up guard; the UI shows no page if `error` is set |
| `backup_folder` | `%APPDATA%\<identifier>\backups` (created if missing) |
| `backup_database(path)` | `VACUUM INTO` a new absolute `.db` path, then integrity check; never overwrites |
| `restore_database(path)` | Checked restore (see below); the UI then calls `restart_app` |
| `restart_app` | Restarts the process |

## Migrations and start-up

`tauri-plugin-sql` 2.6.0 would run registered migrations inside its own setup (`preload`) or in
`load`, without a backup. Therefore migrations are **not registered with the plugin**. The
`db-guard` plugin is registered **first** (Tauri sets plugins up in registration order, before any
window exists) and calls `backup::prepare`:

1. open/create `aion2.db` in the app config folder; read `_sqlx_migrations`;
2. any applied version newer than the app: error, nothing changed;
3. pending migrations on a database with history: `VACUUM INTO backups/aion2-pre-v<N>-<time>.db`,
   integrity-checked; on failure, error and **no migration**;
4. `sqlx` `Migrator::run` (each migration in its own transaction, checksums verified).

To add a migration: create `src-tauri/migrations/000N_name.sql` and append `(N, "name",
include_str!(...))` to `MIGRATIONS` in `backup.rs`. Never edit an applied file: checksums are
stored and verified. Add a case to `tests/migrations.test.ts`.

## Restore

`backup::stage_restore` (live DB untouched): source opened read-only/immutable (refused if a
non-empty `-wal` is beside it) → `check_restorable` (integrity, history exactly 1..n with our
checksums, all succeeded, n ≤ latest) → `VACUUM INTO` a staging file → re-check → safety backup of
the live DB. The command holds the plugin's pool **write lock** from the safety backup on, so no
other query runs; it closes the pool, then `backup::swap_in` moves the live files aside, moves the
staging file in, and on failure moves the originals back. Moved-aside files are deleted after
success (the verified safety backup holds the same data).

## Error surfaces

Start-up DB failure → full-window message (`main.tsx`). Render crash → error boundary with
stacks. Tauri start failure or panic → native message box (`rfd`) + `%TEMP%\aion2-craft-profit-manager-error.log`.
Query errors → per-page "Database error" box (`useAsync`). Messages name files, not secrets.

## Permissions

`core:default`, `sql:default` (no execute), `dialog:allow-save`, `dialog:allow-open`,
`fs:allow-write-text-file` (exports to the path the user picked), `http:default` limited to
`https://aion2.exchange/api/*` (adapter disabled by default). Restore files are read by Rust, not
by the frontend.

## Tests and checks

```bash
npx tsc --noEmit
npx vitest run                       # business rules, migrations, CSV, adapter (no network)
cd src-tauri && cargo test --lib     # backup / restore / pre-migration backup
cd src-tauri && cargo clippy --all-targets
npm run e2e                          # real app, isolated identifier .e2e, ~2-3 min first build
npm run tauri build                  # NSIS + MSI in src-tauri/target/release/bundle/
```

`npm run e2e` builds into `src-tauri/target-e2e` with identifier `com.aion2.craftprofitmanager.e2e`,
uses CDP port 9335, and deletes `%APPDATA%` / `%LOCALAPPDATA%` `...e2e` folders before and after.
It never touches the real database.

Manual real-window checks: start `npm run tauri dev` with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`. For isolation add
`--config '{"identifier":"com.aion2.craftprofitmanager.e2e"}'` (and other ports / `CARGO_TARGET_DIR`
if another instance runs).
