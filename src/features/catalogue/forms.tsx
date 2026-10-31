import { useState, type ReactNode } from "react";
import { Button, ErrorList, Field, inputCls, Modal } from "../../components/ui";
import { GameRegion, SourceType, VerificationStatus } from "../../domain/models";
import {
  diffRecipes,
  itemKey,
  ItemRow,
  normalizeName,
  parseRecipesCsv,
  RECIPE_COLUMNS,
  type CatalogueSnapshot,
  type ImportError,
} from "../../domain/validation/catalogue";
import { renameItem, upsertItem, upsertRecipe, type ItemRowDb, type RecipeRowDb } from "../../services/catalogueStatements";
import { writeTransaction, type SourceRow } from "../../services/catalogue";
import { tr } from "../../i18n";

export interface Lists {
  categories: string[];
  professions: string[];
  sources: SourceRow[];
}

type Form = Record<string, string>;
const toForm = (o: object): Form =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, v == null ? "" : k === "last_verified_at" ? String(v).slice(0, 10) : String(v)]),
  );
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useForm(initial: Form) {
  const [f, setF] = useState(initial);
  const bind = (k: string) => ({
    value: f[k] ?? "",
    onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value })),
    className: inputCls,
  });
  return { f, setF, bind };
}

const Options = ({ values }: { values: readonly string[] }) => values.map((v) => <option key={v} value={v}>{v}</option>);

/** Source picker: an existing source keeps its type and URL; a new one needs a type. */
function SourceFields({ f, setF, bind, sources }: ReturnType<typeof useForm> & { sources: SourceRow[] }) {
  const existing = sources.find((s) => s.name === f.source_name);
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label={tr("Source *")} hint={existing ? "Existing source" : "New source: it will be created"}>
        <input
          list="sources"
          {...bind("source_name")}
          onChange={(e) => {
            const s = sources.find((x) => x.name === e.target.value);
            setF((p) => ({ ...p, source_name: e.target.value, ...(s ? { source_type: s.source_type, source_url: s.url ?? "" } : {}) }));
          }}
        />
        <datalist id="sources">{sources.map((s) => <option key={s.name} value={s.name} />)}</datalist>
      </Field>
      <Field label={tr("Source type *")}>
        <select {...bind("source_type")} disabled={!!existing}>
          <option value="">-</option>
          <Options values={SourceType.options} />
        </select>
      </Field>
      <Field label={tr("Source URL")}>
        <input {...bind("source_url")} disabled={!!existing} placeholder={tr("https://...")} />
      </Field>
    </div>
  );
}

function Footer({ errors, busy, onClose, onSave, children }: { errors: ImportError[]; busy: boolean; onClose: () => void; onSave: () => void; children?: ReactNode }) {
  return (
    <div className="mt-5 space-y-3">
      <ErrorList errors={errors} />
      <div className="flex justify-end gap-2">
        {children}
        <Button onClick={onClose}>{tr("Cancel")}</Button>
        <Button variant="primary" onClick={onSave} disabled={busy}>{busy ? tr("Saving...") : tr("Save")}</Button>
      </div>
    </div>
  );
}

