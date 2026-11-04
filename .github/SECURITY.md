# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | yes (development) |

## Reporting a vulnerability

Please do **not** report security vulnerabilities through public GitHub issues.

1. Open a [GitHub security advisory](https://github.com/zetrox75-jpg/SonOfAlfred/security/advisories/new)
   for this repository, or
2. Contact the repository owner directly via a private channel.

Include: the affected component, steps or PoC to reproduce, and the impact. You will
get an acknowledgement; fixes ship in a patch release where possible.

## Scope notes

- This app runs locally and stores all data on the user's PC (SQLite). Reports about
  the local database, backup/restore paths and imported-file validation are in scope.
- The app only makes outbound HTTPS calls to `https://aion2.exchange/api/*` (public,
  read-only community API) when the user triggers a refresh. No credentials are
  transmitted or stored.
- Do not test against services you do not own. Never probe private game endpoints —
  that is explicitly out of scope for this project (see [`AGENTS.md`](../AGENTS.md)).
