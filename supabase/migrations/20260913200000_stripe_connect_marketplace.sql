-- Stripe Connect marketplace settlement.
-- A parcel sale is a real-money Stripe payment; game jetons stay separate.

alter table public.profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_complete boolean not null default false;

create unique index if not exists profiles_stripe_account_uidx
  on public.profiles (stripe_account_id)
  where stripe_account_id is not null;

create table if not exists public.marketplace_sales (
  id uuid primary key default gen_random_uuid(),
  parcel_id text not null references public.parcels(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  price_tokens bigint not null check (price_tokens >= 10),
  amount_kurus integer not null check (amount_kurus > 0),
  commission_kurus integer not null check (commission_kurus >= 0),
  seller_kurus integer not null check (seller_kurus >= 0),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending','paid','cancelled','failed','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create unique index if not exists marketplace_sales_pending_parcel_uidx
  on public.marketplace_sales (parcel_id) where status = 'pending';
create index if not exists marketplace_sales_buyer_idx on public.marketplace_sales (buyer_id, created_at desc);
create index if not exists marketplace_sales_seller_idx on public.marketplace_sales (seller_id, created_at desc);

alter table public.marketplace_sales enable row level security;
drop policy if exists "own marketplace sales" on public.marketplace_sales;
create policy "own marketplace sales" on public.marketplace_sales for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id);
grant select on public.marketplace_sales to authenticated;
revoke insert, update, delete on public.marketplace_sales from anon, authenticated;

-- Reserve one listing before opening Checkout. This prevents two buyers from paying for
-- the same parcel at the same time. It does not move money or change ownership.
create or replace function public.reserve_marketplace_sale(p_buyer uuid, p_parcel text)
returns public.marketplace_sales language plpgsql security definer set search_path = public as $$
declare
  v_parcel public.parcels;
  v_sale public.marketplace_sales;
  v_price bigint;
begin
  if p_buyer is null then raise exception 'Lütfen giriş yap.' using errcode = '28000'; end if;
  select * into v_parcel from public.parcels where id = p_parcel for update;
  if v_parcel.id is null or v_parcel.listing is null then raise exception 'Bu parsel artık satışta değil.'; end if;
  if v_parcel.owner_id = p_buyer then raise exception 'Kendi parselini satın alamazsın.'; end if;
  if exists (select 1 from public.marketplace_sales where parcel_id = p_parcel and status = 'pending') then
    raise exception 'Bu parsel için başka bir ödeme başlatılmış. Birkaç dakika sonra tekrar dene.';
  end if;
  v_price := v_parcel.listing;
  insert into public.marketplace_sales
    (parcel_id, buyer_id, seller_id, price_tokens, amount_kurus, commission_kurus, seller_kurus)
  values
    (p_parcel, p_buyer, v_parcel.owner_id, v_price, v_price * 100,
     floor(v_price * 100 * 10 / 100)::integer,
     (v_price * 100 - floor(v_price * 100 * 10 / 100))::integer)
  returning * into v_sale;
  return v_sale;
end $$;

revoke all on function public.reserve_marketplace_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_marketplace_sale(uuid, text) to service_role;

-- Called only by the signed Stripe webhook. Ownership changes after Stripe confirms payment.
create or replace function public.settle_marketplace_sale(
  p_session text, p_payment_intent text default null
) returns public.marketplace_sales language plpgsql security definer set search_path = public as $$
declare
  v_sale public.marketplace_sales;
  v_parcel public.parcels;
begin
  select * into v_sale from public.marketplace_sales where stripe_session_id = p_session for update;
  if v_sale.id is null then raise exception 'Satış kaydı bulunamadı.'; end if;
  if v_sale.status = 'paid' then return v_sale; end if;
  if v_sale.status <> 'pending' then raise exception 'Satış artık aktif değil.'; end if;
  select * into v_parcel from public.parcels where id = v_sale.parcel_id for update;
  if v_parcel.id is null or v_parcel.owner_id <> v_sale.seller_id or v_parcel.listing <> v_sale.price_tokens then
    raise exception 'İlan ödeme sırasında değişti.';
  end if;
  update public.parcels
    set owner_id = v_sale.buyer_id, listing = null, bought_for = v_sale.price_tokens, updated_at = now()
    where id = v_sale.parcel_id;
  update public.marketplace_sales
    set status = 'paid', stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id), paid_at = now()
    where id = v_sale.id
    returning * into v_sale;
  insert into public.activity (user_id, action, parcel_id, amount)
    values (v_sale.buyer_id, 'buy_stripe', v_sale.parcel_id, v_sale.price_tokens);
  insert into public.activity (user_id, action, parcel_id, amount)
    values (v_sale.seller_id, 'sale_stripe', v_sale.parcel_id, v_sale.price_tokens);
  return v_sale;
end $$;

revoke all on function public.settle_marketplace_sale(text, text) from public, anon, authenticated;
grant execute on function public.settle_marketplace_sale(text, text) to service_role;

create or replace function public.cancel_marketplace_sale(p_session text, p_status text default 'cancelled')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('cancelled','failed') then raise exception 'Geçersiz satış durumu.'; end if;
  update public.marketplace_sales set status = p_status
    where stripe_session_id = p_session and status = 'pending';
end $$;
revoke all on function public.cancel_marketplace_sale(text, text) from public, anon, authenticated;
grant execute on function public.cancel_marketplace_sale(text, text) to service_role;
