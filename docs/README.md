# `docs/` — Project documentation

All documentation is written in English (project rule). Progress and handoff notes live
here and in the root `HANDOFF.md`, never inside the spec.

| File | Purpose |
|------|---------|
| [`SPEC.md`](SPEC.md) | **Authoritative product specification.** Never rewrite, shorten or reorder it; the user orders dated changes explicitly. |
| [`INSTALL.md`](INSTALL.md) | Installation (NSIS/MSI), data locations, backup/restore, troubleshooting, clean-install test procedure |
| [`USER_GUIDE.md`](USER_GUIDE.md) | End-user guide for every screen |
| [`TECHNICAL.md`](TECHNICAL.md) | Architecture, data model, calculation rules |
| [`DATA_SOURCES.md`](DATA_SOURCES.md) | Every external data source: what is known and unknown about its terms, authorization status |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md) | Per-step progress evidence and session log (changelog) |
| [`MANUAL_TESTS.md`](MANUAL_TESTS.md) | Manual test procedures and results |

## Rules

- The spec is the reference for every feature decision; the session handoff is
  [`../HANDOFF.md`](../HANDOFF.md).
- Do not create duplicate status files — extend `PROJECT_STATUS.md` instead.
- New data sources must be recorded in `DATA_SOURCES.md` with date checked, links and
  what is unknown about their terms.
- Work rules for AI agents: [`../AGENTS.md`](../AGENTS.md).
