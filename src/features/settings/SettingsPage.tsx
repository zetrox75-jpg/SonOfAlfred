import { DB_URL, getDb, getDiagnostics } from "../../services/db";
import { planDemoCleanup, type DemoCleanup } from "../../services/cleanup";
import { ProviderSettingsCard } from "../market/ProviderPanel";
import { useState } from "react";
import { Button, Card, ErrorBox, Field, inputCls, Loading, PageHeader, useAsync } from "../../components/ui";
import { useWorkspace, WithWorkspace } from "../crafting/workspace";
import { addMarket, saveSettings } from "../../services/planQueries";
import type { Workspace } from "../../services/plan";
import { backupDatabase, pickBackupFile, restartApp, restoreDatabase } from "../../services/backup";import { tr } from "../../i18n";


const legend = [
  ["bg-profit", "Profitable"],
  ["bg-loss", "Not profitable"],
  ["bg-missing", "Missing data"],
  ["bg-stale", "Stale price"],
] as const;

export default function SettingsPage() {
  const q = useAsync(getDiagnostics);
  return (
    <>
      <PageHeader title={tr("Settings")} />
      <WithWorkspace>
        {(data) => (
          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <CalcSettings data={data} />
            <Markets data={data} />
            <DemoCleanupCard />
            <ProviderSettingsCard />
          </div>
        )}
      </WithWorkspace>
      <div className="grid gap-4 xl:grid-cols-2">
        <BackupCard />
        <Card title={tr("Local database")}>
          {q.state === "loading" && <Loading />}
          {q.state === "error" && <ErrorBox error={q.error} />}
          {q.state === "ok" && (
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-slate-400">{tr("Connection")}</dt>
              <dd className="font-mono">{DB_URL} {tr("(app config folder)")}</dd>
              <dt className="text-slate-400">{tr("Schema version")}</dt>
              <dd className="num">{q.data.migrations.at(-1)?.version ?? tr("none")}</dd>
              <dt className="text-slate-400">{tr("Foreign keys")}</dt>
              <dd className={q.data.foreignKeys ? "text-profit" : "text-loss"}>{q.data.foreignKeys ? tr("Enforced") : tr("NOT enforced")}</dd>
              <dt className="text-slate-400">{tr("Tables")}</dt>
              <dd>{q.data.tables.join(", ")}</dd>
              <dt className="text-slate-400">{tr("Migrations")}</dt>
              <dd>
                <ul>
                  {q.data.migrations.map((m) => (
                    <li key={m.version} className="num">
                      v{m.version} {m.description} {m.success ? "✓" : tr("✗ failed")}{" "}
                      <span className="text-slate-500">{m.installed_on}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
          )}
        </Card>
        <Card title={tr("Data state colours")}>
          <ul className="space-y-2 text-sm">
            {legend.map(([c, l]) => (
              <li key={l} className="flex items-center gap-3">
                <span className={`inline-block h-3 w-3 rounded-full ${c}`} aria-hidden /> {l}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function CalcSettings({ data }: { data: Workspace }) {
  const { write } = useWorkspace();
  const s = data.settings;
  const [f, setF] = useState({
    currency: s.currencyLabel,
    commission: s.commissionBps === null ? "" : String(s.commissionBps / 100),
    source: s.commissionSource,
    freshness: String(s.freshnessHours),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bind = (k: keyof typeof f) => ({ value: f[k], className: inputCls, onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value })) });

  async function save() {
    const c = f.commission.trim().replace(",", ".");
    if (c !== "" && !(/^\d{1,2}(\.\d{1,2})?$/.test(c) && Number(c) < 100)) return setMsg({ ok: false, text: "Commission: a percentage from 0 to 99.99, max 2 decimals." });
    if (c !== "" && !f.source.trim()) return setMsg({ ok: false, text: "Give the source of the commission rate (README 5.3)." });
    if (!/^\d+$/.test(f.freshness.trim()) || Number(f.freshness) < 1) return setMsg({ ok: false, text: "Freshness: whole number of hours >= 1." });
    try {
      await write(saveSettings({
        currencyLabel: f.currency,
        commissionBps: c === "" ? null : Math.round(Number(c) * 100),
        commissionSource: f.source,
        freshnessHours: Number(f.freshness),
      }));
      setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    }
  }

  return (
    <Card title={tr("Calculation")}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr("Currency label")} hint={tr("Display only, e.g. the in-game currency name. Not assumed.")}><input {...bind("currency")} /></Field>
        <Field label={tr("Price freshness (hours)")} hint={tr("Older prices are marked stale and never reliable.")}><input inputMode="numeric" {...bind("freshness")} /></Field>
        <Field label={tr("Market commission (%)")} hint={tr("Empty = unknown: profit stays incomplete. Enter 0 if there is none.")}><input inputMode="decimal" {...bind("commission")} /></Field>
        <Field label={tr("Commission source *")} hint={tr("Where this rate comes from (patch notes, in-game screen...).")}><input {...bind("source")} /></Field>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-profit" : "text-loss"}`}>{msg.text}</span>}
        <Button variant="primary" onClick={save}>{tr("Save")}</Button>
      </div>
    </Card>
  );
}

function Markets({ data }: { data: Workspace }) {
  const { write } = useWorkspace();
  const [f, setF] = useState({ name: "", region: "", server: "", faction: "" });
  const [err, setErr] = useState<string | null>(null);
  const bind = (k: keyof typeof f) => ({ value: f[k], className: inputCls, onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value })) });

  async function add() {
    setErr(null);
    if (data.markets.some((m) => m.name.toLowerCase() === f.name.trim().toLowerCase())) return setErr("A market with this name exists.");
    try {
      await write(addMarket(f));
      setF({ name: "", region: "", server: "", faction: "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card title={tr("Markets")}>
      <p className="mb-3 text-xs text-slate-500">{tr("Each market is one region / server / faction. Prices are stored per market and never mixed between markets.")}</p>
      {data.markets.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {data.markets.map((m) => (
            <li key={m.id}>
              {m.name} <span className="text-slate-500">{[m.region, m.server, m.faction].filter(Boolean).join(" · ")}</span>
              {data.market?.id === m.id && <span className="ml-2 text-xs text-profit">{tr("active")}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-4 gap-2">
        <Field label={tr("Name *")}><input {...bind("name")} /></Field>
        <Field label={tr("Region")}><input {...bind("region")} placeholder={tr("EU, NA...")} /></Field>
        <Field label={tr("Server")}><input {...bind("server")} /></Field>
        <Field label={tr("Faction")}><input {...bind("faction")} placeholder={tr("Elyos / Asmodian")} /></Field>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {err && <span className="text-sm text-loss">{err}</span>}
        <Button variant="primary" onClick={add} disabled={!f.name.trim()}>{tr("Add market")}</Button>
      </div>
    </Card>
  );
}

function BackupCard() {
  const [busy, setBusy] = useState(false);
  const [restoreFrom, setRestoreFrom] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; restart?: boolean } | null>(null);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try { await task(); } finally { setBusy(false); }
  }
  const backup = () => run(async () => {
    try {
      const path = await backupDatabase();
      if (path) setMsg({ ok: true, text: `Backup saved and checked: ${path}` });
    } catch (e) { setMsg({ ok: false, text: `No backup was written. ${String(e)}` }); }
  });
  const pick = () => run(async () => {
    try { setRestoreFrom(await pickBackupFile()); } catch (e) { setMsg({ ok: false, text: String(e) }); }
  });
  const restore = () => run(async () => {
    const path = restoreFrom!;
    setRestoreFrom(null);
    try {
      const r = await restoreDatabase(path);
      setMsg({ ok: true, text: `Restored (schema v${r.version}). Your previous data was saved to ${r.safetyBackup}. Restarting…` });
      setTimeout(restartApp, 1500);
    } catch (e) {
      // After a failed swap the connection is closed; a restart is needed either way.
      setMsg({ ok: false, text: String(e), restart: !String(e).startsWith("Restore cancelled") });
    }
  });

  return (
    <Card title={tr("Backup and restore")}>
      <p className="mb-3 text-xs text-slate-500">
        {tr("A backup is a complete, checked copy of the database, safe to take while the app is open. Existing files are never overwritten. Default folder:")} <code>{tr("backups")}</code> {tr("next to the database. Backups are also made automatically before a restore.")}
      </p>
      {restoreFrom && (
        <div role="alertdialog" aria-label={tr("Confirm restore")} className="mb-3 rounded border border-loss/50 p-3 text-sm">
          <p className="font-semibold text-loss">{tr("Replace ALL current data?")}</p>
          <p className="mt-1 break-all">{tr("Restore from")} <span className="font-mono">{restoreFrom}</span>.</p>
          <p className="mt-1 text-slate-400">{tr("The file is checked first. Your current data is backed up before it is replaced, then the app restarts.")}</p>
          <div className="mt-3 flex justify-end gap-3">
            <Button onClick={() => setRestoreFrom(null)}>{tr("Cancel")}</Button>
            <Button variant="danger" disabled={busy} onClick={restore}>{tr("Replace my data and restart")}</Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {msg && <span role="status" className={`min-w-0 break-all text-sm ${msg.ok ? "text-profit" : "text-loss"}`}>{msg.text}</span>}
        {msg?.restart && <Button variant="primary" onClick={restartApp}>{tr("Restart now")}</Button>}
        {!restoreFrom && (
          <>
            <Button disabled={busy} onClick={pick}>{tr("Restore from backup…")}</Button>
            <Button variant="primary" disabled={busy} onClick={backup}>{tr("Back up now…")}</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function DemoCleanupCard() {
  const { write } = useWorkspace();
  const [plan, setPlan] = useState<DemoCleanup | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const select = async <T,>(sql: string, params: unknown[] = []) => (await getDb()).select<T[]>(sql, params);

  async function check() {
    setMsg(null);
    try { setPlan(await planDemoCleanup(select)); } catch (e) { setMsg({ ok: false, text: String(e) }); }
  }
  async function remove() {
    if (!plan) return;
    try {
      await write(plan.statements);
      setMsg({ ok: true, text: `Removed ${plan.items.length} demo item(s) and ${plan.recipes} demo recipe(s).` });
      setPlan(null);
    } catch (e) {
      setMsg({ ok: false, text: `Nothing was removed. ${String(e)}` });
    }
  }
  const empty = plan && plan.recipes === 0 && plan.items.length === 0;

  return (
    <Card title={tr("Demo / test data")}>
      <p className="mb-3 text-xs text-slate-500">
        {tr("Removes only records whose source type is")} <code>{tr("demo")}</code>{tr(", with their prices and inventory, and categories or professions nothing else uses. Your own data is never touched.")}
      </p>
      {plan && (
        empty ? <p className="mb-3 text-sm text-slate-400">{tr("No demo data found.")}</p> : (
          <div className="mb-3 space-y-1 text-sm">
            <p>{tr("Will remove:")} <strong>{plan.recipes}</strong> {tr("recipe(s),")} <strong>{plan.items.length}</strong> {tr("item(s),")} {plan.prices} {tr("price observation(s),")} {plan.inventory} {tr("inventory row(s).")}</p>
            {plan.items.length > 0 && <p className="text-slate-400">{plan.items.map((i) => i.name).join(", ")}</p>}
            {plan.blocked.length > 0 && <p className="text-stale">{tr("Kept because one of your recipes uses them:")} {plan.blocked.map((i) => i.name).join(", ")}</p>}
          </div>
        )
      )}
      <div className="flex items-center justify-end gap-3">
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-profit" : "text-loss"}`}>{msg.text}</span>}
        {plan && !empty ? (
          <>
            <Button onClick={() => setPlan(null)}>{tr("Cancel")}</Button>
            <Button variant="danger" onClick={remove}>{tr("Remove demo data")}</Button>
          </>
        ) : <Button onClick={check}>{tr("Check for demo data")}</Button>}
      </div>
    </Card>
  );
}
