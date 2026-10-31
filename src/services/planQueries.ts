import type { PlanRecipe, PricePoint } from "../domain/calculations/craftPlan";
import { isReliable, PriceKind } from "../domain/models";
import { isStale } from "../domain/calculations/profit";
import type { Statement } from "./catalogueStatements";

// SQL for the crafting workspace (plan, prices, inventory, settings). Pure, so tests
// run it on in-memory SQLite. Prices are only ever read for ONE market at a time.

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
export const MANUAL_SOURCE = "Manual entry";

export const PLAN_ITEMS_SQL = `
  SELECT i.id, i.name, i.game_region, i.verification_status, c.name AS category
  FROM items i LEFT JOIN categories c ON c.id = i.category_id
  WHERE i.archived_at IS NULL ORDER BY i.name COLLATE NOCASE`;

export const PLAN_RECIPES_SQL = `
  SELECT r.id, r.recipe_key, r.output_item_id, r.output_quantity, r.craft_fee, r.verification_status, r.game_region,
         (SELECT name FROM professions WHERE id = r.profession_id) AS profession,
         (SELECT json_group_array(json_object('itemId', x.ingredient_item_id, 'quantity', x.quantity)) FROM (
            SELECT ingredient_item_id, quantity FROM recipe_ingredients WHERE recipe_id = r.id ORDER BY id) x) AS ingredients_json
  FROM recipes r WHERE r.archived_at IS NULL ORDER BY r.id`;

export interface PlanRecipeRow {
  id: number;
  recipe_key: string;
  output_item_id: number;
  output_quantity: number;
  craft_fee: number | null;
  verification_status: string;
  game_region: string;
  profession: string | null;
  ingredients_json: string;
}

export const toPlanRecipe = (r: PlanRecipeRow): PlanRecipe => ({
  id: r.id,
  key: r.recipe_key,
  outputItemId: r.output_item_id,
  outputQuantity: r.output_quantity,
  craftFee: r.craft_fee,
  reliable: isReliable(r),
  verified: isReliable(r, false),
  ingredients: JSON.parse(r.ingredients_json),
});

// ---- Prices (README 16.4-16.6) ----

/** What an observed number is. A listing is never a completed sale. */
export const PRICE_KINDS = PriceKind.options;
export const PRICE_KIND_LABEL: Record<PriceKind, string> = {
  lowest_listing: "lowest active listing",
  typical_listing: "typical listing",
  median_listing: "median listing",
  sale_price: "completed sale",
  estimate: "your estimate",
  unknown: "unknown kind",
};

/** Where a price comes from, in fallback order (README 16.6). */
export type PriceTier = "provider" | "manual" | "import";
const TIER_RANK: Record<PriceTier, number> = { provider: 0, manual: 1, import: 2 };
export const tierOf = (sourceType: string): PriceTier =>
  sourceType === "user" ? "manual" : sourceType === "import" || sourceType === "demo" ? "import" : "provider";

/** Latest observation per (item, kind, source, override flag) in ONE market. */
export const LATEST_PRICES_SQL = `
  SELECT item_id, price_kind, unit_price, observed_at, retrieved_at, quantity_observed, is_override, source, source_type
  FROM (
    SELECT mp.item_id, mp.price_kind, mp.unit_price, mp.observed_at, mp.retrieved_at, mp.quantity_observed, mp.is_override,
           s.name AS source, s.source_type,
           ROW_NUMBER() OVER (PARTITION BY mp.item_id, mp.price_kind, mp.source_id, mp.is_override
                              ORDER BY mp.observed_at DESC, mp.id DESC) AS rn
    FROM market_prices mp JOIN data_sources s ON s.id = mp.source_id
    WHERE mp.market_id = ?)
  WHERE rn = 1`;

export interface PriceRow {
  item_id: number;
  price_kind: PriceKind;
  unit_price: number;
  observed_at: string;
  retrieved_at: string;
  quantity_observed: number | null;
  is_override: number;
  source: string;
  source_type: string;
}

export interface ResolvedPrice extends PricePoint {
  /** When the app stored it (README 16.4); observedAt is when the source saw it. */
  retrievedAt: string;
  kind: PriceKind;
  tier: PriceTier;
  override: boolean;
}

export interface PriceBook {
  buy: Map<number, ResolvedPrice>;
  sell: Map<number, ResolvedPrice>;
}

/**
 * One price per item for one kind: a manual override wins; otherwise fresh before stale,
 * then provider > manual > import, then the newest. Other kinds are never substituted.
 */
