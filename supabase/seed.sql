-- ============================================================
-- Easy Gold Merch Management — Complete Database Import
-- Generated from Actual Database.xlsx via scripts/generate-seed.mjs
-- Compatible with migration 0019 (Blue edition).
--
-- HOW TO APPLY:
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this ENTIRE file and press Run
--   3. Run `npm run seed:auth` in your terminal to create/link logins
-- ============================================================

begin;

-- ── Step 1: Wipe transactional tables in FK-safe order ──
delete from public.ticket_items;
delete from public.ticket_actions;
delete from public.stock_transactions;
delete from public.cs_transactions;
delete from public.sku_remarks;
delete from public.tickets;

-- ── Step 2: Categories (upsert) ──
insert into public.categories (name) values ('Booth') on conflict (name) do nothing;
insert into public.categories (name) values ('Merch') on conflict (name) do nothing;

-- ── Step 3: System Config (upsert + re-assert engine_version) ──
insert into public.system_config (key, value, description)
  values ('bypass_threshold', '0', NULL)
  on conflict (key) do update set value = excluded.value, description = excluded.description;
insert into public.system_config (key, value, description)
  values ('bypass_level', 'none', NULL)
  on conflict (key) do update set value = excluded.value, description = excluded.description;
insert into public.system_config (key, value, description)
  values ('engine_version', '0014', 'Approved-qty propagation (over-approval enabled)')
  on conflict (key) do update set value = excluded.value;

-- ── Step 4: Users (upsert by email, preserves existing auth UUID) ──
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'phonethida.easygold@gmail.com', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT', 'staff', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'lvesaphong96@gmail.com', 'lvesaphong96@gmail.com', 'Souphavanh Vetsaphong', 'MKT', 'staff', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'thavatxay94@gmail.com', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT', 'staff', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'Somparthana.bpv@gmail.com', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL', 'warehouse', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'sout2017@gmail.com', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL', 'warehouse', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'tockppd@gmail.com', 'tockppd@gmail.com', 'Nopphanai Phomphakdee', 'MKT', 'admin', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'Jonathan.easygold@gmail.com', 'jonathan.easygold@gmail.com', 'Jonathaan Meadley', 'MKT', 'staff', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'sphengxay@gmail.com', 'sphengxay@gmail.com', 'Souliphonh Phengxay', 'MKT', 'director', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'souphanithvst@gmail.com', 'souphanithvst@gmail.com', 'Souphanit Vongsengthong', 'MKT', 'admin', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'souk07025@gmail.com', 'souk07025@gmail.com', 'Souk', 'Admin', 'staff', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'cs@easygold.com', 'cs@easygold.com', 'Customer Service', 'CS', 'customer_service', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'souphavanh.vesaphong@gmail.com', 'souphavanh.vesaphong@gmail.com', 'Linda', 'MKT', 'staff', 'Active', '1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'alounys08@gmail.com', 'alounys08@gmail.com', 'Alouny', 'MKT', 'line_manager', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'bm.keomath@gmail.com', 'bm.keomath@gmail.com', 'Bounmy', 'Finance', 'finance', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'annasorsukun@gmail.com', 'annasorsukun@gmail.com', 'Anna', 'HR', 'hr', 'Active', 'easygold9999', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'malisa.pam1999@gmail.com', 'malisa.pam1999@gmail.com', 'Nuni', 'PA', 'pa', 'Active', 'easygold9999', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'soulinta2001@gmail.com', 'soulinta2001@gmail.com', 'Soulinta', 'Customer Service', 'customer_service', 'Active', '11223344', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'Saiyfonphommathed@gmail.com', 'saiyfonphommathed@gmail.com', 'Saiyfon', 'Customer Service', 'customer_service', 'Active', '11223344', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'Baybiethammavong@gmail.com', 'baybiethammavong@gmail.com', 'Babie', 'Customer Service', 'customer_service', 'Active', '11223344', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();
insert into public.users (id, username, email, full_name, department, role, status, password, password_updated_at)
  values (gen_random_uuid(), 'ketmany.kks@gmail.com', 'ketmany.kks@gmail.com', 'Ketmany', 'MKT', 'staff', 'Active', 'easygold1234', now())
  on conflict (email) do update set
    username   = excluded.username,
    full_name  = excluded.full_name,
    department = excluded.department,
    role       = excluded.role,
    status     = excluded.status,
    password   = coalesce(public.users.password, excluded.password),
    updated_at = now();

-- ── Step 5: MKT SKUs (upsert by id, default status=active) ──
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771406960024', 'ບິກອີຊີໂກລ', 'Merch', 'pcs', 850, 230, 2800, 'https://drive.google.com/uc?id=1mGYB0oPqQFo3koTzQe1sBB2ytghlNPVQ', 10, 5000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407004896', 'ພວງກະເເຈ', 'Merch', 'pcs', 474, 0, 474, 'https://drive.google.com/uc?id=1qpRx9mvqdJ1XJNAI5A1Yum-S1kehd3JT', 0, 7000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407061986', 'ຈອກກາເເຟ', 'Merch', 'pcs', 1637, 5, 1637, 'https://drive.google.com/uc?id=1AZ98F3nSd5kaWCpxmVUpcCCqiN98wEJw', 0, 40000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 'Merch', 'pcs', 175, 0, 775, 'https://drive.google.com/uc?id=1hkA1erHwgR0y9yNCPITVTAuQCOTRyx9S', 0, 73000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407148002', 'ກະເປົາຜ້າ', 'Merch', 'pcs', 0, 0, 0, 'https://drive.google.com/uc?id=1tuoXVXQvPsrEsQKVCgcgMSjemrSfN0qU', 0, 40000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407316677', 'ຄັນຮົ່ມ 2026', 'Merch', 'pcs', 0, 0, 400, 'https://drive.google.com/uc?id=1ObA0rIgPSEiZtrqAul49v0r0EAaFv26e', 10, 84000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407810939', 'ກະປຸກອອມສິນ', 'Merch', 'pcs', 392, 34, 392, 'https://drive.google.com/uc?id=1zYF1oMDsGQ3SddvFHwy7669xUcjiamsj', 0, 59000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407856341', 'ຫມວກ', 'Merch', 'pcs', 0, 0, 0, 'https://drive.google.com/uc?id=1nWLOttjR5tBJbmtTx7xcsifZkj6NBZbu', 0, 53000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407897767', 'ກະເປົາເດີນທາງ', 'Merch', 'pcs', 1, 99, 201, 'https://drive.google.com/uc?id=1jqbe2VQorLQKzhEa70kLjQAK8IUk7SRM', 1, 445000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407936514', 'ຄັນຮົ່ມກ໊ອບ', 'Merch', 'pcs', 98, 1, 98, 'https://drive.google.com/uc?id=1iWhKjJRgOH7D1KyVmgx82NI1UeCB23Jk', 1, 180000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407974256', 'ຊຸດຈອກກາເຟ', 'Merch', 'set', 310, 140, 310, 'https://drive.google.com/uc?id=1BMRMe8whaL7XGIF_DnQPbYYIA_rozwqL', 0, 330000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 'Merch', 'set', 120, 6, 120, 'https://drive.google.com/uc?id=1yFnX4ALjzaH-hxAqslLLwl6y8PAC_1hN', 0, 251600, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1772007048630', 'ໂຕະຂາວ (ແບບພັບ) W180 x H75 x L60cm', 'Booth', 'ນ່ວຍ', 3, 2, 3, 'https://drive.google.com/uc?id=1JA3jDowJbg5HiXKUurIrtPa7hQGnGDe3', 1, 0, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1772007441977', 'ຕັ່ງພັບ ສີຟ້າ', 'Booth', 'ນ່ວຍ', 8, 8, 8, 'https://drive.google.com/uc?id=1H6EVkRSnmbqyM8KqpItX-vFRc7irv95Y', 2, 0, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1772168083653', 'A4 Acrylic Sign Holder', 'Booth', 'ອັນ', 10, 10, 10, 'https://drive.google.com/uc?id=1r-Zr9Edb8KyiiaQGiCyKMeLcjDhIy-FZ', 2, 145000, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1772179915959', 'ແບັກດອບແບບຜ້າ  230 WxH 200 cm', 'Booth', 'ອັນ', 2, 0, 2, 'https://drive.google.com/uc?id=1jrBkVokkLjt9eii6OhsjnU1mTsBSKVlZ', 1, 0, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1772183466273', 'ໂຕະເຄົາເຕີ Fabric Counter  ຂະຫນາດ: W 75x H 150 Cm', 'Booth', 'ນ່ວຍ', 2, 2, 2, 'https://drive.google.com/uc?id=1mXXihwsoRwCRyM9ziyKJ10x6lIkLE5ZC', 1, 0, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1772183613706', 'Beach flag 310x240x60 Cm', 'Booth', 'ອັນ', 2, 0, 2, 'https://drive.google.com/uc?id=1PYa4rPfMVPMkt-V6AorH8ZFccqcbDfPf', 1, 0, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1772183974356', 'TV  52 ນິ້ວ', 'Booth', 'ນ່ວຍ', 1, 1, 1, 'https://drive.google.com/uc?id=1LeUkceG5HJa8ynzswjzv4qUS9AyypgmF', 1, 0, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1773299233699', 'A4 Brochure', 'Booth', 'ອັນ', 5000, 300, 5000, 'https://drive.google.com/uc?id=1t2TaS9ce-8ua9gGAQk8HgWW3RFHazaiW', 0, 1200, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1773828255894', 'JBL Speaker', 'Booth', 'ນ່ວຍ', 1, 2, 3, 'https://drive.google.com/uc?id=1-4v7SLrNEPvUClJiPX6fPbye7f-xe6hP', 1, 0, '2026-02-20T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 'Merch', 'ອັນ', 500, 108, 500, 'https://drive.google.com/uc?id=1qqijUfFAH6ADv9MGBiYDknTjg3ObPsiy', 20, 105000, '2026-04-07T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 'Merch', 'ອັນ', 400, 74, 400, 'https://drive.google.com/uc?id=1B_KAX_feXQ3CMAmTpd2uBb5tYXEk6GM7', 10, 16500, '2026-03-31T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 'Merch', 'ອັນ', 2000, 95, 2000, 'https://drive.google.com/uc?id=1SjrjCqWIZ9xsY24MDwA6iHYnm4mmIvmX', 20, 14000, '2026-03-31T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1775456004647', 'ກະເປົາກິລາ', 'Merch', 'ນ່ວຍ', 600, 200, 600, 'https://drive.google.com/uc?id=1kOKWOoaNPcNH9Ken9EcAs_gXj79RY2WY', 10, 95000, '2026-04-06T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 'Merch', 'ອັນ', 690, 0, 690, 'https://drive.google.com/uc?id=1jmqc8j3ZTxA2splfDuZQj9H-NutS5jY1', 50, 52000, '2026-04-09T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1776756364541', 'ຖົງກັນນ້ຳ', 'Merch', 'ອັນ', 770, 0, 770, 'https://drive.google.com/uc?id=1VszHSBFpeyl0E85KtcFgbOUmlO2DU0kK', 5, 54000, '2026-04-02T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1776929481221', 'ພັດລົມໄອນ້ຳ', 'Booth', 'ນ່ວຍ', 2, 0, 2, 'https://drive.google.com/uc?id=10QLgb3n0xzBQ_jM_-pwndcbwkLbI71uf', 1, 0, '2026-04-24T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1777355358958', 'ໂຕະຜ້າແບບ ໄຮໂດຣິກ', 'Booth', 'ນ່ວຍ', 2, 2, 2, 'https://drive.google.com/uc?id=1HoAmxwlbdl1qPnJK8xZ0qQ21QzOFtpON', 0, 2600000, '2026-05-11T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1779434977945', 'Paper Bag', 'Booth', 'ອັນ', 5000, 4270, 5000, 'https://drive.google.com/uc?id=1OKF2e1Rt7mP_J0eiuRSkTtDnZVTURAyO', 100, 12000, '2026-05-15T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1780972510074', 'ຈອກເກັບອຸນຫະພູມ 2026', 'Merch', 'ຫນ່ວຍ', 300, 0, 300, 'https://drive.google.com/uc?id=13U9QXzaW56b7drekeOZN2RrOiarFaTft', 30, 73000, '2026-06-09T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1781512257490', 'KPV ໂຕະໄຮໂດຣລິກ', 'Booth', 'ນ່ວຍ', 1, 0, 1, 'https://drive.google.com/uc?id=1MqGx01AlFXDu7QUlfLME61Lq2FSy3nyF', 1, 2600000, '2026-06-16T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1781666955837', 'Pride Bag', 'Merch', 'ນ່ວຍ', 100, 0, 100, 'https://drive.google.com/uc?id=1KzZVez0d54XupruCjZCffgSVHrpxR2RS', 1, 75000, '2026-06-17T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1781681021177', 'ຫມວກ 2026', 'Merch', 'ນ່ວຍ', 500, 0, 500, 'https://drive.google.com/uc?id=164-A6eQqvFJ8STTJlC3td3iRSKbspTKA', 20, 55000, '2026-06-17T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1785120875998', 'A4 Brochure Easy Hub', 'Booth', 'ອັນ', 3000, 3000, 6000, 'https://drive.google.com/uc?id=1oz22cD3LXJjbwdf5HjmMvZSseCIFieCW', 50, 1800, '2026-07-24T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1785121215788', 'Paper Bag for GOLD', 'Merch', 'ອັນ', 5000, 4798, 10000, 'https://drive.google.com/uc?id=1LB2DirspdcFj0fHC3XZOU64VHvO3gJ6M', 500, 7000, '2026-07-22T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1787027890986', 'ກ່ອງຂອງຂວັນ', 'Merch', 'ອັນ', 300, 280, 300, 'https://drive.google.com/uc?id=1w6mrynZYYoq6YH-slIL1rXVv2ux-bKe-', 10, 45000, '2026-08-18T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1787714793029', 'Tote Bag If & Art', 'Merch', 'ນ່ວຍ', 110, 0, 110, 'https://drive.google.com/uc?id=1z9O4vnsWmlazf9clvYNlfXnb8bgrZQ0x', 1, 280000, '2026-08-03T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1787715043950', 'Gift set V2', 'Merch', 'ຊຸດ', 100, 0, 100, 'https://drive.google.com/uc?id=18RNb3orfnwjRMeobW3v-OG3QH9A3PKzy', 20, 260000, '2026-08-25T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1788146835376', 'Piggy Bank V2', 'Merch', 'ອັນ', 200, 100, 200, 'https://drive.google.com/uc?id=1DO8XzALge_qHw41jw1x7ONsA2MYlMfIA', 20, 59000, '2026-08-28T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1788767052509', 'ຈອກກາເຟ - V2', 'Merch', 'ນ່ວຍ', 300, 300, 300, 'https://drive.google.com/uc?id=1Nnc-Fnxz7hAXyO3ACCC-6WPAyxY3f6Y_', 50, 44000, '2026-09-07T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1788852814387', 'Tumbler x LDB', 'Merch', 'pcs', 110, 58, 110, 'https://drive.google.com/uc?id=1SA3fS5FoNfMCviRNZcFNaJMqhNzx-Gsp', 10, 120000, '2026-09-07T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789008629179', 'ກ່ອງໃສ່ນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ສະລືງ)', 'Merch', 'ອັນ', 50, 0, 50, 'https://drive.google.com/uc?id=1EkegXqp8CI6eA5Iwt182m2MZfaiLqteE', 10, 60000, '2026-09-08T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 'Merch', 'ອັນ', 50, 0, 50, 'https://drive.google.com/uc?id=1SWF-1l5KpA0WH1bvnLl1LrErkXswTwbr', 10, 60000, '2026-09-08T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789008980374', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 2 ບາດ)', 'Merch', 'ອັນ', 40, 0, 40, 'https://drive.google.com/uc?id=1AkAFkIV6IFolx2Na7HYhtPfceXGv1JcW', 10, 70000, '2026-09-08T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789009038990', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 5 ບາດ)', 'Merch', 'ອັນ', 40, 0, 40, 'https://drive.google.com/uc?id=1pIu6ONxATvhplrfK4F8y5FWp2v8R4PUL', 10, 70000, '2026-09-08T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789009139983', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 10 ບາດ)', 'Merch', 'ອັນ', 20, 0, 20, NULL, 10, 70000, '2026-09-08T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1790067645670', 'Umbrella X LDB', 'Merch', 'ອັນ', 132, 132, 132, 'https://drive.google.com/uc?id=1te4vdBSlXWwzn1wZU8YzDpnHVQDkTpnb', 5, 140000, '2026-09-22T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');
insert into public.skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1790220235813', 'Gift set Hero', 'Merch', 'ອັນ', 90, 90, 90, 'https://drive.google.com/uc?id=15HEUf3i0P8BCD06BzKJzBmb3QiG1pNHu', 1, 450000, '2026-09-24T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.skus.status, 'active');

-- ── Step 6: CS SKUs (upsert by id, default status=active) ──
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407897767', 'ກະເປົາເດີນທາງ', 'Merch', 'pcs', 100, 98, 100, 'https://drive.google.com/uc?id=1jqbe2VQorLQKzhEa70kLjQAK8IUk7SRM', 1, 445000, '2026-07-13T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771406960024', 'ບິກອີຊີໂກລ', 'Merch', 'pcs', 1500, 947, 1500, 'https://drive.google.com/uc?id=1mGYB0oPqQFo3koTzQe1sBB2ytghlNPVQ', 10, 5000, '2026-07-13T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1781681021177', 'ຫມວກ 2026', 'Merch', 'ນ່ວຍ', 500, 473, 500, 'https://drive.google.com/uc?id=164-A6eQqvFJ8STTJlC3td3iRSKbspTKA', 20, 55000, '2026-07-13T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1771407316677', 'ຄັນຮົ່ມ 2026', 'Merch', 'pcs', 200, 189, 200, 'https://drive.google.com/uc?id=1ObA0rIgPSEiZtrqAul49v0r0EAaFv26e', 10, 84000, '2026-07-13T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1780972510074', 'ຈອກເກັບອຸນຫະພູມ 2026', 'Merch', 'ຫນ່ວຍ', 300, 274, 300, 'https://drive.google.com/uc?id=13U9QXzaW56b7drekeOZN2RrOiarFaTft', 30, 73000, '2026-07-13T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('CS-SKU-1784195433787', 'ກ່ອງຄໍາ 2ສະຫລຶງ', 'Merch', 'ກ່ອງ', 5, 5, 5, NULL, 3, 518000, '2026-07-16T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('CS-SKU-1784195489874', 'ກ່ອງຄໍາ 2ບາດ', 'Merch', 'ກ່ອງ', 5, 5, 5, NULL, 3, 518000, '2026-07-16T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('CS-SKU-1784195540861', 'ກ່ອງຄໍາ 10ບາດ', 'Merch', 'ກ່ອງ', 7, 6, 7, NULL, 4, 311000, '2026-07-16T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('CS-SKU-1784195595962', 'ກ່ອງຄໍາ5ບາດ', 'Merch', 'ກ່ອງ', 1, 0, 1, NULL, 0, 311000, '2026-07-16T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789008629179', 'ກ່ອງໃສ່ນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ສະລືງ)', 'Merch', 'ອັນ', 50, 50, 50, 'https://drive.google.com/uc?id=1EkegXqp8CI6eA5Iwt182m2MZfaiLqteE', 10, 60000, '2026-09-10T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 'Merch', 'ອັນ', 50, 45, 50, 'https://drive.google.com/uc?id=1SWF-1l5KpA0WH1bvnLl1LrErkXswTwbr', 10, 60000, '2026-09-10T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789008980374', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 2 ບາດ)', 'Merch', 'ອັນ', 40, 40, 40, 'https://drive.google.com/uc?id=1AkAFkIV6IFolx2Na7HYhtPfceXGv1JcW', 10, 70000, '2026-09-10T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789009038990', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 5 ບາດ)', 'Merch', 'ອັນ', 40, 40, 40, 'https://drive.google.com/uc?id=1pIu6ONxATvhplrfK4F8y5FWp2v8R4PUL', 10, 70000, '2026-09-10T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1789009139983', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 10 ບາດ)', 'Merch', 'ອັນ', 20, 20, 20, NULL, 10, 70000, '2026-09-10T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');
insert into public.cs_skus (id, name, category, unit, opening_balance, current_stock, total_inflow, image_url, low_stock_threshold, cost_per_unit, created_at, status)
  values ('sku-1785121215788', 'Paper Bag for GOLD', 'Merch', 'ອັນ', 50, 50, 50, 'https://drive.google.com/uc?id=1LB2DirspdcFj0fHC3XZOU64VHvO3gJ6M', 500, 7000, '2026-09-11T00:00:00Z', 'active')
  on conflict (id) do update set
    name                = excluded.name,
    category            = excluded.category,
    unit                = excluded.unit,
    opening_balance     = excluded.opening_balance,
    current_stock       = excluded.current_stock,
    total_inflow        = excluded.total_inflow,
    image_url           = excluded.image_url,
    low_stock_threshold = excluded.low_stock_threshold,
    cost_per_unit       = excluded.cost_per_unit,
    status              = coalesce(public.cs_skus.status, 'active');

