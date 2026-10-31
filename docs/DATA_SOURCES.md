# Data sources

Last checked: **2026-10-31**.

**The application ships with no AION 2 recipe, item or price data.** Every
record must come from an import or manual entry with a source, a verification
status (`verified`, `unverified`, `community`, `user_provided`) and a game
region (`GLOBAL`, `KR`, `TW`, `OTHER`). Only `verified` + `GLOBAL` data is
treated as reliable (`isReliable` in `src/domain/models`).

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
| aion2.exchange (Aion2Market) JSON API | **adapter built, disabled by default** | Checked 2026-10-31: operator-published Swagger UI at `/api/docs`; robots.txt allows `User-agent: *` (`Content-Signal: search=yes, ai-train=no, use=reference`) but disallows AI agents, so the assistant never fetched it; no terms page found (404). **Permission for this app is unconfirmed**: the user must review the operator's conditions and enable it explicitly. Prices are cheapest active listings per Global server (`lowest_listing`). Fixtures saved by the user: `tests/fixtures/aion2exchange/`. Rate limits are not documented; the app makes at most one request per endpoint per hour (API cache). |
| aion2.market, a2-tracker.com | reference only | No documented public API. |
| aion2craft.com Supabase table | not used | Korean coverage, community-typed data: not Global. |
| dimkk/aion2-market-stack | not used | Reads the game client's market traffic: excluded by README 16.7. |

Prices today are typed by the user per market (source `Manual entry`) or
imported from CSV (a source of type `import`), stored as append-only
observations with their kind (listing, sale, estimate...). Any future provider writes into the
same store with its own source, so the calculator does not change.

## Rules

- KR/TW data may be imported, but is stored with its own region and never
  counted as Global data. A Global recipe can only reference Global items.
- No scraping without documented permission.
- Missing recipes are reported, never invented.
- The demo CSV files in `data/templates/demo/` are fictional, use region
  `OTHER` and source type `demo`, and are never reliable data.
