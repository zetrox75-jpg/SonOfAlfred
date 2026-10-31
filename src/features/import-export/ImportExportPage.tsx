import { useState } from "react";
import { Button, Card, ErrorList, PageHeader } from "../../components/ui";
import { parseCsv, toCsv } from "../../services/csv";
import {
  diffItems,
  diffRecipes,
  ITEM_COLUMNS,
  parseItemsCsv,
  parseRecipesCsv,
  RECIPE_COLUMNS,
  recipesToRows,
  type Change,
  type ImportError,
} from "../../domain/validation/catalogue";
import { upsertItem, upsertRecipe } from "../../services/catalogueStatements";
import { itemKey } from "../../domain/validation/catalogue";
import { parseInventoryCsv, parsePricesCsv, type MarketLookup } from "../../domain/validation/market";
import { importPriceStatements, PRICE_KIND_LABEL, setInventory } from "../../services/planQueries";
import { loadSources } from "../../services/catalogue";
import { loadWorkspace } from "../../services/plan";
import pricesTemplate from "../../../data/templates/prices.csv?raw";
import inventoryTemplate from "../../../data/templates/inventory.csv?raw";
import { exportAllJson, loadSnapshot, saveTextFile, writeTransaction } from "../../services/catalogue";
import itemsTemplate from "../../../data/templates/items.csv?raw";
import recipesTemplate from "../../../data/templates/recipes.csv?raw";
import demoItems from "../../../data/templates/demo/demo_items.csv?raw";
import demoRecipes from "../../../data/templates/demo/demo_recipes.csv?raw";
import { CraftingGraph, craftingGraphStatements, GRAPH_SOURCE, type GraphImport, type Race } from "../../services/craftingGraph";

type Kind = "items" | "recipes" | "prices" | "inventory";
const KIND_LABEL: Record<Kind, string> = { items: "Items", recipes: "Recipes", prices: "Prices", inventory: "Inventory" };

/** Every import kind is shown and written the same way: rows to review, then one write. */
interface Preview {
  file: string;
  headers: string[];
  rows: { action: "create" | "update" | "unchanged"; cells: string[] }[];
  /** Runs the transaction and returns the report line. */
  write: () => Promise<string>;
}

const changeRows = <T extends { game_region: string }>(changes: Change<T>[], label: (i: T) => string) =>
  changes.map((c) => ({ action: c.action, cells: [label(c.input), c.input.game_region, c.changedFields.join(", ")] }));

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ACTION_STYLE = { create: "text-profit", update: "text-stale", unchanged: "text-slate-500" };

