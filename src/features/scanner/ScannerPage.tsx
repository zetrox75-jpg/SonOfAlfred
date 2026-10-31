import { useMemo, useState } from "react";
import { Button, Card, EmptyState, inputCls, PageHeader, RegionBadge } from "../../components/ui";
import { scanProfits, type ScanRow } from "../../domain/calculations/scanner";
import type { Workspace } from "../../services/plan";
import { PRICE_KIND_LABEL } from "../../services/planQueries";
import { ago, pct, useMoney, useWorkspace, WithWorkspace } from "../crafting/workspace";

export default function ScannerPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <>
      <PageHeader title="Profit scanner" subtitle="Every craftable item through the crafting engine. Incomplete results are listed apart and never ranked." />
      <WithWorkspace>{(data) => <Scanner data={data} onNavigate={onNavigate} />}</WithWorkspace>
    </>
  );
}

type SortKey = "name" | "category" | "unitCost" | "sell" | "profit" | "marginPercent" | "roiPercent" | "oldestPriceAt";
const sel = "rounded border border-night-600 bg-night-950 px-2 py-1.5 text-sm";
const STATUS_STYLE = { reliable: "text-profit", unreliable: "text-stale", incomplete: "text-missing" };

function Scanner({ data, onNavigate }: { data: Workspace; onNavigate: (id: string) => void }) {
  const { choices, setChoices } = useWorkspace();
  const money = useMoney();
  const [qty, setQty] = useState("1");
  const [useInventory, setUseInventory] = useState(false);
  const [f, setF] = useState({ category: "", profession: "", verifiedOnly: false, profit: "", minMargin: "", minRoi: "", freshOnly: false });
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "profit", desc: true });
  const quantity = /^\d+$/.test(qty) && Number(qty) > 0 ? Number(qty) : 1;

  const rows = useMemo(() => scanProfits({
    targets: [...data.recipesByOutput.keys()].filter((id) => data.items.has(id)),
    quantity,
    recipesByOutput: data.recipesByOutput,
    buyPrice: (id) => data.prices.buy.get(id),
    sellPrice: (id) => data.prices.sell.get(id),
    inventory: data.inventory,
    useInventory,
    commissionBps: data.settings.commissionBps,
    valuation: choices.valuation,
  }), [data, quantity, useInventory, choices.valuation]);

  if (data.recipes.length === 0) return <EmptyState title="No recipe in the catalogue">Import or create recipes first.</EmptyState>;

  const name = (r: ScanRow) => data.items.get(r.itemId)!.name;
  const professions = (r: ScanRow) => (data.recipesByOutput.get(r.itemId) ?? []).map((x) => data.professionByRecipe.get(x.id)).filter(Boolean);
  const passes = (r: ScanRow) => {
    const item = data.items.get(r.itemId)!;
    if (f.category && item.category !== f.category) return false;
    if (f.profession && !professions(r).includes(f.profession)) return false;
    if (f.verifiedOnly && !r.recipeReliable) return false;
    if (f.freshOnly && r.issues.some((i) => i.includes("stale"))) return false;
    if (f.profit === "positive" && !((r.profit ?? -1) > 0)) return false;
    if (f.profit === "negative" && !((r.profit ?? 1) < 0)) return false;
    if (f.minMargin && !((r.marginPercent ?? -Infinity) >= Number(f.minMargin))) return false;
    if (f.minRoi && !((r.roiPercent ?? -Infinity) >= Number(f.minRoi))) return false;
    return true;
  };
  const val = (r: ScanRow): string | number => ({
    name: name(r), category: data.items.get(r.itemId)!.category ?? "", unitCost: r.unitCost ?? -Infinity, sell: r.sellPrice?.unitPrice ?? -Infinity,
    profit: r.profit ?? -Infinity, marginPercent: r.marginPercent ?? -Infinity, roiPercent: r.roiPercent ?? -Infinity, oldestPriceAt: r.oldestPriceAt ?? "",
  })[sort.key];
  const sorted = (list: ScanRow[]) => [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
    return sort.desc ? -c : c;
  });
  const complete = sorted(rows.filter((r) => r.status !== "incomplete" && passes(r)));
  const incomplete = sorted(rows.filter((r) => r.status === "incomplete" && passes(r)));
  const categories = [...new Set([...data.items.values()].map((i) => i.category).filter(Boolean))] as string[];
  const allProfessions = [...new Set([...data.professionByRecipe.values()].filter(Boolean))] as string[];
  const open = (r: ScanRow) => { setChoices((c) => ({ ...c, targetItemId: r.itemId, quantity, useInventory, strategies: new Map(), recipeChoice: new Map() })); onNavigate("calculator"); };

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-3 py-2 ${right ? "text-right" : ""}`} aria-sort={sort.key === k ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button type="button" className="uppercase hover:text-slate-200" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== "name" && k !== "category" }))}>
        {label}{sort.key === k ? (sort.desc ? " ▾" : " ▴") : ""}
      </button>
    </th>
  );
  const table = (list: ScanRow[]) => (
    <div className="overflow-x-auto rounded-lg border border-night-700">
      <table className="w-full text-sm">
        <thead className="bg-night-800 text-left text-xs tracking-wider text-slate-400">
          <tr>
            <Th k="name" label="Item" /><Th k="category" label="Category" /><Th k="unitCost" label="Unit cost" right /><Th k="sell" label="Sell price" right />
            <th className="px-3 py-2 text-right uppercase">Commission</th><Th k="profit" label="Net profit" right /><Th k="marginPercent" label="Margin" right />
            <Th k="roiPercent" label="ROI" right /><Th k="oldestPriceAt" label="Oldest price" /><th className="px-3 py-2 uppercase">Reliability</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.itemId} className="border-t border-night-700 align-top hover:bg-night-800/50">
              <td className="px-3 py-1.5"><button type="button" className="text-left text-slate-100 hover:underline" onClick={() => open(r)}>{name(r)}</button> <RegionBadge region={data.items.get(r.itemId)!.game_region} /></td>
              <td className="px-3 py-1.5 text-slate-400">{data.items.get(r.itemId)!.category ?? "-"}</td>
              <td className="num px-3 py-1.5 text-right">{r.unitCost === null ? <span className="text-missing">-</span> : money(r.unitCost, 2)}</td>
              <td className={`num px-3 py-1.5 text-right ${r.sellPrice?.stale ? "text-stale" : ""}`}>{r.sellPrice ? money(r.sellPrice.unitPrice) : <span className="text-missing">-</span>}</td>
              <td className="num px-3 py-1.5 text-right text-slate-400">{r.commission === null ? "-" : money(r.commission)}</td>
              <td className={`num px-3 py-1.5 text-right font-semibold ${r.profit === null ? "" : r.profit >= 0 ? "text-profit" : "text-loss"}`}>{r.profit === null ? "-" : money(r.profit)}</td>
              <td className="num px-3 py-1.5 text-right">{r.profit === null ? "-" : pct(r.marginPercent)}</td>
              <td className="num px-3 py-1.5 text-right">{r.profit === null ? "-" : pct(r.roiPercent)}</td>
              <td className="px-3 py-1.5 text-slate-400">{r.oldestPriceAt ? ago(r.oldestPriceAt) : "-"}</td>
              <td className={`px-3 py-1.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}{r.issues.length > 0 && <span className="block text-slate-500">{r.issues.join(" · ")}</span>}</td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={10} className="px-3 py-5 text-center text-slate-500">Nothing matches these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-night-700 bg-night-900 p-3 text-xs text-slate-400">
        <label>Simulated quantity<input aria-label="Simulated quantity" inputMode="numeric" className={`${inputCls} mt-1 w-24`} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label>Category<select aria-label="Category" className={`${sel} mt-1 block`} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Profession<select aria-label="Profession" className={`${sel} mt-1 block`} value={f.profession} onChange={(e) => setF({ ...f, profession: e.target.value })}><option value="">All</option>{allProfessions.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Profit<select aria-label="Profit sign" className={`${sel} mt-1 block`} value={f.profit} onChange={(e) => setF({ ...f, profit: e.target.value })}><option value="">All</option><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
        <label>Min margin %<input aria-label="Minimum margin" inputMode="decimal" className={`${inputCls} mt-1 w-24`} value={f.minMargin} onChange={(e) => setF({ ...f, minMargin: e.target.value })} /></label>
        <label>Min ROI %<input aria-label="Minimum ROI" inputMode="decimal" className={`${inputCls} mt-1 w-24`} value={f.minRoi} onChange={(e) => setF({ ...f, minRoi: e.target.value })} /></label>
        <div className="flex flex-col gap-1 pb-1 text-sm text-slate-300">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.verifiedOnly} onChange={(e) => setF({ ...f, verifiedOnly: e.target.checked })} /> Verified Global recipes only</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.freshOnly} onChange={(e) => setF({ ...f, freshOnly: e.target.checked })} /> Fresh prices only</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={useInventory} onChange={(e) => setUseInventory(e.target.checked)} /> Use my inventory</label>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Market: {data.market?.name ?? <Button className="px-1 py-0 text-xs" onClick={() => onNavigate("market")}>select one</Button>} · buy at {PRICE_KIND_LABEL[data.settings.buyPriceKind]}, sell at {PRICE_KIND_LABEL[data.settings.sellPriceKind]} ·
        {" "}{choices.valuation === "cash" ? "cash cost" : "economic cost"} · commission {data.settings.commissionBps === null ? "not set" : `${data.settings.commissionBps / 100} %`}. Click an item to open it in the Calculator.
      </p>

      <Card title={`Results with complete data (${complete.length})`}>{table(complete)}</Card>
      <Card title={`Incomplete results (${incomplete.length}): missing data, never ranked as opportunities`}>{table(incomplete)}</Card>
    </div>
  );
}