export function resolveKind(rows: PriceRow[], kind: PriceKind, now: Date, freshnessHours: number): Map<number, ResolvedPrice> {
  const best = new Map<number, ResolvedPrice>();
  for (const r of rows) {
    if (r.price_kind !== kind) continue;
    const c: ResolvedPrice = {
      unitPrice: r.unit_price, observedAt: r.observed_at, retrievedAt: r.retrieved_at, source: r.source, kind,
      stale: isStale(r.observed_at, now, freshnessHours), tier: tierOf(r.source_type), override: r.is_override === 1,
    };
    const b = best.get(r.item_id);
    const better = !b ||
      (c.override !== b.override ? c.override
      : c.stale !== b.stale ? !c.stale
      : c.tier !== b.tier ? TIER_RANK[c.tier] < TIER_RANK[b.tier]
      : c.observedAt > b.observedAt);
    if (better) best.set(r.item_id, c);
  }
  return best;
}

export const resolvePrices = (rows: PriceRow[], kinds: { buy: PriceKind; sell: PriceKind }, now: Date, freshnessHours: number): PriceBook => ({
  buy: resolveKind(rows, kinds.buy, now, freshnessHours),
  sell: resolveKind(rows, kinds.sell, now, freshnessHours),
});

/** Appends a manual observation: history is never overwritten. */
export function addManualPrice(
  itemId: number,
  marketId: number,
  kind: PriceKind,
  unitPrice: number,
  opts: { override?: boolean; quantity?: number | null; comment?: string | null; observedAt?: string } = {},
): Statement[] {
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new RangeError("Price must be a whole number >= 0");
  if (opts.observedAt !== undefined && Number.isNaN(Date.parse(opts.observedAt))) throw new RangeError("Invalid observation date");
  return [
    {
      sql: "INSERT INTO data_sources (name, source_type, terms_or_notes) VALUES (?, 'user', 'Prices typed in the app') ON CONFLICT (name) DO NOTHING",
      params: [MANUAL_SOURCE],
    },
    {
      sql: `INSERT INTO market_prices (item_id, market_id, price_kind, unit_price, quantity_observed, source_id, is_override, observed_at, comment)
            VALUES (?, ?, ?, ?, ?, (SELECT id FROM data_sources WHERE name = ?), ?, COALESCE(?, ${NOW}), ?)`,
      params: [itemId, marketId, kind, unitPrice, opts.quantity ?? null, MANUAL_SOURCE, opts.override ? 1 : 0,
        opts.observedAt ? new Date(opts.observedAt).toISOString() : null, opts.comment ?? null],
    },
  ];
}

export const INVENTORY_SQL = "SELECT item_id, quantity, updated_at FROM inventory";

/** Sets the owned quantity; 0 removes the row. */
export function setInventory(itemId: number, quantity: number): Statement[] {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError("Quantity must be a whole number >= 0");
  return quantity === 0
    ? [{ sql: "DELETE FROM inventory WHERE item_id = ?", params: [itemId] }]
    : [{
        sql: `INSERT INTO inventory (item_id, quantity) VALUES (?, ?)
              ON CONFLICT (item_id) DO UPDATE SET quantity = excluded.quantity, updated_at = ${NOW}`,
        params: [itemId, quantity],
      }];
}

export const MARKETS_SQL = "SELECT id, name, region, server, faction, provider_server FROM markets ORDER BY name COLLATE NOCASE";
export interface MarketRow {
  id: number;
  name: string;
  region: string | null;
  server: string | null;
  faction: string | null;
  /** e.g. 'aion2.exchange:11304' when automatic prices come from that server. */
  provider_server: string | null;
}

export function addMarket(m: { name: string; region: string; server: string; faction: string }): Statement[] {
  if (!m.name.trim()) throw new RangeError("Market name is required");
  const v = (s: string) => s.trim() || null;
  return [{ sql: "INSERT INTO markets (name, region, server, faction) VALUES (?, ?, ?, ?)", params: [m.name.trim(), v(m.region), v(m.server), v(m.faction)] }];
}

// ---- Settings (key/value) ----

export interface AppSettings {
  currencyLabel: string;
  /** null = not configured: profit stays incomplete until the user sets it (even to 0). */
  commissionBps: number | null;
  commissionSource: string;
  freshnessHours: number;
  activeMarketId: number | null;
  /** Which observed kind values a purchase / a sale (README 16.5 "price method"). */
  buyPriceKind: PriceKind;
  sellPriceKind: PriceKind;
}
export const DEFAULT_FRESHNESS_HOURS = 24;

export const SETTINGS_SQL = "SELECT key, value FROM settings";

