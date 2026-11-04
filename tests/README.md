# `tests/` — Test suites and fixtures

Vitest suites covering the domain calculations, services and market providers. All
provider tests run against **saved local fixtures** — never live websites.

## Layout

```text
tests/
├── *.test.ts(x)   # Suites: profit, craftPlan, scanner, catalogue, cleanup, craftingGraph,
│                  #         aion2exchange, marketImport, marketRefresh, migrations, i18n, …
├── fixtures/      # Saved, anonymized API responses
│   ├── aion2exchange/   # items, item-prices, crafts, crafts-model, openapi, servers
│   ├── gamers4life/    # crafting graph export
│   └── market/         # mock prices
├── mocks/        # mockMarketDataProvider
├── manual/       # Manual verification scripts (e.g. read market results from the .e2e DB)
└── fixtures READMEs document how each fixture was obtained
```

## Conventions

- Domain rules under test: missing price / unknown fee never becomes zero (results are
  "incomplete"); listing prices are never sale prices; KR/TW is never Global.
- Fixtures come from **user-saved responses** of authorized sources. AI agents must not
  fetch sites that disallow them (a.g. aion2.exchange) — ask the user to save the
  response instead.
- Run: `npx vitest run` (or `npm test`). Typecheck: `npx tsc --noEmit`.
- End-to-end check of the real Windows app: `npm run e2e` (isolated
  `com.aion2.craftprofitmanager.e2e` identifier — safe, own data folder).
- Manual test procedures: `docs/MANUAL_TESTS.md`.

See [`../scripts/README.md`](../scripts/README.md) for the e2e and item-data scripts.
