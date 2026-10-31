# aion2.exchange fixtures

Original API responses, unmodified. Used only by automated tests: tests must never
call the live API.

**Retrieved:** 2026-10-31, between 03:55 and 04:08 local time (UTC+1), by the user in a
web browser. The AI assistant did not fetch them: the site's robots.txt disallows AI
agents (`Claude-User`, `ClaudeBot` and others) while allowing `User-agent: *`.

| File | Request | Checked |
|------|---------|---------|
| `openapi.json` | `GET /api/openapi.json` | Valid JSON. "Aion2Market API" 0.1.0, "Read-only market data". No license, contact or terms of service. |
| `servers.json` | `GET /api/servers` | Valid JSON. 106 servers (`server_id`, `name`, `region` NAE/NAW/EU/LA/AS, `faction` Elyos/Asmodian, `has_data`); `default: 11304`. |
| `items.json` | `GET /api/items?sort=name&order=asc&window=24h&...` | Valid JSON. 50 of 957 items (`limit: 50`). **Server not recorded in the response.** Presumed the default server 11304 (see below), unconfirmed. |
| `item-prices.json` | `GET /api/items/516530001/prices?server=11304&range=7d` | Valid JSON, matches the `PriceSeries` schema: item 516530001 "Amplify Stone (Unique)", 168 hourly points from 2026-10-24T03:00Z to 2026-10-31T02:00Z, every point has all required `PricePoint` fields. |

Consistency: the last price point (89000 at 02:00Z) equals the `price` captured for the same
item in `items.json` at 02:07Z, which supports (does not prove) that `items.json` is server 11304.

## What the values mean (from the OpenAPI descriptions)

- `/api/items` `price` and `/prices` points (`low`, `high`, `avg`, `close`) are the **cheapest
  active listing** over time ("cheapest unit price and listing count over time") → price kind
  `lowest_listing`. `avg` is the average of the cheapest price within a bucket, not a typical
  listing.
- `units_sold`, `sold_avg_price`, `sold_min_price`, `sold_max_price` (`stats_registered`) have no
  description in the schema. They may be completed-sale statistics; until confirmed they must not
  be stored as `sale_price`.