-- ── Step 7: Tickets ──
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1771577788359', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT',
    '2026-02-19', 'For Lunar New Year Campaign (10-17 Feb 2026)', '2026-02-20T08:56:27.312Z', 'Bam & J, ໄປເອົາຢູ່ສາງເອງ', NULL, NULL,
    '2026-03-24T08:05:19.378Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-02-19', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1772507237246', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT',
    '2026-02-24', 'for Kaopoon''s shooting as a prop and easter eggs', '2026-03-03T03:07:14.742Z', NULL, NULL, NULL,
    '2026-03-24T08:05:34.964Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-02-24', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1772592110294', 'finalized', 'souk07025@gmail.com', 'Souk', 'Admin',
    '2026-03-04', 'ເບີກໄປໃຊ້ຊັ້ນ 1', '2026-03-04T02:41:49.328Z', 'ເບິກໂຕຈິ່ງແມ່ນ 20 ຊຸດ', NULL, NULL,
    '2026-03-24T08:05:52.128Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-04', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1773299387291', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-03-12', 'ໃຫ້ທີມອາເຈັນຊີ້ ອອກບູສ ທີ່ງານ ຫນັງສື ຢູ່ ມ.ຊ', '2026-03-12T07:09:46.109Z', NULL, NULL, NULL,
    '2026-03-24T08:06:06.664Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-12', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1773652078809', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT',
    '2026-03-16', 'For Bluebox campaign', '2026-03-16T09:07:56.326Z', NULL, NULL, NULL,
    '2026-03-24T08:06:21.012Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-16', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1773722800507', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-03-13', 'ເບິກໄປຊັບພອດງານສະປອນເຊີ Pha-Jay', '2026-03-17T04:46:39.165Z', NULL, NULL, NULL,
    '2026-03-24T08:06:33.410Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-13', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1773723473614', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-03-17', 'Support Corporate (partnership)', '2026-03-17T04:57:52.031Z', NULL, NULL, NULL,
    '2026-03-24T08:07:06.618Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-17', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1774339252579', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-03-21', 'Agency support Picky Bank 40', '2026-03-24T08:00:51.245Z', NULL, NULL, NULL,
    '2026-03-26T01:35:17.102Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-21', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1774431236031', 'finalized', 'cs@easygold.com', 'Customer Service', 'CS',
    '2026-03-25', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ6', '2026-03-25T09:33:54.102Z', 'ນ້ອງໆ CX ເບິກມາໄວ້ຊັ້ນ 6 ເພື່ອມອບໃຫ້ລູກຄ້າທີ່ເຂົ້າມາແລກຄະແນນ', NULL, NULL,
    '2026-03-27T01:36:19.060Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-25', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1774519787325', 'finalized', 'souk07025@gmail.com', 'Souk', 'Admin',
    '2026-03-26', 'ເບີກໄວ້ມອບໃຫ້ຫົວໜ້າກົມເຕັກໂນໂລຊີ ແລະ ໄວໃຫ້ແຂກຫົວໜ້າ', '2026-03-26T10:09:45.687Z', 'ເນື່ອງຈາກ ສຸກຕ້ອງການດ່ວນ (ມື້ຊັບມິດເລີຍ) ກໍ່ເລີຍໃຫ້ສຸກເບິກຢືມນຳທີມ ບໍລິການລູກຄ້າກ່ອນ, ແລ້ວປູນາຈະເບິກມາແທນຄືນໃຫ້', NULL, NULL,
    '2026-03-27T01:36:35.542Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-26', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1774519858761', 'finalized', 'souk07025@gmail.com', 'Souk', 'Admin',
    '2026-03-26', 'ໃຊ້ເປັນໂຕະກາເຟຊັ້ນ 01 ເພື່ອຮັບຮອງລູກຄ້າ', '2026-03-26T10:10:55.935Z', NULL, NULL, NULL,
    '2026-03-27T07:00:08.601Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-03-26', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1775030802941', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-04-02', 'Free gifts and giveaways for customers at booth events. ເເຈກລູກຄ້າເປີດບັນຊີ ເເລະ ຊື້ຄຳຫນ້າບູດ', '2026-04-01T08:06:38.832Z', NULL, 'KPV Activation - Q2', NULL,
    '2026-04-01T10:48:36.679Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-02', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1775031095824', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-04-02', 'Free gifts and giveaways for customers at booth events. ເເຈກລູກຄ້າເປີດບັນຊີໃຫມ່ ເເລະ ຊື້ຄຳຫນ້າບູດ', '2026-04-01T08:11:29.309Z', NULL, 'KPV Activation - Q2', NULL,
    '2026-04-01T10:48:57.282Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-02', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1775100401216', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-04-01', 'resubmit', '2026-04-02T03:26:37.832Z', 'ສຳລັບ ໄຕມາດ2', NULL, NULL,
    '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-01', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1775528099100', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-04-07', 'For Q1 Booth activation by agency', '2026-04-07T02:14:57.135Z', NULL, NULL, NULL,
    '2026-04-20T09:52:15.946Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-07', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1775633130238', 'finalized', 'cs@easygold.com', 'Customer Service', 'CS',
    '2026-04-08', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', '2026-04-08T07:25:25.225Z', 'ໄດ້ເອົາເຄື່ອງຕົວຈິ່ງທີ່ມີທັງຫມົດ 70ກ້ານໃຫ້ເເລີຍ', NULL, NULL,
    '2026-04-20T09:52:32.696Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-08', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776670121981', 'finalized', 'cs@easygold.com', 'Customer Service', 'CS',
    '2026-04-10', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', '2026-04-20T07:28:41.712Z', NULL, NULL, NULL,
    '2026-04-21T08:22:30.059Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-10', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776671610636', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-04-20', 'ເບິກໃຫ້ທີມງານການຕະຫລາດ, ພາດເນີຊີບ ແລະ ໂດ້ (ພະນັກງານເກົ່າ)', '2026-04-20T07:53:29.444Z', NULL, NULL, NULL,
    '2026-04-21T08:22:44.252Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-20', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776671656947', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-04-20', 'ເບິກໃຫ້ທີມງານອາເຈັນຊີ້ ອອກບູສ', '2026-04-20T07:54:15.631Z', NULL, NULL, NULL,
    '2026-04-21T08:23:00.975Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-20', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776756480752', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-04-20', 'ຊັບມິດຄືນ ເພຶ່ອຊັບພອດເຄມເປນ LNY', '2026-04-21T07:27:59.520Z', NULL, NULL, NULL,
    '2026-04-21T08:23:19.410Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-20', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776829073779', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-04-22', 'Free gifts and giveaways for customers at booth events.ເຄື່ອງເເຈກໃຫ້ລູກຄ້າຫນ້າບູດສາຂາວັງທອງ', '2026-04-22T03:37:52.310Z', 'ເພີ້ມເຕີມມີ: ແນວຕັ້ງໂທລະສັບ 10ອັນ ຫົວສາກ 10 ອັນ', NULL, NULL,
    '2026-04-23T08:51:44.120Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-22', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776927415197', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-04-22', 'Free gifts and giveaways for customers at booth events. ເເຈກໃຫ້ກັບລູກຄ້າຫນ້າບູດສາຂາວັງທອງ', '2026-04-23T06:56:53.725Z', 'ເມເບິກໄປຊັບພອດບູສ ຫນ້າຮ້ານຄຳພູວົງ', NULL, NULL,
    '2026-04-23T08:52:05.096Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-22', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776927769965', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-04-22', 'ເບິກເຄື່ອງໃຫ້ອາເຈັນຊີ້ປະຈຳເດືອນ 5 ແລະ ເບິກໃຊ້ຊັບພອດງານ ອີເວັ້ນ StartUp 2026', '2026-04-23T07:02:48.592Z', 'ຫມາຍເຫດ: ຄັນຮົ່ມກອຟ ເບິກໄປງານແລ້ວ, ແຕ່ບໍ່ທັນໄດ້ແຈກ ລໍຖ້າຜອລູ່ໃຫ້ຄຳເຫັນ', NULL, NULL,
    '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-22', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1776999501965', 'finalized', 'souk07025@gmail.com', 'Souk', 'Admin',
    '2026-04-23', 'ຍື່ມມາໃຫ້ລຸງຍາມ ,ອ້າຍນ້ອງຕຳຫຼວດ', '2026-04-24T02:58:18.483Z', 'ສຸກ, ໄດ້ໄປເບິກເອົາຢູ່ສາງເອງ ວັນທີ່ 23.04.2026 ຕອນເລິກວຽກ', NULL, NULL,
    '2026-04-28T07:43:34.377Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-23', 'borrow', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1777276449750', 'finalized', 'cs@easygold.com', 'Customer Service', 'CS',
    '2026-04-27', 'ເບີດເຄື່ອງໄວ້ສາງຊັ້ນ 6', '2026-04-27T07:54:09.423Z', NULL, NULL, NULL,
    '2026-04-28T07:45:30.211Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-27', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1777348190787', 'finalized', 'cs@easygold.com', 'Customer Service', 'CS',
    '2026-04-28', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', '2026-04-28T03:49:49.600Z', 'ບິກແມ່ນມີ4ກັບ,  ກັບລະ 50ກ້ານ', NULL, NULL,
    '2026-04-28T07:46:05.699Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-28', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1777355053398', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-04-28', 'BTL ເບີກເຄື່ອງອອກບູດປະຈຳຫນ້າຮ້ານ 3ສາຂາ ເເລະ ເຄື່ອງເເຈກໃຫ້ບູດກິດຈະກຳຂອງທາງD-Day Agency', '2026-04-28T05:44:11.757Z', NULL, NULL, NULL,
    '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-04-28', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778045180113', 'finalized', 'cs@easygold.com', 'Customer Service', 'CS',
    '2026-05-05', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', '2026-05-06T05:26:18.534Z', NULL, NULL, NULL,
    '2026-05-12T04:33:22.044Z', 'Alouny', 'Approved', NULL,
    '2026-05-05', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778230741215', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-05-08', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ6', '2026-05-08T08:58:59.313Z', NULL, NULL, NULL,
    '2026-05-12T04:32:43.628Z', 'Alouny', 'Approved', NULL,
    '2026-05-08', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778467898610', 'finalized', 'souk07025@gmail.com', 'Souk', 'Admin',
    '2026-05-11', 'ເບີກໃຫ້ກອງເລຂາ ຕອ້ນຮັບແຂກທາງຫ້ອງການ KPV', '2026-05-11T02:51:34.125Z', 'ຕາດຳພາເລຂາຫົວຫນ້າໄປຂົນເອົາເຄື່ອງຢູ່ສາງ', NULL, NULL,
    '2026-05-12T04:34:47.745Z', 'Alouny', 'Approved', NULL,
    '2026-11-05', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778469681143', 'finalized', 'souk07025@gmail.com', 'Souk', 'Admin',
    '2026-05-11', 'ໄວຮັບແຂກ ຜູ້ອຳນວຍການ', '2026-05-11T03:21:13.404Z', 'ສຸກ, ເບິກເອົາຊຸດຈອກກາເຟວ່າໄວ້ສາງຊັ້ນ 6 ເພື່ອໄວ້ຮັບແຂກ ແລະ ເພື່ອໄວ້ແຈກ  ເບິກງວດທີ່ສອງ', NULL, NULL,
    '2026-05-12T04:34:31.614Z', 'Alouny', 'Approved', NULL,
    '2026-11-05', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778559259749', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-05-08', 'ເບີກເຄື່ອງໄວ້ໄຫ້ລູກຄ້າແລກ easy point', '2026-05-12T04:14:18.498Z', 'ໂຕນີ້, ແມ່ນເບິກໃຫ້ ທີມ CX ພິເສດ', NULL, NULL,
    '2026-05-13T03:55:04.392Z', 'Alouny', 'Approved', NULL,
    '2026-05-08', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778647133017', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-05-13', 'ເບີກເຄື່ອງໄວ້ໄຫ້ລູກຄ້າແລກ easy point', '2026-05-13T04:38:51.479Z', NULL, NULL, NULL,
    '2026-05-15T02:06:32.185Z', 'Alouny', 'Approved', NULL,
    '2026-05-13', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778727782508', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT',
    '2026-05-14', 'BTL', '2026-05-14T03:02:56.294Z', '*ຊຸດພິນ້ຽມ ເບິກມາງານ MOU x10  ເຫລືອນັ້ນແມ່ນເບິກມາໄວ້ໃຫ້ອາເຈັນຊີ້ອອກງານຊ່ວງເດືອນ 6', NULL, NULL,
    '2026-05-19T04:13:32.849Z', 'Alouny', 'Approved', NULL,
    '2026-05-14', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1778827318176', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-05-15', 'ເບີກເຄຶ່ອງແຄມເປນ Cashback', '2026-05-15T06:41:57.350Z', 'Resubmitte ເພາະທຳອິດຫລົງຊັບມິດເປັນເບິກເຄື່ອງຢືມ', NULL, NULL,
    '2026-05-19T04:13:48.618Z', 'Alouny', 'Approved', NULL,
    '2026-05-15', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1779178137478', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-05-18', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ6 ໄວ້ໄຫ້ລູກຄ້າ easy point', '2026-05-19T08:08:53.908Z', NULL, NULL, NULL,
    '2026-05-26T03:11:45.043Z', 'Alouny', 'Approved', NULL,
    '2026-05-18', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1779336387407', 'finalized', 'annasorsukun@gmail.com', 'Anna', 'HR',
    '2026-05-27', 'Join Wii fair - Walk in interview event', '2026-05-21T04:06:27.095Z', 'HR ເບິກໄປຊັບພອດງານ 108job', NULL, NULL,
    '2026-05-26T03:12:23.734Z', 'Alouny', 'Approved', NULL,
    '2026-05-27', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1779437242667', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-05-21', 'ເບີກໄວ້ໃສ່ເຄື່ອງໄຫ້ລູກຄ້າ', '2026-05-22T08:07:21.414Z', 'CX ເບິກໄວ້ໃສ່ເຄື່ອງໃຫ້ລູກຄ້າ', NULL, NULL,
    '2026-05-26T03:11:17.051Z', 'Alouny', 'Approved', NULL,
    '2026-05-21', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1779776573671', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-05-25', 'ເບີກເຄື່ອງໄຫ້ລູກຄ້າ ແລກ easy point', '2026-05-26T06:22:58.274Z', NULL, NULL, NULL,
    '2026-06-19T04:21:55.114Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-05-25', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1779876975030', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-05-27', 'ເບີກເຄື່ອງໄຫ້ລູກຄ້າ ແລກ ອີຊີພ້ອຍ', '2026-05-27T10:16:12.784Z', 'ເອື້ອຍປູນາ ເອົາໃຫ້ 80ອັນ ຕໍ່ມາ ອ້າຍຕາດຳເອົາເພີ້ມໃຫ້ອີກ 50ອັນ', NULL, NULL,
    '2026-06-19T04:22:11.430Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-05-27', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1779880791871', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-05-27', 'Campaign Lao Viet Bank ແຈກກະເປົ໋າ 10 ຫນ່ວຍ', '2026-05-27T11:19:49.594Z', NULL, NULL, NULL,
    '2026-06-19T04:22:28.876Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-05-27', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1779956511825', 'returned', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-05-28', 'CDD at Suan Pruek Sa for CSR', '2026-05-28T08:21:50.509Z', NULL, NULL, NULL,
    '2026-06-23T03:06:25.921Z', 'Sompartthana Bouphavong', 'Returned', 'Partial return processed by warehouse',
    '2026-05-28', 'borrow', '2026-06-01'
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1780305786573', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-06-04', 'Support Children''s day campaign', '2026-06-01T09:23:05.490Z', NULL, NULL, NULL,
    '2026-06-19T04:23:08.414Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-04', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1780308974303', 'finalized', 'somparthana.bpv@gmail.com', 'Sompartthana Bouphavong', 'BTL',
    '2026-06-01', 'ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ', '2026-06-01T10:16:11.982Z', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ', NULL, NULL,
    '2026-06-19T04:23:19.610Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-01', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1780539510415', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-06-04', 'ເບີກອອກງານສຳມະນາ, ເອຊີລີດາ 5/6/2026', '2026-06-04T02:18:27.932Z', 'ແລະ ກະເປົາກີລາ 5 ນ່ວຍ, ເຊິ່ງໂຕນີ້ຈະຊັບມິດອອກຕາມຫລັງ', NULL, NULL,
    '2026-06-19T04:23:27.984Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-04', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1781075113062', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-06-10', 'ເບີກໃຫ້ອາເຈນຊີ່', '2026-06-10T07:05:10.372Z', NULL, NULL, NULL,
    '2026-06-19T04:23:37.735Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-10', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1781083706105', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-06-09', 'Giveaway for testimonial video shooting', '2026-06-10T09:28:24.496Z', NULL, NULL, NULL,
    '2026-06-19T04:23:46.764Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-09', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1781773158812', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-06-18', 'giveaway to mae loma for testimonial and olay for pride month campaign review', '2026-06-18T08:59:15.446Z', NULL, NULL, NULL,
    '2026-07-02T02:33:16.375Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-18', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1781775750887', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'MKT and CS',
    '2026-06-18', 'ເບີກໃຫ້ກັບທາງ ທີມງານເອເຈນຊີ ໃນການເຮັດກິດຈະກຳການຕະຫລາດຫນ້າບູດ', '2026-06-18T09:42:30.994Z', 'ທີມອາເຈັນຊີ້ເບິກເພີ້ມ, ເນື່ອງຈາກໄດ້ຖານລູກຄ້າເພີ້ມຂຶ້ນ', NULL, NULL,
    '2026-07-02T02:33:31.723Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-18', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1781776422307', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-06-29', 'ກະເປົ໋າສຳລັບແຄມເປນ Pride Month', '2026-06-18T09:53:43.481Z', NULL, NULL, NULL,
    '2026-06-19T04:24:00.506Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-29', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1781776426981', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'MKT and CS',
    '2026-06-18', 'ເບີກໃຫ້ກັບທາງ ທີມເອເຈນຊີ 20, ATL 5 ເເລະ ອອກບູດຫນ້າຮ້ານ5', '2026-06-18T09:53:47.422Z', 'ບ໋ອດ ຊັບມິດເບິກແຍກຕ່າງຫາກແລ້ວ 2 ນ່ວຍ', NULL, NULL,
    '2026-07-02T02:33:45.768Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-18', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1782183777297', 'finalized', 'cs@easygold.com', 'Customer Service', 'MKT and CS',
    '2026-06-23', 'ເບິກເຄື່ອງໄວ້ສາງຊັ້ນ 6', '2026-06-23T03:02:56.033Z', 'CX ເບິກມາໄວ້ເພື່ອແຈກໃຫ້ລູກຄ້າຊ່ວງທ້າຍປີ', NULL, NULL,
    '2026-07-02T02:34:02.088Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-23', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1782703189783', 'finalized', 'annasorsukun@gmail.com', 'Anna', 'HR',
    '2026-06-29', 'ແພມ ມາລິສາ ຂໍເບີກຂອງຝາກໃຫ້ທາງກະຊວງ', '2026-06-29T03:19:48.444Z', NULL, NULL, NULL,
    '2026-07-02T02:34:11.828Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-29', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1782801962258', 'finalized', 'malisa.pam1999@gmail.com', 'Nuni', 'PA',
    '2026-06-30', 'ເບີກໃຫ້ຫົວໜ້າ', '2026-06-30T06:45:59.677Z', NULL, NULL, NULL,
    '2026-07-02T02:34:25.060Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-06-30', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1783305053069', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-07-06', 'ເບີກເຄຶ່ອງອອກບູ໊ດໜ້າຮ້ານຄຳ', '2026-07-06T02:30:49.820Z', NULL, NULL, 'Approved',
    '2026-07-14T02:58:23.294Z', 'Souliphonh Phengxay', 'Approved', 'Approved',
    '2026-07-06', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1783319725593', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-07-06', 'ເບີກເຄື່ອງໃຫ້ ອາເຈນຊີ່ ປະຈຳເດືອນ7', '2026-07-06T06:35:21.498Z', NULL, NULL, 'Approved',
    '2026-07-14T02:58:02.309Z', 'Souliphonh Phengxay', 'Approved', 'Approved',
    '2026-07-06', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1783482332278', 'finalized', 'malisa.pam1999@gmail.com', 'Nuni', 'PA',
    '2026-08-07', 'ເອົາໄປໃຫ້ຜູ້ວ່າ ທະນາຄານກາງ', '2026-07-08T03:45:30.733Z', NULL, NULL, 'Approved',
    '2026-07-14T02:57:37.530Z', 'Souliphonh Phengxay', 'Approved', 'Approved',
    '2026-07-08', 'request', '2026-07-08'
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1783665317672', 'finalized', 'malisa.pam1999@gmail.com', 'Nuni', 'PA',
    '2026-07-10', 'ເບີກໃຫ້ຫົວໜ້າ ເອົາໄປວັດໄຕ', '2026-07-10T06:35:16.537Z', NULL, NULL, 'Approved',
    '2026-07-14T02:57:17.140Z', 'Souliphonh Phengxay', 'Approved', 'Approved',
    '2026-07-10', 'request', '2026-07-10'
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1784194879118', 'finalized', 'baybiethammavong@gmail.com', 'Babie', 'Customer Service',
    '2026-07-16', 'ເບີກໄວ້ໃສ່ເຄື່ອງໄຫ້ລູກຄ້າ', '2026-07-16T09:41:17.912Z', NULL, NULL, NULL,
    '2026-07-21T09:30:05.556Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-07-16', 'cs_transfer', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1784196482428', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'MKT and CS',
    '2026-07-16', 'ເບີກໄວ້ໃສ່ເຄື່ອງຕ່າງໆໃຫ້ກັບລູກຄ້າຫນ້າບູດເເລະງານນອກອື່ນໆ', '2026-07-16T10:08:01.205Z', NULL, NULL, NULL,
    '2026-07-21T09:30:24.560Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-07-16', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1785124833384', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-07-27', 'ເບີກເຄື່ອງໃຫ້ ອາເຈນຊີ່', '2026-07-27T04:00:29.053Z', 'ຫົວສາກໂທລະສັບ ຕາດຳໄປເບິກມາກ່ອນ 15ອັນ,  ປູນາ ໄປເບິກເພີ້ມອີກ 35ອັນ', NULL, 'Approved',
    '2026-08-11T08:21:57.113Z', 'Souliphonh Phengxay', 'Approved', 'Approved',
    '2026-07-27', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1785319376214', 'finalized', 'annasorsukun@gmail.com', 'Anna', 'HR',
    '2026-07-29', 'ເພື່ອໃຫ້ກັບພະນັກງານເຂົ້າໃຫມ່ ແລະ ລາງວັນພະນັກງານດີເດັ່ນ ຂອງຝ່າຍບຸກຄະລາກອນ', '2026-07-29T10:02:54.450Z', NULL, NULL, NULL,
    '2026-08-11T08:22:58.363Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-07-29', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1785380476796', 'recalled', 'malisa.pam1999@gmail.com', 'Nuni', 'PA',
    '2026-07-30', 'ຂໍເບີກໄວ້ໃຫ້ແຂກ', '2026-07-30T03:01:14.603Z', NULL, NULL, NULL,
    '2026-07-30T06:07:58.065Z', 'Nuni', 'Recalled', 'Ticket recalled by creator',
    NULL, 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1785723806693', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-08-03', 'Campaign ລົງທະບຽນຟຣີ ລຸ້ນຮັບຈອກກາເຟ 50 ລາງວັນ (ອີກ 10  ຫນ່ວຍ ແມ່ນຈາກເບື້ອງແຄມເປນ)', '2026-08-03T02:23:24.942Z', NULL, NULL, NULL,
    '2026-08-11T08:23:12.833Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-03', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1785906517147', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-08-05', 'ເບີກເຄຶ່ອງເເຈກໃຫ້ກັບທີມງານເອເຈນຊີໃນການອອກບູດກິດຈະກຳທາງການຕະຫລາດ', '2026-08-05T05:08:30.351Z', NULL, NULL, NULL,
    '2026-08-11T08:23:35.437Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-05', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1785906687323', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-08-05', 'ເບີກເຄຶ່ອງເເຈກໃຫ້ກັບທີມງານເອເຈນຊີໃນການອອກບູດກິດຈະກຳທາງການຕະຫລາດ', '2026-08-05T05:11:24.147Z', NULL, NULL, NULL,
    '2026-08-11T08:23:46.858Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-05', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1786010348459', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-08-06', 'ໃສ່ກະເປົ໋າແຄມເປນ Artist (If and ART)', '2026-08-06T09:59:07.531Z', 'ເອົາມາໄວ້ໃຊ້ ຮ່ວມກັນ ທີມ IMC & GC', NULL, NULL,
    '2026-08-11T08:24:00.039Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-06', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1786012380968', 'finalized', 'baybiethammavong@gmail.com', 'Babie', 'Customer Service',
    '2026-08-06', 'ເບີກໄວ້ໃສ່ຄໍາໄຫ້ລູກຄ້າ', '2026-08-06T10:32:59.353Z', NULL, NULL, NULL,
    '2026-08-11T08:24:13.515Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-06', 'cs_transfer', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1786081639947', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-08-07', 'ເບີກເຄື່ອງໃຫ້ທີມງານ ຄຳພູວົງ', '2026-08-07T05:47:15.722Z', 'ຊັບພອດງານ ເທດສະການແຕ່ງດອງ', NULL, NULL,
    '2026-08-11T08:24:30.967Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-07', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1786414419486', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-08-17', 'For Hero campaign', '2026-08-11T02:13:40.010Z', NULL, NULL, NULL,
    '2026-08-20T07:40:08.819Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-17', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1786414757351', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-09-01', 'Support campaign ງານເທດສະການຄຳ', '2026-08-11T02:19:17.508Z', NULL, NULL, NULL,
    '2026-08-20T07:39:57.626Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-09-01', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1786438940716', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-08-11', 'ເບີກໃຫ້ທີມ ຄຳພູວົງ', '2026-08-11T09:02:19.503Z', NULL, NULL, NULL,
    '2026-08-20T07:39:48.254Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-11', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1786439385448', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-08-11', 'ເບີກເຄື່ອງມາໄວ້ຊັ້ນ4 ໄວ້ອອກບູ໊ດ', '2026-08-11T09:09:44.100Z', NULL, NULL, NULL,
    '2026-08-20T07:39:38.122Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-11', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1787027487933', 'finalized', 'annasorsukun@gmail.com', 'Anna', 'HR',
    '2026-08-19', 'ໃສ່ເຂົ້າຮ່ວມງານບູດເປີດບູດຮັບໃບປະກາດທີ່ວິທະຍາໄລເຕັກນິກລາວເຢຍລະມັນ', '2026-08-18T04:31:27.051Z', 'ຈອກກາເຟ ໃຫ້ບໍ່ໄດ້', NULL, NULL,
    '2026-08-20T07:39:23.786Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-19', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1787028406085', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'MKT and CS',
    '2026-08-18', 'ເບີກໃຫ້ກັບທີມໄວ້ໃສ່ເຄື່ອງໃຫ້ກັບລູກຄ້າ', '2026-08-18T04:46:49.512Z', NULL, NULL, NULL,
    '2026-08-20T07:38:06.472Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-18', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1787539473267', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-25', 'requesting as a special merch giveaway for the Media Lobby "EASY BUDDY ສະຫາຍຮ່ວມອອມ" throughout the project', '2026-08-24T02:44:31.868Z', NULL, NULL, NULL,
    '2026-08-31T03:10:53.651Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-25', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1787543425737', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-24', 'for the EASY BUDDY project', '2026-08-24T03:50:23.099Z', NULL, NULL, NULL,
    '2026-08-31T03:10:38.694Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-24', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1787814988879', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-27', 'campaign support', '2026-08-27T07:16:27.300Z', NULL, NULL, NULL,
    '2026-08-31T03:10:22.309Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-27', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1787815027847', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-08-27', 'EASY GOLD DCA Challenge Campaign', '2026-08-27T07:17:07.325Z', NULL, NULL, NULL,
    '2026-09-11T03:04:51.710Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-27', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788159864557', 'recalled', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-09-01', 'ເຄຶ່ອງໄວ້ຊັບພອດແຄມເປນຕູ້ຄີບຄຳ ໃນງານເທດສະການຄຳ', '2026-08-31T07:04:18.711Z', NULL, NULL, NULL,
    '2026-08-31T07:05:16.592Z', 'Phonethida Mangala', 'Recalled', 'Ticket recalled by creator',
    NULL, 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788160090372', 'finalized', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-09-01', 'ຊັບພອດແຄມເປນນ ຕູ້ຄີບຄຳໃນງານເທດສະການຄຳ', '2026-08-31T07:08:09.795Z', NULL, NULL, NULL,
    '2026-09-11T03:05:16.240Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-09-01', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788160549227', 'rejected', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-31', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', '2026-08-31T07:15:47.380Z', 'Rejected', NULL, NULL,
    '2026-08-31T08:54:10.052Z', 'Sompartthana Bouphavong', 'Rejected', 'Rejected',
    NULL, 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788160640377', 'rejected', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-31', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', '2026-08-31T07:17:18.586Z', 'Rejected', NULL, NULL,
    '2026-08-31T08:53:20.352Z', 'Sompartthana Bouphavong', 'Rejected', 'Rejected',
    NULL, 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788160731560', 'rejected', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-31', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', '2026-08-31T07:18:49.660Z', 'Rejected', NULL, NULL,
    '2026-08-31T08:54:23.112Z', 'Sompartthana Bouphavong', 'Rejected', 'Rejected',
    NULL, 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788160825032', 'rejected', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-31', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', '2026-08-31T07:20:23.189Z', 'Rejected', NULL, NULL,
    '2026-08-31T08:53:04.634Z', 'Sompartthana Bouphavong', 'Rejected', 'Rejected',
    NULL, 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788166528113', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-31', 'door gift ຂໍເບີກສິນໄປງານສະມາຄົມຄຳ ສຸພັດຕາ 31/08', '2026-08-31T08:55:26.669Z', NULL, NULL, NULL,
    '2026-09-11T03:05:37.774Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-31', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788166702442', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-08-31', 'ເບີກໄປໄວ້ຊັບພອດຫົວໜ້າໃນງານເທດສະການຄຳ 2026', '2026-08-31T08:58:20.807Z', NULL, NULL, NULL,
    '2026-09-11T03:05:55.955Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-08-31', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788230377490', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'MKT and CS',
    '2026-09-01', 'ເບີກໄວ້ເພື່ອກິດຈະກຳເດືອນ9ຂອງທາງອາເຈນຊີ', '2026-09-01T02:39:36.853Z', NULL, NULL, NULL,
    '2026-09-11T03:06:16.139Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-09-01', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788238977053', 'finalized', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'MKT and CS',
    '2026-09-01', 'ອອກບູດຫນ້າ ເເລະ ງານສຳມະນາຂອງຫົວຫນ້າ ສຸລິພົນ', '2026-09-01T05:02:56.238Z', 'ຂາຕັ້ງໂທລະສັບຫມົດແລ້ວ', NULL, NULL,
    '2026-09-11T03:06:42.785Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-09-01', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1788857848869', 'finalized', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-09-08', 'ai lou requested for CEO', '2026-09-08T08:57:25.738Z', NULL, NULL, NULL,
    '2026-09-11T03:06:55.537Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-09-08', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789026485212', 'finalized', 'baybiethammavong@gmail.com', 'Babie', 'Customer Service',
    '2026-09-10', 'ເບີກໄວ້ແຈກລູກຄ້າ', '2026-09-10T07:48:03.367Z', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ', NULL, NULL,
    '2026-09-10T08:52:05.388Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-09-10', 'cs_transfer', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789026815202', 'finalized', 'baybiethammavong@gmail.com', 'Babie', 'Customer Service',
    '2026-09-10', 'ໄວ້ໃສ່ຄໍາໄຫ້ລູກຄ້າ', '2026-09-10T07:53:24.213Z', NULL, NULL, NULL,
    '2026-09-11T03:07:14.151Z', 'Souliphonh Phengxay', 'Approved', NULL,
    '2026-09-10', 'cs_transfer', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789628317751', 'reviewed', 'sout2017@gmail.com', 'Soudsada Keovongphet', 'BTL',
    '2026-09-17', 'ເບີກອອກມາໄວ້ຊັ້ນ4', '2026-09-17T06:58:34.798Z', NULL, NULL, NULL,
    '2026-09-21T02:03:12.820Z', 'Sompartthana Bouphavong', 'Moved', NULL,
    '2026-09-17', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789722999551', 'recalled', 'annasorsukun@gmail.com', 'Anna', 'HR',
    '2026-09-22', 'ກະເປົາເດີນທາງແມ່ນຍືມມາໃຊ້ໃນງານ ແລະ ສົ່ງຄືນ', '2026-09-18T09:16:39.330Z', NULL, NULL, NULL,
    '2026-09-18T09:17:18.297Z', 'Anna', 'Recalled', 'Ticket recalled by creator',
    NULL, 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789723529412', 'reviewed', 'annasorsukun@gmail.com', 'Anna', 'HR',
    '2026-09-22', 'ເຂົ້າຮ່ວມເປີດບູດງານ Wii fair ຢູ່ທີໂຮງແຮມລາດຊະວົງ ແລະ ສໍາລັບກະເປົາແມ່ຍືມໃຊ້ພາຍນາຍງານ ຖ້າງານແລ້ວແມ່ນສົ່ງຄືນ', '2026-09-18T09:25:29.039Z', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້', NULL, NULL,
    '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'Moved', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້',
    '2026-09-22', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789955493838', 'reviewed', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-09-21', 'for influencer giveaway limited merch (Catdy, toto insixiengmai, johnny muan, lae ek 2 khn)', '2026-09-21T01:51:32.453Z', NULL, NULL, NULL,
    '2026-09-21T02:05:39.499Z', 'Sompartthana Bouphavong', 'Moved', NULL,
    '2026-09-21', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789955811034', 'reviewed', 'thavatxay94@gmail.com', 'Thavutxai Inthavongsa', 'MKT and CS',
    '2026-09-21', 'ເບີກເພື່ອຂໍສົ່ງໃຫ້ influ (ຍັງເຫຼືອ 5 ເປັນ 15)', '2026-09-21T01:56:49.765Z', NULL, NULL, NULL,
    '2026-09-21T02:05:50.069Z', 'Sompartthana Bouphavong', 'Moved', NULL,
    '2026-09-21', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789956108694', 'reviewed', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-09-21', 'Tumblr Snae ສຳລັບ Artist Campaign', '2026-09-21T02:01:48.473Z', NULL, NULL, NULL,
    '2026-09-21T02:06:00.528Z', 'Sompartthana Bouphavong', 'Moved', NULL,
    '2026-09-21', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1789956137762', 'reviewed', 'phonethida.easygold@gmail.com', 'Phonethida Mangala', 'MKT and CS',
    '2026-09-25', 'Tumblr Snae ສຳລັບ Artist Campaign', '2026-09-21T02:02:17.607Z', NULL, NULL, NULL,
    '2026-09-24T02:59:50.360Z', 'Sompartthana Bouphavong', 'Moved', NULL,
    '2026-09-25', 'request', NULL
  );
