import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, ErrorBox, inputCls, Loading, useAsync } from "../../components/ui";
import { buildCraftPlan, PlanError, verifiedOnly, type CraftPlan, type Strategy, type Valuation } from "../../domain/calculations/craftPlan";
import { loadWorkspace, type Workspace } from "../../services/plan";
import { addManualPrice, PRICE_KIND_LABEL, saveSettings, type ResolvedPrice } from "../../services/planQueries";
import { writeTransaction } from "../../services/catalogue";

// Shared state for Calculator, Crafting tree and Inventory: one data load, one set
// of plan choices, so nothing is typed twice.

interface PlanChoices {
  targetItemId: number | null;
  quantity: number;
  valuation: Valuation;
  useInventory: boolean;
  /** Per-analysis filter: community recipes stop counting as reliable. */
  verifiedOnly: boolean;
  strategies: Map<number, Strategy>;
  recipeChoice: Map<number, number>;
  /** Item opened in Market / History. */
  focusItemId: number | null;
}

interface Ctx {
  ws: ReturnType<typeof useAsync<Workspace>>;
  choices: PlanChoices;
  setChoices: (f: (c: PlanChoices) => PlanChoices) => void;
  plan: { plan: CraftPlan } | { error: string } | null;
  /** Runs DB writes, then reloads the workspace. Throws on failure. */
  write: (stmts: Parameters<typeof writeTransaction>[0]) => Promise<void>;
}

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const ws = useAsync(loadWorkspace);
  const [choices, setChoices] = useState<PlanChoices>({
    targetItemId: null, quantity: 1, valuation: "cash", useInventory: true, verifiedOnly: false, strategies: new Map(), recipeChoice: new Map(), focusItemId: null,
  });
  const data = ws.state === "ok" ? ws.data : null;

  const plan = useMemo(() => {
    if (!data || choices.targetItemId === null || !data.recipesByOutput.has(choices.targetItemId)) return null;
    try {
      return {
        plan: buildCraftPlan({
          targetItemId: choices.targetItemId,
          quantity: choices.quantity,
          recipesByOutput: choices.verifiedOnly ? verifiedOnly(data.recipesByOutput) : data.recipesByOutput,
          buyPrice: (id) => data.prices.buy.get(id),
          inventory: data.inventory,
          useInventory: choices.useInventory,
          strategies: choices.strategies,
          recipeChoice: choices.recipeChoice,
        }),
      };
    } catch (e) {
      if (e instanceof PlanError || e instanceof RangeError) return { error: e.message };
      throw e;
    }
  }, [data, choices]);

  const write = async (stmts: Parameters<typeof writeTransaction>[0]) => {
    await writeTransaction(stmts);
    ws.reload();
  };

  return <WorkspaceCtx.Provider value={{ ws, choices, setChoices, plan, write }}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error("useWorkspace outside WorkspaceProvider");
  return c;
}

