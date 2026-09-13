-- Dijital Arsam on Supabase. One jeton is one Turkish lira.
-- Balances and parcel ownership only ever change inside the SECURITY DEFINER functions at the
-- bottom of this file, so a browser holding an anon key can read the world but never write it.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Komşu' check (char_length(name) between 1 and 40),
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);
comment on column public.profiles.balance is 'Jetons owned. 1 jeton = 1 TRY. Never redeemable for money.';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- parcels
-- A row exists only once a parcel has been bought. Everything else about a parcel (shape,
-- zoning, price) is derived from the bundled map data, identically on both sides.
create table if not exists public.parcels (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  lon double precision not null,
  lat double precision not null,
  area integer not null check (area > 0),
  building text check (building in ('farm','home','cafe','shop','fuel')),
  level smallint not null default 0 check (level >= 0 and level <= 5),
  listing bigint check (listing >= 10 and listing <= 1000000),
  bought_for bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists parcels_owner_idx on public.parcels (owner_id);
create index if not exists parcels_listing_idx on public.parcels (listing) where listing is not null;
create index if not exists parcels_bbox_idx on public.parcels (lon, lat);

-- ---------------------------------------------------------------- money
create table if not exists public.payments (
  id text primary key,                       -- Stripe Checkout session id
  user_id uuid not null references public.profiles(id) on delete cascade,
  pack text not null,
  jetons bigint not null check (jetons > 0),
  amount_try integer not null check (amount_try > 0),   -- kuruş actually charged
  status text not null default 'paid',
  created_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);

create table if not exists public.activity (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  parcel_id text,
  amount bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activity_user_idx on public.activity (user_id, created_at desc);

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.parcels  enable row level security;
alter table public.payments enable row level security;
alter table public.activity enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
-- Only the display name is the player's to change; balance moves through the functions below.
drop policy if exists "rename self" on public.profiles;
create policy "rename self" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id and balance = (select p.balance from public.profiles p where p.id = auth.uid()));

-- The map is public: anyone may read who owns what and what is for sale.
drop policy if exists "parcels are public" on public.parcels;
create policy "parcels are public" on public.parcels for select using (true);

drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for select using (auth.uid() = user_id);
drop policy if exists "own activity" on public.activity;
create policy "own activity" on public.activity for select using (auth.uid() = user_id);

-- Table privileges are spelled out rather than left to defaults: the browser may read the map
-- and its own rows, and may rename itself, but holds no write grant on anything else. With no
-- insert/update/delete policy either, PostgREST refuses every direct write; the SECURITY
-- DEFINER functions below run as the table owner and are the only way in.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.parcels to anon, authenticated;
grant select on public.profiles, public.payments, public.activity to authenticated;
grant update (name) on public.profiles to authenticated;
revoke insert, update, delete on public.parcels, public.payments, public.activity from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

-- ---------------------------------------------------------------- the only writer
-- The price of a parcel can only be worked out from the map data, which lives in JavaScript,
-- so the edge function computes it and this function owns the money. That makes the cost an
-- argument, which is exactly why execute is granted to service_role alone: if a player could
-- call this directly they would name their own price. The edge function verifies the caller's
-- JWT and passes the user id it read from it.
create or replace function public.commit_action(
  p_user uuid, p_action text, p_parcel text, p_cost bigint, p_lon double precision, p_lat double precision,
  p_area integer, p_building text default null, p_max_level smallint default 0, p_price bigint default null
) returns public.parcels language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := p_user;
  v_row public.parcels;
  v_seller uuid;
  v_balance bigint;
begin
  if v_user is null then raise exception 'Lütfen giriş yap.' using errcode = '28000'; end if;
  if p_cost < 0 then raise exception 'Geçersiz tutar.'; end if;

  select * into v_row from public.parcels where id = p_parcel for update;
  select balance into v_balance from public.profiles where id = v_user for update;
  if v_balance is null then raise exception 'Hesap bulunamadı.'; end if;

  -- Rules first, money second, so a player hears why an action is not allowed rather than
  -- being told their balance is short.
  if p_action = 'buy' then
    if v_row.id is not null and v_row.owner_id = v_user then raise exception 'Bu parsel zaten senin.'; end if;
    if v_row.id is not null and v_row.listing is null then raise exception 'Bu parsel satışta değil.'; end if;
    -- A listed parcel costs exactly what its owner asked, never what the client claims.
    if v_row.id is not null and p_cost <> v_row.listing then raise exception 'İlan fiyatı değişti, sayfayı yenile.'; end if;
    v_seller := v_row.owner_id;
  else
    if v_row.id is null or v_row.owner_id <> v_user then raise exception 'Bu parsel sana ait değil.'; end if;
    if p_action = 'build' then
      if v_row.building is not null then raise exception 'Bu parselde zaten bir yapı var.'; end if;
      if p_building is null then raise exception 'Geçersiz yapı.'; end if;
    elsif p_action = 'upgrade' then
      if v_row.building is null or v_row.building = 'farm' then raise exception 'Bu yapı yükseltilemez.'; end if;
      if v_row.level >= p_max_level then raise exception 'İzin verilen kat sınırına ulaştın.'; end if;
    elsif p_action = 'list' then
      if p_price is null or p_price < 10 or p_price > 1000000 then raise exception '10–1.000.000 jeton arasında bir fiyat gir.'; end if;
    elsif p_action <> 'unlist' then
      raise exception 'Geçersiz işlem.';
    end if;
  end if;

  if v_balance < p_cost then raise exception 'Yeterli jetonun yok.' using errcode = 'P0002'; end if;

  if p_action = 'buy' then
    insert into public.parcels (id, owner_id, lon, lat, area, bought_for)
    values (p_parcel, v_user, p_lon, p_lat, p_area, p_cost)
    on conflict (id) do update set owner_id = v_user, listing = null, bought_for = p_cost, updated_at = now();
  elsif p_action = 'build' then
    update public.parcels set building = p_building,
      level = case when p_building = 'farm' then 0 else 1 end, updated_at = now() where id = p_parcel;
  elsif p_action = 'upgrade' then
    update public.parcels set level = level + 1, updated_at = now() where id = p_parcel;
  elsif p_action = 'list' then
    update public.parcels set listing = p_price, updated_at = now() where id = p_parcel;
  elsif p_action = 'unlist' then
    update public.parcels set listing = null, updated_at = now() where id = p_parcel;
  end if;

  if p_cost > 0 then
    update public.profiles set balance = balance - p_cost where id = v_user;
    if v_seller is not null then update public.profiles set balance = balance + p_cost where id = v_seller; end if;
  end if;

  insert into public.activity (user_id, action, parcel_id, amount) values (v_user, p_action, p_parcel, p_cost);
  select * into v_row from public.parcels where id = p_parcel;
  return v_row;
end $$;

revoke all on function public.commit_action(uuid, text, text, bigint, double precision, double precision, integer, text, smallint, bigint) from public, anon, authenticated;
grant execute on function public.commit_action(uuid, text, text, bigint, double precision, double precision, integer, text, smallint, bigint) to service_role;

-- Credits a paid Stripe session exactly once. Called by the webhook with the service role.
create or replace function public.credit_payment(
  p_session text, p_user uuid, p_pack text, p_jetons bigint, p_amount integer
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint;
begin
  insert into public.payments (id, user_id, pack, jetons, amount_try)
  values (p_session, p_user, p_pack, p_jetons, p_amount)
  on conflict (id) do nothing;
  if not found then
    select balance into v_balance from public.profiles where id = p_user;
    return v_balance;                        -- already credited, nothing more to do
  end if;
  update public.profiles set balance = balance + p_jetons where id = p_user returning balance into v_balance;
  insert into public.activity (user_id, action, amount) values (p_user, 'topup', p_jetons);
  return v_balance;
end $$;

revoke all on function public.credit_payment(text, uuid, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.credit_payment(text, uuid, text, bigint, integer) to service_role;
