// FICTIONAL TEST DATA: ids, recipes and prices are invented to check the math.
import { describe, expect, it } from "vitest";
import { buildCraftPlan, PlanError, profitability, verifiedOnly, type PlanInput, type PlanRecipe, type PricePoint } from "../src/domain/calculations/craftPlan";

const ORE = 1, LEATHER = 2, INGOT = 3, SWORD = 4, HANDLE = 5, COAL = 6, SWORD2 = 7, X = 8, Y = 9, Z = 10;

const r = (id: number, out: number, outQty: number, fee: number | null, ings: [number, number][], reliable = true): PlanRecipe => ({
  id, key: `r${id}`, outputItemId: out, outputQuantity: outQty, craftFee: fee, reliable,
  ingredients: ings.map(([itemId, quantity]) => ({ itemId, quantity })),
});
const INGOT_A = r(1, INGOT, 2, 10, [[ORE, 3]]); // unit (30+10)/2 = 20
const SWORD_R = r(2, SWORD, 1, 50, [[INGOT, 3], [LEATHER, 1]]); // unit 60+30+50 = 140
const HANDLE_R = r(3, HANDLE, 1, 0, [[INGOT, 1], [LEATHER, 1]]);
const SWORD2_R = r(4, SWORD2, 1, 0, [[INGOT, 3], [HANDLE, 1]]);
const INGOT_B = r(5, INGOT, 1, 0, [[ORE, 1], [COAL, 1]]); // unit 10+8 = 18

const p = (unitPrice: number, stale = false): PricePoint => ({ unitPrice, stale, observedAt: "2026-10-31T00:00:00Z", source: "test" });

function input(over: Partial<PlanInput> & { prices?: Record<number, PricePoint>; recipes?: PlanRecipe[] } = {}): PlanInput {
  const recipes = over.recipes ?? [INGOT_A, SWORD_R, HANDLE_R, SWORD2_R];
  const prices = over.prices ?? { [ORE]: p(10), [LEATHER]: p(30), [INGOT]: p(25), [COAL]: p(8) };
  const byOut = new Map<number, PlanRecipe[]>();
  for (const x of recipes) byOut.set(x.outputItemId, [...(byOut.get(x.outputItemId) ?? []), x]);
  return {
    targetItemId: SWORD,
    quantity: 2,
    recipesByOutput: byOut,
    buyPrice: (id) => prices[id],
    inventory: new Map(),
    useInventory: true,
    ...over,
  };
}
const line = (plan: ReturnType<typeof buildCraftPlan>, id: number) => plan.lines.find((l) => l.itemId === id)!;

describe("crafting chain", () => {
  it("crafts the cheaper intermediate and totals the whole chain", () => {
    const plan = buildCraftPlan(input());
    expect(line(plan, INGOT)).toMatchObject({ decision: { kind: "craft" }, required: 6, runs: 3, produced: 6, surplus: 0, fees: 30 });
    expect(line(plan, ORE)).toMatchObject({ toBuy: 9, purchaseCost: 90 });
    expect(line(plan, LEATHER)).toMatchObject({ toBuy: 2, purchaseCost: 60 });
    expect(plan.totals).toEqual({ purchases: 150, fees: 130, stockValue: 0, cash: 280, economic: 280 });
    expect(plan.reliable).toBe(true);
  });

  it("rounds batches up and keeps the surplus", () => {
    const plan = buildCraftPlan(input({ quantity: 1 }));
    expect(line(plan, INGOT)).toMatchObject({ required: 3, runs: 2, produced: 4, surplus: 1 });
    expect(plan.totals.cash).toBe(60 + 30 + 50 + 20);
  });

  it("pools a shared ingredient across branches before rounding batches", () => {
    const plan = buildCraftPlan(input({ targetItemId: SWORD2, quantity: 1 }));
    // 3 ingots for the sword + 1 for the handle = 4 -> 2 runs (per-branch rounding would give 3).
    expect(line(plan, INGOT)).toMatchObject({ required: 4, runs: 2, surplus: 0 });
    expect(line(plan, LEATHER).required).toBe(1);
    const ingotNodes = [plan.tree.children[0], plan.tree.children[1].children[0]];
    expect(ingotNodes.map((n) => [n.itemId, n.shared])).toEqual([[INGOT, true], [INGOT, true]]);
  });

  it("builds the tree with branch quantities and allocated costs", () => {
    const { tree } = buildCraftPlan(input());
    expect(tree).toMatchObject({ itemId: SWORD, demand: 2, branchCost: 280 });
    expect(tree.children.map((c) => [c.itemId, c.demand, c.branchCost])).toEqual([[INGOT, 6, 120], [LEATHER, 2, 60]]);
    expect(tree.children[0].children[0]).toMatchObject({ itemId: ORE, demand: 9, decision: { kind: "buy" } });
  });
});