insert into public.tickets (
    id, status, created_by, created_by_name, department, delivery_date, remark, created_at,
    wh_comment, lm_comment, director_comment, last_action_at, last_action_by,
    last_action_status, last_action_comment, actual_delivery_date, type, return_date
  ) values (
    'TKT-1790219577932', 'pending', 'ketmany.kks@gmail.com', 'Ketmany', 'MKT',
    '2026-09-24', 'ຈອກຂອງຫົວໜ້າ, artist ແລະ Influencer, ກ່ອງຂອງຂັວນສໍາລັບ influencer, ຄັນຮົ່ມສໍາລັບ  artist, ຫົວໜ້າ ແລະ Influencer', '2026-09-24T03:12:55.005Z', NULL, NULL, NULL,
    '2026-09-24T03:12:55.005Z', 'Ketmany', 'Pending', 'ຈອກຂອງຫົວໜ້າ, artist ແລະ Influencer, ກ່ອງຂອງຂັວນສໍາລັບ influencer, ຄັນຮົ່ມສໍາລັບ  artist, ຫົວໜ້າ ແລະ Influencer',
    NULL, 'request', NULL
  );

-- ── Step 8: Ticket Items ──
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1771577788359', 'sku-1771407061986', 'ຈອກກາເເຟ', 80, 80, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1771577788359', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 41, 41, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1772507237246', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 1, 1, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1772507237246', 'sku-1771407004896', 'ພວງກະເເຈ', 2, 2, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1772507237246', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 1, 1, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1772507237246', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 2, 2, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1772592110294', 'sku-1771407061986', 'ຈອກກາເເຟ', 10, 20, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1773299387291', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 10, 10, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1773299387291', 'sku-1773299233699', 'A4 Brochure', 1000, 1000, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1773652078809', 'sku-1771407061986', 'ຈອກກາເເຟ', 30, 30, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1773722800507', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 5, 5, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1773723473614', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 10, 10, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1774339252579', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 40, 40, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1774431236031', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 500, 500, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1774431236031', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 200, 200, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1774431236031', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 100, 100, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1774519787325', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 10, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1774519858761', 'sku-1772007048630', 'ໂຕະຂາວ (ແບບພັບ) W180 x H75 x L60cm', 1, 1, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775030802941', 'sku-1771407061986', 'ຈອກກາເເຟ', 20, 20, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775030802941', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 5, 5, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775030802941', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 5, 5, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775031095824', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775100401216', 'sku-1771407061986', 'ຈອກກາເເຟ', 60, 60, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775100401216', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 300, 300, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775100401216', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 160, 160, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775100401216', 'sku-1773299233699', 'A4 Brochure', 1200, 1200, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775100401216', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 30, 30, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775100401216', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 30, 30, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775528099100', 'sku-1775456004647', 'ກະເປົາກິລາ', 30, 30, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1775633130238', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 50, 70, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776670121981', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776671610636', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776671610636', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 5, 5, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776671610636', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776671656947', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776756480752', 'sku-1776756364541', 'ຖົງກັນນ້ຳ', 770, 770, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776829073779', 'sku-1771407061986', 'ຈອກກາເເຟ', 20, 20, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776829073779', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 5, 5, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776829073779', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927415197', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927415197', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 100, 100, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1771407936514', 'ຄັນຮົ່ມກ໊ອບ', 48, 47, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 4, 4, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1775456004647', 'ກະເປົາກິລາ', 1, 1, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776927769965', 'sku-1771407061986', 'ຈອກກາເເຟ', 80, 80, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1776999501965', 'sku-1776929481221', 'ພັດລົມໄອນ້ຳ', 2, 2, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777276449750', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777348190787', 'sku-1771407061986', 'ຈອກກາເເຟ', 160, 160, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777348190787', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 100, 200, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777355053398', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 14, 14, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777355053398', 'sku-1773299233699', 'A4 Brochure', 400, 400, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777355053398', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 80, 80, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777355053398', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 75, 75, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777355053398', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 300, 300, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777355053398', 'sku-1775456004647', 'ກະເປົາກິລາ', 40, 40, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1777355053398', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 30, 30, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778045180113', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 349, 349, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778045180113', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 25, 25, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778045180113', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 21, 21, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778045180113', 'sku-1771407061986', 'ຈອກກາເເຟ', 100, 100, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778230741215', 'sku-1771407061986', 'ຈອກກາເເຟ', 40, 40, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778230741215', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 65, 65, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778230741215', 'sku-1771407936514', 'ຄັນຮົ່ມກ໊ອບ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778467898610', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 10, 10, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778469681143', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 20, 20, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778559259749', 'sku-1775456004647', 'ກະເປົາກິລາ', 100, 100, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778559259749', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 200, 200, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778559259749', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778647133017', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778727782508', 'sku-1771407061986', 'ຈອກກາເເຟ', 110, 110, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778727782508', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 10, 10, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778727782508', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 20, 20, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778827318176', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1778827318176', 'sku-1771407061986', 'ຈອກກາເເຟ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779178137478', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 55, 55, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779178137478', 'sku-1771407061986', 'ຈອກກາເເຟ', 400, 400, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779178137478', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 25, 25, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779336387407', 'sku-1772179915959', 'ແບັກດອບແບບຜ້າ  230 WxH 200 cm', 1, 1, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779336387407', 'sku-1771407004896', 'ພວງກະເເຈ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779336387407', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779336387407', 'sku-1771407061986', 'ຈອກກາເເຟ', 3, 3, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779336387407', 'sku-1772183613706', 'Beach flag 310x240x60 Cm', 2, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779437242667', 'sku-1779434977945', 'Paper Bag', 70, 70, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779776573671', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 25, 25, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779776573671', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 1, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779776573671', 'sku-1775456004647', 'ກະເປົາກິລາ', 30, 30, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779776573671', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 1, 1, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779776573671', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 7, 7, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779876975030', 'sku-1771407004896', 'ພວງກະເເຈ', 80, 135, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779880791871', 'sku-1775456004647', 'ກະເປົາກິລາ', 10, 10, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1779956511825', 'sku-1773828255894', 'JBL Speaker', 1, 1, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780305786573', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 5, 5, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780308974303', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 19, 19, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780308974303', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 40, 40, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780308974303', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 70, 70, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780308974303', 'sku-1775456004647', 'ກະເປົາກິລາ', 9, 9, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780308974303', 'sku-1771407061986', 'ຈອກກາເເຟ', 104, 104, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780308974303', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 0, 40, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780539510415', 'sku-1771407004896', 'ພວງກະເເຈ', 20, 20, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780539510415', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 5, 15, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780539510415', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 30, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780539510415', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 5, 15, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1780539510415', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 10, 25, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781075113062', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 20, 20, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781075113062', 'sku-1779434977945', 'Paper Bag', 144, 144, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781083706105', 'sku-1779434977945', 'Paper Bag', 11, 11, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781083706105', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 10, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781773158812', 'sku-1781666955837', 'Pride Bag', 2, 2, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781775750887', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 5, 5, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781775750887', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781776422307', 'sku-1781666955837', 'Pride Bag', 70, 70, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1781776426981', 'sku-1781666955837', 'Pride Bag', 30, 28, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1782183777297', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 1500, 1500, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1782183777297', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 200, 200, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1782183777297', 'sku-1780972510074', 'ຈອກເກັບອຸນຫະພູມ 2026', 300, 300, 'ຫນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1782183777297', 'sku-1781681021177', 'ຫມວກ 2026', 500, 500, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1782703189783', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 3, 3, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1782801962258', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 50, 50, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783305053069', 'sku-1775456004647', 'ກະເປົາກິລາ', 10, 10, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783305053069', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783305053069', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 10, 10, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783319725593', 'sku-1771407061986', 'ຈອກກາເເຟ', 15, 15, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783319725593', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 40, 40, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783319725593', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 200, 200, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783319725593', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 25, 25, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783319725593', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 20, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783319725593', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783319725593', 'sku-1779434977945', 'Paper Bag', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783482332278', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 2, 2, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1783665317672', 'sku-1771407061986', 'ຈອກກາເເຟ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1784194879118', 'sku-1779434977945', 'Paper Bag', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1784196482428', 'sku-1779434977945', 'Paper Bag', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785124833384', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 30, 30, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785124833384', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785124833384', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785124833384', 'sku-1775456004647', 'ກະເປົາກິລາ', 50, 40, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785319376214', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785319376214', 'sku-1775456004647', 'ກະເປົາກິລາ', 3, 3, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785319376214', 'sku-1771407004896', 'ພວງກະເເຈ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785380476796', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 20, NULL, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785723806693', 'sku-1771407061986', 'ຈອກກາເເຟ', 40, 40, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785906517147', 'sku-1773299233699', 'A4 Brochure', 1000, 1000, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785906517147', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 200, 200, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785906687323', 'sku-1773299233699', 'A4 Brochure', 1000, 1000, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1785906687323', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 200, 200, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786010348459', 'sku-1785121215788', 'Paper Bag for GOLD', 1, 1, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786010348459', 'sku-1779434977945', 'Paper Bag', 100, 150, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786012380968', 'sku-1785121215788', 'Paper Bag for GOLD', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786081639947', 'sku-1775456004647', 'ກະເປົາກິລາ', 5, 5, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786081639947', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786081639947', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 5, 5, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786081639947', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 5, 5, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414419486', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 20, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414419486', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414419486', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 20, 20, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414419486', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414757351', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 20, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414757351', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414757351', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 10, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786414757351', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786438940716', 'sku-1779434977945', 'Paper Bag', 30, 30, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786439385448', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 5, 5, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786439385448', 'sku-1775456004647', 'ກະເປົາກິລາ', 12, 12, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1786439385448', 'sku-1771407004896', 'ພວງກະເເຈ', 50, 50, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787027487933', 'sku-1771407004896', 'ພວງກະເເຈ', 100, 100, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787027487933', 'sku-1771407061986', 'ຈອກກາເເຟ', 5, NULL, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787027487933', 'sku-1781512257490', 'KPV ໂຕະໄຮໂດຣລິກ', 1, 1, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787027487933', 'sku-1772179915959', 'ແບັກດອບແບບຜ້າ  230 WxH 200 cm', 1, 1, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787027487933', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 5, 5, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787028406085', 'sku-1787027890986', 'ກ່ອງຂອງຂວັນ', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787539473267', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 70, 70, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787543425737', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 10, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787814988879', 'sku-1787714793029', 'Tote Bag If & Art', 110, 110, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787815027847', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787815027847', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 20, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1787815027847', 'sku-1787714793029', 'Tote Bag If & Art', 30, NULL, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788159864557', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, NULL, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788159864557', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 50, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788159864557', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 50, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788159864557', 'sku-1775456004647', 'ກະເປົາກິລາ', 50, NULL, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160090372', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 10, 'set');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160090372', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 20, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160090372', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160090372', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160549227', 'sku-1771407004896', 'ພວງກະເເຈ', 100, NULL, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160640377', 'sku-1773299233699', 'A4 Brochure', 100, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160731560', 'sku-1785121215788', 'Paper Bag for GOLD', 100, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788160825032', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 100, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166528113', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 100, 100, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166528113', 'sku-1771407004896', 'ພວງກະເເຈ', 67, 67, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166528113', 'sku-1773299233699', 'A4 Brochure', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166528113', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166528113', 'sku-1785121215788', 'Paper Bag for GOLD', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166702442', 'sku-1771407061986', 'ຈອກກາເເຟ', 250, 250, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166702442', 'sku-1787715043950', 'Gift set 2026', 100, 100, 'ຊຸດ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788166702442', 'sku-1788146835376', 'Piggy Bank V2', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788230377490', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 100, 100, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788230377490', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 100, 100, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788230377490', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788230377490', 'sku-1775456004647', 'ກະເປົາກິລາ', 10, 10, 'ນ່ວຍ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788230377490', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788238977053', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 8, 8, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788238977053', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1788857848869', 'sku-1788852814387', 'Tumbler x LDB', 2, 2, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789026485212', 'sku-1789008629179', 'ກ່ອງໃສ່ນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ສະລືງ)', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789026485212', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789026485212', 'sku-1789008980374', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 2 ບາດ)', 40, 40, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789026485212', 'sku-1789009038990', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 5 ບາດ)', 40, 40, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789026485212', 'sku-1789009139983', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 10 ບາດ)', 20, 20, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789026815202', 'sku-1785121215788', 'Paper Bag for GOLD', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789628317751', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 12, 12, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789628317751', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 50, 50, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789722999551', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 50, NULL, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789722999551', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 1, NULL, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789722999551', 'sku-1772183613706', 'Beach flag 310x240x60 Cm', 2, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789722999551', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 5, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789722999551', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 5, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789723529412', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 50, 20, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789723529412', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 1, 1, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789723529412', 'sku-1772183613706', 'Beach flag 310x240x60 Cm', 2, 2, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789723529412', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 5, 5, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789723529412', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 3, 3, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789723529412', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 3, 3, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789955493838', 'sku-1779434977945', 'Paper Bag', 25, 25, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789955811034', 'sku-1787027890986', 'ກ່ອງຂອງຂວັນ', 10, 10, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789956108694', 'sku-1788852814387', 'Tumbler x LDB', 35, 35, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1789956137762', 'sku-1788852814387', 'Tumbler x LDB', 15, 15, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1790219577932', 'sku-1788852814387', 'Tumbler x LDB', 20, NULL, 'pcs');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1790219577932', 'sku-1787027890986', 'ກ່ອງຂອງຂວັນ', 10, NULL, 'ອັນ');
insert into public.ticket_items (ticket_id, sku_id, sku_name, qty_requested, qty_approved, unit)
  values ('TKT-1790219577932', 'sku-1790067645670', 'Umbrella X LDB', 4, NULL, 'ອັນ');

