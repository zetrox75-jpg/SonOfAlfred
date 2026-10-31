// FICTIONAL TEST DATA. The scanner must never rank incomplete or stale data as reliable.
import { describe, expect, it } from "vitest";
import { scanProfits, type ScanInput } from "../src/domain/calculations/scanner";
import type { PlanRecipe, PricePoint } from "../src/domain/calculations/craftPlan";

const ORE = 1, INGOT = 2, SWORD = 3, GEM = 4, RING = 5;
const r = (id: number, out: number, ings: [number, number][], reliable = true): PlanRecipe => ({
  id, key: `r${id}`, outputItemId: out, outputQuantity: 1, craftFee: 0, reliable,
  ingredients: ings.map(([itemId, quantity]) => ({ itemId, quantity })),
});
const p = (unitPrice: number, stale = false): PricePoint => ({ unitPrice, stale, observedAt: stale ? "2026-10-01T00:00:00Z" : "2026-10-31T10:00:00Z", source: "t" });

function input(o: { buy?: Record<number, PricePoint>; sell?: Record<number, PricePoint>; recipes?: PlanRecipe[]; commissionBps?: number | null } = {}): ScanInput {
  const recipes = o.recipes ?? [r(1, INGOT, [[ORE, 2]]), r(2, SWORD, [[INGOT, 3]]), r(3, RING, [[GEM, 1]])];
  const byOut = new Map<number, PlanRecipe[]>();
  for (const x of recipes) byOut.set(x.outputItemId, [...(byOut.get(x.outputItemId) ?? []), x]);
  const buy = o.buy ?? { [ORE]: p(10) };
  const sell = o.sell ?? { [SWORD]: p(100), [INGOT]: p(15) };
  return {
    targets: [...byOut.keys()], quantity: 2, recipesByOutput: byOut, buyPrice: (id) => buy[id], sellPrice: (id) => sell[id],
    inventory: new Map(), useInventory: false, commissionBps: "commissionBps" in o ? o.commissionBps! : 0, valuation: "cash",
  };
}
const row = (rows: ReturnType<typeof scanProfits>, id: number) => rows.find((x) => x.itemId === id)!;

describe("profit scanner", () => {
  it("computes profit for complete chains and marks them reliable", () => {
    const rows = scanProfits(input());
    expect(row(rows, SWORD)).toMatchObject({ status: "reliable", totalCost: 120, unitCost: 60, profit: 80, issues: [] });
    expect(row(rows, INGOT)).toMatchObject({ status: "reliable", totalCost: 40, profit: -10 });
  });

  it("keeps a recipe with a missing ingredient price or no sell price incomplete", () => {
    const rows = scanProfits(input());
    expect(row(rows, RING)).toMatchObject({ status: "incomplete", profit: null });
    expect(row(rows, RING).issues).toEqual(["1 missing buy price(s)", "no sell price"]);
  });

  it("never calls stale or unverified data reliable", () => {
    expect(row(scanProfits(input({ sell: { [SWORD]: p(100, true) } })), SWORD)).toMatchObject({ status: "unreliable", issues: ["stale sell price"] });
    expect(row(scanProfits(input({ buy: { [ORE]: p(10, true) } })), SWORD)).toMatchObject({ status: "unreliable", issues: ["1 stale buy price(s)"] });
    const unverified = scanProfits(input({ recipes: [r(1, INGOT, [[ORE, 2]]), r(2, SWORD, [[INGOT, 3]], false)] }));
    expect(row(unverified, SWORD)).toMatchObject({ status: "unreliable", recipeReliable: false });
  });

  it("is incomplete without a configured commission", () => {
    expect(row(scanProfits(input({ commissionBps: null })), SWORD)).toMatchObject({ status: "incomplete", issues: ["commission not set"] });
  });

  it("reports the oldest price used", () => {
    expect(row(scanProfits(input({ buy: { [ORE]: p(10, true) } })), SWORD).oldestPriceAt).toBe("2026-10-01T00:00:00Z");
  });
});
