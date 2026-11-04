# User guide

AION 2 Craft Profit Manager helps you decide what to craft for profit in **AION 2 Global**. It
ships with **no game data**: you import recipes, items and prices yourself, with their source.
Installation, backups and troubleshooting: `docs/INSTALL.md`.

## First steps

1. **Settings**: create a market (region + server + faction), set the commission (and where the
   value comes from), the currency label and how many hours a price stays fresh.
2. **Import / Export**: import `items.csv`, then `recipes.csv` (templates and column reference in
   `data/templates/`). Every import shows a preview (create / update / unchanged, changed fields,
   errors) and writes nothing until you confirm; it is all-or-nothing.
3. **Market / Prices**: pick the active market, the buy and sell price methods, and enter prices
   (or import `prices.csv`).
4. **Craft calculator**: choose a target and quantity.
5. **Settings > Backup and restore > Back up now…** after a large import.

Keys: Alt+1 … Alt+9 open menu entries 1–9, Alt+0 opens Settings.

## Screens

| Screen | What it does |
|--------|--------------|
| Dashboard | Counts, profitable crafts and best 5, from reliable results only |
| Catalogue | Search and filter items and recipes; item sheet with source, region, verification, recipes and "used in"; add/edit items and recipes; archive recipes |
| Craft calculator | Full crafting chain: shopping list, cash cost vs economic cost, sale, commission, profit, margin, ROI, break-even price |
| Crafting tree | Expandable tree; per-component strategy (auto / buy / craft) and recipe choice; buy-vs-craft table |
| Profit scanner | Every craftable item through the same engine; filters and sorting; incomplete results listed apart, never ranked |
| Market / Prices | Latest price of each kind with source, age and stale flag; manual entry; provider panel |
| Inventory | Owned quantities, stock value, what the plan takes from stock (stock is never consumed automatically) |
| History | Price chart per price kind, gaps, full observation list |
| Import / Export | CSV import (items, recipes, prices, inventory), CSV and full JSON export |
| Settings | Calculation settings, markets, demo data cleanup, market provider, backup and restore, database diagnostics |

## How to read results

- **Incomplete**: a price, a fee (`craft_fee` empty means unknown, write 0 for none) or the
  commission is missing. Totals are not shown as zero; the missing items are listed.
- **Not reliable**: a price is older than the freshness limit, or a recipe is not Global with
  status verified or community. Community data counts as reliable by default and keeps its label;
  tick **Verified Global recipes only** (Calculator or Profit Scanner) to exclude it from that
  analysis. Only reliable results appear on the Dashboard.
- **Price kinds**: a listing is an asking price, not a completed sale. The calculator uses only
  the kind you selected; it never substitutes another kind. Order: your override, then fresh before
  stale, then provider > manual > import.
- **Regions**: KR/TW data can be imported but stays separate from Global.

## Market provider (aion2.exchange)

Enabled by default: you authorized this public, read-only community API on 2026-10-31. Disable it
in Settings at any time. Refreshes happen only when you press a button, at most once per hour
per request, and prices are stored as "lowest active listing", never as sales.

**Profession recipes**: save `https://gamers4.life/aion-2/database/crafting-graph.json` from your
browser, then Import / Export > **Import crafting graph**: pick the race of your market, choose the
file, check the summary, then **Write**. Recipes are Global `community` with the fee and
quantities of the file. The Profit scanner then ranks every recipe whose materials and result have
a price on the selected market.

**Language**: the EN | FR switch at the bottom of the menu changes the interface language; item
names are shown in French too when a translation exists (hover a name to see the English one).
Search boxes accept both languages.

Item icons appear next to item names (tables, crafting tree, search suggestions). They load from
gamers4.life when shown and are cached for about 7 days; offline, an uncached icon shows a letter
tile.

**Updates**: at start-up the app checks for a new version. Click **Update now** on the banner: it
downloads, verifies the signature, installs and restarts. Your data is kept.

**Import Splendent crafts** (Market page, aion2.exchange markets) adds one recipe per Artisan's
Splendent item for that server's race: Global, status `community`, quantities = the model's
expected materials rounded up to whole units, craft fee empty (unknown). Results stay
"incomplete" until you enter the craft fee (0 if there is none) in the recipe. Re-importing
updates the quantities and keeps the fee you entered. At most once per hour per server.

Tick **Also add listed items missing from my catalogue** before *Refresh prices* to build a full
price list for that server in one refresh: every listed item with a price is added as a Global item
with status `community` (name and category only, source and date recorded; never a recipe), then
priced. The Market page search box suggests item names as you type.

## Demo data

The files in `data/templates/demo/` are fictional (region OTHER, source type `demo`).
Settings > Demo / test data removes them and nothing else.
