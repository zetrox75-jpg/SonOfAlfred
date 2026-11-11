import { useState } from "react";
import { itemLabel, itemMatches, ItemName } from "../../components/item";
import { Button, Card, EmptyState, inputCls, PageHeader, RegionBadge } from "../../components/ui";
import { inventoryAfterCraft, profitability, type CraftPlan } from "../../domain/calculations/craftPlan";
import { realizedProfit } from "../../domain/calculations/profit";
import { normalizeName } from "../../domain/validation/catalogue";
import type { Workspace } from "../../services/plan";
import { deleteCraftLog, logCraft, recordSale, setInventory, type CraftLogRow } from "../../services/planQueries";
import { useMoney, useWorkspace, WithWorkspace } from "./workspace";
import { tr } from "../../i18n";


export default function InventoryPage() {
  return (
    <>
      <PageHeader title={tr("Inventory")} subtitle={tr("What you own. The Calculator and Crafting tree deduct it automatically (toggle “Use my inventory” there).")} />
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

/** Applies the current plan to the stock after the player crafted it in game. Two clicks: arm, then confirm. */
function MarkCrafted({ plan, data }: { plan: CraftPlan; data: Workspace }) {
  const { write, choices } = useWorkspace();
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const after = inventoryAfterCraft(plan, data.inventory);
  if (plan.missingRecipes.length) return <p className="mt-2 text-xs text-stale">{tr("An item in this plan has no usable recipe: it cannot be crafted as planned.")}</p>;
  async function apply() {
    if (!armed) return setArmed(true);
    try {
      // Freeze cost and estimate as the Calculator shows them now, for the whole batch produced.
      const target = plan.tree.itemId;
      const produced = plan.lines.find((l) => l.itemId === target)!.produced;
      const totalCost = choices.valuation === "cash" ? plan.totals.cash : plan.totals.economic;
      const sell = data.prices.sell.get(target);
      const est = profitability({ totalCost, sellPrice: sell, quantitySold: produced, commissionBps: data.settings.commissionBps, fixedFees: 0 });
      await write([
        ...[...after].flatMap(([id, n]) => setInventory(id, n)),
        ...logCraft({
          itemId: target, quantity: produced, marketId: data.market?.id ?? null, totalCost, valuation: choices.valuation,
          estUnitPrice: sell?.unitPrice ?? null, estProfit: est.status === "complete" ? est.profit : null,
        }),
      ]);
      setArmed(false);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }
  return (
    <div className="mt-3 space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button variant={armed ? "primary" : "secondary"} onClick={apply}>{armed ? tr("Confirm: update {n} owned quantity(ies)", { n: after.size }) : tr("Mark plan as crafted")}</Button>
        {armed && <Button onClick={() => setArmed(false)}>{tr("Cancel")}</Button>}
      </div>
      <p className="text-xs text-slate-500">{tr("After crafting in game: removes the stock used, adds what you crafted and any batch surplus.")}</p>
      {err && <p className="text-xs text-loss">{err}</p>}
    </div>
  );
}

/** One logged craft: frozen estimate, then the real sale typed in by the user. */
function LogRow({ row, data }: { row: CraftLogRow; data: Workspace }) {
  const { write } = useWorkspace();
  const money = useMoney();
  const [qty, setQty] = useState(String(row.sold_quantity ?? row.quantity));
  const [price, setPrice] = useState(row.sold_unit_price === null ? "" : String(row.sold_unit_price));
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bps = data.settings.commissionBps;
  const sold = row.sold_quantity !== null && row.sold_unit_price !== null && row.sold_commission_bps !== null
    ? realizedProfit(row.total_cost, row.quantity, row.sold_quantity, row.sold_unit_price, row.sold_commission_bps)
    : null;
  const run = async (f: () => Promise<void>) => { try { await f(); setErr(null); } catch (e) { setErr(String(e)); } };
  const save = () => run(async () => {
    if (bps === null) throw tr("Set the commission in Settings first.");
    if (!/^\d+$/.test(qty) || !/^\d+$/.test(price) || Number(qty) < 1 || Number(qty) > row.quantity) throw tr("Whole numbers; quantity from 1 to {n}.", { n: row.quantity });
    await write(recordSale(row.id, Number(qty), Number(price), bps));
  });
  const num = `${inputCls} num w-20 py-0.5 text-right`;
  return (
    <tr className="border-t border-night-700 align-top">
      <td className="px-3 py-1.5 text-slate-400">{row.crafted_at.slice(0, 10)}</td>
      <td className="px-3 py-1.5 text-slate-100"><ItemName name={data.items.get(row.item_id)?.name ?? `#${row.item_id}`} /></td>
      <td className="num px-3 py-1.5 text-right">{row.quantity}</td>
      <td className={`num px-3 py-1.5 text-right ${row.total_cost === null ? "text-missing" : ""}`}>{row.total_cost === null ? tr("incomplete") : money(row.total_cost)}</td>
      <td className={`num px-3 py-1.5 text-right ${row.est_profit === null ? "text-missing" : ""}`}>{row.est_profit === null ? tr("incomplete") : money(row.est_profit)}</td>
      <td className="px-3 py-1.5">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <input aria-label={tr("Quantity sold")} inputMode="numeric" className={num} value={qty} onChange={(e) => setQty(e.target.value)} />
          ×
          <input aria-label={tr("Real unit sale price")} placeholder={tr("unit price")} inputMode="numeric" className={num} value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <Button className="px-2 py-0.5 text-xs" onClick={save}>{tr("Save sale")}</Button>
        </span>
        {err && <span className="block text-xs text-loss">{err}</span>}
      </td>
      <td className={`num px-3 py-1.5 text-right font-semibold ${!sold || sold.profit === null ? "" : sold.profit >= 0 ? "text-profit" : "text-loss"}`}>
        {!sold ? "-" : sold.profit === null ? <span className="font-normal text-missing">{tr("cost unknown")}</span> : money(sold.profit)}
        {sold && <span className="block text-[11px] font-normal text-slate-500">{tr("net revenue")} {money(sold.revenue)}</span>}
      </td>
      <td className="px-3 py-1.5 text-right">
        <Button variant="danger" className="px-2 py-0.5 text-xs" onClick={() => (armed ? run(() => write(deleteCraftLog(row.id))) : setArmed(true))}>{armed ? tr("Confirm") : tr("Delete")}</Button>
      </td>
    </tr>
  );
}

function CraftLog({ data }: { data: Workspace }) {
  if (data.craftLog.length === 0) return null;
  return (
    <Card title={tr("Craft log")}>
      <p className="mb-2 text-xs text-slate-500">{tr("Estimate frozen when you marked the plan as crafted. Type the real sale to compare. Latest 50.")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-gold-300/80">
            <tr>
              <th className="px-3 py-2">{tr("Crafted")}</th><th className="px-3 py-2">{tr("Item")}</th><th className="px-3 py-2 text-right">{tr("Quantity")}</th>
              <th className="px-3 py-2 text-right">{tr("Total cost")}</th><th className="px-3 py-2 text-right">{tr("Estimated profit")}</th>
              <th className="px-3 py-2">{tr("Real sale")}</th><th className="px-3 py-2 text-right">{tr("Real profit")}</th><th />
            </tr>
          </thead>
          <tbody>{data.craftLog.map((r) => <LogRow key={`${r.id}-${r.sold_at}`} row={r} data={data} />)}</tbody>
        </table>
      </div>
    </Card>
  );
}

function Inventory({ data }: { data: Workspace }) {
  const { plan } = useWorkspace();
  const money = useMoney();
  const [text, setText] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const lines = plan && "plan" in plan ? new Map(plan.plan.lines.map((l) => [l.itemId, l])) : null;

  if (data.items.size === 0) return <EmptyState title={tr("No item in the catalogue")}>{tr("Create or import items first; then record what you own here.")}</EmptyState>;

  const q = normalizeName(text);
  const rows = [...data.items.values()].filter(
    (i) => itemMatches(i.name, q) && (!ownedOnly || (data.inventory.get(i.id) ?? 0) > 0) ,
  );
  const owned = [...data.inventory.entries()].filter(([id]) => data.items.has(id));
  const unpriced = owned.filter(([id]) => !data.prices.buy.has(id));
  const total = owned.reduce((s, [id, n]) => s + (data.prices.buy.get(id)?.unitPrice ?? 0) * n, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-widest text-slate-400">{tr("Items owned")}</p><p className="num mt-2 text-3xl font-semibold">{owned.length}</p></Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-slate-400">{tr("Estimated stock value")}</p>
          <p className="num mt-2 text-3xl font-semibold">{!data.market ? "-" : unpriced.length ? tr("incomplete") : money(total)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {!data.market ? tr("Select a market in the Calculator to value stock.") : unpriced.length ? `${money(total)} known; ${unpriced.length} owned item(s) have no buy price in ${data.market.name}.` : `Buy prices in ${data.market.name}`}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-widest text-slate-400">{tr("Current plan")}</p>
          <p className="mt-2 text-sm text-slate-300">
            {lines ? tr("{item}: required, from stock and still to buy are shown per item below.", { item: itemLabel(data.items.get(plan && "plan" in plan ? plan.plan.tree.itemId : 0)?.name ?? "") }) : tr("No plan selected. Choose an item in the Calculator to see what your stock covers.")}
          </p>
          {plan && "plan" in plan && <MarkCrafted plan={plan.plan} data={data} />}
        </Card>
      </div>

      <CraftLog data={data} />

      <div className="flex flex-wrap items-center gap-3">
        <input aria-label={tr("Search items")} placeholder={tr("Search items...")} className={`${inputCls} max-w-sm`} value={text} onChange={(e) => setText(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm text-slate-400"><input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} /> {tr("Owned only")}</label>
      </div>

      <div className="overflow-hidden rounded-lg border border-night-700">
        <table className="w-full text-sm">
          <thead className="bg-night-800/90 text-left text-xs uppercase tracking-wider text-gold-300/80">
            <tr>
              <th className="px-3 py-2">{tr("Item")}</th><th className="px-3 py-2">{tr("Region")}</th><th className="px-3 py-2">{tr("Owned")}</th>
              <th className="px-3 py-2 text-right">{tr("Unit buy price")}</th><th className="px-3 py-2 text-right">{tr("Stock value")}</th>
              {lines && <><th className="px-3 py-2 text-right">{tr("Plan needs")}</th><th className="px-3 py-2 text-right">{tr("From stock")}</th><th className="px-3 py-2 text-right">{tr("Still to buy")}</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const n = data.inventory.get(i.id) ?? 0;
              const price = data.prices.buy.get(i.id);
              const l = lines?.get(i.id);
              return (
                <tr key={i.id} className="border-t border-night-700">
                  <td className="px-3 py-1.5 text-slate-100"><ItemName name={i.name} /></td>
                  <td className="px-3 py-1.5"><RegionBadge region={i.game_region} /></td>
                  <td className="px-3 py-1.5"><QtyInput key={`${i.id}-${n}`} itemId={i.id} value={n} name={i.name} /></td>
                  <td className={`num px-3 py-1.5 text-right ${price ? (price.stale ? "text-stale" : "") : "text-missing"}`}>{price ? money(price.unitPrice) : tr("missing")}</td>
                  <td className="num px-3 py-1.5 text-right">{n === 0 ? "" : price ? money(price.unitPrice * n) : <span className="text-missing">{tr("unknown")}</span>}</td>
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
