-- Keep the first distribution time separate from later building/listing updates.
alter table public.parcels add column if not exists created_at timestamptz;
update public.parcels set created_at=coalesce(created_at,updated_at,now()) where created_at is null;
alter table public.parcels alter column created_at set default now();
alter table public.parcels alter column created_at set not null;
create index if not exists parcels_created_idx on public.parcels (created_at desc);
