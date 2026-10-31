//! Database safety (README section 7, build step 5): consistent backups, validated restore.
//!
//! Backups use `VACUUM INTO`, which writes a consistent snapshot of the live database,
//! including pages still in the WAL file, into a new file. SQLite itself refuses to write
//! into an existing non-empty file, and the target is checked before and after.

use std::borrow::Cow;
use std::path::{Path, PathBuf};

use sqlx::migrate::{Migration, MigrationType, Migrator};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};

/// Versioned migrations: never edit an applied file, add a new version instead.
pub const MIGRATIONS: &[(i64, &str, &str)] = &[
    (1, "initial_schema", include_str!("../migrations/0001_initial_schema.sql")),
    (2, "recipe_key", include_str!("../migrations/0002_recipe_key.sql")),
    (3, "market_faction", include_str!("../migrations/0003_market_faction.sql")),
    (4, "price_model", include_str!("../migrations/0004_price_model.sql")),
    (5, "market_provider_server", include_str!("../migrations/0005_market_provider_server.sql")),
];

pub fn latest_version() -> i64 {
    MIGRATIONS[MIGRATIONS.len() - 1].0
}

/// Same version, SQL and type the SQL plugin used before step 5b, so checksums match `_sqlx_migrations`.
pub fn migrator() -> Migrator {
    migrator_for(MIGRATIONS)
}

fn migrator_for(list: &[(i64, &'static str, &'static str)]) -> Migrator {
    Migrator {
        migrations: Cow::Owned(
            list.iter()
                .map(|&(v, d, sql)| Migration::new(v, d.into(), MigrationType::ReversibleUp, sql.into(), false))
                .collect(),
        ),
        ..Migrator::DEFAULT
    }
}

fn file_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

async fn open(opts: SqliteConnectOptions, p: &Path) -> Result<SqlitePool, String> {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .map_err(|e| format!("cannot open {}: {e}", file_name(p)))
}

/// Read-only view of a file nobody writes to (a backup). `immutable` skips locking and the
/// WAL, so callers must first make sure no `-wal` file with content sits next to it.
async fn open_frozen(p: &Path) -> Result<SqlitePool, String> {
    let wal = PathBuf::from(format!("{}-wal", p.display()));
    if wal.metadata().map(|m| m.len() > 0).unwrap_or(false) {
        return Err(format!(
            "{} looks like a database still in use (it has a -wal file). Pick a backup made with \"Back up now\".",
            file_name(p)
        ));
    }
    open(SqliteConnectOptions::new().filename(p).read_only(true).immutable(true), p).await
}

/// Local time stamp from SQLite, so no date crate is needed.
async fn stamp(pool: &SqlitePool) -> Result<String, String> {
    sqlx::query_scalar("SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime')")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

/// `dir/aion2-<label>-<stamp>.db`, never a path that already exists.
fn free_path(dir: &Path, label: &str, stamp: &str) -> PathBuf {
    let mut p = dir.join(format!("aion2-{label}-{stamp}.db"));
    let mut n = 2;
    while p.exists() {
        p = dir.join(format!("aion2-{label}-{stamp}-{n}.db"));
        n += 1;
    }
    p
}

async fn integrity(pool: &SqlitePool) -> Result<(), String> {
    let r: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("not a readable SQLite database ({e})"))?;
    if r == "ok" { Ok(()) } else { Err(format!("integrity check failed: {r}")) }
}

/// Applied migrations as (version, checksum, success), oldest first; empty without history.
pub async fn applied(pool: &SqlitePool) -> Result<Vec<(i64, Vec<u8>, bool)>, String> {
    let has: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("not a readable SQLite database ({e})"))?;
    if has == 0 {
        return Ok(vec![]);
    }
    sqlx::query_as("SELECT version, checksum, success FROM _sqlx_migrations ORDER BY version")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

pub fn newer_schema_message(v: i64) -> String {
    format!(
        "This database uses schema v{v}, newer than this app supports (v{}). Install the newer app version.",
        latest_version()
    )
}

/// A restorable database is intact, made by this app, and has exactly our migrations
/// 1..=n (same checksums, all succeeded) with n no newer than this build. Returns n.
pub async fn check_restorable(pool: &SqlitePool) -> Result<i64, String> {
    integrity(pool).await?;
    let rows = applied(pool).await?;
    if rows.is_empty() {
        return Err("not an AION 2 Craft Profit Manager database (no schema history)".into());
    }
    if let Some((v, ..)) = rows.iter().find(|r| r.0 > latest_version()) {
        return Err(newer_schema_message(*v));
    }
    let known = migrator();
    for (i, (v, sum, ok)) in rows.iter().enumerate() {
        let matches = known.migrations.iter().any(|m| m.version == *v && m.checksum.as_ref() == sum.as_slice());
        if !ok || !matches || *v != i as i64 + 1 {
            return Err(format!("schema history does not match this app (at v{v}); this file cannot be restored"));
        }
    }
    Ok(rows[rows.len() - 1].0)
}

