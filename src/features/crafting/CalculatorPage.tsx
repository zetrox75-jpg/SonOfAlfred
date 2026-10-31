import { useState } from "react";
import { Card, EmptyState, inputCls, PageHeader, RegionBadge } from "../../components/ui";
import { profitability, type CraftPlan, type PlanLine } from "../../domain/calculations/craftPlan";
import type { Workspace } from "../../services/plan";
import { pct, PlanControls, PriceCell, useMoney, useWorkspace, WithWorkspace } from "./workspace";
import { PRICE_KIND_LABEL } from "../../services/planQueries";

export default function CalculatorPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <>
      <PageHeader title="Craft calculator" subtitle="Full crafting chain cost, shopping list and profitability. Prices come from the selected market only." />
      <WithWorkspace>{(data) => <Calculator data={data} onNavigate={onNavigate} />}</WithWorkspace>
    </>
  );
}

function Calculator({ data, onNavigate }: { data: Workspace; onNavigate: (id: string) => void }) {
  const { plan, choices } = useWorkspace();
  if (data.recipes.length === 0)
    return <EmptyState title="No recipe in the catalogue">Import or create recipes in the Catalogue first. Nothing is pre-filled.</EmptyState>;
  return (
    <>
      <PlanControls data={data} />
      {!plan && <EmptyState title="Choose an item to craft">The calculator expands its whole recipe chain, deducts your inventory and prices every material.</EmptyState>}
      {plan && "error" in plan && <p role="alert" className="rounded border border-loss/40 bg-loss/10 p-3 text-sm text-loss">{plan.error}</p>}
      {plan && "plan" in plan && <Results data={data} plan={plan.plan} quantity={choices.quantity} valuation={choices.valuation} onNavigate={onNavigate} />}
    </>
  );
}

