create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_type text not null check (asset_type = 'vehicle'),
  name text not null check (name = btrim(name) and length(name) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'out_of_service')),
  make text check (length(make) between 1 and 100),
  model text check (length(model) between 1 and 100),
  year integer check (year between 1 and 9999),
  description text check (length(description) between 1 and 4000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id, asset_type)
);

create unique index assets_live_name_key on public.assets (organization_id, name)
  where archived_at is null;

create table public.vehicle_profiles (
  asset_id uuid primary key,
  organization_id uuid not null,
  asset_type text not null default 'vehicle' check (asset_type = 'vehicle'),
  vin text check (vin = upper(btrim(vin)) and length(vin) between 1 and 100),
  plate text check (length(plate) between 1 and 100),
  jurisdiction text check (length(jurisdiction) between 1 and 100),
  foreign key (organization_id, asset_id, asset_type)
    references public.assets (organization_id, id, asset_type) on delete restrict,
  -- Explicit composite uniqueness lets PostgREST infer the one-to-one join.
  unique (organization_id, asset_id, asset_type),
  unique (organization_id, vin)
);

alter table public.assets enable row level security;
alter table public.vehicle_profiles enable row level security;
revoke all on public.assets, public.vehicle_profiles from public, anon, authenticated;
grant select on public.assets, public.vehicle_profiles to authenticated;
grant all on public.assets, public.vehicle_profiles to service_role;

create policy assets_select_member on public.assets for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = assets.organization_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin', 'read_only')
  ));
create policy vehicle_profiles_select_member on public.vehicle_profiles for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = vehicle_profiles.organization_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'admin', 'read_only')
  ));

-- Only these atomic commands may write. Definer rights avoid granting partial
-- asset/profile writes; each command independently verifies current membership.
create function public.save_vehicle(
  target_organization_id uuid, target_asset_id uuid,
  vehicle_name text, vehicle_status text, vehicle_make text, vehicle_model text,
  vehicle_year integer, vehicle_description text, vehicle_vin text,
  vehicle_plate text, vehicle_jurisdiction text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved_id uuid;
  archive_time timestamptz;
begin
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = target_organization_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin')
  ) then
    raise exception 'Vehicle management access required' using errcode = '42501';
  end if;

  if target_asset_id is null then
    insert into public.assets (organization_id, asset_type, name, status, make, model, year, description)
    values (target_organization_id, 'vehicle', btrim(vehicle_name), vehicle_status,
      nullif(btrim(vehicle_make), ''), nullif(btrim(vehicle_model), ''), vehicle_year,
      nullif(btrim(vehicle_description), '')) returning id into saved_id;
    insert into public.vehicle_profiles (asset_id, organization_id, vin, plate, jurisdiction)
    values (saved_id, target_organization_id, nullif(upper(btrim(vehicle_vin)), ''),
      nullif(btrim(vehicle_plate), ''), nullif(btrim(vehicle_jurisdiction), ''));
  else
    select a.archived_at into archive_time from public.assets a
      where a.id = target_asset_id and a.organization_id = target_organization_id
        and a.asset_type = 'vehicle' for update;
    if not found then
      raise exception 'Vehicle not found' using errcode = 'P0002';
    end if;
    if archive_time is not null then
      raise exception 'Archived vehicles are read-only' using errcode = '55000';
    end if;
    update public.assets set name = btrim(vehicle_name), status = vehicle_status,
      make = nullif(btrim(vehicle_make), ''), model = nullif(btrim(vehicle_model), ''),
      year = vehicle_year, description = nullif(btrim(vehicle_description), ''), updated_at = now()
      where id = target_asset_id and organization_id = target_organization_id;
    update public.vehicle_profiles set vin = nullif(upper(btrim(vehicle_vin)), ''),
      plate = nullif(btrim(vehicle_plate), ''), jurisdiction = nullif(btrim(vehicle_jurisdiction), '')
      where asset_id = target_asset_id and organization_id = target_organization_id;
    saved_id := target_asset_id;
  end if;
  return saved_id;
end;
$$;

create function public.archive_vehicle(target_organization_id uuid, target_asset_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = target_organization_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'admin')
  ) then
    raise exception 'Vehicle management access required' using errcode = '42501';
  end if;
  -- Idempotent and serialized with edits by the asset row lock.
  perform 1 from public.assets where id = target_asset_id
    and organization_id = target_organization_id and asset_type = 'vehicle' for update;
  if not found then
    raise exception 'Vehicle not found' using errcode = 'P0002';
  end if;
  update public.assets set archived_at = now(), updated_at = now()
    where id = target_asset_id and organization_id = target_organization_id and archived_at is null;
  return target_asset_id;
end;
$$;

revoke all on function public.save_vehicle(uuid, uuid, text, text, text, text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.archive_vehicle(uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_vehicle(uuid, uuid, text, text, text, text, integer, text, text, text, text) to authenticated;
grant execute on function public.archive_vehicle(uuid, uuid) to authenticated;
