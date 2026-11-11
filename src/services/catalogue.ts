import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "./db";
import { itemKey, type CatalogueSnapshot } from "../domain/validation/catalogue";
import { ITEMS_SQL, RECIPES_SQL, toRecipe, type ItemRowDb, type RecipeRowDb, type Statement } from "./catalogueStatements";

/** All-or-nothing write (Rust command `write_transaction`). Returns rows affected per statement.
 * getDb() first: the connection is opened on first use (no preload). */
export const writeTransaction = async (statements: Statement[]) => {
  await getDb();
  return invoke<number[]>("write_transaction", { statements });
};

export const loadItems = async () => (await getDb()).select<ItemRowDb[]>(ITEMS_SQL);

export const loadRecipes = async () =>
  (await (await getDb()).select<Parameters<typeof toRecipe>[0][]>(RECIPES_SQL)).map(toRecipe);

export async function loadSnapshot(): Promise<CatalogueSnapshot & { itemRows: ItemRowDb[]; recipeRows: RecipeRowDb[] }> {
  const [itemRows, recipeRows] = await Promise.all([loadItems(), loadRecipes()]);
  return {
    itemRows,
    recipeRows,
    items: new Map(itemRows.map((i) => [itemKey(i.name, i.game_region), i])),
    recipes: new Map(recipeRows.map((r) => [r.recipe_key, r])),
  };
}

export const loadNames = async (table: "categories" | "professions" | "data_sources") =>
  (await (await getDb()).select<{ name: string }[]>(`SELECT name FROM ${table} ORDER BY name COLLATE NOCASE`)).map((r) => r.name);

const EXPORT_TABLES = [
  "data_sources", "categories", "professions", "items", "recipes", "recipe_ingredients",
  "markets", "market_prices", "inventory", "settings", "craft_log",
] as const;

/** Full JSON dump of every table, with the schema version it came from. */
export async function exportAllJson(): Promise<string> {
  const db = await getDb();
  const [{ version }] = await db.select<{ version: number }[]>("SELECT MAX(version) AS version FROM _sqlx_migrations");
  const tables: Record<string, unknown[]> = {};
  for (const t of EXPORT_TABLES) tables[t] = await db.select<unknown[]>(`SELECT * FROM ${t} ORDER BY rowid`);
  return JSON.stringify({ app: "aion2-craft-profit-manager", schema_version: version, exported_at: new Date().toISOString(), tables }, null, 2);
}

/**
 * Asks the user where to save, then writes the file. Returns the path, or null if cancelled.
 * (WebView downloads are not used: WebView2 silently blocks repeated downloads.)
 */
export async function saveTextFile(defaultName: string, text: string): Promise<string | null> {
  const ext = defaultName.split(".").pop()!;
  const path = await save({ defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (!path) return null;
  await writeTextFile(path, text);
  return path;
}

export interface SourceRow {
  name: string;
  source_type: string;
  url: string | null;
}
export const loadSources = async () =>
  (await getDb()).select<SourceRow[]>("SELECT name, source_type, url FROM data_sources ORDER BY name COLLATE NOCASE");