/// Writes a consistent copy of `pool` to `dest` (a new file), then checks the copy.
pub async fn vacuum_into(pool: &SqlitePool, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Err(format!("{} already exists; backups are never overwritten", file_name(dest)));
    }
    if !dest.parent().is_some_and(Path::is_dir) {
        return Err("the backup folder does not exist".into());
    }
    let target = dest.to_str().ok_or("the backup path is not valid Unicode")?;
    sqlx::query("VACUUM INTO ?")
        .bind(target)
        .execute(pool)
        .await
        .map_err(|e| format!("backup failed: {e}"))?;
    let check = async {
        let copy = open_frozen(dest).await?;
        let r = integrity(&copy).await;
        copy.close().await;
        r
    };
    if let Err(e) = check.await {
        let _ = std::fs::remove_file(dest); // our own new, broken file
        return Err(format!("backup check failed: {e}"));
    }
    Ok(())
}

/// Startup, before the SQL plugin connects: brings the database at `db` to the latest
/// schema. If it already holds data and a migration is pending, it is first backed up into
/// `backups`; when that backup fails, no migration runs. Returns the backup path, if any.
pub async fn prepare(db: &Path, backups: &Path) -> Result<Option<PathBuf>, String> {
    if let Some(dir) = db.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("cannot create the data folder: {e}"))?;
    }
    let pool = open(SqliteConnectOptions::new().filename(db).create_if_missing(true), db).await?;
    let r = prepare_open(&pool, backups).await;
    pool.close().await;
    r
}

async fn prepare_open(pool: &SqlitePool, backups: &Path) -> Result<Option<PathBuf>, String> {
    let done: Vec<i64> = applied(pool).await?.into_iter().map(|r| r.0).collect();
    if let Some(v) = done.iter().find(|v| **v > latest_version()) {
        return Err(format!("{} Nothing was changed.", newer_schema_message(*v)));
    }
    if MIGRATIONS.iter().all(|m| done.contains(&m.0)) {
        return Ok(None);
    }
    // No history means a new, empty database: nothing to protect.
    let backup = if done.is_empty() {
        None
    } else {
        std::fs::create_dir_all(backups).map_err(|e| format!("Cannot create the backup folder ({e}). No upgrade was run; your database is unchanged."))?;
        let dest = free_path(backups, &format!("pre-v{}", latest_version()), &stamp(pool).await?);
        vacuum_into(pool, &dest)
            .await
            .map_err(|e| format!("Automatic backup before the database upgrade failed: {e}. No upgrade was run; your database is unchanged."))?;
        Some(dest)
    };
    migrator().run(pool).await.map_err(|e| match &backup {
        Some(b) => format!("Database upgrade failed: {e}. A backup taken just before is at {}.", b.display()),
        None => format!("Database creation failed: {e}."),
    })?;
    Ok(backup)
}

pub struct Staged {
    pub staging: PathBuf,
    pub aside: PathBuf,
    pub safety_backup: PathBuf,
    pub version: i64,
}

/// First half of a restore; the live database stays open and unchanged. Checks `source`,
/// copies it into a staging file and checks that too, then backs up the live database.
pub async fn stage_restore(live: &SqlitePool, source: &Path, backups: &Path) -> Result<Staged, String> {
    std::fs::create_dir_all(backups).map_err(|e| format!("cannot create the backup folder: {e}"))?;
    let ts = stamp(live).await?;
    let staging = free_path(backups, "restore-staging", &ts);
    let staged = async {
        let src = open_frozen(source).await?;
        let copied = async {
            check_restorable(&src).await?;
            vacuum_into(&src, &staging).await
        }
        .await;
        src.close().await;
        copied?;
        let copy = open_frozen(&staging).await?;
        let v = check_restorable(&copy).await;
        copy.close().await;
        let version = v?;
        let safety_backup = free_path(backups, "before-restore", &ts);
        vacuum_into(live, &safety_backup).await?;
        Ok(Staged { aside: free_path(backups, "replaced", &ts), staging: staging.clone(), safety_backup, version })
    }
    .await;
    if staged.is_err() && staging.exists() {
        let _ = std::fs::remove_file(&staging); // our own staging file, never the source
    }
    staged
}

