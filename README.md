# 👑 Easy Gold Merch Management System — MIMS 2026

**React + TypeScript + Vite SPA · Supabase (Postgres + Auth + Realtime) · Cloudflare Pages**

A complete rebuild of the Easy Gold merch management web app:

- **One link** for both desktop and mobile (fully responsive, mobile drawer menu)
- **Blue brand theme** replacing the old yellow/gold look
- **All your real production data** from *Current Stock Data from previous Web.xlsx* migrated in
- Works in two modes — **offline demo preview** (no setup, real seeded data) and **live Supabase** mode
- Same workflow & report math as the original app (see `APP_MASTER_SPEC.md` §7)

---

## Quick start — try it right now (offline demo, no configuration)

```bash
npm install
npm run dev          # → http://localhost:8080
```

No `.env` is needed. The app boots in **demo mode** with your real Excel data bundled
(`src/lib/demo-data.json` — 19 users, 40 MKT SKUs, 11 CS SKUs, 96 tickets, 205 transactions).
You can log in with any account from the demo chips on the login screen
(e.g. `tockppd@gmail.com` / `easygold1234` for the admin), and the full stock/ticket workflow works locally in memory.

> Demo mode is a faithful simulation of the Postgres engine (same business rules in `src/lib/demoMutations.ts`),
> so you can review the app end-to-end before connecting anything.

---

## Going live — Supabase + Cloudflare Pages

> 📘 **Full step-by-step deploy guide (GitHub + Supabase + Cloudflare): see [`DEPLOY.md`](./DEPLOY.md).**
> It includes how to convert your Excel to Lao-safe CSVs and load them into Supabase.

### 1. Create the database schema

1. Create a **Supabase** project (free tier is fine): https://supabase.com
2. Open **SQL Editor → New query**
3. Run the migration files **in order**:
   - `supabase/migrations/0001_schema.sql` — tables, RLS, indexes
   - `supabase/migrations/0002_functions.sql` — SKU / CS-SKU / config management (RPC)
   - `supabase/migrations/0003_ticket_engine.sql` — `create_ticket`
   - `supabase/migrations/0004_ticket_state_machine.sql` — `update_ticket_status` (stock accounting)
   - `supabase/migrations/0005_sku_image_storage.sql` — creates the public `sku-images` Storage bucket
     + policies (SKU profile photos)
   - `supabase/migrations/0006_ensure_reads.sql` — re-asserts the RLS read policies + bucket
   - `supabase/migrations/0007_booking_at_creation.sql` — stock is booked the moment a ticket is created
   - `supabase/migrations/0008_workflow_hardening.sql` — caller role comes from the JWT, approval caps
   - `supabase/migrations/0009_user_management.sql` — **user management**
     (adds `public.users.password`, hides it from normal clients, adds the `manage_user()` /
     `reveal_user_password()` RPCs that power System Settings → Users)
   - `supabase/migrations/0010_fix_ticket_stock_lifecycle.sql` — flat (non-nested) ticket state
     machine: Book → Deduct on finalize, cs_transfer restock, reject/recall stock return
   - `supabase/migrations/0011_normalize_roles.sql` — canonicalises `public.users.role`
     (`Warehouse` → `warehouse`, …) so real approvers pass the engine's role checks
   - `supabase/migrations/0012_fix_jsonb_coalesce_types.sql` — fixes the
     **"COALESCE types text and jsonb cannot be matched"** crash on warehouse *Review & Book Stock*
   - `supabase/migrations/0013_sku_edit_restock_reporting.sql` — **workflow polish**:
     SKU `status` column (activate/deactivate now really persists), `Opening balance` is a plain
     baseline edit (no phantom Stock In/Out row), a SKU rename rewrites `ticket_items` /
     `stock_transactions` / `cs_transactions` / `cs_skus`, Reject/Recall only cancels the booking
     (cleaner Stock In/Out reporting) and per-approval-level comment timestamps
     (`wh_comment_at` / `lm_comment_at` / `director_comment_at`)
   - `supabase/migrations/0014_approved_qty_propagation.sql` — **approved-qty propagation**: any approval
     step (warehouse / LM / director) may set the quantity — **last value wins** — and over-approval is
     allowed up to available stock (`Current_Stock` + already booked), no more silently capping at the
     request; sets `system_config.engine_version = '0014'` (the UI only allows over-approval once set)

   - `supabase/migrations/0015_edit_stock_movement.sql` — **editable stock movements** (Ticket Tracking →
     Stock Movements → pencil icon): Admin (both warehouses), Warehouse (MKT rows) and Customer Service
     (CS rows) can correct a wrong refill / issue amount **at the source** — the SKU `current_stock` /
     `total_inflow` re-sync by the same delta so Finance numbers stay right without compensating
     Stock Out entries. Every edit is stamped with the editor's real name (JWT), role, timestamp and a
     mandatory reason (`edited_by` / `edited_at` columns + note on the row); OPENING rows and cancelled
     bookings stay audit-only

   - `supabase/migrations/0016_audit_log.sql` — **Audit Trail** (Admin → Audit Trail, nav bar): one
     append-only `audit_log` table fed by row triggers on every table the app writes to
     (`ticket_actions`, `stock_transactions`, `cs_transactions`, `skus`, `cs_skus`, `users`,
     `system_config`, `categories`, `sku_remarks`). Each row keeps **who** (resolved from the signed-in
     session, never the payload), **when**, **what changed** (a JSON old → new diff, passwords masked)
     and the **full comment / reason**. Readable by **Admins only** (RLS `public.is_admin()`), written by
     triggers only. It backfills the history that already exists (ticket actions, ledger rows, remarks)
     the first time it runs, skips no-op updates, and ignores writes that have no signed-in user — so
     re-running `seed.sql` can never flood the trail. Safe to re-run.

   > Every migration is **safe to re-run** (`if not exists` / `create or replace`), so paste the
   > whole file into the SQL Editor and press **Run** — even if it was already applied.
   > If you ever re-run `0006_ensure_reads.sql`, re-run `0009_user_management.sql` afterwards
   > (0006 re-grants table-level SELECT on `public.users`).
   > After re-running any of the earlier files, finish with `0010` → `0011` → `0012` → `0013` so the
   > ticket engine and the SKU RPCs always end up on the current definitions.
