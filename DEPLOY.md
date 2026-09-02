# 🚀 Deploy Guide — GitHub + Supabase + Cloudflare (Easy Gold Merch)

This guide takes you from **an empty GitHub account** to a **live website** with your real,
Lao-language warehouse data running in production.

**Stack (all free tiers):**
| Where | What it does |
|---|---|
| **GitHub** | Stores your code + triggers auto-deploy on every push |
| **Supabase** | Database (Postgres), Login (Auth), File storage (SKU photos, Realtime) |
| **Cloudflare Pages** | Hosts the website (`https://easy-gold-merch.pages.dev`) |

> ✉️ Accounts you need (all free): **GitHub**, **Supabase**, **Cloudflare**.
> You'll spend most of your time in only 3 screens: GitHub repo → Supabase Dashboard → Cloudflare Dashboard.

---

## 🧭 Overview of the whole flow

```
Your Excel (.xlsx)
   │  npm run csv:export      ← converter script (handles Lao ✓)
   ▼
data/*.csv  (UTF-8 with BOM → opens correctly in Excel & Supabase)
   │  supabase/seed.sql        ← generated SQL (run once in Supabase)
   ▼
Supabase (database + login + storage)
   ▲
   │
GitHub (code repo)
   │  push to main
   ▼
GitHub Actions (auto build + deploy)
   ▼
Cloudflare Pages  →  https://your-site.pages.dev
```

---

## PART 1 — GitHub (put the code online)

1. Go to **https://github.com** → sign up / sign in.
2. Click the **+** (top-right) → **New repository**.
   - Repository name: `easy-gold-merch` (or anything you like).
   - Privacy: **Private** is fine (recommended).
   - **Do NOT** tick "Add a README" / ".gitignore" / "license" — we already have them.
   - Click **Create repository**.
3. Open a terminal in this project folder and run:

   ```bash
   git init
   git add .
   git commit -m "Easy Gold Merch web app + data pipeline"
   git branch -M main
   git remote add origin https://github.com/<YOUR-USERNAME>/easy-gold-merch.git
   git push -u origin main
   ```

   > If git asks for a password, use a **Personal Access Token** (GitHub → Settings →
   > Developer settings → Personal access tokens → Generate new token (classic) →
   > tick `repo`; use it as the password).

4. Your code is now on GitHub. ✅

---

## PART 2 — Supabase (create the database, load your data, create logins)

