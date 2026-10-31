import { useMemo, useState } from "react";
import { itemMatches, ItemName } from "../../components/item";
import { Button, Card, EmptyState, ErrorBox, ErrorList, inputCls, Loading, PageHeader, RegionBadge, StatusBadge, useAsync } from "../../components/ui";
import { GameRegion, VerificationStatus } from "../../domain/models";
import { normalizeName } from "../../domain/validation/catalogue";
import { setRecipeArchived, type ItemRowDb, type RecipeRowDb } from "../../services/catalogueStatements";
import { loadNames, loadSnapshot, loadSources, writeTransaction } from "../../services/catalogue";
import { ItemForm, RecipeForm, type Lists } from "./forms";
import { tr } from "../../i18n";


async function loadAll() {
  const [snap, categories, professions, sources] = await Promise.all([
    loadSnapshot(), loadNames("categories"), loadNames("professions"), loadSources(),
  ]);
  return { snap, lists: { categories, professions, sources } satisfies Lists };
}

type Dialog = { kind: "item"; item?: ItemRowDb } | { kind: "recipe"; output: ItemRowDb; recipe?: RecipeRowDb } | null;

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "never");
const sel = "rounded border border-night-600 bg-night-950 px-2 py-1.5 text-sm";

export default function CataloguePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const q = useAsync(loadAll);
  const [filters, setFilters] = useState({ text: "", region: "", status: "", category: "", profession: "", maxLevel: "", archived: false, sort: "name" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters((p) => ({ ...p, [k]: e.target.value }));

  const data = q.state === "ok" ? q.data : null;
  const recipesByOutput = useMemo(() => {
    const m = new Map<number, RecipeRowDb[]>();
    for (const r of data?.snap.recipeRows ?? []) m.set(r.output_item_id, [...(m.get(r.output_item_id) ?? []), r]);
    return m;
  }, [data]);

  const items = useMemo(() => {
    if (!data) return [];
    const text = normalizeName(filters.text);
    const maxLevel = filters.maxLevel === "" ? null : Number(filters.maxLevel);
    const out = data.snap.itemRows.filter((i) => {
      if (!filters.archived && i.archived_at) return false;
      if (text && !itemMatches(i.name, text)) return false;
      if (filters.region && i.game_region !== filters.region) return false;
      if (filters.status && i.verification_status !== filters.status) return false;
      if (filters.category && i.category !== filters.category) return false;
      if (filters.profession || maxLevel !== null) {
        const rs = (recipesByOutput.get(i.id) ?? []).filter((r) => filters.archived || !r.archived_at);
        return rs.some((r) =>
          (!filters.profession || r.profession === filters.profession) &&
          (maxLevel === null || (r.required_level !== null && r.required_level <= maxLevel)));
      }
      return true;
    });
    if (filters.sort === "category") out.sort((a, b) => (a.category ?? "￿").localeCompare(b.category ?? "￿") || a.name.localeCompare(b.name));
    return out;
  }, [data, filters, recipesByOutput]);

  if (q.state === "loading") return <Loading />;
  if (q.state === "error") return <ErrorBox error={q.error} />;
  const { snap, lists } = q.data;
  const selected = snap.itemRows.find((i) => i.id === selectedId) ?? null;
  const done = () => { setDialog(null); q.reload(); };

  async function archive(r: RecipeRowDb, archived: boolean) {
    setActionError(null);
    try {
      await writeTransaction(setRecipeArchived(r.recipe_key, archived));
      q.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <PageHeader title={tr("Catalogue")} subtitle={`${snap.itemRows.length} items · ${snap.recipeRows.length} recipes in the local database`} />

      {snap.itemRows.length === 0 ? (
        <EmptyState title={tr("No item yet")}>
          <p>{tr("Nothing is pre-filled: no AION 2 data is invented. Import items and recipes from CSV, or create them by hand.")}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="primary" onClick={() => onNavigate("import")}>{tr("Go to Import / Export")}</Button>
            <Button onClick={() => setDialog({ kind: "item" })}>{tr("New item")}</Button>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <input aria-label={tr("Search by name")} placeholder={tr("Search by name...")} className={`${inputCls} min-w-48 flex-1`} value={filters.text} onChange={set("text")} />
              <Button variant="primary" onClick={() => setDialog({ kind: "item" })}>{tr("New item")}</Button>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <select aria-label={tr("Region")} className={sel} value={filters.region} onChange={set("region")}>
                <option value="">{tr("All regions")}</option>{GameRegion.options.map((r) => <option key={r}>{r}</option>)}
              </select>
              <select aria-label={tr("Verification status")} className={sel} value={filters.status} onChange={set("status")}>
                <option value="">{tr("All statuses")}</option>{VerificationStatus.options.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select aria-label={tr("Category")} className={sel} value={filters.category} onChange={set("category")}>
                <option value="">{tr("All categories")}</option>{lists.categories.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select aria-label={tr("Profession")} className={sel} value={filters.profession} onChange={set("profession")}>
                <option value="">{tr("All professions")}</option>{lists.professions.map((p) => <option key={p}>{p}</option>)}
              </select>
              <input aria-label={tr("Maximum required level")} placeholder={tr("Max level")} inputMode="numeric" className={`${sel} w-24`} value={filters.maxLevel} onChange={set("maxLevel")} />
              <select aria-label={tr("Sort")} className={sel} value={filters.sort} onChange={set("sort")}>
                <option value="name">{tr("Sort: name")}</option><option value="category">{tr("Sort: category")}</option>
              </select>
              <label className="flex items-center gap-1.5 text-slate-400">
                <input type="checkbox" checked={filters.archived} onChange={(e) => setFilters((p) => ({ ...p, archived: e.target.checked }))} /> {tr("Show archived")}
              </label>
            </div>

            <div className="overflow-hidden rounded-lg border border-night-700">
              <table className="w-full text-sm">
                <thead className="bg-night-800/90 text-left text-xs uppercase tracking-wider text-gold-300/80">
                  <tr><th className="px-3 py-2">{tr("Name")}</th><th className="px-3 py-2">{tr("Category")}</th><th className="px-3 py-2">{tr("Region")}</th><th className="px-3 py-2">{tr("Status")}</th><th className="px-3 py-2 text-right">{tr("Recipes")}</th></tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr
                      key={i.id}
                      tabIndex={0}
                      aria-selected={i.id === selectedId}
                      onClick={() => setSelectedId(i.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedId(i.id)}
                      className={`cursor-pointer border-t border-night-700 ${i.id === selectedId ? "bg-night-700" : "hover:bg-night-800"} ${i.archived_at ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2 text-slate-100"><ItemName name={i.name} /></td>
                      <td className="px-3 py-2 text-slate-400">{i.category ?? "-"}</td>
                      <td className="px-3 py-2"><RegionBadge region={i.game_region} /></td>
                      <td className="px-3 py-2"><StatusBadge status={i.verification_status} /></td>
                      <td className="num px-3 py-2 text-right">{(recipesByOutput.get(i.id) ?? []).filter((r) => !r.archived_at).length}</td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">{tr("No item matches these filters.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            {actionError && <div className="mb-3"><ErrorList errors={[{ line: null, message: actionError }]} /></div>}
            {selected ? (
              <ItemSheet
                item={selected}
                recipes={recipesByOutput.get(selected.id) ?? []}
                usedIn={snap.recipeRows.filter((r) => r.game_region === selected.game_region && r.ingredients.some((g) => normalizeName(g.item) === normalizeName(selected.name)))}
                showArchived={filters.archived}
                onEditItem={() => setDialog({ kind: "item", item: selected })}
                onNewRecipe={() => setDialog({ kind: "recipe", output: selected })}
                onEditRecipe={(r) => setDialog({ kind: "recipe", output: selected, recipe: r })}
                onArchive={archive}
                onOpen={(name) => setSelectedId(snap.itemRows.find((i) => i.game_region === selected.game_region && normalizeName(i.name) === normalizeName(name))?.id ?? null)}
              />
            ) : (
              <EmptyState title={tr("Select an item")}>{tr("Its details, the recipes that produce it and the recipes that use it appear here.")}</EmptyState>
            )}
          </div>
        </div>
      )}

      {dialog?.kind === "item" && <ItemForm existing={dialog.item} snapshot={snap} lists={lists} onSaved={done} onClose={() => setDialog(null)} />}
      {dialog?.kind === "recipe" && <RecipeForm output={dialog.output} existing={dialog.recipe} snapshot={snap} lists={lists} onSaved={done} onClose={() => setDialog(null)} />}
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (<><dt className="text-slate-500">{label}</dt><dd className="text-slate-200">{children}</dd></>);
}

function ItemSheet({ item, recipes, usedIn, showArchived, onEditItem, onNewRecipe, onEditRecipe, onArchive, onOpen }: {
  item: ItemRowDb;
  recipes: RecipeRowDb[];
  usedIn: RecipeRowDb[];
  showArchived: boolean;
  onEditItem: () => void;
  onNewRecipe: () => void;
  onEditRecipe: (r: RecipeRowDb) => void;
  onArchive: (r: RecipeRowDb, archived: boolean) => void;
  onOpen: (itemName: string) => void;
}) {
  const visible = recipes.filter((r) => showArchived || !r.archived_at);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">{item.name}</h2>
            <div className="mt-1 flex gap-2"><RegionBadge region={item.game_region} /><StatusBadge status={item.verification_status} /></div>
          </div>
          <Button onClick={onEditItem}>{tr("Edit item")}</Button>
        </div>
        {item.description && <p className="mt-3 text-sm text-slate-400">{item.description}</p>}
        <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <Meta label={tr("Category")}>{item.category ?? "-"}</Meta>
          <Meta label={tr("Game version")}>{item.game_version ?? tr("unknown")}</Meta>
          <Meta label={tr("Source")}>{item.source_url ? <a className="text-frost-300 underline" href={item.source_url} target="_blank" rel="noreferrer">{item.source_name}</a> : item.source_name} <span className="text-slate-500">({item.source_type})</span></Meta>
          <Meta label={tr("Verified on")}>{fmtDate(item.last_verified_at)}</Meta>
        </dl>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{tr("Recipes producing this item (")}{visible.length})</h3>
        <Button variant="primary" onClick={onNewRecipe}>{tr("Add recipe")}</Button>
      </div>
      {visible.length === 0 && <p className="text-sm text-slate-500">{tr("No recipe: this item is treated as a raw material (bought or gathered).")}</p>}
      {visible.map((r) => (
        <Card key={r.id} className={r.archived_at ? "opacity-60" : ""}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">{r.recipe_key}</span>
            <StatusBadge status={r.verification_status} />
            {r.archived_at && <span className="text-xs text-stale">{tr("archived")}</span>}
            <span className="ml-auto flex gap-2">
              <Button onClick={() => onEditRecipe(r)}>{tr("Edit")}</Button>
              <Button variant={r.archived_at ? "secondary" : "danger"} onClick={() => onArchive(r, !r.archived_at)}>{r.archived_at ? tr("Restore") : tr("Archive")}</Button>
            </span>
          </div>
          <dl className="num mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <Meta label={tr("Yield per craft")}>{r.output_quantity}</Meta>
            <Meta label={tr("Profession")}>{r.profession ?? "-"}{r.required_level !== null && ` · level ${r.required_level}`}</Meta>
            <Meta label={tr("Craft fee")}>{r.craft_fee ?? <span className="text-missing">{tr("unknown")}</span>}</Meta>
            <Meta label={tr("Source")}>{r.source_name} <span className="text-slate-500">({r.source_type}{tr(") · verified")} {fmtDate(r.last_verified_at)}{r.game_version && ` · v${r.game_version}`}</span></Meta>
          </dl>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1 font-normal">{tr("Ingredient")}</th><th className="py-1 text-right font-normal">{tr("Qty per craft")}</th></tr></thead>
            <tbody>
              {r.ingredients.map((g) => (
                <tr key={g.item} className="border-t border-night-700">
                  <td className="py-1"><button type="button" className="text-frost-300 hover:underline" onClick={() => onOpen(g.item)}>{g.item}</button></td>
                  <td className="num py-1 text-right">{g.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.notes && <p className="mt-2 text-xs text-slate-500">{r.notes}</p>}
        </Card>
      ))}

      {usedIn.length > 0 && (
        <Card title={`Used as ingredient in (${usedIn.length})`}>
          <ul className="space-y-1 text-sm">
            {usedIn.map((r) => (
              <li key={r.id}><button type="button" className="text-frost-300 hover:underline" onClick={() => onOpen(r.output_item)}>{r.output_item}</button> <span className="font-mono text-xs text-slate-500">{r.recipe_key}</span></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
