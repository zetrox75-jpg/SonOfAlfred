mod backup;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool};

/// Connection string shared with the frontend (src/services/db.ts).
const DB_URL: &str = "sqlite:aion2.db";

#[derive(Deserialize)]
struct Statement {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

/// Runs all statements in one SQLite transaction: either everything is written
/// or nothing is. The plugin's own `execute` cannot guarantee this, because
/// each call may use a different pooled connection. Returns rows affected per statement.
#[tauri::command]
async fn write_transaction(
    db: tauri::State<'_, DbInstances>,
    statements: Vec<Statement>,
) -> Result<Vec<u64>, String> {
    let pools = db.0.read().await;
    let Some(DbPool::Sqlite(pool)) = pools.get(DB_URL) else {
        return Err("database not loaded".into());
    };
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut affected = Vec::with_capacity(statements.len());
    for (i, s) in statements.iter().enumerate() {
        let mut q = sqlx::query(&s.sql);
        for p in &s.params {
            q = match p {
                Value::Null => q.bind(None::<String>),
                Value::Bool(b) => q.bind(*b),
                Value::Number(n) if n.is_i64() => q.bind(n.as_i64()),
                Value::Number(n) => q.bind(n.as_f64()),
                Value::String(v) => q.bind(v.clone()),
                other => return Err(format!("statement {i}: unsupported parameter {other}")),
            };
        }
        affected.push(
            q.execute(&mut *tx)
                .await
                .map_err(|e| format!("statement {i}: {e}"))?
                .rows_affected(),
        );
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(affected)
}

/// The database file the SQL plugin opens (app config folder) and the backup folder beside it.
fn db_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok((dir.join("aion2.db"), dir.join("backups")))
}

/// Default folder for backups (created if missing).
#[tauri::command]
fn backup_folder(app: tauri::AppHandle) -> Result<String, String> {
    let (_, backups) = db_paths(&app)?;
    std::fs::create_dir_all(&backups).map_err(|e| format!("cannot create the backup folder: {e}"))?;
    Ok(backups.display().to_string())
}

fn checked_db_path(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_absolute() || p.extension().is_none_or(|e| !e.eq_ignore_ascii_case("db")) {
        return Err("choose a .db file".into());
    }
    Ok(p)
}

/// Consistent copy of the live database to a new file the user chose. Never overwrites.
#[tauri::command]
async fn backup_database(db: tauri::State<'_, DbInstances>, path: String) -> Result<String, String> {
    let dest = checked_db_path(&path)?;
    let pools = db.0.read().await;
    let Some(DbPool::Sqlite(pool)) = pools.get(DB_URL) else {
        return Err("database not loaded".into());
    };
    backup::vacuum_into(pool, &dest).await?;
    Ok(dest.display().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Restored {
    version: i64,
    safety_backup: String,
}

fn same_file(a: &Path, b: &Path) -> bool {
    matches!((a.canonicalize(), b.canonicalize()), (Ok(x), Ok(y)) if x == y)
}

/// Replaces the live database with a checked backup. The source, its staged copy and a
/// safety backup of the current data are all checked before anything is replaced; the
/// frontend restarts the app afterwards (also after a failure, since the pool is closed).
#[tauri::command]
async fn restore_database(
    app: tauri::AppHandle,
    db: tauri::State<'_, DbInstances>,
    path: String,
) -> Result<Restored, String> {
    let source = checked_db_path(&path)?;
    let (live_path, backups) = db_paths(&app)?;
    if same_file(&source, &live_path) {
        return Err("that is the database in use; choose a backup file".into());
    }
    // Write lock: no other query runs from the safety backup until the swap is done.
    let mut pools = db.0.write().await;
    let Some(DbPool::Sqlite(live)) = pools.get(DB_URL) else {
        return Err("database not loaded".into());
    };
    let staged = backup::stage_restore(live, &source, &backups)
        .await
        .map_err(|e| format!("Restore cancelled, nothing was changed: {e}"))?;
    if let Some(DbPool::Sqlite(pool)) = pools.remove(DB_URL) {
        pool.close().await;
    }
    backup::swap_in(&live_path, &staged)?;
    Ok(Restored { version: staged.version, safety_backup: staged.safety_backup.display().to_string() })
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Outcome of the startup database check; the frontend reads it before showing any page.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Startup {
    error: Option<String>,
    backup: Option<String>,
}

#[tauri::command]
fn startup_status(s: tauri::State<'_, Startup>) -> Startup {
    s.inner().clone()
}

/// Migrates the database (backing it up first) before the SQL plugin connects to it.
/// Tauri sets plugins up in registration order, before any window exists, so this plugin
/// must stay registered before `tauri_plugin_sql`. Migrations are deliberately NOT
/// registered with the SQL plugin: it would run them without a backup.
fn db_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("db-guard")
        .setup(|app, _| {
            let r = app.path().app_config_dir().map_err(|e| e.to_string()).and_then(|dir| {
                tauri::async_runtime::block_on(backup::prepare(&dir.join("aion2.db"), &dir.join("backups")))
            });
            app.manage(match r {
                Ok(b) => Startup { error: None, backup: b.map(|p| p.display().to_string()) },
                Err(e) => Startup { error: Some(e), backup: None },
            });
            Ok(())
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();
    tauri::Builder::default()
        .plugin(db_guard())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            write_transaction,
            backup_folder,
            backup_database,
            restore_database,
            restart_app,
            startup_status
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| fatal(&format!("The app could not start: {e}")));
}

/// Release builds have no console, so failures before (or outside) the window would be
/// invisible: show a native message box and keep a copy in %TEMP% for troubleshooting.
fn fatal(msg: &str) {
    let log = std::env::temp_dir().join("aion2-craft-profit-manager-error.log");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log)
        .and_then(|mut f| std::io::Write::write_all(&mut f, format!("{msg}\n").as_bytes()));
    eprintln!("{msg}");
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("AION 2 Craft Profit Manager")
        .set_description(format!("{msg}\n\nDetails were saved to {}.\nSee docs/INSTALL.md, \"Troubleshooting\".", log.display()))
        .show();
}

fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| fatal(&format!("Unexpected error: {info}"))));
}
