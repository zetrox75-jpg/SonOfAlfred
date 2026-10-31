import { z } from "zod";
import { GameRegion, SourceType, VerificationStatus } from "../models";
import type { CsvTable } from "../../services/csv";

// Catalogue input model shared by CSV import, manual forms and CSV export.
// Items are referenced by (normalized name, region): a GLOBAL recipe can only use GLOBAL items.

export const normalizeName = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export const itemKey = (name: string, region: string) => `${region}|${normalizeName(name)}`;

export const text = z.string().trim();
export const optText = text.transform((s) => (s === "" ? null : s));
export const optInt = (min: number) =>
  text.transform((s, ctx) => {
    if (s === "") return null;
    if (!/^\d+$/.test(s) || Number(s) < min || !Number.isSafeInteger(Number(s))) {
      ctx.addIssue({ code: "custom", message: `must be a whole number >= ${min}` });
      return z.NEVER;
    }
    return Number(s);
  });
export const reqInt = (min: number) =>
  optInt(min)
    .refine((v) => v !== null, "is required")
    .transform((v) => v as number);
export const optDate = text.transform((s, ctx) => {
  if (s === "") return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(t)) {
    ctx.addIssue({ code: "custom", message: "must be a date (YYYY-MM-DD or ISO 8601)" });
    return z.NEVER;
  }
  return new Date(t).toISOString();
});
export const upper = <E extends z.ZodType>(e: E) => z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), e);
export const lower = <E extends z.ZodType>(e: E) => z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), e);

const sourceFields = {
  source_name: text.min(1, "is required (every record needs a source)"),
  source_type: lower(SourceType),
  source_url: optText,
};

export const ItemRow = z.object({
  name: text.min(1, "is required"),
  game_region: upper(GameRegion),
  verification_status: lower(VerificationStatus),
  category: optText,
  game_version: optText,
  last_verified_at: optDate,
  description: optText,
  ...sourceFields,
});
export type ItemInput = z.output<typeof ItemRow>;

export const RecipeRow = z.object({
  recipe_key: text.min(1, "is required").max(100),
  output_item: text.min(1, "is required"),
  output_quantity: reqInt(1),
  game_region: upper(GameRegion),
  verification_status: lower(VerificationStatus),
  profession: optText,
  required_level: optInt(0),
  craft_fee: optInt(0),
  game_version: optText,
  last_verified_at: optDate,
  notes: optText,
  ...sourceFields,
  ingredient_item: text.min(1, "is required"),
  ingredient_quantity: reqInt(1),
});
type RecipeRowT = z.output<typeof RecipeRow>;
export type RecipeInput = Omit<RecipeRowT, "ingredient_item" | "ingredient_quantity"> & {
  ingredients: { item: string; quantity: number }[];
};

export const ITEM_COLUMNS = Object.keys(ItemRow.shape);
export const RECIPE_COLUMNS = Object.keys(RecipeRow.shape);
const REQUIRED_ITEM = ["name", "game_region", "verification_status", "source_name", "source_type"];
const REQUIRED_RECIPE = [
  "recipe_key", "output_item", "output_quantity", "game_region", "verification_status",
  "source_name", "source_type", "ingredient_item", "ingredient_quantity",
];

export interface ImportError {
  line: number | null;
  message: string;
}

export function checkHeaders(t: CsvTable, known: string[], required: string[]): ImportError[] {
  const errs: ImportError[] = required.filter((h) => !t.headers.includes(h)).map((h) => ({ line: 1, message: `Missing column "${h}"` }));
  for (const h of t.headers) if (!known.includes(h)) errs.push({ line: 1, message: `Unknown column "${h}"` });
  if (!t.rows.length) errs.push({ line: null, message: "The file has no data rows" });
  return errs;
}

export function parseRows<S extends z.ZodObject>(t: CsvTable, schema: S, errors: ImportError[]) {
  const out: { line: number; value: z.output<S> }[] = [];
  const blank = Object.fromEntries(Object.keys(schema.shape).map((k) => [k, ""])); // optional columns may be absent
  for (const r of t.rows) {
    const p = schema.safeParse({ ...blank, ...r.values });
    if (p.success) out.push({ line: r.line, value: p.data });
    else for (const i of p.error.issues) errors.push({ line: r.line, message: `${i.path.join(".")}: ${i.message}` });
  }
  return out;
}

export function parseItemsCsv(t: CsvTable): { inputs: ItemInput[]; errors: ImportError[] } {
  const errors = checkHeaders(t, ITEM_COLUMNS, REQUIRED_ITEM);
  if (errors.some((e) => e.line === 1)) return { inputs: [], errors };
  const rows = parseRows(t, ItemRow, errors);
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = itemKey(r.value.name, r.value.game_region);
    if (seen.has(k)) errors.push({ line: r.line, message: `Duplicate item "${r.value.name}" (${r.value.game_region}), first on line ${seen.get(k)}` });
    else seen.set(k, r.line);
  }
  return { inputs: rows.map((r) => r.value), errors };
}

