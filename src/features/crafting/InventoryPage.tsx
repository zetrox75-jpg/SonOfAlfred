import { useState } from "react";
import { Card, EmptyState, inputCls, PageHeader, RegionBadge } from "../../components/ui";
import { normalizeName } from "../../domain/validation/catalogue";
import type { Workspace } from "../../services/plan";
import { setInventory } from "../../services/planQueries";
import { useMoney, useWorkspace, WithWorkspace } from "./workspace";

export default function InventoryPage() {
  return (
    <>
      <PageHeader title="Inventory" subtitle="What you own. The Calculator and Crafting tree deduct it automatically (toggle “Use my inventory” there)." />
      <WithWorkspace>{(data) => <Inventory data={data} />}</WithWorkspace>
    </>
  );
}

function QtyInput({ itemId, value, name }: { itemId: number; value: number; name: string }) {
  const { write } = useWorkspace();
  const [v, setV] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  async function commit() {
    if (v.trim() === String(value)) return;
    if (!/^\d+$/.test(v.trim())) return setErr("whole number >= 0");
    try {
      await write(setInventory(itemId, Number(v.trim())));
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input aria-label={`Owned quantity of ${name}`} inputMode="numeric" className={`${inputCls} num w-24 py-0.5 text-right`} value={v}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      {err && <span className="text-xs text-loss">{err}</span>}
    </span>
  );
}

function Inventory({ data }: { data: Workspace }) {
  const { plan } = useWorkspace();
  const money = useMoney();
  const [text, setText] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const lines = plan && "plan" in plan ? new Map(plan.plan.lines.map((l) => [l.itemId, l])) : null;

  if (data.items.size === 0) return <EmptyState title="No item in the catalogue">Create or import items first; then record what you own here.</EmptyState>;

  const q = normalizeName(text);
  const rows = [...data.items.values()].filter(
    (i) => (!q || normalizeName(i.name).includes(q)) && (!ownedOnly || (data.inventory.get(i.id) ?? 0) > 0) ,
  );
  const owned = [...data.inventory.entries()].filter(([id]) => data.items.has(id));
  const unpriced = owned.filter(([id]) => !data.prices.buy.has(id));
  const total = owned.reduce((s, [id, n]) => s + (data.prices.buy.get(id)?.unitPrice ?? 0) * n, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-widest text-slate-400">Items owned</p><p className="num mt-2 text-3xl font-semibold">{owned.length}</p></Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-slate-400">Estimated stock value</p>
          <p className="num mt-2 text-3xl font-semibold">{!data.market ? "-" : unpriced.length ? "incomplete" : money(total)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {!data.market ? "Select a market in the Calculator to value stock." : unpriced.length ? `${money(total)} known; ${unpriced.length} owned item(s) have no buy price in ${data.market.name}.` : `Buy prices in ${data.market.name}`}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-slate-400">Current plan</p>
          <p className="mt-2 text-sm text-slate-300">
            {lines ? `${data.items.get(plan && "plan" in plan ? plan.plan.tree.itemId : 0)?.name}: required, from stock and still to buy are shown per item below.` : "No plan selected. Choose an item in the Calculator to see what your stock covers."}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Search items" placeholder="Search items..." className={`${inputCls} max-w-sm`} value={text} onChange={(e) => setText(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm text-slate-400"><input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} /> Owned only</label>
      </div>

      <div className="overflow-hidden rounded-lg border border-night-700">
        <table className="w-full text-sm">
          <thead className="bg-night-800 text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2">Item</th><th className="px-3 py-2">Region</th><th className="px-3 py-2">Owned</th>
              <th className="px-3 py-2 text-right">Unit buy price</th><th className="px-3 py-2 text-right">Stock value</th>
              {lines && <><th className="px-3 py-2 text-right">Plan needs</th><th className="px-3 py-2 text-right">From stock</th><th className="px-3 py-2 text-right">Still to buy</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const n = data.inventory.get(i.id) ?? 0;
              const price = data.prices.buy.get(i.id);
              const l = lines?.get(i.id);
              return (
                <tr key={i.id} className="border-t border-night-700">
                  <td className="px-3 py-1.5 text-slate-100">{i.name}</td>
                  <td className="px-3 py-1.5"><RegionBadge region={i.game_region} /></td>
                  <td className="px-3 py-1.5"><QtyInput key={`${i.id}-${n}`} itemId={i.id} value={n} name={i.name} /></td>
                  <td className={`num px-3 py-1.5 text-right ${price ? (price.stale ? "text-stale" : "") : "text-missing"}`}>{price ? money(price.unitPrice) : "missing"}</td>
                  <td className="num px-3 py-1.5 text-right">{n === 0 ? "" : price ? money(price.unitPrice * n) : <span className="text-missing">unknown</span>}</td>
                  {lines && <>
                    <td className="num px-3 py-1.5 text-right">{l?.required ?? ""}</td>
                    <td className="num px-3 py-1.5 text-right">{l?.fromStock || ""}</td>
                    <td className="num px-3 py-1.5 text-right font-semibold">{l?.toBuy || ""}</td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
