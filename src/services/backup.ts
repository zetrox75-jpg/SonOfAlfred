import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getDb } from "./db";

const filters = [{ name: "SQLite database", extensions: ["db"] }];
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");

/** Asks where to save, then writes a checked backup. Returns its path, or null if cancelled. */
export async function backupDatabase(): Promise<string | null> {
  const folder = await invoke<string>("backup_folder");
  const path = await save({ defaultPath: `${folder}\\aion2-backup-${stamp()}.db`, filters });
  if (!path) return null;
  await getDb(); // the Rust command uses the open connection
  return invoke<string>("backup_database", { path });
}

export async function pickBackupFile(): Promise<string | null> {
  const path = await open({ defaultPath: await invoke<string>("backup_folder"), multiple: false, directory: false, filters });
  return typeof path === "string" ? path : null;
}

export async function restoreDatabase(path: string) {
  await getDb();
  return invoke<{ version: number; safetyBackup: string }>("restore_database", { path });
}

export const restartApp = () => invoke<void>("restart_app");
