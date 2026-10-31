// @vitest-environment jsdom
// FICTIONAL TEST DATA. Market page "Refresh prices" flow (README 4.7, 16.3-16.6) with the mock
// provider, on an in-memory SQLite built from the real migrations. No network is used: every
// network entry point is replaced by a spy that fails the test if it is called.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createMockMarketDataProvider } from "./mocks/mockMarketDataProvider";

let db: DatabaseSync;
const networkCalls: string[] = [];

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: async () => ({ select: async (sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) }) },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: { statements?: { sql: string; params: unknown[] }[] }) => {
    if (cmd !== "write_transaction") throw new Error(`unexpected command ${cmd}`);
    db.exec("BEGIN");
    try {
      const n = args.statements!.map((s) => Number(db.prepare(s.sql).run(...(s.params as never[])).changes));
      db.exec("COMMIT");
      return n;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }),
}));
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(async (url: string) => { networkCalls.push(String(url)); throw new Error(`network call in test: ${url}`); }),
}));

const { invoke } = await import("@tauri-apps/api/core");
const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
const { registerProvider } = await import("../src/services/market/provider");
const { WorkspaceProvider } = await import("../src/features/crafting/workspace");
const { default: MarketPage } = await import("../src/features/market/MarketPage");

const FRESH = "MOCK Fresh Ore (fictional)";
const OLD = "MOCK Old Herb (fictional)";
const MISSING = "MOCK Missing Gem (fictional)";
const mock = createMockMarketDataProvider();
const container = document.createElement("div");
const root = createRoot(container);

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => { networkCalls.push(String(url)); throw new Error("network call in test"); }));
  db = new DatabaseSync(":memory:");
  const dir = join(__dirname, "../src-tauri/migrations");
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  db.exec(`
    INSERT INTO items (name, normalized_name, game_region) VALUES
      ('${FRESH}', lower('${FRESH}'), 'GLOBAL'), ('${OLD}', lower('${OLD}'), 'GLOBAL'), ('${MISSING}', lower('${MISSING}'), 'GLOBAL');
    INSERT INTO markets (name, region, server, faction, provider_server) VALUES
      ('MOCK Server A · Asmodian', 'Mock region', 'MOCK Server A', 'Asmodian', 'mock:1'),
      ('MOCK Server B · Asmodian', 'Mock region', 'MOCK Server B', 'Asmodian', 'mock:2');
    INSERT INTO data_sources (name, source_type) VALUES ('MOCK manual entry (fictional)', 'user');
    -- A price for the missing item exists on ANOTHER server: it must never be used for server A.
    INSERT INTO market_prices (item_id, market_id, price_kind, unit_price, source_id, observed_at)
      VALUES (3, 2, 'lowest_listing', 777, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    INSERT INTO settings (key, value) VALUES ('active_market_id', '1'), ('provider.mock', '{"enabled":true}');`);
  registerProvider(mock);
  document.body.appendChild(container);
});
afterAll(() => act(() => root.unmount()));

async function waitFor<T>(find: () => T | null | undefined | false, what: string): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const r = find();
    if (r) return r;
    await act(() => new Promise((res) => setTimeout(res, 15)));
  }
  throw new Error(`timed out waiting for ${what}\n${container.textContent}`);
}
const row = (name: string) => [...container.querySelectorAll("tbody tr")].find((r) => r.textContent!.includes(name))!;
const lowestListingCell = (name: string) => row(name).querySelectorAll("td")[1];

it("Refresh calls the provider once and shows its prices with source and timestamps, no network", async () => {
  await act(async () => root.render(<WorkspaceProvider><MarketPage onNavigate={() => {}} /></WorkspaceProvider>));
  const button = await waitFor(() => [...container.querySelectorAll("button")].find((b) => b.textContent === "Refresh prices"), "Refresh button");
  expect(lowestListingCell(FRESH).textContent).toBe("-"); // nothing before the refresh

  await act(async () => button.click());
  await waitFor(() => container.textContent!.includes("2 catalogue item(s) priced from MOCK provider (fictional test data)"), "refresh summary");
  await waitFor(() => lowestListingCell(FRESH).textContent !== "-", "refreshed price");

  // (a) exactly one provider call, for server 1 of the selected market.
  expect(mock.fetchPrices).toHaveBeenCalledTimes(1);
  expect(vi.mocked(mock.fetchPrices).mock.calls[0][0].serverId).toBe(1);

  // (b) fixture price with its source, observation and retrieval time.
  const stored = db.prepare("SELECT observed_at, retrieved_at FROM market_prices WHERE item_id = 1 AND market_id = 1").get() as { observed_at: string; retrieved_at: string };
  const fresh = lowestListingCell(FRESH);
  expect(fresh.textContent).toContain((1234).toLocaleString());
  expect(fresh.textContent).toContain("MOCK provider (fictional test data)");
  expect(fresh.textContent).toContain("30 min ago");
  expect(fresh.textContent).not.toContain("stale");
  const title = fresh.querySelector("[title]")!.getAttribute("title")!;
  expect(title).toBe(`Observed ${new Date(stored.observed_at).toLocaleString()} · retrieved ${new Date(stored.retrieved_at).toLocaleString()}`);

  // (c) an old price is shown as stale; an item without a price on THIS server stays missing,
  // even though another server has one (no cross-server fallback).
  expect(lowestListingCell(OLD).textContent).toMatch(/^555.*stale · /);
  expect(lowestListingCell(MISSING).textContent).toBe("-");

  // (d) no network at all, and nothing addressed to aion2.exchange.
  expect(networkCalls).toEqual([]);
  expect(tauriFetch).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(invoke).mock.calls)).not.toContain("aion2.exchange");
});

it("opt-in: listed items missing from the catalogue are added (community) and priced; search suggests them", async () => {
  const market = container.querySelector<HTMLSelectElement>('select[aria-label="Market"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(market, "2");
    market.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const button = await waitFor(() => container.textContent!.includes("MOCK Server B") && [...container.querySelectorAll("button")].find((b) => b.textContent === "Refresh prices" && !b.disabled), "server B refresh");
  const optIn = [...container.querySelectorAll("label")].find((l) => l.textContent!.includes("Also add listed items missing"))!.querySelector("input")!;
  await act(async () => optIn.click());
  await act(async () => button.click());
  await waitFor(() => container.textContent!.includes("3 catalogue item(s) priced from MOCK provider (fictional test data)"), "add summary");

  const NEW = "MOCK Not In Catalogue (fictional)";
  expect(db.prepare("SELECT game_region, verification_status FROM items WHERE name = ?").all(NEW)).toMatchObject([{ game_region: "GLOBAL", verification_status: "community" }]);
  await waitFor(() => row(NEW) && lowestListingCell(NEW).textContent!.startsWith("99"), "new item priced");
  const search = container.querySelector<HTMLInputElement>('input[aria-label="Search items"]')!;
  const options = [...document.getElementById(search.getAttribute("list")!)!.querySelectorAll("option")].map((o) => o.value);
  expect(options).toContain(NEW);
  expect(mock.fetchPrices).toHaveBeenCalledTimes(1); // mocks are cleared between tests
  expect(networkCalls).toEqual([]);
}, 15_000);
