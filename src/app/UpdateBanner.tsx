import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Button } from "../components/ui";
import { tr } from "../i18n";
import { restartApp } from "../services/backup";

/** Checks GitHub Releases once at start-up. Being offline or unreleased is not an error: no banner. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [state, setState] = useState<"idle" | "installing" | { error: string }>("idle");

  useEffect(() => {
    check().then(setUpdate, (e: unknown) => console.warn("Update check failed:", e));
  }, []);

  if (!update) return null;

  async function install() {
    setState("installing");
    try {
      await update!.downloadAndInstall();
      await restartApp();
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div role="status" className="panel mb-4 flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm">
      <span className="mr-auto text-gold-200">
        {state === "installing" ? tr("Installing update…") : tr("Version {version} is available.", { version: update.version })}
        {" "}<span className="text-slate-400">{tr("The app restarts by itself. Your data is kept.")}</span>
      </span>
      {typeof state === "object" && <span className="text-loss">{tr("The update failed: {error}", { error: state.error })}</span>}
      <Button disabled={state === "installing"} onClick={() => setUpdate(null)}>{tr("Later")}</Button>
      <Button variant="primary" disabled={state === "installing"} onClick={install}>{tr("Update now")}</Button>
    </div>
  );
}
