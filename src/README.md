# `src/` — Frontend (React + TypeScript)

The web layer of the Tauri app, built with Vite. Business logic lives in pure,
UI-independent modules so it can be tested without rendering components.

## Layout

```text
src/
├── app/            # App shell: navigation, workspace provider, upgrade banner
├── components/     # Shared UI components (item card, generic UI kit)
├── data/           # Static JSON: item icons, French item names
├── domain/         # Pure business logic — no React imports
│   ├── models/         # Domain models and reliability rules
│   ├── calculations/    # Craft plan, profit maths, scanner
│   └── validation/     # Catalogue and market validation
├── features/       # One folder per screen (see App.tsx for the routing)
│   ├── catalogue/      ├── crafting/       ├── dashboard/
│   ├── import-export/  ├── market/         ├── scanner/
│   └── settings/
├── i18n.ts + i18n/ # French UI strings (fr.json)
├── services/       # Data access and side-effectful code
│   ├── market/         # MarketDataProvider interface, aion2.exchange adapter, refresh
│   └── …               # db, catalogue, plans, CSV, community recipes, backup
├── styles/         # Global CSS (Tailwind entry)
├── main.tsx        # Entry point: startup gate + error boundary
└── vite-env.d.ts
```

## Conventions

- **Strict TypeScript**; no business logic inside visual components — put it in
  `domain/` or `services/`.
- `domain/` modules stay pure and synchronous where possible; they carry the unit tests
  for all calculations (`tests/*.test.ts`).
- Network access exists **only** in `services/market/refresh.ts` (aion2.exchange,
  user-triggered, rate-limited). Never add other network calls without following the
  provider rules in `AGENTS.md` and `docs/SPEC.md` section 16.
- Errors are handled explicitly; a failed provider must never crash the app or block
  local calculations.

See [`../src-tauri/README.md`](../src-tauri/README.md) for the Rust side and
[`../tests/README.md`](../tests/README.md) for the test suites.
