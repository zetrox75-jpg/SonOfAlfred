import { netProfit, netRevenue, marginPercent, minimumSalePrice, roiPercent } from "./profit";

// Crafting plan engine (README 4.4, 4.5, 4.8, 5.2, 5.6). Pure: no UI, no DB.
//
// 1. Decide per item: buy, craft (which recipe) or missing, from per-unit costs.
// 2. Walk the decision graph consumers-first, summing demand per item, so a shared
//    ingredient is counted once, stock is deducted once, and batches round once.
// 3. Expand ingredients from the real number of runs.
// A missing price or unknown fee never becomes zero: totals turn null (incomplete).

export type Strategy = "auto" | "buy" | "craft";
export type Valuation = "cash" | "economic";

export interface PlanRecipe {
  id: number;
  key: string;
  outputItemId: number;
  outputQuantity: number;
  craftFee: number | null;
  /** GLOBAL and verified or community (isReliable) */
  reliable: boolean;
  /** GLOBAL and verified */
  verified: boolean;
  ingredients: { itemId: number; quantity: number }[];
}

/** The per-analysis "verified Global recipes only" filter: community recipes stop counting as reliable. */
export const verifiedOnly = (byOutput: Map<number, PlanRecipe[]>) =>
  new Map([...byOutput].map(([id, rs]) => [id, rs.map((r) => ({ ...r, reliable: r.verified }))]));

export interface PricePoint {
  unitPrice: number;
  observedAt: string;
  source: string;
  stale: boolean;
}

export interface PlanInput {
  targetItemId: number;
  quantity: number;
  recipesByOutput: Map<number, PlanRecipe[]>;
  buyPrice: (itemId: number) => PricePoint | undefined;
  inventory: Map<number, number>;
  useInventory: boolean;
  /** Per-item override; default "auto" (cheapest complete option). The target is always crafted. */
  strategies?: Map<number, Strategy>;
  /** Per-item forced recipe id; default: cheapest. */
  recipeChoice?: Map<number, number>;
}

export interface CraftOption {
  recipe: PlanRecipe;
  /** Per-unit cost, null when incomplete. */
  unitCost: number | null;
  /** This recipe would need an item that is already being crafted above it. */
  cycle: boolean;
}

export type Decision =
  | { kind: "buy" }
  | { kind: "craft"; recipe: PlanRecipe }
  | { kind: "missing"; reason: "no_price" | "no_recipe" | "cycle" };

export interface ItemEvaluation {
  itemId: number;
  buy: PricePoint | undefined;
  crafts: CraftOption[];
  decision: Decision;
  /** Per-unit cost under the decision, null when incomplete. */
  unitCost: number | null;
}

export interface PlanLine {
  itemId: number;
  decision: Decision;
  /** Total demand for this item across the whole plan. */
  required: number;
  fromStock: number;
  /** required - fromStock */
  needed: number;
  runs: number;
  produced: number;
  surplus: number;
  toBuy: number;
  buyPrice: PricePoint | undefined;
  /** toBuy x price; null if a price is missing. */
  purchaseCost: number | null;
  /** runs x fee; null if the fee is unknown. */
  fees: number | null;
  /** fromStock x price (economic valuation); null if a price is missing. */
  stockValue: number | null;
}

export interface TreeNode {
  itemId: number;
  /** Quantity this branch asks for (parent runs x ingredient quantity). */
  demand: number;
  decision: Decision;
  /** demand x per-unit cost: an allocation, since shared items are pooled. */
  branchCost: number | null;
  /** The item also appears in another branch: totals are pooled in the plan lines. */
  shared: boolean;
  children: TreeNode[];
}

export interface CraftPlan {
  lines: PlanLine[];
  tree: TreeNode;
  evaluations: Map<number, ItemEvaluation>;
  cycles: number[][];
  totals: {
    purchases: number | null;
    fees: number | null;
    stockValue: number | null;
    /** Money actually spent: owned stock is free. */
    cash: number | null;
    /** cash + market value of the stock used. */
    economic: number | null;
  };
  /** Items to buy whose price is missing (cash and economic cost incomplete). */
  missingPrices: number[];
  /** Owned items used from stock with no price (economic cost incomplete only). */
  missingStockPrices: number[];
  /** Items that must be crafted but have no usable recipe. */
  missingRecipes: number[];
  unknownFeeRecipes: number[];
  stalePrices: number[];
  unreliableRecipes: number[];
  /** Cash cost complete, purchase prices fresh, every recipe used verified Global. */
  reliable: boolean;
}

export class PlanError extends Error {}

