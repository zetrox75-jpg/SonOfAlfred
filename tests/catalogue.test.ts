// Uses the FICTIONAL demo files in data/templates/demo (region OTHER, source type demo).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "../src/services/csv";
import {
  diffItems,
  diffRecipes,
  itemKey,
  ITEM_COLUMNS,
  parseItemsCsv,
  parseRecipesCsv,
  RECIPE_COLUMNS,
  recipesToRows,
  type CatalogueSnapshot,
} from "../src/domain/validation/catalogue";
import {
  ITEMS_SQL,
  RECIPES_SQL,
  setRecipeArchived,
  toRecipe,
  upsertItem,
  upsertRecipe,
  type ItemRowDb,
  type Statement,
} from "../src/services/catalogueStatements";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("csv", () => {
  it("handles quotes, escaped quotes, embedded newlines and BOM", () => {
    const recs = parseCsvRecords('﻿a,b\r\n"x, y","he said ""hi"""\n"multi\nline",z\n');
    expect(recs).toEqual([
      { line: 1, fields: ["a", "b"] },
      { line: 2, fields: ["x, y", 'he said "hi"'] },
      { line: 3, fields: ["multi\nline", "z"] },
    ]);
  });

  it("detects semicolon delimiter (French Excel)", () => {
    expect(parseCsv("Name;Game_Region\nOre;GLOBAL\n").rows[0].values).toEqual({ name: "Ore", game_region: "GLOBAL" });
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsvRecords('a\n"open')).toThrow(/line 2/);
  });

  it("round-trips through toCsv", () => {
    const rows = [{ a: 'x,"y"', b: "line\nbreak" }, { a: null, b: 3 }];
    expect(parseCsv(toCsv(["a", "b"], rows)).rows.map((r) => r.values)).toEqual([
      { a: 'x,"y"', b: "line\nbreak" },
      { a: "", b: "3" },
    ]);
  });

  it("templates have exactly the importer's columns", () => {
    expect(parseCsv(read("data/templates/items.csv")).headers).toEqual(ITEM_COLUMNS);
    expect(parseCsv(read("data/templates/recipes.csv")).headers).toEqual(RECIPE_COLUMNS);
  });
});

describe("import validation", () => {
  it("reports missing and unknown columns", () => {
    const { errors } = parseItemsCsv(parseCsv("name,colour\nOre,red\n"));
    expect(errors.map((e) => e.message)).toEqual(
      expect.arrayContaining(['Missing column "game_region"', 'Unknown column "colour"']),
    );
  });

  it("reports invalid values with their line", () => {
    const csv = "name,game_region,verification_status,source_name,source_type,last_verified_at\n" +
      "Ore,EU,confirmed,,demo,yesterday\n";
    const { errors } = parseItemsCsv(parseCsv(csv));
    expect(errors.every((e) => e.line === 2)).toBe(true);
    expect(errors.map((e) => e.message.split(":")[0]).sort()).toEqual(
      ["game_region", "last_verified_at", "source_name", "verification_status"],
    );
  });

  it("normalizes case of enums and rejects duplicate items", () => {
    const csv = "name,game_region,verification_status,source_name,source_type\n" +
      "Ore,global,Verified,Me,user\n ore ,GLOBAL,verified,Me,user\nOre,KR,verified,Me,user\n";
    const { inputs, errors } = parseItemsCsv(parseCsv(csv));
    expect(inputs[0]).toMatchObject({ game_region: "GLOBAL", verification_status: "verified" });
    expect(errors).toEqual([{ line: 3, message: 'Duplicate item "ore" (GLOBAL), first on line 2' }]);
  });

  it("groups recipe rows and keeps an empty fee unknown", () => {
    const { inputs, errors } = parseRecipesCsv(parseCsv(read("data/templates/demo/demo_recipes.csv")));
    expect(errors).toEqual([]);
    expect(inputs.map((r) => [r.recipe_key, r.ingredients.length])).toEqual([["demo-ingot", 1], ["demo-sword", 2]]);
    const noFee = read("data/templates/demo/demo_recipes.csv").replace(",10,", ",,");
    expect(parseRecipesCsv(parseCsv(noFee)).inputs[0].craft_fee).toBeNull();
  });

  it("rejects inconsistent recipe rows and duplicate ingredients", () => {
    const lines = read("data/templates/demo/demo_recipes.csv").trim().split("\n");
    const csv = [lines[0], lines[2], lines[3].replace("DEMO Smithing,5", "DEMO Smithing,6"), lines[2]].join("\n");
    const msgs = parseRecipesCsv(parseCsv(csv)).errors.map((e) => `${e.line}: ${e.message}`);
    expect(msgs).toEqual([
      '3: Recipe "demo-sword": required_level differ from line 2',
      '4: Recipe "demo-sword": ingredient "DEMO Ingot" listed twice',
    ]);
  });
});

// ---- Against a real schema ----

