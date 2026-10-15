# Project brief: InsightFlow — e-commerce sales analytics dashboard

Read this brief fully, then write a detailed `REQUIREMENTS.md` at the repo root.
Do NOT write application code yet. After writing REQUIREMENTS.md, list any open
questions or assumptions, and stop for my review.

## 1. What we are building
A single-page sales analytics dashboard for a fictional Indian D2C home &
lifestyle brand, "Nivora Home". Users log in, see a dashboard of sales widgets
(KPIs, charts, tables), can create their own widgets with a widget builder,
edit or delete widgets, and rearrange them. Each user's dashboard is saved and
belongs only to that user.

Built in two phases:
- **Phase 1 — Data foundation, login, dashboard and widget builder**
  (the focus of this brief): database, seed data, metrics catalog, query API,
  the 2 test users, the dashboard and the create/edit widget flow.
- **Phase 2 — AI chat** (later, NOT in scope now): a chat panel where an AI
  model creates and edits widgets. Design Phase 1 so that the AI can later
  produce the exact same widget configuration the builder produces, reusing
  the same catalog, query API and widget components.

  ## 2. Users and login
- Exactly 2 fixed users, created by the seed script. No sign-up, no password
  reset, no roles or permissions — both users can do everything.
  - User 1: `aarav@nivora.in` / `Nivora@123`
  - User 2: `diya@nivora.in` / `Nivora@123`
- Passwords must be stored hashed.
- Login page → dashboard. Show the logged-in user's name and a Logout option
  in the header.
- **Share the login details with me:** list both users and their passwords in
  the README under "Test accounts".

  ## 3. Per-user dashboards (important)
- Every user has their own dashboard, stored in the database.
- Any change a user makes — adding, editing, deleting, moving or resizing a
  widget, or changing the date filter — is saved to THAT user's dashboard only
  and is never visible to the other user.
- On first login, a user gets the default dashboard (section 4).
- Changes persist across logout/login, refresh and different browsers.
- "Reset to default" restores the default dashboard for the current user only.
- Acceptance test: log in as User 1, add a widget, log out; log in as User 2 —
  the widget is NOT there; log back in as User 1 — the widget IS there.

  ## 4. Default dashboard
A global date filter in the header (default: Last 30 days) applies to all
widgets. KPI cards show change vs the previous period (↑/↓ %, green/red).

Row 1 — KPI cards:
1. Total Revenue (₹)
2. Total Orders
3. Average Order Value (₹)
4. Gross Profit (₹), with margin % as secondary text
5. Unique Customers
6. Return Rate (%)

Row 2:
7. Revenue Trend — line chart (by day; by month when the range is over 90 days)
8. Revenue by Category — bar chart

Row 3:
9. Sales by Channel — donut (Website / App / Marketplace)
10. Top 10 Products — table (product, category, units sold, revenue)

Row 4:
11. Revenue by City — horizontal bar chart
12. Orders by Payment Method — donut (UPI / Card / COD)

## 5. Dashboard behaviour
- **"+ Add widget"** button is always visible in the header.
- **"Edit dashboard"** toggle:
  - View mode (default): widgets cannot be moved; charts show tooltips.
  - Edit mode: widgets can be dragged to any position and resized; each widget
    shows a delete (✕) button. "Done" exits edit mode.
- Deleting asks for confirmation ("Remove 'Revenue by City'?").
- Each widget has a "⋯" menu, always available: Edit, Remove.
- On small screens, widgets stack in a single column.
- Widgets save their query settings, not their data. Each widget loads fresh
  data from the database on page load and whenever the date filter changes.
- Each widget has a loading state, an empty state ("No data for this period")
  and an error state with retry.

  ## 6. Create / edit widget flow
Opened by "+ Add widget" (empty) or a widget's "Edit" (pre-filled with its
current settings). A large modal or side panel with three areas:

**Left — Data fields**
- Search box.
- Two groups of clickable/draggable chips:
  - **Measures:** Revenue, Orders, Units Sold, Average Order Value,
    Gross Profit, Margin %, Customers, Return Rate.
  - **Attributes:** Date (day / week / month), Category, Product, City,
    Region, Channel, Payment Method, Order Status.