-- ── Step 9: Stock Transactions (MKT) ──
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1771577788359', 'sku-1771407061986', NULL, 80, 0, 'deduction', '2026-03-24', '2026-03-24T08:05:19.378Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1771577788359', 'sku-1771407810939', NULL, 41, 0, 'deduction', '2026-03-24', '2026-03-24T08:05:19.378Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1772507237246', 'sku-1771406960024', NULL, 1, 0, 'deduction', '2026-03-24', '2026-03-24T08:05:34.964Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1772507237246', 'sku-1771407004896', NULL, 2, 0, 'deduction', '2026-03-24', '2026-03-24T08:05:34.964Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1772507237246', 'sku-1771407101349', NULL, 1, 0, 'deduction', '2026-03-24', '2026-03-24T08:05:34.964Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1772507237246', 'sku-1771407810939', NULL, 2, 0, 'deduction', '2026-03-24', '2026-03-24T08:05:34.964Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1772592110294', 'sku-1771407061986', NULL, 20, 0, 'deduction', '2026-03-24', '2026-03-24T08:05:52.128Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1773299387291', 'sku-1771407101349', NULL, 10, 0, 'deduction', '2026-03-24', '2026-03-24T08:06:06.664Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1773299387291', 'sku-1773299233699', NULL, 1000, 0, 'deduction', '2026-03-24', '2026-03-24T08:06:06.664Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1773652078809', 'sku-1771407061986', NULL, 30, 0, 'deduction', '2026-03-24', '2026-03-24T08:06:21.012Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1773722800507', 'sku-1771408020353', NULL, 5, 0, 'deduction', '2026-03-24', '2026-03-24T08:06:33.410Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1773723473614', 'sku-1771407101349', NULL, 10, 0, 'deduction', '2026-03-24', '2026-03-24T08:07:06.618Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1774339252579', 'sku-1771407810939', NULL, 40, 0, 'deduction', '2026-03-26', '2026-03-26T01:35:17.102Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1774431236031', 'sku-1771407101349', NULL, 500, 0, 'deduction', '2026-03-27', '2026-03-27T01:36:19.060Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1774431236031', 'sku-1771406960024', NULL, 200, 0, 'deduction', '2026-03-27', '2026-03-27T01:36:19.060Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1774431236031', 'sku-1771407316677', NULL, 100, 0, 'deduction', '2026-03-27', '2026-03-27T01:36:19.060Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1774519787325', 'sku-1771408020353', NULL, 10, 0, 'deduction', '2026-03-27', '2026-03-27T01:36:35.542Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1774519858761', 'sku-1772007048630', NULL, 1, 0, 'deduction', '2026-03-27', '2026-03-27T07:00:08.601Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775030802941', 'sku-1771407061986', NULL, 20, 0, 'deduction', '2026-04-01', '2026-04-01T10:48:36.679Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775030802941', 'sku-1771407101349', NULL, 5, 0, 'deduction', '2026-04-01', '2026-04-01T10:48:36.679Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775030802941', 'sku-1771407810939', NULL, 5, 0, 'deduction', '2026-04-01', '2026-04-01T10:48:36.679Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775031095824', 'sku-1775030698487', NULL, 20, 0, 'deduction', '2026-04-01', '2026-04-01T10:48:57.282Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775100401216', 'sku-1771407061986', NULL, 60, 0, 'deduction', '2026-04-07', '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775100401216', 'sku-1775030698487', NULL, 300, 0, 'deduction', '2026-04-07', '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775100401216', 'sku-1775030479680', NULL, 160, 0, 'deduction', '2026-04-07', '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775100401216', 'sku-1773299233699', NULL, 1200, 0, 'deduction', '2026-04-07', '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775100401216', 'sku-1771407316677', NULL, 30, 0, 'deduction', '2026-04-07', '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775100401216', 'sku-1771407101349', NULL, 30, 0, 'deduction', '2026-04-07', '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775528099100', 'sku-1775456004647', NULL, 30, 0, 'deduction', '2026-04-20', '2026-04-20T09:52:15.946Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1775633130238', 'sku-1771407316677', NULL, 70, 0, 'deduction', '2026-04-20', '2026-04-20T09:52:32.696Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776670121981', 'sku-1771407897767', NULL, 50, 0, 'deduction', '2026-04-21', '2026-04-21T08:22:30.059Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776671610636', 'sku-1775815774049', NULL, 20, 0, 'deduction', '2026-04-21', '2026-04-21T08:22:44.252Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776671610636', 'sku-1774606011601', NULL, 5, 0, 'deduction', '2026-04-21', '2026-04-21T08:22:44.252Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776671610636', 'sku-1775030479680', NULL, 10, 0, 'deduction', '2026-04-21', '2026-04-21T08:22:44.252Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776671656947', 'sku-1775815774049', NULL, 100, 0, 'deduction', '2026-04-21', '2026-04-21T08:23:00.975Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776756480752', 'sku-1776756364541', NULL, 770, 0, 'deduction', '2026-04-21', '2026-04-21T08:23:19.410Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776829073779', 'sku-1771407061986', NULL, 20, 0, 'deduction', '2026-04-23', '2026-04-23T08:51:44.120Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776829073779', 'sku-1771407101349', NULL, 5, 0, 'deduction', '2026-04-23', '2026-04-23T08:51:44.120Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776829073779', 'sku-1775030698487', NULL, 10, 0, 'deduction', '2026-04-23', '2026-04-23T08:51:44.120Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927415197', 'sku-1774606011601', NULL, 10, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:05.096Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927415197', 'sku-1775815774049', NULL, 10, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:05.096Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1771406960024', NULL, 100, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1771407101349', NULL, 50, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1771407936514', NULL, 47, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1771408020353', NULL, 4, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1774606011601', NULL, 20, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1775030698487', NULL, 50, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1775456004647', NULL, 1, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776927769965', 'sku-1771407061986', NULL, 80, 0, 'deduction', '2026-04-23', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1776999501965', 'sku-1776929481221', NULL, 2, 0, 'deduction', '2026-04-28', '2026-04-28T07:43:34.377Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777276449750', 'sku-1771407897767', NULL, 50, 0, 'deduction', '2026-04-28', '2026-04-28T07:45:30.211Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777348190787', 'sku-1771407061986', NULL, 160, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:05.699Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777348190787', 'sku-1771406960024', NULL, 200, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:05.699Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777355053398', 'sku-1771407101349', NULL, 14, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777355053398', 'sku-1773299233699', NULL, 400, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777355053398', 'sku-1775030479680', NULL, 80, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777355053398', 'sku-1774606011601', NULL, 75, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777355053398', 'sku-1775030698487', NULL, 300, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777355053398', 'sku-1775456004647', NULL, 40, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1777355053398', 'sku-1775815774049', NULL, 30, 0, 'deduction', '2026-04-28', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778230741215', 'sku-1771407061986', NULL, 40, 0, 'deduction', '2026-05-12', '2026-05-12T04:32:43.628Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778230741215', 'sku-1771407101349', NULL, 65, 0, 'deduction', '2026-05-12', '2026-05-12T04:32:43.628Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778230741215', 'sku-1771407936514', NULL, 50, 0, 'deduction', '2026-05-12', '2026-05-12T04:32:43.628Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778045180113', 'sku-1771406960024', NULL, 349, 0, 'deduction', '2026-05-12', '2026-05-12T04:33:22.044Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778045180113', 'sku-1771407101349', NULL, 25, 0, 'deduction', '2026-05-12', '2026-05-12T04:33:22.044Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778045180113', 'sku-1771407810939', NULL, 21, 0, 'deduction', '2026-05-12', '2026-05-12T04:33:22.044Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778045180113', 'sku-1771407061986', NULL, 100, 0, 'deduction', '2026-05-12', '2026-05-12T04:33:22.044Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778469681143', 'sku-1771407974256', NULL, 20, 0, 'deduction', '2026-05-12', '2026-05-12T04:34:31.614Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778467898610', 'sku-1771407974256', NULL, 10, 0, 'deduction', '2026-05-12', '2026-05-12T04:34:47.745Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778559259749', 'sku-1775456004647', NULL, 100, 0, 'deduction', '2026-05-13', '2026-05-13T03:55:04.392Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778559259749', 'sku-1775030698487', NULL, 200, 0, 'deduction', '2026-05-13', '2026-05-13T03:55:04.392Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778559259749', 'sku-1775815774049', NULL, 100, 0, 'deduction', '2026-05-13', '2026-05-13T03:55:04.392Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778727782508', 'sku-1771407061986', 'ຈອກກາເເຟ', 110, 0, 'deduction', '2026-05-15', '2026-05-15T02:05:50.241Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778727782508', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 10, 0, 'deduction', '2026-05-15', '2026-05-15T02:05:50.241Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778727782508', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 20, 0, 'deduction', '2026-05-15', '2026-05-15T02:05:50.241Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778647133017', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 50, 0, 'deduction', '2026-05-15', '2026-05-15T02:06:32.185Z', 'Alouny', 'Approved', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778827318176', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 50, 0, 'deduction', '2026-05-15', '2026-05-15T06:44:59.862Z', 'Sompartthana Bouphavong', 'Booked', 'Resubmitte ເພາະທຳອິດຫລົງຊັບມິດເປັນເບິກເຄື່ອງຢືມ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1778827318176', 'sku-1771407061986', 'ຈອກກາເເຟ', 50, 0, 'deduction', '2026-05-15', '2026-05-15T06:44:59.862Z', 'Sompartthana Bouphavong', 'Booked', 'Resubmitte ເພາະທຳອິດຫລົງຊັບມິດເປັນເບິກເຄື່ອງຢືມ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779178137478', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 55, 0, 'deduction', '2026-05-19', '2026-05-19T08:34:09.587Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779178137478', 'sku-1771407061986', 'ຈອກກາເເຟ', 400, 0, 'deduction', '2026-05-19', '2026-05-19T08:34:09.587Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779178137478', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 25, 0, 'deduction', '2026-05-19', '2026-05-19T08:34:09.587Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779336387407', 'sku-1772179915959', 'ແບັກດອບແບບຜ້າ  230 WxH 200 cm', 1, 0, 'deduction', '2026-05-22', '2026-05-22T08:27:53.340Z', 'Sompartthana Bouphavong', 'Booked', 'HR ເບິກໄປຊັບພອດງານ 108job');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779336387407', 'sku-1771407004896', 'ພວງກະເເຈ', 50, 0, 'deduction', '2026-05-22', '2026-05-22T08:27:53.340Z', 'Sompartthana Bouphavong', 'Booked', 'HR ເບິກໄປຊັບພອດງານ 108job');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779336387407', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 20, 0, 'deduction', '2026-05-22', '2026-05-22T08:27:53.340Z', 'Sompartthana Bouphavong', 'Booked', 'HR ເບິກໄປຊັບພອດງານ 108job');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779336387407', 'sku-1771407061986', 'ຈອກກາເເຟ', 3, 0, 'deduction', '2026-05-22', '2026-05-22T08:27:53.340Z', 'Sompartthana Bouphavong', 'Booked', 'HR ເບິກໄປຊັບພອດງານ 108job');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779437242667', 'sku-1779434977945', 'Paper Bag', 70, 0, 'deduction', '2026-05-22', '2026-05-22T08:28:49.497Z', 'Sompartthana Bouphavong', 'Booked', 'CX ເບິກໄວ້ໃສ່ເຄື່ອງໃຫ້ລູກຄ້າ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779776573671', 'sku-1771407101349', 'ຈອກເກັບຄວາມເຢັນ', 25, 0, 'deduction', '2026-05-28', '2026-05-28T09:41:15.944Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779776573671', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 50, 0, 'deduction', '2026-05-28', '2026-05-28T09:41:15.944Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779776573671', 'sku-1775456004647', 'ກະເປົາກິລາ', 30, 0, 'deduction', '2026-05-28', '2026-05-28T09:41:15.944Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779776573671', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 1, 0, 'deduction', '2026-05-28', '2026-05-28T09:41:15.944Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779776573671', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 7, 0, 'deduction', '2026-05-28', '2026-05-28T09:41:15.944Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779876975030', 'sku-1771407004896', 'ພວງກະເເຈ', 135, 0, 'deduction', '2026-05-28', '2026-05-28T09:42:20.551Z', 'Sompartthana Bouphavong', 'Booked', 'ເອື້ອຍປູນາ ເອົາໃຫ້ 80ອັນ ຕໍ່ມາ ອ້າຍຕາດຳເອົາເພີ້ມໃຫ້ອີກ 50ອັນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779880791871', 'sku-1775456004647', 'ກະເປົາກິລາ', 10, 0, 'deduction', '2026-06-01', '2026-06-01T09:16:28.265Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780305786573', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 5, 0, 'deduction', '2026-06-01', '2026-06-01T09:24:09.244Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780308974303', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 19, 0, 'deduction', '2026-06-01', '2026-06-01T10:26:37.118Z', 'Sompartthana Bouphavong', 'Booked', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780308974303', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 40, 0, 'deduction', '2026-06-01', '2026-06-01T10:26:37.118Z', 'Sompartthana Bouphavong', 'Booked', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780308974303', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 70, 0, 'deduction', '2026-06-01', '2026-06-01T10:26:37.118Z', 'Sompartthana Bouphavong', 'Booked', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780308974303', 'sku-1775456004647', 'ກະເປົາກິລາ', 9, 0, 'deduction', '2026-06-01', '2026-06-01T10:26:37.118Z', 'Sompartthana Bouphavong', 'Booked', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780308974303', 'sku-1771407061986', 'ຈອກກາເເຟ', 104, 0, 'deduction', '2026-06-01', '2026-06-01T10:26:37.118Z', 'Sompartthana Bouphavong', 'Booked', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780308974303', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 40, 0, 'deduction', '2026-06-01', '2026-06-01T10:26:37.118Z', 'Sompartthana Bouphavong', 'Booked', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780539510415', 'sku-1771407004896', 'ພວງກະເເຈ', 20, 0, 'deduction', '2026-06-04', '2026-06-04T08:24:53.870Z', 'Sompartthana Bouphavong', 'Booked', 'ແລະ ກະເປົາກີລາ 5 ນ່ວຍ, ເຊິ່ງໂຕນີ້ຈະຊັບມິດອອກຕາມຫລັງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780539510415', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 15, 0, 'deduction', '2026-06-04', '2026-06-04T08:24:53.870Z', 'Sompartthana Bouphavong', 'Booked', 'ແລະ ກະເປົາກີລາ 5 ນ່ວຍ, ເຊິ່ງໂຕນີ້ຈະຊັບມິດອອກຕາມຫລັງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780539510415', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 50, 0, 'deduction', '2026-06-04', '2026-06-04T08:24:53.870Z', 'Sompartthana Bouphavong', 'Booked', 'ແລະ ກະເປົາກີລາ 5 ນ່ວຍ, ເຊິ່ງໂຕນີ້ຈະຊັບມິດອອກຕາມຫລັງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780539510415', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 15, 0, 'deduction', '2026-06-04', '2026-06-04T08:24:53.870Z', 'Sompartthana Bouphavong', 'Booked', 'ແລະ ກະເປົາກີລາ 5 ນ່ວຍ, ເຊິ່ງໂຕນີ້ຈະຊັບມິດອອກຕາມຫລັງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1780539510415', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 25, 0, 'deduction', '2026-06-04', '2026-06-04T08:24:53.870Z', 'Sompartthana Bouphavong', 'Booked', 'ແລະ ກະເປົາກີລາ 5 ນ່ວຍ, ເຊິ່ງໂຕນີ້ຈະຊັບມິດອອກຕາມຫລັງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779956511825', 'sku-1773828255894', 'JBL Speaker', 1, 0, 'deduction', '2026-06-11', '2026-06-11T06:23:22.799Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781075113062', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 20, 0, 'deduction', '2026-06-11', '2026-06-11T06:24:06.838Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781075113062', 'sku-1779434977945', 'ຊຸດຈອກກາເຟ', 144, 0, 'deduction', '2026-06-11', '2026-06-11T06:24:06.838Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781083706105', 'sku-1779434977945', 'Paper Bag', 11, 0, 'deduction', '2026-06-11', '2026-06-11T06:24:23.768Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781083706105', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 0, 'deduction', '2026-06-11', '2026-06-11T06:24:23.768Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771407316677', NULL, 200, 0, 'addition', '2026-03-18', '2026-03-18T06:24:23.768Z', 'Sompartthana Bouphavong', NULL, 'Stock in');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771407101349', NULL, 600, 0, 'addition', '2026-03-24', '2026-03-24T06:24:23.768Z', 'Sompartthana Bouphavong', NULL, 'Stock in');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771407897767', NULL, 50, 0, 'addition', '2026-04-10', '2026-04-10T06:24:23.768Z', 'Sompartthana Bouphavong', NULL, 'Stock in');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771407897767', NULL, 50, 0, 'addition', '2026-04-27', '2026-04-27T06:24:23.768Z', 'Sompartthana Bouphavong', NULL, 'Stock in');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771407316677', NULL, 200, 0, 'addition', '2026-05-10', '2026-05-10T06:24:23.768Z', 'Sompartthana Bouphavong', NULL, 'Stock in');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781776422307', 'sku-1781666955837', 'Pride Bag', 70, 0, 'deduction', '2026-06-18', '2026-06-18T09:58:41.650Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 1500, 0, 'addition', '2026-06-22', NULL, NULL, NULL, 'WLH26006-017');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781773158812', 'sku-1781666955837', 'Pride Bag', 2, 0, 'deduction', '2026-06-22', '2026-06-22T08:52:04.262Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781775750887', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 5, 0, 'deduction', '2026-06-22', '2026-06-22T08:52:46.051Z', 'Sompartthana Bouphavong', 'Booked', 'ທີມອາເຈັນຊີ້ເບິກເພີ້ມ, ເນື່ອງຈາກໄດ້ຖານລູກຄ້າເພີ້ມຂຶ້ນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781775750887', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 100, 0, 'deduction', '2026-06-22', '2026-06-22T08:52:46.051Z', 'Sompartthana Bouphavong', 'Booked', 'ທີມອາເຈັນຊີ້ເບິກເພີ້ມ, ເນື່ອງຈາກໄດ້ຖານລູກຄ້າເພີ້ມຂຶ້ນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1781776426981', 'sku-1781666955837', 'Pride Bag', 28, 0, 'deduction', '2026-06-22', '2026-06-22T08:54:05.170Z', 'Sompartthana Bouphavong', 'Booked', 'ບ໋ອດ ຊັບມິດເບິກແຍກຕ່າງຫາກແລ້ວ 2 ນ່ວຍ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1782183777297', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 1500, 0, 'deduction', '2026-06-23', '2026-06-23T03:05:55.846Z', 'Sompartthana Bouphavong', 'Booked', 'CX ເບິກມາໄວ້ເພື່ອແຈກໃຫ້ລູກຄ້າຊ່ວງທ້າຍປີ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1782183777297', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 200, 0, 'deduction', '2026-06-23', '2026-06-23T03:05:55.846Z', 'Sompartthana Bouphavong', 'Booked', 'CX ເບິກມາໄວ້ເພື່ອແຈກໃຫ້ລູກຄ້າຊ່ວງທ້າຍປີ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1782183777297', 'sku-1780972510074', 'ຈອກເກັບອຸນຫະພູມ 2026', 300, 0, 'deduction', '2026-06-23', '2026-06-23T03:05:55.846Z', 'Sompartthana Bouphavong', 'Booked', 'CX ເບິກມາໄວ້ເພື່ອແຈກໃຫ້ລູກຄ້າຊ່ວງທ້າຍປີ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1782183777297', 'sku-1781681021177', 'ຫມວກ 2026', 500, 0, 'deduction', '2026-06-23', '2026-06-23T03:05:55.846Z', 'Sompartthana Bouphavong', 'Booked', 'CX ເບິກມາໄວ້ເພື່ອແຈກໃຫ້ລູກຄ້າຊ່ວງທ້າຍປີ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779956511825', 'sku-1773828255894', 'JBL Speaker', 1, 0, 'addition', '2026-06-23', '2026-06-23T03:06:17.064Z', 'Sompartthana Bouphavong', 'Returned', 'Partial return processed by warehouse');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1779956511825', 'sku-1773828255894', 'JBL Speaker', 1, 0, 'addition', '2026-06-23', '2026-06-23T03:06:25.921Z', 'Sompartthana Bouphavong', 'Returned', 'Partial return processed by warehouse');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 100, 0, 'addition', '2026-06-25', NULL, NULL, NULL, 'WLH26006-024_24Jun2026');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1782703189783', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 3, 0, 'deduction', '2026-06-29', '2026-06-29T06:02:05.343Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1782801962258', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 50, 0, 'deduction', '2026-06-30', '2026-06-30T06:48:26.611Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783305053069', 'sku-1775456004647', 'ກະເປົາກິລາ', 10, 0, 'deduction', '2026-07-06', '2026-07-06T07:49:42.776Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783305053069', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, 0, 'deduction', '2026-07-06', '2026-07-06T07:49:42.776Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783305053069', 'sku-1771407974256', 'ຊຸດຈອກກາເຟ', 10, 0, 'deduction', '2026-07-06', '2026-07-06T07:49:42.776Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783319725593', 'sku-1771407061986', 'ຈອກກາເເຟ', 15, 0, 'deduction', '2026-07-07', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783319725593', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 40, 0, 'deduction', '2026-07-07', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783319725593', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 200, 0, 'deduction', '2026-07-07', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783319725593', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 25, 0, 'deduction', '2026-07-07', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783319725593', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 0, 'deduction', '2026-07-07', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783319725593', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 20, 0, 'deduction', '2026-07-07', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783319725593', 'sku-1779434977945', 'Paper Bag', 50, 0, 'deduction', '2026-07-07', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783482332278', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 2, 0, 'deduction', '2026-08-07', '2026-08-07T09:22:31.457Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1783665317672', 'sku-1771407061986', 'ຈອກກາເເຟ', 50, 0, 'deduction', '2026-07-10', '2026-07-10T06:45:58.534Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1784196482428', 'sku-1779434977945', 'Paper Bag', 50, 0, 'deduction', '2026-07-16', '2026-07-16T10:08:52.105Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1784194879118', 'sku-1779434977945', 'Paper Bag', 50, 0, 'deduction', '2026-07-16', '2026-07-16T10:09:45.389Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1785120875998', 'A4 Brochure Easy Hub', 3000, 0, 'addition', '2026-07-24', '2026-07-27T02:54:36.644Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1785121215788', 'Paper Bag for GOLD', 5000, 0, 'addition', '2026-07-22', '2026-07-27T03:00:16.625Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785124833384', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 30, 0, 'deduction', '2026-07-28', '2026-07-28T03:00:45.281Z', 'Sompartthana Bouphavong', 'Booked', 'ຫົວສາກໂທລະສັບ ຕາດຳໄປເບິກມາກ່ອນ 15ອັນ,  ປູນາ ໄປເບິກເພີ້ມອີກ 35ອັນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785124833384', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 50, 0, 'deduction', '2026-07-28', '2026-07-28T03:00:45.281Z', 'Sompartthana Bouphavong', 'Booked', 'ຫົວສາກໂທລະສັບ ຕາດຳໄປເບິກມາກ່ອນ 15ອັນ,  ປູນາ ໄປເບິກເພີ້ມອີກ 35ອັນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785124833384', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 50, 0, 'deduction', '2026-07-28', '2026-07-28T03:00:45.281Z', 'Sompartthana Bouphavong', 'Booked', 'ຫົວສາກໂທລະສັບ ຕາດຳໄປເບິກມາກ່ອນ 15ອັນ,  ປູນາ ໄປເບິກເພີ້ມອີກ 35ອັນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785124833384', 'sku-1775456004647', 'ກະເປົາກິລາ', 40, 0, 'deduction', '2026-07-28', '2026-07-28T03:00:45.281Z', 'Sompartthana Bouphavong', 'Booked', 'ຫົວສາກໂທລະສັບ ຕາດຳໄປເບິກມາກ່ອນ 15ອັນ,  ປູນາ ໄປເບິກເພີ້ມອີກ 35ອັນ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785319376214', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 10, 0, 'deduction', '2026-07-30', '2026-07-30T06:01:26.030Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785319376214', 'sku-1775456004647', 'ກະເປົາກິລາ', 3, 0, 'deduction', '2026-07-30', '2026-07-30T06:01:26.030Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785319376214', 'sku-1771407004896', 'ພວງກະເເຈ', 50, 0, 'deduction', '2026-07-30', '2026-07-30T06:01:26.030Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785723806693', 'sku-1771407061986', 'ຈອກກາເເຟ', 40, 0, 'deduction', '2026-08-04', '2026-08-04T02:37:33.372Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785906517147', 'sku-1773299233699', 'A4 Brochure', 1000, 0, 'deduction', '2026-08-06', '2026-08-06T10:05:44.261Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785906517147', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 200, 0, 'deduction', '2026-08-06', '2026-08-06T10:05:44.261Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786010348459', 'sku-1785121215788', 'Paper Bag for GOLD', 1, 0, 'deduction', '2026-08-06', '2026-08-06T10:07:13.202Z', 'Sompartthana Bouphavong', 'Booked', 'ເອົາມາໄວ້ໃຊ້ ຮ່ວມກັນ ທີມ IMC & GC');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786010348459', 'sku-1779434977945', 'Paper Bag', 150, 0, 'deduction', '2026-08-06', '2026-08-06T10:07:13.202Z', 'Sompartthana Bouphavong', 'Booked', 'ເອົາມາໄວ້ໃຊ້ ຮ່ວມກັນ ທີມ IMC & GC');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786010348459', 'sku-1785121215788', 'Paper Bag for GOLD', 1, 0, 'deduction', '2026-08-06', '2026-08-06T10:08:23.418Z', 'Sompartthana Bouphavong', 'Booked', 'ເອົາມາໄວ້ໃຊ້ ຮ່ວມກັນ ທີມ IMC & GC');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786010348459', 'sku-1779434977945', 'Paper Bag', 150, 0, 'deduction', '2026-08-06', '2026-08-06T10:08:23.418Z', 'Sompartthana Bouphavong', 'Booked', 'ເອົາມາໄວ້ໃຊ້ ຮ່ວມກັນ ທີມ IMC & GC');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785906687323', 'sku-1773299233699', 'A4 Brochure', 1000, 0, 'deduction', '2026-08-06', '2026-08-06T10:09:27.026Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1785906687323', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 200, 0, 'deduction', '2026-08-06', '2026-08-06T10:09:27.026Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786012380968', 'sku-1785121215788', 'Paper Bag for GOLD', 50, 0, 'deduction', '2026-08-07', '2026-08-07T02:22:33.736Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786081639947', 'sku-1775456004647', 'ກະເປົາກິລາ', 5, 0, 'deduction', '2026-08-11', '2026-08-11T02:09:45.602Z', 'Sompartthana Bouphavong', 'Booked', 'ຊັບພອດງານ ເທດສະການແຕ່ງດອງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786081639947', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 10, 0, 'deduction', '2026-08-11', '2026-08-11T02:09:45.602Z', 'Sompartthana Bouphavong', 'Booked', 'ຊັບພອດງານ ເທດສະການແຕ່ງດອງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786081639947', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 5, 0, 'deduction', '2026-08-11', '2026-08-11T02:09:45.602Z', 'Sompartthana Bouphavong', 'Booked', 'ຊັບພອດງານ ເທດສະການແຕ່ງດອງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786081639947', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 5, 0, 'deduction', '2026-08-11', '2026-08-11T02:09:45.602Z', 'Sompartthana Bouphavong', 'Booked', 'ຊັບພອດງານ ເທດສະການແຕ່ງດອງ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1787027890986', 'ກ່ອງຂອງຂວັນ', 300, 0, 'addition', '2026-08-18', '2026-08-18T04:38:11.771Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787027487933', 'sku-1771407004896', 'ພວງກະເເຈ', 100, 0, 'deduction', '2026-08-18', '2026-08-18T04:57:21.458Z', 'Sompartthana Bouphavong', 'Booked', 'ຈອກກາເຟ ໃຫ້ບໍ່ໄດ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787027487933', 'sku-1781512257490', 'KPV ໂຕະໄຮໂດຣລິກ', 1, 0, 'deduction', '2026-08-18', '2026-08-18T04:57:21.458Z', 'Sompartthana Bouphavong', 'Booked', 'ຈອກກາເຟ ໃຫ້ບໍ່ໄດ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787027487933', 'sku-1772179915959', 'ແບັກດອບແບບຜ້າ  230 WxH 200 cm', 1, 0, 'deduction', '2026-08-18', '2026-08-18T04:57:21.458Z', 'Sompartthana Bouphavong', 'Booked', 'ຈອກກາເຟ ໃຫ້ບໍ່ໄດ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787027487933', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 5, 0, 'deduction', '2026-08-18', '2026-08-18T04:57:21.458Z', 'Sompartthana Bouphavong', 'Booked', 'ຈອກກາເຟ ໃຫ້ບໍ່ໄດ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786439385448', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 5, 0, 'deduction', '2026-08-18', '2026-08-18T04:57:52.561Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786439385448', 'sku-1775456004647', 'ກະເປົາກິລາ', 12, 0, 'deduction', '2026-08-18', '2026-08-18T04:57:52.561Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786439385448', 'sku-1771407004896', 'ພວງກະເເຈ', 50, 0, 'deduction', '2026-08-18', '2026-08-18T04:57:52.561Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414757351', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 0, 'deduction', '2026-08-18', '2026-08-18T04:58:10.653Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414757351', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 50, 0, 'deduction', '2026-08-18', '2026-08-18T04:58:10.653Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414757351', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 0, 'deduction', '2026-08-18', '2026-08-18T04:58:10.653Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414757351', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 50, 0, 'deduction', '2026-08-18', '2026-08-18T04:58:10.653Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786438940716', 'sku-1779434977945', 'Paper Bag', 30, 0, 'deduction', '2026-08-18', '2026-08-18T04:58:28.648Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414419486', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 0, 'deduction', '2026-08-18', '2026-08-18T04:59:24.753Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414419486', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 20, 0, 'deduction', '2026-08-18', '2026-08-18T04:59:24.753Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414419486', 'sku-1771407810939', 'ກະປຸກອອມສິນ', 20, 0, 'deduction', '2026-08-18', '2026-08-18T04:59:24.753Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1786414419486', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, 0, 'deduction', '2026-08-18', '2026-08-18T04:59:24.753Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787028406085', 'sku-1787027890986', 'ກ່ອງຂອງຂວັນ', 10, 0, 'deduction', '2026-08-19', '2026-08-19T04:23:45.577Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1787714793029', 'Tote Bag If & Art', 110, 0, 'addition', '2026-08-03', '2026-08-26T03:26:33.510Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1787715043950', 'Gift set 2026', 100, 0, 'addition', '2026-08-25', '2026-08-26T03:30:45.081Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1787715049424', 'Gift set 2026', 100, 0, 'addition', '2026-08-25', '2026-08-26T03:30:50.752Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787543425737', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 0, 'deduction', '2026-08-26', '2026-08-26T09:41:06.927Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787539473267', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 70, 0, 'deduction', '2026-08-26', '2026-08-26T09:41:39.544Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787814988879', 'sku-1787714793029', 'Tote Bag If & Art', 110, 0, 'deduction', '2026-08-28', '2026-08-28T04:16:02.622Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1788146835376', 'Piggy Bank V2', 200, 0, 'addition', '2026-08-28', '2026-08-31T03:27:15.972Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787815027847', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 20, 0, 'deduction', '2026-08-31', '2026-08-31T07:08:49.701Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1787815027847', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 0, 'deduction', '2026-08-31', '2026-08-31T07:08:49.701Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 400, 0, 'addition', '2026-08-31', NULL, NULL, NULL, '[MKT_TRANSFER] Return item today to MKT warehouse');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788160090372', 'sku-1771408020353', 'ຊຸດພິນ້ຽມ (ປື້ມ+ຕຸກນ້ຳ+ບິກ)', 10, 0, 'deduction', '2026-08-31', '2026-08-31T08:54:43.452Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788160090372', 'sku-1775456004647', 'ກະເປົາກິລາ', 20, 0, 'deduction', '2026-08-31', '2026-08-31T08:54:43.452Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788160090372', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 50, 0, 'deduction', '2026-08-31', '2026-08-31T08:54:43.452Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788160090372', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 50, 0, 'deduction', '2026-08-31', '2026-08-31T08:54:43.452Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166528113', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 100, 0, 'deduction', '2026-08-31', '2026-08-31T08:58:23.845Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166528113', 'sku-1771407004896', 'ພວງກະເເຈ', 67, 0, 'deduction', '2026-08-31', '2026-08-31T08:58:23.845Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166528113', 'sku-1773299233699', 'A4 Brochure', 100, 0, 'deduction', '2026-08-31', '2026-08-31T08:58:23.845Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166528113', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 100, 0, 'deduction', '2026-08-31', '2026-08-31T08:58:23.845Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166528113', 'sku-1785121215788', 'Paper Bag for GOLD', 100, 0, 'deduction', '2026-08-31', '2026-08-31T08:58:23.845Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1788767052509', 'ຈອກກາເຟ - Reoder', 300, 0, 'addition', '2026-09-07', '2026-09-07T07:44:13.590Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1788852814387', 'Tumbler x LDB', 110, 0, 'addition', '2026-09-07', '2026-09-08T07:33:34.905Z', 'Nopphanai Phomphakdee', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166702442', 'sku-1771407061986', 'ຈອກກາເເຟ', 250, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:10.905Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166702442', 'sku-1787715043950', 'Gift set 2026', 100, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:10.905Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788166702442', 'sku-1788146835376', 'Piggy Bank V2', 100, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:10.905Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788230377490', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 100, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:46.816Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788230377490', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 100, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:46.816Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788230377490', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 10, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:46.816Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788230377490', 'sku-1775456004647', 'ກະເປົາກິລາ', 10, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:46.816Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788230377490', 'sku-1775815774049', 'ຂາຕັ້ງໂທລະສັບ', 20, 0, 'deduction', '2026-09-08', '2026-09-08T08:54:46.816Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788238977053', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 8, 0, 'deduction', '2026-09-08', '2026-09-08T08:56:11.232Z', 'Sompartthana Bouphavong', 'Booked', 'ຂາຕັ້ງໂທລະສັບຫມົດແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1788857848869', 'sku-1788852814387', 'Tumbler x LDB', 2, 0, 'deduction', '2026-09-08', '2026-09-08T09:12:20.165Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1789008629179', 'ກ່ອງໃສ່ນ້ອຍ 1ສະລືງ', 50, 0, 'addition', '2026-09-08', '2026-09-10T02:50:29.873Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 50, 0, 'addition', '2026-09-08', '2026-09-10T02:52:27.585Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1789008980374', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 2 ບາດ)', 40, 0, 'addition', '2026-09-08', '2026-09-10T02:56:20.962Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1789009038990', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 5 ບາດ)', 40, 0, 'addition', '2026-09-08', '2026-09-10T02:57:19.549Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1789009139983', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 10 ບາດ)', 20, 0, 'addition', '2026-09-08', '2026-09-10T02:59:00.640Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789008629179', 'ກ່ອງໃສ່ນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ສະລືງ)', 50, 0, 'deduction', '2026-09-10', '2026-09-10T08:03:42.186Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 50, 0, 'deduction', '2026-09-10', '2026-09-10T08:03:42.186Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789008980374', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 2 ບາດ)', 40, 0, 'deduction', '2026-09-10', '2026-09-10T08:03:42.186Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789009038990', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 5 ບາດ)', 40, 0, 'deduction', '2026-09-10', '2026-09-10T08:03:42.186Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789009139983', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 10 ບາດ)', 20, 0, 'deduction', '2026-09-10', '2026-09-10T08:03:42.186Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789008629179', 'ກ່ອງໃສ່ນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ສະລືງ)', 50, 0, 'deduction', '2026-09-10', '2026-09-10T08:04:31.824Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 50, 0, 'deduction', '2026-09-10', '2026-09-10T08:04:31.824Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789008980374', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 2 ບາດ)', 40, 0, 'deduction', '2026-09-10', '2026-09-10T08:04:31.824Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789009038990', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 5 ບາດ)', 40, 0, 'deduction', '2026-09-10', '2026-09-10T08:04:31.824Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026485212', 'sku-1789009139983', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 10 ບາດ)', 20, 0, 'deduction', '2026-09-10', '2026-09-10T08:04:31.824Z', 'Sompartthana Bouphavong', 'Booked', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789026815202', 'sku-1785121215788', 'Paper Bag for GOLD', 50, 0, 'deduction', '2026-09-10', '2026-09-10T09:01:12.826Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('RESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 50, 0, 'addition', '2026-09-15', NULL, NULL, NULL, '[MKT_TRANSFER] Transfer to MKT');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789628317751', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 12, 0, 'deduction', '2026-09-21', '2026-09-21T02:03:12.820Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789628317751', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 50, 0, 'deduction', '2026-09-21', '2026-09-21T02:03:12.820Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789723529412', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 20, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'Booked', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789723529412', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 1, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'Booked', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789723529412', 'sku-1772183613706', 'Beach flag 310x240x60 Cm', 2, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'Booked', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789723529412', 'sku-1775030698487', 'ສາຍຫ້ອຍຄໍ (ພວງກະແຈ)', 5, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'Booked', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789723529412', 'sku-1774606011601', 'ຫົວສາກໂທລະສັບ', 3, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'Booked', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789723529412', 'sku-1775030479680', 'ສາຍຮັດແຂນ (ກິລາ)', 3, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'Booked', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789955493838', 'sku-1779434977945', 'Paper Bag', 25, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:39.499Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789955811034', 'sku-1787027890986', 'ກ່ອງຂອງຂວັນ', 10, 0, 'deduction', '2026-09-21', '2026-09-21T02:05:50.069Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789956108694', 'sku-1788852814387', 'Tumbler x LDB', 35, 0, 'deduction', '2026-09-21', '2026-09-21T02:06:00.528Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1790067589842', 'Umbrella X LDB', 132, 0, 'addition', '2026-09-22', '2026-09-22T08:59:50.489Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1790067614071', 'Umbrella X LDB', 132, 0, 'addition', '2026-09-22', '2026-09-22T09:00:14.706Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1790067637787', 'Umbrella X LDB', 132, 0, 'addition', '2026-09-22', '2026-09-22T09:00:38.510Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1790067645670', 'Umbrella X LDB', 132, 0, 'addition', '2026-09-22', '2026-09-22T09:00:46.604Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1790067653346', 'Umbrella X LDB', 132, 0, 'addition', '2026-09-22', '2026-09-22T09:00:54.254Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('TKT-1789956137762', 'sku-1788852814387', 'Tumbler x LDB', 15, 0, 'deduction', '2026-09-24', '2026-09-24T02:59:50.360Z', 'Sompartthana Bouphavong', 'Booked', NULL);
insert into public.stock_transactions (ticket_id, sku_id, sku_name, qty, qty_broken, type, date, action_at, action_by, status, comment)
  values ('OPENING', 'sku-1790220235813', 'Gift set Hero', 90, 0, 'addition', '2026-09-24', '2026-09-24T03:23:56.542Z', 'Sompartthana Bouphavong', 'Opening Balance', 'Opening balance on SKU creation');

