// gamers4.life crafting graph on the ORIGINAL file saved by the user
// (tests/fixtures/gamers4life/crafting-graph.json, 2026-10-31). No network.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlanRecipe, PricePoint } from "../src/domain/calculations/craftPlan";
import { scanProfits } from "../src/domain/calculations/scanner";
import { CraftingGraph, craftingGraphStatements, raceOf } from "../src/services/craftingGraph";
import { PLAN_RECIPES_SQL, toPlanRecipe, type PlanRecipeRow } from "../src/services/planQueries";

const graph = CraftingGraph.parse(JSON.parse(readFileSync(join(__dirname, "fixtures/gamers4life/crafting-graph.json"), "utf8")));
const AT = "2026-10-31T09:00:00.000Z";

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
const recipeOf = (key: string) => get<{ id: number; output_quantity: number; craft_fee: number; required_level: number; profession: string; output: string }>(
  `SELECT r.id, r.output_quantity, r.craft_fee, r.required_level, p.name profession, i.name output FROM recipes r
   JOIN professions p ON p.id = r.profession_id JOIN items i ON i.id = r.output_item_id WHERE r.recipe_key = ?`, key);
const ingredients = (recipeId: number) =>
  db.prepare("SELECT i.name, x.quantity FROM recipe_ingredients x JOIN items i ON i.id = x.ingredient_item_id WHERE x.recipe_id = ? ORDER BY i.name").all(recipeId);

describe("crafting graph file", () => {
  it("parses: 2442 recipes, half per race, every referenced item named", () => {
    const rs = Object.values(graph.recipes);
    expect(rs).toHaveLength(2442);
    expect(rs.filter((r) => r.qr === "dark")).toHaveLength(1221);
    expect(raceOf("Asmodian")).toBe("dark");
    expect(raceOf("Elyos")).toBe("light");
    expect(raceOf("")).toBeNull();
  });
});

describe("import (Asmodian)", () => {
  it("writes the recipes of one race only, skips those without ingredients, reports merged variants", () => {
    const r = craftingGraphStatements(graph, "dark", AT);
    expect(r.recipes + r.noInputs).toBe(1221);
    expect(r.noInputs).toBe(476);
    expect(r.recipes).toBe(745);
    expect(r.mergedNames).toBeGreaterThan(0);
    run(r.statements);
    expect(get("SELECT COUNT(*) n FROM recipes")).toEqual({ n: 745 });
    expect(get<{ n: number }>("SELECT COUNT(*) n FROM recipes WHERE recipe_key LIKE 'gamers4.life:%'").n).toBe(745);
    expect(db.prepare("SELECT DISTINCT game_region, verification_status FROM recipes").all()).toEqual([{ game_region: "GLOBAL", verification_status: "community" }]);
    expect(get("SELECT name, source_type, is_authorized FROM data_sources")).toEqual({ name: "gamers4.life crafting graph", source_type: "community", is_authorized: 1 });
    // No item is created twice, and every item is Global community.
    expect(get("SELECT DISTINCT game_region, verification_status FROM items")).toEqual({ game_region: "GLOBAL", verification_status: "community" });
  });

  it("keeps quantities, output count, fee and mastery exactly as in the file (cooking example)", () => {
    run(craftingGraphStatements(graph, "dark", AT).statements);
    const [key, src] = Object.entries(graph.recipes).find(([, x]) => x.qr === "dark" && x.p === "cooking" && x.in.length > 0)!;
    const r = recipeOf(`gamers4.life:${key}`);
    expect(r).toMatchObject({ output: graph.items[src.out].n, output_quantity: src.outq, craft_fee: src.gold, required_level: src.ml, profession: "Cooking" });
    expect(ingredients(r.id)).toEqual(
      src.in.map(([k, q]) => ({ name: graph.items[k].n, quantity: q })).sort((a, b) => (a.name < b.name ? -1 : 1)),
    );
  });

  it("Kina listed as an ingredient is added to the craft fee, never an item", () => {
    run(craftingGraphStatements(graph, "dark", AT).statements);
    const [key, src] = Object.entries(graph.recipes).find(([, x]) => x.qr === "dark" && x.in.some(([k]) => graph.items[k].n.startsWith("Kina (")))!;
    const kina = src.in.filter(([k]) => graph.items[k].n.startsWith("Kina (")).reduce((a, [, q]) => a + q, 0);
    expect(recipeOf(`gamers4.life:${key}`).craft_fee).toBe(src.gold + kina);
    expect(get("SELECT COUNT(*) n FROM items WHERE name LIKE 'Kina (%'")).toEqual({ n: 0 });
  });

  it("re-import changes nothing and keeps a craft fee the user changed", () => {
    run(craftingGraphStatements(graph, "dark", AT).statements);
    const [key] = Object.entries(graph.recipes).find(([, x]) => x.qr === "dark" && x.in.length > 0)!;
    db.prepare("UPDATE recipes SET craft_fee = 123 WHERE recipe_key = ?").run(`gamers4.life:${key}`);
    const counts = () => get("SELECT (SELECT COUNT(*) FROM recipes) r, (SELECT COUNT(*) FROM recipe_ingredients) x, (SELECT COUNT(*) FROM items) i");
    const before = counts();
    run(craftingGraphStatements(graph, "dark", "2026-11-01T09:00:00.000Z").statements);
    expect(counts()).toEqual(before);
    expect(recipeOf(`gamers4.life:${key}`).craft_fee).toBe(123);
  });

  it("existing catalogue items (e.g. from the price refresh) are reused, not relabelled", () => {
    db.exec("INSERT INTO items (name, normalized_name, game_region, verification_status) VALUES ('Odyle', 'odyle', 'GLOBAL', 'verified')");
    run(craftingGraphStatements(graph, "dark", AT).statements);
    expect(db.prepare("SELECT verification_status FROM items WHERE normalized_name = 'odyle'").all()).toEqual([{ verification_status: "verified" }]);
  });
});

