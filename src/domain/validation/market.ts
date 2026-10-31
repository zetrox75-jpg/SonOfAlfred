import { z } from "zod";
import { GameRegion, PriceKind } from "../models";
import type { CsvTable } from "../../services/csv";
import { checkHeaders, itemKey, optDate, optInt, optText, parseRows, reqInt, text, upper, lower, type ImportError } from "./catalogue";

// Price and inventory CSV imports. Items are matched by (name, region) and markets by name:
// nothing is created implicitly, a typo is an error.

export const PriceCsvRow = z.object({
  item_name: text.min(1, "is required"),
  game_region: upper(GameRegion),
  market: text.min(1, "is required (prices are never stored without a market)"),
  price_kind: lower(PriceKind),
  unit_price: reqInt(0),
  observed_at: optDate.refine((v) => v !== null, "is required (a price without a date cannot be judged fresh)"),
  quantity_observed: optInt(0),
  currency: optText,
  source_name: text.min(1, "is required"),
  source_url: optText,
  comment: optText,
});
export type PriceCsvInput = z.output<typeof PriceCsvRow>;
export const PRICE_COLUMNS = Object.keys(PriceCsvRow.shape);

export const InventoryCsvRow = z.object({
  item_name: text.min(1, "is required"),
  game_region: upper(GameRegion),
  quantity: reqInt(0),
});
export type InventoryCsvInput = z.output<typeof InventoryCsvRow>;
export const INVENTORY_COLUMNS = Object.keys(InventoryCsvRow.shape);

/** Errors in file order (schema errors and lookup errors are found in separate passes). */
const byLine = (e: ImportError[]) => [...e].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

export interface MarketLookup {
  /** itemKey(name, region) -> id */
  items: Map<string, number>;
  /** lower-cased market name -> id */
  markets: Map<string, number>;
  /** source name -> source_type, for existing sources */
  sources: Map<string, string>;
}

export type ResolvedPriceRow = PriceCsvInput & { line: number; itemId: number; marketId: number };

export function parsePricesCsv(t: CsvTable, look: MarketLookup): { rows: ResolvedPriceRow[]; errors: ImportError[] } {
  const errors = checkHeaders(t, PRICE_COLUMNS, ["item_name", "game_region", "market", "price_kind", "unit_price", "observed_at", "source_name"]);
  if (errors.some((e) => e.line === 1)) return { rows: [], errors };
  const rows: ResolvedPriceRow[] = [];
  for (const { line, value } of parseRows(t, PriceCsvRow, errors)) {
    const itemId = look.items.get(itemKey(value.item_name, value.game_region));
    const marketId = look.markets.get(value.market.toLowerCase());
    const type = look.sources.get(value.source_name);
    if (itemId === undefined) errors.push({ line, message: `Unknown item "${value.item_name}" in region ${value.game_region}` });
    if (marketId === undefined) errors.push({ line, message: `Unknown market "${value.market}". Create it in Settings first.` });
    // CSV prices rank as "import" in the fallback order; a source of another type would change that.
    if (type !== undefined && type !== "import") errors.push({ line, message: `Source "${value.source_name}" exists with type "${type}"; CSV prices need a source of type "import"` });
    if (itemId !== undefined && marketId !== undefined) rows.push({ ...value, line, itemId, marketId });
  }
  return { rows, errors: byLine(errors) };
}

export type ResolvedInventoryRow = InventoryCsvInput & { line: number; itemId: number };

export function parseInventoryCsv(t: CsvTable, look: Pick<MarketLookup, "items">): { rows: ResolvedInventoryRow[]; errors: ImportError[] } {
  const errors = checkHeaders(t, INVENTORY_COLUMNS, INVENTORY_COLUMNS);
  if (errors.some((e) => e.line === 1)) return { rows: [], errors };
  const rows: ResolvedInventoryRow[] = [];
  const seen = new Map<number, number>();
  for (const { line, value } of parseRows(t, InventoryCsvRow, errors)) {
    const itemId = look.items.get(itemKey(value.item_name, value.game_region));
    if (itemId === undefined) errors.push({ line, message: `Unknown item "${value.item_name}" in region ${value.game_region}` });
    else if (seen.has(itemId)) errors.push({ line, message: `"${value.item_name}" already listed on line ${seen.get(itemId)}` });
    else {
      seen.set(itemId, line);
      rows.push({ ...value, line, itemId });
    }
  }
  return { rows, errors: byLine(errors) };
}