- Each chip has a tooltip with a short description. Measures and attributes
  use different chip colours.

**Right — Visualization and settings**
1. **Visualization picker:** tiles for KPI card, Line chart, Bar chart,
   Horizontal bar, Donut, Table. Tiles that don't fit the selected fields are
   greyed out with a hint (e.g. "Line chart needs a date attribute").
2. **Field slots** that change with the chosen type:
   - KPI: 1 measure; toggle "Compare to previous period".
   - Line: 1–2 measures; 1 date attribute.
   - Bar / Horizontal bar: 1 measure; 1 attribute.
   - Donut: 1 measure; 1 attribute; max 6 slices (remainder as "Other").
   - Table: 1–6 columns, any mix of measures and attributes.
   Click a chip to fill the next empty slot, or drag it into a slot. Filled
   slots show the chip with ✕ to remove.
3. **Options:**
   - Date range: "Use dashboard filter" (default) or its own range — Today,
     Yesterday, Last 7 / 30 / 90 days, This month, Last month,
     Last 12 months, Custom (from–to).
   - Sort by the measure, ascending or descending.
   - Limit to top N (default 10, max 50; donut max 6).
   - One optional filter (attribute + values, e.g. Region = South).

**Suggested type:** if the user picks fields before a type, suggest one —
measure only → KPI; measure + date → Line; measure + other attribute → Bar.
The user can change it.

**Centre — Live preview**
- Shows the widget exactly as it will appear on the dashboard, with real data,
  updating as settings change.
- **Editable title** above the preview (click to edit). Auto-generated from
  the fields (e.g. "Revenue by Category") until the user edits it; after that
  the user's title is kept.
- Auto subtitle, e.g. "Last 30 days · ₹".

**Footer**
- Cancel · "Add to dashboard" (or "Save changes" when editing).
- The main button is disabled until the widget is valid, with a one-line
  reason (e.g. "Pick a measure to continue").
- A new widget appears at the top of the dashboard and is briefly highlighted.

we we have this much predefined visulisations. that visulisaions should be nicely styled. also it will be better if we can update the colors from there, say we have to update the color of a bar in the chart, that should be possible.

## 7. Data
- **Data model:** products (name, category, price, cost), customers (name,
  city, region, signup date), orders (customer, date, channel, payment method,
  status), order items (product, quantity, unit price), plus users and
  per-user dashboards.
- **Seed data**, re-runnable and producing the same data each time:
  - ~60 products in 6 categories: Kitchen, Decor, Bedding, Lighting,
    Storage, Bath.
  - ~1,500 customers in 8 cities across 4 regions (Bengaluru, Chennai,
    Hyderabad, Mumbai, Pune, Delhi, Jaipur, Kolkata).
  - ~5,000 orders over the 12 months ending today, with dates relative to the
    current date so recent periods always have data.

  - The 2 test users.
- **Metrics catalog:** one central definition of every measure and attribute
  (name, description, how it is calculated, display format: ₹ / number / %).
  The widget builder — and the AI later — can only use what is in this catalog.
- **Query API:** receives a widget's settings, validates them, calculates the
  results only from catalog definitions (never from raw user input), and
  returns the data, plus previous-period values when requested.

  also you can add more fields if that make sense to you in this sales dashbioard. if we add more data, then it will be helpful while we create widgets and all. so keep that in mind and add more data seeds and table columns

  ## 8. Look and feel
- Clean, modern SaaS style; rounded cards; light theme.
- Brand colours: primary teal #0F766E, accent amber #F59E0B, with a consistent
  chart palette.
- The same category value always has the same colour across all charts.
- Indian number formatting: ₹4,52,300, and compact ₹4.5L / ₹1.2Cr.

## 9. Out of scope for now
AI chat (Phase 2), sign-up, password reset, roles and permissions, multiple
dashboards per user, sharing dashboards, pivot tables, maps, exports.

so now you go through this and make a requiremen.md file. also ask me if you need any more clarifications