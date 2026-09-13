-- Phone-first accounts and one server-assigned welcome parcel per player.
alter table public.profiles
  add column if not exists welcome_gift_claimed boolean not null default false,
  add column if not exists welcome_gift_parcel_id text unique,
  add column if not exists welcome_gift_claimed_at timestamptz;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    case when nullif(new.phone, '') is not null then 'Komşu ' || right(new.phone, 4) end,
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Komşu'
  );
  insert into public.profiles (id, name) values (new.id, left(v_name, 40))
  on conflict (id) do nothing;
  return new;
end $$;

-- Candidate geometry is produced by the trusted Edge Function with the same map rules as
-- the browser. This transaction locks the profile and takes the first still-free candidate.
-- Repeated or concurrent calls return the original parcel rather than granting another one.
create or replace function public.claim_welcome_gift(p_user uuid, p_candidates jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_parcel public.parcels%rowtype;
  v_candidate jsonb;
begin
  if p_user is null then raise exception 'Lütfen giriş yap.' using errcode = '28000'; end if;
  select * into v_profile from public.profiles where id = p_user for update;
  if v_profile.id is null then raise exception 'Hesap bulunamadı.'; end if;

  if v_profile.welcome_gift_claimed then
    select * into v_parcel from public.parcels
      where id = v_profile.welcome_gift_parcel_id and owner_id = p_user;
    if v_parcel.id is null then raise exception 'Hediye parsel kaydı bulunamadı.'; end if;
    return jsonb_build_object('parcel', to_jsonb(v_parcel), 'was_new', false);
  end if;

  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) = 0 then
    raise exception 'Hediye parsel adayı bulunamadı.';
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    insert into public.parcels (id, owner_id, lon, lat, area, bought_for)
    values (
      v_candidate->>'id', p_user, (v_candidate->>'lon')::double precision,
      (v_candidate->>'lat')::double precision, (v_candidate->>'area')::integer, 0
    )
    on conflict (id) do nothing returning * into v_parcel;
    if v_parcel.id is not null then
      update public.profiles set welcome_gift_claimed = true,
        welcome_gift_parcel_id = v_parcel.id, welcome_gift_claimed_at = now()
        where id = p_user;
      insert into public.activity (user_id, action, parcel_id, amount)
        values (p_user, 'welcome_gift', v_parcel.id, 0);
      return jsonb_build_object('parcel', to_jsonb(v_parcel), 'was_new', true);
    end if;
    v_parcel := null;
  end loop;
  raise exception 'Boş bir hediye parsel bulunamadı. Tekrar dene.';
end $$;

revoke all on function public.claim_welcome_gift(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_welcome_gift(uuid, jsonb) to service_role;