4. Run **`supabase/seed.sql`** — loads your entire Excel dataset (users, SKUs, tickets, items, transactions, CS warehouse, categories, config).
5. Enable Realtime on the tables if prompted (tables are subscribed automatically).

### 2. Create login accounts (Supabase Auth)

The seed puts a placeholder UUID on each `users` row. This script creates **Auth users** with your
Excel passwords and links them:

1. Copy `.env.example` → `.env` and enter:
   - `VITE_SUPABASE_URL` (Project Settings → API)
   - `VITE_SUPABASE_ANON_KEY` (same page)
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret — used only by this script)
2. Run:
   ```bash
   npm run seed:auth
   ```
3. Done — everyone logs in with their original email + password (defaults from the Excel).

> 🔒 Admin dashboard is at **Authentication → Users** — the sign-in itself is hashed by Supabase Auth.
> After `0009_user_management.sql` the plaintext password is ALSO kept on `public.users.password`
> so an **Admin can look a user's password up in the app** (System Settings → Users). That column is
> never returned by a normal query — only the admin-only `reveal_user_password()` RPC can read it.

### 2b. Manage users from the app (Admins)

**System Settings → Users** (Admin role) now does everything without opening Supabase:

| Action | How |
|---|---|
| **Add user** | *Add user* button — name, email, role, department, password. Creates the Auth account **and** the profile. |
| **Edit / update** | Pencil icon — name, username, email, department, role, account status. |
| **Activate / Inactive** | Power icon — inactive users cannot sign in (blocked server-side) and lose their sessions. |
| **Set password** | Key icon — writes the new password into `public.users.password` **and** re-hashes it for Auth, then signs the user out everywhere. |
| **Show / copy password** | Eye / copy icons in the Password column (Admin only). |
| **Delete** | Trash icon (with confirmation) — removes the profile **and** the Auth account. |

