# `scripts/` — Development scripts

## `e2e.mjs` (`npm run e2e`)

End-to-end check of the real Windows application (spec step 5). Builds a debug app
whose identifier is `com.aion2.craftprofitmanager.e2e` — so it uses **its own data
folder and never the real database** — then drives it over the Chrome DevTools
Protocol: every page renders, a write, a backup, persistence across two launches, and
a restore with automatic restart. The isolated test data folder is deleted at the start
and in `finally`.

## `fetch-item-data.mjs` (`npm run item-data`)

Fetches French item names and item icons from gamers4.life (public data, robots.txt
allows all agents). Icons are written to the git-ignored `public/icons/` folder —
they are game art and must never be committed or published. Run this script before
building on a new machine, or items show letter tiles.
