// FICTIONAL TEST DATA, applied to the real migrations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { Statement } from "../src/services/catalogueStatements";
import {
  addManualPrice,
  addMarket,
  INVENTORY_SQL,
  LATEST_PRICES_SQL,
  PLAN_RECIPES_SQL,
  saveSettings,
  setInventory,
  logCraft,
  recordSale,
  deleteCraftLog,
  CRAFT_LOG_SQL,
  type CraftLogRow,
  SETTINGS_SQL,
  toPlanRecipe,
  resolvePrices,
  toSettings,
  type PriceRow,
  HISTORY_SQL,
  historySummary,
  type HistoryRow,
} from "../src/services/planQueries";

let db: DatabaseSync;
const run = (stmts: Statement[]) => {
  for (const s of stmts) db.prepare(s.sql).run(...s.params);
};
const all = <T>(sql: string, ...params: (string | number)[]) => db.prepare(sql).all(...params) as unknown as T[];

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = join(__dirname, "../src-tauri/migrations");
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  db.exec(`INSERT INTO items (id, name, normalized_name, game_region, verification_status) VALUES
    (1, 'T Ore', 't ore', 'GLOBAL', 'verified'), (2, 'T Ingot', 't ingot', 'GLOBAL', 'verified')`);
  run(addMarket({ name: "Test EU", region: "EU", server: "S1", faction: "Elyos" }));
  run(addMarket({ name: "Test NA", region: "NA", server: "", faction: "" }));
});

describe("prices", () => {
  it("appends observations and reads the latest per market, kind and source only", () => {
    run(addManualPrice(1, 1, "lowest_listing", 10));
    run(addManualPrice(1, 1, "lowest_listing", 12));
    run(addManualPrice(1, 2, "lowest_listing", 99)); // other market: must not leak
    run(addManualPrice(2, 1, "estimate", 50, { quantity: 3, comment: "guess" }));
    expect(db.prepare("SELECT COUNT(*) AS n FROM market_prices").get()!.n).toBe(4);
    const rows = all<PriceRow>(LATEST_PRICES_SQL, 1);
    expect(rows.map((r) => [r.item_id, r.price_kind, r.unit_price, r.source, r.source_type])).toEqual(
      expect.arrayContaining([[1, "lowest_listing", 12, "Manual entry", "user"], [2, "estimate", 50, "Manual entry", "user"]]),
    );
    expect(rows).toHaveLength(2);
  });

  const now = new Date("2026-10-31T12:00:00Z");
  const row = (o: Partial<PriceRow>): PriceRow => ({
    item_id: 1, price_kind: "lowest_listing", unit_price: 10, observed_at: "2026-10-31T11:00:00Z",
    quantity_observed: null, is_override: 0, source: "x", source_type: "user", ...o,
  });
  const resolve = (rows: PriceRow[], buy = "lowest_listing" as const) =>
    resolvePrices(rows, { buy, sell: "sale_price" }, now, 24);

  it("never substitutes another price kind", () => {
    const book = resolve([row({ price_kind: "typical_listing" }), row({ item_id: 2, price_kind: "sale_price", unit_price: 70 })]);
    expect(book.buy.get(1)).toBeUndefined();
    expect(book.sell.get(2)).toMatchObject({ unitPrice: 70, kind: "sale_price" });
    expect(book.sell.get(1)).toBeUndefined();
  });

  it("falls back provider > manual > import, preferring fresh data", () => {
    const provider = row({ unit_price: 1, source: "P", source_type: "community" });
    const manual = row({ unit_price: 2, source: "M", source_type: "user" });
    const imported = row({ unit_price: 3, source: "I", source_type: "import" });
    expect(resolve([imported, manual, provider]).buy.get(1)).toMatchObject({ unitPrice: 1, tier: "provider" });
    expect(resolve([imported, manual]).buy.get(1)).toMatchObject({ unitPrice: 2, tier: "manual" });
    expect(resolve([imported]).buy.get(1)).toMatchObject({ unitPrice: 3, tier: "import" });
    const staleProvider = { ...provider, observed_at: "2026-10-01T00:00:00Z" };
    expect(resolve([staleProvider, manual]).buy.get(1)).toMatchObject({ unitPrice: 2, stale: false });
    expect(resolve([staleProvider]).buy.get(1)).toMatchObject({ unitPrice: 1, stale: true });
  });

  it("a manual override wins over fresher provider data", () => {
    const provider = row({ unit_price: 1, source_type: "community" });
    const override = row({ unit_price: 9, is_override: 1, observed_at: "2026-10-01T00:00:00Z" });
    expect(resolve([provider, override]).buy.get(1)).toMatchObject({ unitPrice: 9, override: true, stale: true });
  });

  it("rejects negative or fractional prices and a missing market", () => {
    expect(() => addManualPrice(1, 1, "lowest_listing", -1)).toThrow(RangeError);
    expect(() => addManualPrice(1, 1, "lowest_listing", 1.5)).toThrow(RangeError);
    expect(() => run(addManualPrice(1, 999, "lowest_listing", 1))).toThrow();
  });
});

describe("inventory", () => {
  it("sets, updates and removes owned quantities", () => {
    run(setInventory(1, 5));
    run(setInventory(1, 8));
    expect(all<{ item_id: number; quantity: number }>(INVENTORY_SQL)).toMatchObject([{ item_id: 1, quantity: 8 }]);
    run(setInventory(1, 0));
    expect(all(INVENTORY_SQL)).toEqual([]);
    expect(() => setInventory(1, -2)).toThrow(RangeError);
  });
});