export default function ImportExportPage() {
  const [kind, setKind] = useState<Kind>("items");
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function saveFile(name: string, text: string | (() => Promise<string>)) {
    setSaved(null);
    setErrors([]);
    try {
      const path = await saveTextFile(name, typeof text === "string" ? text : await text());
      if (path) setSaved(`Saved ${path}`);
    } catch (e) {
      setErrors([{ line: null, message: `File not saved. ${errMsg(e)}` }]);
    }
  }

  async function onFile(file: File | undefined) {
    setErrors([]);
    setPreview(null);
    setReport(null);
    if (!file) return;
    try {
      const p = await buildPreview(kind, file.name, parseCsv(await file.text()));
      if ("errors" in p) setErrors(p.errors);
      else setPreview(p);
    } catch (e) {
      setErrors([{ line: null, message: errMsg(e) }]);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      setReport(await preview.write());
      setPreview(null);
    } catch (e) {
      setErrors([{ line: null, message: `Nothing was written. ${errMsg(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  const exportCsv = (which: "items" | "recipes") =>
    saveFile(`${which}.csv`, async () => {
      const snap = await loadSnapshot();
      return which === "items"
        ? toCsv(ITEM_COLUMNS, snap.itemRows.filter((i) => !i.archived_at))
        : toCsv(RECIPE_COLUMNS, recipesToRows(snap.recipeRows.filter((r) => !r.archived_at)));
    });

  const counts = preview && (["create", "update", "unchanged"] as const).map((a) => [a, preview.rows.filter((r) => r.action === a).length] as const);
  const pending = preview ? preview.rows.filter((r) => r.action !== "unchanged").length : 0;

  return (
    <>
      <PageHeader title="Import / Export" subtitle="Imports are validated and previewed. Nothing is written until you confirm, and a write is all-or-nothing." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Import CSV">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-400">
            <li>Import <strong>items</strong> first: recipes, prices and inventory only reference existing items (name + region).</li>
            <li>Comma or semicolon separated, UTF-8. From Excel: “Save as CSV UTF-8”. One row per ingredient for recipes.</li>
            <li>An empty craft fee means "unknown", not zero. Prices need an existing market (Settings) and an observation date.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <fieldset className="flex gap-4 text-sm">
              <legend className="sr-only">File type</legend>
              {(["items", "recipes", "prices", "inventory"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="radio" name="kind" checked={kind === k} onChange={() => { setKind(k); setPreview(null); setErrors([]); }} /> {KIND_LABEL[k]}
                </label>
              ))}
            </fieldset>
            <input
              key={kind + String(report)}
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              className="text-sm file:mr-3 file:rounded file:border-0 file:bg-night-700 file:px-3 file:py-1.5 file:text-slate-200"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>

          <div className="mt-4 space-y-3">
            {errors.length > 0 && <p className="text-sm text-loss">{errors.length} error(s). Fix the file and choose it again: nothing was written.</p>}
            <ErrorList errors={errors} />
            {report && <p role="status" className="rounded border border-profit/40 bg-profit/10 p-3 text-sm text-profit">{report}</p>}
            {preview && counts && (
              <>
                <p className="text-sm">
                  Preview of <strong>{preview.file}</strong>:{" "}
                  {counts.map(([a, n]) => <span key={a} className={`mr-3 ${ACTION_STYLE[a]}`}>{n} {a}</span>)}
                </p>
                <div className="max-h-80 overflow-y-auto rounded border border-night-700">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-night-800 text-left text-xs uppercase text-slate-400">
                      <tr><th className="px-3 py-1.5">Action</th>{preview.headers.map((h) => <th key={h} className="px-3 py-1.5">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i} className="border-t border-night-700">
                          <td className={`px-3 py-1 ${ACTION_STYLE[r.action]}`}>{r.action}</td>
                          {r.cells.map((c, j) => <td key={j} className="px-3 py-1">{c}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setPreview(null)}>Cancel</Button>
                  <Button variant="primary" disabled={busy || pending === 0} onClick={confirm}>
                    {pending === 0 ? "Nothing to write" : busy ? "Writing..." : `Write ${pending} change(s)`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Templates">
            <p className="mb-3 text-sm text-slate-400">Empty files with the exact columns the importer expects. Column reference: data/templates/README.md.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveFile("items_template.csv", itemsTemplate)}>items.csv</Button>
              <Button onClick={() => saveFile("recipes_template.csv", recipesTemplate)}>recipes.csv</Button>
              <Button onClick={() => saveFile("prices_template.csv", pricesTemplate)}>prices.csv</Button>
              <Button onClick={() => saveFile("inventory_template.csv", inventoryTemplate)}>inventory.csv</Button>
            </div>
            <p className="mb-2 mt-4 text-sm text-slate-400">
              Fictional demo files to try the import. Region <strong>OTHER</strong>, source type <strong>demo</strong>: never treated as AION 2 data.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveFile("demo_items.csv", demoItems)}>demo_items.csv</Button>
              <Button onClick={() => saveFile("demo_recipes.csv", demoRecipes)}>demo_recipes.csv</Button>
            </div>
          </Card>
          {saved && <p role="status" className="rounded border border-profit/40 bg-profit/10 p-3 text-sm break-all text-profit">{saved}</p>}
          <Card title="Export">
            <p className="mb-3 text-sm text-slate-400">CSV exports use the import format, so they re-import without change. They contain active (non-archived) records only.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => exportCsv("items")}>Items CSV</Button>
              <Button onClick={() => exportCsv("recipes")}>Recipes CSV</Button>
              <Button onClick={() => saveFile(`aion2-cpm-${new Date().toISOString().slice(0, 10)}.json`, exportAllJson)}>
                Full JSON (all tables)
              </Button>
            </div>
          </Card>
          <GraphImportCard />
          <Card title="Not available yet">
            <p className="text-sm text-slate-500">XLSX import (save as CSV from Excel instead), SQLite backup and restore (step 5).</p>
          </Card>
        </div>
      </div>
    </>
  );
}

async function buildPreview(kind: Kind, file: string, table: ReturnType<typeof parseCsv>): Promise<Preview | { errors: ImportError[] }> {
  if (kind === "items" || kind === "recipes") {
    const snap = await loadSnapshot();
    if (kind === "items") {
      const p = parseItemsCsv(table);
      if (p.errors.length) return { errors: p.errors };
      const changes = diffItems(p.inputs, snap);
      return catalogPreview(file, ["Item", "Region", "Changed fields"], changeRows(changes, (i) => i.name), changes, upsertItem);
    }
    const p = parseRecipesCsv(table);
    if (p.errors.length) return { errors: p.errors };
    const d = diffRecipes(p.inputs, snap);
    if (d.errors.length) return { errors: d.errors };
    return catalogPreview(file, ["Recipe", "Region", "Changed fields"], changeRows(d.changes, (r) => `${r.recipe_key} → ${r.output_item}`), d.changes, upsertRecipe);
  }

  const ws = await loadWorkspace();
  const look: MarketLookup = {
    items: new Map([...ws.items.values()].map((i) => [itemKey(i.name, i.game_region), i.id])),
    markets: new Map(ws.markets.map((m) => [m.name.toLowerCase(), m.id])),
    sources: new Map((await loadSources()).map((s) => [s.name, s.source_type])),
  };
  const marketName = new Map(ws.markets.map((m) => [m.id, m.name]));

  if (kind === "prices") {
    const p = parsePricesCsv(table, look);
    if (p.errors.length) return { errors: p.errors };
    return {
      file,
      headers: ["Item", "Market", "Kind", "Unit price", "Observed", "Source"],
      rows: p.rows.map((r) => ({
        action: "create" as const,
        cells: [`${r.item_name} (${r.game_region})`, marketName.get(r.marketId)!, PRICE_KIND_LABEL[r.price_kind], String(r.unit_price), new Date(r.observed_at!).toLocaleString(), r.source_name],
      })),
      write: async () => {
        const { statements, firstRowStatement } = importPriceStatements(p.rows);
        const added = (await writeTransaction(statements)).slice(firstRowStatement).reduce((a, b) => a + b, 0);
        return `Imported ${file}: ${added} price observation(s) added, ${p.rows.length - added} exact duplicate(s) already stored and skipped.`;
      },
    };
  }

  const p = parseInventoryCsv(table, look);
  if (p.errors.length) return { errors: p.errors };
  const rows = p.rows.map((r) => {
    const before = ws.inventory.get(r.itemId) ?? 0;
    return { r, before, action: before === r.quantity ? ("unchanged" as const) : before === 0 ? ("create" as const) : ("update" as const) };
  });
  return {
    file,
    headers: ["Item", "Owned now", "After import"],
    rows: rows.map(({ r, before, action }) => ({ action, cells: [`${r.item_name} (${r.game_region})`, String(before), String(r.quantity)] })),
    write: async () => {
      const todo = rows.filter((x) => x.action !== "unchanged");
      await writeTransaction(todo.flatMap((x) => setInventory(x.r.itemId, x.r.quantity)));
      return `Imported ${file}: ${todo.length} quantity(ies) set, ${rows.length - todo.length} unchanged. Items not in the file keep their quantity.`;
    },
  };
}

function catalogPreview<T>(file: string, headers: string[], rows: Preview["rows"], changes: Change<T>[], toStatements: (i: T) => ReturnType<typeof upsertItem>): Preview {
  return {
    file,
    headers,
    rows,
    write: async () => {
      const todo = changes.filter((c) => c.action !== "unchanged");
      await writeTransaction(todo.flatMap((c) => toStatements(c.input)));
      const n = (a: string) => todo.filter((c) => c.action === a).length;
      return `Imported ${file}: ${n("create")} created, ${n("update")} updated, ${changes.length - todo.length} unchanged.`;
    },
  };
}

/** gamers4.life crafting graph (JSON saved by the user): one race at a time, summary, then one write. */
function GraphImportCard() {
  const [race, setRace] = useState<Race | "">("");
  const [plan, setPlan] = useState<(GraphImport & { file: string }) | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setPlan(null);
    setMsg(null);
    if (!file || !race) return;
    try {
      const parsed = CraftingGraph.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        const i = parsed.error.issues[0];
        throw new Error(`Not a gamers4.life crafting graph (${i.path.join(".") || "root"}: ${i.message}).`);
      }
      setPlan({ ...craftingGraphStatements(parsed.data, race, new Date().toISOString()), file: file.name });
    } catch (e) {
      setMsg({ ok: false, text: `Nothing was written. ${errMsg(e)}` });
    }
  }

  async function write() {
    if (!plan) return;
    setBusy(true);
    try {
      await writeTransaction(plan.statements);
      setMsg({ ok: true, text: `${plan.recipes} recipe(s) imported from ${GRAPH_SOURCE.name} (Global, community, ${race === "dark" ? "Asmodian" : "Elyos"}).` });
      setPlan(null);
    } catch (e) {
      setMsg({ ok: false, text: `Nothing was written. ${errMsg(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Import crafting graph (gamers4.life JSON)">
      <p className="mb-3 text-sm text-slate-400">
        Profession recipes from the file you saved from {GRAPH_SOURCE.url}. Read locally, no network. Recipes are Global with status
        community (region not stated by the source); quantities and craft fees come from the file. Re-importing updates the same recipes
        and keeps a craft fee you changed.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select aria-label="Race" className="rounded border border-night-600 bg-night-950 px-2 py-1" value={race}
          onChange={(e) => { setRace(e.target.value as Race | ""); setPlan(null); }}>
          <option value="">Race of your market...</option>
          <option value="dark">Asmodian</option>
          <option value="light">Elyos</option>
        </select>
        <input key={race + String(msg?.ok)} type="file" accept=".json,application/json" aria-label="Crafting graph file" disabled={!race}
          className="text-sm file:mr-3 file:rounded file:border-0 file:bg-night-700 file:px-3 file:py-1.5 file:text-slate-200"
          onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {plan && (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <strong>{plan.file}</strong>: {plan.recipes} recipe(s) to write; {plan.noInputs} without ingredients skipped;
            {" "}{plan.mergedNames} item name(s) shared by several game variants, merged.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPlan(null)}>Cancel</Button>
            <Button variant="primary" disabled={busy || plan.recipes === 0} onClick={write}>{busy ? "Writing..." : `Write ${plan.recipes} recipe(s)`}</Button>
          </div>
        </div>
      )}
      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-profit" : "text-loss"}`}>{msg.text}</p>}
    </Card>
  );
}
