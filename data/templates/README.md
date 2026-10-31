# CSV import templates

UTF-8, comma or semicolon separated (detected from the header line), one header
row. Column names are case-insensitive. Optional columns may be omitted. Values
are trimmed. Import **items before recipes**.

Every record needs a source (`source_name` + `source_type`). An existing source
keeps its stored type and URL.

## items.csv

One row per item. An item is identified by its name (case and spacing ignored)
**and** its region: `Ore` in `GLOBAL` and `Ore` in `KR` are two different items.
Re-importing an existing item updates it. The preview lists the changed fields.

| Column | Required | Values |
|--------|----------|--------|
| name | yes | text |
| game_region | yes | `GLOBAL`, `KR`, `TW`, `OTHER` |
| verification_status | yes | `verified`, `unverified`, `community`, `user_provided` |
| category | no | text, created if new |
| game_version | no | text, e.g. patch number |
| last_verified_at | no | `YYYY-MM-DD` or ISO 8601 |
| description | no | text |
| source_name | yes | text |
| source_type | yes | `official`, `community`, `user`, `import`, `demo` |
| source_url | no | URL |

## recipes.csv

**One row per ingredient.** Rows that share a `recipe_key` form one recipe, and
their recipe columns must be identical. Re-importing a `recipe_key` updates that
recipe and replaces its ingredient list. Several recipes may produce the same item.

| Column | Required | Values |
|--------|----------|--------|
| recipe_key | yes | your stable id, e.g. `global-iron-ingot-1` |
| output_item | yes | existing item name, same region |
| output_quantity | yes | whole number >= 1 (yield per craft) |
| game_region | yes | as above; all items must be in this region |
| verification_status | yes | as above |
| profession | no | text, created if new |
| required_level | no | whole number >= 0 |
| craft_fee | no | whole number >= 0 in the smallest currency unit. **Empty = unknown**, which makes cost calculations incomplete. Write `0` for no fee. |
| game_version | no | text |
| last_verified_at | no | `YYYY-MM-DD` or ISO 8601 |
| notes | no | text |
| source_name, source_type, source_url | as items | |
| ingredient_item | yes | existing item name, same region, not the output item |
| ingredient_quantity | yes | whole number >= 1 per craft |

## demo/

`demo_items.csv` and `demo_recipes.csv` are **fictional** (names start with
`DEMO`, region `OTHER`, source type `demo`). They exist only to try the
importer and must never be presented as AION 2 data.

## prices.csv

One row per observation. Appended to history; an exact duplicate (same item, market, kind,
source, time and price) is skipped. CSV prices rank after automatic and manual prices.

| Column | Required | Values |
|--------|----------|--------|
| item_name, game_region | yes | existing item |
| market | yes | existing market name (Settings) |
| price_kind | yes | `lowest_listing`, `typical_listing`, `median_listing`, `sale_price` (completed sale only), `estimate`, `unknown` |
| unit_price | yes | whole number >= 0, smallest currency unit |
| observed_at | yes | `YYYY-MM-DD` or ISO 8601 |
| quantity_observed | no | whole number |
| currency | no | text |
| source_name | yes | new or existing source of type `import` |
| source_url, comment | no | text |

## inventory.csv

| Column | Required | Values |
|--------|----------|--------|
| item_name, game_region | yes | existing item |
| quantity | yes | whole number >= 0 (0 removes it) |

Items not in the file keep their quantity.
