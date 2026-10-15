# InsightFlow — Phase 1 Tasks

> Built from [REQUIREMENTS.md](REQUIREMENTS.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
> Tick a task's box `[x]` when every acceptance criterion under it is met.
> Tasks are in build order; "Depends on" lists the tasks that must be done first.

## Definition of done (applies to every task)
- `pnpm typecheck`, `pnpm lint` and `pnpm test` (unit tests) pass.
- The task's acceptance criteria are checked manually.
- No secrets in committed files (`.env` stays git-ignored).
- Docs are updated if the task changed a decision in REQUIREMENTS.md or ARCHITECTURE.md.

**Testing policy:** each task ships with its **unit tests**. Playwright end-to-end tests and full regression runs are **not** done after each task. The only E2E work is one optional smoke test at the end (T40).

---

## Progress overview

| Milestone | Tasks |
|---|---|
| M0 Project setup | T01–T02 |
| M1 Data foundation | T03–T08 |
| M2 Shared package | T09–T13 |
| M3 Backend API | T14–T20 |
| M4 Frontend foundation | T21–T22 |
| M5 Widgets | T23–T28 |
| M6 Dashboard | T29–T31 |
| M7 Widget builder | T32–T37 |
| M8 Finish | T38–T40 |
| M9 Undo and version history | T41–T48 |
| M10 Phase 2 — AI chat (Insight AI) | T49–T60 |

---

## M0 — Project setup

### [x] T01 · Monorepo scaffold
**Depends on:** —
- pnpm workspaces: `apps/web`, `apps/api`, `packages/shared`; `db/migrations`, `db/seed`.
- TypeScript (strict) with a shared `tsconfig.base.json`; ESLint + Prettier; Vitest wired up in every package.
- Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `db:migrate`, `db:seed`.
- Env loading from the root `.env`, validated at startup (missing `DATABASE_URL` → clear error).

**Unit tests:** one sample test in each package so the runner is proven.

**Acceptance criteria**
- `pnpm install && pnpm typecheck && pnpm lint && pnpm test` succeed from a clean clone.
- `apps/web` and `apps/api` can both import from `@insightflow/shared`.
- `pnpm dev` starts the API and web placeholders together.
- `.env` is git-ignored and `.env.example` is present.

### [x] T02 · Database connection and migration tooling
**Depends on:** T01
- Kysely + `pg` with TLS. The API uses `DATABASE_URL` (pooled); migrations and the seed use `DIRECT_DATABASE_URL`.
- Small pool (max ~10). On startup the API pings the database and retries once to allow for a Neon cold start.
- Migration runner: `pnpm db:migrate` (up) and `pnpm db:migrate:down` (last migration).
- Type generation for the database schema (kysely-codegen or handwritten `DB` types).

**Unit tests:** env/config parser (pooled vs direct URL selection, missing vars).

**Acceptance criteria**
- `pnpm db:migrate` runs against Neon with no pending migrations and exits cleanly.
- The API logs "DB connected" on startup; a wrong URL gives a readable error, not a stack dump.

---

## M1 — Data foundation

### [x] T03 · Migration: app tables
**Depends on:** T02
- `users`, `sessions`, `dashboards` (`UNIQUE(user_id)`), `dashboard_widgets` (layout columns with `CHECK` constraints, index on `dashboard_id`), exactly as in ARCHITECTURE §4.1.
- Enable `pgcrypto` (for `gen_random_uuid()`) if needed.

**Acceptance criteria**
- Tables exist with all constraints; inserting a second dashboard for the same user fails.
- Deleting a dashboard cascades to its widgets.
- The migration can be rolled back and re-applied.

### [x] T04 · Migration: sales tables
**Depends on:** T03
- `regions`, `cities` (state, tier), `categories`, `products` (sku, sub_category, collection, mrp, launch_date, is_active), `customers` (email, acquisition_source, gender), `orders` (all columns in REQUIREMENTS §9.2), `order_items` (unit_cost, discount_amount).
- Enum-like `CHECK` constraints for channel, platform, payment_method, status and return_reason.
- Indexes: `orders(order_date)`, `orders(customer_id)`, `order_items(order_id)`, `order_items(product_id)`.

**Acceptance criteria**
- All tables, foreign keys and indexes exist.
- Invalid values (e.g. `channel = 'Shop'`) are rejected by the database.

### [x] T05 · Reporting views
**Depends on:** T04
- `v_order_lines` (one row per item, all column groups from REQUIREMENTS §9.3, IST date parts, price_band, customer_type, is_valid, delivery_days, line_net, line_profit…).
- `v_orders` (one row per order with order-level totals).

**Acceptance criteria**
- Both views can be queried. Column names match the spec.
- `SUM(line_net)` over `v_order_lines` equals the sum of order totals in `v_orders` for the same filter (checked once seed data exists, in T08).
- Dates in the views are in IST (an order at 23:30 UTC lands on the next IST day).

### [x] T06 · Seed: reference data and users
**Depends on:** T04
- Deterministic PRNG utility (fixed seed) and `SEED_ANCHOR_DATE` support.
- 4 regions, 8 cities (with state and tier), 6 categories, ~60 products with realistic names, sub-categories, collections, MRP ≥ price, cost 35–65%, launch dates (a few inside the window, including the breakout product).
- 2 users (Aarav, Diya) with argon2id-hashed `Nivora@123`.
- Truncate-and-reload in a single transaction; `--keep-dashboards` flag.

**Unit tests:** PRNG determinism; product generator gives the same output for the same seed.

**Acceptance criteria**
- Running the seed twice produces identical reference rows.
- Passwords in the database are hashes, not plain text.

### [x] T07 · Seed: customers, orders and order items
**Depends on:** T06
- ~2,500 customers (weighted by city, acquisition source, signup dates).
- ~8,500 orders over the 24 months ending at the anchor date (~5,000 in the latest 12), 1–4 items each, with weekly seasonality and noise.
- Realistic trends (REQUIREMENTS §10.3, soft targets): Lighting dip about 2 months ago, Diwali spikes led by Decor in both years, App rising and Marketplace falling, COD high returns, breakout product, coupon effect, acquisition-source repeat behaviour, regional skew.
- Status lifecycle: delivered_at, returned_at + reason; Processing/Shipped only in the last ~10 days; `is_first_order` precomputed.
- Coverage rules: every attribute value has data in any 30-day window; no dead channel × payment × region months; today and yesterday have orders.
- Batched inserts (multi-row `INSERT` or `COPY`); end-to-end under 30 s against Neon.

**Unit tests:** order generator determinism; status/date consistency (returned_at > delivered_at > order_date); discounts never exceed line value.

**Acceptance criteria**
- `pnpm db:seed` finishes in < 30 s and prints a summary (counts, revenue, date range).
- Two runs with the same `SEED_ANCHOR_DATE` produce identical checksums.
- Counts are within ±10% of the targets.

### [x] T08 · Seed verification script
**Depends on:** T05, T07
- `pnpm db:verify`: runs SQL checks for the coverage rules, the view consistency check (T05) and loose trend checks (e.g. COD return rate > 2× UPI; App share in the last quarter > the first quarter; Lighting revenue in the dip window < 50% of its normal level; Decor is the top category in the festive window).
- Prints a pass/fail table.

**Acceptance criteria**
- All checks pass on a fresh seed.
- Breaking a rule on purpose (e.g. deleting today's orders) makes the matching check fail.

---

## M2 — Shared package (`packages/shared`)

### [x] T09 · Indian number and date formatting
**Depends on:** T01
- `formatCurrency` (full `₹4,52,300`, compact `₹4.5L` / `₹1.2Cr` / `₹12.5K`), `formatNumber`, `formatPercent`, `formatChange` (↑/↓ pill text), `formatDays`.
- Date labels: `15 Oct 2026`, axis labels per grain (`15 Oct`, `W42`, `Oct '26`, `Q3 2026`).

**Unit tests:** lakh/crore grouping, rounding edges (e.g. ₹99,999 → ₹1L in compact format), negatives, zero, values under ₹100, percent precision.

**Acceptance criteria**
- All examples from REQUIREMENTS §13.4 are covered by tests and pass.

### [x] T10 · Date range resolution
**Depends on:** T01
- Preset definitions (Today … Last 12 months, Custom) resolved in Asia/Kolkata relative to "now" (injectable clock).
- Previous-period rules (REQUIREMENTS §12.3), including This month (same day span).
- Auto grain: day when the range is ≤ 90 days, otherwise month.
- Human labels for subtitles ("Last 30 days", "Custom: 1 Aug – 31 Aug").

**Unit tests:** every preset and its previous period; month ends and leap years; IST midnight boundaries; custom validation (from ≤ to, max 2 years).

**Acceptance criteria**
- All presets resolve correctly for a fixed clock (e.g. 2026-10-15 IST), with tests.

### [x] T11 · Metrics catalog
**Depends on:** T05
- All 17 measures and 18 attributes from REQUIREMENTS §11.3–11.4: key, label, description, synonyms, format, aggregation type, `positiveIsGood`, status scope, group, grains, value order, incompatible attributes.
- Server-only SQL expressions kept apart from the client-safe export.
- Brand chart palette, "Other" colour, fixed value-colour maps (Category, Channel, Payment Method, Region, Status, Platform, Customer Type, Acquisition Source) and a deterministic hash colour for many-valued attributes.

**Unit tests:** keys are unique; every attribute maps to a view column; the client export contains no SQL; colour maps cover every seeded value; the hash colour is stable.

**Acceptance criteria**
- The catalog compiles and is the only place measure/attribute definitions exist.

### [x] T12 · WidgetConfig schema and builder logic
**Depends on:** T10, T11
- Zod `WidgetConfigSchema` (version 1) with per-type slot rules (KPI, Line, Bar, HBar, Donut, Table), the additive-only rule for donuts, limits (max 50, donut 6) and filter shape.
- `validateForBuilder(config)` → `{ valid, reason }` with the one-line messages from REQUIREMENTS §7.8.
- `suggestType(fields)`, `autoTitle(config)`, `autoSubtitle(config, dashboardFilter)`, `queryPart(config)`.
- `getVisualizationAvailability(fields)` → enabled/disabled + hint per type.
- `convertFieldsOnTypeChange(config, newType)` → kept/dropped fields.
- JSON Schema export (`widgetConfigJsonSchema`) for Phase 2.

**Unit tests:** valid and invalid configs per type; each reason message; type suggestion rules; title generation (with a filter, top-N table, two measures); `queryPart` excludes appearance/title; type switching keeps compatible fields.

**Acceptance criteria**
- All slot rules from REQUIREMENTS §7.3 are enforced by the schema and covered by tests.

### [x] T13 · Default dashboard template
**Depends on:** T12
- `DEFAULT_DASHBOARD`: the date filter plus the 12 widgets with configs and layouts from ARCHITECTURE §4.5.
- Per-type default sizes and minimum sizes (KPI 2×2, charts 3×3, table 4×3).

**Unit tests:** every template config passes `WidgetConfigSchema`; layouts don't overlap and fit inside 12 columns.

**Acceptance criteria**
- The template matches the default dashboard table in REQUIREMENTS §5.

---

## M3 — Backend API (`apps/api`)

### [x] T14 · API server foundation
**Depends on:** T02
- Fastify app: cookie plugin, CORS for the web dev server, JSON error format `{ error: { code, message } }`, request logging without secrets, `GET /api/health` (DB check).
- Zod-based request validation helper.

**Unit tests:** error mapper (validation error → 400 with message, unknown → 500 without internals).

**Acceptance criteria**
- `GET /api/health` returns `{ ok: true }` when Neon is reachable.
- An unhandled error returns the standard error JSON.

### [x] T15 · Authentication
**Depends on:** T03, T06, T14
- `POST /api/auth/login` (case-insensitive email, argon2id verify, generic error, rate limit 10/min/IP), `POST /api/auth/logout`, `GET /api/auth/me`.
- Session token: random 32 bytes; SHA-256 hash stored; httpOnly + SameSite=Lax cookie; 7-day sliding expiry.
- `requireUser` preHandler on every protected route.

**Unit tests:** token hashing; expiry/sliding logic; email normalisation.

**Acceptance criteria**
- Login with both test accounts works; a wrong password gives "Invalid email or password".
- Protected routes return 401 without a cookie and 200 with one.
- After logout the old cookie no longer works.
- The 11th rapid login attempt is rate-limited.

### [x] T16 · Catalog endpoints
**Depends on:** T11, T15
- `GET /api/catalog` (client-safe catalog plus colour maps).
- `GET /api/catalog/attributes/:key/values?q=` (distinct values from the views, search, sorted by the attribute's value order).

**Acceptance criteria**
- The catalog response contains no SQL.
- `/attributes/region/values` returns the 4 regions; an unknown key returns 404; `q=ben` on city returns Bengaluru.

### [x] T17 · Query engine: core
**Depends on:** T10, T12, T16
- `POST /api/query`: validate the config, resolve the date range (dashboard vs own range), build SQL from the catalog over `v_order_lines` / `v_orders`.
- Measures (additive, ratio-of-sums, distinct), attributes, filter (`in` / `not_in`, bound parameters), sort, limit.
- KPI totals; table with mixed columns.
- `SET LOCAL statement_timeout = '5s'` inside a transaction; error codes `INVALID_CONFIG`, `UNKNOWN_FIELD`, `QUERY_TIMEOUT`, `INTERNAL`.

**Unit tests:** SQL builder output for each widget type (snapshot of the compiled SQL and parameters); unknown keys rejected; filter values always parameterised.

**Acceptance criteria**
- With the anchor date fixed, Revenue / Orders / AOV / Gross Profit / Margin % / Customers / Return Rate for Last 30 days match hand-written SQL.
- A filter value like `South'; DROP TABLE orders;--` returns zero rows and no error, and the database is untouched.

### [x] T18 · Query engine: time series and comparison
**Depends on:** T17
- Date grains (auto/day/week/month/quarter) in IST; gap-filling of empty dates with zeros; chronological sort for date charts.
- `compare: true` → previous-period totals (KPI) and rows (line comparison); "no prior data" flag.
- 2-measure line results.

**Unit tests:** gap-fill logic; grain selection; previous range attached to `meta`.

**Acceptance criteria**
- Revenue by Date for Last 30 days returns exactly 30 rows (including zero days); for Last 12 months it returns 12 or 13 month rows.
- A KPI with compare returns both current and previous totals, and the previous range in `meta`.

### [x] T19 · Query engine: donut "Other", totals and caching
**Depends on:** T17
- Donut: top 5 + "Other" when there are more than 6 values; donut rejected for ratio measures.
- `totals` in every response (table footer, donut centre).
- Server LRU cache (60 s) keyed on the query part + resolved range; `meta.queryMs`.

**Unit tests:** "Other" bucketing; cache key ignores appearance/title; cache expiry.

**Acceptance criteria**
- Revenue by City as a donut returns 6 slices with "Other" = the sum of the remaining cities.
- A repeated identical query is served from cache (visible in logs or `meta.cached`).
- p95 database time per query < 300 ms on seed data (measured once with a small script).

### [x] T20 · Dashboard API
**Depends on:** T13, T15
- Repository functions (ARCHITECTURE §4.4): `getOrCreateDashboard` (template copy, `ON CONFLICT`), `addWidget` (at top, shift others), `updateWidgetConfig`, `deleteWidget`, `duplicateWidget` (placed below the original), `saveLayout` (all-or-nothing, layout sanity check), `setDateFilter`, `resetDashboard`. Every function scoped by `userId` through SQL joins.
- Routes from ARCHITECTURE §5 (GET/PATCH dashboard, POST/PATCH/DELETE widgets, PUT layout, POST reset, POST duplicate).
- Server-side `WidgetConfigSchema` validation on every write.

**Unit tests:** layout sanity validator (`x + w ≤ 12`, minimum sizes); add-at-top shifting function; duplicate placement function.

**Acceptance criteria** (checked with curl or a REST client)
- First `GET /api/dashboard` for each user creates the 12 default widgets; the second call returns the same IDs.
- Aarav adds a widget → it appears in Aarav's GET and **not** in Diya's.
- Diya PATCHing, DELETEing or saving the layout of Aarav's widget ID gets **404**, and Aarav's widget is unchanged.
- Reset for Aarav restores 12 default widgets and does not change Diya's dashboard.
- An invalid config (e.g. a line chart without a date) returns 400 with a clear message.

---

## M4 — Frontend foundation (`apps/web`)

### [x] T21 · Web app scaffold and design system
**Depends on:** T01
- Vite + React + TypeScript, Tailwind with design tokens (teal #0F766E, amber #F59E0B, slate neutrals, radius, shadows), Inter font.
- React Router, TanStack Query client, API client (`credentials: 'include'`, error parsing, 401 → redirect to login).
- UI primitives: Button, IconButton, Card, Modal/Drawer, Dropdown menu, Tooltip, Toast, ConfirmDialog, Toggle, Segmented control, Skeleton, Input, Select/Multi-select, Date range picker.

**Unit tests:** API client error parsing; 401 handling.

**Acceptance criteria**
- A temporary `/ui` page (dev only) shows every primitive in the brand style.
- Primitives are keyboard-accessible (Tab, Enter, Esc) with visible focus rings.

### [x] T22 · Login page, auth guard and app header shell
**Depends on:** T15, T21
- Login page (branding, email/password, error message, loading state, Enter to submit).
- Route guard: no session → `/login`; logged in on `/login` → dashboard.
- Header shell: logo, user avatar (initials) + name, Logout (clears the query cache).

**Acceptance criteria**
- Logging in as Aarav shows "Aarav Sharma" in the header; logout returns to login.
- After logout, the browser back button doesn't show dashboard content.
- Wrong credentials show the generic error without clearing the email field.

---

## M5 — Widgets (`apps/web/src/widgets`)

### [x] T23 · Widget framework
**Depends on:** T09, T12, T17, T21
- `<Widget config dashboardFilter />` chooses the component by type; `useWidgetData` (one `/api/query` per widget, query key from `queryPart` + effective range, 60 s stale time).
- Shared states: type-shaped skeleton, empty state "No data for this period", error state with Retry.
- ECharts base theme (fonts, gridlines, tooltip card, animation, `prefers-reduced-motion`), and colour resolution (widget override → global value map → hash colour → palette).

**Unit tests:** colour resolution order; effective date range selection; query key ignores appearance.

**Acceptance criteria**
- A test page renders any config in loading, data, empty (a range with no data) and error (API stopped) states.
- Changing only a colour does not trigger a network request.

### [x] T24 · KPI card
**Depends on:** T23
- Large value, label, change pill (good/bad colour from `positiveIsGood`; neutral under 0.5%), "vs previous N days" caption, "— no prior data", optional secondary measure, mini sparkline, accent colour.

**Unit tests:** change % calculation and colour logic (including Return Rate going up = red).

**Acceptance criteria**
- All 6 default KPIs render with correct values and arrows for Last 30 days; Gross Profit shows the margin as secondary text.

### [x] T25 · Line chart
**Depends on:** T23
- 1–2 measures, two stacked panels when the formats differ, auto/explicit grain, smooth/area options, dashed previous-period line, hover markers, Indian-format tooltips and compact axes.

**Acceptance criteria**
- Revenue Trend shows daily points for Last 30 days and monthly points for Last 12 months.
- Revenue + Margin % uses two axes with correct formats.

### [x] T26 · Bar and horizontal bar charts
**Depends on:** T23
- Rounded bars, capped bar width, sorted, single colour or colour by value, per-value overrides, data labels, label truncation with tooltip.

**Acceptance criteria**
- Revenue by Category uses the fixed category colours; Revenue by City (hbar) is sorted descending with value labels.
- A per-value override (Lighting = red) shows only on that widget.

### [x] T27 · Donut chart
**Depends on:** T23
- 60% inner radius, total in the centre, up to 6 slices + grey "Other", legend with %, slice colour overrides.

**Acceptance criteria**
- Sales by Channel and Orders by Payment Method render with fixed colours and correct percentages that add to 100%.

### [x] T28 · Table
**Depends on:** T23
- Sticky header, column formats, right-aligned tabular numbers, header click to sort (client-side), inline data bar on the first measure, totals row (optional display), scroll inside the card.

**Acceptance criteria**
- Top 10 Products shows product, category, units and revenue in full Indian format, sorted by revenue; the breakout product appears in it for Last 30 days.

---

## M6 — Dashboard (`apps/web/src/dashboard`)

### [x] T29 · Dashboard page (view mode)
**Depends on:** T20, T22, T24–T28
- `useDashboard` (GET, cache) and the grid (`react-grid-layout`, 12 cols, row height 80, vertical compaction).
- Header: global date filter (presets + custom), "+ Add widget" (opens the builder; wired in T32), "Edit dashboard" toggle, overflow menu → Reset to default (with confirmation), "Saving… / Saved" indicator.
- Date filter change → `PATCH /api/dashboard` and re-query of widgets that follow the dashboard filter only.
- Widget card: title, subtitle, own-range badge, ⋯ menu placeholder.
- Responsive: single column below 768 px (ordered by y then x, no saving).

**Acceptance criteria**
- After login, the default 12-widget dashboard loads, widgets load independently, and one failing widget shows Retry while the others render.
- Changing the filter to Last 90 days updates every dashboard-filter widget and persists after refresh and re-login.
- Reset to default restores the template after confirmation.
- On a phone-width window, widgets stack in one column in the correct order.

### [x] T30 · Edit mode: move, resize, delete
**Depends on:** T29
- The Edit dashboard toggle enables drag and resize (minimum sizes per type) and shows the ✕ button; the label changes to "Done"; a dotted grid background.
- Layout save: debounced 500 ms after drag/resize stop → `PUT /api/dashboard/layout`; optimistic, with rollback and a toast on failure.
- Delete: ✕ → confirmation "Remove '<title>'?" → `DELETE` (optimistic).

**Unit tests:** layout diff → payload mapper; debounce collapses multiple drags into one save.

**Acceptance criteria**
- Dragging and resizing a widget, then refreshing, keeps the new layout; the other user's layout is unaffected.
- Widgets cannot be moved in view mode.
- Deleting asks for confirmation and the widget stays gone after refresh.

### [x] T31 · Widget menu, duplicate and new-widget highlight
**Depends on:** T30
- ⋯ menu (available in both modes): Edit (opens the builder pre-filled; wired in T32), Duplicate (`POST …/duplicate`, placed below), Remove (same confirmation as ✕).
- New or edited widget: scroll into view and a 2 s teal highlight.

**Acceptance criteria**
- Duplicate creates an identical widget directly below the original that persists after refresh.
- Remove from the menu works exactly like ✕.

---

## M7 — Widget builder (`apps/web/src/builder`)

### [x] T32 · Builder shell and draft state
**Depends on:** T12, T29
- Large modal (about 90% of the viewport) with three areas and a footer; full-screen with tabs (Fields / Preview / Settings) on small screens.
- Draft state store: the `WidgetConfig` being edited, initialised empty (Add) or from the widget (Edit).
- Close/Cancel with unsaved changes → "Discard changes?"; Esc closes, Ctrl/Cmd+Enter saves.
- Wire "+ Add widget" and ⋯ → Edit to open it.

**Unit tests:** draft reducer (add/remove field, change type, set option) using the shared helpers.

**Acceptance criteria**
- The builder opens empty from "+ Add widget" and pre-filled from Edit; the discard prompt appears only when something changed.

### [x] T33 · Data fields panel
**Depends on:** T16, T32
- Search (name, description, synonyms); Measures and Attributes groups (attributes sub-grouped into Time / Product / Customer / Order; collapsible); distinct chip colours; format/type icons; tooltips with descriptions.
- Click → fills the next compatible empty slot; drag (dnd-kit) → drop onto a slot; incompatible chips dimmed with a reason tooltip.

**Acceptance criteria**
- Searching "sales" finds Revenue (synonym); "city" finds City.
- Clicking Revenue then Category fills both slots and suggests a Bar chart.
- Chips can be dragged into slots with the mouse and added with the keyboard (Enter).

### [x] T34 · Visualization picker, field slots and suggested type
**Depends on:** T33
- Six type tiles with disabled state and hint text; a "Suggested" label.
- Slots per type (REQUIREMENTS §7.3) with filled chips and ✕; table columns can be reordered by drag; date grain selector on the date slot.
- Switching type keeps the compatible fields and shows "Removed: …" for dropped ones.

**Acceptance criteria**
- With Revenue only, KPI is suggested and Line shows "Line chart needs a date attribute".
- The donut tile is disabled for AOV with the additive hint.
- Changing Bar → Table keeps both fields as columns.

### [x] T35 · Options panel
**Depends on:** T34
- Date range: "Use dashboard filter" or preset/custom (date picker with validation).
- Sort (measure or column, asc/desc; hidden for date charts), top-N limit (default 10, max 50, donut 6).
- Filter: attribute picker + multi-select values from the values endpoint, "is one of / is not one of".
- Display options: number format, data labels, legend show/position, line smooth/area/compare, KPI compare toggle and secondary measure.

**Acceptance criteria**
- Each option changes the preview correctly (e.g. Region = South filters the results; limit 5 shows 5 bars).
- Custom range with from > to shows the validation reason and disables saving.

### [x] T36 · Live preview, title and subtitle
**Depends on:** T23, T35
- Preview uses the same `<Widget>` component and default size per type; debounced query (~300 ms) only for valid configs; placeholder with the reason when invalid.
- Editable title (click to edit; Enter/blur commits), auto-title until edited (`titleIsCustom`), "↺ Auto" link to restore it; auto subtitle.

**Acceptance criteria**
- The preview updates within ~0.5 s of a change and looks identical to the widget on the dashboard.
- The title auto-updates when fields change, until the user edits it; after that it stays.

### [x] T37 · Colour customisation
**Depends on:** T36, T26, T27
- "Colours" section in Options per type (KPI accent, line series colours, bar single colour / colour by value + per-value overrides, donut slice colours, table data bar).
- Click a bar, slice or line in the preview → colour popover (palette swatches, hex input, reset to default).
- Overrides saved in `appearance.colors` for this widget only; automatic label text contrast.

**Unit tests:** override merge/reset logic; contrast colour picker.

**Acceptance criteria**
- Clicking the "Lighting" bar and choosing red changes only that bar; after saving and refreshing it is still red, and other widgets still show the default Lighting colour.
- "Reset to default" in the popover restores the catalog colour.

---

## M8 — Finish

### [x] T38 · Builder save flow and footer validation
**Depends on:** T37, T31
- Footer: Cancel and "Add to dashboard" / "Save changes"; the button is disabled with the one-line reason from `validateForBuilder`.
- Save: POST (add) or PATCH (edit), optimistic; on success close the builder, scroll to the widget and highlight it; on failure show a toast and keep the builder open with the draft intact.

**Acceptance criteria**
- An invalid draft shows the right reason ("Pick a measure to continue" etc.) and cannot be saved.
- A new widget appears at the top, highlighted, and persists after refresh only for the user who created it (manual check: Aarav adds → Diya doesn't see it → Aarav does).
- Editing an existing widget updates it in place without changing its position.

### [x] T39 · Polish, accessibility, performance and README
**Depends on:** T38
- Visual pass across all widgets and screens (spacing, typography, card styles, empty/error illustrations, consistent colours).
- Accessibility pass: keyboard path through header, menus and builder; chart `aria-label` summaries; AA contrast.
- Performance check: dashboard visible < 3 s; preview < 0.5 s; widget queries p95 < 300 ms DB time. Note the measured results.
- README: overview, setup (`pnpm install`, `db:migrate`, `db:seed`, `dev`), env vars (no secrets), scripts, architecture summary, **"Test accounts"** (both users and passwords), and Phase 2 notes (catalog, WidgetConfig JSON Schema).
- Remove the dev-only `/ui` page from production builds.

**Acceptance criteria**
- A new developer can follow the README from a clean clone to a working dashboard.
- Every item in REQUIREMENTS.md sections 3–8 has been checked manually at least once (tick off a checklist in the PR/notes).

### [ ] T40 · (Optional) Single Playwright acceptance smoke test
**Depends on:** T38. **Run only when requested.**
- One Playwright test for the core per-user check: Aarav logs in → adds a widget → logs out → Diya logs in, widget absent → Aarav logs in, widget present.
- Runs against a Neon test branch (`TEST_DATABASE_URL`).

**Acceptance criteria**
- `pnpm test:e2e` passes locally.

---

## M9 — Undo and version history (REQUIREMENTS §6.8–6.9)

> Added 2026-10-15 after the Phase 1 review. Same testing policy: unit tests per task, **no Playwright**.

### [x] T41 · Migration: `dashboard_versions`
**Depends on:** T03
- New migration `0004_dashboard_versions`: `id`, `dashboard_id → dashboards (cascade)`, `kind` (CHECK on the allowed kinds), `summary`, `changes jsonb`, `widgets jsonb`, `created_at`; index on `(dashboard_id, created_at desc)`.
- Kysely types in `db/src/schema.ts`.

**Acceptance criteria**
- `pnpm db:migrate` applies it on Neon; `pnpm db:migrate:down` removes it cleanly and re-applying works.
- Re-seeding without `--keep-dashboards` empties the table (cascade through users → dashboards).

### [x] T42 · Shared: snapshot diff and change summary
**Depends on:** T12
- `packages/shared/src/history.ts`: `WidgetSnapshot` (`id`, `config`, `layout`), `VersionKind`, `VersionChange`.
- `diffSnapshots(before, after)` → added / removed / edited / moved / resized. "Moved" ignores pure reflow: only widgets that changed column, or that fall outside the longest common reading order (y, then x), count as moved.
- `summariseChanges(changes)` → "Moved 3 widgets · Removed Revenue by City"; `versionSummary(kind, changes, { restoredFrom })`; `describeStep(before, after)` for undo tooltips ("move Total Revenue").
- `snapshotsEqual(a, b)`.

**Unit tests:** each change type; dragging one widget to the bottom reports only that widget as moved; removing a widget doesn't report the reflowed widgets; summary wording and pluralisation; equality ignores widget order in the array.

**Acceptance criteria**
- The same functions are used by the API (version summaries) and the web app (undo labels, preview badges).

### [x] T43 · API: recording versions, list and detail
**Depends on:** T41, T42, T20
- `apps/api/src/dashboard/history.ts`: `recordVersion(db, userId, kind, opts)`: reads the current widgets and the latest version in one query, skips when equal, otherwise inserts the snapshot with its diff and summary and deletes rows older than 30 days (always keeping the newest). Two round trips.
- Recorded automatically by: first dashboard creation (`created`), add / edit / duplicate / remove (`added` … `removed`) unless the request has `?record=false` (edit mode), reset (`reset`). Layout saves never record.
- `POST /api/dashboard/versions` records an `edit_session` if anything changed; with no earlier version it records the starting point (`created`, "History started").
- `GET /api/dashboard/versions` (30 days, newest first, no snapshots); `GET /api/dashboard/versions/:id` (with snapshot). Another user's ID, or a bad UUID → 404.

**Unit tests:** route validation and the 404 for malformed IDs; the "skip when unchanged" and retention decisions as pure functions.

**Acceptance criteria**
- (API check) Add a widget → a new `added` version; change the date filter → no new version; `POST /versions` twice with no change → only one version.
- Diya gets 404 for Aarav's version ID.

### [x] T44 · API: replace widgets (undo) and restore a version
**Depends on:** T43
- `PUT /api/dashboard/widgets` `{ widgets: [{ id, config, layout }] }`: replaces the user's widgets in **one statement**, keeping IDs (a removed widget comes back with its old ID). Configs and layout validated as on every write; an ID owned by another dashboard → 404 and nothing changes. Does not record a version (it is used inside edit sessions).
- `POST /api/dashboard/versions/:id/restore`: re-validates every widget in the snapshot, skips the invalid ones, replaces the widgets (date filter untouched), records a `restored` version ("Restored version from 12 Oct, 4:32 PM"), returns `{ dashboard, skipped }`.

**Unit tests:** body validation (duplicate IDs, bad layout, invalid config → 400); restore filtering of invalid snapshot widgets (pure helper).

**Acceptance criteria**
- (API check) Remove a widget, then PUT the earlier widget list: the widget is back with the same ID, config and position.
- Restore an older version: `GET /api/dashboard` matches its snapshot, the date filter is unchanged, and a `restored` version is on top.

### [ ] T45 · Web: undo and redo in edit mode
> Implemented and unit-tested; tick after the manual browser check.
**Depends on:** T42, T44, T30
- Pure `undoStack.ts` (push clears redo, 50-step cap, undo, redo).
- Every successful change in edit mode (move, resize, remove, add, edit, duplicate) pushes `{ before, after, label }`; widget changes in edit mode send `?record=false`.
- **Undo / Redo** buttons just before **Done**, disabled when empty or while saving; tooltips "Undo: move Total Revenue"; toast after an undo. Each step is saved through `PUT /api/dashboard/widgets` (optimistic, rolls back on error and keeps the step).
- Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y; ignored while a dialog/builder is open or an input has focus.
- **Done** flushes pending saves, records the session (`POST /api/dashboard/versions`) and clears the stack; the dashboard page also calls it once on load to close an unfinished session.
- Remove confirmation in edit mode says the removal can be undone.

**Unit tests:** undo stack; keyboard-shortcut guard.

**Acceptance criteria**
- REQUIREMENTS §6.8 acceptance criteria 1–6 (checked manually / by API inspection).

### [ ] T46 · Web: version history panel
> Implemented and unit-tested; tick after the manual browser check.
**Depends on:** T43
- Clock button **Version history** in the header (view mode only; disabled in edit mode with "Click Done to see the history").
- Side panel (full-screen sheet on mobile): versions grouped by day (Today / Yesterday / 12 Oct 2026), time in IST, type tag, summary shortened with "+N more", top entry marked **Current**, empty state "No changes in the last 30 days", loading and error states.
- The versions list is refreshed after any change that records a version.

**Unit tests:** day grouping and labels in IST; summary shortening.

**Acceptance criteria**
- The panel lists the right entries after: an edit session, adding a widget in view mode, a reset.

### [ ] T47 · Web: preview and restore a version
> Implemented and unit-tested; tick after the manual browser check.
**Depends on:** T45, T46
- Clicking an entry shows that version's widgets read-only in the grid (live data, current date filter); no drag, ⋯ menu, Add widget or Edit dashboard.
- Badges **Added / Edited / Moved** vs. the current dashboard; banner "Viewing version from …" with "Not in this version: …", **Restore this version** and **Back to current**; Esc returns.
- Restore asks for confirmation, calls the restore endpoint, updates the dashboard, shows a toast (mentioning skipped widgets) and returns to the live view. Clicking **Current** returns too.

**Unit tests:** badge computation for a version vs. the current dashboard.

**Acceptance criteria**
- REQUIREMENTS §6.9 acceptance criteria 1–8 (manually / by API inspection).

### [x] T48 · Docs and verification
**Depends on:** T47
- ARCHITECTURE.md: version storage, recording rules, undo flow, new endpoints. README: features and endpoints.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass; API-level check script for the T43/T44 criteria run against Neon.

**Acceptance criteria**
- Docs match the implementation; all checks pass.

---

## M10 — Phase 2: AI chat, Insight AI (REQUIREMENTS §17)

> Steps P01–P12 of REQUIREMENTS §17.14. Unit tests per task with a **scripted fake model**; **no Playwright**.
> Real-model checks are done by hand / small API scripts.

### [x] T49 · Provider client and configuration (P01)
**Depends on:** T14
- Env: `XAPI_KEY` (optional), `AI_MODEL` (default `grok-4.7`), `AI_FALLBACK_MODEL` (default `grok-4.6`, `none` disables), `AI_TIMEOUT_MS` (default 30000) in `db/src/env.ts`; placeholders in `.env.example`.
- `apps/api/src/ai/model.ts`: `ChatModel` interface (streamed text + tool calls + usage), xAI implementation with the `openai` SDK (`baseURL https://api.x.ai/v1`), per-call timeout and abort, fallback to the second model when the first fails before streaming anything (not on 4xx/429).
- `scriptedModel()` fake for tests. Logger redacts the key.
- `GET /api/ai/status` → `{ configured: boolean }`.

**Unit tests:** fallback rules (fails before output → fallback; fails after output → error; 429 → no fallback); tool-call delta assembly.

**Acceptance criteria**
- A real "say hello" call works with the key in `.env`; the key never appears in logs or responses; without a key, status says not configured.

### [x] T50 · Context and system prompt (P02)
**Depends on:** T49, T16
- `apps/api/src/ai/context.ts`: generated prompt: rules (§17.6), catalog (labels, descriptions, synonyms, compatibility), types + slot rules, presets, data date range (cached), today in IST, attribute values, dashboard filter + widget titles, open preview, widget context.

**Unit tests:** the prompt contains every catalog measure/attribute and the rules; a catalog entry added in a test appears automatically.

**Acceptance criteria**
- Prompt size stays reasonable (< ~8k tokens); nothing from the database except values and the date range.

### [x] T51 · Tools and validation (P03)
**Depends on:** T50, T17
- `apps/api/src/ai/tools.ts`: JSON schemas and executors for `propose_visualization`, `query_data`, `ask_clarification`.
- Proposals: defaults filled, `WidgetConfigSchema` + slot rules, filter values checked against real values, options normalised, auto title. Invalid → reasons for the model.
- `query_data` → table-shaped `QueryConfig` through the **same engine instance** as `/api/query`; `compare` runs the previous period too; ≤ 50 rows; source descriptions.
- Clarification options checked against catalog/presets/types.

**Unit tests:** valid/invalid proposals (unknown key, slot error, bad filter value, ratio donut); query_data mapping; clarification filtering.

**Acceptance criteria**
- An invalid proposal never produces a preview; `query_data` numbers equal `/api/query` for the same fields.

### [x] T52 · Tool loop and chat endpoint (P04)
**Depends on:** T51
- `apps/api/src/ai/agent.ts`: tool loop (≤ 6 rounds, ≤ 2 retries after invalid proposals, clarification ends the turn), events `text` / `status` / `preview` / `clarification` / `sources` / `done` / `error`.
- `POST /api/ai/chat` streaming SSE; request validation (1,000-char message, 20-message history), 60 s turn timeout, abort on client disconnect, rate limits 20/min and 200/day per user, metadata-only logging.

**Unit tests:** with the scripted model — event order, invalid proposals hidden, clarification stops the loop, round cap, abort.

**Acceptance criteria**
- `curl` against the real model streams events for "Show revenue by city for the last 2 weeks" ending in a valid preview.

### [x] T53 · Dashboard support for AI adds (P05)
**Depends on:** T44
- `POST /api/dashboard/widgets` accepts `{ position: "bottom" }` and `?source=ai`; migration adds version kind `ai_added` ("Insight AI" tag, "Added by Insight AI · …").

**Unit tests:** summary wording for `ai_added`.

**Acceptance criteria**
- (API check) a bottom add lands below the lowest widget; Version history shows "Added by Insight AI · …".

### [ ] T54 · Chat panel shell (P06)
> Implemented and unit-tested; the AI behaviour behind it is verified through the API against the real model. Tick after the manual browser check.
**Depends on:** T46
- Header "Insight AI" button; right panel ~420 px (full screen < 768 px); one right panel at a time; disabled in edit mode and while previewing a version.
- Welcome screen with the 4 suggestion cards; Suggestions popover by the input; Clear conversation; session storage per user, cleared on logout; "not configured" state.

**Unit tests:** conversation storage (save/restore/clear per user).

**Acceptance criteria**
- Panel opens/closes with the dashboard usable; edit mode closes and disables it; chat survives refresh; gone after logout.

### [ ] T55 · Messages and streaming (P07)
> Implemented and unit-tested; the AI behaviour behind it is verified through the API against the real model. Tick after the manual browser check.
**Depends on:** T52, T54
- SSE client; user/assistant bubbles; streamed text; typing indicator; status line; Stop; error with Retry; auto-scroll; light markdown (bold, bullets) without HTML.

**Unit tests:** SSE parser; message reducer; markdown renderer escapes HTML.

**Acceptance criteria**
- Replies stream in; Stop ends a reply; a forced error shows Retry that works.

### [ ] T56 · Preview cards (P08)
> Implemented and unit-tested; the AI behaviour behind it is verified through the API against the real model. Tick after the manual browser check.
**Depends on:** T55, T53
- Card renders `WidgetView`; **Add to dashboard** (bottom, scroll + highlight, "Added to dashboard ✓"), **Edit** (builder pre-filled, saves at the bottom), **Discard**; in-place refinement; state persisted; follow-up chips.

**Unit tests:** preview reducer (replace in place, new card after added/discarded).

**Acceptance criteria**
- REQUIREMENTS §17.15 tests 1, 3, 7 and 8.

### [ ] T57 · Clarification UI (P09)
> Implemented and unit-tested; the AI behaviour behind it is verified through the API against the real model. Tick after the manual browser check.
**Depends on:** T55
- Option buttons (radio group per question, recommended pre-selected), Continue sends the choice as a user message, buttons become read-only; typing an answer also works.

**Unit tests:** answer text built from selections.

**Acceptance criteria**
- §17.15 test 2.

### [ ] T58 · Data answers and "Based on" (P10)
> Implemented and unit-tested; the AI behaviour behind it is verified through the API against the real model. Tick after the manual browser check.
**Depends on:** T56
- "Based on" line from `sources`; **Show as chart** builds a preview locally (validated); off-topic and unavailable-data behaviour checked.

**Unit tests:** source → preview config conversion.

**Acceptance criteria**
- §17.15 tests 4, 5, 6 and 10 (test 6 compared with SQL).

### [ ] T59 · "Ask Insight AI about this" (P11)
> Implemented and unit-tested; the AI behaviour behind it is verified through the API against the real model. Tick after the manual browser check.
**Depends on:** T56
- Widget ⋯ menu item (hidden in edit mode); context chip with ✕; follow-up suggestions; widget context sent with requests.

**Acceptance criteria**
- §17.15 test 9.

### [x] T60 · Docs and verification (P12)
**Depends on:** T49–T59
- ARCHITECTURE (AI section), README (env vars, how it works); typecheck, lint, tests, build.

**Acceptance criteria**
- Docs match the implementation; all checks pass.

### [ ] T61 · Floating "Ask AI" button, New chat and Recent chats
**Depends on:** T54
> Implemented and unit-tested; tick after the manual browser check.
- A round "Ask AI" button at the bottom right opens the chat (hidden when a right panel, edit mode, a version preview or the builder is open); toasts are moved above it.
- **New chat** in the panel header archives the current conversation; **Recent chats** menu (up to 10, session storage, cleared at logout) switches between them.

**Unit tests:** archive order, title, empty conversations skipped, 10-chat cap, per-user storage cleared on logout.

**Acceptance criteria**
- Both the header button and the floating button open the panel.
- New chat → empty welcome screen; the old conversation appears in Recent chats and opens again with its previews intact.

### [ ] T62 · "Add widget" menu: Build it yourself / Create with AI
**Depends on:** T61
> Implemented; tick after the manual browser check.
- **Add widget ▾** opens a menu: **Build it yourself** (builder) and **Create with AI** (opens the chat; greyed out in edit mode with a hint). The empty dashboard shows both as buttons.
- The separate "Insight AI" header button is removed; the floating **Ask AI** button and "Ask Insight AI about this" remain.

**Acceptance criteria**
- Both menu options work; in edit mode "Create with AI" is disabled with "Click Done first to use Insight AI".

