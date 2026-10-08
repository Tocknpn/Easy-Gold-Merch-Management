-- ============================================================================
-- Migration 0021: Point public email app URL to Cloudflare Workers deployment
-- ============================================================================

update public.system_config
   set value = 'https://easy-gold-merch-management.tockppd.workers.dev'
 where key = 'email_app_url';
