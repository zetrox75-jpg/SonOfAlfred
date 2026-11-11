# Installation, backup and troubleshooting

AION 2 Craft Profit Manager 0.1.0, Windows 10/11 x64. All data stays on this PC.

> **Clean-install validation: Deferred / Not yet verified.** The installers below were built on
> 2026-10-31 but have not yet been tested on a clean Windows environment (see
> "Clean-install test" at the end). The development build and the end-to-end script were tested.

## Install

Two installers are produced by `npm run tauri build` (folder `src-tauri/target/release/bundle/`):

| Installer | File | Notes |
|-----------|------|-------|
| NSIS (recommended) | `nsis/AION 2 Craft Profit Manager_0.1.0_x64-setup.exe` | per-user install by default |
| MSI | `msi/AION 2 Craft Profit Manager_0.1.0_x64_en-US.msi` | for managed / per-machine installs |

1. Run one installer (not both).
2. The installers are **not code-signed**: Windows SmartScreen may show "Windows protected your
   PC". Choose *More info* > *Run anyway* only if you built the file yourself or trust its source.
3. The app needs **Microsoft Edge WebView2**. Windows 11 has it; on Windows 10 the installer
   downloads it if missing (internet needed once).
4. Start the app from the Start menu. The first start creates the database.

Uninstalling keeps your data folder (below) unless you tick the NSIS uninstaller's "delete the
application data" option. Delete the folder by hand only if you want to remove all data.

## Where your data is

| What | Location |
|------|----------|
| Database | `%APPDATA%\com.aion2.craftprofitmanager\aion2.db` (plus `aion2.db-wal` / `aion2.db-shm` while the app runs) |
| Backups | `%APPDATA%\com.aion2.craftprofitmanager\backups\` |
| Startup error log | `%TEMP%\aion2-craft-profit-manager-error.log` (only written when the app cannot start) |

Paste `%APPDATA%\com.aion2.craftprofitmanager` into the Explorer address bar to open the folder.
Never copy `aion2.db` alone while the app is running: use **Back up now** instead.

## Backups

**Settings > Backup and restore > Back up now…** asks where to save (default: the `backups`
folder, name `aion2-backup-<date>-<time>.db`).

- The copy is made with SQLite `VACUUM INTO`: it is complete and consistent even while the app is
  open, including changes still in the `-wal` file.
- Each copy is checked (`PRAGMA integrity_check`) before success is reported; a copy that fails
  the check is deleted and an error is shown.
- An existing file is **never overwritten**: choose a new name.

Automatic backups, in the same folder:

| File name | When |
|-----------|------|
| `aion2-pre-v<N>-<date>-<time>.db` | at start-up, before the database is upgraded to schema version N |
| `aion2-before-restore-<date>-<time>.db` | before a restore replaces your data |

Backups are never deleted by the app. Remove old ones yourself when you no longer need them.

## Restore

**Settings > Backup and restore > Restore from backup…**, pick a `.db` file, then confirm
"Replace ALL current data?". Steps, in order:

1. The chosen file is opened read-only and checked: it must be an intact SQLite file made by
   this app, with schema history 1..N matching this app's migrations exactly, all succeeded.
   A file from a **newer** app version (higher schema) is refused. Files that still have a
   non-empty `-wal` file beside them (a database in use) are refused.
2. It is copied into a staging file, and the copy is checked again.
3. Your current data is backed up to `aion2-before-restore-...db`.
4. Only then is the current database replaced. If replacing fails, the original is moved back.
5. The app restarts. A backup with an older schema is upgraded at start-up (with its own
   `pre-v<N>` backup first).

If any of steps 1–3 fails, the message starts with "Restore cancelled, nothing was changed".
If step 4 fails, the message says whether the original was put back; restart the app either way.

### Restore by hand

Only if the app cannot start or an in-app restore reported that the original could not be put back:

1. Close the app (check Task Manager: no `aion2-craft-profit-manager.exe`).
2. In `%APPDATA%\com.aion2.craftprofitmanager\`, rename `aion2.db` to `aion2-broken.db`, and also
   rename `aion2.db-wal` and `aion2.db-shm` if they exist (to `aion2-broken.db-wal` / `-shm`).
3. Copy the backup you want (for example `backups\aion2-before-restore-....db`) into that folder
   and rename the copy to `aion2.db`.
4. Start the app. Settings > Local database shows the schema version.

## Database upgrades (migrations)

Upgrades run at start-up, before any window opens. If the database has data and an upgrade is
pending, a `pre-v<N>` backup is written and checked first; **if that backup fails, no upgrade
runs** and the app shows why. Each migration runs in its own transaction. If one fails, the
message names the backup taken just before.

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| Full window "The database could not be opened" | Read the reason shown. *Newer than this app supports*: install the newer version, or restore a backup by hand. *Automatic backup … failed*: free disk space or fix folder permissions on `%APPDATA%`, then restart; nothing was changed. *Database upgrade failed*: restore the named `pre-v<N>` backup by hand. |
| Message box "The app could not start" / "Unexpected error" | Details are in `%TEMP%\aion2-craft-profit-manager-error.log`. Most often WebView2 is missing or broken: install or repair *Microsoft Edge WebView2 Runtime*, then restart. |
| "The app hit an unexpected error" with a stack | A display bug. Saved data is not affected (every write is all-or-nothing). Click *Restart the app*; report the shown text if it repeats. |
| "Database error … database is locked" | Another copy of the app (or a tool) has the database open. Close it and retry. |
| Window opens blank | Restart. If it repeats, repair WebView2 (see above). |
| SmartScreen blocks the installer | Unsigned build, see Install step 2. |
| Profit shows "incomplete" | Not an error: a price, fee or commission is missing. The message lists what. |

## Publishing an update

1. In a normal terminal (PowerShell blocks plain `npm`): `npm.cmd run release -- 0.1.2`
2. Commit and push the version change.
3. On GitHub, create a release tagged `v0.1.2` and upload **every** file from
   `src-tauri/target/release/bundle/upload/` (two installers and `latest.json`).

Installed copies then offer the update at start-up. The update must be signed with
`~/.tauri/aion2-craft-profit-manager.key`. **Back that key up privately and never commit it:** if
it is lost, installed copies cannot update and must reinstall by hand. A version without the
updater (0.1.0) must install the next version by hand once.

## Known limitations

- Clean-install validation of both installers: **Deferred / Not yet verified**.
- Installers are not code-signed. In-app updates exist from 0.1.1 and use the updater key.
- No AION 2 Global recipe, item or price data is shipped; nothing is verified Global yet
  (`docs/DATA_SOURCES.md`). Data is imported by the user (CSV templates in `data/templates/`).
- Automatic prices: only the aion2.exchange adapter (community source, enabled by default,
  user-authorized 2026-10-31; can be disabled in Settings), listings only (never completed
  sales), at most 1000 items per request.
- XLSX is not read (save as CSV UTF-8). No edit/delete screens for markets and sources, no item
  archiving, flat categories.
- In-game commission rounding is unknown: revenue is rounded down.

## Clean-install test (Deferred / Not yet verified)

To be done on a clean Windows environment (Windows Sandbox, a VM or a fresh user account), once per
installer:

1. Install. 2. Start the app; Settings shows schema v6 and foreign keys "Enforced".
3. Catalogue: add an item `Sandbox test` (region OTHER). 4. Settings: *Back up now…* to the default place.
5. Close the app, start it again: `Sandbox test` is still there and the backup file exists.

Windows Sandbox (Windows 10/11 Pro): in an administrator PowerShell run
`Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All`, reboot,
then start *Windows Sandbox* and copy the installer into it.