function Issues({ data, plan }: { data: Workspace; plan: CraftPlan }) {
  const name = (id: number) => data.items.get(id)?.name ?? `#${id}`;
  const rkey = (id: number) => data.recipes.find((r) => r.id === id)?.key ?? `#${id}`;
  const list = [
    plan.missingPrices.length && `Missing buy price: ${plan.missingPrices.map(name).join(", ")}.`,
    plan.missingRecipes.length && `No usable recipe for: ${plan.missingRecipes.map(name).join(", ")} (forced craft or cycle).`,
    plan.unknownFeeRecipes.length && `Unknown craft fee in recipe: ${plan.unknownFeeRecipes.map(rkey).join(", ")}.`,
    plan.stalePrices.length && `Stale price: ${plan.stalePrices.map(name).join(", ")}.`,
    plan.unreliableRecipes.length && `Recipe not reliable for Global (not verified or community, or the "verified only" filter is on): ${plan.unreliableRecipes.map(rkey).join(", ")}.`,
    plan.cycles.length && `Recipe cycle skipped: ${plan.cycles.map((c) => c.map(name).join(" → ")).join("; ")}.`,
  ].filter(Boolean) as string[];
  return plan.reliable ? (
    <p className="rounded border border-profit/40 bg-profit/10 p-3 text-sm text-profit">Reliable: complete, fresh prices, Global recipes (verified or community).</p>
  ) : (
    <div role="alert" className="rounded border border-stale/40 bg-stale/10 p-3 text-sm text-stale">
      <p className="font-semibold">Not a reliable result</p>
      <ul className="mt-1 list-disc pl-5">{list.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

function Stat({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`num text-lg font-semibold ${tone || "text-slate-100"}`}>{value}</dd>
      {hint && <dd className="text-[11px] text-slate-500">{hint}</dd>}
    </div>
  );
}

function Results({ data, plan, quantity, valuation, onNavigate }: { data: Workspace; plan: CraftPlan; quantity: number; valuation: "cash" | "economic"; onNavigate: (id: string) => void }) {
  const money = useMoney();
  const [fixedFees, setFixedFees] = useState("0");
  const target = plan.tree.itemId;
  const item = data.items.get(target)!;
  const root = plan.lines.find((l) => l.itemId === target)!;
  const totalCost = valuation === "cash" ? plan.totals.cash : plan.totals.economic;
  const sell = data.prices.sell.get(target);
  const s = data.settings;
  const fees = /^\d+$/.test(fixedFees) ? Number(fixedFees) : 0;
  const profit = profitability({ totalCost, sellPrice: sell, quantitySold: quantity, commissionBps: s.commissionBps, fixedFees: fees });
  const rootEval = plan.evaluations.get(target)!;
  const craftUnit = totalCost === null ? null : totalCost / root.produced;
  const MISSING_LABEL = { cost: "the total cost", sell_price: "a sell price for this item", commission: "the market commission rate (Settings)" };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="text-lg font-semibold text-slate-100">{item.name}</span>
        <RegionBadge region={item.game_region} />
        <span>
          × {quantity} · {root.runs} craft(s) of {root.decision.kind === "craft" ? root.decision.recipe.outputQuantity : "?"} → produces {root.produced}
          {root.surplus > 0 && <span className="text-stale"> (surplus {root.surplus})</span>}
        </span>
      </div>
      <Issues data={data} plan={plan} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={`Cost · ${valuation === "cash" ? "cash (owned stock is free)" : "economic (owned stock at market value)"}`}>
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Materials to buy" value={money(plan.totals.purchases)} />
            <Stat label="Craft fees" value={money(plan.totals.fees)} />
            <Stat label="Stock used (value)" value={money(plan.totals.stockValue)} hint={valuation === "cash" ? "not counted in cash cost" : "counted"} />
            <Stat label="Total cost" value={money(totalCost)} tone={totalCost === null ? "text-missing" : "text-gold-300"} hint={totalCost === null ? "incomplete" : `${money(craftUnit, 2)} per unit produced`} />
          </dl>
        </Card>

        <Card title="Sale">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wider text-slate-500">Sell price per unit</dt>
              <dd className="mt-1"><PriceCell itemId={target} role="sell" point={sell} /></dd>
              <dd className="text-[11px] text-slate-500">Uses the sell price method from Settings ({PRICE_KIND_LABEL[s.sellPriceKind]}). Other kinds are never substituted.</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Commission</dt>
              <dd className="num">{s.commissionBps === null ? <button type="button" className="text-missing underline" onClick={() => onNavigate("settings")}>not set</button> : `${(s.commissionBps / 100).toFixed(2)} %`}</dd>
              {s.commissionBps !== null && <dd className="text-[11px] text-slate-500">source: {s.commissionSource || "not given"}</dd>}
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-slate-500">Fixed fees (total)</span>
              <input aria-label="Fixed fees" inputMode="numeric" className={`${inputCls} mt-1`} value={fixedFees} onChange={(e) => setFixedFees(e.target.value)} />
            </label>
          </dl>
        </Card>

        <Card title="Profitability">
          {profit.status === "incomplete" ? (
            <p className="text-sm text-missing">Not computable. Missing: {profit.missing.map((m) => MISSING_LABEL[m]).join(", ")}.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Net revenue" value={money(profit.netRevenue)} hint={`${money(profit.grossRevenue)} − ${money(profit.commission)} commission`} />
              <Stat label="Net profit" value={money(profit.profit)} tone={profit.profit >= 0 ? "text-profit" : "text-loss"} />
              <Stat label="Net margin" value={pct(profit.marginPercent)} />
              <Stat label="ROI" value={pct(profit.roiPercent)} />
              <Stat label="Break-even price" value={money(profit.breakEvenUnitPrice)} hint="per unit, after commission and fees (rounded up)" />
              <Stat label="Units sold" value={String(quantity)} hint={root.surplus ? `surplus of ${root.surplus} not counted` : undefined} />
            </dl>
          )}
        </Card>
      </div>

      <Card title="Buy directly or craft?">
        <p className="text-sm">
          Buy price: {rootEval.buy ? money(rootEval.buy.unitPrice) : <span className="text-missing">missing</span>} · Crafting cost per unit: {rootEval.unitCost === null ? <span className="text-missing">incomplete</span> : money(rootEval.unitCost, 2)}
          {" · "}
          {rootEval.buy && rootEval.unitCost !== null
            ? <strong className={rootEval.buy.unitPrice < rootEval.unitCost ? "text-stale" : "text-profit"}>{rootEval.buy.unitPrice < rootEval.unitCost ? "Buying is cheaper" : "Crafting is cheaper"}</strong>
            : <span className="text-missing">comparison incomplete</span>}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Crafting cost per unit values every material at market price, without batch rounding or stock, so it compares fairly with the buy price.
          Per-component comparisons are on the Crafting tree page.
        </p>
      </Card>

      <ShoppingList data={data} plan={plan} />
    </div>
  );
}

const decisionLabel = (l: PlanLine) =>
  l.decision.kind === "craft" ? `craft ×${l.runs}` : l.decision.kind === "buy" ? "buy" : l.decision.reason === "no_price" ? "buy (no price)" : l.decision.reason === "cycle" ? "cycle" : "no recipe";

function ShoppingList({ data, plan }: { data: Workspace; plan: CraftPlan }) {
  const money = useMoney();
  return (
    <Card title="Materials and shopping list (pooled across the whole chain)">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2 pr-3">Item</th><th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3 text-right">Required</th><th className="py-2 pr-3 text-right">Owned</th>
              <th className="py-2 pr-3 text-right">From stock</th><th className="py-2 pr-3 text-right">To buy</th>
              <th className="py-2 pr-3 text-right">Unit buy price</th><th className="py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {plan.lines.map((l) => {
              const owned = data.inventory.get(l.itemId) ?? 0;
              const missing = l.purchaseCost === null;
              return (
                <tr key={l.itemId} className="border-t border-night-700 align-top">
                  <td className="py-1.5 pr-3 text-slate-100">{data.items.get(l.itemId)?.name}</td>
                  <td className={`py-1.5 pr-3 ${l.decision.kind === "missing" ? "text-missing" : "text-slate-300"}`}>
                    {decisionLabel(l)}{l.surplus > 0 && <span className="text-stale"> (+{l.surplus} surplus)</span>}
                  </td>
                  <td className="num py-1.5 pr-3 text-right">{l.required}</td>
                  <td className="num py-1.5 pr-3 text-right text-slate-400">{owned}</td>
                  <td className="num py-1.5 pr-3 text-right">{l.fromStock || ""}</td>
                  <td className="num py-1.5 pr-3 text-right font-semibold">{l.toBuy || ""}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {l.decision.kind !== "craft" || l.buyPrice ? <PriceCell itemId={l.itemId} role="buy" point={data.prices.buy.get(l.itemId)} /> : <span className="text-slate-600">-</span>}
                  </td>
                  <td className={`num py-1.5 text-right ${missing ? "text-missing" : ""}`}>
                    {l.decision.kind === "craft" ? (l.fees === null ? <span className="text-missing">fee unknown</span> : `fee ${money(l.fees)}`) : missing ? "missing" : money(l.purchaseCost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
