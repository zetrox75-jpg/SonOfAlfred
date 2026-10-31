import React, { useEffect, useState, type ReactNode } from "react";
import { tr } from "../i18n";


export type Async<T> = { state: "loading" } | { state: "error"; error: string } | { state: "ok"; data: T };

/** Runs a loader once on mount; errors are surfaced, never swallowed. */
export function useAsync<T>(load: () => Promise<T>): Async<T> & { reload: () => void } {
  const [s, setS] = useState<Async<T>>({ state: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setS({ state: "ok", data }),
      (e: unknown) => live && setS({ state: "error", error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: () => setN((x) => x + 1) };
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="bg-gradient-to-b from-gold-200 to-gold-400 bg-clip-text font-display text-3xl font-semibold tracking-wide text-transparent">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>}
      <div aria-hidden="true" className="ornament-rule mt-4" />
    </header>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel rounded-lg p-4 ${className}`}>
      {title && (
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold tracking-wider text-gold-300">
          <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 bg-gold-400" />{title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-night-600 bg-night-900/60 px-6 py-10 text-center">
      <p className="font-display text-lg font-medium text-gold-300">{title}</p>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div role="alert" className="rounded-lg border border-loss/50 bg-loss/10 p-4 text-sm text-loss">
      <p className="font-semibold">{tr("Database error")}</p>
      <p className="mt-1 font-mono text-xs break-all">{error}</p>
    </div>
  );
}

export const Loading = () => <p className="text-sm text-slate-500">{tr("Loading...")}</p>;

const STATUS_STYLE: Record<string, string> = {
  verified: "border-profit/40 text-profit",
  community: "border-frost-400/40 text-frost-300",
  user_provided: "border-frost-400/40 text-frost-300",
  unverified: "border-stale/40 text-stale",
};
const STATUS_HINT: Record<string, string> = {
  verified: "Checked against a reliable source",
  community: "From a community source, not independently verified. Counted as reliable unless you filter it out",
  user_provided: "Entered by you",
  unverified: "Not verified: excluded from reliable analyses",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span title={STATUS_HINT[status] && tr(STATUS_HINT[status])} className={`rounded border px-1.5 py-0.5 text-[11px] whitespace-nowrap ${STATUS_STYLE[status] ?? ""}`}>
      {tr(status.replace("_", " "))}
    </span>
  );
}

/** Non-Global data is always flagged: it is never confirmed Global data. */
export function RegionBadge({ region }: { region: string }) {
  const global = region === "GLOBAL";
  return (
    <span
      title={global ? "AION 2 Global" : tr("Not Global data: never treated as confirmed Global")}
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ${global ? "bg-frost-400/15 text-frost-300" : "bg-stale/15 text-stale"}`}
    >
      {region}
    </span>
  );
}

export const inputCls =
  "w-full rounded border border-night-600 bg-night-950/80 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold-400/70 focus:outline-none disabled:opacity-60";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Button({ variant = "secondary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const v = {
    primary: "bg-gradient-to-b from-gold-300 to-gold-500 text-night-950 font-semibold shadow-[0_0_12px_-4px_rgb(209_173_91/0.6)] hover:from-gold-200 hover:to-gold-400",
    secondary: "border border-gold-400/25 text-slate-200 hover:border-gold-400/50 hover:bg-night-700",
    danger: "border border-loss/50 text-loss hover:bg-loss/10",
  }[variant];
  return <button type="button" {...p} className={`cursor-pointer rounded px-3 py-1.5 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`} />;
}

/** Native modal dialog: focus trap and Escape handling come from the browser. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <dialog
      ref={(d) => {
        if (d && !d.open) d.showModal();
      }}
      onClose={onClose}
      className="panel m-auto max-h-[90vh] w-[min(56rem,95vw)] overflow-y-auto rounded-lg p-0 text-slate-200 backdrop:bg-black/75"
    >
      <header className="sticky top-0 flex items-center justify-between border-b border-night-700 bg-night-900 px-5 py-3">
        <h2 className="font-display text-lg font-semibold text-gold-300">{title}</h2>
        <button type="button" onClick={onClose} aria-label={tr("Close")} className="px-2 text-xl text-slate-400 hover:text-slate-100">×</button>
      </header>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function ErrorList({ errors }: { errors: { line: number | null; message: string }[] }) {
  if (!errors.length) return null;
  return (
    <ul role="alert" className="max-h-64 space-y-1 overflow-y-auto rounded border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
      {errors.map((e, i) => (
        <li key={i}>{e.line !== null && <span className="num mr-2 text-slate-400">{tr("line")} {e.line}</span>}{e.message}</li>
      ))}
    </ul>
  );
}
