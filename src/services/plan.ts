import { getDb } from "./db";
import type { PlanRecipe } from "../domain/calculations/craftPlan";
import {
  CRAFT_LOG_SQL,
  type CraftLogRow,
  INVENTORY_SQL,
  LATEST_PRICES_SQL,
  MARKETS_SQL,
  PLAN_ITEMS_SQL,
  PLAN_RECIPES_SQL,
  SETTINGS_SQL,
  toPlanRecipe,
  resolvePrices,
  toSettings,
  type MarketRow,
  type PlanRecipeRow,
  type PriceBook,
  type PriceRow,
} from "./planQueries";

export interface PlanItem {
  id: number;
  name: string;
  game_region: string;
  verification_status: string;
  category: string | null;
}

export async function loadWorkspace() {
  const db = await getDb();
  const [items, recipeRows, inventoryRows, settingsRows, markets, craftLog] = await Promise.all([
    db.select<PlanItem[]>(PLAN_ITEMS_SQL),
    db.select<PlanRecipeRow[]>(PLAN_RECIPES_SQL),
    db.select<{ item_id: number; quantity: number }[]>(INVENTORY_SQL),
    db.select<{ key: string; value: string }[]>(SETTINGS_SQL),
    db.select<MarketRow[]>(MARKETS_SQL),
    db.select<CraftLogRow[]>(CRAFT_LOG_SQL),
  ]);
  const settings = toSettings(settingsRows);
  const market = markets.find((m) => m.id === settings.activeMarketId) ?? null;
  const priceRows = market ? await db.select<PriceRow[]>(LATEST_PRICES_SQL, [market.id]) : [];
  const prices: PriceBook = resolvePrices(priceRows, { buy: settings.buyPriceKind, sell: settings.sellPriceKind }, new Date(), settings.freshnessHours);
  const recipes = recipeRows.map(toPlanRecipe);
  const recipesByOutput = new Map<number, PlanRecipe[]>();
  for (const r of recipes) recipesByOutput.set(r.outputItemId, [...(recipesByOutput.get(r.outputItemId) ?? []), r]);
  return {
    items: new Map(items.map((i) => [i.id, i])),
    recipes,
    recipesByOutput,
    professionByRecipe: new Map(recipeRows.map((r) => [r.id, r.profession])),
    inventory: new Map(inventoryRows.map((r) => [r.item_id, r.quantity])),
    craftLog,
    settings,
    markets,
    market,
    /** Latest observation per item/kind/source in the active market (Market page). */
    priceRows,
    prices,
  };
}

export type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
