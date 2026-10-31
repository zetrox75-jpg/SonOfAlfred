import Database from "@tauri-apps/plugin-sql";

/** Must match DB_URL in src-tauri/src/lib.rs, where migrations are registered. */
export const DB_URL = "sqlite:aion2.db";

let db: Promise<Database> | undefined;
export const getDb = () => (db ??= Database.load(DB_URL));

export interface DashboardStats {
  recipes: number;
  verifiedGlobalRecipes: number;
  nonGlobalRecipes: number;
  pricedItems: number;
  priceObservations: number;
  lastPriceAt: string | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [r] = await (await getDb()).select<DashboardStats[]>(`
    SELECT
      (SELECT COUNT(*) FROM recipes WHERE archived_at IS NULL) AS recipes,
      (SELECT COUNT(*) FROM recipes WHERE archived_at IS NULL
         AND verification_status = 'verified' AND game_region = 'GLOBAL') AS verifiedGlobalRecipes,
      (SELECT COUNT(*) FROM recipes WHERE archived_at IS NULL AND game_region <> 'GLOBAL') AS nonGlobalRecipes,
      (SELECT COUNT(DISTINCT item_id) FROM market_prices) AS pricedItems,
      (SELECT COUNT(*) FROM market_prices) AS priceObservations,
      (SELECT MAX(observed_at) FROM market_prices) AS lastPriceAt`);
  return r;
}

export interface Diagnostics {
  migrations: { version: number; description: string; installed_on: string; success: number }[];
  foreignKeys: boolean;
  tables: string[];
}

export async function getDiagnostics(): Promise<Diagnostics> {
  const d = await getDb();
  const [migrations, [fk], tables] = await Promise.all([
    d.select<Diagnostics["migrations"]>(
      "SELECT version, description, installed_on, success FROM _sqlx_migrations ORDER BY version",
    ),
    d.select<{ foreign_keys: number }[]>("PRAGMA foreign_keys"),
    d.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name <> '_sqlx_migrations' AND name NOT LIKE 'sqlite%' ORDER BY name",
    ),
  ]);
  return { migrations, foreignKeys: fk?.foreign_keys === 1, tables: tables.map((t) => t.name) };
}