function evaluateAll(input: PlanInput) {
  const memo = new Map<number, ItemEvaluation>();
  const cycles: number[][] = [];

  function evaluate(itemId: number, stack: number[]): ItemEvaluation {
    const hit = memo.get(itemId);
    if (hit) return hit;
    const root = stack.length === 0;
    const strategy = root ? "craft" : (input.strategies?.get(itemId) ?? "auto");
    const forced = input.recipeChoice?.get(itemId);
    const buy = input.buyPrice(itemId);
    const path = [...stack, itemId];

    const recipes = (input.recipesByOutput.get(itemId) ?? []).filter((r) => forced === undefined || r.id === forced);
    const crafts: CraftOption[] =
      strategy === "buy"
        ? []
        : recipes.map((recipe) => {
            const loop = recipe.ingredients.find((i) => path.includes(i.itemId));
            if (loop) {
              cycles.push([...path.slice(path.indexOf(loop.itemId)), loop.itemId]);
              return { recipe, unitCost: null, cycle: true };
            }
            let total: number | null = recipe.craftFee;
            for (const ing of recipe.ingredients) {
              const u = evaluate(ing.itemId, path).unitCost;
              total = total === null || u === null ? null : total + u * ing.quantity;
            }
            return { recipe, unitCost: total === null ? null : total / recipe.outputQuantity, cycle: false };
          });

    const usable = crafts.filter((c) => !c.cycle);
    const complete = usable.filter((c) => c.unitCost !== null).sort((a, b) => a.unitCost! - b.unitCost!);
    let decision: Decision;
    let unitCost: number | null = null;

    if (strategy === "buy") {
      decision = buy ? { kind: "buy" } : { kind: "missing", reason: "no_price" };
    } else if (strategy === "craft") {
      const best = complete[0] ?? usable[0];
      decision = best ? { kind: "craft", recipe: best.recipe } : { kind: "missing", reason: crafts.length ? "cycle" : "no_recipe" };
    } else if (buy && (!complete[0] || buy.unitPrice <= complete[0].unitCost!)) {
      decision = { kind: "buy" };
    } else if (usable[0]) {
      // Cheapest complete recipe, else show the first one with its gaps instead of hiding the tree.
      decision = { kind: "craft", recipe: (complete[0] ?? usable[0]).recipe };
    } else {
      decision = { kind: "missing", reason: "no_price" };
    }

    if (decision.kind === "buy") unitCost = buy!.unitPrice;
    if (decision.kind === "craft") unitCost = crafts.find((c) => c.recipe === (decision as { recipe: PlanRecipe }).recipe)!.unitCost;

    const ev = { itemId, buy, crafts, decision, unitCost };
    memo.set(itemId, ev);
    return ev;
  }

  evaluate(input.targetItemId, []);
  return { evaluations: memo, cycles };
}

const addOrNull = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