### 2.1 Create the project
1. Go to **https://supabase.com** → sign in → **New project**.
   - Name: `easy-gold-merch`
   - Database password: **write it down somewhere safe** (you'll need it).
   - Region: pick the closest (e.g. **Southeast Asia** is closest to Laos).
   - Click **Create new project** and wait ~2 minutes for it to build.

### 2.2 Create tables + business rules + photo storage (migrations)
1. In the Supabase **Dashboard** → left menu → **SQL Editor** → **New query**.
2. Open each file below, **copy the whole content**, paste it, press **Run** (or **Ctrl/Cmd + Enter**).
   Run them **in this exact order**:

   | Step | File | What it does |
   |---|---|---|
   | 1 | `supabase/migrations/0001_schema.sql` | tables: users, skus, tickets, transactions… + security |
   | 2 | `supabase/migrations/0002_functions.sql` | business engine (add SKU, restock, config…) |
   | 3 | `supabase/migrations/0003_ticket_engine.sql` | create tickets |
   | 4 | `supabase/migrations/0004_ticket_state_machine.sql` | approvals + stock accounting rules |
   | 5 | `supabase/migrations/0005_sku_image_storage.sql` | SKU photo bucket + policies |

   Each should show **"Success. No rows returned"** (or similar).

### 2.3 Load your real data (from the Excel)
The file **`supabase/seed.sql`** was generated from your Excel (in `Current Stock Data from previous Web.xlsx`) — 19 users, 40 MKT SKUs, 11 CS SKUs, 89 tickets, 205 transactions, with all Lao text intact.

1. Open a **New query** in SQL Editor.
2. Open `supabase/seed.sql`, **select-all**, copy, paste, **Run**.
   - You should see a green **"Success"** banner. (Seed is wrapped in `begin; … commit;` so if anything fails, nothing is half-loaded.)

3. **Verify it worked** → left menu → **Table Editor**:
   - `tickets` should show **89 rows**
   - `skus` → 40 rows, `cs_skus` → 11 rows, `stock_transactions` → 205 rows
   - Open `skus` → the **Name** column should show Lao like ບິກອີຊີໂກລ correctly.

### 2.4 Create login accounts (Supabase Auth)
Your Excel users keep their same email + password (`easygold1234` default).

1. In the project folder, copy `.env.example` → `.env`:

   ```bash
   copy .env.example .env        # Windows Command Prompt
   # or create a new file named ".env" with the same three lines
   ```

2. Fill in the values from Supabase → **Project Settings → API**:
   - `VITE_SUPABASE_URL` = your **Project URL** (e.g. `https://abcdefgh.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` = **anon public** key
   - `SUPABASE_SERVICE_ROLE_KEY` = **service_role** key (SECRET — never share it / never put it in the website)

3. Install dependencies (first time) and run:

   ```bash
   npm install
   npm run seed:auth
   ```

   → "19 auth users" created/updated. Anyone can now log in with their Excel email + password.

> 🔒 Passwords are stored **hashed** by Supabase Auth — your plaintext Excel passwords never live in the database.

### 2.5 Enable Realtime (live updates between open tabs)
1. Supabase Dashboard → **Database → Replication**.
2. Under **Realtime → supabase_realtime** click the **paper toggle** to enable all tables
   (`skus, cs_skus, tickets, ticket_items, stock_transactions, cs_transactions, categories, system_config`).
   (If your plan doesn't show this page, it's already enabled — the app handles it automatically.)
---

## PART 3 — Cloudflare (host the website + automatic deploys)

### 3.1 Create the Cloudflare account
1. Go to **https://dash.cloudflare.com** → sign up.
2. Accept the free plan (no domain needed — Pages gives you a free `*.pages.dev` URL).

### 3.2 Create an API token so GitHub can deploy for you
1. Cloudflare Dashboard → click **My Profile** (top-right) → **API Tokens** → **Create Token**.
2. Use the template **"Edit Cloudflare Workers"** (Workers and Pages share the same token scope):
   - Account resources: **Include → your account**
   - Zone resources: **Include → All zones**
   - Click **Continue to summary** → **Create Token**.
3. **Copy the token** (shown once). Keep it safe.

4. Find your **Account ID**: Cloudflare Dashboard → right sidebar / any page footer →
   the number like `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`.
   (Or: click your profile → **API tokens** page shows "Account ID" too.)

### 3.3 Connect GitHub → Cloudflare (in Cloudflare Dashboard)
1. Cloudflare Dashboard → **Workers & Pages** → **Pages** → **Connect to Git**.
2. **Authorize GitHub** when prompted (this lets Cloudflare optionally deploy for you).
3. On the **Create a Pages project** screen:
   - **Project name**: `easy-gold-merch`
   - **Production branch**: `main`
   - Framework preset: **None** (we'll set build command manually)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - Click **Save and Deploy**.

   → Cloudflare now **auto-deploys** on every push to `main` (this replaces the need to run GitHub Actions manually).
   Your site will be at `https://easy-gold-merch.pages.dev`.

### 3.4 Set your Supabase keys in Cloudflare
The built website needs the Supabase URL + anon key (they are baked into the app when building).

1. Cloudflare Pages → your project → **Settings → Environment variables**.
2. Add **two** variables (mark both **Production**):
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
3. Click **Save**, then **Deployments → Retry deployment** so the new build picks them up.

---

## PART 4 — (Optional but recommended) GitHub Actions CI/CD

If you prefer a single pipeline that **checks the code, builds, tests, deploys** on every push
(and lets you see pass/fail right on GitHub), the repo already includes:

**`.github/workflows/deploy.yml`** — workflow that runs on every push to `main`.

To use it:
1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
   Add these secrets (values from above):

   | Secret | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | the Cloudflare API token you created |
   | `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare Account ID |
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key |

2. Push a commit to `main` (e.g. `git add . && git commit -m "ci" && git push`).
3. GitHub → **Actions** tab → you'll see the workflow running → **Build** → **Deploy**.
4. Your site updates automatically after the green checkmark.

> You can use **either** Cloudflare's own "Connect to Git" (Part 3.3) **or** GitHub Actions —
> not both, or you'll get double deploys. Pick one. If you use GitHub Actions, skip 3.3
> ("Connect to Git") — the Action creates the Pages project automatically with `--project-name`.

---

## PART 5 — Local check (optional, before or after deploying)

```bash
npm install
npm run dev        # → http://localhost:8080 (with .env filled in → live mode)
```

Log in with any Excel user (e.g. `tockppd@gmail.com` / `easygold1234` for admin).
If you want to preview WITHOUT a database, just delete/rename `.env` — the app runs in offline demo mode
using the same translated data.
---

## PART 6 — Converting your Excel to Lao-safe CSV & uploading (future updates)

You never type data into Supabase directly again. You keep working in **your Excel**,
then re-push the data with one command.

### Every time your Excel changes:

```bash
npm run csv:export     # Excel  -> data/*.csv  (UTF-8 BOM, Lao-safe)
npm run seed:generate  # CSVs   -> supabase/seed.sql
npm run seed:demo      # CSVs   -> src/lib/demo-data.json (offline preview bundle)
```

(Or just run `npm run seed:all` to do all three at once.)

### Then apply to your live database — choose ONE of these:

**Option A — Upload the CSVs directly (beginner friendly, no SQL):**
1. Supabase Dashboard → **Table Editor** → open a table (e.g. `skus`).
2. Click **Import data from CSV** (top-right) → select `data/SKU_MasterData.csv`.
3. Supabase shows the column mapping — make sure they line up → **Import**.
4. Repeat for each table that changed: `Users, SKU_MasterData, CS_SKU_MasterData,
   Tickets, TicketItems, StockTransactions, CS_Transactions, TicketActions,
   Categories, System_Config, SKU_Remarks`.
   - ⚠️ For **Users**: delete existing rows first OR just run `npm run seed:auth` after
     a fresh seed (it maps auth users to these rows).
   - ⚠️ Watch the Import screen: some columns (e.g. date/time) may need format fixing.

**Option B — Re-run the seed SQL (recommended, keeps everything consistent):**
1. Regenerate: `npm run seed:generate`.
2. Supabase → **SQL Editor → New query**. First run a wipe:
   ```sql
   truncate public.tickets, ticket_items, stock_transactions, ticket_actions, sku_remarks;
   truncate public.skus, cs_skus;
   ```
   Then paste `supabase/seed.sql` and run it. (The seed uses `insert`, so tables must be
   empty for a clean reload.)
3. Run `npm run seed:auth` again to re-link logins (ids are regenerated).

> 💡 Keep a **backup**: before reloading, use Supabase → **Database → Backups** to download
> a copy, or export each table to CSV from Table Editor.

---

## PART 7 — After-deploy checklist (make sure it's all working)

1. **Open** `https://easy-gold-merch.pages.dev` → you should see the login page.
2. **Log in** with `tockppd@gmail.com` / `easygold1234` (admin) — lands on Dashboard.
3. **Dashboard** shows your stock table with **Lao SKU names** (ບິກອີຊີໂກລ etc.) and totals.
4. Open **Manage Stock → SKU Setup** → edit any SKU → upload a photo → Save → photo appears
   on Dashboard immediately (needs migration 0005 for storage).
5. **Action Center / Tickets / History** load and match your Excel numbers.
6. Open the site on your **phone** too — it's fully responsive.
7. Push a small change to GitHub → watch **GitHub Actions / Cloudflare Pages** go green →
   site updates automatically within ~2 minutes.

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| Site loads but "login" fails | Re-check `VITE_SUPABASE_ANON_KEY` (public) and that `npm run seed:auth` succeeded |
| Site shows **demo data** instead of live | The build ran **without** `VITE_SUPABASE_URL` set → set vars in Cloudflare / GitHub Actions secrets and redeploy |
| "relation does not exist" / "function does not exist" | A migration didn't run or ran out of order → re-run 0001→0005 in order |
| Photos won't upload | Run `0005_sku_image_storage.sql` (creates the `sku-images` bucket) |
| Lao shows as `???` in Excel | Re-export with `npm run csv:export` (files now carry a UTF-8 **BOM**) |
| Deploy fails: "Authentication error" | Regenerate the Cloudflare API token + update the GitHub secret |
| Import from CSV fails on dates | In Supabase Table Editor mapping, change those columns to `date`/`timestamptz` or format as `YYYY-MM-DD` |
| Forgot DB password | Supabase Dashboard → Settings → Database → **Reset database password** |

---

## 📦 What was added (this repo change)

- `scripts/export-csv.mjs` — Excel → `data/*.csv`, UTF-8 BOM, RFC-4180 quoting, embedded newlines normalized (Lao-safe).
- `scripts/lib/csv.mjs` — shared robust CSV parser used by all seed scripts.
- `npm run csv:export` and `npm run seed:all` scripts.
- `.github/workflows/deploy.yml` — CI/CD pipeline.
- This guide.