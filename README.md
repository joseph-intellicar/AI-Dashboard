# InsightFlow — Nivora Home sales analytics

A sales analytics dashboard for **Nivora Home**, a fictional Indian D2C home & lifestyle brand.
You log in and see your own dashboard of KPIs, charts and tables. You can build new widgets with a visual builder,
edit, duplicate, recolour, move, resize or remove them, and change the date filter. Every change is saved to **your**
dashboard only. In edit mode you can **undo/redo** step by step, and **Version history** (clock icon) shows how your
dashboard changed over the last 30 days and lets you restore any earlier version.

**Insight AI** (Phase 2) is a chat assistant, opened from **Add widget → Create with AI** or the round **Ask AI** button. Describe a chart in plain language ("Show revenue by city
for the last 2 weeks") and it builds a live preview you can add to your dashboard with one click. Ask a question
("Which payment method has the highest return rate?") and it answers with exact numbers from the data, showing what
it queried.

Phase 1 built the dashboard. Phase 2 adds Insight AI, which uses the same widget format, catalog and query API (see
[Insight AI](#insight-ai-phase-2)).

- [REQUIREMENTS.md](REQUIREMENTS.md): what we're building, and the decisions behind it
- [ARCHITECTURE.md](ARCHITECTURE.md): how it works (storage, API contract, query engine, layout)
- [TASKS.md](TASKS.md): the Phase 1 task list and its status

---

## Test accounts

There are two fixed users, created by the seed. There's no sign-up.

| Name | Email | Password |
|---|---|---|
| Aarav Sharma | `aarav@nivora.in` | `Nivora@123` |
| Diya Iyer | `diya@nivora.in` | `Nivora@123` |

Each user has their own dashboard. To check this, log in as Aarav, add a widget and log out. Log in as Diya: the
widget isn't there. Log back in as Aarav: it is.

---

## Quick start

**You need:** Node.js 22+, pnpm 11+ and a PostgreSQL database. The project uses [Neon](https://neon.tech); any
PostgreSQL 15+ works.

```bash
pnpm install
cp .env.example .env        # then fill in your database URLs (see below)
pnpm db:migrate             # create tables and reporting views
pnpm db:seed                # 24 months of data + the 2 test users (~15–30 s on Neon)
pnpm db:verify              # optional: checks coverage and trends in the seeded data
pnpm dev                    # API on :3001, web app on http://localhost:5173
```

Open <http://localhost:5173> and log in with a test account.

### Environment variables (`.env`, never committed)

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API | Neon **pooled** URL (`…-pooler…`), `sslmode=verify-full` |
| `DIRECT_DATABASE_URL` | migrations, seed, verify | Neon **direct** URL (same host without `-pooler`) |
| `SESSION_SECRET` | API | any random string |
| `SEED_ANCHOR_DATE` | seed, verify | optional `YYYY-MM-DD` treated as "today", for reproducible data |
| `PORT` | API | default `3001` |
| `XAPI_KEY` | API | xAI API key for Insight AI. **Server only.** Without it the chat shows "not configured" |
| `AI_MODEL` | API | default `grok-4.7` |
| `AI_FALLBACK_MODEL` | API | default `grok-4.6`, used once if the main model fails before replying; `none` disables it |
| `AI_TIMEOUT_MS` | API | per model call, default `30000` |
| `AI_REASONING_EFFORT` | API | `low` (default, faster) · `medium` · `high` · `default` |

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | runs the API (tsx watch) and the web app (Vite) together |
| `pnpm build` | production build of the web app |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | TypeScript, ESLint, unit tests (Vitest) across all packages |
| `pnpm db:migrate` / `pnpm db:migrate:down` | apply all migrations / roll back the last one |
| `pnpm db:seed` | wipe and re-seed sales data and users; **also wipes saved dashboards and their history** |
| `pnpm db:seed --keep-dashboards` | re-seed but keep users' dashboards and history |
| `pnpm db:verify` | 26 SQL checks: coverage, view consistency and the planted trends |

---

## What's inside

```
apps/
  api/        Fastify API: auth (sessions), catalog, query engine, per-user dashboards, Insight AI (ai/)
  web/        React + Vite app: login, dashboard grid, widgets (ECharts), widget builder, chat panel (ai/)
packages/
  shared/     used by both: metrics catalog, WidgetConfig schema + builder rules,
              date ranges (IST), Indian number formatting, colours, default dashboard
db/           Kysely client, migrations, deterministic seed + verify
```

**Stack:** TypeScript end to end, React 18 and Vite 7, Tailwind CSS 4, Radix UI primitives, Apache ECharts (SVG),
react-grid-layout, dnd-kit, TanStack Query, Fastify 5, Kysely, PostgreSQL (Neon), Zod 4 and Vitest.

### How it works, in short

- **Login:** passwords are argon2id hashes. Sessions are random tokens stored as SHA-256 in an httpOnly cookie, with
  a 7-day sliding expiry. Login is rate-limited (10 attempts/min/IP).
- **Per-user dashboards:** there's one `dashboards` row per user and one `dashboard_widgets` row per widget. Each
  widget row holds its settings (`config`, JSON) and its grid position (`x, y, w, h`). Every query is scoped to the
  session user inside the SQL, so another user's widget ID returns 404. A dashboard is created from the default
  template on first login, and "Reset to default" copies the template again.
- **Widgets store settings, not data.** Each widget sends its own `POST /api/query`. The engine validates the
  settings against the catalog and builds **one SQL statement** over the reporting views (the current period,
  the previous period and totals together, via `GROUPING SETS`). User input only ever selects catalog keys or
  becomes bound parameters.
- **Metrics catalog:** 18 measures and 17 attributes, each with a description, synonyms, format and colours. The
  builder can only offer what's in the catalog, and the AI will have the same limit.
- **Undo and version history:** every change is still saved immediately. In edit mode each change becomes an undo
  step (`PUT /api/dashboard/widgets` saves the earlier snapshot); clicking **Done** records the session as one entry in
  `dashboard_versions`. Changes outside edit mode, resets and restores are recorded one by one. Versions are full
  snapshots with a computed change summary, kept for 30 days. See ARCHITECTURE §11.
- **Formatting:** Indian number formatting throughout (₹4,52,300 · ₹4.5L · ₹1.2Cr). All dates are IST.

### Dev-only pages

These pages exist only in `pnpm dev` and are compiled out of production builds:
- `/ui`: a gallery of the UI primitives
- `/dev/widgets`: every widget type, plus the empty and error states, at real grid sizes

---

## Phase 2 readiness

The AI chat will reuse the Phase 1 pieces as they are:

- **One widget format:** `WidgetConfigSchema` (Zod) in `packages/shared/src/widgetConfig.ts`.
  `widgetConfigJsonSchema()` exports it as a JSON Schema to use as a tool definition.
- **One catalog:** `GET /api/catalog` returns labels, descriptions, synonyms, formats and colour maps, with no SQL,
  ready to put in a prompt. `GET /api/catalog/attributes/:key/values` returns the valid filter values.
- **One query API:** `POST /api/query`, the same call the widgets and the builder preview make.
- **Dashboard commands:** add, update, duplicate and remove a widget; save the layout; set the date filter; reset.
  Each is its own endpoint and maps one-to-one onto an AI tool. The server validates every config, whoever sent it.
- **Recoverable changes:** AI edits will appear in the version history like any other change, so users can roll
  them back.

---

## Insight AI (Phase 2)

- **How it works:**
  - The browser calls `POST /api/ai/chat`, and the API streams the reply back as Server-Sent Events.
  - The API asks Grok (xAI) for help, but the model can only use three tools that the server runs: `propose_visualization` (validated with the builder's rules), `query_data` (the same query engine as the widgets) and `ask_clarification` (options from the catalog).
  - The system prompt is generated from the catalog, so new measures and attributes reach the AI automatically.
  - Details are in ARCHITECTURE §12.
- **Rules it follows:**
  - Every number comes from a query in the same turn.
  - Data we don't have (e.g. marketing spend) is reported as not available.
  - Off-topic requests get a fixed polite reply.
  - It only proposes new widgets.
- **Limits:**
  - 1,000 characters per message, 20 messages a minute and 200 a day per user.
  - 30 s per model call and 60 s per reply.
  - The conversation lives in the browser tab (session storage) and is cleared at logout.
- **Where it shows up:** widgets added from the chat go to the bottom of the dashboard and appear in Version history as "Added by Insight AI". The ⋯ menu on each widget has **Ask Insight AI about this**.

## Performance (measured on the seed data)

| What | Result |
|---|---|
| Database time per widget query (12 default widgets × 2 ranges) | p50 52 ms · p95 88 ms |
| Dashboard fully rendered (reload, warm) | ~0.6 s |
| Dashboard fully rendered (first load, Neon waking up) | ~3 s |
| Builder preview after a field change | ~250 ms when the server has the query cached; ~550–700 ms for a new one |

The app runs locally and the database is in Neon us-east-2, so every database round trip costs about 250–400 ms
from India. A new preview is therefore bounded by one round trip, and the 0.5 s target is only reachable for cached
queries. Hosting the API in the same region as the database would bring new queries to about 0.2–0.3 s. To keep
round trips down: each widget query is a single statement, validated sessions are cached for 30 s, and query
results are cached for 60 s on both the server and the client.

---

## Troubleshooting

- **`ETIMEDOUT` connecting to Neon from Node:** Node's "happy eyeballs" gives each address only 250 ms by default,
  which is too short for a long-distance TLS handshake. `db/src/client.ts` raises this to 2 s.
- **`psql` with `sslmode=verify-full` asks for `root.crt`:** run `PGSSLROOTCERT=system psql "$DATABASE_URL"` to use
  the system CA store.
- **Sourcing `.env` in a shell:** keep the URLs quoted, because they contain `&`.
