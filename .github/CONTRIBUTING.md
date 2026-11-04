# Contributing to SonOfAlfred (AION 2 Craft Profit Manager)

Thanks for your interest. This is a Windows desktop app (Tauri 2 + React + TypeScript +
SQLite) for analysing crafting profitability in AION 2 Global. Before contributing,
please read this file and the [project status](../docs/PROJECT_STATUS.md).

## Ground rules

- **English only** in issues, PRs, commits, documentation and code comments.
- **Data integrity is the core value of this project.** Never invent recipes,
  quantities, prices, taxes or market data. A missing value is "incomplete", never zero.
  Provenance (`verified` / `community` / `user_provided`) must be preserved everywhere.
- **Do not add game data from other regions** (KR/TW) as Global data.
- No credentials, API keys or tokens in source control.
- Do not integrate any site behind a login, bot wall or paywall, and never touch
  private/internal game endpoints. Public, keyless, read-only APIs are acceptable with
  attribution and rate limiting (see [`docs/DATA_SOURCES.md`](../docs/DATA_SOURCES.md)).

## Development setup

Prerequisites: Node.js 22+, Rust stable, Windows 10/11 (Tauri 2 prerequisites otherwise).

```bash
git clone https://github.com/zetrox75-jpg/SonOfAlfred.git
cd SonOfAlfred
npm install
npm run tauri dev
```

## Making changes

1. Fork / branch from `main`. Use a short-lived branch named after the change:
   `feat/<scope>`, `fix/<scope>`, `docs/<topic>`, `chore/<topic>`.
2. Keep commits small; use [Conventional Commits](https://www.conventionalcommits.org)
   (`feat(ui): …`, `fix(scanner): …`, `docs: …`).
3. Add or update tests for any change to domain calculations, services or providers.
   Fixtures must be saved, anonymized responses — never live-network tests.
4. Before opening a PR, all of these must pass:

   ```bash
   npx tsc --noEmit
   npx vitest run
   cd src-tauri && cargo test --lib && cargo clippy --all-targets
   ```

   The CI workflow runs the same checks on every PR.
5. Open a Pull Request against `main` using the PR template, and fill in the checklist.
6. Never mark a spec step as done if its validation criterion is not satisfied.

## Architecture pointers

- `src/domain/` — pure calculation and validation logic (no UI), fully unit-tested.
- `src/services/` — data access, CSV, market providers behind `MarketDataProvider`.
- `src/features/` — one folder per application screen.
- `src-tauri/` — Rust commands, versioned SQLite migrations (`migrations/`), backups.
- `tests/` — Vitest suites, fixtures and mocks.
- Full details: [`docs/TECHNICAL.md`](../docs/TECHNICAL.md) and the folder `README.md`s.

## Reporting bugs

Use the bug report issue template and include: app version, Windows version, steps to
reproduce, expected vs actual behaviour, and any relevant error text or backup file
path. Do not paste your full database into an issue.

## Security

Do not open public issues for vulnerabilities — see
[SECURITY.md](SECURITY.md).
