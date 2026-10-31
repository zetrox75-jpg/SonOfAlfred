import { fetch } from "@tauri-apps/plugin-http";
import { getDb } from "../db";
import { writeTransaction } from "../catalogue";
import { itemKey } from "../../domain/validation/catalogue";
import {
  canRefresh,
  CraftModelResponse,
  craftRecipeStatements,
  ItemsResponse,
  keyFromSourceRef,
  normalizeItems,
  normalizePrices,
  observationStatements,
  parse,
  PricesResponse,
  PROVIDER,
  readStatus,
  SOURCE,
  serverRef,
  ServersResponse,
  STATUS_KEY,
  statusStatement,
  urls,
  type ProviderServer,
  type ProviderStatus,
} from "./aion2exchange";
import { providerFor, registerProvider, statusKeyOf, type MarketDataProvider } from "./provider";

// The only code that talks to aion2.exchange. Every request starts from an explicit user
// action, needs the provider enabled, and obeys the one-hour cache. The capability file also
// limits the HTTP plugin to https://aion2.exchange/api/*.

/** Id of the aion2.exchange provider: the prefix of its markets' `provider_server` ("aion2.exchange:<server>"). */
export const AION2EXCHANGE = "aion2.exchange";

export async function loadStatus(providerId = AION2EXCHANGE): Promise<ProviderStatus> {
  const rows = await (await getDb()).select<{ value: string }[]>("SELECT value FROM settings WHERE key = ?", [statusKeyOf(providerId)]);
  return readStatus(rows[0]?.value);
}

const saveStatus = (s: ProviderStatus, providerId = AION2EXCHANGE) => writeTransaction([statusStatement(s, statusKeyOf(providerId))]);

// Every provider action reads the whole status row and writes it back, so they run one at a time:
// otherwise a refresh that ends after a "disable" would write `enabled: true` back.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(f: () => Promise<T>): Promise<T> => {
  const r = queue.then(f);
  queue = r.catch(() => {});
  return r;
};

