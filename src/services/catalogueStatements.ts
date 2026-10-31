import { normalizeName, type ItemInput, type RecipeInput } from "../domain/validation/catalogue";

// Builds the SQL for catalogue writes. Pure: the statements run inside one
// transaction (write_transaction command), and tests run them on in-memory SQLite.
// Rows reference each other by natural key, so no generated id is needed mid-batch.

export interface Statement {
  sql: string;
  params: (string | number | null)[];
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const SOURCE_ID = "(SELECT id FROM data_sources WHERE name = ?)";
const ITEM_ID = "(SELECT id FROM items WHERE normalized_name = ? AND game_region = ?)";

function source(i: { source_name: string; source_type: string; source_url: string | null }): Statement {
  // An existing source keeps its type and URL: sources are edited on their own, not by imports.
  return {
    sql: "INSERT INTO data_sources (name, url, source_type) VALUES (?, ?, ?) ON CONFLICT (name) DO NOTHING",
    params: [i.source_name, i.source_url, i.source_type],
  };
}

function category(name: string): Statement {
  return {
    sql: "INSERT INTO categories (name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ? AND parent_id IS NULL)",
    params: [name, name],
  };
}

/** Insert or update an item matched by (normalized name, region). */
export function upsertItem(i: ItemInput): Statement[] {
  return [
    source(i),
    ...(i.category ? [category(i.category)] : []),
    {
      sql: `INSERT INTO items (name, normalized_name, category_id, description, game_region, game_version,
              verification_status, source_id, last_verified_at)
            VALUES (?, ?, (SELECT id FROM categories WHERE name = ? AND parent_id IS NULL), ?, ?, ?, ?, ${SOURCE_ID}, ?)
            ON CONFLICT (normalized_name, game_region) DO UPDATE SET
              name = excluded.name, category_id = excluded.category_id, description = excluded.description,
              game_version = excluded.game_version, verification_status = excluded.verification_status,
              source_id = excluded.source_id, last_verified_at = excluded.last_verified_at,
              archived_at = NULL, updated_at = ${NOW}`,
      params: [i.name, normalizeName(i.name), i.category, i.description, i.game_region, i.game_version,
        i.verification_status, i.source_name, i.last_verified_at],
    },
  ];
}

/** Insert or update a recipe matched by recipe_key, replacing its ingredient list. */
export function upsertRecipe(r: RecipeInput): Statement[] {
  const recipeId = "(SELECT id FROM recipes WHERE recipe_key = ?)";
  return [
    source(r),
    ...(r.profession
      ? [{ sql: "INSERT INTO professions (name) VALUES (?) ON CONFLICT (name) DO NOTHING", params: [r.profession] }]
      : []),
    {
      sql: `INSERT INTO recipes (recipe_key, output_item_id, profession_id, required_level, output_quantity, craft_fee,
              notes, game_region, game_version, verification_status, source_id, last_verified_at)
            VALUES (?, ${ITEM_ID}, (SELECT id FROM professions WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ${SOURCE_ID}, ?)
            ON CONFLICT (recipe_key) WHERE recipe_key IS NOT NULL DO UPDATE SET
              output_item_id = excluded.output_item_id, profession_id = excluded.profession_id,
              required_level = excluded.required_level, output_quantity = excluded.output_quantity,
              craft_fee = excluded.craft_fee, notes = excluded.notes, game_region = excluded.game_region,
              game_version = excluded.game_version, verification_status = excluded.verification_status,
              source_id = excluded.source_id, last_verified_at = excluded.last_verified_at,
              archived_at = NULL, updated_at = ${NOW}`,
      params: [r.recipe_key, normalizeName(r.output_item), r.game_region, r.profession, r.required_level,
        r.output_quantity, r.craft_fee, r.notes, r.game_region, r.game_version, r.verification_status,
        r.source_name, r.last_verified_at],
    },
    { sql: `DELETE FROM recipe_ingredients WHERE recipe_id = ${recipeId}`, params: [r.recipe_key] },
    ...r.ingredients.map((i) => ({
      sql: `INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity) VALUES (${recipeId}, ${ITEM_ID}, ?)`,
      params: [r.recipe_key, normalizeName(i.item), r.game_region, i.quantity],
    })),
  ];
}

export function setRecipeArchived(recipeKey: string, archived: boolean): Statement[] {
  return [{
    sql: `UPDATE recipes SET archived_at = ${archived ? NOW : "NULL"}, updated_at = ${NOW} WHERE recipe_key = ?`,
    params: [recipeKey],
  }];
}

export function renameItem(oldName: string, region: string, newName: string): Statement[] {
  return [{
    sql: `UPDATE items SET name = ?, normalized_name = ?, updated_at = ${NOW} WHERE normalized_name = ? AND game_region = ?`,
    params: [newName, normalizeName(newName), normalizeName(oldName), region],
  }];
}

// ---- Reads: database rows back into the input model (snapshot for diffs, CSV export) ----

export const ITEMS_SQL = `
  SELECT i.id, i.name, i.game_region, i.verification_status, c.name AS category, i.game_version,
         i.last_verified_at, i.description, s.name AS source_name, s.source_type, s.url AS source_url,
         i.archived_at
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN data_sources s ON s.id = i.source_id
  ORDER BY i.name COLLATE NOCASE`;

export interface ItemRowDb extends ItemInput {
  id: number;
  archived_at: string | null;
}

export const RECIPES_SQL = `
  SELECT r.id, r.recipe_key, o.name AS output_item, r.output_quantity, r.game_region, r.verification_status,
         p.name AS profession, r.required_level, r.craft_fee, r.game_version, r.last_verified_at, r.notes,
         s.name AS source_name, s.source_type, s.url AS source_url, r.archived_at, r.output_item_id,
         (SELECT json_group_array(json_object('item', x.name, 'quantity', x.quantity)) FROM (
            SELECT ii.name, ri.quantity FROM recipe_ingredients ri JOIN items ii ON ii.id = ri.ingredient_item_id
             WHERE ri.recipe_id = r.id ORDER BY ri.id) x) AS ingredients_json
  FROM recipes r
  JOIN items o ON o.id = r.output_item_id
  LEFT JOIN professions p ON p.id = r.profession_id
  LEFT JOIN data_sources s ON s.id = r.source_id
  ORDER BY o.name COLLATE NOCASE, r.recipe_key`;

export interface RecipeRowDb extends RecipeInput {
  id: number;
  output_item_id: number;
  archived_at: string | null;
}

export const toRecipe = ({ ingredients_json, ...r }: Omit<RecipeRowDb, "ingredients"> & { ingredients_json: string }): RecipeRowDb => ({
  ...r,
  ingredients: JSON.parse(ingredients_json) as RecipeInput["ingredients"],
});