Guards: you cannot delete/deactivate your own account, and the last remaining active Admin is protected.
Non-admins (Warehouse / Customer Service) still see the list but read-only.

> ℹ️ Already have users from the Excel seed? Run **`npm run seed:auth`** once after applying 0009 to
> back-fill `public.users.password` from `data/Users.csv`.
### 3. Run the app live

```bash
npm run dev                  # local dev against Supabase
npm run build                # production build → dist/
```

### 4. Deploy to Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist --project-name easy-gold-merch
```

- SPA routing is already configured (`wrangler.jsonc` → `not_found_handling: single-page-application`)
  so deep links (e.g. `/action-center`) work.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **environment variables**
  (Production) in the Cloudflare Pages project settings, then redeploy or rebuild.
- Both desktop and mobile use the **same URL**.

> Static assets are served from the edge; only data goes to Supabase — fast on both devices.

---

## Pages & roles

| Route | Page | Access |
|---|---|---|
| `/login` | Login | everyone |
| `/dashboard` | Dashboard (stats + stock movement table, All/MKT/CS scope) | all roles |
| `/new-request` | New Request (+ CS-transfer banner for CS roles) | staff-ish roles |
| `/borrow` | Item Borrow (with return date) | staff-ish roles |
| `/cs-destock` | CS warehouse direct restock/destock + add SKU | CS, admin |
| `/transfer` | CS → MKT transfer | admin, warehouse |
| `/my-tickets` | My tickets (filter + search + detail) | all roles |
| `/action-center` | Approval queue (review/book, approve, finalize, reject, recall, process return) | WH, LM, director, admin |
| `/history` | History of all tickets | WH, LM, director, admin, finance, CS |
| `/inventory-report` | Date-range usage/loss report + CSV export | WH, LM, director, admin, finance, CS |
| `/month-end-report` | Monthly opening/in/out/closing ledger + XLSX export + landscape print | finance, admin, director, WH, CS |
| `/total-stock` | MKT + CS merged totals | admin, director |
| `/settings` | Users, categories, bypass config | admin, WH, CS |
| `/audit` | **Audit Trail** — who changed what and why (timeline + table, CSV export) | **admin only** |
| `*` | 404 + role-blocked redirect | — |

---

## Business engine (enforced server-side in PostgreSQL)

`update_ticket_status` implements the full state machine from `APP_MASTER_SPEC.md` §5.4:

- `pending → reviewed` books stock (deduction transaction, `Current_Stock` floor 0, approved-qty override)
- `reviewed → lm_approved → finalized`
- **Finalize a `cs_transfer` → CS warehouse auto-restocks** (`cs_skus` + `cs_transactions`)
- Reject / Recall **cancel the booking** (row status `Booking Cancelled`) and return the stock —
  no reversal Stock In row is written, and Reporting ignores cancelled / rejected / recalled
  movements, so a rejected ticket never shows a phantom Stock In + Stock Out
- Borrow `finalized → returned` records returned + broken quantities
- Every transition writes a `ticket_actions` audit trail and stamps `last_action_*` (plus
  `wh_comment_at` / `lm_comment_at` / `director_comment_at` so My Ticket can show **when** each
  approval level commented)

RLS is enabled — authenticated users can read; all writes go through security-definer RPC functions.
- **Approved-qty propagation** (migration `0014`): the warehouse, Line Manager *or* Director may set the
  approved qty — the **last value wins** and is what the engine books / deducts at finalize. Over-approval
  beyond the request is allowed up to **available stock** (`Current_Stock` + what this ticket already
  booked), never silently capped at the request. A change is echoed in the audit trail as
  "approved qty: X -> Y".

All open tabs update within ~1s via Supabase Realtime, so Action Center badges and stock numbers stay in sync.

### Editing an SKU (Manage Stock → SKU Setup)

| Field | Behaviour |
|---|---|
| **Name** | Always editable. Saving a change rewrites the name on every ticket item and ledger row (`ticket_items`, `stock_transactions`, `cs_transactions`, `cs_skus`) so all reports and views stay consistent. |
| **Cost per unit** | Always editable — Total value / Usage % recompute instantly (current stock × cost). |
| **Opening balance** | Always editable and a **plain baseline edit**: the engine applies the delta to `opening_balance`, `current_stock` and `total_inflow` and keeps the `OPENING` ledger row in sync. It never creates a Stock In / Stock Out movement, so Opening / Closing / Stock In / Stock Out stay aligned. |
| **Current stock** | Read-only in this dialog (shown with a “will become …” preview). Real movements are recorded from **Stock In / Out** (refill & issue) or **Adjust Balance** (physical count, loss/broken, found). |
| **Status** | Active / Inactive — inactive SKUs are hidden from Request & Borrow. |
| Restock | Single channel: **Manage Stock → Stock In / Out** (the Dashboard SKU dialog is read-only). |

### Audit trail (Admin → Audit Trail)

Every change the app makes is recorded automatically by the database — no screen has to remember to log it.

| What is recorded | Example |
|---|---|
| Ticket workflow | `Ticket TKT-… — Reviewed` + the comment the approver wrote |
| Stock ledger | `Booked 10 × "Gold Bar" on TKT-…`, `Restocked … +30`, `Warehouse transfer …`, and every **correction** (`Corrected MKT stock OUT "…" · qty 50 → 30`) with the reason |
| SKU master data | `Changed MKT item "…"` + cost / threshold / status / opening-balance before → after |
| System Settings | config keys and categories added / changed |
| User accounts | user added, role or status changed, password reset (the password itself is never stored) |
| SKU remarks | the remark text and who wrote it |

- Open it from the nav bar → **Audit Trail** (visible to **Admins only**; the row level security policy
  returns zero rows for every other role, even through the API).
- Default view is a **day-grouped timeline**; switch to **Table** for dense scanning. Filters: free text,
  person, area, action, period (Today / 7 / 30 days / All) and a one-click **Corrections only**.
- Click any row to expand it: the actor, the exact timestamp, the source row, a **Field / Before / After**
  table, and the **full comment** (nothing is truncated there — this is where an edit reason that looked
  "missing" in a table cell is shown in full).
- History that existed before the migration is imported once (`origin = import`); the newest 300 events of
  the chosen period load first, with **Load 300 older**.

### Reliability — a broken build can never leave a blank page

The app used to have **no error boundary and no global handler**, so any uncaught
error unmounted the whole React tree and left an empty page (no sidebar, no
message). A fixed root cause was `ReportingPage`'s month-end `useMemo` sitting
*after* the `if (loading) return` guard: on a deep link / hard refresh the hook
count changed between the loading and loaded renders, React 18 threw error
`#310`, and `/reporting` went blank.

