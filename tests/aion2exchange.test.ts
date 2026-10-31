// aion2.exchange adapter on the ORIGINAL responses saved by the user (tests/fixtures/aion2exchange,
// retrieved 2026-10-31). No test makes a network request.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { itemKey } from "../src/domain/validation/catalogue";
import {
  canRefresh,
  ItemsResponse,
  keyFromSourceRef,
  normalizeItems,
  normalizePrices,
  observationStatements,
  parse,
  PricesResponse,
  PROVIDER,
  ProviderResponseError,
  readStatus,
  ServersResponse,
  urls,
} from "../src/services/market/aion2exchange";
import { LATEST_PRICES_SQL, resolvePrices, type PriceRow } from "../src/services/planQueries";

const dir = join(__dirname, "fixtures/aion2exchange");
const fixture = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const servers = parse(ServersResponse, fixture("servers.json"), "servers");
const items = parse(ItemsResponse, fixture("items.json"), "items");
const prices = parse(PricesResponse, fixture("item-prices.json"), "prices");
const AMPLIFY = items.items.find((i) => i.item_key === 516530001)!;

describe("fixtures parse with the adapter schemas", () => {
  it("servers: 106 Global servers with region and faction", () => {
    expect(servers.servers).toHaveLength(106);
    expect(servers.default).toBe(11304);
    expect(new Set(servers.servers.map((s) => s.faction))).toEqual(new Set(["Elyos", "Asmodian"]));
    expect(servers.servers[0]).toMatchObject({ server_id: 11101, name: "Siel", region: "NAE" });
  });

  it("items and price history", () => {
    expect(items.items).toHaveLength(50);
    expect(AMPLIFY).toMatchObject({ name: "Amplify Stone (Unique)", price: 89000, listings: 75, listed: true });
    expect(prices).toMatchObject({ item_key: 516530001, bucket: "1h" });
    expect(prices.points).toHaveLength(168);
  });

  it("rejects an unexpected response instead of storing it (the error fixture the user first saved)", () => {
    const apiError = { detail: [{ type: "int_parsing", loc: ["query", "server"], msg: "Input should be a valid integer", input: "<ID>" }] };
    expect(() => parse(PricesResponse, apiError, "prices")).toThrow(ProviderResponseError);
    expect(() => parse(ItemsResponse, { items: "nope" }, "items")).toThrow(/nothing was stored/);
  });
});

describe("normalization", () => {
  const catalogue = new Map([[itemKey("Amplify Stone (Unique)", "GLOBAL"), 7]]);

  it("turns current listings into lowest_listing observations for catalogue items only", () => {
    const n = normalizeItems(items, catalogue);
    expect(n.observations).toEqual([{
      itemId: 7, unitPrice: 89000, quantityObserved: 75, observedAt: "2026-10-31T02:07:55.191Z",
      sourceRef: "aion2.exchange:item/516530001", raw: expect.stringContaining('"price":89000'),
    }]);
    expect(n.observations.length + n.unmatched + n.skipped).toBe(50);
    // Undocumented sales statistics are kept in the snapshot under a community label only;
    // the observation itself stays a lowest listing.
    expect(JSON.parse(n.observations[0].raw).community_unconfirmed).toMatchObject({ units_sold: 188832, sold_avg_price: 59983 });
    expect(n.observations[0].unitPrice).toBe(89000);
  });

  it("only matches Global catalogue items", () => {
    const kr = new Map([[itemKey("Amplify Stone (Unique)", "KR"), 7]]);
    expect(normalizeItems(items, kr).observations).toEqual([]);
  });

  it("skips unlisted items and non-integer prices", () => {
    const n = normalizeItems({ ...items, items: [
      { ...AMPLIFY, listed: false },
      { ...AMPLIFY, price: 10.5 },
      { ...AMPLIFY, price: null },
      { ...AMPLIFY, name: null },
    ] }, catalogue);
    expect(n).toMatchObject({ observations: [], skipped: 4 });
  });

  it("accepts an item list with a nameless item (allowed by the API schema)", () => {
    const res = parse(ItemsResponse, { ...fixture("items.json"), items: [...fixture("items.json").items, { ...fixture("items.json").items[0], item_key: 1, name: null }] }, "items");
    expect(normalizeItems(res, catalogue).observations.length).toBe(normalizeItems(items, catalogue).observations.length);
  });

  it("turns history buckets into lowest_listing observations at the bucket close", () => {
    const n = normalizePrices(prices, 7);
    expect(n.observations).toHaveLength(168);
    expect(n.observations[0]).toMatchObject({ unitPrice: 61111, quantityObserved: 82, observedAt: "2026-10-24T03:00:00.000Z" });
    expect(n.observations.at(-1)).toMatchObject({ unitPrice: 89000, observedAt: "2026-10-31T02:00:00.000Z" });
  });

  it("recovers the item key from a stored source ref", () => {
    expect(keyFromSourceRef("aion2.exchange:item/516530001")).toBe("516530001");
    expect(keyFromSourceRef("something else")).toBeNull();
  });
});