-- ── Step 10: CS Transactions ──
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 100, 'addition', '2026-07-13', '2026-07-13T03:46:26.360Z', 'Customer Service', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 1500, 'addition', '2026-07-13', '2026-07-13T03:46:30.776Z', 'Customer Service', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1781681021177', 'ຫມວກ 2026', 500, 'addition', '2026-07-13', '2026-07-13T03:46:33.457Z', 'Customer Service', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 200, 'addition', '2026-07-13', '2026-07-13T03:46:35.934Z', 'Customer Service', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1780972510074', 'ຈອກເກັບອຸນຫະພູມ 2026', 300, 'addition', '2026-07-13', '2026-07-13T03:46:40.339Z', 'Customer Service', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1784195239942', 'ກ່ອງຄໍາ 2ບາດ', 5, 'addition', '2026-07-16', '2026-07-16T09:47:20.522Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1784195433787', 'ກ່ອງຄໍາ 2ສະຫລຶງ', 5, 'addition', '2026-07-16', '2026-07-16T09:50:34.239Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1784195489874', 'ກ່ອງຄໍາ 2ບາດ', 5, 'addition', '2026-07-16', '2026-07-16T09:51:30.765Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1784195540861', 'ກ່ອງຄໍາ 10ບາດ', 7, 'addition', '2026-07-16', '2026-07-16T09:52:21.691Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1784195543750', 'ກ່ອງຄໍາ 10ບາດ', 7, 'addition', '2026-07-16', '2026-07-16T09:52:24.456Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1784195595962', 'ກ່ອງຄໍາ5ບາດ', 1, 'addition', '2026-07-16', '2026-07-16T09:53:16.939Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1779434977945', 'Paper Bag', 50, 'addition', '2026-07-21', '2026-07-21T09:30:12.439Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1784194879118');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'CS-SKU-1784195595962', 'ກ່ອງຄໍາ5ບາດ', 1, 'deduction', '2026-07-27', '2026-07-27T06:28:00.558Z', 'Babie', 'ຂາຍໄຫ້ລູກຄ້າ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'CS-SKU-1784195540861', 'ກ່ອງຄໍາ 10ບາດ', 1, 'deduction', '2026-07-27', '2026-07-27T06:28:04.921Z', 'Babie', 'ຂາຍໄຫ້ລູກຄ້າ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 1, 'deduction', '2026-08-08', '2026-08-10T08:18:37.910Z', 'Babie', 'ລຸກຄ້າແລກອີຊີພ້ອຍ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 2, 'deduction', '2026-08-08', '2026-08-10T08:18:43.351Z', 'Babie', 'ລຸກຄ້າແລກອີຊີພ້ອຍ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1781681021177', 'ຫມວກ 2026', 1, 'deduction', '2026-08-08', '2026-08-10T08:18:47.886Z', 'Babie', 'ລຸກຄ້າແລກອີຊີພ້ອຍ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1785121215788', 'Paper Bag for GOLD', 50, 'addition', '2026-08-11', '2026-08-11T08:24:20.652Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1786012380968');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 1, 'deduction', '2026-08-25', '2026-08-25T02:59:52.335Z', 'Saiyfon', 'ແຖມລູກຄ້າ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 400, 'deduction', '2026-08-31', '2026-08-31T08:21:49.677Z', 'Nopphanai Phomphakdee', '[MKT_TRANSFER] Return item today to MKT warehouse');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 100, 'deduction', '2026-09-07', '2026-09-07T07:08:06.579Z', 'Babie', 'ການຕະຫລາດນໍາໄປໃຊ້ຢູ່ເທດສະການຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771407897767', 'ກະເປົາເດີນທາງ', 2, 'deduction', '2026-09-07', '2026-09-07T07:08:11.105Z', 'Babie', 'ການຕະຫລາດນໍາໄປໃຊ້ຢູ່ເທດສະການຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1780972510074', 'ຈອກເກັບອຸນຫະພູມ 2026', 6, 'deduction', '2026-09-07', '2026-09-07T07:08:14.710Z', 'Babie', 'ການຕະຫລາດນໍາໄປໃຊ້ຢູ່ເທດສະການຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789010614312', 'ກ່ອງຄໍາ easy gold 1ກຮາມ', 50, 'addition', '2026-09-10', '2026-09-10T03:23:35.528Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789010613999', 'ກ່ອງຄໍາ easy gold 1ກຮາມ', 50, 'addition', '2026-09-10', '2026-09-10T03:23:35.676Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789010740689', 'ກ່ອງຄໍາ easy gold 1ກຮາມ', 15, 'addition', '2026-09-10', '2026-09-10T03:25:41.492Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789011083031', 'ກ່ອງຄໍາ easy gold 1ກຮາມ', 50, 'addition', '2026-09-10', '2026-09-10T03:31:23.572Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789011179200', 'ກ່ອງຄໍາ easy gold 1ກຮາມ', 50, 'addition', '2026-09-10', '2026-09-10T03:32:59.669Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789011678995', 'ກ່ອງຄໍາ easy gold 1ບາດ', 50, 'addition', '2026-09-10', '2026-09-10T03:41:19.436Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789011681106', 'ກ່ອງຄໍາ easy gold 1ບາດ', 50, 'addition', '2026-09-10', '2026-09-10T03:41:22.554Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'CS-SKU-1789011811847', 'ກ່ອງຄໍາ easy gold 2ບາດ', 40, 'addition', '2026-09-10', '2026-09-10T03:43:32.530Z', 'Babie', 'Opening balance on SKU creation');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1789008629179', 'ກ່ອງໃສ່ນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ສະລືງ)', 50, 'addition', '2026-09-10', '2026-09-10T08:52:14.504Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1789026485212');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 50, 'addition', '2026-09-10', '2026-09-10T08:52:14.504Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1789026485212');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1789008980374', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 2 ບາດ)', 40, 'addition', '2026-09-10', '2026-09-10T08:52:14.504Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1789026485212');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1789009038990', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 5 ບາດ)', 40, 'addition', '2026-09-10', '2026-09-10T08:52:14.504Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1789026485212');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1789009139983', 'ກ່ອງຄຳໃຫຍ່ (ສຳລັບໃສ່ຄຳ 10 ບາດ)', 20, 'addition', '2026-09-10', '2026-09-10T08:52:14.504Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1789026485212');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 1, 'deduction', '2026-09-10', '2026-09-10T09:35:26.530Z', 'Babie', 'ແຖມໄຫ້ລູກຄ້າຖອນຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 1, 'deduction', '2026-09-09', '2026-09-10T09:35:43.360Z', 'Babie', 'ແຖມໄຫ້ລູກຄ້າຖອນຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 1, 'deduction', '2026-09-09', '2026-09-10T09:38:19.627Z', 'Babie', 'ແຖມໄຫ້ລູກຄ້າຖອນຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 1, 'deduction', '2026-09-09', '2026-09-10T09:39:20.970Z', 'Babie', 'ແຖມໄຫ້ລູກຄ້າຖອນຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1789008745801', 'ກ່ອງຄຳນ້ອຍ (ສຳລັບໃສ່ຄຳ 1 ບາດ)', 1, 'deduction', '2026-09-09', '2026-09-10T09:39:37.753Z', 'Babie', 'ແຖມໄຫ້ລູກຄ້າຖອນຄໍາ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('OPENING', 'sku-1785121215788', 'Paper Bag for GOLD', 50, 'addition', '2026-09-11', '2026-09-11T03:07:20.658Z', 'MKT Warehouse', 'Auto-transferred from MKT WH - Ticket: TKT-1789026815202');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771406960024', 'ບິກອີຊີໂກລ', 50, 'deduction', '2026-09-15', '2026-09-15T06:58:13.555Z', 'Nopphanai Phomphakdee', '[MKT_TRANSFER] Transfer to MKT');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1781681021177', 'ຫມວກ 2026', 24, 'deduction', '2026-09-24', '2026-09-24T03:54:59.770Z', 'Saiyfon', 'ຊັ່ນ4ເອົາອອກບູດ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1780972510074', 'ຈອກເກັບອຸນຫະພູມ 2026', 20, 'deduction', '2026-09-24', '2026-09-24T03:55:18.819Z', 'Saiyfon', 'ຊັ່ນ4ເອົາອອກບູດ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1771407316677', 'ຄັນຮົ່ມ 2026', 10, 'deduction', '2026-09-24', '2026-09-24T04:06:57.552Z', 'Saiyfon', 'ຊັ່ນ4ເອົາອອກບູດ');
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_at, action_by, comment)
  values ('DIRECT_DESTOCK', 'sku-1781681021177', 'ຫມວກ 2026', 2, 'deduction', '2026-09-24', '2026-09-24T04:09:32.524Z', 'Saiyfon', 'ຊັ່ນ4ເອົາອອກບູດ');

