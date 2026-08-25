-- TripBalancing Step 5: production Auth/RLS hardening
-- Run ONCE in Supabase SQL Editor after deploying the Step 5 code.
-- Safe to re-run: policies/triggers are replaced idempotently where possible.

begin;

-- ---------------------------------------------------------------------------
-- 1) Canonical profile columns + safe profile creation
-- ---------------------------------------------------------------------------
alter table public.user_profiles add column if not exists is_premium boolean not null default false;
alter table public.user_profiles add column if not exists free_trips_used integer not null default 0;
alter table public.user_profiles add column if not exists paid_trips_balance integer not null default 0;
alter table public.user_profiles add column if not exists global_packing_checked jsonb not null default '{}'::jsonb;
alter table public.user_profiles add column if not exists updated_at timestamptz not null default now();

-- Never restore paid/free entitlements from browser localStorage. Backfill missing
-- profiles as FREE accounts from Supabase Auth itself.
insert into public.user_profiles (id, email, plan, is_premium, free_trips_used, paid_trips_balance)
select u.id, u.email, 'free', false, 0, 0
from auth.users u
left join public.user_profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

create or replace function public.handle_new_tripbalancing_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, plan, is_premium, free_trips_used, paid_trips_balance)
  values (new.id, new.email, 'free', false, 0, 0)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_tripbalancing on auth.users;
create trigger on_auth_user_created_tripbalancing
after insert on auth.users
for each row execute procedure public.handle_new_tripbalancing_user();

alter table public.user_profiles enable row level security;

drop policy if exists "Users can view own profile" on public.user_profiles;
drop policy if exists "Users can read own profile" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Users can delete own profile" on public.user_profiles;
drop policy if exists "Users can update own packing preferences" on public.user_profiles;

create policy "Users can view own profile" on public.user_profiles
for select to authenticated
using (auth.uid() = id);

-- RLS is row-level, so column grants are also used: the browser may update ONLY
-- packing preferences. plan/is_premium/free_trips_used/paid_trips_balance remain
-- server/service-role owned.
create policy "Users can update own packing preferences" on public.user_profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

revoke all on public.user_profiles from anon;
revoke insert, delete on public.user_profiles from authenticated;
revoke update on public.user_profiles from authenticated;
grant select on public.user_profiles to authenticated;
grant update (global_packing_checked, updated_at) on public.user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Trips: owner CRUD + accepted buddy read/write access
-- ---------------------------------------------------------------------------
alter table public.trips enable row level security;

drop policy if exists "Users can view own trips" on public.trips;
drop policy if exists "Users can insert own trips" on public.trips;
drop policy if exists "Users can update own trips" on public.trips;
drop policy if exists "Users can delete own trips" on public.trips;
drop policy if exists "Accepted buddies can view shared trips" on public.trips;
drop policy if exists "Accepted write buddies can update shared trips" on public.trips;

create policy "Users can view own trips" on public.trips
for select to authenticated
using (auth.uid() = user_id);