export const setEnabled = (enabled: boolean, providerId = AION2EXCHANGE): Promise<void> => serial(async () => {
  const s = await loadStatus(providerId);
  await saveStatus({ ...s, enabled, acknowledgedAt: enabled ? new Date().toISOString() : s.acknowledgedAt }, providerId);
});

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": PROVIDER.userAgent, Accept: "application/json" },
      connectTimeout: PROVIDER.timeoutMs,
      signal: AbortSignal.timeout(PROVIDER.timeoutMs),
    });
  } catch (e) {
    const timeout = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Error(timeout ? `aion2.exchange did not answer within ${PROVIDER.timeoutMs / 1000} s.` : `Network error: ${String(e)}`);
  }
  if (res.status === 429) throw new Error("aion2.exchange is rate limiting requests (HTTP 429). Try again later.");
  if (!res.ok) throw new Error(`aion2.exchange answered HTTP ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new Error("aion2.exchange did not return JSON.");
  }
}

/** Guards, request, and status bookkeeping shared by every provider action. */
function guarded<T>(cacheKey: string, action: () => Promise<{ result: T; summary: string; statements?: Parameters<typeof writeTransaction>[0] }>, providerId = AION2EXCHANGE): Promise<T> {
  return serial(() => guardedNow(cacheKey, action, providerId));
}

async function guardedNow<T>(cacheKey: string, action: () => Promise<{ result: T; summary: string; statements?: Parameters<typeof writeTransaction>[0] }>, providerId: string): Promise<T> {
  const status = await loadStatus(providerId);
  if (!status.enabled) throw new Error(`The ${providerId} provider is disabled. Enable it in Settings after reading the notice.`);
  const check = canRefresh(status.refreshedAt[cacheKey] ?? null, new Date());
  if (!check.allowed) throw new Error(`Already refreshed less than an hour ago (the API caches for 1 h). Next refresh after ${new Date(check.nextAt).toLocaleTimeString()}.`);
  const now = new Date().toISOString();
  const attempt: ProviderStatus = { ...status, lastAttemptAt: now, refreshedAt: { ...status.refreshedAt, [cacheKey]: now } };
  try {
    const { result, summary, statements = [] } = await action();
    // Observations and the success status are written together.
    await writeTransaction([...statements, statusStatement({ ...attempt, lastSuccessAt: now, lastError: null, lastResult: summary }, statusKeyOf(providerId))]);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await saveStatus({ ...attempt, lastError: message }, providerId);
    throw new Error(message);
  }
}

const SERVERS_KEY = `${STATUS_KEY}.servers`;

/** Server list. Reused for an hour from the local copy, so linking markets does not re-ask the API. */
export async function fetchServers(): Promise<ProviderServer[]> {
  const status = await loadStatus();
  const [cached] = await (await getDb()).select<{ value: string }[]>("SELECT value FROM settings WHERE key = ?", [SERVERS_KEY]);
  if (cached && !canRefresh(status.refreshedAt.servers ?? null, new Date()).allowed) return parse(ServersResponse, JSON.parse(cached.value), "cached servers").servers;
  return guarded("servers", async () => {
    const json = await getJson(urls.servers());
    const res = parse(ServersResponse, json, "servers");
    return {
      result: res.servers,
      summary: `${res.servers.length} servers listed`,
      statements: [{ sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", params: [SERVERS_KEY, JSON.stringify(json)] }],
    };
  });
}

/** Creates a market bound to one provider server (region + server + faction come from the API). */
export async function createMarketForServer(s: ProviderServer): Promise<void> {
  await writeTransaction([{
    sql: "INSERT INTO markets (name, region, server, faction, provider_server) VALUES (?, ?, ?, ?, ?)",
    params: [`${s.name} · ${s.faction} (${s.region})`, s.region_name, s.name, s.faction, serverRef(s.server_id)],
  }]);
}

const serverIdOf = (providerServer: string | null) => {
  const m = providerServer?.match(/^aion2\.exchange:(\d+)$/);
  if (!m) throw new Error("This market is not linked to an aion2.exchange server.");
  return Number(m[1]);
};

const aion2exchange: MarketDataProvider = {
  id: AION2EXCHANGE,
  source: SOURCE,
  capabilities: { priceKinds: ["lowest_listing"], history: true },
  async fetchPrices({ serverId, catalogue, addMissing }) {
    const res = parse(ItemsResponse, await getJson(urls.items(serverId)), "items");
    const n = normalizeItems(res, catalogue, addMissing);
    const partial = res.total > res.items.length ? ` Only the first ${res.items.length} of ${res.total} items were requested.` : "";
    const missing = addMissing ? `${n.added} new item(s) added to your catalogue (community, not verified)` : `${n.unmatched} listed item(s) not in your catalogue`;
    return Object.assign(n.observations, { note: `${missing}, ${n.skipped} skipped (not listed or no price).${partial}` });
  },
};
registerProvider(aion2exchange);

/** Current prices for every Global catalogue item, from the market's own provider and server only. */
export async function refreshMarket(market: { id: number; name: string; provider_server: string | null }, opts: { addMissing?: boolean } = {}): Promise<string> {
  const { provider, serverId } = providerFor(market.provider_server);
  return guarded(`items:${serverId}`, async () => {
    const items = await (await getDb()).select<{ id: number; name: string; game_region: string }[]>(
      "SELECT id, name, game_region FROM items WHERE archived_at IS NULL AND game_region = 'GLOBAL'");
    const prices = await provider.fetchPrices({ serverId, catalogue: new Map(items.map((i) => [itemKey(i.name, i.game_region), i.id])), addMissing: opts.addMissing });
    const summary = `${market.name}: ${prices.length} catalogue item(s) priced from ${provider.source.name}. ${prices.note ?? ""}`.trim();
    return { result: summary, summary, statements: observationStatements(market.id, prices, new Date().toISOString(), provider.source) };
  }, provider.id);
}

/** Splendent craft recipes of this market's server (race), as Global community recipes. */
export async function importCrafts(market: { provider_server: string | null }): Promise<string> {
  const serverId = serverIdOf(market.provider_server);
  return guarded(`crafts:${serverId}`, async () => {
    const res = parse(CraftModelResponse, await getJson(urls.craftsModel(serverId)), "crafts model");
    const { statements, recipes, skipped } = craftRecipeStatements(res, new Date().toISOString());
    const summary = `${recipes} Splendent recipe(s) imported from ${SOURCE.name} (community, quantities rounded up, craft fee unknown)${skipped ? `; ${skipped} without a name skipped` : ""}.`;
    return { result: summary, summary, statements };
  });
}

/** 7-day cheapest-listing history of one item, into this market only. */
export async function loadHistory(market: { id: number; provider_server: string | null }, itemId: number): Promise<string> {
  const serverId = serverIdOf(market.provider_server);
  const [ref] = await (await getDb()).select<{ source_ref: string }[]>(
    `SELECT mp.source_ref FROM market_prices mp JOIN data_sources s ON s.id = mp.source_id
     WHERE mp.item_id = ? AND mp.market_id = ? AND s.name = ? AND mp.source_ref IS NOT NULL ORDER BY mp.observed_at DESC LIMIT 1`,
    [itemId, market.id, PROVIDER.sourceName]);
  const key = keyFromSourceRef(ref?.source_ref ?? null);
  if (!key) throw new Error("No aion2.exchange listing is known for this item in this market yet. Refresh the market prices first.");
  return guarded(`prices:${serverId}:${key}`, async () => {
    const res = parse(PricesResponse, await getJson(urls.prices(serverId, key)), "price history");
    const n = normalizePrices(res, itemId);
    const summary = `History loaded: ${n.observations.length} hourly cheapest-listing point(s) from ${new Date(res.range_start).toLocaleString()}.`;
    return { result: summary, summary, statements: observationStatements(market.id, n.observations, new Date().toISOString()) };
  });
}
