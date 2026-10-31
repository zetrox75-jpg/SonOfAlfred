import { useState } from "react";
import { Button, Card, ErrorBox, Loading, useAsync } from "../../components/ui";
import type { Workspace } from "../../services/plan";
import { PROVIDER, canRefresh, type ProviderServer } from "../../services/market/aion2exchange";
import { createMarketForServer, fetchServers, loadHistory, loadStatus, refreshMarket, setEnabled } from "../../services/market/refresh";
import { useWorkspace } from "../crafting/workspace";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

/** README 16.3 status panel + safeguard 9: unofficial source, user must review the operator's conditions. */
export function ProviderSettingsCard() {
  const q = useAsync(loadStatus);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async (on: boolean) => {
    setErr(null);
    try { await setEnabled(on); setAck(false); q.reload(); } catch (e) { setErr(String(e)); }
  };
  return (
    <Card title="Automatic prices: aion2.exchange">
      {q.state === "loading" && <Loading />}
      {q.state === "error" && <ErrorBox error={q.error} />}
      {q.state === "ok" && (
        <div className="space-y-3 text-sm">
          <div className="rounded border border-stale/40 bg-stale/10 p-3 text-stale">
            <p className="font-semibold">Unofficial source. Review its conditions before enabling.</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              <li>aion2.exchange is a community service, not NCSOFT. It publishes no terms of use (checked 2026-10-31).</li>
              <li>Its robots.txt allows general clients but sets <code>use=reference</code>, whose meaning is not defined. Permission to use it in this app is <strong>not confirmed</strong>; check with the operator.</li>
              <li>Prices are the <strong>cheapest active listings</strong> per server, never completed sales.</li>
              <li>When enabled, the app sends only GET requests to {PROVIDER.base}/servers, /items and /items/&#123;id&#125;/prices, only when you press a button, at most once per hour per request, identifying itself as “{PROVIDER.userAgent}”.</li>
            </ul>
            <a className="mt-1 inline-block text-xs underline" href={PROVIDER.homepage} target="_blank" rel="noreferrer">{PROVIDER.homepage}</a>
          </div>
          <p>Status: {q.data.enabled ? <strong className="text-profit">enabled</strong> : <strong className="text-slate-300">disabled</strong>}
            {q.data.enabled && q.data.acknowledgedAt && <span className="text-slate-500"> · enabled on {when(q.data.acknowledgedAt)}</span>}</p>
          <dl className="grid grid-cols-[9rem_1fr] gap-y-0.5 text-xs">
            <dt className="text-slate-500">Last attempt</dt><dd>{when(q.data.lastAttemptAt)}</dd>
            <dt className="text-slate-500">Last success</dt><dd>{when(q.data.lastSuccessAt)}{q.data.lastResult && <span className="text-slate-400"> · {q.data.lastResult}</span>}</dd>
            <dt className="text-slate-500">Last error</dt><dd className={q.data.lastError ? "text-loss" : ""}>{q.data.lastError ?? "none"}</dd>
          </dl>
          {q.data.enabled ? (
            <div className="flex justify-end"><Button onClick={() => toggle(false)}>Disable</Button></div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <label className="mr-auto flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                I have reviewed the operator's usage conditions and accept that permission is unconfirmed.
              </label>
              <Button variant="primary" disabled={!ack} onClick={() => toggle(true)}>Enable</Button>
            </div>
          )}
          {err && <p className="text-loss">{err}</p>}
        </div>
      )}
    </Card>
  );
}

/** Market page: link a market to one server, refresh it on request. */
export function ProviderMarketCard({ data }: { data: Workspace }) {
  const { ws } = useWorkspace();
  const q = useAsync(loadStatus);
  const [servers, setServers] = useState<ProviderServer[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (f: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await f();
      if (r) setMsg({ ok: true, text: r });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      q.reload();
      ws.reload();
    }
  };

  if (q.state !== "ok") return <Card title="Automatic prices">{q.state === "error" ? <ErrorBox error={q.error} /> : <Loading />}</Card>;
  const s = q.data;
  const market = data.market;
  const linked = new Set(data.markets.map((m) => m.provider_server).filter(Boolean));
  const serverId = market?.provider_server?.match(/(\d+)$/)?.[1];
  const next = serverId ? canRefresh(s.refreshedAt[`items:${serverId}`] ?? null, new Date()) : null;

  return (
    <Card title="Automatic prices: aion2.exchange (unofficial)">
      {!s.enabled ? (
        <p className="text-sm text-slate-400">Disabled. Read the notice and enable it in Settings. Manual entry and CSV import keep working without it.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {market?.provider_server ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>“{market.name}” receives the cheapest listings of server <strong>{market.server}</strong> ({market.faction}).</span>
              <Button variant="primary" disabled={busy || (next !== null && !next.allowed)}
                onClick={() => run(() => refreshMarket({ id: market.id, name: market.name, provider_server: market.provider_server }))}>
                {busy ? "Refreshing..." : "Refresh prices"}
              </Button>
              {next && !next.allowed && <span className="text-xs text-slate-500">cached; next refresh after {new Date(next.nextAt).toLocaleTimeString()}</span>}
            </div>
          ) : (
            <p className="text-slate-400">{market ? `“${market.name}” is not linked to a server: it only holds manual and imported prices.` : "No market selected."}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-night-700 pt-3">
            <span className="text-xs text-slate-500">New market bound to one server (region, server and faction come from the API):</span>
            {servers ? (
              <>
                <select aria-label="Server" className="rounded border border-night-600 bg-night-950 px-2 py-1 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose a server...</option>
                  {servers.filter((x) => !linked.has(`aion2.exchange:${x.server_id}`)).map((x) => (
                    <option key={x.server_id} value={x.server_id}>{x.region} · {x.name} · {x.faction}{x.has_data ? "" : " (no data)"}</option>
                  ))}
                </select>
                <Button disabled={!pick || busy} onClick={() => run(async () => {
                  const srv = servers.find((x) => String(x.server_id) === pick)!;
                  await createMarketForServer(srv);
                  setPick("");
                  return `Market created for ${srv.name} · ${srv.faction}. Select it above, then refresh.`;
                })}>Create market</Button>
              </>
            ) : (
              <Button disabled={busy} onClick={() => run(async () => { setServers(await fetchServers()); })}>Load server list</Button>
            )}
          </div>
          {msg && <p role="status" className={msg.ok ? "text-profit" : "text-loss"}>{msg.text}</p>}
        </div>
      )}
    </Card>
  );
}

/** History page: 7-day cheapest-listing history for one item, on request. */
export function ProviderHistoryButton({ data, itemId, onLoaded }: { data: Workspace; itemId: number; onLoaded: () => void }) {
  const q = useAsync(loadStatus);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const market = data.market;
  if (q.state !== "ok" || !q.data.enabled || !market?.provider_server) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Button disabled={busy} onClick={async () => {
        setBusy(true);
        setMsg(null);
        try { setMsg({ ok: true, text: await loadHistory(market, itemId) }); onLoaded(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); q.reload(); }
      }}>{busy ? "Loading..." : "Load 7-day history from aion2.exchange"}</Button>
      {msg && <span role="status" className={msg.ok ? "text-profit" : "text-loss"}>{msg.text}</span>}
    </div>
  );
}