Now:

| Layer | Behaviour |
|---|---|
| `ErrorBoundary` (`scope="app"` in `main.tsx`, `scope="page"` inside the shell) | Shows a readable card with **Reload** + **Copy details**; a crashing page keeps the sidebar/header usable. |
| Stale-chunk recovery | `lazyNamed` retries once, Vite's `vite:preloadError` reloads once (max 2 per session, `markHealthyBoot()` re-arms it), then the card says “This page needs a reload”. |
| `window.onerror` / `unhandledrejection` | Recorded in the crash log instead of dying silently. |
| `safeStorage` | Browsers that block site storage (hardened Incognito, kiosk, embedded webviews) fall back to an in-memory session instead of throwing `SecurityError` from `AuthContext.readSession()`. |
| Diagnostics → **Last app crash** | Build stamp (git SHA + build time), storage availability, and the last crashes with a copy button. |
| `public/_headers` | `/index.html` → `no-store` (never keep stale HTML that points at deleted chunk hashes), `/assets/*` → `immutable`. |

Verify a release with `npm run build && npx vite preview` and open every route in a
fresh tab — a healthy build records nothing in Diagnostics → Last app crash.


### SKU profile photos

Manage Stock → **SKU Setup** lets you attach a photo to each SKU (add or edit):

1. Click **SKU Setup**, then **Add SKU** (or the pencil icon on a SKU row).
2. Click **Choose photo** (JPG / PNG / WebP, max 6 MB) — a preview appears instantly.
3. Click **Create SKU / Save changes** — the photo is uploaded to the
   **`sku-images`** Storage bucket and its public URL is saved in `skus.image_url`
   (or `cs_skus.image_url` for the CS warehouse).