export function toSettings(rows: { key: string; value: string }[]): AppSettings {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const kind = (v: string | undefined) => (PRICE_KINDS as readonly string[]).includes(v ?? "") ? (v as PriceKind) : null;
  const int = (k: string) => (m.has(k) && /^\d+$/.test(m.get(k)!) ? Number(m.get(k)) : null);
  return {
    currencyLabel: m.get("currency_label") ?? "",
    commissionBps: int("commission_bps"),
    commissionSource: m.get("commission_source") ?? "",
    freshnessHours: int("freshness_hours") ?? DEFAULT_FRESHNESS_HOURS,
    activeMarketId: int("active_market_id"),
    buyPriceKind: kind(m.get("buy_price_kind")) ?? "lowest_listing",
    sellPriceKind: kind(m.get("sell_price_kind")) ?? "lowest_listing",
  };
}

export function saveSettings(s: Partial<AppSettings>): Statement[] {
  const pairs: [string, string | number | null][] = [];
  if (s.currencyLabel !== undefined) pairs.push(["currency_label", s.currencyLabel.trim()]);
  if (s.commissionBps !== undefined) pairs.push(["commission_bps", s.commissionBps]);
  if (s.commissionSource !== undefined) pairs.push(["commission_source", s.commissionSource.trim()]);
  if (s.freshnessHours !== undefined) pairs.push(["freshness_hours", s.freshnessHours]);
  if (s.activeMarketId !== undefined) pairs.push(["active_market_id", s.activeMarketId]);
  if (s.buyPriceKind !== undefined) pairs.push(["buy_price_kind", s.buyPriceKind]);
  if (s.sellPriceKind !== undefined) pairs.push(["sell_price_kind", s.sellPriceKind]);
  return pairs.map(([k, v]) =>
    v === null
      ? { sql: "DELETE FROM settings WHERE key = ?", params: [k] }
      : { sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", params: [k, String(v)] },
  );
}

// ---- History (README 4.9) ----

export const HISTORY_SQL = `
  SELECT mp.id, mp.price_kind, mp.unit_price, mp.observed_at, mp.quantity_observed, mp.is_override, mp.comment,
         s.name AS source, s.source_type
  FROM market_prices mp JOIN data_sources s ON s.id = mp.source_id
  WHERE mp.item_id = ? AND mp.market_id = ?
  ORDER BY mp.observed_at, mp.id`;

export interface HistoryRow extends Omit<PriceRow, "item_id"> {
  id: number;
  comment: string | null;
}

/** Period covered and gaps longer than `gapHours` between consecutive observations. */
export function historySummary(rows: { observed_at: string }[], gapHours: number) {
  const times = rows.map((r) => Date.parse(r.observed_at)).sort((a, b) => a - b);
  const gaps: { from: string; to: string; hours: number }[] = [];
  for (let i = 1; i < times.length; i++) {
    const hours = (times[i] - times[i - 1]) / 3_600_000;
    if (hours > gapHours) gaps.push({ from: new Date(times[i - 1]).toISOString(), to: new Date(times[i]).toISOString(), hours: Math.round(hours) });
  }
  return {
    count: times.length,
    from: times.length ? new Date(times[0]).toISOString() : null,
    to: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    gaps,
  };
}

// ---- Price CSV import: one source upsert per source, then one insert per row. ----
// INSERT OR IGNORE + the unique observation index make re-imports skip exact duplicates.

export function importPriceStatements(rows: {
  itemId: number; marketId: number; price_kind: string; unit_price: number; observed_at: string | null;
  quantity_observed: number | null; currency: string | null; source_name: string; source_url: string | null; comment: string | null;
}[]): { statements: Statement[]; firstRowStatement: number } {
  const sources = [...new Map(rows.map((r) => [r.source_name, r.source_url])).entries()].map(([name, url]) => ({
    sql: "INSERT INTO data_sources (name, url, source_type) VALUES (?, ?, 'import') ON CONFLICT (name) DO NOTHING",
    params: [name, url],
  }));
  const inserts = rows.map((r) => ({
    sql: `INSERT OR IGNORE INTO market_prices (item_id, market_id, price_kind, unit_price, quantity_observed, currency, source_id, observed_at, comment)
          VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM data_sources WHERE name = ?), ?, ?)`,
    params: [r.itemId, r.marketId, r.price_kind, r.unit_price, r.quantity_observed, r.currency, r.source_name, r.observed_at, r.comment],
  }));
  return { statements: [...sources, ...inserts], firstRowStatement: sources.length };
}
