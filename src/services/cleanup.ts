import type { Statement } from "./catalogueStatements";

// Removes demo/test data: only records whose source has source_type 'demo', plus what
// exists only because of them (their prices and inventory rows, and categories /
// professions that nothing else uses afterwards). A demo item still used by a non-demo
// recipe is kept and reported. FK RESTRICT stays the last line of defence: any
// unexpected reference makes the whole transaction fail, so nothing is half-deleted.

type Select = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface DemoCleanup {
  recipes: number;
  items: { id: number; name: string }[];
  /** Demo items kept because a non-demo recipe uses them. */
  blocked: { id: number; name: string }[];
  prices: number;
  inventory: number;
  statements: Statement[];
}

const list = (ids: number[]) => ids.map(() => "?").join(", ");
const ids = (rows: { id: number | null }[]) => rows.map((r) => r.id).filter((x): x is number => x !== null);

export async function planDemoCleanup(select: Select): Promise<DemoCleanup> {
  const recipeIds = ids(await select<{ id: number }>(
    "SELECT r.id FROM recipes r JOIN data_sources s ON s.id = r.source_id WHERE s.source_type = 'demo'"));

  const demoItems = await select<{ id: number; name: string; used: number }>(`
    SELECT i.id, i.name,
           EXISTS (SELECT 1 FROM recipes r LEFT JOIN data_sources s ON s.id = r.source_id
                   WHERE (s.source_type IS NULL OR s.source_type <> 'demo')
                     AND (r.output_item_id = i.id
                          OR EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ri.ingredient_item_id = i.id))) AS used
    FROM items i JOIN data_sources s ON s.id = i.source_id
    WHERE s.source_type = 'demo' ORDER BY i.name`);
  const items = demoItems.filter((i) => !i.used).map(({ id, name }) => ({ id, name }));
  const blocked = demoItems.filter((i) => i.used).map(({ id, name }) => ({ id, name }));
  const itemIds = items.map((i) => i.id);

  const count = async (table: string) =>
    itemIds.length ? (await select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE item_id IN (${list(itemIds)})`, itemIds))[0].n : 0;
  const prices = await count("market_prices");
  const inventory = await count("inventory");
  const categoryIds = itemIds.length
    ? ids(await select<{ id: number }>(`SELECT DISTINCT category_id AS id FROM items WHERE id IN (${list(itemIds)})`, itemIds))
    : [];
  const professionIds = recipeIds.length
    ? ids(await select<{ id: number }>(`SELECT DISTINCT profession_id AS id FROM recipes WHERE id IN (${list(recipeIds)})`, recipeIds))
    : [];

  const statements: Statement[] = [];
  if (recipeIds.length) statements.push({ sql: `DELETE FROM recipes WHERE id IN (${list(recipeIds)})`, params: recipeIds }); // ingredients cascade
  if (itemIds.length)
    statements.push(
      { sql: `DELETE FROM market_prices WHERE item_id IN (${list(itemIds)})`, params: itemIds },
      { sql: `DELETE FROM inventory WHERE item_id IN (${list(itemIds)})`, params: itemIds },
      { sql: `DELETE FROM items WHERE id IN (${list(itemIds)})`, params: itemIds },
    );
  if (categoryIds.length)
    statements.push({
      sql: `DELETE FROM categories WHERE id IN (${list(categoryIds)})
              AND NOT EXISTS (SELECT 1 FROM items WHERE category_id = categories.id)
              AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.parent_id = categories.id)`,
      params: categoryIds,
    });
  if (professionIds.length)
    statements.push({
      sql: `DELETE FROM professions WHERE id IN (${list(professionIds)}) AND NOT EXISTS (SELECT 1 FROM recipes WHERE profession_id = professions.id)`,
      params: professionIds,
    });
  statements.push({
    sql: `DELETE FROM data_sources WHERE source_type = 'demo'
            AND NOT EXISTS (SELECT 1 FROM items WHERE source_id = data_sources.id)
            AND NOT EXISTS (SELECT 1 FROM recipes WHERE source_id = data_sources.id)
            AND NOT EXISTS (SELECT 1 FROM market_prices WHERE source_id = data_sources.id)`,
    params: [],
  });
  return { recipes: recipeIds.length, items, blocked, prices, inventory, statements };
}
