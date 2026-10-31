// Manual test helper, READ-ONLY. The human operator runs the app and clicks "Refresh prices";
// this script only reads a backup of the database afterwards. It makes no network request,
// starts nothing, clicks nothing, and opens the file read-only.
//
// Usage: node tests/manual/read-market-results.mjs "<path to a backup .db>"
import { DatabaseSync } from "node:sqlite";

const file = process.argv[2];
if (!file) throw new Error('usage: node tests/manual/read-market-results.mjs "<backup.db>"');
const db = new DatabaseSync(file, { readOnly: true });

for (const s of db.prepare("SELECT key, value FROM settings WHERE key LIKE 'provider.%' AND key NOT LIKE '%.servers'").all()) {
  const v = JSON.parse(s.value);
  console.log(`${s.key}: enabled=${v.enabled} lastSuccess=${v.lastSuccessAt} lastError=${v.lastError}\n  lastResult: ${v.lastResult}`);
}
for (const m of db.prepare("SELECT id, name, region, server, faction, provider_server FROM markets ORDER BY id").all()) {
  console.log(`\nMarket ${m.id}: ${m.name} | ${m.region} | ${m.server} | ${m.faction} | ${m.provider_server ?? "manual only"}`);
  const rows = db.prepare(`
    SELECT i.name, mp.price_kind, mp.unit_price, mp.quantity_observed, s.name AS source, s.is_authorized,
           mp.observed_at, mp.retrieved_at
    FROM market_prices mp JOIN items i ON i.id = mp.item_id JOIN data_sources s ON s.id = mp.source_id
    WHERE mp.market_id = ? ORDER BY i.name, mp.observed_at DESC`).all(m.id);
  if (!rows.length) console.log("  (no prices)");
  for (const r of rows) {
    console.log(`  ${r.name} | ${r.price_kind} | ${r.unit_price} x${r.quantity_observed ?? "?"} | ${r.source}${r.is_authorized ? "" : " (not authorized)"} | observed ${r.observed_at} | retrieved ${r.retrieved_at}`);
  }
}
