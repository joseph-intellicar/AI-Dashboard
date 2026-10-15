# InsightFlow — Architecture (Phase 1)

> This is the companion to [REQUIREMENTS.md](REQUIREMENTS.md). That file says *what* we build; this one says *how*.
> Focus areas: per-user dashboard storage, the widget configuration format, the requests between frontend and backend, and how widget data is loaded.

---

## 1. System overview

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React app (Vite)                                               │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Login page   │  │ Dashboard        │  │ Widget builder    │  │
│  └──────────────┘  │ react-grid-layout│  │ (same <Widget/>   │  │
│                    │ <Widget/> × N    │  │  for live preview)│  │
│                    └────────┬─────────┘  └─────────┬─────────┘  │
│        TanStack Query: dashboard cache + one query per widget   │
└─────────────────────────────┼──────────────────────┼────────────┘
                              │ cookie: sid (httpOnly)│
                              ▼                       ▼
┌──────────────────────────── API (Fastify) ──────────────────────┐
│  requireUser hook → req.user.id (from session only)             │
│  /api/auth/*   /api/dashboard/*   /api/catalog/*   /api/query   │
│        │               │                  │             │       │
│   sessions repo   dashboard repo     catalog (shared)  query    │
│                   (scoped by user)                     engine   │
│                                                    (catalog→SQL)│
└───────────────────────────────┬─────────────────────────────────┘
                                │ pg over TLS (pooled URL)
                                ▼
┌─────────────────────── Neon PostgreSQL ─────────────────────────┐
│ users · sessions · dashboards · dashboard_widgets               │
│ regions · cities · categories · products · customers            │
│ orders · order_items · v_order_lines · v_orders (views)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Repository layout

```
insightflow/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── server.ts               # Fastify bootstrap, cookie, rate-limit
│   │       ├── db.ts                   # Kysely + pg pool (DATABASE_URL)
│   │       ├── auth/
│   │       │   ├── routes.ts           # login / logout / me
│   │       │   ├── sessions.ts         # create / find / delete session
│   │       │   └── requireUser.ts      # preHandler hook
│   │       ├── dashboard/
│   │       │   ├── routes.ts
│   │       │   └── dashboardRepo.ts    # every query scoped by userId
│   │       ├── catalog/routes.ts       # GET /api/catalog, attribute values
│   │       └── query/
│   │           ├── routes.ts           # POST /api/query
│   │           ├── resolveDateRange.ts
│   │           ├── buildSql.ts         # catalog → Kysely query
│   │           └── cache.ts            # 60 s in-memory LRU
│   └── web/
│       └── src/
│           ├── api/client.ts           # fetch wrapper, credentials: 'include'
│           ├── pages/Login.tsx
│           ├── pages/Dashboard.tsx
│           ├── dashboard/
│           │   ├── useDashboard.ts     # load + mutations (optimistic)
│           │   ├── DashboardGrid.tsx
│           │   └── WidgetCard.tsx
│           ├── widgets/                # Kpi, Line, Bar, HBar, Donut, Table
│           │   ├── Widget.tsx          # picks component by config.type
│           │   └── useWidgetData.ts    # one /api/query per widget
│           └── builder/                # fields, picker, slots, options, preview
├── packages/
│   └── shared/
│       ├── catalog.ts                  # measures + attributes (labels, formats, colours, synonyms)
│       ├── widgetConfig.ts             # Zod schema + slot rules + JSON Schema export
│       ├── defaultDashboard.ts         # template for first login / reset
│       ├── dateRanges.ts               # preset definitions
│       └── format.ts                   # Indian number formatting
├── db/
│   ├── migrations/                     # SQL / Kysely migrations
│   └── seed/                           # deterministic seed (DIRECT_DATABASE_URL)
├── .env / .env.example
├── REQUIREMENTS.md · ARCHITECTURE.md · README.md
```

`packages/shared` is imported by both the web app and the API. The widget format, catalog and formatting are defined once.

---

## 3. Authentication and sessions

1. `POST /api/auth/login` checks the password against the argon2id hash.
2. The server generates a random 32-byte token and stores **its SHA-256 hash** in `sessions` (`id`, `user_id`, `expires_at` = now + 7 days). The raw token is never stored.
3. It sends a cookie `sid=<raw token>; HttpOnly; SameSite=Lax; Path=/; Secure (prod)`.
4. Every protected route runs `requireUser`:

```ts
// apps/api/src/auth/requireUser.ts
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies.sid;
  const session = token ? await sessions.findValid(sha256(token)) : null;   // checks expires_at
  if (!session) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Please log in' } });
  req.user = { id: session.user_id };
  await sessions.touch(session.id);   // sliding expiry (throttled to once per hour)
}
```

5. **[Build note]** Validated sessions are cached in API memory for 30 s, because each database round trip to Neon costs about 250–400 ms from here. Logout evicts the cached entry immediately. Running several API instances would need a shared cache, or would have to accept up to 30 s of staleness after logout.
6. `POST /api/auth/logout` deletes the session row and clears the cookie. The frontend also clears its whole query cache, so the next user on the same browser never sees the previous user's data, even briefly.

**Rule:** no dashboard endpoint reads a user ID from the URL, body or query string. The user is always `req.user.id`.

---

## 4. Dashboard storage

### 4.1 Tables

```sql
CREATE TABLE dashboards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_filter jsonb NOT NULL DEFAULT '{"preset":"last_30_days"}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dashboard_widgets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  config       jsonb NOT NULL,
  layout_x     int  NOT NULL CHECK (layout_x >= 0),
  layout_y     int  NOT NULL CHECK (layout_y >= 0),
  layout_w     int  NOT NULL CHECK (layout_w BETWEEN 1 AND 12),
  layout_h     int  NOT NULL CHECK (layout_h >= 1),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dashboard_widgets_dashboard_idx ON dashboard_widgets(dashboard_id);
```

| Decision | Reason |
|---|---|
| `UNIQUE(user_id)` | The database itself guarantees one dashboard per user |
| One row per widget | Add, edit and delete touch a single row; no whole-dashboard rewrites |
| Layout columns separate from `config` | Dragging updates 4 integers and never touches widget settings |
| `config` as JSONB | It is the same `WidgetConfig` the builder (and later the AI) produces; validated with Zod before every write |
| No data stored | Widgets store *query settings*; data is always fetched fresh |
| The widget `id` is the row `id` | The `config` JSON does not repeat it (avoids two sources of truth) |

### 4.2 Sample rows

**`dashboards`**

| id | user_id | date_filter | updated_at |
|---|---|---|---|
| `6b1f…a2` | `aarav-uuid` | `{"preset":"last_30_days"}` | 2026-10-15 16:02 |
| `c93e…71` | `diya-uuid` | `{"preset":"custom","from":"2026-07-01","to":"2026-09-30"}` | 2026-10-14 11:40 |

**`dashboard_widgets`** (three rows from Aarav's dashboard)

| id | dashboard_id | layout (x,y,w,h) | config |
|---|---|---|---|
| `0c4d…11` | `6b1f…a2` | 0, 0, 2, 2 | KPI: Total Revenue (below) |
| `5e7a…90` | `6b1f…a2` | 8, 2, 4, 4 | Bar: Revenue by Category with a colour override (below) |
| `9a12…3f` | `6b1f…a2` | 4, 6, 8, 4 | Table: Top 10 Products (below) |

`config` for the KPI:
```json
{
  "version": 1,
  "type": "kpi",
  "title": "Total Revenue",
  "titleIsCustom": false,
  "fields": {
    "measures": [{ "key": "revenue" }],
    "attributes": []
  },
  "options": {
    "dateRange": { "mode": "dashboard" },
    "compare": true,
    "secondaryMeasure": null,
    "filter": null
  },
  "appearance": {
    "numberFormat": "compact",
    "colors": { "accent": "#0F766E" }
  }
}
```

`config` for the bar chart. The user recoloured "Lighting", gave it a custom title, and fixed its range to the last 90 days:
```json
{
  "version": 1,
  "type": "bar",
  "title": "Category revenue – last quarter",
  "titleIsCustom": true,
  "fields": {
    "measures": [{ "key": "revenue" }],
    "attributes": [{ "key": "category" }]
  },
  "options": {
    "dateRange": { "mode": "preset", "preset": "last_90_days" },
    "sort": { "by": "revenue", "dir": "desc" },
    "limit": 10,
    "filter": { "attribute": "region", "op": "in", "values": ["South", "West"] }
  },
  "appearance": {
    "numberFormat": "compact",
    "dataLabels": true,
    "legend": { "show": false },
    "colors": {
      "colorByValue": true,
      "values": { "Lighting": "#DC2626" }
    }
  }
}
```

`config` for the table:
```json
{
  "version": 1,
  "type": "table",
  "title": "Top 10 Products",
  "titleIsCustom": false,
  "fields": {
    "columns": [
      { "kind": "attribute", "key": "product" },
      { "kind": "attribute", "key": "category" },
      { "kind": "measure",   "key": "units_sold" },
      { "kind": "measure",   "key": "revenue" }
    ]
  },
  "options": {
    "dateRange": { "mode": "dashboard" },
    "sort": { "by": "revenue", "dir": "desc" },
    "limit": 10,
    "filter": null
  },
  "appearance": {
    "numberFormat": "full",
    "colors": { "dataBar": "#0F766E" }
  }
}
```

### 4.3 Validation (shared Zod schema)

```ts
// packages/shared/widgetConfig.ts (abridged)
const MeasureRef   = z.object({ key: z.enum(MEASURE_KEYS) });
const AttributeRef = z.object({ key: z.enum(ATTRIBUTE_KEYS), grain: z.enum(['auto','day','week','month','quarter']).optional() });

const DateRange = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('dashboard') }),
  z.object({ mode: z.literal('preset'), preset: z.enum(PRESETS) }),
  z.object({ mode: z.literal('custom'), from: IsoDate, to: IsoDate }),
]);

export const WidgetConfigSchema = z.object({
  version: z.literal(1),
  type: z.enum(['kpi','line','bar','hbar','donut','table']),
  title: z.string().min(1).max(80),
  titleIsCustom: z.boolean(),
  fields: Fields,
  options: Options,
  appearance: Appearance,
}).superRefine(checkSlotRules);   // e.g. line needs exactly 1 date attribute, donut needs an additive measure

export const widgetConfigJsonSchema = zodToJsonSchema(WidgetConfigSchema);  // for Phase 2 AI tools
```

The builder runs the same `safeParse` to enable or disable its "Add to dashboard" button and to show the one-line reason. The API runs `parse` before every insert or update.

### 4.4 Repository: every query scoped by user

```ts
// apps/api/src/dashboard/dashboardRepo.ts
export async function getOrCreateDashboard(db: Kysely<DB>, userId: string) {
  const existing = await findByUser(db, userId);
  if (existing) return existing;

  return db.transaction().execute(async (trx) => {
    const inserted = await trx.insertInto('dashboards')
      .values({ user_id: userId, date_filter: json(DEFAULT_DASHBOARD.dateFilter) })
      .onConflict((oc) => oc.column('user_id').doNothing())   // two tabs on first login
      .returningAll().executeTakeFirst();
    if (!inserted) return findByUserOrThrow(trx, userId);
    await insertTemplateWidgets(trx, inserted.id);
    return inserted;
  });
}

export async function updateWidgetConfig(db, userId: string, widgetId: string, config: WidgetConfig) {
  const res = await db.updateTable('dashboard_widgets as w')
    .from('dashboards as d')
    .set({ config: json(config), updated_at: sql`now()` })
    .whereRef('d.id', '=', 'w.dashboard_id')
    .where('d.user_id', '=', userId)          // ← ownership check inside the SQL itself
    .where('w.id', '=', widgetId)
    .executeTakeFirst();
  if (res.numUpdatedRows === 0n) throw new NotFoundError();   // 404, never 403 (don't reveal existence)
}

export async function addWidget(db, userId: string, config: WidgetConfig, size: { w: number; h: number }) {
  return db.transaction().execute(async (trx) => {
    const dash = await findByUserOrThrow(trx, userId);   // created by GET /api/dashboard
    // push everything down to make room at the top
    await trx.updateTable('dashboard_widgets')
      .set((eb) => ({ layout_y: eb('layout_y', '+', size.h) }))
      .where('dashboard_id', '=', dash.id).execute();
    return trx.insertInto('dashboard_widgets')
      .values({ dashboard_id: dash.id, config: json(config), layout_x: 0, layout_y: 0, layout_w: size.w, layout_h: size.h })
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function saveLayout(db, userId: string, items: LayoutItem[]) {
  return db.transaction().execute(async (trx) => {
    const dash = await findByUserOrThrow(trx, userId);
    const owned = await trx.selectFrom('dashboard_widgets').select('id')
      .where('dashboard_id', '=', dash.id).execute();
    const ownedIds = new Set(owned.map((r) => r.id));
    if (items.some((i) => !ownedIds.has(i.id))) throw new NotFoundError();   // all or nothing
    for (const i of items) {
      await trx.updateTable('dashboard_widgets')
        .set({ layout_x: i.x, layout_y: i.y, layout_w: i.w, layout_h: i.h, updated_at: sql`now()` })
        .where('id', '=', i.id).execute();
    }
  });
}

export async function resetDashboard(db, userId: string) {
  return db.transaction().execute(async (trx) => {
    const dash = await findByUserOrThrow(trx, userId);
    await trx.deleteFrom('dashboard_widgets').where('dashboard_id', '=', dash.id).execute();
    await insertTemplateWidgets(trx, dash.id);
    await trx.updateTable('dashboards')
      .set({ date_filter: json(DEFAULT_DASHBOARD.dateFilter), updated_at: sql`now()` })
      .where('id', '=', dash.id).execute();
  });
}
```

`deleteWidget` uses the same join-on-`user_id` pattern as `updateWidgetConfig`.

### 4.5 Default template

```ts
// packages/shared/defaultDashboard.ts
export const DEFAULT_DASHBOARD = {
  dateFilter: { preset: 'last_30_days' },
  widgets: [
    { layout: { x: 0,  y: 0, w: 2, h: 2 }, config: kpi('revenue', 'Total Revenue') },
    { layout: { x: 2,  y: 0, w: 2, h: 2 }, config: kpi('orders', 'Total Orders') },
    { layout: { x: 4,  y: 0, w: 2, h: 2 }, config: kpi('aov', 'Average Order Value') },
    { layout: { x: 6,  y: 0, w: 2, h: 2 }, config: kpi('gross_profit', 'Gross Profit', { secondaryMeasure: 'margin_pct' }) },
    { layout: { x: 8,  y: 0, w: 2, h: 2 }, config: kpi('customers', 'Unique Customers') },
    { layout: { x: 10, y: 0, w: 2, h: 2 }, config: kpi('return_rate', 'Return Rate') },
    { layout: { x: 0,  y: 2, w: 8, h: 4 }, config: line('revenue', 'order_date', 'Revenue Trend') },
    { layout: { x: 8,  y: 2, w: 4, h: 4 }, config: bar('revenue', 'category', 'Revenue by Category') },
    { layout: { x: 0,  y: 6, w: 4, h: 4 }, config: donut('revenue', 'channel', 'Sales by Channel') },
    { layout: { x: 4,  y: 6, w: 8, h: 4 }, config: topProductsTable() },
    { layout: { x: 0,  y: 10, w: 6, h: 4 }, config: hbar('revenue', 'city', 'Revenue by City') },
    { layout: { x: 6,  y: 10, w: 6, h: 4 }, config: donut('orders', 'payment_method', 'Orders by Payment Method') },
  ],
} satisfies DashboardTemplate;
```

The template exists only in code. Each user receives a **copy** (new rows), so one user's changes can never affect another user. A unit test runs every template config through `WidgetConfigSchema`.

### 4.6 Layout and positioning (how the backend tells the frontend where each widget goes)

**The dashboard is a grid of coordinates.** The dashboard is a 12-column grid. A widget's position is four numbers stored on its own `dashboard_widgets` row:

| Column | Meaning |
|---|---|
| `layout_x` | Which column it starts in (0–11) |
| `layout_y` | Which row it starts in (0 = top) |
| `layout_w` | How many columns wide it is (1–12) |
| `layout_h` | How many rows tall it is (1 row ≈ 80 px) |

```
 x→  0   1   2   3   4   5   6   7   8   9  10  11
y=0 [Revenue][Orders ][ AOV  ][Profit ][Custmrs][Return ]   ← KPIs: w=2, h=2
y=1 [       ][       ][      ][       ][       ][       ]
y=2 [        Revenue Trend (w=8)        ][ By Category  ]   ← h=4
y=6 [ By Channel   ][      Top 10 Products (w=8)        ]
...
```
"Total Revenue at the top-left" is stored as `x=0, y=0, w=2, h=2`.

**Who decides the position.** The backend never computes positions on its own. It returns whatever the user last saved. It sets a position only in these cases:

| Situation | Position comes from |
|---|---|
| First login / Reset to default | Copied from `DEFAULT_DASHBOARD` (section 4.5) |
| New widget | `x=0, y=0`, default size for its type; every other widget's `layout_y` is increased by the new widget's height (`addWidget`, section 4.4) |
| Duplicate | Placed directly below the original (`y = original.y + original.h`); widgets below are pushed down |
| User drags/resizes | Whatever the grid reports, saved via `PUT /api/dashboard/layout` |

**Backend → frontend.** `GET /api/dashboard` returns each widget with its saved position next to its settings:
```json
{
  "widgets": [
    { "id": "0c4d…11", "layout": { "x": 0, "y": 0, "w": 2, "h": 2 }, "config": { "type": "kpi", "title": "Total Revenue" } },
    { "id": "5e7a…90", "layout": { "x": 8, "y": 2, "w": 4, "h": 4 }, "config": { "type": "bar", "title": "Revenue by Category" } }
  ]
}
```

**The frontend grid places each widget.** The frontend converts the list to `react-grid-layout`'s format. The library matches each child's `key` to the layout item's `i` and places the widget at those coordinates:
```tsx
const layout = dashboard.widgets.map((w) => ({
  i: w.id, ...w.layout,
  minW: MIN_SIZE[w.config.type].w, minH: MIN_SIZE[w.config.type].h,   // KPI 2×2, charts 3×3, table 4×3
}));

<ResponsiveGridLayout layouts={{ lg: layout }} cols={{ lg: 12, md: 12, sm: 1 }} rowHeight={80}
  compactType="vertical" isDraggable={editMode} isResizable={editMode}
  onDragStop={saveLayout} onResizeStop={saveLayout}>
  {dashboard.widgets.map((w) => <div key={w.id}><WidgetCard widget={w} /></div>)}
</ResponsiveGridLayout>
```
The widget components never deal with position. Placement belongs entirely to the grid.

**When the user moves a widget.** Example: Aarav drags "Total Revenue" from the top-left to the right of row 2.
1. The grid moves it and reflows the others (vertical compaction: widgets slide up into gaps, and overlapping widgets are pushed down).
2. When the drag stops, the frontend waits 500 ms and then sends **every** widget's position, because one drag can move several widgets:
   ```json
   PUT /api/dashboard/layout
   { "items": [ { "id": "0c4d…11", "x": 8, "y": 2, "w": 2, "h": 2 },
                { "id": "5e7a…90", "x": 8, "y": 4, "w": 4, "h": 4 } ] }
   ```
3. The backend checks that every ID belongs to Aarav's dashboard, then updates the four layout columns of each row in one transaction (`saveLayout`, section 4.4).
4. On his next load, `GET /api/dashboard` returns the new numbers, so the widget appears where he left it. Diya's rows are separate, so her layout is unchanged.

**Edge cases**
- **Gaps and overlaps:** the grid always compacts vertically, so holes in stored `y` values close up on render. If two stored positions ever overlap, the grid pushes one down. A bad position can never break the page.
- **Phones (< 768 px, one column):** the stored numbers are used only to decide order: sort by `y`, then `x`. Every widget is shown full-width, dragging is disabled, and **nothing is saved** from this view, so the desktop layout stays intact.
- **Resizing** changes `w` and `h` and is saved the same way. The grid enforces each type's minimum size, and the database `CHECK` constraints reject impossible values (negative x/y, width > 12).
- **Server-side sanity check:** `PUT /api/dashboard/layout` rejects items where `x + w > 12` or the sizes are below the type's minimum (400 `INVALID_LAYOUT`).

---

## 5. Frontend ↔ API contract (what the frontend sends)

All requests use `fetch(url, { credentials: 'include' })`, so the `sid` cookie is sent automatically. The body never contains a user ID.

### 5.1 Load the dashboard
```http
GET /api/dashboard
```
```json
{
  "dateFilter": { "preset": "last_30_days" },
  "widgets": [
    {
      "id": "0c4d…11",
      "layout": { "x": 0, "y": 0, "w": 2, "h": 2 },
      "config": { "version": 1, "type": "kpi", "title": "Total Revenue", "…": "…" },
      "updatedAt": "2026-10-15T10:32:00Z"
    }
  ]
}
```

### 5.2 Add a widget ("Add to dashboard" in the builder)
```http
POST /api/dashboard/widgets
Content-Type: application/json
```
```json
{
  "config": {
    "version": 1,
    "type": "donut",
    "title": "Revenue by Region",
    "titleIsCustom": false,
    "fields": { "measures": [{ "key": "revenue" }], "attributes": [{ "key": "region" }] },
    "options": { "dateRange": { "mode": "dashboard" }, "sort": { "by": "revenue", "dir": "desc" }, "limit": 6, "filter": null },
    "appearance": { "numberFormat": "compact", "dataLabels": false, "legend": { "show": true, "position": "right" },
                    "colors": { "values": { "South": "#0F766E" } } }
  }
}
```
Response `201`:
```json
{ "id": "f7b2…c8", "layout": { "x": 0, "y": 0, "w": 4, "h": 4 }, "config": { "…": "…" } }
```
The server picks the default size for the widget type and places the widget at the top. The client shifts the other widgets down by the same amount, which the server has also done, so both sides agree.

### 5.3 Edit a widget ("Save changes")
```http
PATCH /api/dashboard/widgets/f7b2…c8
```
```json
{ "config": { "…full updated WidgetConfig…": "" } }
```
The full config is sent, not a partial diff. It is small (< 2 KB) and the server validates the complete object.

### 5.4 Delete a widget
```http
DELETE /api/dashboard/widgets/f7b2…c8      → 204
```

### 5.5 Move or resize widgets (edit mode)
Sent once, 500 ms after a drag or resize stops. It contains every widget's position, because a single drag can reflow several widgets.
```http
PUT /api/dashboard/layout
```
```json
{
  "items": [
    { "id": "0c4d…11", "x": 0, "y": 0, "w": 2, "h": 2 },
    { "id": "5e7a…90", "x": 6, "y": 2, "w": 6, "h": 4 },
    { "id": "9a12…3f", "x": 0, "y": 6, "w": 12, "h": 4 }
  ]
}
```

### 5.6 Change the global date filter
```http
PATCH /api/dashboard
```
```json
{ "dateFilter": { "preset": "last_90_days" } }
```

### 5.7 Reset to default
```http
POST /api/dashboard/reset      → 200 with the same body as GET /api/dashboard
```

### 5.8 Frontend mutation pattern (optimistic)

```ts
// apps/web/src/dashboard/useDashboard.ts (abridged)
const addWidget = useMutation({
  mutationFn: (config: WidgetConfig) => api.post('/api/dashboard/widgets', { config }),
  onMutate: async (config) => {
    await qc.cancelQueries({ queryKey: ['dashboard'] });
    const prev = qc.getQueryData<Dashboard>(['dashboard']);
    qc.setQueryData(['dashboard'], insertAtTop(prev, { id: tempId(), config, layout: defaultSize(config.type) }));
    return { prev };
  },
  onError: (_e, _v, ctx) => { qc.setQueryData(['dashboard'], ctx?.prev); toast.error("Couldn't add widget"); },
  onSuccess: (saved) => { qc.setQueryData(['dashboard'], (d) => replaceTempId(d, saved)); highlight(saved.id); },
});

const saveLayout = useDebouncedCallback((layout: Layout[]) =>
  api.put('/api/dashboard/layout', { items: layout.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h })) }), 500);
```

```tsx
<ResponsiveGridLayout
  layouts={{ lg: toGridLayout(dashboard.widgets) }}
  cols={{ lg: 12, md: 12, sm: 1 }}
  isDraggable={editMode} isResizable={editMode}
  onDragStop={(l) => saveLayout(l)} onResizeStop={(l) => saveLayout(l)}
/>
```
On the `sm` breakpoint (one column) the grid only changes how widgets are drawn; it never calls `saveLayout`.

---

## 6. Loading widget data (one request per widget)

### 6.1 How it works
**Yes: each widget makes its own independent `POST /api/query` call.** The calls run in parallel, so the default dashboard fires 12 at once on page load.

```ts
// apps/web/src/widgets/useWidgetData.ts
export function useWidgetData(config: WidgetConfig, dashboardDateFilter: DateFilter) {
  const effectiveRange = config.options.dateRange.mode === 'dashboard' ? dashboardDateFilter : config.options.dateRange;
  return useQuery({
    queryKey: ['widget-data', queryPart(config), effectiveRange],   // appearance/title excluded
    queryFn: () => api.post('/api/query', { config: queryPart(config), dashboardDateFilter }),
    staleTime: 60_000,
    retry: 1,
  });
}
```

`queryPart(config)` keeps only `type`, `fields` and `options`. Changing a colour or title therefore **never** triggers a re-query, and two widgets with identical queries share one request through TanStack Query's de-duplication.

Request:
```json
{
  "config": {
    "type": "bar",
    "fields": { "measures": [{ "key": "revenue" }], "attributes": [{ "key": "category" }] },
    "options": { "dateRange": { "mode": "dashboard" }, "sort": { "by": "revenue", "dir": "desc" }, "limit": 10, "filter": null }
  },
  "dashboardDateFilter": { "preset": "last_30_days" }
}
```
Response:
```json
{
  "columns": [
    { "key": "category", "label": "Category", "role": "attribute" },
    { "key": "revenue",  "label": "Revenue",  "role": "measure", "format": "currency" }
  ],
  "rows": [
    { "category": "Decor",    "revenue": 812400.0 },
    { "category": "Bedding",  "revenue": 655210.5 },
    { "category": "Kitchen",  "revenue": 498300.0 }
  ],
  "totals": { "revenue": 2794110.5 },
  "meta": { "range": { "from": "2026-09-16", "to": "2026-10-15", "label": "Last 30 days" }, "grain": null, "queryMs": 38 }
}
```

### 6.2 Why one call per widget (and not one call for the whole dashboard)
| Benefit | Detail |
|---|---|
| Independent states | Each widget has its own loading skeleton, empty state and error + Retry, exactly as the requirements ask. One slow or failing query never blocks the others |
| Progressive rendering | Fast KPIs appear first; heavier tables fill in after |
| Reuse | The builder's live preview, the dashboard and the Phase 2 AI all call the same endpoint with the same payload |
| Cheap re-fetches | Changing one widget re-queries only that widget; changing the date filter re-queries only widgets that use the dashboard filter (widgets with their own range stay cached) |
| Caching | Client cache (60 s) + server LRU cache (60 s) keyed on the query part + resolved range |

### 6.3 Cost and how it stays fast
- **Browser connection limit:** under HTTP/1.1 a browser opens at most ~6 connections per host, so 12 calls go in about 2 waves. Each query takes ~30–80 ms of database time on our data volume, so this is barely noticeable. In production behind HTTP/2 the limit disappears.
- **Database connections:** the API pool is capped at ~10 connections to the Neon pooler; extra calls wait briefly in the pool queue.
- **Network to Neon (us-east-2):** each query is one round trip from the API to Neon. The server cache absorbs repeats (refresh, toggling filters).
- **Escape hatch (only if needed):** a `POST /api/query/batch` that accepts `[{ widgetId, config }]` and returns a result or error per item. The client hook can switch to it without any widget component changing. It is not planned for Phase 1 unless measurements show a problem.

### 6.4 Server side of `/api/query`
```
request ──► Zod parse + slot rules ──► resolve date range (IST) + previous period
        ──► cache lookup ──► buildSql(catalog) over v_order_lines / v_orders
        ──► one SQL statement: current + previous period and totals via GROUPING SETS
        ──► 5 s client-side query_timeout (pg) → 504 QUERY_TIMEOUT
        ──► gap-fill dates, donut "Other" bucket, totals ──► cache store ──► response
```
User input only ever selects **catalog keys** (whitelisted enums), **filter values** (bound parameters) and **numbers** (validated). No user text is concatenated into SQL.

**Implementation notes (from the build):**
- Each widget query is a **single SQL statement**. The API runs locally while Neon sits in us-east-2, so every round trip costs about 250 ms. `SET LOCAL statement_timeout` inside a transaction would add three extra round trips, so the 5 s limit is the pg client's `query_timeout` instead.
- The query aggregates in two steps, first `per_order` (one row per period × group × order), then `agg`. That way "Orders by Category" counts orders that contain the category, and the totals row (from `GROUPING SETS`) never double-counts an order that spans several categories.
- Measured database time on the seed data across all 12 default widgets, for Last 30 days and Last 12 months: p50 52 ms, p95 88 ms.

---

## 7. End-to-end flows

**First login (Aarav)**
1. `POST /api/auth/login` → cookie set
2. `GET /api/dashboard` → no row → transaction creates `dashboards` + 12 `dashboard_widgets` from the template
3. 12 × `POST /api/query` in parallel → widgets render

**Aarav adds a widget, then logs out; Diya logs in**
1. Builder → `POST /api/dashboard/widgets` → new row under **Aarav's** `dashboard_id`
2. Logout → session deleted, client cache cleared
3. Diya logs in → `GET /api/dashboard` reads `WHERE user_id = diya` → Aarav's widget is not part of her result set at all

**Diya tries Aarav's widget ID (malicious or buggy client)**
`PATCH /api/dashboard/widgets/<aarav-widget>` → SQL join requires `d.user_id = diya` → 0 rows → `404`.

---

## 8. Concurrency and consistency
- **Two tabs on first login:** `ON CONFLICT (user_id) DO NOTHING` → still one dashboard.
- **Same user, two browsers editing at once:** last write wins (accepted for Phase 1). If needed later: add `dashboards.version`, send it with every write, and return `409` on a mismatch.
- **Every multi-row change** (add with shift, layout save, reset) runs in one transaction.

---

## 9. Phase 2 (AI) hooks
The AI chat will call the same repository functions, as the logged-in user:

| AI tool | Calls |
|---|---|
| `add_widget(config)` | `addWidget` |
| `update_widget(id, config)` | `updateWidgetConfig` |
| `remove_widget(id)` | `deleteWidget` |
| `set_date_filter(filter)` | `PATCH /api/dashboard` logic |
| `run_query(config)` | the `/api/query` engine (to answer questions) |
| `restore_version(id)` | `restoreVersion` (section 11); AI edits are recorded as versions like any other change |

Tool input schemas come from `widgetConfigJsonSchema`; the catalog (with synonyms and attribute values) goes into the system prompt. AI-produced configs pass the same Zod validation as builder configs.

---

## 10. Testing the architecture
- **Repo integration tests (Neon test branch):** cross-user 404s for update/delete/layout; reset isolation; concurrent first-login creates one dashboard; add-at-top shifts other widgets.
- **Schema tests:** every default-template config and every builder-generated fixture passes `WidgetConfigSchema`; invalid slot combinations are rejected with the right message.
- **Playwright:** Aarav/Diya acceptance test; drag → refresh → position kept; colour change → refresh → colour kept.

---

## 11. Undo and version history (REQUIREMENTS §6.8–6.9)

Saving stays immediate. History is built on top of the saved dashboard, so it does not depend on the user clicking Done.

### 11.1 Storage
`dashboard_versions` (migration `0004`): one row per version, holding a **full snapshot** of the widgets after the change.

```jsonc
{
  "id": "4b1e…",
  "dashboard_id": "9f2c…",
  "kind": "edit_session",            // created | edit_session | added | edited | duplicated | removed | reset | restored
  "summary": "Removed Revenue by City · Moved Total Revenue",
  "changes": [                         // diff vs. the previous version, for the list and badges
    { "op": "removed", "widgetId": "a1…", "title": "Revenue by City" },
    { "op": "moved",   "widgetId": "c3…", "title": "Total Revenue" }
  ],
  "widgets": [                         // the snapshot: same shape as a widget row, ~1 KB per widget
    { "id": "c3…", "config": { /* WidgetConfig */ }, "layout": { "x": 0, "y": 9, "w": 3, "h": 2 } }
  ],
  "created_at": "2026-10-15T12:32:10Z"
}
```

Snapshots, not deltas: any version can be shown or restored with one read, and old versions can be deleted without replaying a chain. Twelve widgets are about 12 KB, so even hundreds of versions are small.

### 11.2 The diff (`packages/shared/src/history.ts`)
`diffSnapshots(before, after)` is shared by the API (summaries), the undo labels and the preview badges.
- **added / removed / edited:** by widget ID; configs are compared with a key-sorted JSON (`stableStringify`), because `jsonb` reorders keys.
- **moved:** vertical compaction shifts many widgets when one is dragged or removed. A widget counts as moved only if it changed column, or is not on the **longest common subsequence** of the reading order (y, then x) before and after. Dragging one widget to the bottom therefore reports that widget only, and a removal reports no moves.
- **resized:** `w` or `h` changed.

### 11.3 Recording versions (`apps/api/src/dashboard/history.ts`)
`recordVersion(db, userId, kind)` costs two round trips:
1. One read: the current widgets as a snapshot, plus the latest version (`LEFT JOIN LATERAL … LIMIT 1`).
2. In JS, `planVersion`: nothing if the snapshot equals the latest version; `created` ("History started") if there is no version yet; otherwise the kind, diff and summary.
3. One statement: insert the version **only if the latest version is still the one compared** (guards against two tabs recording at once), and delete versions older than 30 days in the same statement. The new row is the newest, so the "always keep the newest" rule holds.

| Trigger | Kind |
|---|---|
| First `GET /api/dashboard` (dashboard created from the template) | `created` |
| `POST/PATCH/DELETE /api/dashboard/widgets…` **without** `?record=false` (view mode) | `added` / `edited` / `removed` / `duplicated` |
| `POST /api/dashboard/reset` | `reset` |
| `POST /api/dashboard/versions` (on **Done**, and once on page load) | `edit_session` |
| `POST /api/dashboard/versions/:id/restore` | `edit_session` for the current state if needed, then `restored` |
| `PUT /api/dashboard/layout`, `PUT /api/dashboard/widgets`, `PATCH /api/dashboard` (date filter) | never |

In edit mode the web app sends `?record=false` on widget changes, so the whole session becomes one version when Done calls `POST /versions`. If the tab closes mid-session, the changes are already saved and the `POST /versions` made on the next page load records them.

### 11.4 Undo and redo (web, in memory)
- `apps/web/src/dashboard/undoStack.ts`: `{ past, future }` of steps `{ label, before, after }`, where `before` and `after` are snapshots. Max 50 steps; a new change clears `future`.
- `useDashboardActions({ editMode, onStep })`: when a widget or layout save **succeeds** in edit mode, the step is built from the cache before the optimistic update and the cache after the server reply (so it only holds real widget IDs) and labelled with `describeStep`.
- Undo saves `before` with `PUT /api/dashboard/widgets` and redo saves `after`. Both are optimistic; on failure the cache rolls back and the step stays. The buttons are disabled while anything is saving, so steps never interleave with pending saves.
- `PUT /api/dashboard/widgets` replaces the user's widgets in **one statement**: `jsonb_to_recordset` input, delete the widgets not in the list, upsert the rest (`ON CONFLICT (id) DO UPDATE … WHERE` same dashboard), guarded so that an ID from another dashboard changes nothing and returns 404. A removed widget comes back with its original ID.
- **Done:** flush the debounced layout save → wait until no save is in flight → `POST /api/dashboard/versions` → clear the stack.

### 11.5 Endpoints
| Method & path | Body / result |
|---|---|
| `PUT /api/dashboard/widgets` | `{ widgets: [{ id, config, layout }] }` → `DashboardDto` |
| `POST /api/dashboard/versions` | → `{ version: VersionDto \| null }` (null = nothing changed) |
| `GET /api/dashboard/versions` | → `{ versions: VersionDto[] }`: last 30 days, newest first, no snapshots |
| `GET /api/dashboard/versions/:id` | → `VersionDto & { widgets }` |
| `POST /api/dashboard/versions/:id/restore` | → `{ dashboard, skipped }` |

All are scoped by the session user inside the SQL (`JOIN dashboards d … WHERE d.user_id = $user`); another user's version ID returns 404.

### 11.6 Preview and restore (web)
- `HistoryPanel` lists versions grouped by IST day. Selecting one loads `GET /versions/:id` (cached forever, since versions never change) and the page renders the snapshot through the same `DashboardGrid` with `readOnly`. Widgets query live data with the current date filter.
- `compareToCurrent(current, version)` gives the **Added / Edited / Moved** badges and the "Not in this version" list.
- Restore: `restorableWidgets` re-validates each snapshot widget against today's `WidgetConfigSchema`, skips the invalid ones and clamps layouts to the grid and minimum sizes. Then `replaceWidgets` runs and a `restored` version is recorded. The date filter is not touched.


---

## 12. Insight AI, the Phase 2 chat (REQUIREMENTS §17)

### 12.1 Request path
```
Browser (ChatPanel, useChat)
  │  POST /api/ai/chat  { messages[≤20], context: { dateFilter, widgetTitles, openPreview, widget } }
  ▼
