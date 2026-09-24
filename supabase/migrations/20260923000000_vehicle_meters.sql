-- Odometers are asset-owned. Replacement events delimit physical-meter periods;
-- the logical meter survives replacements. Only the commands below can write.
create table public.meters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid not null,
  asset_type text not null default 'vehicle' check (asset_type = 'vehicle'),
  meter_type text not null default 'odometer' check (meter_type = 'odometer'),
  unit text not null check (unit in ('mi', 'km')),
  foreign key (organization_id, asset_id, asset_type)
    references public.assets (organization_id, id, asset_type) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, asset_id, meter_type)
);

-- Numeric without a scale modifier deliberately rejects excess precision instead
-- of silently rounding at assignment. Values travel through the API as decimals.
create table public.meter_entries (
  id uuid primary key,
  organization_id uuid not null,
  meter_id uuid not null,
  kind text not null check (kind in ('baseline', 'reading', 'replacement')),
  observed_at timestamptz not null check (isfinite(observed_at)),
  physical numeric not null check (physical between 0 and 999999999.9 and physical = trunc(physical, 1)),
  old_final numeric check (old_final between 0 and 999999999.9 and old_final = trunc(old_final, 1)),
  baseline_usage numeric check (baseline_usage between 0 and 999999999.9 and baseline_usage = trunc(baseline_usage, 1)),
  reason text check (length(btrim(reason)) between 1 and 2000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null default 'admin_ui' check (source = 'admin_ui'),
  request_payload jsonb not null,
  foreign key (organization_id, meter_id) references public.meters (organization_id, id) on delete restrict,
  unique (organization_id, meter_id, id),
  unique (meter_id, observed_at),
  check ((kind = 'baseline' and baseline_usage is not null and baseline_usage >= physical and old_final is null
          and (baseline_usage = physical or reason is not null))
    or (kind = 'reading' and baseline_usage is null and old_final is null)
    or (kind = 'replacement' and baseline_usage is null and old_final is not null and reason is not null))
);
create unique index meter_one_baseline on public.meter_entries (meter_id) where kind = 'baseline';

-- Complete replacement values are appended; neither originals nor prior revisions
-- are updated. A revision references its predecessor to reject stale corrections.
create table public.meter_revisions (
  id uuid primary key,
  organization_id uuid not null,
  meter_id uuid not null,
  entry_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  physical numeric not null check (physical between 0 and 999999999.9 and physical = trunc(physical, 1)),
  old_final numeric check (old_final between 0 and 999999999.9 and old_final = trunc(old_final, 1)),
  baseline_usage numeric check (baseline_usage between 0 and 999999999.9 and baseline_usage = trunc(baseline_usage, 1)),
  voided boolean not null,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  request_payload jsonb not null,
  foreign key (organization_id, meter_id, entry_id)
    references public.meter_entries (organization_id, meter_id, id) on delete restrict,
  unique (entry_id, revision_number)
);

alter table public.meters enable row level security;
alter table public.meter_entries enable row level security;
alter table public.meter_revisions enable row level security;
revoke all on public.meters, public.meter_entries, public.meter_revisions from public, anon, authenticated;
grant select on public.meters, public.meter_entries, public.meter_revisions to authenticated;
grant all on public.meters, public.meter_entries, public.meter_revisions to service_role;
create policy meters_read on public.meters for select to authenticated using (exists (
  select 1 from public.memberships m where m.organization_id = meters.organization_id
    and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner', 'admin', 'read_only')
));
create policy meter_entries_read on public.meter_entries for select to authenticated using (exists (
  select 1 from public.memberships m where m.organization_id = meter_entries.organization_id
    and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner', 'admin', 'read_only')
));
create policy meter_revisions_read on public.meter_revisions for select to authenticated using (exists (
  select 1 from public.memberships m where m.organization_id = meter_revisions.organization_id
    and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('owner', 'admin', 'read_only')
));

-- One deterministic calculation serves reads and transactional write validation.
-- SECURITY INVOKER keeps direct history reads subject to every table's RLS.
-- VOLATILE ensures validation sees changes made earlier in the same command.
create function public.meter_history(target_organization_id uuid, target_asset_id uuid)
returns table (
  id uuid, revision_id uuid, kind text, unit text, observed_at timestamptz,
  physical text, old_final text, baseline_usage text, accumulated text,
  voided boolean, audit text
) language plpgsql volatile security invoker set search_path = '' as $$
declare
  e record;
  usage numeric;
  previous_physical numeric;
  started boolean := false;
begin
  for e in
    select original.*, meter.unit as meter_unit,
      coalesce(revision.id, original.id) as effective_revision,
      case when revision.id is null then original.physical else revision.physical end as effective_physical,
      case when revision.id is null then original.old_final else revision.old_final end as effective_final,
      case when revision.id is null then original.baseline_usage else revision.baseline_usage end as effective_baseline,
      coalesce(revision.voided, false) as effective_void,
      (select jsonb_agg(jsonb_build_object('revision', r.revision_number, 'physical', r.physical::text,
        'old_final', r.old_final::text, 'baseline_usage', r.baseline_usage::text, 'voided', r.voided,
        'reason', r.reason, 'actor', r.actor_id, 'recorded_at', r.recorded_at) order by r.revision_number)
        from public.meter_revisions r where r.entry_id = original.id and r.organization_id = target_organization_id) as revisions
    from public.meters meter
    join public.meter_entries original on original.meter_id = meter.id and original.organization_id = meter.organization_id
    left join lateral (select r.* from public.meter_revisions r where r.entry_id = original.id
      and r.organization_id = target_organization_id order by r.revision_number desc limit 1) revision on true
    where meter.organization_id = target_organization_id and meter.asset_id = target_asset_id and meter.meter_type = 'odometer'
    order by original.observed_at
  loop
    if e.effective_void then
      if e.kind <> 'reading' then raise exception 'Only ordinary readings can be voided' using errcode = '23514'; end if;
    elsif e.kind = 'baseline' then
      if started or e.effective_baseline is null or e.effective_baseline < e.effective_physical or e.effective_final is not null then
        raise exception 'Invalid initial baseline' using errcode = '23514';
      end if;
      usage := e.effective_baseline;
      previous_physical := e.effective_physical;
      started := true;
    else
      if not started or e.effective_baseline is not null then raise exception 'Initial baseline required' using errcode = '23514'; end if;
      if e.kind = 'replacement' then
        if e.effective_final is null or e.effective_final < previous_physical then
          raise exception 'Final reading is below preceding reading' using errcode = '23514';
        end if;
        -- New starting reading is a physical baseline, never additional usage.
        usage := usage + e.effective_final - previous_physical;
      else
        if e.effective_physical < previous_physical or e.effective_final is not null then
          raise exception 'Reading conflicts with neighboring readings' using errcode = '23514';
        end if;
        usage := usage + e.effective_physical - previous_physical;
      end if;
      previous_physical := e.effective_physical;
    end if;
    if usage > 999999999.9 then raise exception 'Accumulated usage exceeds supported range' using errcode = '23514'; end if;
    id := e.id; revision_id := e.effective_revision; kind := e.kind; unit := e.meter_unit;
    observed_at := e.observed_at; physical := e.effective_physical::text;
    old_final := e.effective_final::text; baseline_usage := e.effective_baseline::text;
    accumulated := usage::text; voided := e.effective_void;
    audit := jsonb_build_object('original', jsonb_build_object('physical', e.physical::text,
      'old_final', e.old_final::text, 'baseline_usage', e.baseline_usage::text, 'reason', e.reason,
      'actor', e.actor_id, 'recorded_at', e.recorded_at, 'source', e.source),
      'revisions', coalesce(e.revisions, '[]'::jsonb))::text;
    return next;
  end loop;
end;
$$;

create function public.record_meter_command(target_organization_id uuid, target_asset_id uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  command_id uuid;
  action text;
  meter public.meters%rowtype;
  original public.meter_entries%rowtype;
  previous_revision uuid;
  revision_count integer;
  archive_time timestamptz;
  reading_time timestamptz;
  value numeric;
  final_value numeric;
  initial_usage numeric;
  notes text;
  prior_payload jsonb;
  prior_actor uuid;
  prior_meter uuid;
  target_entry uuid;
begin
  if not exists (select 1 from public.memberships m where m.organization_id = target_organization_id
    and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner', 'admin')) then
    raise exception 'Meter management access required' using errcode = '42501';
  end if;
  -- Serialize initialization, backdating, revisions, replacements and archiving.
  select a.archived_at into archive_time from public.assets a where a.id = target_asset_id
    and a.organization_id = target_organization_id and a.asset_type = 'vehicle' for update;
  if not found then raise exception 'Vehicle not found' using errcode = 'P0002'; end if;
  if archive_time is not null then raise exception 'Archived vehicles are read-only' using errcode = '55000'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(payload) k where k not in
      ('command_id', 'action', 'unit', 'observed_at', 'physical', 'old_final', 'baseline_usage', 'reason', 'entry_id', 'expected_revision_id')
  ) then raise exception 'Invalid command fields' using errcode = '22023'; end if;
  command_id := (payload->>'command_id')::uuid;
  action := payload->>'action';
  if command_id is null or action is null or action not in ('baseline', 'reading', 'replacement', 'correct', 'void') then
    raise exception 'Invalid command' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(command_id::text, 0));
  select * into meter from public.meters m where m.organization_id = target_organization_id
    and m.asset_id = target_asset_id and m.meter_type = 'odometer';
  select x.request_payload, x.actor_id, x.meter_id into prior_payload, prior_actor, prior_meter from (
    select e.request_payload, e.actor_id, e.meter_id from public.meter_entries e where e.id = command_id
    union all
    select r.request_payload, r.actor_id, r.meter_id from public.meter_revisions r where r.id = command_id
  ) x;
  if found then
    if prior_payload = payload and prior_actor = auth.uid() and prior_meter = meter.id then return command_id; end if;
    raise exception 'Command ID already used' using errcode = '40001';
  end if;
  notes := nullif(btrim(payload->>'reason'), '');
  if notes is not null and (jsonb_typeof(payload->'reason') <> 'string' or length(notes) > 2000) then
    raise exception 'Invalid reason' using errcode = '22023';
  end if;
  if action in ('replacement', 'correct', 'void') and notes is null then
    raise exception 'Reason required' using errcode = '23514';
  end if;
  if action in ('correct', 'void') then
    if payload ? 'unit' or payload ? 'observed_at' then raise exception 'Correction cannot change time or unit' using errcode = '22023'; end if;
    target_entry := (payload->>'entry_id')::uuid;
    select * into original from public.meter_entries e where e.id = target_entry
      and e.organization_id = target_organization_id and e.meter_id = meter.id;
    if not found then raise exception 'Reading not found' using errcode = 'P0002'; end if;
    select r.id, r.revision_number into previous_revision, revision_count from public.meter_revisions r
      where r.entry_id = original.id order by r.revision_number desc limit 1;
    if (payload->>'expected_revision_id')::uuid is distinct from coalesce(previous_revision, original.id) then
      raise exception 'Reading changed; reload history' using errcode = '40001';
    end if;
    if action = 'void' then
      if original.kind <> 'reading' or payload ?| array['physical','old_final','baseline_usage'] then
        raise exception 'Only ordinary readings can be voided' using errcode = '23514';
      end if;
      select h.physical::numeric into value from public.meter_history(target_organization_id, target_asset_id) h where h.id = original.id;
    end if;
  else
    if payload ? 'entry_id' or payload ? 'expected_revision_id' then raise exception 'Unexpected correction fields' using errcode = '22023'; end if;
    if jsonb_typeof(payload->'observed_at') is distinct from 'string'
      or (payload->>'observed_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Observation time must include timezone' using errcode = '22023';
    end if;
    reading_time := (payload->>'observed_at')::timestamptz;
    if reading_time is null or not isfinite(reading_time) or reading_time > clock_timestamp() then
      raise exception 'Invalid observation time' using errcode = '23514';
    end if;
    if action = 'baseline' then
      if meter.id is not null then raise exception 'Meter already initialized' using errcode = '40001'; end if;
      insert into public.meters (organization_id, asset_id, unit)
        values (target_organization_id, target_asset_id, payload->>'unit') returning * into meter;
    elsif meter.id is null then raise exception 'Initialize mileage first' using errcode = '23514';
    elsif payload ? 'unit' then raise exception 'Unit is locked' using errcode = '22023';
    end if;
    if action = 'replacement' and exists (select 1 from public.meter_entries e where e.meter_id = meter.id and e.observed_at >= reading_time) then
      raise exception 'Replacement must follow all recorded observations' using errcode = '23514';
    end if;
  end if;
  if action <> 'void' then
    if jsonb_typeof(payload->'physical') is distinct from 'string' or (payload->>'physical') !~ '^[0-9]{1,9}(\.[0-9])?$' then
      raise exception 'Invalid physical reading' using errcode = '22023';
    end if;
    value := (payload->>'physical')::numeric;
    if coalesce(original.kind, action) = 'replacement' then
      if jsonb_typeof(payload->'old_final') is distinct from 'string' or (payload->>'old_final') !~ '^[0-9]{1,9}(\.[0-9])?$' then
        raise exception 'Invalid final reading' using errcode = '22023';
      end if;
      final_value := (payload->>'old_final')::numeric;
    elsif payload ? 'old_final' then raise exception 'Unexpected final reading' using errcode = '22023'; end if;
    if coalesce(original.kind, action) = 'baseline' then
      if jsonb_typeof(payload->'baseline_usage') is distinct from 'string' or (payload->>'baseline_usage') !~ '^[0-9]{1,9}(\.[0-9])?$' then
        raise exception 'Invalid accumulated baseline' using errcode = '22023';
      end if;
      initial_usage := (payload->>'baseline_usage')::numeric;
      if initial_usage > value and notes is null then raise exception 'Explain declared baseline' using errcode = '23514'; end if;
    elsif payload ? 'baseline_usage' then raise exception 'Unexpected baseline' using errcode = '22023'; end if;
  end if;
  if action in ('correct', 'void') then
    insert into public.meter_revisions (id, organization_id, meter_id, entry_id, revision_number,
      physical, old_final, baseline_usage, voided, reason, actor_id, request_payload)
    values (command_id, target_organization_id, meter.id, original.id, coalesce(revision_count, 0) + 1,
      value, final_value, initial_usage, action = 'void', notes, auth.uid(), payload);
  else
    insert into public.meter_entries (id, organization_id, meter_id, kind, observed_at,
      physical, old_final, baseline_usage, reason, actor_id, request_payload)
    values (command_id, target_organization_id, meter.id, action, reading_time,
      value, final_value, initial_usage, notes, auth.uid(), payload);
  end if;
  -- Reject the entire command if any effective neighbor/period becomes invalid.
  perform * from public.meter_history(target_organization_id, target_asset_id);
  return command_id;
end;
$$;
revoke all on function public.meter_history(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_meter_command(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meter_history(uuid, uuid) to authenticated;
grant execute on function public.record_meter_command(uuid, uuid, jsonb) to authenticated;