export function buildCraftPlan(input: PlanInput): CraftPlan {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new PlanError("Quantity must be a whole number >= 1");
  const { evaluations, cycles } = evaluateAll(input);
  const root = evaluations.get(input.targetItemId)!;
  if (root.decision.kind !== "craft")
    throw new PlanError(root.decision.kind === "missing" && root.decision.reason === "cycle"
      ? "Every recipe for this item loops back on itself (recipe cycle)."
      : "This item has no recipe: it cannot be crafted.");

  const childrenOf = (id: number) => {
    const d = evaluations.get(id)!.decision;
    return d.kind === "craft" ? d.recipe.ingredients : [];
  };

  // Consumers before producers: reverse DFS post-order over the (acyclic) decision graph.
  const order: number[] = [];
  const seen = new Set<number>();
  const visit = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of childrenOf(id)) visit(c.itemId);
    order.push(id);
  };
  visit(input.targetItemId);
  order.reverse();

  const required = new Map([[input.targetItemId, input.quantity]]);
  const consumers = new Map<number, number>();
  const lines: PlanLine[] = [];
  for (const itemId of order) {
    const ev = evaluations.get(itemId)!;
    const gross = required.get(itemId) ?? 0;
    const owned = itemId === input.targetItemId || !input.useInventory ? 0 : (input.inventory.get(itemId) ?? 0);
    const fromStock = Math.min(owned, gross);
    const needed = gross - fromStock;
    let runs = 0;
    let produced = 0;
    let fees: number | null = 0;
    if (ev.decision.kind === "craft") {
      const r = ev.decision.recipe;
      runs = Math.ceil(needed / r.outputQuantity);
      produced = runs * r.outputQuantity;
      fees = runs === 0 ? 0 : r.craftFee === null ? null : runs * r.craftFee;
      for (const ing of r.ingredients) {
        required.set(ing.itemId, (required.get(ing.itemId) ?? 0) + runs * ing.quantity);
        consumers.set(ing.itemId, (consumers.get(ing.itemId) ?? 0) + 1);
      }
    }
    // Forced craft with no usable recipe: neither crafted nor bought, so its cost stays unknown.
    const unresolved = ev.decision.kind === "missing" && ev.decision.reason !== "no_price";
    const toBuy = ev.decision.kind === "craft" || unresolved ? 0 : needed;
    const price = ev.buy;
    lines.push({
      itemId,
      decision: ev.decision,
      required: gross,
      fromStock,
      needed,
      runs,
      produced,
      surplus: produced - needed,
      toBuy,
      buyPrice: price,
      purchaseCost: unresolved && needed > 0 ? null : toBuy === 0 ? 0 : price ? toBuy * price.unitPrice : null,
      fees,
      stockValue: fromStock === 0 ? 0 : price ? fromStock * price.unitPrice : null,
    });
  }

  const sum = (f: (l: PlanLine) => number | null) => lines.reduce<number | null>((a, l) => addOrNull(a, f(l)), 0);
  const purchases = sum((l) => l.purchaseCost);
  const fees = sum((l) => l.fees);
  const stockValue = sum((l) => l.stockValue);
  const cash = addOrNull(purchases, fees);

  const usedRecipes = lines.flatMap((l) => (l.decision.kind === "craft" && l.runs > 0 ? [l.decision.recipe] : []));
  const bought = lines.filter((l) => l.toBuy > 0 && l.buyPrice);
  const plan: Omit<CraftPlan, "reliable" | "tree"> = {
    lines,
    evaluations,
    cycles,
    totals: { purchases, fees, stockValue, cash, economic: addOrNull(cash, stockValue) },
    missingPrices: lines.filter((l) => l.purchaseCost === null && l.toBuy > 0).map((l) => l.itemId),
    missingStockPrices: lines.filter((l) => l.stockValue === null).map((l) => l.itemId),
    missingRecipes: lines.filter((l) => l.decision.kind === "missing" && l.decision.reason !== "no_price").map((l) => l.itemId),
    unknownFeeRecipes: usedRecipes.filter((r) => r.craftFee === null).map((r) => r.id),
    stalePrices: bought.filter((l) => l.buyPrice!.stale).map((l) => l.itemId),
    unreliableRecipes: usedRecipes.filter((r) => !r.reliable).map((r) => r.id),
  };

  const tree = (itemId: number, demand: number): TreeNode => {
    const ev = evaluations.get(itemId)!;
    const d = ev.decision;
    return {
      itemId,
      demand,
      decision: d,
      branchCost: ev.unitCost === null ? null : ev.unitCost * demand,
      shared: (consumers.get(itemId) ?? 0) > 1,
      // Branch view: this branch's own batches. Pooled totals are in the plan lines.
      children: d.kind === "craft" ? d.recipe.ingredients.map((i) => tree(i.itemId, i.quantity * Math.ceil(demand / d.recipe.outputQuantity))) : [],
    };
  };

  return {
    ...plan,
    tree: tree(input.targetItemId, input.quantity),
    reliable:
      plan.totals.cash !== null &&
      plan.missingPrices.length === 0 &&
      plan.missingRecipes.length === 0 &&
      plan.stalePrices.length === 0 &&
      plan.unreliableRecipes.length === 0,
  };
}

/**
 * Owned quantities after the plan has been carried out in game, for the items that change:
 * stock used is consumed, batch surplus is kept, and the whole crafted output of the target
 * is added. Purchases are consumed entirely, so bought-only items do not change.
 */
export function inventoryAfterCraft(plan: CraftPlan, inventory: Map<number, number>): Map<number, number> {
  const after = new Map<number, number>();
  for (const l of plan.lines) {
    // surplus is only meaningful for crafted lines (bought lines produce nothing).
    const gained = l.runs === 0 ? 0 : l.itemId === plan.tree.itemId ? l.produced : l.surplus;
    const delta = gained - l.fromStock;
    if (delta !== 0) after.set(l.itemId, (inventory.get(l.itemId) ?? 0) + delta);
  }
  return after;
}

export interface ProfitInput {
  totalCost: number | null;
  sellPrice: PricePoint | undefined;
  quantitySold: number;
  commissionBps: number | null;
  fixedFees: number;
}

export type ProfitResult =
  | { status: "incomplete"; missing: ("cost" | "sell_price" | "commission")[] }
  | {
      status: "complete";
      grossRevenue: number;
      netRevenue: number;
      commission: number;
      profit: number;
      marginPercent: number | null;
      roiPercent: number | null;
      breakEvenUnitPrice: number;
    };

/** README 5.3-5.5 applied to a plan's total cost. */
export function profitability(p: ProfitInput): ProfitResult {
  const missing = [
    ...(p.totalCost === null ? ["cost" as const] : []),
    ...(p.sellPrice ? [] : ["sell_price" as const]),
    ...(p.commissionBps === null ? ["commission" as const] : []),
  ];
  if (missing.length) return { status: "incomplete", missing };
  const gross = p.sellPrice!.unitPrice * p.quantitySold;
  const net = netRevenue(p.sellPrice!.unitPrice, p.quantitySold, p.commissionBps!);
  const profit = netProfit(net, p.totalCost!, p.fixedFees);
  return {
    status: "complete",
    grossRevenue: gross,
    netRevenue: net,
    commission: gross - net,
    profit,
    marginPercent: marginPercent(profit, net),
    roiPercent: roiPercent(profit, p.totalCost!),
    breakEvenUnitPrice: minimumSalePrice(p.totalCost!, p.quantitySold, p.commissionBps!, p.fixedFees),
  };
}
