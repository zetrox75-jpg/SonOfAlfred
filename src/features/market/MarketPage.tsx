import { useState } from "react";
import { Button, Card, EmptyState, Field, inputCls, PageHeader, RegionBadge } from "../../components/ui";
import { PriceKind } from "../../domain/models";
import { normalizeName } from "../../domain/validation/catalogue";
import type { Workspace } from "../../services/plan";
import { addManualPrice, PRICE_KIND_LABEL, resolveKind, saveSettings, type ResolvedPrice } from "../../services/planQueries";
import { PriceLabel, useMoney, useWorkspace, WithWorkspace } from "../crafting/workspace";
import { ProviderMarketCard } from "./ProviderPanel";

export default function MarketPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <>
      <PageHeader title="Market / Prices" subtitle="Prices per market (region · server · faction), by kind. A listing is never treated as a completed sale." />
      <WithWorkspace>{(data) => <Market data={data} onNavigate={onNavigate} />}</WithWorkspace>
    </>
  );
}

const sel = "rounded border border-night-600 bg-night-950 px-2 py-1.5 text-sm";
const SHOWN: PriceKind[] = ["lowest_listing", "typical_listing", "median_listing", "sale_price", "estimate"];

function Market({ data, onNavigate }: { data: Workspace; onNavigate: (id: string) => void }) {
  const { write, setChoices } = useWorkspace();
  const money = useMoney();
  const [text, setText] = useState("");
  const [pricedOnly, setPricedOnly] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = new Date();
  const byKind = new Map(SHOWN.map((k) => [k, resolveKind(data.priceRows, k, now, data.settings.freshnessHours)]));
  const save = async (stmts: Parameters<typeof write>[0]) => {
    setErr(null);
    try { await write(stmts); } catch (e) { setErr(String(e)); }
  };

  const q = normalizeName(text);
  const items = [...data.items.values()].filter(
    (i) => (!q || normalizeName(i.name).includes(q)) && (!pricedOnly || SHOWN.some((k) => byKind.get(k)!.has(i.id))),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-night-700 bg-night-900 p-3">
        <label className="text-xs text-slate-400">Market
          <select aria-label="Market" className={`${sel} mt-1 block min-w-56`} value={data.market?.id ?? ""}
            onChange={(e) => save(saveSettings({ activeMarketId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">No market selected</option>
            {data.markets.map((m) => <option key={m.id} value={m.id}>{[m.name, m.region, m.server, m.faction].filter(Boolean).join(" · ")}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">Buy price method (cost of materials)
          <select aria-label="Buy price method" className={`${sel} mt-1 block`} value={data.settings.buyPriceKind}
            onChange={(e) => save(saveSettings({ buyPriceKind: e.target.value as PriceKind }))}>
            {SHOWN.map((k) => <option key={k} value={k}>{PRICE_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">Sell price method (value of products)
          <select aria-label="Sell price method" className={`${sel} mt-1 block`} value={data.settings.sellPriceKind}
            onChange={(e) => save(saveSettings({ sellPriceKind: e.target.value as PriceKind }))}>
            {SHOWN.map((k) => <option key={k} value={k}>{PRICE_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <p className="max-w-md pb-1 text-xs text-slate-500">
          The calculator uses exactly these kinds in this market. If none exists for an item, the price is missing: no other kind, server or faction is used instead.
        </p>
      </div>
      {err && <p role="alert" className="text-sm text-loss">{err}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ProviderMarketCard data={data} />
        <Card title="Freshness">
          <p className="text-sm text-slate-400">
            Prices older than <strong className="text-slate-200">{data.settings.freshnessHours} h</strong> are marked <span className="text-stale">stale</span> and
            never make a result reliable. Change the limit in Settings.
          </p>
        </Card>
      </div>

      {!data.market ? (
        <EmptyState title="Select a market">Create one in Settings (region, server, faction), then select it above.</EmptyState>
      ) : (
        <>
          <ManualEntry data={data} />
          <div className="flex flex-wrap items-center gap-3">
            <input aria-label="Search items" placeholder="Search items..." className={`${inputCls} max-w-sm`} value={text} onChange={(e) => setText(e.target.value)} />
            <label className="flex items-center gap-1.5 text-sm text-slate-400"><input type="checkbox" checked={pricedOnly} onChange={(e) => setPricedOnly(e.target.checked)} /> With a price only</label>
          </div>
          <div className="overflow-x-auto rounded-lg border border-night-700">
            <table className="w-full text-sm">
              <thead className="bg-night-800 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  {SHOWN.map((k) => <th key={k} className="px-3 py-2 text-right">{PRICE_KIND_LABEL[k]}</th>)}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-night-700 align-top">
                    <td className="px-3 py-1.5 text-slate-100">{i.name} <RegionBadge region={i.game_region} /></td>
                    {SHOWN.map((k) => {
                      const p: ResolvedPrice | undefined = byKind.get(k)!.get(i.id);
                      return <td key={k} className="px-3 py-1.5 text-right">{p ? <PriceLabel point={p} money={money} /> : <span className="text-slate-600">-</span>}</td>;
                    })}
                    <td className="px-3 py-1.5">
                      <Button className="px-2 py-0.5 text-xs" onClick={() => { setChoices((c) => ({ ...c, focusItemId: i.id })); onNavigate("history"); }}>History</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ManualEntry({ data }: { data: Workspace }) {
  const { write } = useWorkspace();
  const blank = { item: "", kind: data.settings.buyPriceKind as PriceKind, price: "", quantity: "", observedAt: "", comment: "", override: false };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const item = [...data.items.values()].find((i) => i.name === f.item);

  async function save() {
    if (!item) return setMsg({ ok: false, text: "Pick an existing item." });
    if (!/^\d+$/.test(f.price.trim())) return setMsg({ ok: false, text: "Price: whole number >= 0 in the smallest currency unit." });
    if (f.quantity && !/^\d+$/.test(f.quantity.trim())) return setMsg({ ok: false, text: "Quantity: whole number." });
    try {
      await write(addManualPrice(item.id, data.market!.id, f.kind, Number(f.price), {
        quantity: f.quantity ? Number(f.quantity) : null,
        comment: f.comment.trim() || null,
        observedAt: f.observedAt || undefined,
        override: f.override,
      }));
      setMsg({ ok: true, text: `Saved ${PRICE_KIND_LABEL[f.kind]} for ${item.name}.` });
      setF({ ...blank, kind: f.kind });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
  }

  return (
    <Card title={`Record a price in ${data.market!.name}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Field label="Item *">
          <input list="market-items" className={inputCls} value={f.item} onChange={set("item")} />
          <datalist id="market-items">{[...data.items.values()].map((i) => <option key={i.id} value={i.name}>{i.game_region}</option>)}</datalist>
        </Field>
        <Field label="What you saw *">
          <select className={inputCls} value={f.kind} onChange={set("kind")}>
            {SHOWN.map((k) => <option key={k} value={k}>{PRICE_KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Unit price *"><input inputMode="numeric" className={inputCls} value={f.price} onChange={set("price")} /></Field>
        <Field label="Quantity observed"><input inputMode="numeric" className={inputCls} value={f.quantity} onChange={set("quantity")} /></Field>
        <Field label="Observed at" hint="Empty = now"><input type="datetime-local" className={inputCls} value={f.observedAt} onChange={set("observedAt")} /></Field>
        <Field label="Comment"><input className={inputCls} value={f.comment} onChange={set("comment")} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <label className="mr-auto flex items-center gap-1.5 text-sm text-slate-400" title="Use this price even when an automatic source has a fresher one">
          <input type="checkbox" checked={f.override} onChange={(e) => setF((p) => ({ ...p, override: e.target.checked }))} /> Manual override
        </label>
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-profit" : "text-loss"}`}>{msg.text}</span>}
        <Button variant="primary" onClick={save}>Save price</Button>
      </div>
    </Card>
  );
}
