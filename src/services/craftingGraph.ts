import { z } from "zod";
import { normalizeName } from "../domain/validation/catalogue";
import type { Statement } from "./catalogueStatements";
import { communityRecipeStatements } from "./communityRecipes";
import { newItemStatements, sourceStatement } from "./market/aion2exchange";
import type { ProviderSource } from "./market/provider";

// gamers4.life crafting graph (a JSON file the user saved from
// https://gamers4.life/aion-2/database/crafting-graph.json) -> Global community recipes.
// Read from a local file only: no network. Item keys are the game's, the same as aion2.exchange.

export const GRAPH_SOURCE: ProviderSource = {
  name: "gamers4.life crafting graph",
  url: "https://gamers4.life/aion-2/database/crafting-graph.json",
  sourceType: "community",
  notes: "Community crafting graph (recipes, quantities, fees). Region not stated; English names match aion2.exchange Global items. Use authorized by the user on 2026-10-31.",
  authorized: true,
};

const Input = z.tuple([z.string(), z.number().int().positive()]).rest(z.unknown());
export const CraftingGraph = z.object({
  items: z.record(z.string(), z.object({ n: z.string().min(1) })),
  recipes: z.record(z.string(), z.object({
    p: z.string().min(1),
    qr: z.enum(["light", "dark"]),
    ml: z.number().int().nonnegative().nullable(),
    gold: z.number().int().nonnegative(),
    in: z.array(Input),
    out: z.string(),
    outq: z.number().int().positive(),
  })),
});
export type CraftingGraph = z.output<typeof CraftingGraph>;
export type Race = "light" | "dark";

/** Elyos are the light race, Asmodians the dark one. Recipes and item keys differ per race. */
export const raceOf = (faction: string | null | undefined): Race | null =>
  faction === "Elyos" ? "light" : faction === "Asmodian" ? "dark" : null;

export const GRAPH_NOTE = "from the gamers4.life crafting graph";
const KINA = /^Kina \(/; // the currency, listed as an ingredient: it is part of the fee
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface GraphImport {
  statements: Statement[];
  recipes: number;
  /** Recipes of this race listing no ingredient: unusable. */
  noInputs: number;
  /** Item names carried by several item keys (variants), merged into one catalogue item. */
  mergedNames: number;
}

/** Recipes of one race. Same-name variants become one item with alternative recipes, as the
 * market and the catalogue both identify items by name. */
export function craftingGraphStatements(g: CraftingGraph, race: Race, importedAt: string): GraphImport {
  const name = (key: string) => {
    const it = g.items[key];
    if (!it) throw new Error(`Item ${key} is used by a recipe but missing from the graph's item list. Nothing was written.`);
    return it.n;
  };
  const date = importedAt.slice(0, 10);
  const desc = `Added from the ${GRAPH_SOURCE.name} on ${date}. Name only; not verified.`;
  const statements: Statement[] = [sourceStatement(GRAPH_SOURCE)];
  const created = new Map<string, Set<string>>(); // normalized name -> item keys
  const item = (key: string) => {
    const n = name(key);
    const k = normalizeName(n);
    if (!created.has(k)) {
      created.set(k, new Set());
      statements.push(...newItemStatements({ name: n, category: null }, GRAPH_SOURCE, importedAt, desc));
    }
    created.get(k)!.add(key);
    return n;
  };
  let recipes = 0, noInputs = 0;
  for (const [key, r] of Object.entries(g.recipes)) {
    if (r.qr !== race) continue;
    if (r.in.length === 0) { noInputs++; continue; }
    let fee = r.gold;
    const ingredients = new Map<string, number>();
    for (const [k, q] of r.in) {
      if (KINA.test(name(k))) { fee += q; continue; }
      const n = item(k);
      ingredients.set(n, (ingredients.get(n) ?? 0) + q);
    }
    if (ingredients.size === 0) { noInputs++; continue; }
    statements.push(...communityRecipeStatements({
      key: `gamers4.life:${key}`,
      output: item(r.out),
      profession: title(r.p),
      outputQuantity: r.outq,
      craftFee: fee,
      requiredLevel: r.ml,
      notes: `Quantities and fee ${GRAPH_NOTE} (recipe ${key}, race ${race}, item ${r.out}); imported ${date}. Region not stated by the source.`,
      ingredients: [...ingredients].map(([n, quantity]) => ({ name: n, quantity })),
    }, GRAPH_SOURCE.name));
    recipes++;
  }
  return { statements, recipes, noInputs, mergedNames: [...created.values()].filter((s) => s.size > 1).length };
}
