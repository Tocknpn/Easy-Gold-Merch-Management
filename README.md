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

> 🔒 Admin dashboard is at **Authentication → Users** — your plaintext Excel passwords are now hashed by Supabase Auth.
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
| `*` | 404 + role-blocked redirect | — |

---

## Business engine (enforced server-side in PostgreSQL)

`update_ticket_status` implements the full state machine from `APP_MASTER_SPEC.md` §5.4:

- `pending → reviewed` books stock (deduction transaction, `Current_Stock` floor 0, approved-qty override)
- `reviewed → lm_approved → finalized`
- **Finalize a `cs_transfer` → CS warehouse auto-restocks** (`cs_skus` + `cs_transactions`)
- Reject / Recall return booked stock (addition transactions)
- Borrow `finalized → returned` records returned + broken quantities
- Every transition writes a `ticket_actions` audit trail and stamps `last_action_*`

RLS is enabled — authenticated users can read; all writes go through security-definer RPC functions.
All open tabs update within ~1s via Supabase Realtime, so Action Center badges and stock numbers stay in sync.

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

Report formulas are unchanged from the spec (§7): Stock In = Σ addition (excl. OPENING), Stock Out = Σ deduction,
Opening = Current + StockOut − StockIn, Usage % = max(0,(Inflow−Current)/Inflow×100).

---

## Repository layout

```
supabase/
  migrations/0001_schema.sql            tables + RLS + indexes
  migrations/0002_functions.sql         SKU / CS / config RPC
  migrations/0003_ticket_engine.sql     create_ticket
  migrations/0004_ticket_state_machine.sql
  migrations/0005_sku_image_storage.sql sku-images Storage bucket + policies
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