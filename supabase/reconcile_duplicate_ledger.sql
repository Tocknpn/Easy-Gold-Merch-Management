-- ============================================================
-- Easy Gold Merch — Reconciliation & Duplicate Cleanup Script
-- ============================================================
-- Generated after QA deep audit of production database.
-- Run in Supabase SQL Editor AFTER reviewing.
-- ============================================================

begin;

-- 1. Remove duplicate booking transactions for TKT-1789026485212
-- (These 5 rows were appended 49 seconds after the first review in legacy data,
-- causing the 5 Lao Gold Box SKUs to calculate negative stock in reports)
delete from public.stock_transactions
 where id in (465, 466, 467, 468, 469);

-- 2. Remove duplicate return transaction for TKT-1779956511825 (JBL Speaker)
-- (Row 365 was appended 8 seconds after row 364)
delete from public.stock_transactions
 where id = 365;

-- Re-sync JBL Speaker current_stock back to physical reality (minus the phantom extra return)
update public.skus
   set current_stock = current_stock - 1
 where id = 'sku-1773828255894'
   and current_stock > 0;

-- 3. Clean up the two orphaned test SKUs inserted during initial testing
-- (These test SKUs have no OPENING transaction and show drift in reports)
delete from public.ticket_items where sku_id in ('sku-1789982779807', 'sku-1790048479276');
delete from public.stock_transactions where sku_id in ('sku-1789982779807', 'sku-1790048479276');
delete from public.cs_transactions where sku_id in ('sku-1789982779807', 'sku-1790048479276');
delete from public.cs_skus where id in ('sku-1789982779807', 'sku-1790048479276');
delete from public.skus where id in ('sku-1789982779807', 'sku-1790048479276');

-- 4. Reconcile CS SKU "Gift set 2026" (sku-1787715043950)
-- It has Opening = 40, Current = 20, but was missing an OPENING row in cs_transactions
insert into public.cs_transactions (ticket_id, sku_id, sku_name, qty, type, date, action_by, comment)
values ('OPENING', 'sku-1787715043950', 'Gift set 2026', 40, 'addition', '2026-09-25', 'System', 'Opening balance baseline')
on conflict do nothing;

commit;

-- Verification query: check that no SKUs have ledger drift
select s.id, s.name, s.current_stock,
       s.opening_balance + coalesce(sum(case when st.type = 'addition' and st.ticket_id <> 'OPENING' then st.qty else 0 end), 0)
       - coalesce(sum(case when st.type = 'deduction' and coalesce(st.status,'') not in ('Booking Cancelled','Cancelled') then st.qty else 0 end), 0) as expected_stock
  from public.skus s
  left join public.stock_transactions st on st.sku_id = s.id
 group by s.id, s.name, s.current_stock, s.opening_balance
having s.current_stock <> (
       s.opening_balance + coalesce(sum(case when st.type = 'addition' and st.ticket_id <> 'OPENING' then st.qty else 0 end), 0)
       - coalesce(sum(case when st.type = 'deduction' and coalesce(st.status,'') not in ('Booking Cancelled','Cancelled') then st.qty else 0 end), 0)
);
