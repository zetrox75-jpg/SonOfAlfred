// Splendent crafts import on the ORIGINAL /api/crafts/model response saved by the user
// (tests/fixtures/aion2exchange/crafts-model.json, server 12316, retrieved 2026-10-31).
// No test makes a network request.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlanRecipe, PricePoint } from "../src/domain/calculations/craftPlan";
import { scanProfits } from "../src/domain/calculations/scanner";
import {
  CRAFT_NOTE,
  CraftModelResponse,
  craftRecipeKey,
  craftRecipeStatements,
  expectedMaterials,
  parse,
  urls,
} from "../src/services/market/aion2exchange";
import { PLAN_RECIPES_SQL, toPlanRecipe, type PlanRecipeRow } from "../src/services/planQueries";

const model = parse(CraftModelResponse, JSON.parse(readFileSync(join(__dirname, "fixtures/aion2exchange/crafts-model.json"), "utf8")), "crafts model");
const AT = "2026-10-31T08:30:00.000Z";
const GREATSWORD = 110130014;

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const mig = join(__dirname, "../src-tauri/migrations");
  for (const f of readdirSync(mig).sort()) db.exec(readFileSync(join(mig, f), "utf8"));
});
const run = (stmts: { sql: string; params: unknown[] }[]) => {
  db.exec("BEGIN");
  for (const s of stmts) db.prepare(s.sql).run(...(s.params as never[]));
  db.exec("COMMIT");
};
const get = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as T;
const planRecipes = () => (db.prepare(PLAN_RECIPES_SQL).all() as unknown as PlanRecipeRow[]).map(toPlanRecipe);

describe("crafts model", () => {
  it("parses the saved response: 11 profiles, 19 Splendent targets, 3 steps each", () => {
    expect(model.server_id).toBe(12316);
    expect(model.profiles).toHaveLength(11);
    expect(model.profiles.flatMap((p) => p.members)).toHaveLength(19);
    expect(model.profiles.every((p) => p.steps.length === 3)).toBe(true);
    expect(urls.craftsModel(12316)).toBe("https://aion2.exchange/api/crafts/model?server=12316");
    expect(() => urls.craftsModel("1&x=2")).toThrow(RangeError);
  });

  it("expected materials = per attempt x expected attempts, rounded up, never below the model", () => {
    const weapons = model.profiles.find((p) => p.members.some((m) => m.target_key === GREATSWORD))!;
    const mats = new Map(expectedMaterials(weapons.steps).map((m) => [m.name, m.quantity]));
    expect(mats.get("Refining Stone")).toBe(375); // 5 x 74.9966 = 374.98
    expect(mats.get("Orichalcum Ingot")).toBe(225); // 3 x 74.9966 = 224.99
    expect(mats.get("Pure Orichalcum Ore")).toBe(34); // 8 x 4.1306 = 33.05
    for (const s of weapons.steps) for (const m of s.materials) {
      const exact = weapons.steps.flatMap((x) => x.materials.filter((y) => y.name === m.name).map((y) => y.per_attempt * x.attempts)).reduce((a, b) => a + b);
      expect(mats.get(m.name!)! - exact).toBeGreaterThanOrEqual(0);
      expect(mats.get(m.name!)! - exact).toBeLessThan(1);
    }
    // An exact whole number stays as is (float noise is not rounded up).
    expect(expectedMaterials([{ step_no: 1, attempts: 75.00000000001, materials: [{ material_key: 1, name: "X", per_attempt: 5 }] }])).toEqual([{ name: "X", quantity: 375 }]);
  });
});

