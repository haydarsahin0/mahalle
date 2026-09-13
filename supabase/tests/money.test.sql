-- Money and ownership rules, exercised against a real Postgres.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/money.test.sql
-- Safe on a scratch database only: it creates its own users and rolls everything back.
begin;

create or replace function pg_temp.as_role(p_role text, p_user uuid default null) returns void language sql as
$$ select set_config('role', p_role, true); select set_config('request.jwt.claim.sub', coalesce(p_user::text,''), true) $$;
-- Row level security hides other players' balances, so checks read them as the table owner.
create or replace function pg_temp.balance_of(p uuid) returns bigint language sql security definer as
$$ select balance from public.profiles where id = p $$;
create or replace function pg_temp.fails(p_sql text, p_needle text) returns boolean language plpgsql as $$
begin execute p_sql; return false;
exception when others then
  if position(p_needle in sqlerrm) = 0 then raise exception 'beklenen hata "%" yerine: %', p_needle, sqlerrm; end if;
  return true; end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ayse@example.com', '{"name":"Ayşe"}'),
  ('22222222-2222-2222-2222-222222222222', 'burak@example.com', '{"name":"Burak"}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'her kullanıcıya profil açılmalı';
  assert (select balance from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 0, 'yeni hesap sıfır jetonla başlar';
  assert (select name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Ayşe', 'isim kayıttan gelir';
end $$;

-- The price comes from the edge function, so a signed-in browser must not be able to call the
-- writer itself: otherwise it would simply name its own price.
do $$ begin
  perform pg_temp.as_role('authenticated', '11111111-1111-1111-1111-111111111111');
  assert pg_temp.fails($q$ select public.commit_action('11111111-1111-1111-1111-111111111111','buy','TR-16429-19966-4',0,32.8,39.9,3000) $q$,
    'permission denied'), 'oyuncu commit_action çağıramamalı';
  assert pg_temp.fails($q$ select public.credit_payment('cs_free','11111111-1111-1111-1111-111111111111','avantajli',500,40000) $q$,
    'permission denied'), 'oyuncu kendine jeton yükleyememeli';
  assert pg_temp.fails($q$ insert into public.parcels (id,owner_id,lon,lat,area) values ('TR-1-1-1','11111111-1111-1111-1111-111111111111',32.8,39.9,100) $q$,
    'permission denied'), 'oyuncu doğrudan parsel yazamamalı';
  assert pg_temp.fails($q$ update public.profiles set balance = 999999 where id = '11111111-1111-1111-1111-111111111111' $q$,
    'permission denied'), 'oyuncu bakiyesini değiştirememeli';
  perform pg_temp.as_role('postgres');
end $$;

-- A paid Stripe session credits once, and only once.
do $$ declare v bigint; begin
  -- The webhook runs with the service role, so prove that key can credit, then read results
  -- as the table owner (this scratch role has no select grants of its own).
  perform pg_temp.as_role('service_role');
  v := public.credit_payment('cs_test_1', '11111111-1111-1111-1111-111111111111', 'avantajli', 500, 40000);
  perform pg_temp.as_role('postgres');
  assert v = 500, format('ilk ödeme 500 jeton yüklemeli, %s geldi', v);
  v := public.credit_payment('cs_test_1', '11111111-1111-1111-1111-111111111111', 'avantajli', 500, 40000);
  assert v = 500, 'aynı oturum ikinci kez jeton yüklememeli';
  assert (select count(*) from public.payments) = 1, 'ödeme kaydı tek olmalı';
  v := public.credit_payment('cs_test_2', '22222222-2222-2222-2222-222222222222', 'baslangic', 100, 10000);
  assert v = 100, 'ikinci kullanıcı 100 jeton almalı';
  v := public.credit_payment('cs_test_3', '11111111-1111-1111-1111-111111111111', 'baslangic', 300, 30000);
  assert v = 800, 'ikinci paket bakiyeye eklenmeli';
end $$;

-- Buying: funds are checked, the parcel row appears, the balance drops.
do $$ declare ayse uuid := '11111111-1111-1111-1111-111111111111'; begin
  -- The action edge function also runs with the service role.
  perform pg_temp.as_role('service_role');
  assert pg_temp.fails(format($q$ select public.commit_action(%L,'buy','TR-16429-19966-4',1200,32.8,39.9,3000) $q$, ayse), 'Yeterli jetonun yok'),
    'bakiyeden fazlasını harcayamamalı';
  assert pg_temp.balance_of(ayse) = 800, 'başarısız alım bakiyeyi değiştirmemeli';
  perform public.commit_action(ayse,'buy','TR-16429-19966-4',300,32.8,39.9,3000);
  perform pg_temp.as_role('postgres');
  assert pg_temp.balance_of(ayse) = 500, 'alım bakiyeden düşmeli';
  assert (select owner_id from public.parcels where id = 'TR-16429-19966-4') = ayse, 'parsel alıcıya geçmeli';
  assert pg_temp.fails(format($q$ select public.commit_action(%L,'buy','TR-16429-19966-4',300,32.8,39.9,3000) $q$, ayse), 'zaten senin'),
    'kendi parselini tekrar alamamalı';
end $$;

-- Building and floor limits.
do $$ declare ayse uuid := '11111111-1111-1111-1111-111111111111'; begin
  perform public.commit_action(ayse,'build','TR-16429-19966-4',60,32.8,39.9,3000,'home',3::smallint);
  assert (select building from public.parcels where id = 'TR-16429-19966-4') = 'home', 'yapı kaydedilmeli';
  assert (select level from public.parcels where id = 'TR-16429-19966-4') = 1, 'konut 1. kattan başlar';
  assert pg_temp.fails(format($q$ select public.commit_action(%L,'build','TR-16429-19966-4',60,32.8,39.9,3000,'home',3::smallint) $q$, ayse), 'zaten bir yapı var'),
    'ikinci yapıya izin vermemeli';
  perform public.commit_action(ayse,'upgrade','TR-16429-19966-4',45,32.8,39.9,3000,null,3::smallint);
  perform public.commit_action(ayse,'upgrade','TR-16429-19966-4',90,32.8,39.9,3000,null,3::smallint);
  assert (select level from public.parcels where id = 'TR-16429-19966-4') = 3, 'üç kata çıkmalı';
  assert pg_temp.fails(format($q$ select public.commit_action(%L,'upgrade','TR-16429-19966-4',135,32.8,39.9,3000,null,3::smallint) $q$, ayse), 'kat sınırına'),
    'kat sınırı aşılamamalı';
end $$;

-- Someone else's parcel is untouchable, and a listing sells at the price its owner set.
do $$ declare ayse uuid := '11111111-1111-1111-1111-111111111111'; burak uuid := '22222222-2222-2222-2222-222222222222';
  v_ayse bigint; v_burak bigint; begin
  perform public.commit_action(ayse,'list','TR-16429-19966-4',0,32.8,39.9,3000,null,0::smallint,60);
  assert pg_temp.fails(format($q$ select public.commit_action(%L,'build','TR-16429-19966-4',60,32.8,39.9,3000,'cafe',5::smallint) $q$, burak), 'sana ait değil'),
    'başkasının parseline yapı yapılamamalı';
  assert pg_temp.fails(format($q$ select public.commit_action(%L,'buy','TR-16429-19966-4',1,32.8,39.9,3000) $q$, burak), 'İlan fiyatı değişti'),
    'ilan fiyatının altında satın alınamamalı';
  perform public.commit_action(burak,'buy','TR-16429-19966-4',60,32.8,39.9,3000);
  v_ayse := pg_temp.balance_of(ayse); v_burak := pg_temp.balance_of(burak);
  assert v_ayse = 365, format('satıcıya 60 jeton geçmeli, bakiye %s', v_ayse);
  assert v_burak = 40, format('alıcıdan 60 jeton düşmeli, bakiye %s', v_burak);
  assert (select listing from public.parcels where id = 'TR-16429-19966-4') is null, 'satıştan sonra ilan kalkmalı';
  assert (select owner_id from public.parcels where id = 'TR-16429-19966-4') = burak, 'parsel el değiştirmeli';
end $$;

-- What a signed-in browser may see of all this.
do $$ begin
  perform pg_temp.as_role('authenticated', '22222222-2222-2222-2222-222222222222');
  assert (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 0,
    'satır güvenliği başkasının profilini gizlemeli';
  assert (select count(*) from public.profiles) = 1, 'oyuncu yalnızca kendi profilini görmeli';
  assert (select count(*) from public.parcels) = 1, 'harita herkese açık okunabilmeli';
  assert (select count(*) from public.payments) = 1, 'oyuncu yalnızca kendi ödemelerini görmeli';
  perform pg_temp.as_role('postgres');
end $$;

-- Balances never go negative and every move is on the ledger.
do $$ begin
  assert (select count(*) from public.profiles where balance < 0) = 0, 'bakiye eksiye düşemez';
  assert (select count(*) from public.activity where action = 'buy') = 2, 'iki alım kaydı olmalı';
  assert (select count(*) from public.activity where action = 'topup') = 3, 'üç jeton yüklemesi kaydı olmalı';
end $$;

select 'tüm para, mülkiyet ve yetki kuralları geçti' as sonuc;
rollback;
