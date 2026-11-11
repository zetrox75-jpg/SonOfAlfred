# SonOfAlfred — AION 2 Craft Profit Manager

> Windows desktop app to manage, analyse and optimise **crafting profitability for AION 2 Global**.
> Built with Tauri 2, React, TypeScript and SQLite. All data stays on your PC.

SonOfAlfred keeps a catalogue of verified and community recipes, tracks market prices
(manual entry, CSV import or the community [aion2.exchange](https://aion2.exchange) provider),
computes full crafting chains and ranks the most profitable crafts — offline first.

> **Note:** the authoritative product specification lives in [`docs/SPEC.md`](docs/SPEC.md).
> It is the reference for every feature decision and must never be rewritten silently.
> The session-to-session state is tracked in [`HANDOFF.md`](HANDOFF.md) and
> [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

## Features

- **Catalogue** — search, filter and edit items and recipes; `verified`, `community` and
  `user_provided` statuses with full provenance (source, region, date).
- **Craft calculator** — full cost breakdown including intermediate components, batch yield
  and surplus, configurable fees and commission, net profit, margin, ROI and break-even price.
- **Crafting tree** — recursive component expansion, alternative recipes, cycle detection,
  buy / craft / cheapest strategy per component.
- **Profit scanner** — sortable, filterable ranking of all known recipes, with explicit
  incomplete/stale data handling (a missing price is never treated as zero).
- **Market & prices** — manual entry with history, CSV import, and the community
  `aion2.exchange` provider (public, read-only, rate-limited, hourly refresh).
- **Inventory** — owned quantities deducted from crafting plans, buy/craft comparisons,
  with optional auto-import by passive capture of your own game session
  (experimental, opt-in, Npcap, read-only — same approach as community DPS meters;
  see `docs/SPEC.md` §16.8). Manual entry and CSV always work without it.
- **Import / export** — CSV and full JSON export, SQLite backup and restore.
- **Offline first** — no account, no server: the app works fully with manual pricing offline.

## Screens

Dashboard · Catalogue · Craft calculator · Crafting tree · Profit scanner ·
Market / prices · Inventory · History · Import / export · Settings.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| UI | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Persistence | SQLite (versioned migrations) |
| Charts | Recharts |
| Validation | Zod |
| Tests | Vitest, `cargo test` |

## Getting started

Prerequisites: [Node.js](https://nodejs.org) 22+, [Rust](https://www.rust-lang.org/) stable,
Windows 10/11 (see the official Tauri 2 prerequisites for other platforms).

```bash
npm install
npm run dev            # Vite dev server
npm run tauri dev      # full desktop app in development mode
```

Useful scripts:

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (domain, services, providers) |
| `npm run e2e` | Isolated end-to-end script (own app identifier, safe data) |
| `npm run item-data` | Fetch French item names + icons from gamers4.life (public data) |
| `npm run tauri build` | Production build + Windows installers (NSIS / MSI) |

Rust checks (run in `src-tauri/`): `cargo test --lib`, `cargo clippy --all-targets`.

## Project structure

```text
├── docs/            # SPEC, install guide, user guide, technical docs, data sources
├── data/templates/  # Documented CSV templates (items, recipes, prices, inventory)
├── scripts/         # e2e script, item-data fetcher
├── src/             # React + TypeScript frontend (app, features, domain, services)
├── src-tauri/       # Rust backend (commands, migrations, backup, capabilities)
├── tests/           # Vitest suites, fixtures, mocks, manual test material
├── AGENTS.md        # Working rules for AI coding agents (read this first)
├── HANDOFF.md       # Session handoff and current real state
└── docs/SPEC.md     # Authoritative product specification
```

Each folder contains its own `README.md` describing its contents and conventions.

## Documentation

- [Product specification](docs/SPEC.md) — authoritative requirements
- [Install, backup and troubleshooting](docs/INSTALL.md)
- [User guide](docs/USER_GUIDE.md)
- [Technical documentation](docs/TECHNICAL.md)
- [Data sources and their terms](docs/DATA_SOURCES.md)
- [Project status / changelog](docs/PROJECT_STATUS.md)
- [Manual tests](docs/MANUAL_TESTS.md)

## Contributing

Contributions are welcome. Read [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) first —
it covers setup, branch/commit conventions, the mandatory test checks and the project's
data-integrity rules. AI coding agents must additionally follow [`AGENTS.md`](AGENTS.md).

Please report vulnerabilities privately — see [`.github/SECURITY.md`](.github/SECURITY.md).

## Status

Steps 0–4 of the build plan are done; step 5 (Windows finalisation) is implemented but its
clean-install validation is still pending. See [HANDOFF.md](HANDOFF.md) for the current,
honest state of the repository.

## License

No license has been chosen yet — all rights reserved by default. If you want to reuse
code from this repository, please open an issue first.
