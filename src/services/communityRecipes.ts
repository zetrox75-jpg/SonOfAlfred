import { normalizeName } from "../domain/validation/catalogue";
import type { Statement } from "./catalogueStatements";

// Recipes written by the community importers (aion2.exchange crafts model, gamers4.life crafting
// graph): Global, status `community`, identified by `recipe_key` so a re-import updates them.

export interface CommunityRecipe {
  key: string;
  output: string;
  profession: string;
  outputQuantity: number;
  /** null = unknown, never 0. */
  craftFee: number | null;
  requiredLevel: number | null;
  notes: string;
  ingredients: { name: string; quantity: number }[];
}

/**
 * Upsert by `recipe_key`. A re-import replaces the ingredients and the notes and keeps the craft
 * fee, status and archive state the user may have changed. Items must exist (same transaction).
 */
export function communityRecipeStatements(r: CommunityRecipe, sourceName: string): Statement[] {
  const recipeId = "(SELECT id FROM recipes WHERE recipe_key = ?)";
  const item = "(SELECT id FROM items WHERE normalized_name = ? AND game_region = 'GLOBAL')";
  return [
    { sql: "INSERT OR IGNORE INTO professions (name) VALUES (?)", params: [r.profession] },
    {
      sql: `INSERT INTO recipes (recipe_key, output_item_id, profession_id, required_level, output_quantity, craft_fee, notes, game_region, verification_status, source_id)
            VALUES (?, ${item}, (SELECT id FROM professions WHERE name = ?), ?, ?, ?, ?, 'GLOBAL', 'community', (SELECT id FROM data_sources WHERE name = ?))
            ON CONFLICT (recipe_key) WHERE recipe_key IS NOT NULL DO UPDATE SET notes = excluded.notes,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      params: [r.key, normalizeName(r.output), r.profession, r.requiredLevel, r.outputQuantity, r.craftFee, r.notes, sourceName],
    },
    { sql: `DELETE FROM recipe_ingredients WHERE recipe_id = ${recipeId}`, params: [r.key] },
    ...r.ingredients.map((i) => ({
      sql: `INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity) VALUES (${recipeId}, ${item}, ?)`,
      params: [r.key, normalizeName(i.name), i.quantity],
    })),
  ];
}
