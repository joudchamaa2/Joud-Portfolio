-- =============================================================================
-- Administrator provisioning (run manually in the Supabase SQL editor).
--
-- 1. Create the user in Dashboard → Authentication → Users → "Add user"
--    → "Create new user", with a strong unique password and
--    "Auto Confirm User" checked. Public sign-up stays disabled.
-- 2. Replace the email below and run this script.
--
-- Being a Supabase user grants NOTHING by itself. Only users listed in
-- public.admins pass public.is_admin(), which every write policy requires.
-- =============================================================================

insert into public.admins (user_id, note)
select id, 'Portfolio owner'
from auth.users
where email = 'REPLACE_WITH_ADMIN_EMAIL'
on conflict (user_id) do nothing
returning user_id;

-- Verify (expect exactly one row):
-- select a.user_id, u.email, a.created_at
-- from public.admins a join auth.users u on u.id = a.user_id;

-- Revoke administrator access:
-- delete from public.admins
-- where user_id = (select id from auth.users where email = 'REPLACE_WITH_ADMIN_EMAIL');
