import React, { useEffect, useState, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./app/App";
import { restartApp } from "./services/backup";
import "./styles/index.css";

type Startup = { error: string | null; backup: string | null };

function Fatal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main role="alert" className="mx-auto max-w-3xl p-8 text-sm">
      <h1 className="text-xl font-semibold text-loss">{title}</h1>
      {children}
      <p className="mt-4 text-slate-400">Help: docs/INSTALL.md, section "Troubleshooting".</p>
      <button type="button" className="mt-4 rounded border border-night-600 px-3 py-1.5 hover:bg-night-700" onClick={() => restartApp()}>
        Restart the app
      </button>
    </main>
  );
}

/** Shows render crashes in full (message and component stack) instead of a blank window. */
class ErrorBoundary extends React.Component<{ children: ReactNode }, { error: Error | null; stack: string }> {
  state = { error: null as Error | null, stack: "" };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ stack: info.componentStack ?? "" });
  }
  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <Fatal title="The app hit an unexpected error">
        <p className="mt-2">Your data is not affected: every change is saved in one transaction or not at all.</p>
        <pre className="mt-4 max-h-96 overflow-auto rounded bg-night-900 p-3 font-mono text-xs whitespace-pre-wrap select-text">
          {`${error.stack ?? `${error.name}: ${error.message}`}\n\nComponent stack:${stack}`}
        </pre>
      </Fatal>
    );
  }
}

/** Waits for the startup database check (Rust `db_guard`) before showing any page. */
function Boot() {
  const [s, setS] = useState<Startup | null>(null);
  useEffect(() => {
    invoke<Startup>("startup_status").then(setS, (e) => setS({ error: String(e), backup: null }));
  }, []);
  if (!s) return null;
  if (s.error)
    return (
      <Fatal title="The database could not be opened">
        <p className="mt-2 font-mono text-xs break-all select-text">{s.error}</p>
        <p className="mt-2 text-slate-400">Nothing else was started, so nothing more can be written. Backups are in the <code>backups</code> folder next to the database.</p>
      </Fatal>
    );
  return <App upgradeBackup={s.backup} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Boot />
    </ErrorBoundary>
  </React.StrictMode>,
);
