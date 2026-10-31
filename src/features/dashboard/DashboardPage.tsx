import { getDashboardStats, type DashboardStats } from "../../services/db";
import { Card, EmptyState, ErrorBox, Loading, PageHeader, useAsync } from "../../components/ui";
import { scanProfits } from "../../domain/calculations/scanner";
import type { Workspace } from "../../services/plan";
import { pct, useMoney, useWorkspace, WithWorkspace } from "../crafting/workspace";

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
      <p className="num mt-2 text-3xl font-semibold text-slate-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

function alerts(s: DashboardStats): string[] {
  const out: string[] = [];
  if (s.recipes > 0 && s.verifiedGlobalRecipes === 0) out.push("No recipe is verified for AION 2 Global yet: no result can be marked reliable.");
  if (s.nonGlobalRecipes > 0) out.push(`${s.nonGlobalRecipes} recipe(s) come from a non-Global region (KR/TW/other). They are excluded from reliable analyses.`);
  if (s.recipes > 0 && s.priceObservations === 0) out.push("No market price recorded: costs and profits cannot be computed.");
  return out;
}

export default function DashboardPage() {
  const q = useAsync(getDashboardStats);
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Computed from your local database only. No figure here is estimated or invented." />
      {q.state === "loading" && <Loading />}
      {q.state === "error" && <ErrorBox error={q.error} />}
      {q.state === "ok" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Kpi label="Recipes" value={q.data.recipes} hint="Active (not archived)" />
            <Kpi label="Verified Global" value={q.data.verifiedGlobalRecipes} hint="Status verified, region Global" />
            <Kpi label="Items with a price" value={q.data.pricedItems} hint={`${q.data.priceObservations} observation(s)`} />
            <Kpi
              label="Last price update"
              value={q.data.lastPriceAt ? new Date(q.data.lastPriceAt).toLocaleDateString() : "None"}
              hint={q.data.lastPriceAt ? new Date(q.data.lastPriceAt).toLocaleTimeString() : "No observation yet"}
            />
          </div>

          <WithWorkspace>{(data) => <Opportunities data={data} />}</WithWorkspace>

          {alerts(q.data).length > 0 && (
            <Card title="Alerts">
              <ul className="space-y-2 text-sm text-stale">
                {alerts(q.data).map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            </Card>
          )}

          {q.data.recipes === 0 && (
            <EmptyState title="Your catalogue is empty">
              The application ships with no AION 2 recipe on purpose: no recipe, quantity or price is invented. Recipes
              will come from CSV/JSON import with a source and a verification status (Import / Export, build step 2).
            </EmptyState>
          )}
        </div>
      )}
    </>
  );
}

/** README 4.1: counts and best opportunities, from reliable results only (quantity 1). */
function Opportunities({ data }: { data: Workspace }) {
  const { choices } = useWorkspace();
  const money = useMoney();
  const rows = scanProfits({
    targets: [...data.recipesByOutput.keys()].filter((id) => data.items.has(id)),
    quantity: 1,
    recipesByOutput: data.recipesByOutput,
    buyPrice: (id) => data.prices.buy.get(id),
    sellPrice: (id) => data.prices.sell.get(id),
    inventory: data.inventory,
    useInventory: false,
    commissionBps: data.settings.commissionBps,
    valuation: choices.valuation,
  });
  const reliable = rows.filter((r) => r.status === "reliable" && (r.profit ?? 0) > 0).sort((a, b) => b.profit! - a.profit!);
  const incomplete = rows.filter((r) => r.status === "incomplete").length;
  const unreliable = rows.filter((r) => r.status === "unreliable").length;
  return (
    <Card title={`Profitable crafts · ${data.market ? data.market.name : "no market selected"}`}>
      <p className="num text-3xl font-semibold text-profit">{reliable.length}</p>
      <p className="text-xs text-slate-500">reliable and profitable at quantity 1 · {unreliable} with stale or unverified data · {incomplete} incomplete</p>
      {reliable.length > 0 && (
        <ol className="mt-3 space-y-1 text-sm">
          {reliable.slice(0, 5).map((r) => (
            <li key={r.itemId} className="flex justify-between gap-3">
              <span>{data.items.get(r.itemId)!.name}</span>
              <span className="num text-profit">{money(r.profit)} · {pct(r.marginPercent)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
