import { useState } from "react";
import { itemLabel, ItemName } from "../../components/item";
import { Card, EmptyState, PageHeader } from "../../components/ui";
import type { CraftPlan, ItemEvaluation, Strategy, TreeNode } from "../../domain/calculations/craftPlan";
import type { Workspace } from "../../services/plan";
import { PlanControls, PriceCell, useMoney, useWorkspace, WithWorkspace } from "./workspace";
import { tr } from "../../i18n";


export default function TreePage() {
  return (
    <>
      <PageHeader title={tr("Crafting tree")} subtitle={tr("Every component, recursively. Choose buy, craft or cheapest per component; the Calculator uses the same choices.")} />
      <WithWorkspace>{(data) => <Tree data={data} />}</WithWorkspace>
    </>
  );
}

function Tree({ data }: { data: Workspace }) {
  const { plan } = useWorkspace();
  if (data.recipes.length === 0) return <EmptyState title={tr("No recipe in the catalogue")}>{tr("Import or create recipes in the Catalogue first.")}</EmptyState>;
  return (
    <>
      <PlanControls data={data} />
      {!plan && <EmptyState title={tr("Choose an item to craft")}>{tr("Its full dependency tree appears here.")}</EmptyState>}
      {plan && "error" in plan && <p role="alert" className="rounded border border-loss/40 bg-loss/10 p-3 text-sm text-loss">{plan.error}</p>}
      {plan && "plan" in plan && (
        <div className="space-y-4">
          <Card title={tr("Dependency tree")}>
            <p className="mb-3 text-xs text-slate-500">
              {tr("Quantities and costs per branch. A")} <span className="text-frost-300">{tr("shared")}</span> {tr("item is used in several branches; its stock, batches and purchases are pooled once in the Calculator's shopping list. Branch costs value materials at market price.")}
            </p>
            <div role="tree" aria-label={tr("Crafting tree")} className="text-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_6rem_9rem_9rem_8rem] gap-2 border-b border-night-700 pb-2 text-xs uppercase tracking-wider text-slate-500">
                <span>{tr("Item")}</span><span className="text-right">{tr("Quantity")}</span><span>{tr("Strategy")}</span><span>{tr("Recipe")}</span><span className="text-right">{tr("Branch cost")}</span>
              </div>
              <Node node={plan.plan.tree} depth={0} data={data} plan={plan.plan} />
            </div>
          </Card>
          <BuyOrCraft data={data} plan={plan.plan} />
        </div>
      )}
    </>
  );
}

const sel = "w-full rounded border border-night-600 bg-night-950 px-1.5 py-0.5 text-xs";

function Node({ node, depth, data, plan }: { node: TreeNode; depth: number; data: Workspace; plan: CraftPlan }) {
  const { choices, setChoices } = useWorkspace();
  const money = useMoney();
  const [open, setOpen] = useState(depth < 3);
  const recipes = data.recipesByOutput.get(node.itemId) ?? [];
  const isRoot = depth === 0;
  const d = node.decision;
  const setMap = <K, V>(key: "strategies" | "recipeChoice", k: K, v: V | null) =>
    setChoices((c) => {
      const m = new Map(c[key] as Map<K, V>);
      if (v === null) m.delete(k);
      else m.set(k, v);
      return { ...c, [key]: m };
    });

  const kind =
    d.kind === "craft" ? <span className="text-frost-300">{tr("craft")}</span>
    : d.kind === "buy" ? <span className="text-slate-300">{tr("buy")}</span>
    : <span className="text-missing">{d.reason === "no_price" ? (recipes.length ? tr("no price") : tr("raw · no price")) : d.reason === "cycle" ? tr("cycle") : tr("no recipe")}</span>;

  return (
    <div role="treeitem" aria-expanded={node.children.length ? open : undefined} aria-level={depth + 1}>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem_9rem_9rem_8rem] items-center gap-2 border-b border-night-800 py-1.5 hover:bg-night-800/50">
        <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
          {node.children.length ? (
            <button type="button" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} className="w-4 text-slate-500 hover:text-slate-200">{open ? "▾" : "▸"}</button>
          ) : <span className="w-4 text-center text-slate-700">·</span>}
          <ItemName name={data.items.get(node.itemId)?.name ?? `#${node.itemId}`} size={isRoot ? "md" : "sm"} className={isRoot ? "font-semibold text-gold-300" : "text-slate-100"} />
          <span className="text-xs">{kind}</span>
          {node.shared && <span className="rounded bg-frost-400/15 px-1 text-[10px] text-frost-300" title={tr("Also used in another branch")}>{tr("shared")}</span>}
        </span>
        <span className="num text-right">{node.demand}</span>
        <span>
          {isRoot ? <span className="text-xs text-slate-500">{tr("craft (target)")}</span> : (
            <select aria-label={`Strategy for ${data.items.get(node.itemId)?.name}`} className={sel}
              value={choices.strategies.get(node.itemId) ?? "auto"}
              onChange={(e) => setMap<number, Strategy>("strategies", node.itemId, e.target.value === "auto" ? null : (e.target.value as Strategy))}>
              <option value="auto">{tr("auto (cheapest)")}</option>
              <option value="buy">{tr("buy")}</option>
              <option value="craft" disabled={!recipes.length}>{tr("craft")}</option>
            </select>
          )}
        </span>
        <span>
          {recipes.length > 1 ? (
            <select aria-label={`Recipe for ${data.items.get(node.itemId)?.name}`} className={sel}
              value={choices.recipeChoice.get(node.itemId) ?? ""}
              onChange={(e) => setMap<number, number>("recipeChoice", node.itemId, e.target.value ? Number(e.target.value) : null)}>
              <option value="">{tr("cheapest")}</option>
              {recipes.map((r) => <option key={r.id} value={r.id}>{r.key}</option>)}
            </select>
          ) : d.kind === "craft" ? <span className="truncate font-mono text-xs text-slate-500">{d.recipe.key}</span> : null}
        </span>
        <span className={`num text-right ${node.branchCost === null ? "text-missing" : ""}`}>{node.branchCost === null ? tr("incomplete") : money(node.branchCost, 2)}</span>
      </div>
      {open && node.children.map((c, i) => <Node key={`${c.itemId}-${i}`} node={c} depth={depth + 1} data={data} plan={plan} />)}
    </div>
  );
}

