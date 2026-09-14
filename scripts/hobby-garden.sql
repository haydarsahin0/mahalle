-- Cosmetic progress only: never used to grant tokens, money, or ownership.
create table public.hobby_gardens (
 user_id uuid not null references auth.users(id) on delete cascade,
 parcel_id text not null references public.parcels(id) on delete cascade,
 state jsonb not null default '{}' check (jsonb_typeof(state)='object' and octet_length(state::text)<20000),
 revision integer not null default 0 check (revision>=0),
 primary key(user_id,parcel_id)
);
alter table public.hobby_gardens enable row level security;
revoke all on public.hobby_gardens from anon,authenticated;
grant select,insert,update on public.hobby_gardens to authenticated;
create policy garden_owner on public.hobby_gardens for all to authenticated
using ((select auth.uid())=user_id and exists(select 1 from public.parcels p where p.id=parcel_id and p.owner_id=(select auth.uid())))
with check ((select auth.uid())=user_id and exists(select 1 from public.parcels p where p.id=parcel_id and p.owner_id=(select auth.uid())));