/** Reloads on mount (catalogue or settings may have changed), then renders with data. */
export function WithWorkspace({ children }: { children: (data: Workspace) => ReactNode }) {
  const { ws } = useWorkspace();
  useEffect(() => ws.reload(), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (ws.state === "error") return <ErrorBox error={ws.error} />;
  if (ws.state === "loading") return <Loading />;
  return <>{children(ws.data)}</>;
}

// ---- Formatting ----

export function useMoney() {
  const { ws } = useWorkspace();
  const label = ws.state === "ok" ? ws.data.settings.currencyLabel : "";
  return (n: number | null | undefined, decimals = 0) =>
    n === null || n === undefined
      ? "-"
      : `${n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 0 })}${label ? ` ${label}` : ""}`;
}

export const pct = (n: number | null) => (n === null ? "not computable" : `${n.toFixed(1)} %`);
export const ago = (iso: string) => {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};

// ---- Shared controls ----

const sel = "rounded border border-night-600 bg-night-950 px-2 py-1.5 text-sm";

export function PlanControls({ data }: { data: Workspace }) {
  const { choices, setChoices, write } = useWorkspace();
  const [err, setErr] = useState<string | null>(null);
  const craftable = [...data.items.values()].filter((i) => data.recipesByOutput.has(i.id));
  const set = <K extends keyof PlanChoices>(k: K, v: PlanChoices[K]) => setChoices((c) => ({ ...c, [k]: v }));

  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-night-700 bg-night-900 p-3">
        <label className="text-xs text-slate-400">
          Item to craft
          <select aria-label="Item to craft" className={`${sel} mt-1 block min-w-64`} value={choices.targetItemId ?? ""}
            onChange={(e) => setChoices((c) => ({ ...c, targetItemId: e.target.value ? Number(e.target.value) : null, strategies: new Map(), recipeChoice: new Map() }))}>
            <option value="">Choose a craftable item...</option>
            {craftable.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.game_region})</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Quantity
          <input aria-label="Quantity" inputMode="numeric" className={`${inputCls} mt-1 w-24`} value={choices.quantity}
            onChange={(e) => /^\d{0,7}$/.test(e.target.value) && set("quantity", Number(e.target.value) || 1)} />
        </label>
        <label className="text-xs text-slate-400">
          Market (prices)
          <select aria-label="Market" className={`${sel} mt-1 block min-w-48`} value={data.market?.id ?? ""}
            onChange={async (e) => {
              setErr(null);
              try { await write(saveSettings({ activeMarketId: e.target.value ? Number(e.target.value) : null })); } catch (x) { setErr(String(x)); }
            }}>
            <option value="">No market selected</option>
            {data.markets.map((m) => <option key={m.id} value={m.id}>{[m.name, m.region, m.server, m.faction].filter(Boolean).join(" · ")}</option>)}
          </select>
        </label>
        <fieldset className="text-xs text-slate-400">
          <legend>Stock valuation</legend>
          <div className="mt-1 flex overflow-hidden rounded border border-night-600">
            {(["cash", "economic"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={choices.valuation === v} onClick={() => set("valuation", v)}
                title={v === "cash" ? "Owned materials cost nothing extra" : "Owned materials are valued at their market buy price"}
                className={`px-3 py-1.5 text-sm ${choices.valuation === v ? "bg-gold-400 font-semibold text-night-950" : "text-slate-300 hover:bg-night-700"}`}>
                {v === "cash" ? "Cash cost" : "Economic cost"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
          <input type="checkbox" checked={choices.useInventory} onChange={(e) => set("useInventory", e.target.checked)} /> Use my inventory
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-300" title="Community recipes count as reliable by default">
          <input type="checkbox" checked={choices.verifiedOnly} onChange={(e) => set("verifiedOnly", e.target.checked)} /> Verified Global recipes only
        </label>
      </div>
      {!data.market && <p className="text-sm text-stale">No market selected: every price is missing. Create a market in Settings, then pick it here.</p>}
      {err && <p className="text-sm text-loss">{err}</p>}
    </div>
  );
}

/**
 * Shows a resolved price with its kind, source and age. Click to type a new observation of the
 * kind this role uses (Settings: price method). Appended to history, never overwritten.
 */
export function PriceCell({ itemId, role, point }: { itemId: number; role: "buy" | "sell"; point: ResolvedPrice | undefined }) {
  const { ws, write } = useWorkspace();
  const money = useMoney();
  const [edit, setEdit] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const data = ws.state === "ok" ? ws.data : null;
  const market = data?.market ?? null;
  const kind = data ? (role === "buy" ? data.settings.buyPriceKind : data.settings.sellPriceKind) : "unknown";

  async function save() {
    if (edit === null || !market) return;
    if (!/^\d+$/.test(edit.trim())) return setErr("Whole number >= 0");
    try {
      await write(addManualPrice(itemId, market.id, kind, Number(edit.trim())));
      setEdit(null);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }

  if (edit !== null)
    return (
      <span className="inline-flex items-center gap-1">
        <input autoFocus aria-label="New price" inputMode="numeric" className={`${inputCls} w-28 py-0.5`} value={edit}
          onChange={(e) => setEdit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(null); }} />
        <Button className="px-2 py-0.5" variant="primary" onClick={save}>Save</Button>
        <span className="text-[11px] text-slate-500">as {PRICE_KIND_LABEL[kind]}</span>
        {err && <span className="text-xs text-loss">{err}</span>}
      </span>
    );
  return (
    <button type="button" disabled={!market} onClick={() => setEdit(point ? String(point.unitPrice) : "")}
      title={market ? `Click to enter a new ${PRICE_KIND_LABEL[kind]} (kept in history)` : "Select a market first"}
      className="group text-right disabled:cursor-not-allowed">
      {point ? <PriceLabel point={point} money={money} /> : <span className="text-missing group-hover:underline">missing · set</span>}
    </button>
  );
}

export function PriceLabel({ point, money }: { point: ResolvedPrice; money: ReturnType<typeof useMoney> }) {
  return (
    <>
      <span className="num text-slate-100 group-hover:underline">{money(point.unitPrice)}</span>
      <span className={`block text-[11px] ${point.stale ? "text-stale" : "text-slate-500"}`}
        title={`Observed ${new Date(point.observedAt).toLocaleString()} · retrieved ${new Date(point.retrievedAt).toLocaleString()}`}>
        {point.stale && "stale · "}{point.override && "override · "}{PRICE_KIND_LABEL[point.kind]} · {point.source} · {ago(point.observedAt)}
      </span>
    </>
  );
}
