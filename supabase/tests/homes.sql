begin;
do $$
declare u uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); pid text:='test-home-'||gen_random_uuid(); pid2 text:='test-home-'||gen_random_uuid(); r jsonb; was_rejected boolean; saw_loss boolean:=false;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,u||'@example.invalid','{"name":"Home test"}');
 insert into public.parcels(id,owner_id,lon,lat,area) values(pid,u,29,40,400),(pid2,u,29,40,400);
 r:=public.build_home(u,pid,'build',23,2,false,0);
 if (r->>'cost')::integer<>0 or not (r->>'firstHomeClaimed')::boolean or r->'parcel'->>'building'<>'home' then raise exception 'Free home failed'; end if;
 was_rejected:=false;begin perform public.build_home(u,pid,'build',0,2,false,60);exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Duplicate build allowed';end if;
 was_rejected:=false;begin perform public.build_home(stranger,pid,'upgrade',0,2,false);exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Foreign ownership allowed';end if;
 was_rejected:=false;begin perform public.build_home(u,pid2,'build',0,2,false,60);exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Second free home allowed';end if;
 update public.profiles set balance=1000 where id=u;
 was_rejected:=false;begin perform public.build_home(u,pid2,'build',0,2,false,0);exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Stale free quote charged player';end if;
 r:=public.build_home(u,pid2,'build',0,2,false,60);
 if (r->>'cost')::integer<>60 then raise exception 'Second home price wrong';end if;
 for i in 1..4 loop r:=public.build_home(u,pid,'upgrade',0,2,false);end loop;
 if (r->'parcel'->>'level')::integer<>5 or (r->'parcel'->>'home_floors')::integer<>2 then raise exception 'Level or floors invalid';end if;
 was_rejected:=false;begin perform public.build_home(u,pid,'upgrade',0,2,false);exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Level cap bypassed';end if;
 update public.parcels set building=null,level=0 where id=pid2;
 was_rejected:=false;begin perform public.build_home(u,pid2,'build',0,0,false,60);exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Risk consent bypassed';end if;
 -- Exercise the random outcome on disposable transaction-local fixtures only.
 for i in 1..100 loop
  update public.profiles set first_home_claimed=false where id=u;
  update public.parcels set building=null,level=0,build_blocked_until=null where id=pid2;
  r:=public.build_home(u,pid2,'build',0,0,true,0);
  if (r->>'demolished')::boolean then saw_loss:=true;exit;end if;
 end loop;
 if not saw_loss then raise exception 'No demolition path observed';end if;
 if r->'parcel'->>'building' is not null or (r->'parcel'->>'build_blocked_until')::timestamptz<>now()+interval '4 days' or not (r->>'firstHomeClaimed')::boolean then raise exception 'Demolition state wrong';end if;
 was_rejected:=false;begin perform public.build_home(u,pid2,'build',0,2,false,60);exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Cooldown bypassed';end if;
 was_rejected:=false;begin update public.parcels set building='farm' where id=pid2;exception when others then was_rejected:=true;end;
 if not was_rejected then raise exception 'Farm bypassed cooldown';end if;
 update public.parcels set build_blocked_until=now()-interval '1 second' where id=pid2;
 r:=public.build_home(u,pid2,'build',0,5,false,60);
 if (r->>'cost')::integer<>60 then raise exception 'Demolition restored free entitlement';end if;
end $$;
rollback;
select 'home transactions passed; all test data rolled back' as result;
