# TripBalancing Clean Project

Cleaned for GitHub upload on 2026-08-26.

Removed only non-runtime project clutter from the supplied fixed build:
- historical fix/audit notes (`*.txt` / old `*.md`)
- legacy duplicate `server-fixed.ts` (runtime scripts use `server.ts`)
- redundant `bun.lock` (project keeps `package-lock.json` for npm)
- empty AI Studio metadata folder

Kept application source, public assets, SQL/security migrations, configuration, `package.json`, `package-lock.json`, and `.env.example`.

Do not commit `.env` or `node_modules`; `.gitignore` excludes them.
