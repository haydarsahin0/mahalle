-- Ödenmiş bir Stripe oturumu asla sessizce kaybolmasın.
--
-- Görülen arıza: profili olmayan bir kullanıcı ödeme yaptığında credit_payment, payments
-- tablosundaki yabancı anahtar yüzünden hata veriyordu; webhook 500, dönüş doğrulaması 502
-- dönüyor ve para alınmış olmasına rağmen jeton yüklenmiyordu. Aşağısı üç şey yapar:
-- profili kendi kendine onarır, yüklenemeyen her ödemeyi kaydeder ve elle telafi için
-- güvenli bir yol bırakır.

-- ---------------------------------------------------------------- profil onarımı
create or replace function public.ensure_profile(p_user uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles; v_name text;
begin
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is not null then return v_profile; end if;

  select coalesce(
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    case when nullif(u.phone, '') is not null then 'Komşu ' || right(u.phone, 4) end,
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Komşu')
  into v_name from auth.users u where u.id = p_user;
  if v_name is null then raise exception 'Kullanıcı bulunamadı: %', p_user using errcode = 'P0002'; end if;

  insert into public.profiles (id, name) values (p_user, left(v_name, 40))
  on conflict (id) do nothing;
  select * into v_profile from public.profiles where id = p_user;
  return v_profile;
end $$;

revoke all on function public.ensure_profile(uuid) from public, anon, authenticated;
grant execute on function public.ensure_profile(uuid) to service_role;

-- Tetikleyicinin atladığı ya da şema kurulmadan önce açılmış hesaplar için tek seferlik onarım.
insert into public.profiles (id, name)
select u.id, left(coalesce(
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    case when nullif(u.phone, '') is not null then 'Komşu ' || right(u.phone, 4) end,
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Komşu'), 40)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ---------------------------------------------------------------- kaydedilemeyen ödemeler
-- Hiçbir yabancı anahtarı yok: kayıt her koşulda düşsün, sonradan elle telafi edilebilsin.
create table if not exists public.payment_issues (
  id bigserial primary key,
  session_id text,
  user_id uuid,
  reason text not null,
  amount_kurus integer,
  currency text,
  payload jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payment_issues_session_idx on public.payment_issues (session_id);
create unique index if not exists payment_issues_open_idx on public.payment_issues (session_id, reason)
  where resolved_at is null;

alter table public.payment_issues enable row level security;
revoke all on table public.payment_issues from anon, authenticated;

create or replace function public.record_payment_issue(
  p_session text, p_user uuid, p_reason text, p_amount integer default null,
  p_currency text default null, p_payload jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_issues (session_id, user_id, reason, amount_kurus, currency, payload)
  values (p_session, p_user, left(coalesce(p_reason,'bilinmiyor'), 200), p_amount, p_currency, p_payload)
  on conflict do nothing;
exception when others then
  -- Kayıt tutmak asla ödeme akışını bozmasın.
  raise warning 'payment_issues yazılamadı: %', sqlerrm;
end $$;

revoke all on function public.record_payment_issue(text, uuid, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_issue(text, uuid, text, integer, text, jsonb) to service_role;

-- ---------------------------------------------------------------- jeton yükleme
-- Profili kendi kendine onarır ve bakiye gerçekten artmadıysa hata verir: böylece Stripe
-- tekrar dener, ödeme kaydı da yüklenmemiş jetonla birlikte ortada kalmaz.
create or replace function public.credit_payment(
  p_session text, p_user uuid, p_pack text, p_jetons bigint, p_amount integer
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint;
begin
  if p_user is null then raise exception 'Kullanıcı belirtilmedi.' using errcode = 'P0002'; end if;
  if p_jetons is null or p_jetons <= 0 then raise exception 'Geçersiz jeton miktarı: %', p_jetons; end if;
  perform public.ensure_profile(p_user);

  insert into public.payments (id, user_id, pack, jetons, amount_try)
  values (p_session, p_user, p_pack, p_jetons, p_amount)
  on conflict (id) do nothing;
  if not found then
    select balance into v_balance from public.profiles where id = p_user;
    return v_balance;                        -- aynı oturum daha önce yüklendi
  end if;

  update public.profiles set balance = balance + p_jetons where id = p_user returning balance into v_balance;
  if v_balance is null then raise exception 'Bakiye güncellenemedi: %', p_user; end if;
  insert into public.activity (user_id, action, amount) values (p_user, 'topup', p_jetons);
  update public.payment_issues set resolved_at = now() where session_id = p_session and resolved_at is null;
  return v_balance;
end $$;

revoke all on function public.credit_payment(text, uuid, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.credit_payment(text, uuid, text, bigint, integer) to service_role;

-- ---------------------------------------------------------------- elle telafi
-- Ödemesi kaybolan bir oyuncuya jetonunu vermek için. E-posta ya da telefonla çalışır,
-- aynı referansla ikinci kez çağrıldığında bakiyeyi tekrar artırmaz.
create or replace function public.credit_manual(
  p_contact text, p_jetons bigint, p_reference text
) returns table (email text, phone text, jetons bigint, balance bigint)
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_balance bigint; v_contact text := lower(trim(p_contact));
begin
  if p_reference is null or length(trim(p_reference)) < 3 then
    raise exception 'Referans ver: hangi ödeme için telafi edildiğini yazan kısa bir metin.';
  end if;
  select u.id into v_user from auth.users u
   where lower(u.email) = v_contact or u.phone = p_contact or u.phone = replace(p_contact, '+', '')
   order by u.created_at limit 1;
  if v_user is null then raise exception 'Bu e-posta ya da telefonla hesap bulunamadı: %', p_contact; end if;

  v_balance := public.credit_payment('manual:' || trim(p_reference), v_user, 'manual', p_jetons, (p_jetons * 100)::integer);
  return query
    select u.email, u.phone, p_jetons, v_balance from auth.users u where u.id = v_user;
end $$;

revoke all on function public.credit_manual(text, bigint, text) from public, anon, authenticated;
grant execute on function public.credit_manual(text, bigint, text) to service_role;

-- ---------------------------------------------------------------- tek bakışta durum
create or replace view public.payment_health as
  select 'yuklenen' as tur, p.created_at, p.id as session_id, p.user_id, p.pack, p.jetons, p.amount_try as kurus, null::text as sebep
    from public.payments p
  union all
  select 'sorunlu', i.created_at, i.session_id, i.user_id, i.reason, null::bigint, i.amount_kurus, i.reason
    from public.payment_issues i where i.resolved_at is null;
revoke all on public.payment_health from anon, authenticated;
