import type { PriceKind } from "../../domain/models";
import type { Observation } from "./aion2exchange";

// README 16.3: market integrations go through independent provider adapters. The UI and the
// calculation engine only see stored, normalized observations; a provider only fetches.

/** One normalized observation (README 16.4); stored as `market_prices` rows of the provider's source. */
export type NormalizedPrice = Observation;

export interface ProviderSource {
  /** `data_sources.name`; shown next to every price. */
  name: string;
  url: string;
  sourceType: "official" | "community";
  notes: string;
  /** `data_sources.is_authorized`: the user explicitly authorized this source. */
  authorized: boolean;
}

/** What the provider is asked for: one exact server of one market, and the catalogue to match. */
export interface PriceContext {
  serverId: number;
  /** itemKey(name, region) -> catalogue item id */
  catalogue: Map<string, number>;
  /** Also return listed items missing from the catalogue, as `newItem` observations. */
  addMissing?: boolean;
}

export interface MarketDataProvider {
  /** Also the prefix of `markets.provider_server` ("<id>:<serverId>"). */
  id: string;
  source: ProviderSource;
  capabilities: { priceKinds: readonly PriceKind[]; history: boolean };
  /** The only place a provider may use the network. `note` is a short coverage summary for the user. */
  fetchPrices(context: PriceContext): Promise<NormalizedPrice[] & { note?: string }>;
}

const registry = new Map<string, MarketDataProvider>();

export const registerProvider = (p: MarketDataProvider) => void registry.set(p.id, p);
export const providerById = (id: string) => registry.get(id);

export function providerFor(providerServer: string | null): { provider: MarketDataProvider; serverId: number } {
  const m = providerServer?.match(/^(.+):(\d+)$/);
  const provider = m && registry.get(m[1]);
  if (!m || !provider) throw new Error("This market is not linked to an automatic price provider.");
  return { provider, serverId: Number(m[2]) };
}

/** Settings key of a provider's status (enabled, last refresh...). Kept as before for aion2.exchange. */
export const statusKeyOf = (providerId: string) => `provider.${providerId.replace(/\./g, "")}`;
