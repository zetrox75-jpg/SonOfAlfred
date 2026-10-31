import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, EmptyState, ErrorBox, inputCls, Loading, PageHeader, useAsync } from "../../components/ui";
import type { PriceKind } from "../../domain/models";
import { getDb } from "../../services/db";
import type { Workspace } from "../../services/plan";
import { HISTORY_SQL, historySummary, PRICE_KIND_LABEL, tierOf, type HistoryRow } from "../../services/planQueries";
import { useMoney, useWorkspace, WithWorkspace } from "../crafting/workspace";
import { ProviderHistoryButton } from "./ProviderPanel";

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="History" subtitle="Every recorded observation, never overwritten. One line per price kind; markets are never mixed." />
      <WithWorkspace>{(data) => <History data={data} />}</WithWorkspace>
    </>
  );
}

// Distinct, colour-blind friendly hues; listings vs sales also differ by dash.
const KIND_STYLE: Record<PriceKind, { color: string; dash?: string }> = {
  lowest_listing: { color: "#6fa8d6" },
  typical_listing: { color: "#a6cdee", dash: "4 3" },
  median_listing: { color: "#8f9bd6", dash: "2 2" },
  sale_price: { color: "#d1ad5b" },
  estimate: { color: "#9aa3b2", dash: "6 4" },
  unknown: { color: "#5c6577", dash: "1 3" },
};

function History({ data }: { data: Workspace }) {
  const { choices, setChoices, ws } = useWorkspace();
  const item = choices.focusItemId === null ? null : data.items.get(choices.focusItemId) ?? null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-night-700 bg-night-900 p-3">
        <label className="text-xs text-slate-400">Item
          <input aria-label="Item" list="history-items" className={`${inputCls} mt-1 block min-w-72`} defaultValue={item?.name ?? ""}
            onChange={(e) => {
              const found = [...data.items.values()].find((i) => i.name === e.target.value);
              if (found) setChoices((c) => ({ ...c, focusItemId: found.id }));
            }} />
          <datalist id="history-items">{[...data.items.values()].map((i) => <option key={i.id} value={i.name} />)}</datalist>
        </label>
        <p className="pb-2 text-sm text-slate-400">
          Market: {data.market ? <strong className="text-slate-200">{[data.market.name, data.market.region, data.market.server, data.market.faction].filter(Boolean).join(" · ")}</strong> : <span className="text-stale">none selected (Market page)</span>}
        </p>
      </div>
      {!data.market || !item ? (
        <EmptyState title="Choose an item">{data.market ? "Its price history in the selected market appears here." : "Select a market first on the Market / Prices page."}</EmptyState>
      ) : (
        <>
          <ProviderHistoryButton data={data} itemId={item.id} onLoaded={ws.reload} />
          <ItemHistory key={`${item.id}-${data.market.id}-${data.priceRows.length}`} itemId={item.id} marketId={data.market.id} gapHours={data.settings.freshnessHours} />
        </>
      )}
    </div>
  );
}

function ItemHistory({ itemId, marketId, gapHours }: { itemId: number; marketId: number; gapHours: number }) {
  const money = useMoney();
  const q = useAsync(async () => (await getDb()).select<HistoryRow[]>(HISTORY_SQL, [itemId, marketId]));
  if (q.state === "loading") return <Loading />;
  if (q.state === "error") return <ErrorBox error={q.error} />;
  const rows = q.data;
  if (rows.length === 0) return <EmptyState title="No observation">Record prices on the Market / Prices page or import a price CSV.</EmptyState>;

  const s = historySummary(rows, gapHours);
  const kinds = [...new Set(rows.map((r) => r.price_kind))];
  // One point per observation; each kind is its own series (no interpolation across kinds).
  const points = rows.map((r) => ({ t: Date.parse(r.observed_at), [r.price_kind]: r.unit_price }));
  const fmtT = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <Card title="Coverage">
        <p className="text-sm">
          {s.count} observation(s) from <strong>{new Date(s.from!).toLocaleString()}</strong> to <strong>{new Date(s.to!).toLocaleString()}</strong>.
        </p>
        {s.gaps.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-sm text-stale">
            {s.gaps.map((g) => <li key={g.from}>Gap of {g.hours} h with no observation: {new Date(g.from).toLocaleString()} → {new Date(g.to).toLocaleString()}</li>)}
          </ul>
        ) : s.count > 1 && <p className="mt-1 text-xs text-slate-500">No gap longer than {gapHours} h.</p>}
      </Card>

      {rows.length < 2 ? (
        <p className="text-sm text-slate-500">A chart appears once there are at least two observations.</p>
      ) : (
        <Card title="Price over time">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#212b3d" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtT} stroke="#9aa3b2" fontSize={11} />
                <YAxis stroke="#9aa3b2" fontSize={11} tickFormatter={(v: number) => v.toLocaleString()} width={70} />
                <Tooltip
                  labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                  formatter={(v, name) => [money(Number(v)), PRICE_KIND_LABEL[name as PriceKind]]}
                  contentStyle={{ background: "#0f1520", border: "1px solid #2f3b52", color: "#d7dde8" }}
                />
                <Legend formatter={(k) => PRICE_KIND_LABEL[k as PriceKind]} />
                {kinds.map((k) => (
                  <Line key={k} dataKey={k} name={k} stroke={KIND_STYLE[k].color} strokeDasharray={KIND_STYLE[k].dash} connectNulls dot={{ r: 3 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card title="Observations">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="py-1.5 pr-3">Observed</th><th className="py-1.5 pr-3">Kind</th><th className="py-1.5 pr-3 text-right">Unit price</th><th className="py-1.5 pr-3 text-right">Qty</th><th className="py-1.5 pr-3">Source</th><th className="py-1.5">Comment</th></tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.id} className="border-t border-night-700">
                <td className="num py-1 pr-3">{new Date(r.observed_at).toLocaleString()}</td>
                <td className="py-1 pr-3">{PRICE_KIND_LABEL[r.price_kind]}{r.is_override === 1 && <span className="ml-1 text-xs text-gold-300">override</span>}</td>
                <td className="num py-1 pr-3 text-right">{money(r.unit_price)}</td>
                <td className="num py-1 pr-3 text-right">{r.quantity_observed ?? ""}</td>
                <td className="py-1 pr-3">{r.source} <span className="text-xs text-slate-500">({tierOf(r.source_type)})</span></td>
                <td className="py-1 text-slate-400">{r.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
