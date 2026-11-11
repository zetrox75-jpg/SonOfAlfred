import type { Recipe } from "../models";

// Business rules from README section 5. Pure functions, no UI or DB access.
// Money values are integers in the smallest currency unit. Products of money and
// rates go through BigInt so large prices cannot overflow Number precision.
// Commission is in basis points (500 = 5%): the rate is user-configured, never assumed.

const BPS = 10_000n;

function assertInt(name: string, v: number, min = 0): void {
  if (!Number.isSafeInteger(v) || v < min) throw new RangeError(`${name} must be an integer >= ${min}, got ${v}`);
}
function assertBps(bps: number): void {
  assertInt("commissionBps", bps);
  if (bps >= 10_000) throw new RangeError(`commissionBps must be < 10000, got ${bps}`);
}

/** 5.2 Batch production: runs = ceil(target / yield). */
export function planBatches(targetQuantity: number, outputPerRun: number) {
  assertInt("targetQuantity", targetQuantity, 1);
  assertInt("outputPerRun", outputPerRun, 1);
  const runs = Math.ceil(targetQuantity / outputPerRun);
  const produced = runs * outputPerRun;
  return { runs, produced, surplus: produced - targetQuantity };
}

export type PriceLookup = (itemId: number) => number | undefined;

export interface CostLine {
  itemId: number;
  quantity: number;
  unitPrice: number | undefined;
  cost: number | undefined;
}

export type RecipeCost =
  | { status: "complete"; lines: CostLine[]; fee: number; total: number }
  | { status: "incomplete"; lines: CostLine[]; missingPriceItemIds: number[]; feeUnknown: boolean };

/**
 * 5.1 Cost of `runs` executions of a recipe from direct ingredient prices.
 * A missing price or an unknown fee (null) makes the result incomplete: never zero.
 */
export function recipeCost(
  recipe: Pick<Recipe, "ingredients" | "craft_fee">,
  runs: number,
  priceOf: PriceLookup,
): RecipeCost {
  assertInt("runs", runs, 1);
  const lines: CostLine[] = recipe.ingredients.map(({ ingredient_item_id, quantity }) => {
    const q = quantity * runs;
    const unitPrice = priceOf(ingredient_item_id);
    return { itemId: ingredient_item_id, quantity: q, unitPrice, cost: unitPrice === undefined ? undefined : q * unitPrice };
  });
  const missingPriceItemIds = lines.filter((l) => l.cost === undefined).map((l) => l.itemId);
  const feeUnknown = recipe.craft_fee === null;
  if (missingPriceItemIds.length || feeUnknown) return { status: "incomplete", lines, missingPriceItemIds, feeUnknown };

  const fee = recipe.craft_fee! * runs;
  const total = lines.reduce((s, l) => s + l.cost!, fee);
  assertInt("total cost", total);
  return { status: "complete", lines, fee, total };
}

/** Unit cost may be fractional; use for display/ranking, keep totals as integers. */
export const unitCost = (total: number, produced: number) => total / produced;

/**
 * 5.3 Net revenue = P x Q x (1 - t), rounded DOWN to the smallest unit.
 * Rounding down is a conservative assumption: the real in-game rounding is unknown.
 */
export function netRevenue(unitPrice: number, quantity: number, commissionBps: number): number {
  assertInt("unitPrice", unitPrice);
  assertInt("quantity", quantity);
  assertBps(commissionBps);
  return Number((BigInt(unitPrice) * BigInt(quantity) * (BPS - BigInt(commissionBps))) / BPS);
}

/** Fixed fees (listing fee etc.) are modelled separately from the commission rate. */
export const netProfit = (revenue: number, totalCost: number, fixedFees = 0) => revenue - fixedFees - totalCost;

/** 5.4 ROI % = profit / cost x 100. null = not computable (zero cost). */
export const roiPercent = (profit: number, totalCost: number) => (totalCost === 0 ? null : (profit / totalCost) * 100);

/** 5.4 Net margin % = profit / net revenue x 100. null = not computable (zero revenue). */
export const marginPercent = (profit: number, revenue: number) => (revenue === 0 ? null : (profit / revenue) * 100);

/**
 * 5.5 Smallest integer unit price P such that netRevenue(P, Q, t) - fixedFees >= totalCost.
 * Because netRevenue floors, this is ceil((cost + fees) x 10000 / (Q x (10000 - bps))).
 * The result is a floor: the user must still pick a price the market accepts.
 */
export function minimumSalePrice(totalCost: number, quantity: number, commissionBps: number, fixedFees = 0): number {
  assertInt("totalCost", totalCost);
  assertInt("quantity", quantity, 1);
  assertInt("fixedFees", fixedFees);
  assertBps(commissionBps);
  const need = BigInt(totalCost + fixedFees) * BPS;
  const per = BigInt(quantity) * (BPS - BigInt(commissionBps));
  return Number((need + per - 1n) / per);
}

/**
 * Real result of selling part or all of a crafted batch. The cost share of the units sold is
 * rounded UP (conservative). An unknown cost (null) gives the revenue only: profit stays null.
 */
export function realizedProfit(totalCost: number | null, produced: number, soldQuantity: number, soldUnitPrice: number, commissionBps: number) {
  assertInt("produced", produced, 1);
  assertInt("soldQuantity", soldQuantity, 1);
  if (soldQuantity > produced) throw new RangeError(`soldQuantity must be <= ${produced}, got ${soldQuantity}`);
  const revenue = netRevenue(soldUnitPrice, soldQuantity, commissionBps);
  const cost = totalCost === null ? null : Math.ceil((totalCost * soldQuantity) / produced);
  return { revenue, cost, profit: cost === null ? null : netProfit(revenue, cost) };
}

/** A price older than maxAgeHours is stale and must not back a "reliable" result. */
export function isStale(observedAt: string, now: Date, maxAgeHours: number): boolean {
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > maxAgeHours * 3_600_000;
}
