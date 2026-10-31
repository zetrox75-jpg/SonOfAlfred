// Test-only market provider (README 16.3 interface). Serves the FICTIONAL fixture in
// tests/fixtures/market/ and never touches the network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { itemKey } from "../../src/domain/validation/catalogue";
import type { MarketDataProvider, NormalizedPrice } from "../../src/services/market/provider";

interface Fixture {
  _fixture: true;
  _source: "mock";
  prices: { item: string; unit_price: number; quantity: number; observed_minutes_ago: number }[];
}

export const fixture: Fixture = JSON.parse(readFileSync(join(__dirname, "../fixtures/market/mock-prices.json"), "utf8"));
if (fixture._fixture !== true || fixture._source !== "mock") throw new Error("mock provider needs a fixture labelled _fixture/_source");

export function createMockMarketDataProvider(now = Date.now()) {
  const provider: MarketDataProvider = {
    id: "mock",
    source: { name: "MOCK provider (fictional test data)", url: "https://example.invalid/mock", sourceType: "community", notes: "Test fixture, not real data." },
    capabilities: { priceKinds: ["lowest_listing"], history: false },
    fetchPrices: vi.fn(async ({ catalogue }) => {
      const prices: NormalizedPrice[] = [];
      let unmatched = 0;
      for (const p of fixture.prices) {
        const itemId = catalogue.get(itemKey(p.item, "GLOBAL"));
        if (itemId === undefined) { unmatched++; continue; }
        prices.push({
          itemId, unitPrice: p.unit_price, quantityObserved: p.quantity,
          observedAt: new Date(now - p.observed_minutes_ago * 60_000).toISOString(),
          sourceRef: `mock:item/${p.item}`, raw: JSON.stringify(p),
        });
      }
      return Object.assign(prices, { note: `${unmatched} listed item(s) not in your catalogue.` });
    }),
  };
  return provider;
}