describe("inventory", () => {
  it("uses partial stock once and buys the rest (cash vs economic)", () => {
    const plan = buildCraftPlan(input({ inventory: new Map([[ORE, 5]]) }));
    expect(line(plan, ORE)).toMatchObject({ required: 9, fromStock: 5, toBuy: 4, purchaseCost: 40, stockValue: 50 });
    expect(plan.totals.cash).toBe(230);
    expect(plan.totals.economic).toBe(280);
  });

  it("owned intermediates reduce the runs and their own ingredients", () => {
    const plan = buildCraftPlan(input({ inventory: new Map([[INGOT, 4]]) }));
    expect(line(plan, INGOT)).toMatchObject({ required: 6, fromStock: 4, needed: 2, runs: 1 });
    expect(line(plan, ORE).required).toBe(3);
  });

  it("can ignore inventory, and never deducts the target itself", () => {
    expect(buildCraftPlan(input({ inventory: new Map([[ORE, 5]]), useInventory: false })).totals.cash).toBe(280);
    expect(line(buildCraftPlan(input({ inventory: new Map([[SWORD, 9]]) })), SWORD)).toMatchObject({ fromStock: 0, runs: 2 });
  });

  it("economic cost is incomplete when owned stock has no price", () => {
    const plan = buildCraftPlan(input({ inventory: new Map([[COAL, 6]]), prices: { [ORE]: p(10), [LEATHER]: p(30) }, recipes: [INGOT_B, SWORD_R] }));
    expect(plan.missingStockPrices).toEqual([COAL]);
    expect(plan.totals.economic).toBeNull();
    expect(plan.totals.cash).not.toBeNull();
  });
});

describe("buy or craft, alternatives", () => {
  it("buys when buying is cheaper", () => {
    const plan = buildCraftPlan(input({ prices: { [ORE]: p(10), [LEATHER]: p(30), [INGOT]: p(19) } }));
    expect(line(plan, INGOT)).toMatchObject({ decision: { kind: "buy" }, toBuy: 6, purchaseCost: 114 });
    expect(plan.lines.some((l) => l.itemId === ORE)).toBe(false);
    const ev = plan.evaluations.get(INGOT)!;
    expect([ev.buy?.unitPrice, ev.crafts[0].unitCost]).toEqual([19, 20]);
  });

  it("respects a forced strategy", () => {
    const plan = buildCraftPlan(input({ strategies: new Map([[INGOT, "buy" as const]]) }));
    expect(line(plan, INGOT)).toMatchObject({ decision: { kind: "buy" }, purchaseCost: 150 });
  });

  it("picks the cheapest alternative recipe, or the one chosen", () => {
    const recipes = [INGOT_A, INGOT_B, SWORD_R];
    expect(line(buildCraftPlan(input({ recipes })), INGOT).decision).toMatchObject({ recipe: { id: INGOT_B.id } });
    const forced = buildCraftPlan(input({ recipes, recipeChoice: new Map([[INGOT, INGOT_A.id]]) }));
    expect(line(forced, INGOT).decision).toMatchObject({ recipe: { id: INGOT_A.id } });
  });
});