-- ── Step 11: Ticket Actions ──
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1771577788359', 'Create', 'Pending', '2026-02-20T08:56:27.312Z', 'Phonethida Mangala', 'For Lunar New Year Campaign (10-17 Feb 2026)', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1771577788359', 'Moved', 'Moved', '2026-02-20T08:58:06.250Z', 'Sompartthana Bouphavong', 'Bam & J, ໄປເອົາຢູ່ສາງເອງ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1771577788359', 'Approved', 'Approved', '2026-02-20T09:07:25.943Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1771577788359', 'Approved', 'Approved', '2026-02-20T09:07:28.144Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772507237246', 'Create', 'Pending', '2026-03-03T03:07:14.742Z', 'Thavutxai Inthavongsa', 'for Kaopoon''s shooting as a prop and easter eggs', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772592110294', 'Create', 'Pending', '2026-03-04T02:41:49.328Z', 'Souk', 'ເບີກໄປໃຊ້ຊັ້ນ 1', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772592110294', 'Moved', 'Moved', '2026-03-04T04:05:26.103Z', NULL, 'ເບິກໂຕຈິ່ງແມ່ນ 20 ຊຸດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772507237246', 'Moved', 'Moved', '2026-03-04T04:08:33.958Z', NULL, NULL, NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773299387291', 'Create', 'Pending', '2026-03-12T07:09:46.109Z', 'Sompartthana Bouphavong', 'ໃຫ້ທີມອາເຈັນຊີ້ ອອກບູສ ທີ່ງານ ຫນັງສື ຢູ່ ມ.ຊ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773299387291', 'Moved', 'Moved', '2026-03-12T07:10:23.280Z', NULL, NULL, NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773652078809', 'Create', 'Pending', '2026-03-16T09:07:56.326Z', 'Phonethida Mangala', 'For Bluebox campaign', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773652078809', 'Moved', 'Moved', '2026-03-17T04:41:10.408Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773722800507', 'Create', 'Pending', '2026-03-17T04:46:39.165Z', 'Sompartthana Bouphavong', 'ເບິກໄປຊັບພອດງານສະປອນເຊີ Pha-Jay', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773722800507', 'Moved', 'Moved', '2026-03-17T04:46:52.162Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773723473614', 'Create', 'Pending', '2026-03-17T04:57:52.031Z', 'Sompartthana Bouphavong', 'Support Corporate (partnership)', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772507237246', 'Approved', 'Approved', '2026-03-17T06:17:46.257Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772592110294', 'Approved', 'Approved', '2026-03-17T06:18:00.410Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773299387291', 'Approved', 'Approved', '2026-03-17T06:18:11.442Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773652078809', 'Approved', 'Approved', '2026-03-17T06:18:18.868Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773722800507', 'Approved', 'Approved', '2026-03-17T06:18:23.750Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773723473614', 'Moved', 'Moved', '2026-03-17T06:24:47.469Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773723473614', 'Approved', 'Approved', '2026-03-17T08:14:04.089Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774339252579', 'Create', 'Pending', '2026-03-24T08:00:51.245Z', 'Sompartthana Bouphavong', 'Agency support Picky Bank 40', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774339252579', 'Moved', 'Moved', '2026-03-24T08:01:06.719Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1771577788359', 'Approved', 'Approved', '2026-03-24T08:05:19.378Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772507237246', 'Approved', 'Approved', '2026-03-24T08:05:34.964Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1772592110294', 'Approved', 'Approved', '2026-03-24T08:05:52.128Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773299387291', 'Approved', 'Approved', '2026-03-24T08:06:06.664Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773652078809', 'Approved', 'Approved', '2026-03-24T08:06:21.012Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773722800507', 'Approved', 'Approved', '2026-03-24T08:06:33.410Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1773723473614', 'Approved', 'Approved', '2026-03-24T08:07:06.618Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774339252579', 'Approved', 'Approved', '2026-03-25T06:22:21.582Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774431236031', 'Create', 'Pending', '2026-03-25T09:33:54.102Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ່້ສາງຊັ້ນ6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774339252579', 'Approved', 'Approved', '2026-03-26T01:35:17.102Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774431236031', 'Moved', 'Moved', '2026-03-26T08:31:05.392Z', 'Sompartthana Bouphavong', 'ນ້ອງໆ CX ເບິກມາໄວ້ຊັ້ນ 6 ເພື່ອມອບໃຫ້ລູກຄ້າທີ່ເຂົ້າມາແລກຄະແນນ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774431236031', 'Approved', 'Approved', '2026-03-26T10:09:44.990Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519787325', 'Create', 'Pending', '2026-03-26T10:09:45.687Z', 'Souk', 'ເບີກໄວ້ມອບໃຫ້ຫົວໜ້າກົມເຕັກໂນໂລຊີ ແລະ ໄວໃຫ້ແຂກຫົວໜ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519858761', 'Create', 'Pending', '2026-03-26T10:10:55.935Z', 'Souk', 'ໃຊ້ເປັນໂຕະກາເຟຊັ້ນ 01 ເພື່ອຮັບຮອງລູກຄ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519787325', 'Moved', 'Moved', '2026-03-26T10:20:13.353Z', 'Sompartthana Bouphavong', 'ເນື່ອງຈາກ ສຸກຕ້ອງການດ່ວນ (ມື້ຊັບມິດເລີຍ) ກໍ່ເລີຍໃຫ້ສຸກເບິກຢືມນຳທີມ ບໍລິການລູກຄ້າກ່ອນ, ແລ້ວປູນາຈະເບິກມາແທນຄືນໃຫ້', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519787325', 'Approved', 'Approved', '2026-03-26T10:20:54.305Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774431236031', 'Approved', 'Approved', '2026-03-27T01:36:19.060Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519787325', 'Approved', 'Approved', '2026-03-27T01:36:35.542Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519858761', 'Moved', 'Moved', '2026-03-27T02:00:34.650Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519858761', 'Approved', 'Approved', '2026-03-27T02:09:07.609Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1774519858761', 'Approved', 'Approved', '2026-03-27T07:00:08.601Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775030802941', 'Create', 'Pending', '2026-04-01T08:06:38.832Z', 'Soudsada Keovongphet', 'Free gifts and giveaways for customers at booth events. ເເຈກລູກຄ້າເປີດບັນຊີ ເເລະ ຊື້ຄຳຫນ້າບູດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775031095824', 'Create', 'Pending', '2026-04-01T08:11:29.309Z', 'Soudsada Keovongphet', 'Free gifts and giveaways for customers at booth events. ເເຈກລູກຄ້າເປີດບັນຊີໃຫມ່ ເເລະ ຊື້ຄຳຫນ້າບູດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775030802941', 'Moved', 'Moved', '2026-04-01T09:22:09.186Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775031095824', 'Moved', 'Moved', '2026-04-01T09:23:59.705Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775030802941', 'Approved', 'Approved', '2026-04-01T09:30:57.973Z', 'Jonathaan Meadley', 'KPV Activation - Q2', 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775031095824', 'Approved', 'Approved', '2026-04-01T09:31:23.630Z', 'Jonathaan Meadley', 'KPV Activation - Q2', 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775030802941', 'Approved', 'Approved', '2026-04-01T10:48:36.679Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775031095824', 'Approved', 'Approved', '2026-04-01T10:48:57.282Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775100401216', 'Create', 'Pending', '2026-04-02T03:26:37.832Z', 'Sompartthana Bouphavong', 'resubmit', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775100401216', 'Moved', 'Moved', '2026-04-02T03:27:22.925Z', 'Sompartthana Bouphavong', 'ສຳລັບ ໄຕມາດ2', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775528099100', 'Create', 'Pending', '2026-04-07T02:14:57.135Z', 'Sompartthana Bouphavong', 'For Q1 Booth activation by agency', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775100401216', 'Approved', 'Approved', '2026-04-07T02:55:10.310Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775100401216', 'Approved', 'Approved', '2026-04-07T03:28:48.803Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775528099100', 'Moved', 'Moved', '2026-04-08T04:13:27.336Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775528099100', 'Approved', 'Approved', '2026-04-08T06:46:17.485Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775633130238', 'Create', 'Pending', '2026-04-08T07:25:25.225Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775633130238', 'Moved', 'Moved', '2026-04-10T03:18:44.986Z', 'Sompartthana Bouphavong', 'ໄດ້ເອົາເຄື່ອງຕົວຈິ່ງທີ່ມີທັງຫມົດ 70ກ້ານໃຫ້ເເລີຍ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776670121981', 'Create', 'Pending', '2026-04-20T07:28:41.712Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671610636', 'Create', 'Pending', '2026-04-20T07:53:29.444Z', 'Sompartthana Bouphavong', 'ເບິກໃຫ້ທີມງານການຕະຫລາດ, ພາດເນີຊີບ ແລະ ໂດ້ (ພະນັກງານເກົ່າ)', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671656947', 'Create', 'Pending', '2026-04-20T07:54:15.631Z', 'Sompartthana Bouphavong', 'ເບິກໃຫ້ທີມງານອາເຈັນຊີ້ ອອກບູສ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775633130238', 'Approved', 'Approved', '2026-04-20T09:47:45.629Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775528099100', 'Approved', 'Approved', '2026-04-20T09:52:15.946Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1775633130238', 'Approved', 'Approved', '2026-04-20T09:52:32.696Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776670121981', 'Moved', 'Moved', '2026-04-21T01:50:21.981Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671610636', 'Moved', 'Moved', '2026-04-21T01:50:42.037Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671656947', 'Moved', 'Moved', '2026-04-21T01:50:54.417Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776756480752', 'Create', 'Pending', '2026-04-21T07:27:59.520Z', 'Sompartthana Bouphavong', 'ຊັບມິດຄືນ ເພຶ່ອຊັບພອດເຄມເປນ LNY', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776756480752', 'Moved', 'Moved', '2026-04-21T07:29:44.452Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776670121981', 'Approved', 'Approved', '2026-04-21T08:20:47.045Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671610636', 'Approved', 'Approved', '2026-04-21T08:21:00.239Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671656947', 'Approved', 'Approved', '2026-04-21T08:21:11.172Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776756480752', 'Approved', 'Approved', '2026-04-21T08:21:24.016Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776670121981', 'Approved', 'Approved', '2026-04-21T08:22:30.059Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671610636', 'Approved', 'Approved', '2026-04-21T08:22:44.252Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776671656947', 'Approved', 'Approved', '2026-04-21T08:23:00.975Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776756480752', 'Approved', 'Approved', '2026-04-21T08:23:19.410Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776829073779', 'Create', 'Pending', '2026-04-22T03:37:52.310Z', 'Soudsada Keovongphet', 'Free gifts and giveaways for customers at booth events.ເຄື່ອງເເຈກໃຫ້ລູກຄ້າຫນ້າບູດສາຂາວັງທອງ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776829073779', 'Moved', 'Moved', '2026-04-23T06:52:10.834Z', 'Sompartthana Bouphavong', 'ເພີ້ມເຕີມມີ: ແນວຕັ້ງໂທລະສັບ 10ອັນ ຫົວສາກ 10 ອັນ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927415197', 'Create', 'Pending', '2026-04-23T06:56:53.725Z', 'Soudsada Keovongphet', 'Free gifts and giveaways for customers at booth events. ເເຈກໃຫ້ກັບລູກຄ້າຫນ້າບູດສາຂາວັງທອງ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927769965', 'Create', 'Pending', '2026-04-23T07:02:48.592Z', 'Sompartthana Bouphavong', 'ເບິກເຄື່ອງໃຫ້ອາເຈັນຊີ້ປະຈຳເດືອນ 5 ແລະ ເບິກໃຊ້ຊັບພອດງານ ອີເວັ້ນ StartUp 2026', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927769965', 'Moved', 'Moved', '2026-04-23T07:08:42.525Z', 'Sompartthana Bouphavong', 'ຫມາຍເຫດ: ຄັນຮົ່ມກອຟ ເບິກໄປງານແລ້ວ, ແຕ່ບໍ່ທັນໄດ້ແຈກ ລໍຖ້າຜອລູ່ໃຫ້ຄຳເຫັນ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927415197', 'Moved', 'Moved', '2026-04-23T07:09:57.926Z', 'Sompartthana Bouphavong', 'ເມເບິກໄປຊັບພອດບູສ ຫນ້າຮ້ານຄຳພູວົງ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776829073779', 'Approved', 'Approved', '2026-04-23T07:15:29.878Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927415197', 'Approved', 'Approved', '2026-04-23T07:15:38.802Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927769965', 'Approved', 'Approved', '2026-04-23T07:15:46.114Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776829073779', 'Approved', 'Approved', '2026-04-23T08:51:44.120Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927415197', 'Approved', 'Approved', '2026-04-23T08:52:05.096Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776927769965', 'Approved', 'Approved', '2026-04-23T08:52:24.977Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776999501965', 'Create', 'Pending', '2026-04-24T02:58:18.483Z', 'Souk', 'ຍື່ມມາໃຫ້ລຸງຍາມ ,ອາ້ຍນ້ອງຕຳຫຼວດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776999501965', 'Moved', 'Moved', '2026-04-24T03:03:08.975Z', 'Sompartthana Bouphavong', 'ສຸກ, ໄດ້ໄປເບິກເອົາຢູ່ສາງເອງ ວັນທີ່ 23.04.2026 ຕອນເລິກວຽກ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777276449750', 'Create', 'Pending', '2026-04-27T07:54:09.423Z', 'Customer Service', 'ເບີດເຄື່ອງໄວ້ສາງຊັ້ນ 6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777348190787', 'Create', 'Pending', '2026-04-28T03:49:49.600Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777348190787', 'Moved', 'Moved', '2026-04-28T05:42:27.321Z', 'Sompartthana Bouphavong', 'ບິກແມ່ນມີ4ກັບ,  ກັບລະ 50ກ້ານ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777276449750', 'Moved', 'Moved', '2026-04-28T05:42:40.685Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777355053398', 'Create', 'Pending', '2026-04-28T05:44:11.757Z', 'Soudsada Keovongphet', 'BTL ເບີກເຄື່ອງອອກບູດປະຈຳຫນ້າຮ້ານ 3ສາຂາ ເເລະ ເຄື່ອງເເຈກໃຫ້ບູດກິດຈະກຳຂອງທາງD-Day Agency', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777355053398', 'Moved', 'Moved', '2026-04-28T05:45:29.737Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777355053398', 'Approved', 'Approved', '2026-04-28T07:27:14.025Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777348190787', 'Approved', 'Approved', '2026-04-28T07:27:27.381Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777276449750', 'Approved', 'Approved', '2026-04-28T07:27:36.010Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776999501965', 'Approved', 'Approved', '2026-04-28T07:27:54.120Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776999501965', 'Approved', 'Approved', '2026-04-28T07:43:34.377Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777276449750', 'Approved', 'Approved', '2026-04-28T07:45:30.211Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777348190787', 'Approved', 'Approved', '2026-04-28T07:46:05.699Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1777355053398', 'Approved', 'Approved', '2026-04-28T07:46:26.937Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778045180113', 'Create', 'Pending', '2026-05-06T05:26:18.534Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ 6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778045180113', 'Moved', 'Moved', '2026-05-06T09:37:15.368Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776999501965', 'Update', 'finalized', '2026-05-07T10:11:00.385Z', NULL, NULL, NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1776999501965', 'Update', 'finalized', '2026-05-07T10:30:43.076Z', NULL, NULL, NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778230741215', 'Create', 'Pending', '2026-05-08T08:58:59.313Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778467898610', 'Create', 'Pending', '2026-05-11T02:51:34.125Z', 'Souk', 'ເບີກໃຫ້ກອງເລຂາ ຕອ້ນຮັບແຂກທາງຫ້ອງການ KPV', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778469681143', 'Create', 'Pending', '2026-05-11T03:21:13.404Z', 'Souk', 'ໄວຮັບແຂກ ຜູ້ອຳນວຍການ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778467898610', 'Moved', 'Moved', '2026-05-11T07:41:14.925Z', 'Sompartthana Bouphavong', 'ຕາດຳພາເລຂາຫົວຫນ້າໄປຂົນເອົາເຄື່ອງຢູ່ສາງ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778230741215', 'Moved', 'Moved', '2026-05-11T07:42:30.040Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778469681143', 'Moved', 'Moved', '2026-05-11T07:43:47.657Z', 'Sompartthana Bouphavong', 'ສຸກ, ເບິກເອົາຊຸດຈອກກາເຟວ່າໄວ້ສາງຊັ້ນ 6 ເພື່ອໄວ້ຮັບແຂກ ແລະ ເພື່ອໄວ້ແຈກ  ເບິກງວດທີ່ສອງ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778559259749', 'Create', 'Pending', '2026-05-12T04:14:18.498Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ໄຫ້ລູກຄ້າແລກ easy point', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778559259749', 'Moved', 'Moved', '2026-05-12T04:32:26.520Z', 'Sompartthana Bouphavong', 'ໂຕນີ້, ແມ່ນເບິກໃຫ້ ທີມ CX ພິເສດ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778230741215', 'Approved', 'Approved', '2026-05-12T04:32:43.628Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778045180113', 'Approved', 'Approved', '2026-05-12T04:33:22.044Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778469681143', 'Approved', 'Approved', '2026-05-12T04:34:31.614Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778467898610', 'Approved', 'Approved', '2026-05-12T04:34:47.745Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778559259749', 'Approved', 'Approved', '2026-05-13T03:55:04.392Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778647133017', 'Create', 'Pending', '2026-05-13T04:38:51.479Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ໄຫ້ລູກຄ້າແລກ easy point', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778647133017', 'Moved', 'Moved', '2026-05-14T02:52:26.868Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778727782508', 'Create', 'Pending', '2026-05-14T03:02:56.294Z', 'Thavutxai Inthavongsa', 'BTL', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778727782508', 'Approved', 'Approved', '2026-05-15T02:05:50.241Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778647133017', 'Approved', 'Approved', '2026-05-15T02:06:32.185Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778727782508', 'Moved', 'Moved', '2026-05-15T02:28:17.938Z', 'Sompartthana Bouphavong', '*ຊຸດພິນ້ຽມ ເບິກມາງານ MOU x10  ເຫລືອນັ້ນແມ່ນເບິກມາໄວ້ໃຫ້ອາເຈັນຊີ້ອອກງານຊ່ວງເດືອນ 6', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778827318176', 'Create', 'Pending', '2026-05-15T06:41:57.350Z', 'Phonethida Mangala', 'ເບີກເຄຶ່ອງແຄມເປນ Cashback', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778827318176', 'Moved', 'Moved', '2026-05-15T06:44:59.862Z', 'Sompartthana Bouphavong', 'Resubmitte ເພາະທຳອິດຫລົງຊັບມິດເປັນເບິກເຄື່ອງຢືມ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778727782508', 'Approved', 'Approved', '2026-05-19T04:13:32.849Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1778827318176', 'Approved', 'Approved', '2026-05-19T04:13:48.618Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779178137478', 'Create', 'Pending', '2026-05-19T08:08:53.908Z', 'Customer Service', 'ເບີກເຄື່ອງໄວ້ສາງຊັ້ນ6 ໄວ້ໄຫ້ລູກຄ້າ easy point', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779178137478', 'Moved', 'Moved', '2026-05-19T08:34:09.587Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779336387407', 'Create', 'Pending', '2026-05-21T04:06:27.095Z', 'Anna', 'Join Wii fair - Walk in interview event', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779437242667', 'Create', 'Pending', '2026-05-22T08:07:21.414Z', 'Customer Service', 'ເບີກໄວ້ໃສ່ເຄື່ອງໄຫ້ລູກຄ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779336387407', 'Moved', 'Moved', '2026-05-22T08:27:53.340Z', 'Sompartthana Bouphavong', 'HR ເບິກໄປຊັບພອດງານ 108job', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779437242667', 'Moved', 'Moved', '2026-05-22T08:28:38.182Z', 'Sompartthana Bouphavong', 'CX ເບິກໄວ້ໃສ່ເຄື່ອງໃຫ້ລູກຄ້າ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779437242667', 'Moved', 'Moved', '2026-05-22T08:28:49.497Z', 'Sompartthana Bouphavong', 'CX ເບິກໄວ້ໃສ່ເຄື່ອງໃຫ້ລູກຄ້າ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779178137478', 'Approved', 'Approved', '2026-05-25T10:12:40.068Z', 'Souphanit Vongsengthong', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779336387407', 'Approved', 'Approved', '2026-05-25T10:13:09.182Z', 'Souphanit Vongsengthong', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779437242667', 'Approved', 'Approved', '2026-05-25T10:13:24.702Z', 'Souphanit Vongsengthong', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779437242667', 'Approved', 'Approved', '2026-05-26T03:11:17.051Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779178137478', 'Approved', 'Approved', '2026-05-26T03:11:45.043Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779336387407', 'Approved', 'Approved', '2026-05-26T03:12:23.734Z', 'Alouny', NULL, 'admin');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779776573671', 'Create', 'Pending', '2026-05-26T06:22:58.274Z', 'Customer Service', 'ເບີກເຄື່ອງໄຫ້ລູກຄ້າ ແລກ easy point', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779876975030', 'Create', 'Pending', '2026-05-27T10:16:12.784Z', 'Customer Service', 'ເບີກເຄື່ອງໄຫ້ລູກຄ້າ ແລກ ອີຊີພ້ອຍ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779880791871', 'Create', 'Pending', '2026-05-27T11:19:49.594Z', 'Phonethida Mangala', 'Campaign Lao Viet Bank ແຈກກະເປົ໋າ 10 ຫນ່ວຍ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779956511825', 'Create', 'Pending', '2026-05-28T08:21:50.509Z', 'Thavutxai Inthavongsa', 'CDD at Suan Pruek Sa for CSR', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779776573671', 'Moved', 'Moved', '2026-05-28T09:41:15.944Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779876975030', 'Moved', 'Moved', '2026-05-28T09:42:20.551Z', 'Sompartthana Bouphavong', 'ເອື້ອຍປູນາ ເອົາໃຫ້ 80ອັນ ຕໍ່ມາ ອ້າຍຕາດຳເອົາເພີ້ມໃຫ້ອີກ 50ອັນ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779880791871', 'Moved', 'Moved', '2026-06-01T09:16:28.265Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780305786573', 'Create', 'Pending', '2026-06-01T09:23:05.490Z', 'Phonethida Mangala', 'Support Children''s day campaign', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780305786573', 'Moved', 'Moved', '2026-06-01T09:24:09.244Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780308974303', 'Create', 'Pending', '2026-06-01T10:16:11.982Z', 'Sompartthana Bouphavong', 'ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780308974303', 'Moved', 'Moved', '2026-06-01T10:26:37.118Z', 'Sompartthana Bouphavong', 'Remark: ລາຍການຊັບມິດອອກໃຫ້ອາເຈັນຊີ້ ແລະ ມອບໃຫ້ລູູກຄ້າຄະແນນລ້ານປ້າຍບາງສ່ວນ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780539510415', 'Create', 'Pending', '2026-06-04T02:18:27.932Z', 'Soudsada Keovongphet', 'ເບີກອອກງານສຳມະນາ, ເອຊີລີດາ 5/6/2026', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780539510415', 'Moved', 'Moved', '2026-06-04T08:24:53.870Z', 'Sompartthana Bouphavong', 'ແລະ ກະເປົາກີລາ 5 ນ່ວຍ, ເຊິ່ງໂຕນີ້ຈະຊັບມິດອອກຕາມຫລັງ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781075113062', 'Create', 'Pending', '2026-06-10T07:05:10.372Z', 'Soudsada Keovongphet', 'ເບີກໃຫ້ອາເຈນຊີ່', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781083706105', 'Create', 'Pending', '2026-06-10T09:28:24.496Z', 'Thavutxai Inthavongsa', 'Giveaway for testimonial video shooting', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779956511825', 'Moved', 'Moved', '2026-06-11T06:23:22.799Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781075113062', 'Moved', 'Moved', '2026-06-11T06:24:06.838Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781083706105', 'Moved', 'Moved', '2026-06-11T06:24:23.768Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779776573671', 'Approved', 'Approved', '2026-06-11T07:34:21.124Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779876975030', 'Approved', 'Approved', '2026-06-11T07:34:35.873Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779880791871', 'Approved', 'Approved', '2026-06-11T07:34:50.223Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779956511825', 'Approved', 'Approved', '2026-06-11T07:35:37.080Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780305786573', 'Approved', 'Approved', '2026-06-11T07:36:05.270Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781083706105', 'Approved', 'Approved', '2026-06-11T07:36:46.650Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780308974303', 'Approved', 'Approved', '2026-06-11T07:36:57.390Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780539510415', 'Approved', 'Approved', '2026-06-11T07:37:08.032Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781075113062', 'Approved', 'Approved', '2026-06-11T07:37:19.308Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781773158812', 'Create', 'Pending', '2026-06-18T08:59:15.446Z', 'Thavutxai Inthavongsa', 'giveaway to mae loma for testimonial and olay for pride month campaign review', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781775750887', 'Create', 'Pending', '2026-06-18T09:42:30.994Z', 'Soudsada Keovongphet', 'ເບີກໃຫ້ກັບທາງ ທີມງານເອເຈນຊີ ໃນການເຮັດກິດຈະກຳການຕະຫລາດຫນ້າບູດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776422307', 'Create', 'Pending', '2026-06-18T09:53:43.481Z', 'Phonethida Mangala', 'ກະເປົ໋າສຳລັບແຄມເປນ Pride Month', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776426981', 'Create', 'Pending', '2026-06-18T09:53:47.422Z', 'Soudsada Keovongphet', 'ເບີກໃຫ້ກັບທາງ ທີມເອເຈນຊີ 20, ATL 5 ເເລະ ອອກບູດຫນ້າຮ້ານ5', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776422307', 'Moved', 'Moved', '2026-06-18T09:58:41.650Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776422307', 'Approved', 'Approved', '2026-06-19T02:50:48.294Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779776573671', 'Approved', 'Approved', '2026-06-19T04:21:55.114Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779876975030', 'Approved', 'Approved', '2026-06-19T04:22:11.430Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779880791871', 'Approved', 'Approved', '2026-06-19T04:22:28.876Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779956511825', 'Approved', 'Approved', '2026-06-19T04:22:54.988Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780305786573', 'Approved', 'Approved', '2026-06-19T04:23:08.414Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780308974303', 'Approved', 'Approved', '2026-06-19T04:23:19.610Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1780539510415', 'Approved', 'Approved', '2026-06-19T04:23:27.984Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781075113062', 'Approved', 'Approved', '2026-06-19T04:23:37.735Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781083706105', 'Approved', 'Approved', '2026-06-19T04:23:46.764Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776422307', 'Approved', 'Approved', '2026-06-19T04:24:00.506Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781773158812', 'Moved', 'Moved', '2026-06-22T08:52:04.262Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781775750887', 'Moved', 'Moved', '2026-06-22T08:52:46.051Z', 'Sompartthana Bouphavong', 'ທີມອາເຈັນຊີ້ເບິກເພີ້ມ, ເນື່ອງຈາກໄດ້ຖານລູກຄ້າເພີ້ມຂຶ້ນ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776426981', 'Moved', 'Moved', '2026-06-22T08:54:05.170Z', 'Sompartthana Bouphavong', 'ບ໋ອດ ຊັບມິດເບິກແຍກຕ່າງຫາກແລ້ວ 2 ນ່ວຍ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782183777297', 'Create', 'Pending', '2026-06-23T03:02:56.033Z', 'Customer Service', 'ເບິກເຄື່ອງໄວ້ສາງຊັ້ນ 6', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782183777297', 'Moved', 'Moved', '2026-06-23T03:05:55.846Z', 'Sompartthana Bouphavong', 'CX ເບິກມາໄວ້ເພື່ອແຈກໃຫ້ລູກຄ້າຊ່ວງທ້າຍປີ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779956511825', 'Returned', 'Returned', '2026-06-23T03:06:17.064Z', 'Sompartthana Bouphavong', 'Partial return processed by warehouse', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1779956511825', 'Returned', 'Returned', '2026-06-23T03:06:25.921Z', 'Sompartthana Bouphavong', 'Partial return processed by warehouse', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781773158812', 'Approved', 'Approved', '2026-06-24T03:45:17.788Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781775750887', 'Approved', 'Approved', '2026-06-24T03:45:38.289Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776426981', 'Approved', 'Approved', '2026-06-24T03:45:48.303Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782703189783', 'Create', 'Pending', '2026-06-29T03:19:48.444Z', 'Anna', 'ແພມ ມາລິສາ ຂໍເບີກຂອງຝາກໃຫ້ທາງກະຊວງ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782703189783', 'Moved', 'Moved', '2026-06-29T06:02:05.343Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782801962258', 'Create', 'Pending', '2026-06-30T06:45:59.677Z', 'Nuni', 'ເບີກໃຫ້ຫົວໜ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782801962258', 'Moved', 'Moved', '2026-06-30T06:48:26.611Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782801962258', 'Approved', 'Approved', '2026-06-30T06:54:58.479Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782703189783', 'Approved', 'Approved', '2026-06-30T06:55:13.718Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782183777297', 'Approved', 'Approved', '2026-06-30T06:55:51.053Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781773158812', 'Approved', 'Approved', '2026-07-02T02:33:16.375Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781775750887', 'Approved', 'Approved', '2026-07-02T02:33:31.723Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1781776426981', 'Approved', 'Approved', '2026-07-02T02:33:45.768Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782183777297', 'Approved', 'Approved', '2026-07-02T02:34:02.088Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782703189783', 'Approved', 'Approved', '2026-07-02T02:34:11.828Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1782801962258', 'Approved', 'Approved', '2026-07-02T02:34:25.060Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783305053069', 'Create', 'Pending', '2026-07-06T02:30:49.820Z', 'Soudsada Keovongphet', 'ເບີກເຄຶ່ອງອອກບູ໊ດໜ້າຮ້ານຄຳ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783319725593', 'Create', 'Pending', '2026-07-06T06:35:21.498Z', 'Soudsada Keovongphet', 'ເບີກເຄື່ອງໃຫ້ ອາເຈນຊີ່ ປະຈຳເດືອນ7', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783305053069', 'Moved', 'Moved', '2026-07-06T07:49:42.776Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783319725593', 'Moved', 'Moved', '2026-07-07T03:55:17.223Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783482332278', 'Create', 'Pending', '2026-08-07T03:45:30.733Z', 'Nuni', 'ເອົາໄປໃຫ້ຜູ້ວ່າ ທະນາຄານກາງ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783482332278', 'Moved', 'Moved', '2026-08-07T09:22:31.457Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783665317672', 'Create', 'Pending', '2026-07-10T06:35:16.537Z', 'Nuni', 'ເບີກໃຫ້ຫົວໜ້າ ເອົາໄປວັດໄຕ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783665317672', 'Moved', 'Moved', '2026-07-10T06:45:58.534Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783305053069', 'Approved', 'Approved', '2026-07-14T02:47:49.066Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783319725593', 'Approved', 'Approved', '2026-07-14T02:49:26.244Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783482332278', 'Approved', 'Approved', '2026-08-14T02:49:40.597Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783665317672', 'Approved', 'Approved', '2026-07-14T02:49:52.875Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783665317672', 'Approved', 'Approved', '2026-07-14T02:57:17.140Z', 'Souliphonh Phengxay', 'Approved', 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783482332278', 'Approved', 'Approved', '2026-08-14T02:57:37.530Z', 'Souliphonh Phengxay', 'Approved', 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783319725593', 'Approved', 'Approved', '2026-07-14T02:58:02.309Z', 'Souliphonh Phengxay', 'Approved', 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783305053069', 'Approved', 'Approved', '2026-07-14T02:58:23.294Z', 'Souliphonh Phengxay', 'Approved', 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784194879118', 'Create', 'Pending', '2026-07-16T09:41:17.912Z', 'Babie', 'ເບີກໄວ້ໃສ່ເຄື່ອງໄຫ້ລູກຄ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784196482428', 'Create', 'Pending', '2026-07-16T10:08:01.205Z', 'Soudsada Keovongphet', 'ເບີກໄວ້ໃສ່ເຄື່ອງຕ່າງໆໃຫ້ກັບລູກຄ້າຫນ້າບູດເເລະງານນອກອື່ນໆ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784196482428', 'Moved', 'Moved', '2026-07-16T10:08:52.105Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784194879118', 'Moved', 'Moved', '2026-07-16T10:09:45.389Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784194879118', 'Approved', 'Approved', '2026-07-21T07:58:01.664Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784196482428', 'Approved', 'Approved', '2026-07-21T07:58:14.755Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784194879118', 'Approved', 'Approved', '2026-07-21T09:30:05.556Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1784196482428', 'Approved', 'Approved', '2026-07-21T09:30:24.560Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785124833384', 'Create', 'Pending', '2026-07-27T04:00:29.053Z', 'Soudsada Keovongphet', 'ເບີກເຄື່ອງໃຫ້ ອາເຈນຊີ່', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785124833384', 'Moved', 'Moved', '2026-07-28T03:00:45.281Z', 'Sompartthana Bouphavong', 'ຫົວສາກໂທລະສັບ ຕາດຳໄປເບິກມາກ່ອນ 15ອັນ,  ປູນາ ໄປເບິກເພີ້ມອີກ 35ອັນ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785124833384', 'Approved', 'Approved', '2026-07-29T04:16:53.807Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785319376214', 'Create', 'Pending', '2026-07-29T10:02:54.450Z', 'Anna', 'ເພື່ອໃຫ້ກັບພະນັກງານເຂົ້າໃຫມ່ ແລະ ລາງວັນພະນັກງານດີເດັ່ນ ຂອງຝ່າຍບຸກຄະລາກອນ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785380476796', 'Create', 'Pending', '2026-07-30T03:01:14.603Z', 'Nuni', 'ຂໍເບີກໄວ້ໃຫ້ແຂກ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785319376214', 'Moved', 'Moved', '2026-07-30T06:01:26.030Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785380476796', 'Recalled', 'Recalled', '2026-07-30T06:07:58.065Z', 'Nuni', 'Ticket recalled by creator', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785723806693', 'Create', 'Pending', '2026-08-03T02:23:24.942Z', 'Phonethida Mangala', 'Campaign ລົງທະບຽນຟຣີ ລຸ້ນຮັບຈອກກາເຟ 50 ລາງວັນ (ອີກ 10  ຫນ່ວຍ ແມ່ນຈາກເບື້ອງແຄມເປນ)', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785723806693', 'Moved', 'Moved', '2026-08-04T02:37:33.372Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785319376214', 'Approved', 'Approved', '2026-08-04T02:55:30.577Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785723806693', 'Approved', 'Approved', '2026-08-04T02:55:42.965Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906517147', 'Create', 'Pending', '2026-08-05T05:08:30.351Z', 'Soudsada Keovongphet', 'ເບີກເຄຶ່ອງເເຈກໃຫ້ກັບທີມງານເອເຈນຊີໃນການອອກບູດກິດຈະກຳທາງການຕະຫລາດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906687323', 'Create', 'Pending', '2026-08-05T05:11:24.147Z', 'Soudsada Keovongphet', 'ເບີກເຄຶ່ອງເເຈກໃຫ້ກັບທີມງານເອເຈນຊີໃນການອອກບູດກິດຈະກຳທາງການຕະຫລາດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783665317672', 'Update', 'finalized', '2026-08-06T03:30:26.351Z', NULL, NULL, NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786010348459', 'Create', 'Pending', '2026-08-06T09:59:07.531Z', 'Phonethida Mangala', 'ໃສ່ກະເປົ໋າແຄມເປນ Artist (If and ART)', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906517147', 'Moved', 'Moved', '2026-08-06T10:05:44.261Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786010348459', 'Moved', 'Moved', '2026-08-06T10:07:13.202Z', 'Sompartthana Bouphavong', 'ເອົາມາໄວ້ໃຊ້ ຮ່ວມກັນ ທີມ IMC & GC', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786010348459', 'Moved', 'Moved', '2026-08-06T10:08:23.418Z', 'Sompartthana Bouphavong', 'ເອົາມາໄວ້ໃຊ້ ຮ່ວມກັນ ທີມ IMC & GC', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906687323', 'Moved', 'Moved', '2026-08-06T10:09:27.026Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906517147', 'Approved', 'Approved', '2026-08-06T10:11:05.131Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906687323', 'Approved', 'Approved', '2026-08-06T10:22:34.899Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786012380968', 'Create', 'Pending', '2026-08-06T10:32:59.353Z', 'Babie', 'ເບີກໄວ້ໃສ່ຄໍາໄຫ້ລູກຄ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786012380968', 'Moved', 'Moved', '2026-08-07T02:22:33.736Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1783482332278', 'Update', 'finalized', '2026-08-15T04:27:45.521Z', NULL, NULL, NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786081639947', 'Create', 'Pending', '2026-08-07T05:47:15.722Z', 'Soudsada Keovongphet', 'ເບີກເຄື່ອງໃຫ້ທີມງານ ຄຳພູວົງ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786081639947', 'Moved', 'Moved', '2026-08-11T02:09:45.602Z', 'Sompartthana Bouphavong', 'ຊັບພອດງານ ເທດສະການແຕ່ງດອງ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414419486', 'Create', 'Pending', '2026-08-11T02:13:40.010Z', 'Phonethida Mangala', 'For Hero campaign', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414757351', 'Create', 'Pending', '2026-08-11T02:19:17.508Z', 'Phonethida Mangala', 'Support campaign ງານເທດສະການຄຳ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786010348459', 'Approved', 'Approved', '2026-08-11T07:50:25.739Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786012380968', 'Approved', 'Approved', '2026-08-11T07:50:41.603Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786081639947', 'Approved', 'Approved', '2026-08-11T07:50:58.123Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785124833384', 'Approved', 'Approved', '2026-08-11T08:21:57.113Z', 'Souliphonh Phengxay', 'Approved', 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785319376214', 'Approved', 'Approved', '2026-08-11T08:22:58.363Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785723806693', 'Approved', 'Approved', '2026-08-11T08:23:12.833Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906517147', 'Approved', 'Approved', '2026-08-11T08:23:35.437Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1785906687323', 'Approved', 'Approved', '2026-08-11T08:23:46.858Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786010348459', 'Approved', 'Approved', '2026-08-11T08:24:00.039Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786012380968', 'Approved', 'Approved', '2026-08-11T08:24:13.515Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786081639947', 'Approved', 'Approved', '2026-08-11T08:24:30.967Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786438940716', 'Create', 'Pending', '2026-08-11T09:02:19.503Z', 'Soudsada Keovongphet', 'ເບີກໃຫ້ທີມ ຄຳພູວົງ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786439385448', 'Create', 'Pending', '2026-08-11T09:09:44.100Z', 'Soudsada Keovongphet', 'ເບີກເຄື່ອງມາໄວ້ຊັ້ນ4 ໄວ້ອອກບູ໊ດ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787027487933', 'Create', 'Pending', '2026-08-18T04:31:27.051Z', 'Anna', 'ໃສ່ເຂົ້າຮ່ວມງານບູດເປີດບູດຮັບໃບປະກາດທີ່ວິທະຍາໄລເຕັກນິກລາວເຢຍລະມັນ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787028406085', 'Create', 'Pending', '2026-08-18T04:46:49.512Z', 'Soudsada Keovongphet', 'ເບີກໃຫ້ກັບທີມໄວ້ໃສ່ເຄື່ອງໃຫ້ກັບລູກຄ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787027487933', 'Moved', 'Moved', '2026-08-18T04:57:21.458Z', 'Sompartthana Bouphavong', 'ຈອກກາເຟ ໃຫ້ບໍ່ໄດ້', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786439385448', 'Moved', 'Moved', '2026-08-18T04:57:52.561Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414757351', 'Moved', 'Moved', '2026-08-18T04:58:10.653Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786438940716', 'Moved', 'Moved', '2026-08-18T04:58:28.648Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414419486', 'Moved', 'Moved', '2026-08-18T04:59:24.753Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787028406085', 'Moved', 'Moved', '2026-08-19T04:23:45.577Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787028406085', 'Approved', 'Approved', '2026-08-20T07:27:59.217Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787027487933', 'Approved', 'Approved', '2026-08-20T07:28:19.216Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786439385448', 'Approved', 'Approved', '2026-08-20T07:28:32.634Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786438940716', 'Approved', 'Approved', '2026-08-20T07:28:41.048Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414757351', 'Approved', 'Approved', '2026-08-20T07:28:55.793Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414419486', 'Approved', 'Approved', '2026-08-20T07:29:08.933Z', 'Jonathaan Meadley', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787028406085', 'Approved', 'Approved', '2026-08-20T07:38:06.472Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787027487933', 'Approved', 'Approved', '2026-08-20T07:39:23.786Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786439385448', 'Approved', 'Approved', '2026-08-20T07:39:38.122Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786438940716', 'Approved', 'Approved', '2026-08-20T07:39:48.254Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414757351', 'Approved', 'Approved', '2026-08-20T07:39:57.626Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1786414419486', 'Approved', 'Approved', '2026-08-20T07:40:08.819Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787539473267', 'Create', 'Pending', '2026-08-24T02:44:31.868Z', 'Thavutxai Inthavongsa', 'requesting as a special merch giveaway for the Media Lobby "EASY BUDDY ສະຫາຍຮ່ວມອອມ" throughout the project', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787543425737', 'Create', 'Pending', '2026-08-24T03:50:23.099Z', 'Thavutxai Inthavongsa', 'for the EASY BUDDY project', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787543425737', 'Moved', 'Moved', '2026-08-26T09:41:06.927Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787539473267', 'Moved', 'Moved', '2026-08-26T09:41:39.544Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787814988879', 'Create', 'Pending', '2026-08-27T07:16:27.300Z', 'Thavutxai Inthavongsa', 'campaign support', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787815027847', 'Create', 'Pending', '2026-08-27T07:17:07.325Z', 'Phonethida Mangala', 'EASY GOLD DCA Challenge Campaign', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787814988879', 'Moved', 'Moved', '2026-08-28T04:16:02.622Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787539473267', 'Approved', 'Approved', '2026-08-31T02:48:36.695Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787543425737', 'Approved', 'Approved', '2026-08-31T02:48:48.461Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787814988879', 'Approved', 'Approved', '2026-08-31T02:48:59.044Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787814988879', 'Approved', 'Approved', '2026-08-31T03:10:22.309Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787543425737', 'Approved', 'Approved', '2026-08-31T03:10:38.694Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787539473267', 'Approved', 'Approved', '2026-08-31T03:10:53.651Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788159864557', 'Create', 'Pending', '2026-08-31T07:04:18.711Z', 'Phonethida Mangala', 'ເຄຶ່ອງໄວ້ຊັບພອດແຄມເປນຕູ້ຄີບຄຳ ໃນງານເທດສະການຄຳ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788159864557', 'Recalled', 'Recalled', '2026-08-31T07:05:16.592Z', 'Phonethida Mangala', 'Ticket recalled by creator', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160090372', 'Create', 'Pending', '2026-08-31T07:08:09.795Z', 'Phonethida Mangala', 'ຊັບພອດແຄມເປນນ ຕູ້ຄີບຄຳໃນງານເທດສະການຄຳ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787815027847', 'Moved', 'Moved', '2026-08-31T07:08:49.701Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160549227', 'Create', 'Pending', '2026-08-31T07:15:47.380Z', 'Thavutxai Inthavongsa', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160640377', 'Create', 'Pending', '2026-08-31T07:17:18.586Z', 'Thavutxai Inthavongsa', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160731560', 'Create', 'Pending', '2026-08-31T07:18:49.660Z', 'Thavutxai Inthavongsa', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160825032', 'Create', 'Pending', '2026-08-31T07:20:23.189Z', 'Thavutxai Inthavongsa', 'ຂໍເບີກໄປງານສະມາຄົມຄຳທີ່ສຸພັດຕຣາ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160825032', 'Rejected', 'Rejected', '2026-08-31T08:53:04.634Z', 'Sompartthana Bouphavong', 'Rejected', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160640377', 'Rejected', 'Rejected', '2026-08-31T08:53:20.352Z', 'Sompartthana Bouphavong', 'Rejected', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160549227', 'Rejected', 'Rejected', '2026-08-31T08:54:10.052Z', 'Sompartthana Bouphavong', 'Rejected', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160731560', 'Rejected', 'Rejected', '2026-08-31T08:54:23.112Z', 'Sompartthana Bouphavong', 'Rejected', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160090372', 'Moved', 'Moved', '2026-08-31T08:54:43.452Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166528113', 'Create', 'Pending', '2026-08-31T08:55:26.669Z', 'Thavutxai Inthavongsa', 'door gift ຂໍເບີກສິນໄປງານສະມາຄົມຄຳ ສຸພັດຕາ 31/08', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166528113', 'Moved', 'Moved', '2026-08-31T08:58:23.845Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166702442', 'Create', 'Pending', '2026-08-31T08:58:20.807Z', 'Thavutxai Inthavongsa', 'ເບີກໄປໄວ້ຊັບພອດຫົວໜ້າໃນງານເທດສະການຄຳ 2026', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788230377490', 'Create', 'Pending', '2026-09-01T02:39:36.853Z', 'Soudsada Keovongphet', 'ເບີກໄວ້ເພື່ອກິດຈະກຳເດືອນ9ຂອງທາງອາເຈນຊີ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788238977053', 'Create', 'Pending', '2026-09-01T05:02:56.238Z', 'Soudsada Keovongphet', 'ອອກບູດຫນ້າ ເເລະ ງານສຳມະນາຂອງຫົວຫນ້າ ສຸລິພົນ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166702442', 'Moved', 'Moved', '2026-09-08T08:54:10.905Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788230377490', 'Moved', 'Moved', '2026-09-08T08:54:46.816Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788238977053', 'Moved', 'Moved', '2026-09-08T08:56:11.232Z', 'Sompartthana Bouphavong', 'ຂາຕັ້ງໂທລະສັບຫມົດແລ້ວ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788857848869', 'Create', 'Pending', '2026-09-08T08:57:25.738Z', 'Thavutxai Inthavongsa', 'ai lou requested for CEO', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788857848869', 'Moved', 'Moved', '2026-09-08T09:12:20.165Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026485212', 'Create', 'Pending', '2026-09-10T07:48:03.367Z', 'Babie', 'ເບີກໄວ້ແຈກລູກຄ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026815202', 'Create', 'Pending', '2026-09-10T07:53:24.213Z', 'Babie', 'ໄວ້ໃສ່ຄໍາໄຫ້ລູກຄ້າ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026485212', 'Moved', 'Moved', '2026-09-10T08:03:42.186Z', 'Sompartthana Bouphavong', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026485212', 'Moved', 'Moved', '2026-09-10T08:04:31.824Z', 'Sompartthana Bouphavong', 'ກ່ອງໃຫຍ່ 6 ກ່ອງນ້ອຍ 4  ຕາດຳເບິກມາກ່ອນແລ້ວ', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026485212', 'Approved', 'Approved', '2026-09-10T08:51:27.013Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026485212', 'Approved', 'Approved', '2026-09-10T08:52:05.388Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026815202', 'Moved', 'Moved', '2026-09-10T09:01:12.826Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787815027847', 'Approved', 'Approved', '2026-09-10T09:06:17.196Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160090372', 'Approved', 'Approved', '2026-09-10T09:07:24.464Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166528113', 'Approved', 'Approved', '2026-09-10T09:17:38.541Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166528113', 'Approved', 'Approved', '2026-09-10T09:18:23.166Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166702442', 'Approved', 'Approved', '2026-09-10T10:19:48.010Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788230377490', 'Approved', 'Approved', '2026-09-10T10:20:26.642Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788857848869', 'Approved', 'Approved', '2026-09-10T10:21:39.657Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788238977053', 'Approved', 'Approved', '2026-09-10T10:21:52.456Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026815202', 'Approved', 'Approved', '2026-09-10T10:22:11.035Z', 'Alouny', NULL, 'line_manager');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1787815027847', 'Approved', 'Approved', '2026-09-11T03:04:51.710Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788160090372', 'Approved', 'Approved', '2026-09-11T03:05:16.240Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166528113', 'Approved', 'Approved', '2026-09-11T03:05:37.774Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788166702442', 'Approved', 'Approved', '2026-09-11T03:05:55.955Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788230377490', 'Approved', 'Approved', '2026-09-11T03:06:16.139Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788238977053', 'Approved', 'Approved', '2026-09-11T03:06:42.785Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1788857848869', 'Approved', 'Approved', '2026-09-11T03:06:55.537Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789026815202', 'Approved', 'Approved', '2026-09-11T03:07:14.151Z', 'Souliphonh Phengxay', NULL, 'director');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789628317751', 'Create', 'Pending', '2026-09-17T06:58:34.798Z', 'Soudsada Keovongphet', 'ເບີກອອກມາໄວ້ຊັ້ນ4', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789722999551', 'Create', 'Pending', '2026-09-18T09:16:39.330Z', 'Anna', 'ກະເປົາເດີນທາງແມ່ນຍືມມາໃຊ້ໃນງານ ແລະ ສົ່ງຄືນ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789722999551', 'Recalled', 'Recalled', '2026-09-18T09:17:18.297Z', 'Anna', 'Ticket recalled by creator', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789723529412', 'Create', 'Pending', '2026-09-18T09:25:29.039Z', 'Anna', 'ເຂົ້າຮ່ວມເປີດບູດງານ Wii fair ຢູ່ທີໂຮງແຮມລາດຊະວົງ ແລະ ສໍາລັບກະເປົາແມ່ຍືມໃຊ້ພາຍນາຍງານ ຖ້າງານແລ້ວແມ່ນສົ່ງຄືນ', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789955493838', 'Create', 'Pending', '2026-09-21T01:51:32.453Z', 'Thavutxai Inthavongsa', 'for influencer giveaway limited merch (Catdy, toto insixiengmai, johnny muan, lae ek 2 khn)', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789955811034', 'Create', 'Pending', '2026-09-21T01:56:49.765Z', 'Thavutxai Inthavongsa', 'ເບີກເພື່ອຂໍສົ່ງໃຫ້ influ (ຍັງເຫຼືອ 5 ເປັນ 15)', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789956108694', 'Create', 'Pending', '2026-09-21T02:01:48.473Z', 'Phonethida Mangala', 'Tumblr Snae ສຳລັບ Artist Campaign', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789956137762', 'Create', 'Pending', '2026-09-21T02:02:17.607Z', 'Phonethida Mangala', 'Tumblr Snae ສຳລັບ Artist Campaign', NULL);
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789628317751', 'Moved', 'Moved', '2026-09-21T02:03:12.820Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789723529412', 'Moved', 'Moved', '2026-09-21T02:05:14.781Z', 'Sompartthana Bouphavong', 'ບິກ, ແມ່ນເຮົາສາມາດໃຫ້ໄດ້ແຕ່ 20 ກ້ານ ເດີ້', 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789955493838', 'Moved', 'Moved', '2026-09-21T02:05:39.499Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789955811034', 'Moved', 'Moved', '2026-09-21T02:05:50.069Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789956108694', 'Moved', 'Moved', '2026-09-21T02:06:00.528Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1789956137762', 'Moved', 'Moved', '2026-09-24T02:59:50.360Z', 'Sompartthana Bouphavong', NULL, 'warehouse');
insert into public.ticket_actions (ticket_id, action, status, action_at, action_by, comment, role)
  values ('TKT-1790219577932', 'Create', 'Pending', '2026-09-24T03:12:55.005Z', 'Ketmany', 'ຈອກຂອງຫົວໜ້າ, artist ແລະ Influencer, ກ່ອງຂອງຂັວນສໍາລັບ influencer, ຄັນຮົ່ມສໍາລັບ  artist, ຫົວໜ້າ ແລະ Influencer', NULL);