fn sidecar(p: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{suffix}", p.display()))
}

/// Second half, after the live pool is closed: moves the live database (and any WAL/SHM
/// files) aside, puts the staged file in its place, and on failure moves the original back.
pub fn swap_in(db: &Path, s: &Staged) -> Result<(), String> {
    let moved: Vec<(PathBuf, PathBuf)> = ["", "-wal", "-shm"]
        .iter()
        .map(|x| (sidecar(db, x), sidecar(&s.aside, x)))
        .filter(|(from, _)| from.exists())
        .collect();
    let mut done = vec![];
    let mut result = Ok(());
    for (from, to) in &moved {
        if let Err(e) = std::fs::rename(from, to) {
            result = Err(format!("could not move the current database aside ({e})"));
            break;
        }
        done.push((from, to));
    }
    if result.is_ok() {
        result = std::fs::rename(&s.staging, db).map_err(|e| format!("could not put the restored file in place ({e})"));
    }
    match result {
        Ok(()) => {
            for (_, to) in &done {
                let _ = std::fs::remove_file(to); // same data as the verified safety backup
            }
            Ok(())
        }
        Err(e) => {
            let back = done.iter().all(|(from, to)| std::fs::rename(to, from).is_ok());
            let _ = std::fs::remove_file(&s.staging);
            Err(if back {
                format!("Restore failed: {e}. Your original database was left in place. Restart the app.")
            } else {
                format!(
                    "Restore failed: {e}, and the original database could not be put back automatically. \
                     Your data is safe in {}. See docs/INSTALL.md, \"Restore by hand\".",
                    s.safety_backup.display()
                )
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("aion2-backup-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// A migrated database in WAL mode with one item that is still only in the WAL.
    async fn live_db(d: &Path, item: &str) -> SqlitePool {
        let p = d.join("aion2.db");
        let opts = SqliteConnectOptions::new()
            .filename(&p)
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(opts).await.unwrap();
        migrator().run(&pool).await.unwrap();
        sqlx::query("PRAGMA wal_autocheckpoint = 0").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO items (name, normalized_name, game_region) VALUES (?1, lower(?1), 'OTHER')")
            .bind(item)
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    async fn item_names(p: &Path) -> Vec<String> {
        let pool = open_frozen(p).await.unwrap();
        let r = sqlx::query_scalar("SELECT name FROM items").fetch_all(&pool).await.unwrap();
        pool.close().await;
        r
    }

    #[test]
    fn backup_includes_wal_and_never_overwrites() {
        tauri::async_runtime::block_on(async {
            let d = dir("backup");
            let live = live_db(&d, "TEST ore").await;
            let dest = d.join("b.db");
            vacuum_into(&live, &dest).await.unwrap();
            assert_eq!(item_names(&dest).await, ["TEST ore"]);
            let size = dest.metadata().unwrap().len();
            assert!(vacuum_into(&live, &dest).await.unwrap_err().contains("never overwritten"));
            assert_eq!(dest.metadata().unwrap().len(), size);
            assert!(vacuum_into(&live, &d.join("missing").join("b.db")).await.is_err());
            live.close().await;
        });
    }

    #[test]
    fn restore_checks_reject_bad_files() {
        tauri::async_runtime::block_on(async {
            let d = dir("checks");
            let live = live_db(&d, "x").await;
            let good = d.join("good.db");
            vacuum_into(&live, &good).await.unwrap();
            let pool = open_frozen(&good).await.unwrap();
            assert_eq!(check_restorable(&pool).await.unwrap(), latest_version());
            pool.close().await;

            let text = d.join("notes.db");
            std::fs::write(&text, "not a database at all, just text").unwrap();
            let pool = open_frozen(&text).await.unwrap();
            assert!(check_restorable(&pool).await.is_err());
            pool.close().await;

            let newer = d.join("newer.db");
            vacuum_into(&live, &newer).await.unwrap();
            let rw = open(SqliteConnectOptions::new().filename(&newer), &newer).await.unwrap();
            sqlx::query("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (99, 'future', 1, x'00', 0)")
                .execute(&rw).await.unwrap();
            rw.close().await;
            let pool = open_frozen(&newer).await.unwrap();
            assert!(check_restorable(&pool).await.unwrap_err().contains("newer than this app"));
            pool.close().await;

            let edited = d.join("edited.db");
            vacuum_into(&live, &edited).await.unwrap();
            let rw = open(SqliteConnectOptions::new().filename(&edited), &edited).await.unwrap();
            sqlx::query("UPDATE _sqlx_migrations SET checksum = x'00' WHERE version = 2").execute(&rw).await.unwrap();
            rw.close().await;
            let pool = open_frozen(&edited).await.unwrap();
            assert!(check_restorable(&pool).await.unwrap_err().contains("does not match"));
            pool.close().await;
            live.close().await;
        });
    }

    #[test]
    fn restore_swaps_and_rolls_back() {
        tauri::async_runtime::block_on(async {
            let d = dir("restore");
            let backups = d.join("backups");
            std::fs::create_dir_all(&backups).unwrap();
            let live = live_db(&d, "old").await;
            let source = backups.join("source.db");
            vacuum_into(&live, &source).await.unwrap();
            sqlx::query("UPDATE items SET name = 'current'").execute(&live).await.unwrap();

            // Failure after the live pool is closed: staging file gone, so the swap fails.
            let s = stage_restore(&live, &source, &backups).await.unwrap();
            assert_eq!(item_names(&s.safety_backup).await, ["current"]);
            live.close().await;
            std::fs::remove_file(&s.staging).unwrap();
            assert!(swap_in(&d.join("aion2.db"), &s).unwrap_err().contains("left in place"));
            assert_eq!(item_names(&d.join("aion2.db")).await, ["current"]);

            // Success.
            let live = live_db_reopen(&d).await;
            let s = stage_restore(&live, &source, &backups).await.unwrap();
            live.close().await;
            swap_in(&d.join("aion2.db"), &s).unwrap();
            assert_eq!(item_names(&d.join("aion2.db")).await, ["old"]);
            assert!(source.exists() && s.safety_backup.exists() && !s.aside.exists());
        });
    }

    async fn version(p: &Path) -> i64 {
        let pool = open_frozen(p).await.unwrap();
        let v = applied(&pool).await.unwrap().last().map_or(0, |r| r.0);
        pool.close().await;
        v
    }

    /// A database at v4 holding one row, as left by the previous app version.
    async fn old_db(d: &Path) -> PathBuf {
        let p = d.join("aion2.db");
        let pool = open(SqliteConnectOptions::new().filename(&p).create_if_missing(true), &p).await.unwrap();
        migrator_for(&MIGRATIONS[..4]).run(&pool).await.unwrap();
        sqlx::query("INSERT INTO items (name, normalized_name, game_region) VALUES ('kept', 'kept', 'OTHER')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        p
    }

    #[test]
    fn startup_backs_up_before_migrating() {
        tauri::async_runtime::block_on(async {
            // New database: created and migrated, nothing to back up.
            let d = dir("fresh");
            assert!(prepare(&d.join("data").join("aion2.db"), &d.join("backups")).await.unwrap().is_none());
            assert_eq!(version(&d.join("data").join("aion2.db")).await, latest_version());

            // Pending migration: backup at the old version first, then upgrade.
            let d = dir("upgrade");
            let db = old_db(&d).await;
            let b = prepare(&db, &d.join("backups")).await.unwrap().unwrap();
            assert_eq!((version(&b).await, item_names(&b).await), (4, vec!["kept".to_string()]));
            assert_eq!((version(&db).await, item_names(&db).await), (latest_version(), vec!["kept".to_string()]));
            // Up to date: no new backup.
            assert!(prepare(&db, &d.join("backups")).await.unwrap().is_none());

            // Backup impossible (the backup folder is a file): no migration runs.
            let d = dir("nobackup");
            let db = old_db(&d).await;
            std::fs::write(d.join("backups"), "a file, not a folder").unwrap();
            assert!(prepare(&db, &d.join("backups")).await.unwrap_err().contains("No upgrade was run"));
            assert_eq!(version(&db).await, 4);

            // Newer schema: refused, unchanged.
            let d = dir("newer");
            let db = old_db(&d).await;
            let rw = open(SqliteConnectOptions::new().filename(&db), &db).await.unwrap();
            sqlx::query("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (99, 'future', 1, x'00', 0)")
                .execute(&rw).await.unwrap();
            rw.close().await;
            assert!(prepare(&db, &d.join("backups")).await.unwrap_err().contains("newer than this app"));
            assert_eq!(version(&db).await, 99);
        });
    }

    async fn live_db_reopen(d: &Path) -> SqlitePool {
        let p = d.join("aion2.db");
        open(SqliteConnectOptions::new().filename(&p), &p).await.unwrap()
    }
}