API  apps/api/src/ai/routes.ts ── auth, validation, per-user rate limit, SSE response
  │   context.ts   buildSystemPrompt(): rules + catalog + values + dates + dashboard context
  │   agent.ts     runTurn(): model → tools → model … (≤ 6 rounds)
  │   tools.ts     propose_visualization · query_data · ask_clarification
  │   model.ts     ChatModel (xAI via openai SDK, fallback model, timeout, abort)
  ▼
xAI  https://api.x.ai/v1/chat/completions  (grok-4.7 → grok-4.6 fallback)
```
The browser never talks to xAI and never sees the key. The model never sees SQL, credentials or tables: only the generated catalog text and the formatted results of `query_data`.

### 12.2 Files
| File | Role |
|---|---|
| `packages/shared/src/ai.ts` | Tool argument schemas (Zod, enums from the catalog), `proposalToConfig`, `queryArgsToTableConfig`, `queryArgsToChart` ("Show as chart"), `describeQuery`, the `AiEvent` stream types and `AiChatRequestSchema`. Shared, so the server and "Show as chart" in the browser apply the same rules |
| `apps/api/src/ai/model.ts` | `ChatModel` interface; `createXaiModel` (streaming, tool-call assembly, `reasoning_effort`, timeout, abort); `withFallback` (once, only before any output, not on 4xx/429); `modelFromEnv` |
| `apps/api/src/ai/context.ts` | `buildSystemPrompt` (pure, snapshot-tested) and `loadDataContext` (data date range + attribute values, cached 10 min) |
| `apps/api/src/ai/tools.ts` | JSON Schemas for the three tools (generated from the catalog) and their executors |
| `apps/api/src/ai/agent.ts` | `runTurn`: the tool loop, events, retry limit for invalid proposals, round cap |
| `apps/api/src/ai/routes.ts` | `GET /api/ai/status`, `POST /api/ai/chat` (SSE), turn timeout, metadata-only logging |
| `apps/api/src/ai/rateLimit.ts` | In-memory per-user limits: 20/minute, 200/IST day |
| `apps/web/src/ai/*` | `useChat` (state, streaming, retry/stop), `chatStore` (pure reducer + sessionStorage), `sse` (parser), `ChatPanel`, `PreviewCard`, `ClarificationCard`, `Markdown` |

### 12.3 A turn, step by step
1. `routes.ts` validates the body (last message from the user, ≤ 1,000 characters), takes a rate-limit slot, re-validates the open preview and widget configs it received, and builds the system prompt.
2. `runTurn` streams the model. Text deltas go straight to the browser. Tool calls are collected; all calls of one round run **in parallel**, and a status line ("Checking return rate by payment method…") is sent before they start.
3. Tool results go back to the model as `role: "tool"` messages, and the loop repeats until the model answers without tools, a clarification ends the turn, or 6 rounds pass.
4. Each tool:
   - **`propose_visualization`:** parse the arguments → `proposalToConfig` (builder slot rules, `normaliseOptions`, auto title) → check filter values against real values and custom ranges against the data range. If valid, emit a `preview` event, reusing the open preview's ID when `replacesPreview` (an in-place update). If invalid, the reasons go back to the model only; after 2 retries it is told to stop and explain.
   - **`query_data`:** build a table-shaped `QueryConfig` and run it on the **same engine instance and 60 s cache as `/api/query`**. With `compare`, a second run covers `previousRange()`. Results are returned already formatted (₹14,14,713 · 27.0% · ↑ 6.5%), so the model copies numbers rather than computing them. Each call adds a `sources` entry.
   - **`ask_clarification`:** keep only options that are real measures, attributes ("none" allowed), presets or types; at most 2 questions with 2–4 options each. Emit `clarification` and end the turn.
5. `sources` and `done` (with token usage) are sent last. Errors become a friendly `error` event with `retry`. A browser disconnect aborts the model call.

### 12.4 Stream events
`text` · `status` · `preview { previewId, config, replaces }` · `clarification { questions }` · `sources { sources[] }` · `done { usage }` · `error { code, message, retry }`. The type is `AiEvent` in `packages/shared/src/ai.ts`.

### 12.5 Browser side
- **State:** `chatReducer` holds messages, previews by ID (status `open`/`added`/`discarded`, `revision` for in-place updates) and the "Ask about this widget" context. It is saved to `sessionStorage` under `insightflow.chat.<userId>` on every change, and `clearAllChats()` runs on logout and on session expiry.
- **Request:** `requestMessages()` sends the last 20 messages, leaving out failed replies and summarising each preview as `{ previewId, title, type }`. The **open preview** (the latest one not yet added or discarded) is sent as context, so the model can refine it.
- **Add to dashboard:** `POST /api/dashboard/widgets?source=ai` with `{ config, position: "bottom" }`. This is optimistic (`insertAtBottom`), and the card is marked added at once and reverted on error. The server records an `ai_added` version ("Added by Insight AI · …").
- **Edit** opens the builder pre-filled in "create" mode; saving goes through the same bottom add.
- **Show as chart** converts a source's query with `queryArgsToChart` in the browser, with no model call.

### 12.6 Measured behaviour (grok-4.7, `reasoning_effort: low`, seed data)
| Request | Result | Time |
|---|---|---|
| "Show revenue by city for the last 2 weeks" | bar preview, custom range 2–15 Oct; answer from a query | 5–12 s |
| "Show sales" | clarification: Revenue (recommended) / Orders / Units Sold | 3–7 s |
| "Make it a donut" (open preview) | same card updated (`replaces: true`) | 3–6 s |
| "What's the capital of France?" · prompt-injection attempt | exact off-topic reply | ~2 s |
| "What was our marketing spend?" | "isn't available" + Acquisition Source alternatives | ~5 s |
| "Which payment method has the highest return rate?" | COD 27.0%, Card 8.8%, UPI 3.6%, equal to `/api/query` | 5–10 s |
| "Why did this change?" on Revenue Trend | 6 parallel breakdown queries, drivers with numbers | 14–16 s |

Latency varies with xAI load; the first request after a while can be noticeably slower.
