-- Definitions and per-asset schedules are separate: future service records will
-- reference a stable assignment and advance its targets transactionally.
create table public.maintenance_templates (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  enabled boolean not null default true,
  name text not null check (length(btrim(name)) between 1 and 200),
  distance_interval numeric check (distance_interval > 0 and distance_interval <= 999999999.9 and distance_interval = trunc(distance_interval, 1)),
  distance_unit text check (distance_unit in ('mi', 'km')),
  time_interval integer check (time_interval between 1 and 1000),
  time_unit text check (time_unit in ('days', 'weeks', 'months', 'years')),
  upcoming_percent integer not null default 10 check (upcoming_percent between 0 and 100),
  due_percent integer not null default 5 check (due_percent between 0 and upcoming_percent),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check ((distance_interval is null) = (distance_unit is null)),
  check ((time_interval is null) = (time_unit is null)),
  check (distance_interval is not null or time_interval is not null),
  unique (organization_id, id)
);
create table public.maintenance_assignments (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid not null,
  asset_type text not null default 'vehicle' check (asset_type = 'vehicle'),
  template_id uuid not null,
  meter_id uuid,
  next_due_usage numeric check (next_due_usage between 0 and 999999999.9 and next_due_usage = trunc(next_due_usage, 1)),
  next_due_date date check (next_due_date between date '1900-01-01' and date '9999-12-31'),
  paused boolean not null default false,
  name text not null check (length(btrim(name)) between 1 and 200),
  distance_interval numeric check (distance_interval > 0 and distance_interval <= 999999999.9 and distance_interval = trunc(distance_interval, 1)),
  distance_unit text check (distance_unit in ('mi', 'km')),
  time_interval integer check (time_interval between 1 and 1000),
  time_unit text check (time_unit in ('days', 'weeks', 'months', 'years')),
  upcoming_percent integer not null default 10 check (upcoming_percent between 0 and 100),
  due_percent integer not null default 5 check (due_percent between 0 and upcoming_percent),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check ((distance_interval is null) = (distance_unit is null)),
  check ((time_interval is null) = (time_unit is null)),
  check (distance_interval is not null or time_interval is not null),
  unique (organization_id, id),
  foreign key (organization_id, asset_id, asset_type) references public.assets(organization_id, id, asset_type) on delete restrict,
  foreign key (organization_id, template_id) references public.maintenance_templates(organization_id, id) on delete restrict,
  foreign key (organization_id, meter_id) references public.meters(organization_id, id) on delete restrict,
  unique (organization_id, asset_id, template_id),
  check ((distance_interval is null) = (next_due_usage is null)),
  check ((distance_interval is null) = (meter_id is null)),
  check ((time_interval is null) = (next_due_date is null))
);
alter table public.maintenance_templates enable row level security;
revoke all on public.maintenance_templates from public, anon, authenticated;
grant select on public.maintenance_templates to authenticated;
grant all on public.maintenance_templates to service_role;
create policy maintenance_templates_read on public.maintenance_templates for select to authenticated using (exists (
  select 1 from public.memberships m where m.organization_id = maintenance_templates.organization_id
    and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner', 'admin', 'read_only')
));
alter table public.maintenance_assignments enable row level security;
revoke all on public.maintenance_assignments from public, anon, authenticated;
grant select on public.maintenance_assignments to authenticated;
grant all on public.maintenance_assignments to service_role;
create policy maintenance_assignments_read on public.maintenance_assignments for select to authenticated using (exists (
  select 1 from public.memberships m where m.organization_id = maintenance_assignments.organization_id
    and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner', 'admin', 'read_only')
));

-- Reinforce meter/asset/unit matching even for privileged imports.
create function public.check_maintenance_meter() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.meter_id is not null and not exists (select 1 from public.meters m
    where m.id = new.meter_id and m.organization_id = new.organization_id
      and m.asset_id = new.asset_id and m.unit = new.distance_unit) then
    raise exception 'Maintenance meter must match asset and unit' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger maintenance_meter_check before insert or update on public.maintenance_assignments
for each row execute function public.check_maintenance_meter();
revoke all on function public.check_maintenance_meter() from public, anon, authenticated;