-- ── Step 12: SKU Remarks ──
insert into public.sku_remarks (sku_id, remark, user_name, user_role, created_at)
  values ('sku-1771407148002', 'Create 1 request for rebalance the stock', 'Sompartthana', 'warehouse', '2026-02-19T06:35:04.867Z');
insert into public.sku_remarks (sku_id, remark, user_name, user_role, created_at)
  values ('sku-1771407936514', 'Test 5', 'Sompartthana Bouphavong', 'warehouse', '2026-02-20T08:43:56.379Z');

-- ── Step 13: Backfill per-level comment timestamps from ticket_actions ──
update public.tickets t
   set wh_comment_at = a.action_at
  from (
    select ticket_id, min(action_at) as action_at
      from public.ticket_actions
     where lower(role) in ('warehouse', 'warehouse manager')
       and coalesce(comment, '') <> ''
     group by ticket_id
  ) a
 where t.id = a.ticket_id and t.wh_comment is not null and t.wh_comment <> '';
update public.tickets t
   set lm_comment_at = a.action_at
  from (
    select ticket_id, min(action_at) as action_at
      from public.ticket_actions
     where lower(role) in ('line manager', 'line_manager')
       and coalesce(comment, '') <> ''
     group by ticket_id
  ) a
 where t.id = a.ticket_id and t.lm_comment is not null and t.lm_comment <> '';
update public.tickets t
   set director_comment_at = a.action_at
  from (
    select ticket_id, min(action_at) as action_at
      from public.ticket_actions
     where lower(role) in ('director', 'admin')
       and coalesce(comment, '') <> ''
     group by ticket_id
  ) a
 where t.id = a.ticket_id and t.director_comment is not null and t.director_comment <> '';

commit;

-- ── Step 14: Verification (run after commit to review counts) ──
select 'users'               as table_name, count(*) as row_count from public.users union all
select 'categories',          count(*) from public.categories union all
select 'system_config',       count(*) from public.system_config union all
select 'skus (MKT)',          count(*) from public.skus union all
select 'cs_skus',             count(*) from public.cs_skus union all
select 'tickets',             count(*) from public.tickets union all
select 'ticket_items',        count(*) from public.ticket_items union all
select 'stock_transactions',  count(*) from public.stock_transactions union all
select 'cs_transactions',     count(*) from public.cs_transactions union all
select 'ticket_actions',      count(*) from public.ticket_actions union all
select 'sku_remarks',         count(*) from public.sku_remarks
order by table_name;
