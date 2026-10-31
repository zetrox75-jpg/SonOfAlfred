// Demo cleanup must remove only demo records. FICTIONAL data on the real migrations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "../src/services/csv";
import { parseItemsCsv, parseRecipesCsv } from "../src/domain/validation/catalogue";
import { upsertItem, upsertRecipe, type Statement } from "../src/services/catalogueStatements";
import { addManualPrice, addMarket, setInventory } from "../src/services/planQueries";
import { planDemoCleanup } from "../src/services/cleanup";

const root = join(__dirname, "..");
let db: DatabaseSync;
const run = (stmts: Statement[]) => {
  db.exec("BEGIN");
  try {
    for (const s of stmts) db.prepare(s.sql).run(...s.params);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
};
const select = async <T,>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as never[])) as T[];
const names = (table: string) => db.prepare(`SELECT name FROM ${table} ORDER BY name`).all().map((r) => r.name);
const demo = (f: string) => readFileSync(join(root, "data/templates/demo", f), "utf8");
const userItem = (name: string) => upsertItem({
  name, game_region: "OTHER", verification_status: "user_provided", category: "DEMO Materials", game_version: null,
  last_verified_at: null, description: null, source_name: "Me", source_type: "user", source_url: null,
});

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(join(root, "src-tauri/migrations")).sort()) db.exec(readFileSync(join(root, "src-tauri/migrations", f), "utf8"));
  run(parseItemsCsv(parseCsv(demo("demo_items.csv"))).inputs.flatMap(upsertItem));
  run(parseRecipesCsv(parseCsv(demo("demo_recipes.csv"))).inputs.flatMap(upsertRecipe));
  run(addMarket({ name: "M", region: "", server: "", faction: "" }));
  run(addManualPrice(1, 1, "lowest_listing", 10)); // DEMO Ore
  run(setInventory(1, 5));
});

describe("demo cleanup", () => {
  it("removes all demo records and what only they used", async () => {
    const plan = await planDemoCleanup(select);
    expect(plan).toMatchObject({ recipes: 2, prices: 1, inventory: 1, blocked: [] });
    expect(plan.items.map((i) => i.name)).toEqual(["DEMO Ingot", "DEMO Leather", "DEMO Ore", "DEMO Sword"]);
    run(plan.statements);
    expect(names("items")).toEqual([]);
    expect(names("data_sources")).toEqual(["Manual entry"]); // the manual source is kept
    expect(names("categories")).toEqual([]);
    expect(names("professions")).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM recipe_ingredients").get()!.n).toBe(0);
  });

  it("keeps user data, and a demo item a user recipe still needs", async () => {
    run(userItem("My Gem"));
    run(upsertRecipe({
      recipe_key: "mine", output_item: "My Gem", output_quantity: 1, game_region: "OTHER", verification_status: "user_provided",
      profession: "DEMO Smithing", required_level: null, craft_fee: 0, game_version: null, last_verified_at: null, notes: null,
      source_name: "Me", source_type: "user", source_url: null, ingredients: [{ item: "DEMO Ore", quantity: 1 }],
    }));
    const plan = await planDemoCleanup(select);
    expect(plan.blocked.map((i) => i.name)).toEqual(["DEMO Ore"]);
    run(plan.statements);
    expect(names("items")).toEqual(["DEMO Ore", "My Gem"]);
    expect(db.prepare("SELECT recipe_key FROM recipes").all().map((r) => r.recipe_key)).toEqual(["mine"]);
    expect(names("categories")).toEqual(["DEMO Materials"]); // still used by both kept items
    expect(names("professions")).toEqual(["DEMO Smithing"]); // used by the user recipe
    expect(names("data_sources")).toEqual(["Fictional demo data", "Manual entry", "Me"]); // still referenced by DEMO Ore
    expect(db.prepare("SELECT COUNT(*) AS n FROM market_prices").get()!.n).toBe(1); // DEMO Ore kept, so its price too
  });

  it("does nothing harmful when there is no demo data", async () => {
    run((await planDemoCleanup(select)).statements);
    const again = await planDemoCleanup(select);
    expect(again).toMatchObject({ recipes: 0, items: [], blocked: [], prices: 0, inventory: 0 });
    run(again.statements);
  });
});
