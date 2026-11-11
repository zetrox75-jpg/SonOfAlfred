import { buildCraftPlan, PlanError, profitability, type PlanInput, type PricePoint, type Valuation } from "./craftPlan";

// Profit scanner (README 4.6): every craftable item through the crafting engine.
// A result is only "reliable" when complete, fresh and built on reliable Global recipes;
// incomplete results are returned with their reasons and never ranked as opportunities.

export type ScanStatus = "reliable" | "unreliable" | "incomplete";

export interface ScanRow {
  itemId: number;
  status: ScanStatus;
  /** Why the result is not reliable or not complete. */
  issues: string[];
  quantity: number;
  totalCost: number | null;
  unitCost: number | null;
  sellPrice: PricePoint | undefined;
  commission: number | null;
  profit: number | null;
  marginPercent: number | null;
  roiPercent: number | null;
  /** Oldest price observation the result depends on (freshness). */
  oldestPriceAt: string | null;
  recipeReliable: boolean;
  /** Distinct items the plan cannot cover: still to buy, or to craft with no usable recipe. 0 = craftable now. Null when there is no plan. */
  toAcquire: number | null;
}

export interface ScanInput extends Omit<PlanInput, "targetItemId" | "quantity"> {
  targets: number[];
  quantity: number;
  sellPrice: (itemId: number) => PricePoint | undefined;
  commissionBps: number | null;
  valuation: Valuation;
}

export function scanProfits(input: ScanInput): ScanRow[] {
  return input.targets.map((itemId): ScanRow => {
    const base = { itemId, quantity: input.quantity, sellPrice: input.sellPrice(itemId) };
    const empty = { totalCost: null, unitCost: null, commission: null, profit: null, marginPercent: null, roiPercent: null, oldestPriceAt: null, recipeReliable: false, toAcquire: null };
    let plan;
    try {
      plan = buildCraftPlan({ ...input, targetItemId: itemId, quantity: input.quantity });
    } catch (e) {
      if (e instanceof PlanError) return { ...base, ...empty, status: "incomplete", issues: [e.message] };
      throw e;
    }
    const totalCost = input.valuation === "cash" ? plan.totals.cash : plan.totals.economic;
    const p = profitability({ totalCost, sellPrice: base.sellPrice, quantitySold: input.quantity, commissionBps: input.commissionBps, fixedFees: 0 });

    const issues: string[] = [];
    if (plan.missingPrices.length) issues.push(`${plan.missingPrices.length} missing buy price(s)`);
    if (plan.missingRecipes.length) issues.push("component without usable recipe");
    if (plan.unknownFeeRecipes.length) issues.push("unknown craft fee");
    if (input.valuation === "economic" && plan.missingStockPrices.length) issues.push("owned stock without price");
    if (!base.sellPrice) issues.push("no sell price");
    if (input.commissionBps === null) issues.push("commission not set");
    const incomplete = issues.length > 0 || p.status === "incomplete";
    if (plan.stalePrices.length) issues.push(`${plan.stalePrices.length} stale buy price(s)`);
    if (base.sellPrice?.stale) issues.push("stale sell price");
    if (plan.unreliableRecipes.length) issues.push("recipe not reliable for Global");

    const used = [...plan.lines.filter((l) => l.toBuy > 0 && l.buyPrice).map((l) => l.buyPrice!.observedAt), ...(base.sellPrice ? [base.sellPrice.observedAt] : [])];
    const done = p.status === "complete" ? p : null;
    return {
      ...base,
      status: incomplete ? "incomplete" : issues.length ? "unreliable" : "reliable",
      issues,
      totalCost,
      unitCost: totalCost === null ? null : totalCost / input.quantity,
      commission: done?.commission ?? null,
      profit: done?.profit ?? null,
      marginPercent: done?.marginPercent ?? null,
      roiPercent: done?.roiPercent ?? null,
      oldestPriceAt: used.length ? used.reduce((a, b) => (a < b ? a : b)) : null,
      recipeReliable: plan.unreliableRecipes.length === 0,
      // ponytail: follows the cheapest plan, so an item it chose to buy counts as missing even if its
      // own materials are owned. Re-plan with craft forced on owned-material items if that matters.
      toAcquire: plan.lines.filter((l) => l.toBuy > 0).length + plan.missingRecipes.length,
    };
  });
}
