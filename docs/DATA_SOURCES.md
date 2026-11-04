# Data sources

Last checked: **2026-10-31**.

**The application ships with no AION 2 recipe, item or price data.** Every
record must come from an import or manual entry with a source, a verification
status (`verified`, `unverified`, `community`, `user_provided`) and a game
region (`GLOBAL`, `KR`, `TW`, `OTHER`). `GLOBAL` data with status `verified` or
`community` is treated as reliable by default (`isReliable` in `src/domain/models`, README
rule 3 relaxed 2026-10-31); the "Verified Global recipes only" filter on the Calculator and
the Profit Scanner excludes community recipes from one analysis. The status label stays
visible everywhere. KR/TW data is never reliable for Global.

## Recipe data: research result

No official NCSOFT recipe API or dataset was found. Community sites publish
recipe data, but **none documents an API, a data export, or a permission to
reuse its data**. They are therefore user references only: the app does not
fetch or scrape them. A user may copy recipes they checked into the CSV
template and record the site as the source (`source_type = community`).

| Source | URL | Region claimed | Data date shown | API / export | Reuse terms |
|--------|-----|----------------|-----------------|--------------|-------------|
| AION 2 Run | https://aion2.run/en/artisanat | "global client", 484 recipes, 247 materials | 2026-10-05 | none found | none stated ("unofficial fan guide") |
| Shugo.gg | https://shugo.gg/crafting | not stated | 2026-10-28 | none found | none stated |
| Daeva Forge | https://daevaforge.com/ | "AION 2 (Global)" calculator; recipe data credited to AION2 Hub | not stated | none found | none stated ("unofficial fan site") |
| AION2 Hub | https://aion2hub.com/tools/crafting-calculator | not checked | not checked | not checked | not checked |
| aion2.app (was aion2t.com) | https://aion2.app/db/crafting | claims 820 recipes "from the game client" (region not checked) | not checked | not checked | not checked |
| AION 2 Gaming Tools | https://aion2.gaming.tools/crafting-calculator | not checked (HTTP 403 to automated fetch) | - | - | - |
| wikily.gg | https://wikily.gg/aion-2/crafting/cooking | not checked | - | - | - |
| Fextralife wiki | https://aion2.wiki.fextralife.com/Crafting_Materials | materials only | - | - | - |

Recipe counts differ between sites (137 to 820), so sites disagree on scope or
version. Cross-check before marking anything `verified`.

## Market data

See README section 16.1 and `APIs prix Market AION 2 Global.md` (user research,
2026-10-31). Summary: no official NCSOFT market API; private game endpoints and
client-traffic collectors must not be used.

| Source | Status in the app | Why |
|--------|-------------------|-----|
| aion2.exchange (Aion2Market) JSON API | **default market provider, enabled by default** (user-authorized 2026-10-31, README rule 6 relaxed) | See "aion2.exchange: known and unknown" below. |
| aion2.market, a2-tracker.com | reference only | No documented public API. |
| aion2craft.com Supabase table | not used | Korean coverage, community-typed data: not Global. |
| dimkk/aion2-market-stack | not used | Reads the game client's market traffic: excluded by README 16.7. |

### aion2.exchange: known and unknown (checked 2026-10-31)