function BuyOrCraft({ data, plan }: { data: Workspace; plan: CraftPlan }) {
  const money = useMoney();
  const name = (id: number) => itemLabel(data.items.get(id)?.name ?? `#${id}`);
  const rows = [...plan.evaluations.values()].filter((e) => e.crafts.length > 0 || (data.recipesByOutput.get(e.itemId)?.length ?? 0) > 0);

  const verdict = (e: ItemEvaluation) => {
    const complete = e.crafts.filter((c) => c.unitCost !== null).sort((a, b) => a.unitCost! - b.unitCost!);
    const missing = new Set<number>();
    if (!e.buy) missing.add(e.itemId);
    for (const c of e.crafts) for (const i of c.recipe.ingredients) if (plan.evaluations.get(i.itemId)?.unitCost === null) missing.add(i.itemId);
    if (!e.buy || !complete.length)
      return (
        <span className="text-missing">
          {tr("comparison incomplete · missing:")} {[...missing].map((id) => (id === e.itemId ? `${name(id)} buy price` : `${name(id)} price`)).join(", ") || tr("craft fee")}
        </span>
      );
    return e.buy.unitPrice <= complete[0].unitCost!
      ? <span className="text-stale">{tr("buy (")}{money(complete[0].unitCost! - e.buy.unitPrice, 2)} {tr("cheaper per unit)")}</span>
      : <span className="text-profit">{tr("craft with")} {complete[0].recipe.key} ({money(e.buy.unitPrice - complete[0].unitCost!, 2)} {tr("cheaper per unit)")}</span>;
  };

  return (
    <Card title={tr("Buy or craft? (per component, market prices, per unit)")}>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
          <tr><th className="py-2 pr-3">{tr("Component")}</th><th className="py-2 pr-3 text-right">{tr("Buy price")}</th><th className="py-2 pr-3">{tr("Craft cost per recipe")}</th><th className="py-2">{tr("Cheaper option")}</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.itemId} className="border-t border-night-700 align-top">
              <td className="py-1.5 pr-3 text-slate-100">{name(e.itemId)}</td>
              <td className="py-1.5 pr-3 text-right"><PriceCell itemId={e.itemId} role="buy" point={data.prices.buy.get(e.itemId)} /></td>
              <td className="py-1.5 pr-3">
                {e.crafts.length === 0 ? <span className="text-slate-500">{tr("not evaluated (set to buy)")}</span> : e.crafts.map((c) => (
                  <div key={c.recipe.id} className="num">
                    <span className="font-mono text-xs text-slate-500">{c.recipe.key}</span>{" "}
                    {c.cycle ? <span className="text-missing">{tr("cycle")}</span> : c.unitCost === null ? <span className="text-missing">{tr("incomplete")}</span> : money(c.unitCost, 2)}
                    {c.recipe.craftFee === null && <span className="text-missing"> {tr("(fee unknown)")}</span>}
                  </div>
                ))}
              </td>
              <td className="py-1.5">{verdict(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