describe("requests are limited to the documented endpoints", () => {
  it("builds only /servers, /items and /items/{key}/prices URLs on the API base", () => {
    expect(urls.servers()).toBe("https://aion2.exchange/api/servers");
    expect(urls.items(11304)).toBe("https://aion2.exchange/api/items?sort=key&order=asc&window=24h&limit=1000&offset=0&server=11304");
    expect(urls.prices(11304, 516530001)).toBe("https://aion2.exchange/api/items/516530001/prices?server=11304&range=7d");
  });

  it("refuses anything that is not a numeric id (no path or query injection)", () => {
    expect(() => urls.items("11304&limit=99999")).toThrow(RangeError);
    expect(() => urls.prices(11304, "../crafts")).toThrow(RangeError);
  });

  it("the adapter module never calls fetch itself", () => {
    const src = readFileSync(join(__dirname, "../src/services/market/aion2exchange.ts"), "utf8");
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });

  it("identifies itself honestly", () => {
    expect(PROVIDER.userAgent).toMatch(/^AION2-Craft-Profit-Manager\//);
  });
});

describe("refresh policy and status", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  it("allows one refresh per hour", () => {
    expect(canRefresh(null, now)).toEqual({ allowed: true });
    expect(canRefresh("2026-10-31T11:30:00Z", now)).toEqual({ allowed: false, nextAt: "2026-10-31T12:30:00.000Z" });
    expect(canRefresh("2026-10-31T11:00:00Z", now)).toEqual({ allowed: true });
  });

  it("is enabled by default (user-authorized 2026-10-31) and keeps a saved choice", () => {
    expect(readStatus(undefined).enabled).toBe(true);
    expect(readStatus('{"enabled":false}').enabled).toBe(false);
  });
});

describe("storage", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    const mig = join(__dirname, "../src-tauri/migrations");
    for (const f of readdirSync(mig).sort()) db.exec(readFileSync(join(mig, f), "utf8"));
    db.exec(`INSERT INTO items (id, name, normalized_name, game_region) VALUES (7, 'Amplify Stone (Unique)', 'amplify stone (unique)', 'GLOBAL');
             INSERT INTO markets (id, name, provider_server) VALUES (1, 'EU server', 'aion2.exchange:11304'), (2, 'Other', 'aion2.exchange:11101');`);
  });
  const run = (stmts: { sql: string; params: unknown[] }[]) => stmts.map((s) => Number(db.prepare(s.sql).run(...(s.params as never[])).changes));

  it("stores listings as lowest_listing in the linked market only, once", () => {
    const obs = normalizeItems(items, new Map([[itemKey("Amplify Stone (Unique)", "GLOBAL"), 7]])).observations;
    expect(run(observationStatements(1, obs, "2026-10-31T03:00:00Z")).slice(1)).toEqual([1]);
    expect(run(observationStatements(1, obs, "2026-10-31T04:00:00Z")).slice(1)).toEqual([0]); // repeat: nothing new
    const rows = db.prepare(LATEST_PRICES_SQL).all(1) as unknown as PriceRow[];
    expect(rows).toMatchObject([{ item_id: 7, price_kind: "lowest_listing", unit_price: 89000, source: "aion2.exchange", source_type: "community" }]);
    expect(db.prepare(LATEST_PRICES_SQL).all(2)).toEqual([]); // other server: nothing
    // As a sell price under "completed sale", a listing is never used.
    const book = resolvePrices(rows, { buy: "lowest_listing", sell: "sale_price" }, new Date("2026-10-31T03:00:00Z"), 24);
    expect(book.buy.get(7)).toMatchObject({ unitPrice: 89000, tier: "provider" });
    expect(book.sell.get(7)).toBeUndefined();
  });

  it("records the source as user-authorized, also on a database created before the authorization", () => {
    db.exec("INSERT INTO data_sources (name, source_type, is_authorized) VALUES ('aion2.exchange', 'community', 0)");
    run(observationStatements(1, [], "2026-10-31T03:00:00Z"));
    expect(db.prepare("SELECT is_authorized FROM data_sources WHERE name = 'aion2.exchange'").get()).toEqual({ is_authorized: 1 });
  });

  it("addMissing: creates listed items once (Global, community, provider source) and prices them", () => {
    const catalogue = new Map([[itemKey("Amplify Stone (Unique)", "GLOBAL"), 7]]);
    const n = normalizeItems(items, catalogue, true);
    const listed = items.items.filter((i) => i.listed && i.name && Number.isSafeInteger(i.price)).length;
    expect(n).toMatchObject({ unmatched: 0, added: listed - 1 });
    run(observationStatements(1, n.observations, "2026-10-31T03:00:00Z"));
    const created = db.prepare("SELECT i.game_region, i.verification_status, s.name AS source, c.name AS category FROM items i JOIN data_sources s ON s.id = i.source_id LEFT JOIN categories c ON c.id = i.category_id WHERE i.id <> 7").all();
    expect(created).toHaveLength(listed - 1);
    expect(created[0]).toMatchObject({ game_region: "GLOBAL", verification_status: "community", source: "aion2.exchange" });
    expect(created.every((r) => (r as { category: string | null }).category)).toBe(true);
    expect(db.prepare("SELECT COUNT(DISTINCT item_id) n FROM market_prices WHERE market_id = 1").get()).toMatchObject({ n: listed });
    // Same items offered again as new (stale catalogue): the NOT EXISTS guard adds no duplicate.
    run(observationStatements(1, normalizeItems(items, catalogue, true).observations, "2026-10-31T04:00:00Z"));
    expect(db.prepare("SELECT COUNT(*) n FROM items").get()).toMatchObject({ n: listed });
  });

  it("one market per provider server", () => {
    expect(() => db.exec("INSERT INTO markets (name, provider_server) VALUES ('dup', 'aion2.exchange:11304')")).toThrow();
  });

  it("stores the 7-day history (168 points) and survives a repeated load", () => {
    const obs = normalizePrices(prices, 7).observations;
    expect(run(observationStatements(1, obs, "2026-10-31T03:00:00Z")).slice(1).reduce((a, b) => a + b)).toBe(168);
    expect(run(observationStatements(1, obs, "2026-10-31T04:00:00Z")).slice(1).reduce((a, b) => a + b)).toBe(0);
  });
});
