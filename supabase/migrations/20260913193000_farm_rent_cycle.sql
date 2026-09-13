-- Small, server-authoritative daily activities for owned virtual parcels.
alter table public.parcels
  add column if not exists crop text check (crop in ('wheat','olive','lavender','greenhouse')),
  add column if not exists crop_planted_at timestamptz,
  add column if not exists crop_ready_at timestamptz,
  add column if not exists rent_price bigint,
  add column if not exists rent_last_collected timestamptz;

create or replace function public.manage_farm(p_user uuid, p_parcel text, p_action text, p_crop text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.parcels%rowtype; v_reward bigint := 0; v_balance bigint;
begin
  select * into v from public.parcels where id=p_parcel and owner_id=p_user for update;
  if v.id is null then raise exception 'Bu parsel sana ait değil.'; end if;
  if v.building <> 'farm' then raise exception 'Bu parselde tarım faaliyeti yapılamaz.'; end if;
  if p_action='plant' then
    if v.crop is not null then raise exception 'Bu tarlada zaten büyüyen bir ürün var.'; end if;
    if p_crop not in ('wheat','olive','lavender','greenhouse') then raise exception 'Geçersiz ürün.'; end if;
    update public.parcels set crop=p_crop,crop_planted_at=now(),crop_ready_at=now()+interval '24 hours',updated_at=now() where id=p_parcel returning * into v;
  elsif p_action='harvest' then
    if v.crop is null then raise exception 'Hasat edilecek ürün yok.'; end if;
    if v.crop_ready_at > now() then raise exception 'Ürün henüz olgunlaşmadı.'; end if;
    v_reward := case v.crop when 'wheat' then 2 when 'olive' then 4 when 'lavender' then 3 else 5 end;
    update public.parcels set crop=null,crop_planted_at=null,crop_ready_at=null,updated_at=now() where id=p_parcel returning * into v;
    update public.profiles set balance=balance+v_reward where id=p_user returning balance into v_balance;
    insert into public.activity(user_id,action,parcel_id,amount) values(p_user,'harvest',p_parcel,v_reward);
  else raise exception 'Geçersiz tarım işlemi.';
  end if;
  return jsonb_build_object('parcel',to_jsonb(v),'reward',v_reward,'balance',coalesce(v_balance,(select balance from public.profiles where id=p_user)));
end $$;
revoke all on function public.manage_farm(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.manage_farm(uuid,text,text,text) to service_role;

create or replace function public.collect_rent(p_user uuid, p_parcel text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.parcels%rowtype; v_reward bigint; v_balance bigint;
begin
  select * into v from public.parcels where id=p_parcel and owner_id=p_user for update;
  if v.id is null then raise exception 'Bu parsel sana ait değil.'; end if;
  if v.building is null or v.building='farm' then raise exception 'Bu yapı kiraya uygun değil.'; end if;
  if v.rent_last_collected is not null and v.rent_last_collected > now()-interval '24 hours' then raise exception 'Kira henüz yeniden birikmedi.'; end if;
  v_reward := coalesce(v.rent_price,case when v.building='home' then 2 else 4 end);
  update public.parcels set rent_price=v_reward,rent_last_collected=now(),updated_at=now() where id=p_parcel returning * into v;
  update public.profiles set balance=balance+v_reward where id=p_user returning balance into v_balance;
  insert into public.activity(user_id,action,parcel_id,amount) values(p_user,'rent',p_parcel,v_reward);
  return jsonb_build_object('parcel',to_jsonb(v),'reward',v_reward,'balance',v_balance);
end $$;
revoke all on function public.collect_rent(uuid,text) from public,anon,authenticated;
grant execute on function public.collect_rent(uuid,text) to service_role;
