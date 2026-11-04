# `data/` — CSV templates and live-test data

No game data ships with the application. This folder holds import templates and
recorded test data only — never invented game records.

## Layout

```text
data/
├── templates/    # Documented CSV templates for user imports
│   ├── README.md # Column-by-column documentation (read this first)
│   ├── items.csv, recipes.csv, prices.csv, inventory.csv
│   └── demo/     # Clearly fictional demo data (region OTHER, labelled DEMO)
└── live-test/    # Saved real responses used for live tests (user-recorded)
```

## Rules

- `templates/README.md` documents every column; imports are UTF-8, comma or semicolon
  separated, with a single header row. **Import items before recipes.**
- Every record needs a source (`source_name` + `source_type`); provenance and
  verification status (`verified` / `community` / `user_provided`) are mandatory.
- Demo data is fictional and clearly labelled — it must never be mixed into real
  catalogues.
- `live-test/` files are user-saved responses from authorized sources (e.g. the
  aion2.exchange global items export) used for manual verification; they are data
  snapshots, not fixtures for automated tests (those live in `tests/fixtures/`).
