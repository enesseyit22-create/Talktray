-- Notify the admin when Premium starts.
--
-- Signup already pings admin-push from profiles_notify_admins_signup.
-- This adds:
--   * a gift or grant (profiles.pro_override_until becomes active, or changes)
--   * a store purchase the app reports after RevenueCat confirms Pro
-- The RevenueCat webhook hits the same edge function. Store deliveries share
-- one id per user per plan (aylık / yıllık), so the webhook and the app cannot
-- both notify. A gift notifies once per end time. Revoking a gift does not notify.
--
-- Before any of this sends, the project needs:
--   1. Apply this migration.
--   2. Deploy the admin-push edge function.
--   3. One row in private.admin_push_config (the secret is not stored in git):
--        insert into private.admin_push_config (id, function_url, secret)
--        values (
--          1,
--          'https://ggcubezrrnplpdyfvzhe.supabase.co/functions/v1/admin-push',
--          '<same value as the ADMIN_PUSH_SECRET function secret>'
--        )
--        on conflict (id) do update
--          set function_url = excluded.function_url,
--              secret = excluded.secret;
--   4. Function secrets: ADMIN_PUSH_SECRET, and REVENUECAT_WEBHOOK_AUTHORIZATION
--      if the RevenueCat webhook should be accepted.
--   5. RevenueCat webhook URL:
--        https://ggcubezrrnplpdyfvzhe.supabase.co/functions/v1/admin-push
--      Authorization header equal to REVENUECAT_WEBHOOK_AUTHORIZATION.
--      The app also reports a successful purchase, so a missing webhook still
--      notifies once per plan.

create or replace function private.post_admin_push(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.admin_push_config;
begin
  select * into cfg from private.admin_push_config where id = 1;
  if not found or cfg.secret is null or btrim(cfg.secret) = '' or cfg.function_url is null or btrim(cfg.function_url) = '' then
    return;
  end if;

  perform net.http_post(
    url := cfg.function_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-push-secret', cfg.secret
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.post_admin_push(jsonb) from public, anon, authenticated;

create or replace function private.notify_admins_of_gift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email text;
  until_text text;
begin
  if new.pro_override_until is null then
    return new;
  end if;
  if new.pro_override_until <> 'infinity'::timestamptz and new.pro_override_until <= now() then
    return new;
  end if;

  select u.email into email from auth.users as u where u.id = new.id;
  if new.pro_override_until = 'infinity'::timestamptz then
    until_text := 'infinity';
  else
    until_text := to_char(new.pro_override_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  perform private.post_admin_push(
    jsonb_build_object(
      'kind', 'premium',
      'source', 'gift',
      'userId', new.id,
      'email', email,
      'username', new.username,
      'displayName', new.display_name,
      'plan', coalesce(new.pro_override_plan, 'lifetime'),
      'until', until_text
    )
  );
  return new;
end;
$$;

revoke all on function private.notify_admins_of_gift() from public, anon, authenticated;

drop trigger if exists profiles_notify_admins_gift_ins on public.profiles;
create trigger profiles_notify_admins_gift_ins
  after insert on public.profiles
  for each row
  when (new.pro_override_until is not null)
  execute function private.notify_admins_of_gift();

drop trigger if exists profiles_notify_admins_gift_upd on public.profiles;
create trigger profiles_notify_admins_gift_upd
  after update of pro_override_until, pro_override_plan on public.profiles
  for each row
  when (
    new.pro_override_until is not null
    and (
      old.pro_override_until is distinct from new.pro_override_until
      or old.pro_override_plan is distinct from new.pro_override_plan
    )
  )
  execute function private.notify_admins_of_gift();

create or replace function public.report_store_premium(p_plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  plan text := lower(btrim(coalesce(p_plan, '')));
  email text;
  username text;
  display_name text;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if plan not in ('monthly', 'yearly') then
    raise exception 'PLAN_INVALID' using errcode = '22023';
  end if;

  select u.email into email from auth.users as u where u.id = uid;
  select p.username, p.display_name into username, display_name
  from public.profiles as p
  where p.id = uid;

  perform private.post_admin_push(
    jsonb_build_object(
      'kind', 'premium',
      'source', 'store',
      'userId', uid,
      'email', email,
      'username', username,
      'displayName', display_name,
      'plan', plan
    )
  );
end;
$$;

revoke all on function public.report_store_premium(text) from public, anon;
grant execute on function public.report_store_premium(text) to authenticated;