create policy "Accepted buddies can view shared trips" on public.trips
for select to authenticated
using (
  exists (
    select 1 from public.buddy_invitations bi
    where bi.trip_id = trips.id
      and bi.status = 'accepted'
      and lower(bi.recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create policy "Users can insert own trips" on public.trips
for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own trips" on public.trips
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Accepted write buddies can update shared trips" on public.trips
for update to authenticated
using (
  exists (
    select 1 from public.buddy_invitations bi
    where bi.trip_id = trips.id
      and bi.status = 'accepted'
      and bi.access_type = 'write'
      and lower(bi.recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
with check (
  exists (
    select 1 from public.buddy_invitations bi
    where bi.trip_id = trips.id
      and bi.status = 'accepted'
      and bi.access_type = 'write'
      and lower(bi.recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

create policy "Users can delete own trips" on public.trips
for delete to authenticated
using (auth.uid() = user_id);

revoke all on public.trips from anon;
grant select, insert, update, delete on public.trips to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Buddy invitations: sender must own trip; recipient alone changes status
-- ---------------------------------------------------------------------------
alter table public.buddy_invitations enable row level security;

drop policy if exists "Users can view invitations they sent or received" on public.buddy_invitations;
drop policy if exists "Users can insert invitations" on public.buddy_invitations;
drop policy if exists "Users can update invitations they sent or received" on public.buddy_invitations;
drop policy if exists "Recipients can update invitation status" on public.buddy_invitations;

create policy "Users can view invitations they sent or received" on public.buddy_invitations
for select to authenticated
using (
  lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or lower(sender_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "Users can insert invitations" on public.buddy_invitations
for insert to authenticated
with check (
  lower(sender_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and status = 'pending'
  and access_type in ('read', 'write')
  and exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid())
);

create policy "Recipients can update invitation status" on public.buddy_invitations
for update to authenticated
using (lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
with check (
  lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and status in ('accepted', 'declined')
);

revoke all on public.buddy_invitations from anon;
revoke update on public.buddy_invitations from authenticated;
grant select, insert on public.buddy_invitations to authenticated;
grant update (status) on public.buddy_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Financial/admin/support tables: browser is read-only where appropriate.
-- Writes go through the authenticated Express backend using the service role.
-- ---------------------------------------------------------------------------
-- Remove impossible duplicate state before adding uniqueness. Payment history remains
-- authoritative in the payments table; duplicate rows for the SAME Razorpay payment ID
-- are replay artifacts, not separate transactions.
with ranked as (
  select id, row_number() over (partition by razorpay_payment_id order by created_at asc, id asc) rn
  from public.payments
  where razorpay_payment_id is not null
)
delete from public.payments p using ranked r where p.id = r.id and r.rn > 1;

-- subscriptions is a CURRENT-entitlement table; keep only the newest row per user.
with ranked as (
  select id, row_number() over (partition by user_id order by purchase_date desc, created_at desc, id desc) rn
  from public.subscriptions
  where user_id is not null
)
delete from public.subscriptions s using ranked r where s.id = r.id and r.rn > 1;

-- A payment may have only one refund request at a time; keep the first submitted request.
with ranked as (
  select id, row_number() over (partition by user_id, razorpay_payment_id order by created_at asc, id asc) rn
  from public.refund_requests
  where user_id is not null
)
delete from public.refund_requests rr using ranked r where rr.id = r.id and r.rn > 1;

create unique index if not exists payments_razorpay_payment_id_uidx
  on public.payments (razorpay_payment_id);
create unique index if not exists subscriptions_user_id_uidx
  on public.subscriptions (user_id) where user_id is not null;
create unique index if not exists refund_requests_user_payment_uidx
  on public.refund_requests (user_id, razorpay_payment_id) where user_id is not null;

alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.refund_requests enable row level security;
alter table public.admin_users enable row level security;
alter table public.failed_admin_access_logs enable row level security;

-- Remove broad/old policies first.
drop policy if exists "Users can read own payments" on public.payments;
drop policy if exists "Users can read own subscription" on public.subscriptions;
drop policy if exists "Users can create support tickets" on public.support_tickets;
drop policy if exists "Users can read own support tickets" on public.support_tickets;
drop policy if exists "Users can create refund requests" on public.refund_requests;
drop policy if exists "Users can read own refund requests" on public.refund_requests;
drop policy if exists "Users can read own admin status" on public.admin_users;

create policy "Users can read own payments" on public.payments
for select to authenticated
using (auth.uid() = user_id);

create policy "Users can read own subscription" on public.subscriptions
for select to authenticated
using (auth.uid() = user_id);

create policy "Users can read own support tickets" on public.support_tickets
for select to authenticated
using (auth.uid() = user_id);

create policy "Users can read own refund requests" on public.refund_requests
for select to authenticated
using (auth.uid() = user_id);

create policy "Users can read own admin status" on public.admin_users
for select to authenticated
using (auth.uid() = user_id);

revoke all on public.payments from anon;
revoke all on public.subscriptions from anon;
revoke all on public.support_tickets from anon;
revoke all on public.refund_requests from anon;
revoke all on public.admin_users from anon;
revoke all on public.failed_admin_access_logs from anon, authenticated;

revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.support_tickets from authenticated;
revoke insert, update, delete on public.refund_requests from authenticated;
revoke insert, update, delete on public.admin_users from authenticated;

grant select on public.payments, public.subscriptions, public.support_tickets, public.refund_requests, public.admin_users to authenticated;

commit;