describe("profit scanner on the imported recipes", () => {
  it("every imported recipe is scanned; with prices for one recipe, its profit is exact", () => {
    run(craftingGraphStatements(graph, "dark", AT).statements);
    const recipes = (db.prepare(PLAN_RECIPES_SQL).all() as unknown as PlanRecipeRow[]).map(toPlanRecipe);
    expect(recipes.every((r) => r.reliable && !r.verified)).toBe(true);
    const byOutput = new Map<number, PlanRecipe[]>();
    for (const r of recipes) byOutput.set(r.outputItemId, [...(byOutput.get(r.outputItemId) ?? []), r]);

    // FICTIONAL prices for one cooking recipe whose ingredients have no recipe of their own.
    const one = recipes.find((r) => r.craftFee !== null && r.ingredients.every((i) => !byOutput.has(i.itemId)) && (byOutput.get(r.outputItemId) ?? []).length === 1)!;
    const price = (unitPrice: number): PricePoint => ({ unitPrice, stale: false, observedAt: AT, source: "MOCK test price (fictional)" });
    const buy = new Map(one.ingredients.map((i) => [i.itemId, price(100)]));
    const rows = scanProfits({
      targets: [...byOutput.keys()], quantity: one.outputQuantity, recipesByOutput: byOutput,
      buyPrice: (id) => buy.get(id), sellPrice: (id) => (id === one.outputItemId ? price(1_000_000) : undefined),
      inventory: new Map(), useInventory: false, commissionBps: 0, valuation: "cash",
    });
    expect(rows).toHaveLength(byOutput.size);
    const row = rows.find((r) => r.itemId === one.outputItemId)!;
    const cost = one.ingredients.reduce((a, i) => a + i.quantity * 100, 0) + one.craftFee!;
    expect(row.status).toBe("reliable");
    expect(row.totalCost).toBe(cost);
    expect(row.profit).toBe(1_000_000 * one.outputQuantity - cost);
  });
});
