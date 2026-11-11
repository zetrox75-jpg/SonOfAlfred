# AGENTS.md — Working rules for AI coding agents

These rules are mandatory for every AI coding agent (Claude Code, Copilot, Cursor, etc.)
working on this repository. They condense the project's standing instructions; the
authoritative product specification is [`docs/SPEC.md`](docs/SPEC.md) — when this file
and the spec disagree, the spec wins, and this file must be fixed.

## Communication

- Communicate with the user **only in English** (replies, explanations, questions,
  progress reports, warnings, summaries, handoff notes).
- All project documentation, developer-facing comments, commit messages and technical
  notes are written in **English**.
- If the user writes in another language, understand the request and reply in English.

## Imperative data-integrity rules

1. **Never claim a feature exists if it is not actually implemented and tested.**
2. **Never invent recipes, quantities, statistics, taxes, probabilities or AION 2 Global
   market data.** A missing value stays missing ("incomplete"), never zero.
3. Every data record keeps its provenance and status: `verified`, `community` or
   `user_provided`. Community data is usable by default and shown with its label.
4. Fields with unknown exact semantics (e.g. `units_sold`, `sold_avg_price`) may be
   stored with a `community`/`unknown` label and a note — never presented as confirmed
   sale prices.
5. Never present an old manual price as a current price: always show source and
   last-updated date.
6. Never defeat a site's technical protections (logins, bot walls, paywalls) and never
   touch account credentials or modify the game client. Public, keyless, read-only
   community APIs (e.g. aion2.exchange) are explicitly allowed, with an honest
   User-Agent, rate limits, caching and attribution recorded in
   `docs/DATA_SOURCES.md`. Passive local network capture of the user's own game
   session is also allowed (user-ordered 2026-11-11, SPEC 16.8): read-only
   observation of packets that already reach the user's machine (Npcap), never
   reading or writing game memory, never injecting into the client, never sending
   packets to game servers, never extracting credentials.
7. Never block development waiting for a complete catalogue: build with clearly
   fictional, isolated demo data, then import real data.
8. Inspect the repository and preserve existing work before major changes. Do not
   delete files that are not yours without checking.
9. Work in functional steps, run the tests and fix errors before declaring a step done.
10. If a piece of information is unknown, document the assumption or ask — do not turn
    it into a fact.

## Market-data rules (summary of SPEC section 16)

- Distinguish official public APIs, unofficial community sources and private/internal
  game endpoints. Only the first two may be integrated, after the investigation
  checklist in the spec.
- Integrate providers as independent adapters behind the `MarketDataProvider` interface;
  never couple the engine or UI to one website.
- Preserve provenance on every price: region, server, faction, price type
  (`lowest_listing`, `typical_listing`, `median_listing`, `sale_price`, `unknown`),
  source, observation and retrieval timestamps.
- Never mix regions, servers, factions or game versions; KR/TW data is never Global data.
- No credentials or API keys in source control.
- **AI assistants must never fetch aion2.exchange or any site whose robots.txt disallows
  AI agents.** The app's own provider calls are user-authorized; ask the user to save
  responses as fixtures instead.
- The client session capture provider (SPEC 16.8) is an allowed data source for the
  user's own inventory/storage quantities: opt-in, behind the same adapter/registry
  pattern, fixture-tested only, and it must degrade gracefully when unavailable.

## Workflow

1. **Read first, every session:** `docs/SPEC.md` (in full), `HANDOFF.md`,
   `docs/PROJECT_STATUS.md`, `docs/DATA_SOURCES.md`, `docs/TECHNICAL.md`, then inspect
   the actual repository state (`git log`, `git status`) instead of assuming previous
   sessions finished their work.
2. **Never test against the real database.** Use the isolated `.e2e` identifier
   (`com.aion2.craftprofitmanager.e2e`) — `npm run e2e` is safe and isolated.
3. **Required checks before declaring work done:**
   ```bash
   npx tsc --noEmit
   npx vitest run
   cd src-tauri && cargo test --lib && cargo clippy --all-targets
   ```
   Record the exact commands and their real results. Never claim tests passed that were
   not run.
4. **Branching and commits:** work on short-lived branches
   (`feat/…`, `fix/…`, `docs/…`, `chore/…`), use Conventional Commit messages
   (`feat(ui): …`, `fix(scanner): …`, `docs: …`). Keep commits small and reviewable.
5. **Spec protection:** never rewrite, shorten, reorder or silently modify
   `docs/SPEC.md`. Progress notes go in `HANDOFF.md` / `docs/PROJECT_STATUS.md`, not in
   the spec. Genuine spec changes are user-ordered and dated in the file itself.
6. **Architecture:** strict separation between UI, domain logic, data access and
   import/export; strict TypeScript; explicit error handling; no business logic in visual
   components; versioned SQLite migrations; money as integers in the smallest unit.
7. **New dependencies:** only with a reason; prefer none. Exception (user-ordered
   2026-11-11): the client-capture feature (SPEC 16.8) may add a packet-capture
   dependency (e.g. a Rust pcap/Npcap binding) — justify the choice in the PR and
   keep it optional at build/runtime.

## Session handoff

- Prepare a handoff when the session is likely to end, context is becoming limited,
  the user asks, or roughly every 30 user messages (do not count agent replies).
- Never stop mid-task to hit a counter: finish or safely pause first, leaving no
  half-written files.
- Update `HANDOFF.md` (and `docs/PROJECT_STATUS.md`) so a fresh session can continue
  without the previous conversation: current phase, what exists and where, tests run and
  results, known bugs and blockers, decisions and assumptions, next tasks in priority
  order, and the exact first action for the next session.
- The handoff must describe the real state of the repository, never an optimistic or
  invented summary.