const RECIPE_SCALARS = [
  "output_item", "output_quantity", "game_region", "verification_status", "profession", "required_level",
  "craft_fee", "game_version", "last_verified_at", "notes", "source_name", "source_type", "source_url",
] as const;

/** One row per ingredient; recipe columns must be identical on every row of a recipe_key. */
export function parseRecipesCsv(t: CsvTable): { inputs: RecipeInput[]; errors: ImportError[] } {
  const errors = checkHeaders(t, RECIPE_COLUMNS, REQUIRED_RECIPE);
  if (errors.some((e) => e.line === 1)) return { inputs: [], errors };
  const byKey = new Map<string, { first: number; recipe: RecipeInput }>();
  for (const { line, value } of parseRows(t, RecipeRow, errors)) {
    const { ingredient_item, ingredient_quantity, ...scalars } = value;
    const g = byKey.get(value.recipe_key);
    if (!g) {
      byKey.set(value.recipe_key, { first: line, recipe: { ...scalars, ingredients: [{ item: ingredient_item, quantity: ingredient_quantity }] } });
      continue;
    }
    const diff = RECIPE_SCALARS.filter((f) => scalars[f] !== g.recipe[f]);
    if (diff.length) errors.push({ line, message: `Recipe "${value.recipe_key}": ${diff.join(", ")} differ from line ${g.first}` });
    if (g.recipe.ingredients.some((i) => normalizeName(i.item) === normalizeName(ingredient_item)))
      errors.push({ line, message: `Recipe "${value.recipe_key}": ingredient "${ingredient_item}" listed twice` });
    else g.recipe.ingredients.push({ item: ingredient_item, quantity: ingredient_quantity });
  }
  return { inputs: [...byKey.values()].map((g) => g.recipe), errors };
}

// ---- Diff against the database ----

export interface CatalogueSnapshot {
  /** keyed by itemKey(name, region) */
  items: Map<string, ItemInput>;
  /** keyed by recipe_key */
  recipes: Map<string, RecipeInput>;
}

export type Change<T> = { action: "create" | "update" | "unchanged"; input: T; changedFields: string[] };

const norm = (v: unknown) => (typeof v === "string" ? normalizeName(v) : v);
function changed<T extends object>(next: T, prev: T, fields: (keyof T)[]): string[] {
  return fields.filter((f) => norm(next[f]) !== norm(prev[f])).map(String);
}

const ITEM_FIELDS = ["name", "category", "game_version", "verification_status", "last_verified_at", "description", "source_name"] as const;

export function diffItems(inputs: ItemInput[], snap: CatalogueSnapshot): Change<ItemInput>[] {
  return inputs.map((input) => {
    const prev = snap.items.get(itemKey(input.name, input.game_region));
    if (!prev) return { action: "create", input, changedFields: [] };
    // Name casing counts as a change even though the key ignores it.
    const fields = changed(input, prev, [...ITEM_FIELDS]);
    if (input.name !== prev.name && !fields.includes("name")) fields.unshift("name");
    return { action: fields.length ? "update" : "unchanged", input, changedFields: fields };
  });
}

const ingredientsSig = (r: RecipeInput) =>
  r.ingredients.map((i) => `${normalizeName(i.item)}x${i.quantity}`).sort().join(";");

export function diffRecipes(
  inputs: RecipeInput[],
  snap: CatalogueSnapshot,
): { changes: Change<RecipeInput>[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  for (const r of inputs) {
    const missing = [r.output_item, ...r.ingredients.map((i) => i.item)].filter((n) => !snap.items.has(itemKey(n, r.game_region)));
    for (const n of new Set(missing))
      errors.push({ line: null, message: `Recipe "${r.recipe_key}": unknown item "${n}" in region ${r.game_region}. Import it in the items file first.` });
    if (r.ingredients.some((i) => normalizeName(i.item) === normalizeName(r.output_item)))
      errors.push({ line: null, message: `Recipe "${r.recipe_key}": the output item is also an ingredient (cycle)` });
  }
  const changes = inputs.map((input): Change<RecipeInput> => {
    const prev = snap.recipes.get(input.recipe_key);
    if (!prev) return { action: "create", input, changedFields: [] };
    const fields = changed(input, prev, [...RECIPE_SCALARS]);
    if (ingredientsSig(input) !== ingredientsSig(prev)) fields.push("ingredients");
    return { action: fields.length ? "update" : "unchanged", input, changedFields: fields };
  });
  return { changes, errors };
}

/** Flattens recipes back to one CSV row per ingredient (the import format). */
export const recipesToRows = (recipes: RecipeInput[]) =>
  recipes.flatMap(({ ingredients, ...r }) =>
    ingredients.map((i) => ({ ...r, ingredient_item: i.item, ingredient_quantity: i.quantity })),
  );
