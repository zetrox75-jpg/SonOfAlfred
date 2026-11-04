<!-- Thank you — please fill in every section. PRs without the checklist ticked will be asked to complete it. -->

## What

<!-- What does this PR change and why? Link the issue it closes (Closes #N) if any. -->

## How

<!-- Key design points, files touched, and anything the reviewer should look at closely. -->

## Data integrity

- [ ] No invented recipes, quantities, prices, taxes or market data — missing values stay "incomplete", never zero.
- [ ] Provenance preserved (`verified` / `community` / `user_provided`), sources and timestamps recorded in `docs/DATA_SOURCES.md` when a new source is used.
- [ ] No private/internal game endpoints, logins, bot walls or credentials involved.
- [ ] No secrets, API keys or tokens added to the code.

## Checks run

<!-- Paste the actual commands and their results. Do not tick boxes you have not run. -->

- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run`
- [ ] `cd src-tauri && cargo test --lib`
- [ ] `cd src-tauri && cargo clippy --all-targets`
- [ ] Tests added or updated for changed domain/service logic (fixtures saved locally, no live-network tests).

## Spec compliance

- [ ] `docs/SPEC.md` was not rewritten, shortened or reordered (progress notes belong in `HANDOFF.md` / `docs/PROJECT_STATUS.md`).
- [ ] No feature claimed as done if its validation criterion is not satisfied.