-- Commands check current membership, lock the parent asset before mutations,
-- and use optimistic versions to reject edits made from stale forms.
create function public.save_maintenance(target_organization_id uuid, target_asset_id uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  definition public.maintenance_templates%rowtype;
  schedule public.maintenance_assignments%rowtype;
  prior public.maintenance_assignments%rowtype;
  expected integer;
  archived timestamptz;
  template_enabled boolean;
  saved uuid;
  k text;
begin
  if not exists (select 1 from public.memberships m where m.organization_id = target_organization_id
    and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')) then
    raise exception 'Maintenance management access required' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Invalid maintenance command' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(payload) key where key not in
    ('id','expected_version','name','distance_interval','distance_unit','time_interval','time_unit','upcoming_percent','due_percent')
    and not (target_asset_id is null and key = 'enabled')
    and not (target_asset_id is not null and key in ('template_id','next_due_usage','next_due_date','paused'))) then
    raise exception 'Unexpected maintenance field' using errcode = '22023';
  end if;
  foreach k in array array['id','expected_version','name','distance_interval','distance_unit','time_interval','time_unit','upcoming_percent','due_percent'] loop
    if not payload ? k then raise exception 'Missing maintenance field' using errcode = '22023'; end if;
  end loop;
  if jsonb_typeof(payload->'name') is distinct from 'string' then raise exception 'Invalid name' using errcode = '22023'; end if;
  foreach k in array array['expected_version','upcoming_percent','due_percent'] loop
    if jsonb_typeof(payload->k) is distinct from 'number' or (payload->>k) !~ '^[0-9]+$' then
      raise exception 'Invalid integer' using errcode = '22023';
    end if;
  end loop;
  foreach k in array array['distance_interval','time_interval'] loop
    if payload->k <> 'null'::jsonb and (jsonb_typeof(payload->k) <> 'number' or (payload->>k) !~ '^[0-9]+(\.[0-9])?$') then
      raise exception 'Invalid interval' using errcode = '22023';
    end if;
  end loop;
  if payload->'time_interval' <> 'null'::jsonb and (payload->>'time_interval') !~ '^[0-9]+$' then raise exception 'Calendar interval must be whole' using errcode = '22023'; end if;
  expected := (payload->>'expected_version')::integer;
  if target_asset_id is null then
    if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'Enabled required' using errcode = '22023'; end if;
    definition := jsonb_populate_record(null::public.maintenance_templates, payload - 'expected_version');
    if expected = 0 then
      insert into public.maintenance_templates (id,organization_id,name,distance_interval,distance_unit,time_interval,time_unit,upcoming_percent,due_percent,enabled,updated_by)
      values (definition.id,target_organization_id,btrim(definition.name),definition.distance_interval,definition.distance_unit,definition.time_interval,definition.time_unit,definition.upcoming_percent,definition.due_percent,definition.enabled,auth.uid()) returning id into saved;
    else
      update public.maintenance_templates set name=btrim(definition.name),distance_interval=definition.distance_interval,distance_unit=definition.distance_unit,
        time_interval=definition.time_interval,time_unit=definition.time_unit,upcoming_percent=definition.upcoming_percent,due_percent=definition.due_percent,
        enabled=definition.enabled,version=version+1,updated_by=auth.uid(),updated_at=now()
      where id=definition.id and organization_id=target_organization_id and version=expected returning id into saved;
    end if;
  else
    select a.archived_at into archived from public.assets a where a.id=target_asset_id and a.organization_id=target_organization_id and a.asset_type='vehicle' for update;
    if not found then raise exception 'Vehicle not found' using errcode = 'P0002'; end if;
    if archived is not null then raise exception 'Archived vehicles are read-only' using errcode = '55000'; end if;
    if jsonb_typeof(payload->'paused') is distinct from 'boolean' or not payload ?& array['template_id','next_due_usage','next_due_date'] then
      raise exception 'Assignment fields required' using errcode = '22023';
    end if;
    if payload->'next_due_usage' <> 'null'::jsonb and (jsonb_typeof(payload->'next_due_usage') <> 'number' or (payload->>'next_due_usage') !~ '^[0-9]+(\.[0-9])?$') then raise exception 'Invalid target usage' using errcode = '22023'; end if;
    if payload->'next_due_date' <> 'null'::jsonb and (jsonb_typeof(payload->'next_due_date') <> 'string' or (payload->>'next_due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid target date' using errcode = '22023'; end if;
    schedule := jsonb_populate_record(null::public.maintenance_assignments, payload - 'expected_version');
    select t.enabled into template_enabled from public.maintenance_templates t where t.id=schedule.template_id and t.organization_id=target_organization_id for share;
    if not found then raise exception 'Template not found' using errcode = 'P0002'; end if;
    if expected = 0 and not template_enabled then raise exception 'Template disabled' using errcode = '55000'; end if;
    if schedule.distance_interval is not null then
      select m.id into schedule.meter_id from public.meters m where m.organization_id=target_organization_id and m.asset_id=target_asset_id and m.unit=schedule.distance_unit;
      if not found then raise exception 'Initialize mileage with matching unit first' using errcode = '23514'; end if;
    end if;
    if expected = 0 then
      -- Initial assignment copies the current template; custom edits are explicit
      -- subsequent assignment changes, never hidden differences at creation.
      select * into definition from public.maintenance_templates where id=schedule.template_id and organization_id=target_organization_id;
      if row(schedule.name,schedule.distance_interval,schedule.distance_unit,schedule.time_interval,schedule.time_unit,schedule.upcoming_percent,schedule.due_percent)
        is distinct from row(definition.name,definition.distance_interval,definition.distance_unit,definition.time_interval,definition.time_unit,definition.upcoming_percent,definition.due_percent) then
        raise exception 'Template changed; reload' using errcode = '40001';
      end if;
      insert into public.maintenance_assignments (id,organization_id,asset_id,template_id,meter_id,name,distance_interval,distance_unit,time_interval,time_unit,upcoming_percent,due_percent,next_due_usage,next_due_date,paused,updated_by)
      values (schedule.id,target_organization_id,target_asset_id,schedule.template_id,schedule.meter_id,btrim(schedule.name),schedule.distance_interval,schedule.distance_unit,schedule.time_interval,schedule.time_unit,schedule.upcoming_percent,schedule.due_percent,schedule.next_due_usage,schedule.next_due_date,schedule.paused,auth.uid()) returning id into saved;
    else
      select * into prior from public.maintenance_assignments where id=schedule.id and organization_id=target_organization_id and asset_id=target_asset_id for update;
      if not found then raise exception 'Assignment not found' using errcode = 'P0002'; end if;
      if prior.template_id <> schedule.template_id then raise exception 'Assignment template is immutable' using errcode = '23514'; end if;
      update public.maintenance_assignments set name=btrim(schedule.name),meter_id=schedule.meter_id,distance_interval=schedule.distance_interval,distance_unit=schedule.distance_unit,
        time_interval=schedule.time_interval,time_unit=schedule.time_unit,upcoming_percent=schedule.upcoming_percent,due_percent=schedule.due_percent,
        next_due_usage=schedule.next_due_usage,next_due_date=schedule.next_due_date,paused=schedule.paused,version=version+1,updated_by=auth.uid(),updated_at=now()
      where id=schedule.id and organization_id=target_organization_id and asset_id=target_asset_id and version=expected returning id into saved;
    end if;
  end if;
  if saved is null then raise exception 'Maintenance changed or no longer available; reload' using errcode = '40001'; end if;
  return saved;
end;
$$;
revoke all on function public.save_maintenance(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_maintenance(uuid, uuid, jsonb) to authenticated;

-- Reuse the meter domain's authoritative calculation, including corrections and
-- replacements. Invoker security preserves RLS on every underlying read.
create function public.maintenance_usage(target_organization_id uuid)
returns table (asset_id uuid, accumulated text, unit text, observed_at timestamptz)
language sql volatile security invoker set search_path = '' as $$
  select m.asset_id, h.accumulated, m.unit, h.observed_at from public.meters m
  cross join lateral (select history.accumulated, history.observed_at
    from public.meter_history(target_organization_id, m.asset_id) history
    where not history.voided order by history.observed_at desc limit 1) h
  where m.organization_id=target_organization_id;
$$;
revoke all on function public.maintenance_usage(uuid) from public, anon, authenticated;
grant execute on function public.maintenance_usage(uuid) to authenticated;
