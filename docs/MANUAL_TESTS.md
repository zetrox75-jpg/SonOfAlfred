# Manual tests

These tests are run **by a human**, never by an AI assistant or an automation tool.

## MT-1: Market "Refresh prices" with the aion2.exchange provider

The automated test (`tests/marketRefresh.test.tsx`) covers the same flow with a mock provider and
fictional data. This manual test checks the real provider end to end.

**Why manual:** aion2.exchange's robots.txt blocks AI agents (`Claude-User`, `ClaudeBot`), and
README rule 6 forbids getting around a site's rules. The user authorized the app's own calls on
2026-10-31 (see `docs/DATA_SOURCES.md`), but only the human operator may press the buttons
that contact it. No script may click "Refresh prices", open aion2.exchange, or fake a browser
user agent.

### Preconditions

- The operator is a human using their own Windows session.
- The app is built from the current source (`npm run tauri build`) or started with `npm run tauri dev`.
- Some **GLOBAL** catalogue items exist whose names match the provider's names exactly
  (for example, import `data/live-test/aion2exchange_global_items.csv`).
- The operator has read the provider notice in Settings (enabled by default, user-authorized 2026-10-31).
- A backup was taken first (Settings > Backup and restore > Back up now…).

### Steps

1. Start the app (`src-tauri\target\release\aion2-craft-profit-manager.exe` or `npm run tauri dev`).
2. Settings (Alt+0) > "Automatic prices: aion2.exchange": tick the acknowledgement > **Enable**.
3. Market / Prices (Alt+6) > **Load server list**.
4. In "Choose a server..." pick the region · server · faction to test > **Create market**.
5. Select that market in the **Market** dropdown at the top of the page.
6. Click **Refresh prices** once.
7. Read the green (success) or red (error) line under the button and copy it.
8. Settings > **Back up now…** and save the file (for step "Read the results").

### What to verify

| # | Check | Expected |
|---|-------|----------|
| 1 | Result line | Green: `<market>: N catalogue item(s) priced from aion2.exchange. …` (N may be 0 if no name matches). Red: a clear reason (timeout, HTTP 429, unexpected response…); nothing stored |
| 2 | Source name | Each refreshed price shows `lowest active listing · aion2.exchange · <age>` |
| 3 | Observation time | Hovering the small text shows `Observed <date time> · retrieved <date time>` |
| 4 | Freshness | Prices older than the freshness limit (Settings, default 24 h) show `stale ·`; fresh ones do not |
| 5 | Missing prices | Items without a price on this server show `-`, never 0 or another server's value |
| 6 | No cross-server fallback | Select another market (other server or faction): the refreshed prices do **not** appear there |
| 7 | Rate limit | The button is disabled for one hour after the refresh ("cached; next refresh after …") |
| 8 | Kind | Prices appear only in the "Lowest active listing" column, never in "Completed sale" |
| 9 | Optional: "Also add listed items missing from my catalogue" ticked | Result line says `N new item(s) added to your catalogue (community, not verified)`; the items appear with a COMMUNITY status and a price; typing in Search items suggests their names. Runs only on the next allowed refresh (1 h limit) |

### Read the results (optional, read-only)

The Claude desktop app runs its tools in a separate, virtualized `%APPDATA%`, so an assistant
cannot see the operator's live database. Give it the backup from step 8 instead, or run:

```bash
node tests/manual/read-market-results.mjs "%APPDATA%\com.aion2.craftprofitmanager\backups\<file>.db"
```

It opens the backup read-only, makes no network request, and prints the provider status and every
stored price per market with source, observation and retrieval time.

### Undo

Settings > aion2.exchange > **Disable**, then Settings > **Restore from backup…** with the backup
taken before the test.

### Results

| Date | Provider | Region | Server | Faction | Outcome (result line) | Checks 1-8 | Notes |
|------|----------|--------|--------|---------|-----------------------|------------|-------|
| 2026-10-31 | aion2.exchange | EU | Kromede | Asmodian | Before fix `8e2d3db`: refresh attempted, **0 prices stored**, error message lost | not done | Likely cause fixed (nullable item name) |
| 2026-10-31 | aion2.exchange | EU | Kromede | Asmodian | `9 catalogue item(s) priced from aion2.exchange. 494 listed item(s) not in your catalogue, 353 skipped (not listed or no price).` | 1-3, 5-8 passed; 4 not testable (all prices 27 min old, none stale) | `npm run tauri dev` at `7ddc064`; 9 of 10 test items priced, Artisan's Inina Pasta missing (`-`). Checks 2-8 read by the assistant over CDP (read-only, no provider button pressed) |
| 2026-10-31 | aion2.exchange | NAE | Israphel | Asmodian | `607 catalogue item(s) priced from aion2.exchange. 598 new item(s) added to your catalogue (community, not verified), 354 skipped (not listed or no price).` | 9 passed | Refresh pressed by the operator at 07:37:52 with the opt-in ticked (confirmed). 608 community items; Siel 0 prices, Kromede still only its 9 |
| | | | | | | | |