describe("settings", () => {
  it("defaults to unknown commission and saves values, including an explicit 0%", () => {
    expect(toSettings(all(SETTINGS_SQL))).toEqual({
      currencyLabel: "", commissionBps: null, commissionSource: "", freshnessHours: 24, activeMarketId: null,
      buyPriceKind: "lowest_listing", sellPriceKind: "lowest_listing",
    });
    run(saveSettings({ currencyLabel: " Kinah ", commissionBps: 0, commissionSource: "my test", freshnessHours: 6, activeMarketId: 2, sellPriceKind: "sale_price" }));
    expect(toSettings(all(SETTINGS_SQL))).toMatchObject({ currencyLabel: "Kinah", commissionBps: 0, commissionSource: "my test", freshnessHours: 6, activeMarketId: 2, sellPriceKind: "sale_price" });
    run(saveSettings({ commissionBps: null }));
    expect(toSettings(all(SETTINGS_SQL)).commissionBps).toBeNull();
  });
});

describe("recipes for the planner", () => {
  it("maps recipes with ingredient ids and the Global reliability rule", () => {
    db.exec(`INSERT INTO recipes (id, recipe_key, output_item_id, output_quantity, craft_fee, game_region, verification_status)
             VALUES (1, 'k1', 2, 2, 10, 'GLOBAL', 'verified'), (2, 'k2', 2, 1, NULL, 'GLOBAL', 'community');
             INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity) VALUES (1, 1, 3), (2, 1, 4);`);
    const recipes = all<Parameters<typeof toPlanRecipe>[0]>(PLAN_RECIPES_SQL).map(toPlanRecipe);
    expect(recipes).toEqual([
      { id: 1, key: "k1", outputItemId: 2, outputQuantity: 2, craftFee: 10, reliable: true, verified: true, ingredients: [{ itemId: 1, quantity: 3 }] },
      { id: 2, key: "k2", outputItemId: 2, outputQuantity: 1, craftFee: null, reliable: true, verified: false, ingredients: [{ itemId: 1, quantity: 4 }] },
    ]);
  });
});

describe("history", () => {
  it("lists every observation in order and reports period and gaps", () => {
    run(addManualPrice(1, 1, "lowest_listing", 10, { observedAt: "2026-10-28T00:00:00Z" }));
    run(addManualPrice(1, 1, "sale_price", 11, { observedAt: "2026-10-28T06:00:00Z" }));
    run(addManualPrice(1, 1, "lowest_listing", 12, { observedAt: "2026-10-31T06:00:00Z" }));
    run(addManualPrice(1, 2, "lowest_listing", 99, { observedAt: "2026-10-29T00:00:00Z" })); // other market
    const rows = all<HistoryRow>(HISTORY_SQL, 1, 1);
    expect(rows.map((r) => [r.price_kind, r.unit_price])).toEqual([["lowest_listing", 10], ["sale_price", 11], ["lowest_listing", 12]]);
    expect(historySummary(rows, 24)).toEqual({
      count: 3, from: "2026-10-28T00:00:00.000Z", to: "2026-10-31T06:00:00.000Z",
      gaps: [{ from: "2026-10-28T06:00:00.000Z", to: "2026-10-31T06:00:00.000Z", hours: 72 }],
    });
    expect(historySummary([], 24)).toEqual({ count: 0, from: null, to: null, gaps: [] });
  });
});

describe("craft log", () => {
  const entry = { itemId: 2, quantity: 4, marketId: 1, totalCost: 100, valuation: "cash" as const, estUnitPrice: 40, estProfit: 52 };

  it("logs a craft, keeps an incomplete cost as null, then records and replaces the real sale", () => {
    run(logCraft(entry));
    run(logCraft({ ...entry, totalCost: null, estUnitPrice: null, estProfit: null }));
    const rows = all<CraftLogRow>(CRAFT_LOG_SQL);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.total_cost === null)).toMatchObject({ est_unit_price: null, est_profit: null, sold_quantity: null });
    const id = rows.find((r) => r.total_cost === 100)!.id;
    run(recordSale(id, 4, 45, 500));
    run(recordSale(id, 3, 50, 500));
    expect(all<CraftLogRow>(CRAFT_LOG_SQL).find((r) => r.id === id)).toMatchObject({ sold_quantity: 3, sold_unit_price: 50, sold_commission_bps: 500 });
    run(deleteCraftLog(id));
    expect(all(CRAFT_LOG_SQL)).toHaveLength(1);
  });

  it("refuses impossible quantities and selling more than was crafted", () => {
    expect(() => logCraft({ ...entry, quantity: 0 })).toThrow(RangeError);
    expect(() => recordSale(1, 0, 10, 0)).toThrow(RangeError);
    expect(() => recordSale(1, 1, -1, 0)).toThrow(RangeError);
    run(logCraft(entry));
    const { id } = all<CraftLogRow>(CRAFT_LOG_SQL)[0];
    expect(() => run(recordSale(id, 5, 10, 0))).toThrow(); // CHECK sold_quantity <= quantity
  });

  it("follows its item when the item is deleted", () => {
    run(logCraft(entry));
    db.exec("DELETE FROM items WHERE id = 2");
    expect(all(CRAFT_LOG_SQL)).toEqual([]);
  });
});