export function ItemForm({ existing, snapshot, lists, onSaved, onClose }: {
  existing?: ItemRowDb;
  snapshot: CatalogueSnapshot;
  lists: Lists;
  onSaved: () => void;
  onClose: () => void;
}) {
  const form = useForm(existing ? toForm(existing) : { game_region: "GLOBAL", verification_status: "user_provided" });
  const { f, bind } = form;
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [busy, setBusy] = useState(false);

  async function save() {
    const p = ItemRow.safeParse(f);
    if (!p.success) return setErrors(p.error.issues.map((i) => ({ line: null, message: `${i.path.join(".")}: ${i.message}` })));
    const input = p.data;
    const renamed = existing && normalizeName(existing.name) !== normalizeName(input.name);
    if ((!existing || renamed) && snapshot.items.has(itemKey(input.name, input.game_region)))
      return setErrors([{ line: null, message: `An item "${input.name}" already exists in ${input.game_region}` }]);
    setBusy(true);
    try {
      await writeTransaction([...(renamed ? renameItem(existing.name, existing.game_region, input.name) : []), ...upsertItem(input)]);
      onSaved();
    } catch (e) {
      setErrors([{ line: null, message: errMsg(e) }]);
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? `Edit item: ${existing.name}` : "New item"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label={tr("Name *")}><input {...bind("name")} autoFocus /></Field>
          <Field label={tr("Region *")} hint={existing ? "Region cannot change: create a new item instead" : undefined}>
            <select {...bind("game_region")} disabled={!!existing}><Options values={GameRegion.options} /></select>
          </Field>
          <Field label={tr("Verification *")}><select {...bind("verification_status")}><Options values={VerificationStatus.options} /></select></Field>
          <Field label={tr("Category")}>
            <input list="categories" {...bind("category")} />
            <datalist id="categories">{lists.categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label={tr("Game version")}><input {...bind("game_version")} /></Field>
          <Field label={tr("Verified on")}><input type="date" {...bind("last_verified_at")} /></Field>
        </div>
        <Field label={tr("Description")}><textarea rows={2} {...bind("description")} /></Field>
        <SourceFields {...form} sources={lists.sources} />
      </div>
      <Footer errors={errors} busy={busy} onClose={onClose} onSave={save} />
    </Modal>
  );
}

const slug = (s: string) => normalizeName(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "recipe";

export function RecipeForm({ output, existing, snapshot, lists, onSaved, onClose }: {
  output: ItemRowDb;
  existing?: RecipeRowDb;
  snapshot: CatalogueSnapshot;
  lists: Lists;
  onSaved: () => void;
  onClose: () => void;
}) {
  const form = useForm(
    existing
      ? toForm(existing)
      : {
          recipe_key: `${slug(output.name)}-${crypto.randomUUID().slice(0, 6)}`,
          output_quantity: "1",
          verification_status: output.verification_status,
          game_version: output.game_version ?? "",
          source_name: output.source_name,
          source_type: output.source_type,
          source_url: output.source_url ?? "",
        },
  );
  const { f, bind } = form;
  const [ingredients, setIngredients] = useState(
    existing ? existing.ingredients.map((i) => ({ item: i.item, quantity: String(i.quantity) })) : [{ item: "", quantity: "1" }],
  );
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [busy, setBusy] = useState(false);
  const region = output.game_region;
  const choices = [...snapshot.items.values()].filter((i) => i.game_region === region && i.name !== output.name && !(i as ItemRowDb).archived_at);

  async function save() {
    if (!existing && snapshot.recipes.has(f.recipe_key))
      return setErrors([{ line: null, message: `Recipe key "${f.recipe_key}" is already used` }]);
    // Same validation as a CSV import: one row per ingredient.
    const rows = ingredients.map((ing, n) => ({
      line: n + 1,
      values: { ...f, output_item: output.name, game_region: region, ingredient_item: ing.item, ingredient_quantity: ing.quantity },
    }));
    const parsed = parseRecipesCsv({ headers: RECIPE_COLUMNS, rows });
    const checked = parsed.errors.length ? { errors: [] } : diffRecipes(parsed.inputs, snapshot);
    const errs = [...parsed.errors, ...checked.errors].map((e) => ({
      line: null,
      message: e.line === null ? e.message : `Ingredient ${e.line}: ${e.message}`,
    }));
    if (errs.length) return setErrors(errs);
    setBusy(true);
    try {
      await writeTransaction(upsertRecipe(parsed.inputs[0]));
      onSaved();
    } catch (e) {
      setErrors([{ line: null, message: errMsg(e) }]);
      setBusy(false);
    }
  }

  const setIng = (n: number, k: "item" | "quantity", v: string) =>
    setIngredients((p) => p.map((x, i) => (i === n ? { ...x, [k]: v } : x)));

  return (
    <Modal title={existing ? `Edit recipe: ${existing.recipe_key}` : `New recipe for ${output.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <Field label={tr("Recipe key *")} hint={tr("Stable id used by CSV re-imports")}><input {...bind("recipe_key")} disabled={!!existing} /></Field>
          <Field label={tr("Output per craft *")}><input inputMode="numeric" {...bind("output_quantity")} /></Field>
          <Field label={tr("Craft fee")} hint={tr("Empty = unknown (not zero)")}><input inputMode="numeric" {...bind("craft_fee")} /></Field>
          <Field label={tr("Verification *")}><select {...bind("verification_status")}><Options values={VerificationStatus.options} /></select></Field>
          <Field label={tr("Profession")}>
            <input list="professions" {...bind("profession")} />
            <datalist id="professions">{lists.professions.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label={tr("Required level")}><input inputMode="numeric" {...bind("required_level")} /></Field>
          <Field label={tr("Game version")}><input {...bind("game_version")} /></Field>
          <Field label={tr("Verified on")}><input type="date" {...bind("last_verified_at")} /></Field>
        </div>

        <fieldset className="rounded border border-night-700 p-3">
          <legend className="px-1 text-xs text-slate-400">{tr("Ingredients * (items from region")} {region} {tr("only)")}</legend>
          <datalist id="ingredient-items">{choices.map((i) => <option key={i.name} value={i.name} />)}</datalist>
          <div className="space-y-2">
            {ingredients.map((ing, n) => (
              <div key={n} className="grid grid-cols-[1fr_7rem_auto] gap-2">
                <input aria-label={`Ingredient ${n + 1} item`} list="ingredient-items" className={inputCls} value={ing.item} onChange={(e) => setIng(n, "item", e.target.value)} placeholder={tr("Item name")} />
                <input aria-label={`Ingredient ${n + 1} quantity`} inputMode="numeric" className={inputCls} value={ing.quantity} onChange={(e) => setIng(n, "quantity", e.target.value)} />
                <Button variant="danger" aria-label={`Remove ingredient ${n + 1}`} disabled={ingredients.length === 1} onClick={() => setIngredients((p) => p.filter((_, i) => i !== n))}>{tr("Remove")}</Button>
              </div>
            ))}
          </div>
          <Button className="mt-2" onClick={() => setIngredients((p) => [...p, { item: "", quantity: "1" }])}>{tr("+ Add ingredient")}</Button>
          {choices.length === 0 && <p className="mt-2 text-xs text-stale">{tr("No other")} {region} {tr("item exists yet. Create the ingredient items first.")}</p>}
        </fieldset>

        <Field label={tr("Notes")}><textarea rows={2} {...bind("notes")} /></Field>
        <SourceFields {...form} sources={lists.sources} />
      </div>
      <Footer errors={errors} busy={busy} onClose={onClose} onSave={save} />
    </Modal>
  );
}
