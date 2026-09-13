-- Small, server-authoritative activities that make a parcel feel alive.
alter table public.parcels
  add column if not exists decorations jsonb not null default '[]'::jsonb,
  add column if not exists last_care_at timestamptz,
  add column if not exists care_streak integer not null default 0;

create or replace function public.manage_plot(
  p_user uuid, p_parcel text, p_action text, p_item text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.parcels%rowtype;
  v_cost bigint := 0;
  v_reward bigint := 0;
  v_balance bigint;
  v_today date := (now() at time zone 'utc')::date;
  v_last date;
begin
  select * into v from public.parcels where id=p_parcel and owner_id=p_user for update;
  if v.id is null then raise exception 'Bu parsel sana ait değil.'; end if;

  if p_action='care' then
    v_last := case when v.last_care_at is null then null else (v.last_care_at at time zone 'utc')::date end;
    if v_last = v_today then raise exception 'Bugünkü ücretsiz bakımını zaten yaptın.'; end if;
    v_reward := 1;
    update public.parcels
      set last_care_at=now(), care_streak=case when v_last=v_today-1 then care_streak+1 else 1 end, updated_at=now()
      where id=p_parcel returning * into v;
    update public.profiles set balance=balance+v_reward where id=p_user returning balance into v_balance;
    insert into public.activity(user_id,action,parcel_id,amount) values(p_user,'care',p_parcel,v_reward);
  elsif p_action='decorate' then
    if p_item not in ('tree','bench','well','chicken','beehive','fountain') then raise exception 'Geçersiz arsa öğesi.'; end if;
    if coalesce(v.decorations,'[]'::jsonb) ? p_item then raise exception 'Bu öğe arsanda zaten var.'; end if;
    v_cost := case p_item when 'tree' then 8 when 'bench' then 6 when 'well' then 10 when 'chicken' then 12 when 'beehive' then 14 when 'fountain' then 18 end;
    select balance into v_balance from public.profiles where id=p_user for update;
    if v_balance < v_cost then raise exception 'Yeterli oyun jetonun yok.'; end if;
    update public.profiles set balance=balance-v_cost where id=p_user returning balance into v_balance;
    update public.parcels set decorations=coalesce(decorations,'[]'::jsonb)||to_jsonb(p_item),updated_at=now() where id=p_parcel returning * into v;
    insert into public.activity(user_id,action,parcel_id,amount) values(p_user,'decorate',p_parcel,v_cost);
  else
    raise exception 'Geçersiz arsa işlemi.';
  end if;
  return jsonb_build_object('parcel',to_jsonb(v),'reward',v_reward,'cost',v_cost,'balance',coalesce(v_balance,(select balance from public.profiles where id=p_user)));
end $$;

revoke all on function public.manage_plot(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.manage_plot(uuid,text,text,text) to service_role;
