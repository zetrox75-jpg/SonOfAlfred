// Applies every SQL migration to an in-memory SQLite (Node built-in) and checks the
// constraints the business rules depend on.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

const dir = join(__dirname, "../src-tauri/migrations");
let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON"); // sqlx enables this by default in the app
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
});

const item = (name: string, region = "GLOBAL") =>
  db.prepare("INSERT INTO items (name, normalized_name, game_region) VALUES (?, ?, ?)").run(name, name.toLowerCase(), region)
    .lastInsertRowid;

describe("schema", () => {
  it("creates every table", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(["categories", "data_sources", "inventory", "items", "market_prices", "markets", "professions",
        "recipe_ingredients", "recipes", "settings"]),
    );
  });

  it("rejects unknown status, region and price type", () => {
    expect(() => db.prepare("INSERT INTO items (name, normalized_name, game_region, verification_status) VALUES ('a','a','GLOBAL','confirmed')").run()).toThrow();
    expect(() => item("b", "EU")).toThrow();
    const id = item("c");
    db.exec("INSERT INTO markets (id, name) VALUES (1, 'M'); INSERT INTO data_sources (id, name, source_type) VALUES (1, 'S', 'user')");
    const price = db.prepare("INSERT INTO market_prices (item_id, market_id, source_id, price_kind, unit_price, observed_at) VALUES (?, ?, 1, ?, ?, '2026-01-01T00:00:00Z')");
    expect(() => price.run(id, 1, "sell", 1)).toThrow(); // not a known price kind
    expect(() => price.run(id, null, "sale_price", 1)).toThrow(); // every price belongs to a market
    expect(() => price.run(id, 1, "sale_price", -1)).toThrow();
    price.run(id, 1, "sale_price", 5);
    expect(() => price.run(id, 1, "sale_price", 5)).toThrow(); // exact duplicate observation
  });

  it("allows the same name in different regions but not twice in one", () => {
    item("Ore", "GLOBAL");
    item("Ore", "KR");
    expect(() => item("Ore", "GLOBAL")).toThrow();
  });

  it("allows several recipes for the same output item", () => {
    const out = item("Ingot");
    const ins = db.prepare("INSERT INTO recipes (output_item_id, output_quantity, game_region) VALUES (?, 1, 'GLOBAL')");
    ins.run(out);
    ins.run(out);
    expect(db.prepare("SELECT COUNT(*) AS n FROM recipes").get()!.n).toBe(2);
  });

  it("refuses to delete an item still used by a recipe", () => {
    const out = item("Ingot");
    const ore = item("Ore");
    const r = db.prepare("INSERT INTO recipes (output_item_id, output_quantity, game_region) VALUES (?, 1, 'GLOBAL')").run(out).lastInsertRowid;
    db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity) VALUES (?, ?, 2)").run(r, ore);
    expect(() => db.prepare("DELETE FROM items WHERE id = ?").run(ore)).toThrow();
  });

  it("rejects zero output quantity", () => {
    const out = item("Ingot");
    expect(() => db.prepare("INSERT INTO recipes (output_item_id, output_quantity, game_region) VALUES (?, 0, 'GLOBAL')").run(out)).toThrow();
  });
});

describe("migration 0004 (price model)", () => {
  it("keeps step 3 prices and maps their old types honestly", () => {
    const old = new DatabaseSync(":memory:");
    old.exec("PRAGMA foreign_keys = ON");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const v4 = files.indexOf("0004_price_model.sql");
    for (const f of files.slice(0, v4)) old.exec(readFileSync(join(dir, f), "utf8"));
    old.exec(`INSERT INTO items (id, name, normalized_name, game_region) VALUES (1, 'A', 'a', 'GLOBAL');
      INSERT INTO markets (id, name) VALUES (1, 'M');
      INSERT INTO data_sources (id, name, source_type) VALUES (1, 'Manual entry', 'user');
      INSERT INTO market_prices (item_id, market_id, price_type, unit_price, source_id, observed_at) VALUES
        (1, 1, 'buy', 10, 1, '2026-10-31T01:00:00Z'), (1, 1, 'sell_estimated', 20, 1, '2026-10-31T02:00:00Z')`);
    for (const f of files.slice(v4)) old.exec(readFileSync(join(dir, f), "utf8"));
    expect(old.prepare("SELECT price_kind, unit_price, market_id FROM market_prices ORDER BY id").all().map((r) => ({ ...r })))
      .toEqual([{ price_kind: "unknown", unit_price: 10, market_id: 1 }, { price_kind: "estimate", unit_price: 20, market_id: 1 }]);
  });
});