describe("missing and unreliable data", () => {
  it("keeps a missing price missing instead of zero", () => {
    const plan = buildCraftPlan(input({ prices: { [ORE]: p(10) } }));
    expect(line(plan, LEATHER)).toMatchObject({ decision: { kind: "missing", reason: "no_price" }, toBuy: 2, purchaseCost: null });
    expect(plan.missingPrices).toEqual([LEATHER]);
    expect(plan.totals.cash).toBeNull();
    expect(plan.reliable).toBe(false);
  });

  it("an intermediate with no price for its inputs still shows its recipe", () => {
    const plan = buildCraftPlan(input({ prices: { [LEATHER]: p(30) } }));
    expect(line(plan, INGOT).decision.kind).toBe("craft");
    expect(plan.missingPrices).toEqual([ORE]);
  });

  it("flags stale purchase prices and unknown fees", () => {
    const stale = buildCraftPlan(input({ prices: { [ORE]: p(10), [LEATHER]: p(30, true) } }));
    expect(stale.stalePrices).toEqual([LEATHER]);
    expect(stale.reliable).toBe(false);
    // No ingot price, so the ingot must be crafted even though its fee is unknown.
    const noFee = buildCraftPlan(input({ recipes: [{ ...INGOT_A, craftFee: null }, SWORD_R], prices: { [ORE]: p(10), [LEATHER]: p(30) } }));
    expect(noFee.unknownFeeRecipes).toEqual([INGOT_A.id]);
    expect(noFee.totals.fees).toBeNull();
  });

  it("a recipe not verified for Global makes the plan unreliable", () => {
    const plan = buildCraftPlan(input({ recipes: [INGOT_A, { ...SWORD_R, reliable: false }] }));
    expect(plan.unreliableRecipes).toEqual([SWORD_R.id]);
    expect(plan.reliable).toBe(false);
    expect(plan.totals.cash).toBe(280);
  });

  it("the verified-only filter makes a community recipe unreliable for that analysis", () => {
    const community = { ...SWORD_R, reliable: true, verified: false };
    const base = input({ recipes: [{ ...INGOT_A, verified: true }, community] });
    expect(buildCraftPlan(base).unreliableRecipes).toEqual([]);
    const strict = buildCraftPlan({ ...base, recipesByOutput: verifiedOnly(base.recipesByOutput) });
    expect(strict.unreliableRecipes).toEqual([SWORD_R.id]);
    expect(strict.totals.cash).toBe(280);
  });

  it("forced craft without recipe is reported", () => {
    const plan = buildCraftPlan(input({ strategies: new Map([[ORE, "craft" as const]]), prices: { [ORE]: p(10), [LEATHER]: p(30) } }));
    expect(plan.missingRecipes).toEqual([ORE]);
    expect(line(plan, ORE)).toMatchObject({ toBuy: 0, purchaseCost: null });
    expect(plan.missingPrices).toEqual([]);
    expect(plan.totals.cash).toBeNull();
  });

  it("refuses a target that has no recipe", () => {
    expect(() => buildCraftPlan(input({ targetItemId: ORE }))).toThrow(PlanError);
    expect(() => buildCraftPlan(input({ quantity: 0 }))).toThrow(PlanError);
  });
});

describe("cycles", () => {
  const XR = r(10, X, 1, 0, [[Y, 1]]);
  const YR = r(11, Y, 1, 0, [[X, 1]]);
  const ZR = r(12, Z, 1, 0, [[X, 2]]);

  it("skips the looping recipe, buys instead, and reports the cycle", () => {
    const plan = buildCraftPlan(input({ targetItemId: Z, quantity: 1, recipes: [XR, YR, ZR], prices: { [Y]: p(7) } }));
    expect(plan.cycles).toEqual([[X, Y, X]]);
    expect(line(plan, Y)).toMatchObject({ decision: { kind: "buy" }, toBuy: 2 });
    expect(plan.totals.cash).toBe(14);
  });

  it("stops with an explicit error when the target only loops", () => {
    expect(() => buildCraftPlan(input({ targetItemId: X, quantity: 1, recipes: [XR, YR], strategies: new Map([[Y, "craft" as const]]) })))
      .not.toThrow();
    const loopOnly = r(13, X, 1, 0, [[X, 1]]);
    expect(() => buildCraftPlan(input({ targetItemId: X, quantity: 1, recipes: [loopOnly] }))).toThrow(/cycle/);
  });
});

describe("profitability", () => {
  it("computes revenue, commission, profit, margin, ROI and break-even", () => {
    const res = profitability({ totalCost: 280, sellPrice: p(200), quantitySold: 2, commissionBps: 500, fixedFees: 0 });
    expect(res).toMatchObject({ status: "complete", grossRevenue: 400, netRevenue: 380, commission: 20, profit: 100, breakEvenUnitPrice: 148 });
    if (res.status === "complete") {
      expect(res.marginPercent).toBeCloseTo(26.3158, 3);
      expect(res.roiPercent).toBeCloseTo(35.7143, 3);
    }
  });

  it("is incomplete when cost, sell price or commission is missing", () => {
    expect(profitability({ totalCost: null, sellPrice: undefined, quantitySold: 1, commissionBps: null, fixedFees: 0 }))
      .toEqual({ status: "incomplete", missing: ["cost", "sell_price", "commission"] });
  });
});