Known:
- Operator-published Swagger UI at `/api/docs` ("Aion2Market API" 0.1.0, "Read-only market
  data"). Public, keyless, read-only JSON.
- robots.txt allows `User-agent: *` with `Content-Signal: search=yes, ai-train=no,
  use=reference`, and disallows AI agents. An AI assistant therefore never fetches the site; only
  the desktop app calls the API, on the user's button press.
- Responses are cached by Cloudflare for an hour (`max-age=3600`). The app asks at most once per
  hour per server (or per item history) and sends `limit=1000` without pagination.
- The app identifies itself as `AION2-Craft-Profit-Manager/0.1.0 (desktop app; user-initiated
  refresh)`. Every price shows the source "aion2.exchange" and its observation time.
- `price` (and `/prices` points) are the cheapest active listing per Global server: stored as
  `lowest_listing`, never as a sale.
- `units_sold`, `sold_avg_price` and `stats_registered` are kept in each observation's raw
  snapshot under `community_unconfirmed`, with a note. They are never used or shown as a sale
  price.

- `/api/crafts/model?server={id}` lists, per Splendent profile, the steps with materials per
  attempt and the expected number of attempts (the operator's model, sourced from game files
  AION2 5.3.2.0). "Import Splendent crafts" turns it into one Global `community` recipe per
  target: quantity = per attempt x expected attempts summed over steps, **rounded up** to whole
  units (recipe note: "expected quantities from the aion2.exchange model, rounded up"). The craft
  fee is not in the model and stays unknown (empty). Morph/conversion routes are not imported.

Not known:
- How the crafts model derives expected attempts (success rate and combo probability are given,
  the formula is not documented); whether NPC craft fees apply.
- No terms of use or terms page (404). What `use=reference` allows is not defined.
- No documented rate limit.
- The meaning of the `sold_*` fields (no description in the API schema).
- How long the API stays available, or whether it changes without notice (the app rejects an
  unexpected response and stores nothing).

The user authorized its use on 2026-10-31 as a public, keyless, read-only API. Unknown terms are
recorded here and do not block its use (README 16.2, relaxed).

Prices today are typed by the user per market (source `Manual entry`) or
imported from CSV (a source of type `import`), stored as append-only
observations with their kind (listing, sale, estimate...). Any future provider writes into the
same store with its own source, so the calculator does not change.

## Profession recipes: gamers4.life crafting graph

Authorized by the user on 2026-10-31 as community data. The app does not fetch it: the user saves
`https://gamers4.life/aion-2/database/crafting-graph.json` and imports the file (Import / Export >
"Import crafting graph"). Source row: `gamers4.life crafting graph`, `community`, authorized.

Known: 2,442 recipes (blacksmithing, jewelcrafting, tailoring, alchemy, cooking), one set per race,
whole-number quantities, output count, fee in Kinah, mastery level; item keys identical to
aion2.exchange, so refreshed prices match by name.

How it is mapped:
- Only the chosen race is imported (Asmodian = `dark`, Elyos = `light`), as Global `community`
  recipes, key `gamers4.life:<recipe id>`, fee and mastery as given.
- Recipes without inputs are skipped and counted.
- "Kina (All)" listed as an input is added to the fee (it is the currency, not an item).
- Same-name variants (different item keys, same name) become one catalogue item with alternative
  recipes, because the market and the catalogue identify items by name. The calculator picks the
  cheapest recipe it can price.
- Ignored: the combo chance and combo item (profit uses the normal result), the third input field.

Not known: the region (not stated; English names match aion2.exchange Global items), the game
version, licence or terms, how the data is collected, whether a fee of 0 means "no fee".

**Item icons and French item names** (2026-10-31): `npm run item-data`
(`scripts/fetch-item-data.mjs`) reads gamers4.life's item list page in English and in French
(robots.txt allows all agents; `/aion-2/` is not disallowed). The page embeds every item with its
game id, name, icon path and Global flag; Taiwan-only items are skipped. Output:
- `src/data/itemNamesFr.json` (committed): normalized English name -> French name (8,051).
- `src/data/itemIcons.json` (committed): normalized English name -> icon file (6,385 items).
Icons are game art and are **never bundled or published**. The app loads each one when shown from
`https://gamers4.life/aion-2/database/icons/assets/Game/UI/Resource/Texture/Item/<file>.webp`
(CSP `img-src` adds only that host); the webview's HTTP cache keeps it (`max-age=604800`, 7 days).
Offline, an uncached icon shows a letter tile. 116 listed icon files do not exist on the site.
English names stay the key for prices, recipes and icons; French is display and search only.

## Rules

- KR/TW data may be imported, but is stored with its own region and never
  counted as Global data. A Global recipe can only reference Global items.
- No scraping without documented permission.
- Missing recipes are reported, never invented.
- The demo CSV files in `data/templates/demo/` are fictional, use region
  `OTHER` and source type `demo`, and are never reliable data.
