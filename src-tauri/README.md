# `src-tauri/` — Backend (Rust, Tauri 2)

The native desktop layer: SQLite persistence, versioned migrations, backups and the
Tauri commands exposed to the frontend.

## Layout

```text
src-tauri/
├── src/
│   ├── lib.rs       # Tauri setup, commands (write_transaction, startup_status, restart…), db-guard plugin
│   ├── main.rs      # Entry point (windows_subsystem)
│   └── backup.rs    # Migration list (single source of truth), VACUUM INTO backup, restore + swap
├── migrations/       # Versioned SQLite migrations (0001–0005) — only ever added to backup.rs MIGRATIONS
├── capabilities/     # Tauri permissions: minimal (read-only SQL, save/open dialogs, HTTP to aion2.exchange only)
├── icons/           # App icons
├── build.rs         # Tauri build script
├── Cargo.toml
└── tauri.conf.json   # App identity, windows, bundling
```

## Conventions

- **Migrations are the single source of truth for the schema.** Add new migrations only
  in `backup.rs`'s `MIGRATIONS` list; they run in the `db-guard` start-up plugin, never
  in the SQL plugin. The app takes a pre-migration backup automatically.
- **Permissions stay minimal**: see `capabilities/default.json`. HTTP is restricted to
  `https://aion2.exchange/api/*`.
- **Backups never overwrite existing files and are never deleted by the app.** Restore
  checks the file, swaps it in, and restarts.
- Money is stored as integers in the smallest currency unit; commission is in basis
  points.
- Rust tests: `cargo test --lib` (migration list, backup/restore checks). Lint:
  `cargo clippy --all-targets`.

The isolated test app identifier `com.aion2.craftprofitmanager.e2e` (used by
`npm run e2e`) keeps its data separate from the real database — never run automated
tests against the real app data.
