-- Ödenmiş oturum hiçbir koşulda kaybolmasın.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/payment-recovery.test.sql
begin;
create or replace function pg_temp.fails(p_sql text, p_needle text) returns boolean language plpgsql as $$
begin execute p_sql; return false;
exception when others then
  if position(p_needle in sqlerrm) = 0 then raise exception 'beklenen hata "%" yerine: %', p_needle, sqlerrm; end if;
  return true; end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'sezgin@example.com', '{"name":"Sezgin"}'),
  ('55555555-5555-5555-5555-555555555555', 'ramazan@example.com', '{"name":"Ramazan"}');

-- Profil satırı kaybolmuş bir oyuncu ödeme yapıyor: eskiden yabancı anahtar hatası veriyordu.
do $$ declare v bigint; begin
  delete from public.profiles where id = '44444444-4444-4444-4444-444444444444';
  v := public.credit_payment('cs_live_kayip', '44444444-4444-4444-4444-444444444444', 'custom', 60, 6000);
  assert v = 60, format('profil onarılıp 60 jeton yüklenmeli, %s geldi', v);
  assert (select count(*) from public.profiles where id = '44444444-4444-4444-4444-444444444444') = 1,
    'eksik profil kendiliğinden açılmalı';
end $$;

-- Aynı oturum iki kez işlenirse (webhook + dönüş doğrulaması) bakiye bir kez artar.
do $$ declare v bigint; begin
  v := public.credit_payment('cs_live_kayip', '44444444-4444-4444-4444-444444444444', 'custom', 60, 6000);
  assert v = 60, 'aynı oturum ikinci kez jeton yüklememeli';
  assert (select count(*) from public.payments where id = 'cs_live_kayip') = 1, 'ödeme kaydı tek olmalı';
end $$;

-- Yüklenemeyen ödeme iz bırakır; yüklendiğinde iz kapanır.
do $$ begin
  perform public.record_payment_issue('cs_live_tanimsiz', '55555555-5555-5555-5555-555555555555',
    'paket tanınmadı', 40000, 'try', '{"kind":"topup"}'::jsonb);
  assert (select count(*) from public.payment_issues where resolved_at is null) = 1, 'sorun kaydı düşmeli';
  perform public.credit_payment('cs_live_tanimsiz', '55555555-5555-5555-5555-555555555555', 'avantajli', 500, 40000);
  assert (select count(*) from public.payment_issues where resolved_at is null) = 0, 'yükleme sonrası iz kapanmalı';
  assert (select balance from public.profiles where id = '55555555-5555-5555-5555-555555555555') = 500, 'bakiye artmalı';
end $$;

-- Elle telafi: e-postayla bulur, ikinci çağrıda tekrar yüklemez, referanssız çalışmaz.
do $$ declare v bigint; begin
  perform public.credit_manual('ramazan@example.com', 1000, 'stripe cs_live_abc iki adet 400 TL');
  select balance into v from public.profiles where id = '55555555-5555-5555-5555-555555555555';
  assert v = 1500, format('telafi sonrası 1500 olmalı, %s', v);
  perform public.credit_manual('ramazan@example.com', 1000, 'stripe cs_live_abc iki adet 400 TL');
  select balance into v from public.profiles where id = '55555555-5555-5555-5555-555555555555';
  assert v = 1500, 'aynı referansla ikinci telafi bakiyeyi artırmamalı';
  assert pg_temp.fails($q$ select public.credit_manual('yok@example.com', 100, 'deneme') $q$, 'hesap bulunamadı'),
    'olmayan hesaba telafi yapılamamalı';
  assert pg_temp.fails($q$ select public.credit_manual('ramazan@example.com', 100, '') $q$, 'Referans ver'),
    'referanssız telafi yapılamamalı';
end $$;

-- Oyuncu bu araçların hiçbirine erişemez.
do $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
  assert pg_temp.fails($q$ select public.credit_manual('ramazan@example.com', 9999, 'kendine jeton') $q$, 'permission denied'),
    'oyuncu elle telafi çağıramamalı';
  assert pg_temp.fails($q$ select public.ensure_profile('55555555-5555-5555-5555-555555555555') $q$, 'permission denied'),
    'oyuncu profil onarımını çağıramamalı';
  assert pg_temp.fails($q$ select count(*) from public.payment_issues $q$, 'permission denied'),
    'oyuncu ödeme sorunlarını okuyamamalı';
  perform set_config('role', 'postgres', true);
end $$;

select 'ödeme kurtarma kuralları geçti' as sonuc;
rollback;