The photo then shows wherever SKUs appear (dashboard stock table, SKU detail dialog,
and the SKU Setup list). Replacing/removing a photo cleans up the old file in Storage.
Existing Google Drive image links from the legacy app keep working unchanged.

Report formulas (spec §7): Stock In = Σ addition, Stock Out = Σ deduction, Usage % =
max(0,(Inflow−Current)/Inflow×100). The **Month End Report** works on one whole month (`YYYY-MM`): Stock In
includes the item's initial `OPENING` genesis row, Opening = Current rolled back over every movement from the
1st of the month (so a brand-new item opens at 0), Closing = Current rolled back over the movements *after* the
month end (so a past month never shows today's stock), and **All stock** merges the MKT + CS rows, summing
quantities *and* values (each warehouse keeps its own cost per unit). An item is **never listed before its
creation date** (`createdAt`, else its first movement), and rows with no balance and no movement in the month
are hidden unless you tick **Show items with no movement** (Finance/audit view). In the month an item first
exists, its initial stock — even an imported baseline that has no `OPENING` ledger row — is reported as
**Stock In** with Opening 0, so the previous month's Closing always equals this month's Opening.

---

## Repository layout

```
supabase/
  migrations/0001_schema.sql            tables + RLS + indexes
  migrations/0002_functions.sql         SKU / CS / config RPC
  migrations/0003_ticket_engine.sql     create_ticket
  migrations/0004_ticket_state_machine.sql
  migrations/0005_sku_image_storage.sql sku-images Storage bucket + policies
  migrations/0006_ensure_reads.sql      RLS read policies (safe to re-run)
  migrations/0007_booking_at_creation.sql  stock booked on ticket create
  migrations/0008_workflow_hardening.sql   JWT role enforcement + approval caps
  migrations/0009_user_management.sql     users password + manage_user()/reveal_user_password()
  migrations/0010_fix_ticket_stock_lifecycle.sql  flat state machine + Book→Deduct
  migrations/0011_normalize_roles.sql     users.role canonicalisation
  migrations/0012_fix_jsonb_coalesce_types.sql    jsonb COALESCE type fix (Review & Book Stock)
  migrations/0013_sku_edit_restock_reporting.sql  SKU status + opening-balance edit + rename
                                                  cascade + clean reject/recall + comment stamps
  migrations/0014_approved_qty_propagation.sql    approved qty last-wins + per-level comment stamps
  migrations/0015_edit_stock_movement.sql         editable stock movements (edit_stock_movement RPC)
  migrations/0016_audit_log.sql                   audit_log table + row triggers + admin-only RLS
                                                  (Audit Trail page — safe to re-run)
  seed.sql                              auto-generated from your Excel data
scripts/
  export-csv.mjs           Excel → data/*.csv (UTF-8 BOM, Lao-safe)   [npm run csv:export]
  lib/csv.mjs              shared robust CSV parser
  generate-seed.mjs        CSV → supabase/seed.sql                    [npm run seed:generate]
  generate-demo-data.mjs   CSV → src/lib/demo-data.json               [npm run seed:demo]
  seed-auth.mjs            creates Supabase Auth accounts from data/Users.csv
data/                      CSV exports of the Excel sheets (never edit by hand)
.github/workflows/deploy.yml  CI/CD → build + typecheck + deploy to Cloudflare Pages
DEPLOY.md                  full step-by-step deploy guide
src/                       React SPA (lib/, contexts/, hooks/, components/, pages/)
wrangler.jsonc             Cloudflare Pages SPA config
```

Data pipeline: edit the Excel → `npm run seed:all` (export CSV → seed.sql → demo bundle)
→ apply in Supabase (see `DEPLOY.md` Part 6).

---

*Easy Gold By Khamphouvong — MIMS 2026. Blue edition.*