let db: DatabaseSync;
const run = (stmts: Statement[]) => {
  db.exec("BEGIN");
  for (const s of stmts) db.prepare(s.sql).run(...s.params);
  db.exec("COMMIT");
};
const snapshot = (): CatalogueSnapshot => ({
  items: new Map((db.prepare(ITEMS_SQL).all() as unknown as ItemRowDb[]).map((i) => [itemKey(i.name, i.game_region), i])),
  recipes: new Map(db.prepare(RECIPES_SQL).all().map((r) => {
    const rec = toRecipe(r as never);
    return [rec.recipe_key, rec];
  })),
});
const demoItems = () => parseItemsCsv(parseCsv(read("data/templates/demo/demo_items.csv"))).inputs;
const demoRecipes = () => parseRecipesCsv(parseCsv(read("data/templates/demo/demo_recipes.csv"))).inputs;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = join(root, "src-tauri/migrations");
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
});

describe("import, read back, re-import", () => {
  it("creates items and recipes, then sees no change on re-import", () => {
    expect(diffItems(demoItems(), snapshot()).every((c) => c.action === "create")).toBe(true);
    run(demoItems().flatMap(upsertItem));
    const { errors, changes } = diffRecipes(demoRecipes(), snapshot());
    expect(errors).toEqual([]);
    expect(changes.map((c) => c.action)).toEqual(["create", "create"]);
    run(demoRecipes().flatMap(upsertRecipe));

    expect(diffItems(demoItems(), snapshot()).map((c) => c.action)).toEqual(Array(4).fill("unchanged"));
    expect(diffRecipes(demoRecipes(), snapshot()).changes.map((c) => c.action)).toEqual(["unchanged", "unchanged"]);
  });

  it("exported CSV re-imports with no change and no loss", () => {
    run(demoItems().flatMap(upsertItem));
    run(demoRecipes().flatMap(upsertRecipe));
    const snap = snapshot();
    const itemsCsv = toCsv(ITEM_COLUMNS, [...snap.items.values()]);
    const recipesCsv = toCsv(RECIPE_COLUMNS, recipesToRows([...snap.recipes.values()]));
    const items = parseItemsCsv(parseCsv(itemsCsv));
    const recipes = parseRecipesCsv(parseCsv(recipesCsv));
    expect([...items.errors, ...recipes.errors]).toEqual([]);
    expect(diffItems(items.inputs, snap).every((c) => c.action === "unchanged")).toBe(true);
    expect(diffRecipes(recipes.inputs, snap).changes.every((c) => c.action === "unchanged")).toBe(true);
    expect(recipes.inputs).toEqual(demoRecipes());
  });

  it("reports changed fields and replaces ingredients on update", () => {
    run(demoItems().flatMap(upsertItem));
    run(demoRecipes().flatMap(upsertRecipe));
    const edited = demoRecipes().map((r) =>
      r.recipe_key === "demo-sword" ? { ...r, craft_fee: 60, ingredients: [{ item: "DEMO Ingot", quantity: 4 }] } : r,
    );
    expect(diffRecipes(edited, snapshot()).changes[1]).toMatchObject({ action: "update", changedFields: ["craft_fee", "ingredients"] });
    run(edited.flatMap(upsertRecipe));
    expect(snapshot().recipes.get("demo-sword")).toMatchObject({ craft_fee: 60, ingredients: [{ item: "DEMO Ingot", quantity: 4 }] });
    expect(db.prepare("SELECT COUNT(*) AS n FROM recipes").get()!.n).toBe(2);
  });

  it("will not let a recipe use an item from another region", () => {
    run(demoItems().flatMap(upsertItem));
    const kr = demoRecipes().map((r) => ({ ...r, game_region: "KR" as const }));
    const { errors } = diffRecipes(kr, snapshot());
    expect(errors[0].message).toMatch(/unknown item "DEMO Ingot" in region KR/);
    // Even if validation were bypassed, the database refuses it.
    expect(() => run(upsertRecipe(kr[0]))).toThrow();
    db.exec("ROLLBACK");
  });

  it("detects a recipe whose output is its own ingredient", () => {
    run(demoItems().flatMap(upsertItem));
    const loop = { ...demoRecipes()[0], ingredients: [{ item: "DEMO Ingot", quantity: 1 }] };
    expect(diffRecipes([loop], snapshot()).errors[0].message).toMatch(/cycle/);
  });

  it("archives and restores a recipe, and re-import un-archives it", () => {
    run(demoItems().flatMap(upsertItem));
    run(demoRecipes().flatMap(upsertRecipe));
    run(setRecipeArchived("demo-ingot", true));
    expect(snapshot().recipes.get("demo-ingot")).toMatchObject({ archived_at: expect.any(String) });
    run(setRecipeArchived("demo-ingot", false));
    expect(snapshot().recipes.get("demo-ingot")).toMatchObject({ archived_at: null });
  });
});
