import { z } from "zod";
import { itemKey, normalizeName } from "../../domain/validation/catalogue";
import type { Statement } from "../catalogueStatements";
import type { ProviderSource } from "./provider";

// aion2.exchange ("Aion2Market API" 0.1.0) adapter. Pure: no network, no DB. The caller
// injects `get`, so tests run on the saved fixtures in tests/fixtures/aion2exchange.
//
// What the numbers ARE (OpenAPI descriptions): `price` and every history point are the
// CHEAPEST ACTIVE LISTING. They are stored as `lowest_listing`, never as a sale. The
// undocumented `sold_*` fields are not stored at all until their meaning is confirmed.

export const PROVIDER = {
  id: "aion2exchange",
  name: "aion2.exchange (Aion2Market API)",
  /** data_sources.name; source_type 'community' ranks it as an automatic provider. */
  sourceName: "aion2.exchange",
  homepage: "https://aion2.exchange",
  base: "https://aion2.exchange/api",
  userAgent: "AION2-Craft-Profit-Manager/0.1.0 (desktop app; user-initiated refresh)",
  timeoutMs: 15_000,
  /** The API caches for an hour (cache-control max-age=3600); we never ask more often. */
  minRefreshMs: 3_600_000,
  /** Prices only ever exist for Global servers on this API. */
  gameRegion: "GLOBAL",
} as const;

// ---- The only requests this adapter can make (README 16.3, safeguard 7) ----

const id = (v: number | string, name: string) => {
  const s = String(v);
  if (!/^\d{1,12}$/.test(s)) throw new RangeError(`${name} must be a numeric id, got "${s}"`);
  return s;
};

export const urls = {
  servers: () => `${PROVIDER.base}/servers`,
  items: (serverId: number | string) =>
    `${PROVIDER.base}/items?sort=key&order=asc&window=24h&limit=1000&offset=0&server=${id(serverId, "server")}`,
  prices: (serverId: number | string, itemKeyValue: number | string) =>
    `${PROVIDER.base}/items/${id(itemKeyValue, "item key")}/prices?server=${id(serverId, "server")}&range=7d`,
};

// ---- Response schemas (only the fields used; unknown fields are ignored) ----

const Server = z.object({
  server_id: z.number().int().positive(),
  name: z.string(),
  region: z.string(),
  region_name: z.string(),
  faction: z.string(),
  has_data: z.boolean(),
});
export const ServersResponse = z.object({ default: z.number().int(), servers: z.array(Server) });
export type ProviderServer = z.infer<typeof Server>;

const Item = z.object({
  item_key: z.number().int().positive(),
  name: z.string().nullable(), // nullable in the API's own schema (ItemSummary)
  category: z.object({ name: z.string() }).nullable().optional(),
  price: z.number().nullable(),
  listings: z.number().int().nullable(),
  captured_at: z.string().nullable(),
  listed: z.boolean(),
});
export const ItemsResponse = z.object({ total: z.number().int(), limit: z.number().int(), offset: z.number().int(), items: z.array(Item) });

const Point = z.object({
  ts: z.iso.datetime({ offset: true }),
  low: z.number(),
  high: z.number(),
  avg: z.number(),
  close: z.number(),
  listings: z.number().int(),
  samples: z.number().int(),
});
export const PricesResponse = z.object({
  item_key: z.number().int(),
  range_start: z.string(),
  range_end: z.string(),
  bucket: z.string(),
  points: z.array(Point),
});

export class ProviderResponseError extends Error {}

export function parse<S extends z.ZodType>(schema: S, json: unknown, what: string): z.output<S> {
  const r = schema.safeParse(json);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ProviderResponseError(`Unexpected ${what} response from aion2.exchange (${i.path.join(".") || "root"}: ${i.message}). The API may have changed; nothing was stored.`);
  }
  return r.data;
}

// ---- Normalization into the app's price model ----

export interface Observation {
  /** 0 when `newItem` is set: the item is created in the same transaction, then matched by name. */
  itemId: number;
  /** A listed item the user chose to add to the catalogue (Global, status `community`). */
  newItem?: { name: string; category: string | null };
  unitPrice: number;
  quantityObserved: number | null;
  observedAt: string;
  sourceRef: string;
  raw: string;
}

export interface Normalized {
  observations: Observation[];
  /** Listed items with a price, but no Global item of that name in the catalogue. */
  unmatched: number;
  /** Not listed, no price, or a price that is not a whole number. */
  skipped: number;
  /** Listed items not in the catalogue, returned as `newItem` observations (addMissing). */
  added: number;
}

export const sourceRef = (itemKeyValue: number) => `aion2.exchange:item/${itemKeyValue}`;
export const keyFromSourceRef = (ref: string | null) => (ref?.match(/^aion2\.exchange:item\/(\d+)$/)?.[1] ?? null);
export const serverRef = (serverId: number) => `aion2.exchange:${serverId}`;

/**
 * Current cheapest listings -> lowest_listing observations for catalogue items.
 * Items are matched by name to GLOBAL catalogue items (`catalogue`: itemKey(name, region) -> id).
 * With `addMissing`, listed items not in the catalogue are returned as `newItem` observations.
 */