describe("import into the database", () => {
  it("creates 19 Global community recipes with unknown fee, the note, and community items", () => {
    const r = craftRecipeStatements(model, AT);
    expect(r).toMatchObject({ recipes: 19, skipped: 0 });
    run(r.statements);

    expect(get("SELECT COUNT(*) n FROM recipes")).toEqual({ n: 19 });
    expect(db.prepare("SELECT DISTINCT game_region, verification_status, craft_fee, output_quantity FROM recipes").all()).toEqual([
      { game_region: "GLOBAL", verification_status: "community", craft_fee: null, output_quantity: 1 },
    ]);
    expect(get<{ n: number }>("SELECT COUNT(*) n FROM recipes WHERE notes LIKE ?", `${CRAFT_NOTE}.%`).n).toBe(19);
    expect(get("SELECT DISTINCT verification_status, game_region FROM items")).toEqual({ verification_status: "community", game_region: "GLOBAL" });
    expect(get<{ n: number }>("SELECT COUNT(*) n FROM items WHERE description LIKE ?", `%${CRAFT_NOTE}%`).n).toBe(get<{ n: number }>("SELECT COUNT(*) n FROM items").n);
    expect(get("SELECT name, is_authorized FROM data_sources")).toEqual({ name: "aion2.exchange", is_authorized: 1 });

    const sword = get<{ id: number; profession: string; category: string }>(
      `SELECT r.id, p.name profession, c.name category FROM recipes r JOIN professions p ON p.id = r.profession_id
       JOIN items i ON i.id = r.output_item_id JOIN categories c ON c.id = i.category_id WHERE r.recipe_key = ?`, craftRecipeKey("Dark", GREATSWORD));
    expect(sword).toMatchObject({ profession: "Blacksmithing", category: "Weapon" });
    expect(db.prepare(`SELECT i.name, x.quantity FROM recipe_ingredients x JOIN items i ON i.id = x.ingredient_item_id WHERE x.recipe_id = ? ORDER BY i.name`).all(sword.id))
      .toContainEqual({ name: "Refining Stone", quantity: 375 });
  });

  it("re-import updates the same recipes and keeps a craft fee the user set", () => {
    run(craftRecipeStatements(model, AT).statements);
    db.exec(`UPDATE recipes SET craft_fee = 1000 WHERE recipe_key = '${craftRecipeKey("Dark", GREATSWORD)}'`);
    const counts = () => get("SELECT (SELECT COUNT(*) FROM recipes) r, (SELECT COUNT(*) FROM recipe_ingredients) x, (SELECT COUNT(*) FROM items) i");
    const before = counts();
    run(craftRecipeStatements(model, "2026-10-31T09:30:00.000Z").statements);
    expect(counts()).toEqual(before);
    expect(get("SELECT craft_fee FROM recipes WHERE recipe_key = ?", craftRecipeKey("Dark", GREATSWORD))).toEqual({ craft_fee: 1000 });
  });

  it("existing catalogue items are reused, not duplicated or relabelled", () => {
    db.exec("INSERT INTO items (name, normalized_name, game_region, verification_status) VALUES ('Refining Stone', 'refining stone', 'GLOBAL', 'verified')");
    run(craftRecipeStatements(model, AT).statements);
    expect(db.prepare("SELECT verification_status FROM items WHERE normalized_name = 'refining stone'").all()).toEqual([{ verification_status: "verified" }]);
  });
});

describe("profit scanner on the imported recipes", () => {
  const scan = (recipes: PlanRecipe[], prices: Map<number, PricePoint>, sell: Map<number, PricePoint>) => {
    const byOutput = new Map<number, PlanRecipe[]>();
    for (const r of recipes) byOutput.set(r.outputItemId, [...(byOutput.get(r.outputItemId) ?? []), r]);
    return scanProfits({
      targets: [...byOutput.keys()], quantity: 1, recipesByOutput: byOutput,
      buyPrice: (id) => prices.get(id), sellPrice: (id) => sell.get(id),
      inventory: new Map(), useInventory: false, commissionBps: 500, valuation: "cash",
    });
  };
  const price = (unitPrice: number): PricePoint => ({ unitPrice, stale: false, observedAt: AT, source: "MOCK test price (fictional)" });

  it("all 19 recipes reach the scanner as reliable community recipes; unknown fee keeps them incomplete", () => {
    run(craftRecipeStatements(model, AT).statements);
    const recipes = planRecipes();
    expect(recipes).toHaveLength(19);
    expect(recipes.every((r) => r.reliable && !r.verified)).toBe(true);
    const rows = scan(recipes, new Map(), new Map());
    expect(rows).toHaveLength(19);
    expect(rows.every((r) => r.status === "incomplete" && r.issues.includes("unknown craft fee") && r.profit === null)).toBe(true);
  });

  it("with a fee, prices and commission set, cost and margin are the rounded-up quantities x prices", () => {
    run(craftRecipeStatements(model, AT).statements);
    const key = craftRecipeKey("Dark", GREATSWORD);
    db.prepare("UPDATE recipes SET craft_fee = 0 WHERE recipe_key = ?").run(key);
    const sword = planRecipes().find((r) => r.key === key)!;
    // FICTIONAL prices: 10 per material unit; sell 10,000,000.
    const prices = new Map(sword.ingredients.map((i) => [i.itemId, price(10)]));
    const units = sword.ingredients.reduce((a, i) => a + i.quantity, 0);
    const [row] = scan([sword], prices, new Map([[sword.outputItemId, price(10_000_000)]]));
    expect(row.status).toBe("reliable");
    expect(row.totalCost).toBe(units * 10);
    expect(row.commission).toBe(500_000); // 5 %
    expect(row.profit).toBe(10_000_000 - 500_000 - units * 10);
  });
});
