// FICTIONAL TEST DATA: item ids and prices below are invented to check the math.
// They are not AION 2 recipes and must never be imported into the catalogue.
import { describe, expect, it } from "vitest";
import {
  isStale,
  marginPercent,
  minimumSalePrice,
  netProfit,
  netRevenue,
  planBatches,
  recipeCost,
  roiPercent,
  unitCost,
} from "../src/domain/calculations/profit";
import { isReliable } from "../src/domain/models";

const prices = new Map([
  [1, 100],
  [2, 250],
]);
const priceOf = (id: number) => prices.get(id);
const recipe = {
  craft_fee: 50,
  ingredients: [
    { ingredient_item_id: 1, quantity: 3 },
    { ingredient_item_id: 2, quantity: 2 },
  ],
};

describe("recipe cost (5.1)", () => {
  it("sums ingredients and fee", () => {
    const r = recipeCost(recipe, 1, priceOf);
    expect(r).toMatchObject({ status: "complete", fee: 50, total: 3 * 100 + 2 * 250 + 50 });
  });

  it("scales with runs", () => {
    const r = recipeCost(recipe, 4, priceOf);
    expect(r.status === "complete" && r.total).toBe(4 * 850);
  });

  it("reports a missing ingredient price instead of using zero", () => {
    const r = recipeCost({ ...recipe, ingredients: [...recipe.ingredients, { ingredient_item_id: 9, quantity: 1 }] }, 1, priceOf);
    expect(r).toMatchObject({ status: "incomplete", missingPriceItemIds: [9], feeUnknown: false });
  });

  it("treats an unknown fee as incomplete", () => {
    expect(recipeCost({ ...recipe, craft_fee: null }, 1, priceOf)).toMatchObject({ status: "incomplete", feeUnknown: true });
  });

  it("keeps fractional unit cost", () => {
    expect(unitCost(850, 3)).toBeCloseTo(283.333, 3);
  });
});

describe("batches (5.2)", () => {
  it("rounds runs up and reports surplus", () => {
    expect(planBatches(10, 3)).toEqual({ runs: 4, produced: 12, surplus: 2 });
    expect(planBatches(9, 3)).toEqual({ runs: 3, produced: 9, surplus: 0 });
  });

  it("rejects invalid input", () => {
    expect(() => planBatches(0, 3)).toThrow(RangeError);
    expect(() => planBatches(5, 0)).toThrow(RangeError);
  });
});

describe("sale, commission, indicators (5.3, 5.4)", () => {
  it("applies commission and rounds down", () => {
    expect(netRevenue(1000, 3, 500)).toBe(2850);
    expect(netRevenue(333, 1, 500)).toBe(316); // 316.35 -> 316
    expect(netRevenue(1000, 1, 0)).toBe(1000);
  });

  it("stays exact for large prices", () => {
    expect(netRevenue(9_000_000_000_000, 1000, 1)).toBe(8_999_100_000_000_000);
  });

  it("rejects a commission of 100% or more", () => {
    expect(() => netRevenue(100, 1, 10_000)).toThrow(RangeError);
  });

  it("computes profit, ROI and margin", () => {
    const revenue = netRevenue(1000, 1, 500); // 950
    const profit = netProfit(revenue, 800, 10); // 140
    expect(profit).toBe(140);
    expect(roiPercent(profit, 800)).toBeCloseTo(17.5);
    expect(marginPercent(profit, revenue)).toBeCloseTo(14.7368, 3);
  });

  it("returns null instead of dividing by zero", () => {
    expect(roiPercent(100, 0)).toBeNull();
    expect(marginPercent(-50, 0)).toBeNull();
  });
});

describe("minimum sale price (5.5)", () => {
  it("is the smallest price that covers cost after commission and fees", () => {
    for (const [cost, qty, bps, fees] of [
      [850, 1, 500, 0],
      [850, 3, 500, 20],
      [1, 1, 9999, 0],
      [0, 1, 500, 0],
      [123_457, 7, 750, 33],
    ]) {
      const p = minimumSalePrice(cost, qty, bps, fees);
      expect(netRevenue(p, qty, bps) - fees).toBeGreaterThanOrEqual(cost);
      if (p > 0) expect(netRevenue(p - 1, qty, bps) - fees).toBeLessThan(cost);
    }
  });
});

describe("price freshness", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  it("flags prices older than the limit", () => {
    expect(isStale("2026-10-31T00:00:00Z", now, 24)).toBe(false);
    expect(isStale("2026-10-29T00:00:00Z", now, 24)).toBe(true);
  });
  it("treats an unreadable date as stale", () => {
    expect(isStale("not a date", now, 24)).toBe(true);
  });
});

describe("region and verification", () => {
  it("only verified Global data is reliable", () => {
    expect(isReliable({ game_region: "GLOBAL", verification_status: "verified" })).toBe(true);
    expect(isReliable({ game_region: "KR", verification_status: "verified" })).toBe(false);
    expect(isReliable({ game_region: "TW", verification_status: "verified" })).toBe(false);
    expect(isReliable({ game_region: "GLOBAL", verification_status: "community" })).toBe(false);
  });
});