export function normalizeItems(res: z.output<typeof ItemsResponse>, catalogue: Map<string, number>, addMissing = false): Normalized {
  const out: Normalized = { observations: [], unmatched: 0, skipped: 0, added: 0 };
  for (const it of res.items) {
    if (!it.listed || it.name === null || it.price === null || !Number.isSafeInteger(it.price) || it.price < 0 || !it.captured_at) {
      out.skipped++;
      continue;
    }
    const itemId = catalogue.get(itemKey(it.name, PROVIDER.gameRegion));
    if (itemId === undefined && !addMissing) {
      out.unmatched++;
      continue;
    }
    if (itemId === undefined) out.added++;
    out.observations.push({
      itemId: itemId ?? 0,
      ...(itemId === undefined && { newItem: { name: it.name, category: it.category?.name ?? null } }),
      unitPrice: it.price,
      quantityObserved: it.listings,
      observedAt: new Date(it.captured_at).toISOString(),
      sourceRef: sourceRef(it.item_key),
      raw: JSON.stringify({ item_key: it.item_key, price: it.price, listings: it.listings, captured_at: it.captured_at }),
    });
  }
  return out;
}

/** Price history -> one lowest_listing observation per bucket (the bucket's last cheapest price). */
export function normalizePrices(res: z.output<typeof PricesResponse>, itemId: number): Normalized {
  const out: Normalized = { observations: [], unmatched: 0, skipped: 0, added: 0 };
  for (const p of res.points) {
    if (!Number.isSafeInteger(p.close) || p.close < 0) {
      out.skipped++;
      continue;
    }
    out.observations.push({
      itemId,
      unitPrice: p.close,
      quantityObserved: p.listings,
      observedAt: new Date(p.ts).toISOString(),
      sourceRef: sourceRef(res.item_key),
      raw: JSON.stringify({ ts: p.ts, low: p.low, high: p.high, close: p.close, listings: p.listings, bucket: res.bucket }),
    });
  }
  return out;
}

export const SOURCE: ProviderSource = {
  name: PROVIDER.sourceName,
  url: PROVIDER.homepage,
  sourceType: "community",
  notes: "Unofficial community API. No published terms of use (checked 2026-10-31).",
};

/** INSERT OR IGNORE: the unique observation index makes a repeated refresh store nothing twice. */
export function observationStatements(marketId: number, obs: Observation[], retrievedAt: string, source: ProviderSource = SOURCE): Statement[] {
  return [
    {
      sql: `INSERT INTO data_sources (name, url, source_type, terms_or_notes, is_authorized)
            VALUES (?, ?, ?, ?, 0) ON CONFLICT (name) DO NOTHING`,
      params: [source.name, source.url, source.sourceType, source.notes],
    },
    ...obs.flatMap((o) => (o.newItem ? newItemStatements(o.newItem, source, retrievedAt) : [])),
    ...obs.map((o) => ({
      sql: `INSERT OR IGNORE INTO market_prices (item_id, market_id, price_kind, unit_price, quantity_observed, source_id,
              source_ref, observed_at, retrieved_at, raw_snapshot)
            VALUES (COALESCE(NULLIF(?, 0), (SELECT id FROM items WHERE normalized_name = ? AND game_region = 'GLOBAL')),
                    ?, 'lowest_listing', ?, ?, (SELECT id FROM data_sources WHERE name = ?), ?, ?, ?, ?)`,
      params: [o.itemId, o.newItem ? normalizeName(o.newItem.name) : null, marketId, o.unitPrice, o.quantityObserved, source.name,
        o.sourceRef, o.observedAt, retrievedAt, o.raw],
    })),
  ];
}

/** A Global catalogue item (status `community`, provenance = the provider) unless one of that name exists. */
function newItemStatements(item: { name: string; category: string | null }, source: ProviderSource, retrievedAt: string): Statement[] {
  return [
    ...(item.category ? [{ sql: "INSERT OR IGNORE INTO categories (name) VALUES (?)", params: [item.category] }] : []),
    {
      sql: `INSERT INTO items (name, normalized_name, category_id, game_region, verification_status, source_id, description)
            SELECT ?, ?, (SELECT id FROM categories WHERE name = ? AND parent_id IS NULL), 'GLOBAL', 'community',
                   (SELECT id FROM data_sources WHERE name = ?), ?
            WHERE NOT EXISTS (SELECT 1 FROM items WHERE normalized_name = ? AND game_region = 'GLOBAL')`,
      params: [item.name, normalizeName(item.name), item.category, source.name,
        `Added from the ${source.name} item list on ${retrievedAt.slice(0, 10)}. Name and category only; not verified.`,
        normalizeName(item.name)],
    },
  ];
}

// ---- Refresh policy ----

export type CacheCheck = { allowed: true } | { allowed: false; nextAt: string };

/** One refresh per server (or per item history) per hour, matching the API's own cache. */
export function canRefresh(lastRefreshAt: string | null, now: Date): CacheCheck {
  if (!lastRefreshAt) return { allowed: true };
  const next = Date.parse(lastRefreshAt) + PROVIDER.minRefreshMs;
  return Number.isNaN(next) || now.getTime() >= next ? { allowed: true } : { allowed: false, nextAt: new Date(next).toISOString() };
}

export interface ProviderStatus {
  enabled: boolean;
  acknowledgedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Summary of the last successful refresh. */
  lastResult: string | null;
  /** Per cache key ('items:<server>' or 'prices:<server>:<item>'): last request time. */
  refreshedAt: Record<string, string>;
}

export const STATUS_KEY = "provider.aion2exchange";
export const defaultStatus = (): ProviderStatus => ({
  enabled: false, acknowledgedAt: null, lastAttemptAt: null, lastSuccessAt: null, lastError: null, lastResult: null, refreshedAt: {},
});

export function readStatus(value: string | undefined): ProviderStatus {
  if (!value) return defaultStatus();
  try {
    return { ...defaultStatus(), ...JSON.parse(value) };
  } catch {
    return defaultStatus();
  }
}

export const statusStatement = (s: ProviderStatus, key = STATUS_KEY): Statement => ({
  sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  params: [key, JSON.stringify(s)],
});
