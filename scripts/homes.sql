alter table public.profiles add column if not exists first_home_claimed boolean not null default false;
alter table public.parcels
 add column if not exists home_model smallint not null default 0 check(home_model between 0 and 23),
 add column if not exists home_floors smallint not null default 1 check(home_floors between 1 and 5),
 add column if not exists build_blocked_until timestamptz,
 add column if not exists home_unpermitted boolean not null default false;
-- Service-only atomic home actions. Price, entitlement and random outcome never come from the client.
create or replace function public.build_home(p_user uuid,p_parcel text,p_action text,p_model integer,p_permitted_floors integer,p_accept_risk boolean default false,p_quoted_cost integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.parcels%rowtype; pr public.profiles%rowtype; c bigint:=0; lost boolean:=false; free boolean:=false;
begin
 select * into v from public.parcels where id=p_parcel for update;
 if v.id is null or v.owner_id<>p_user or p_user is null then raise exception 'Bu parsel sana ait değil.'; end if;
 select * into pr from public.profiles where id=p_user for update;
 if pr.id is null then raise exception 'Hesap bulunamadı.'; end if;
 if v.listing is not null then raise exception 'İnşa veya yükseltme için önce ilanını kaldır.'; end if;
 if v.build_blocked_until>now() then raise exception 'Yıkım sonrası 4 günlük bekleme süresi henüz bitmedi.'; end if;
 if p_action='build' then
  if v.building is not null then raise exception 'Bu parselde zaten bir yapı var.'; end if;
  if p_model is null or p_model<0 or p_model>23 then raise exception 'Geçersiz konut modeli.'; end if;
  if p_permitted_floors is null or p_permitted_floors<0 then raise exception 'İmar bilgisi doğrulanamadı.'; end if;
  if p_permitted_floors=0 and not coalesce(p_accept_risk,false) then raise exception 'İmarsız konutun yüzde 25 yıkım riskini onaylamalısın.'; end if;
  free:=not pr.first_home_claimed; c:=case when free then 0 else 60 end;
  if p_quoted_cost is null or p_quoted_cost<>c then raise exception 'İlk konut hakkın veya fiyat değişti. Sayfayı yenileyip tekrar onayla.'; end if;
  if pr.balance<c then raise exception 'Yeterli oyun jetonun yok.'; end if;
  lost:=p_permitted_floors=0 and random()<0.25;
  update public.profiles set first_home_claimed=true,balance=balance-c where id=p_user returning * into pr;
  update public.parcels set building=case when lost then null else 'home' end,level=case when lost then 0 else 1 end,
   home_model=p_model,home_floors=1,home_unpermitted=p_permitted_floors=0,
   build_blocked_until=case when lost then now()+interval '4 days' else null end,
   rent_last_collected=now(),rent_price=null,updated_at=now() where id=p_parcel returning * into v;
 elsif p_action='upgrade' then
  if v.building is distinct from 'home' then raise exception 'Önce bir konut inşa et.'; end if;
  if v.level>=5 then raise exception 'Konutun en yüksek seviyede.'; end if;
  c:=45*greatest(v.level,1);
  if pr.balance<c then raise exception 'Yeterli oyun jetonun yok.'; end if;
  update public.profiles set balance=balance-c where id=p_user returning * into pr;
  update public.parcels set level=level+1,home_floors=least(level+1,greatest(1,least(5,p_permitted_floors))),updated_at=now()
   where id=p_parcel returning * into v;
 else raise exception 'Geçersiz konut işlemi.';
 end if;
 insert into public.activity(user_id,action,parcel_id,amount) values(p_user,case when lost then 'home_demolished' else 'home_'||p_action end,p_parcel,c);
 return jsonb_build_object('parcel',to_jsonb(v),'cost',c,'balance',pr.balance,'demolished',lost,'freeHome',free,'firstHomeClaimed',pr.first_home_claimed);
end $$;
revoke all on function public.build_home(uuid,text,text,integer,integer,boolean,integer) from public,anon,authenticated;
grant execute on function public.build_home(uuid,text,text,integer,integer,boolean,integer) to service_role;
-- A farm/shop cannot bypass the parcel cooldown via the legacy action route.
create or replace function public.enforce_build_cooldown() returns trigger language plpgsql set search_path=public as $$
begin
 if old.building is null and new.building is not null and old.build_blocked_until>now() then
 raise exception 'Yıkım sonrası 4 günlük bekleme süresi henüz bitmedi.';
 end if;return new;
end $$;
create trigger enforce_build_cooldown before update of building on public.parcels for each row execute function public.enforce_build_cooldown();
