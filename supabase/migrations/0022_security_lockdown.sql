-- ============================================================
-- Easy Gold Merch — 0022: Security Lockdown for Anonymous Client
-- ============================================================
-- Ensures the unauthenticated client (anon public key in browser bundle)
-- has ZERO execute access to business RPC functions.
-- Only authenticated sign-in sessions (or service role) may execute RPCs.
-- ============================================================

revoke execute on all functions in schema public from public, anon;

-- Explicitly allow authenticated users to execute the required application RPCs
grant execute on function public.create_ticket to authenticated;
grant execute on function public.update_ticket_status to authenticated;
grant execute on function public.manage_sku to authenticated;
grant execute on function public.manage_cs_sku to authenticated;
grant execute on function public.edit_stock_movement to authenticated;
grant execute on function public.transfer_mkt_to_cs to authenticated;
grant execute on function public.transfer_cs_to_mkt to authenticated;
grant execute on function public.manage_config to authenticated;
grant execute on function public.manage_category to authenticated;
grant execute on function public.add_remark to authenticated;
grant execute on function public.set_sku_image to authenticated;
grant execute on function public.manage_user to authenticated;
grant execute on function public.reveal_user_password to authenticated;
