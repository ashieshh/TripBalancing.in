-- TripBalancing Step 5B: account country / pricing region
-- Run once in Supabase SQL Editor after deploying the matching code.
-- Existing accounts remain unset and are asked to choose once in the Premium screen.

begin;

alter table public.user_profiles
  add column if not exists country_code text,
  add column if not exists pricing_region text;

-- Keep only the two pricing regions used by TripBalancing.
alter table public.user_profiles
  drop constraint if exists user_profiles_pricing_region_check;
alter table public.user_profiles
  add constraint user_profiles_pricing_region_check
  check (pricing_region is null or pricing_region in ('IN', 'INTL'));

-- New email/password accounts pass country_code/pricing_region in Supabase auth metadata.
-- Capture it when the profile row is created. Google/OAuth accounts can finish this
-- once later through the authenticated server endpoint.
create or replace function public.handle_new_tripbalancing_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_country text;
  meta_region text;
begin
  meta_country := nullif(new.raw_user_meta_data ->> 'country_code', '');
  meta_region := nullif(new.raw_user_meta_data ->> 'pricing_region', '');
  if meta_region not in ('IN', 'INTL') then
    meta_region := case when meta_country = 'IN' then 'IN' when meta_country is not null then 'INTL' else null end;
  end if;

  insert into public.user_profiles (
    id, email, plan, is_premium, free_trips_used, paid_trips_balance,
    country_code, pricing_region
  )
  values (
    new.id, new.email, 'free', false, 0, 0,
    meta_country, meta_region
  )
  on conflict (id) do update set
    email = excluded.email,
    country_code = coalesce(public.user_profiles.country_code, excluded.country_code),
    pricing_region = coalesce(public.user_profiles.pricing_region, excluded.pricing_region);
  return new;
end;
$$;

-- Browser still cannot directly change pricing region; it is saved only through
-- the authenticated Express backend/service role.
revoke update (country_code, pricing_region) on public.user_profiles from authenticated;

commit;
