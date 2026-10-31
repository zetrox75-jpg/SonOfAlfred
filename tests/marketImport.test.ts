// FICTIONAL TEST DATA applied to the real migrations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "../src/services/csv";
import { INVENTORY_COLUMNS, parseInventoryCsv, parsePricesCsv, PRICE_COLUMNS, type MarketLookup } from "../src/domain/validation/market";
import { itemKey } from "../src/domain/validation/catalogue";
import { importPriceStatements } from "../src/services/planQueries";

const root = join(__dirname, "..");
let db: DatabaseSync;
const look = (): MarketLookup => ({
  items: new Map([[itemKey("T Ore", "GLOBAL"), 1], [itemKey("T Ore", "KR"), 2]]),
  markets: new Map([["eu-1 elyos", 1]]),
  sources: new Map([["Manual entry", "user"]]),
});
const HEAD = PRICE_COLUMNS.join(",");
const runCounts = (stmts: { sql: string; params: unknown[] }[]) => {
  db.exec("BEGIN");
  const n = stmts.map((s) => Number(db.prepare(s.sql).run(...(s.params as never[])).changes));
  db.exec("COMMIT");
  return n;
};

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(join(root, "src-tauri/migrations")).sort()) db.exec(readFileSync(join(root, "src-tauri/migrations", f), "utf8"));
  db.exec(`INSERT INTO items (id, name, normalized_name, game_region) VALUES (1, 'T Ore', 't ore', 'GLOBAL'), (2, 'T Ore', 't ore', 'KR');
           INSERT INTO markets (id, name, region, server, faction) VALUES (1, 'EU-1 Elyos', 'EU', '1', 'Elyos');`);
});

describe("price CSV", () => {
  it("templates match the importer columns", () => {
    expect(parseCsv(readFileSync(join(root, "data/templates/prices.csv"), "utf8")).headers).toEqual(PRICE_COLUMNS);
    expect(parseCsv(readFileSync(join(root, "data/templates/inventory.csv"), "utf8")).headers).toEqual(INVENTORY_COLUMNS);
  });

  it("matches item by name and region and market by name", () => {
    const csv = `${HEAD}\nT Ore,KR,eu-1 elyos,sale_price,15,2026-10-30,3,,My sheet,,\n`;
    expect(parsePricesCsv(parseCsv(csv), look())).toMatchObject({ errors: [], rows: [{ itemId: 2, marketId: 1, price_kind: "sale_price", quantity_observed: 3 }] });
  });

  it("reports unknown items, markets, kinds, missing dates and a manual source", () => {
    const csv = `${HEAD}\nT Gem,GLOBAL,EU-1 Elyos,lowest_listing,1,2026-10-30,,,S,,\n` +
      `T Ore,GLOBAL,NA-9,lowest_listing,1,2026-10-30,,,S,,\n` +
      `T Ore,GLOBAL,EU-1 Elyos,cheapest,1,,,,S,,\n` +
      `T Ore,GLOBAL,EU-1 Elyos,lowest_listing,1,2026-10-30,,,Manual entry,,\n`;
    const msgs = parsePricesCsv(parseCsv(csv), look()).errors.map((e) => `${e.line}: ${e.message.split(" (")[0].split(".")[0]}`);
    expect(msgs).toEqual([
      '2: Unknown item "T Gem" in region GLOBAL',
      '3: Unknown market "NA-9"',
      expect.stringMatching(/^4: price_kind/),
      expect.stringMatching(/^4: observed_at: is required/),
      '5: Source "Manual entry" exists with type "user"; CSV prices need a source of type "import"',
    ]);
  });

  it("imports once: a re-import of the same file adds nothing", () => {
    const csv = `${HEAD}\nT Ore,GLOBAL,EU-1 Elyos,lowest_listing,10,2026-10-30T10:00:00Z,,,Sheet A,,\nT Ore,GLOBAL,EU-1 Elyos,sale_price,9,2026-10-30T11:00:00Z,,,Sheet A,,\n`;
    const { rows } = parsePricesCsv(parseCsv(csv), look());
    const first = importPriceStatements(rows);
    expect(runCounts(first.statements).slice(first.firstRowStatement)).toEqual([1, 1]);
    const again = importPriceStatements(rows);
    expect(runCounts(again.statements).slice(again.firstRowStatement)).toEqual([0, 0]);
    expect(db.prepare("SELECT s.source_type, COUNT(*) AS n FROM market_prices mp JOIN data_sources s ON s.id = mp.source_id").get())
      .toMatchObject({ source_type: "import", n: 2 });
  });
});

describe("inventory CSV", () => {
  it("parses quantities and rejects unknown or repeated items", () => {
    const csv = "item_name,game_region,quantity\nT Ore,GLOBAL,40\nT Gem,GLOBAL,1\nt ore,global,3\nT Ore,KR,-1\n";
    const { rows, errors } = parseInventoryCsv(parseCsv(csv), look());
    expect(rows).toMatchObject([{ itemId: 1, quantity: 40 }]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
});
