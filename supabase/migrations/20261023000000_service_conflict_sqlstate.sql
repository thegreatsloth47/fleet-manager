-- Business conflicts are permanent for the submitted command. SQLSTATE 40001
-- asks PostgREST to retry the transaction and can loop until the gateway times out.
-- PT409 returns a conflict immediately while preserving the transaction rollback.
-- Keep the existing function signature, authorization, locks, and audit behavior.
create or replace function public.save_service(target_organization_id uuid, target_asset_id uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  prior public.service_records%rowtype;
  saved public.service_records%rowtype;
  schedule public.maintenance_assignments%rowtype;
  effect public.service_schedule_effects%rowtype;
  retry public.service_revisions%rowtype;
  command_id uuid;
  record_id uuid;
  expected integer;
  action text;
  reason text;
  timezone text;
  archived timestamptz;
  ids uuid[];
  selected_id uuid;
  changed_effect boolean;
  k text;
  usage numeric;
  due_date date;
  latest_date date;
  latest_version integer;
  manual_change_at timestamptz;
begin
  if not exists (select 1 from public.memberships m where m.organization_id=target_organization_id
    and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')) then
    raise exception 'Service management access required' using errcode='42501';
  end if;
  select a.archived_at into archived from public.assets a where a.organization_id=target_organization_id
    and a.id=target_asset_id and a.asset_type='vehicle' for update;
  if not found then raise exception 'Vehicle not found' using errcode='P0002'; end if;
  if archived is not null then raise exception 'Archived vehicles are read-only' using errcode='55000'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or not payload ?& array['command_id','id','expected_version','action','reason']
    or exists(select 1 from jsonb_object_keys(payload) key where key not in
      ('command_id','id','expected_version','action','reason','service_date','title','provider','cost_cents','currency','notes','total_distance','schedule_ids')) then
    raise exception 'Invalid service command' using errcode='22023';
  end if;
  command_id := (payload->>'command_id')::uuid;
  record_id := (payload->>'id')::uuid;
  action := payload->>'action';
  if command_id is null or record_id is null or action is null or action not in ('save','void')
    or jsonb_typeof(payload->'expected_version') is distinct from 'number' or (payload->>'expected_version') !~ '^[0-9]+$' then
    raise exception 'Invalid service command' using errcode='22023';
  end if;
  expected := (payload->>'expected_version')::integer;
  perform pg_advisory_xact_lock(hashtextextended(command_id::text,0));
  select * into retry from public.service_revisions r where r.id=command_id;
  if found then
    if retry.organization_id=target_organization_id and retry.asset_id=target_asset_id and retry.actor_id=auth.uid() and retry.request_payload=payload then return retry.service_id; end if;
    raise exception 'Command ID already used' using errcode='PT409';
  end if;
  reason := nullif(btrim(payload->>'reason'),'');
  if (payload->'reason' <> 'null'::jsonb and jsonb_typeof(payload->'reason') <> 'string') or length(reason)>2000
    or (expected>0 and reason is null) then raise exception 'A correction reason is required' using errcode='22023'; end if;
  select * into prior from public.service_records s where s.organization_id=target_organization_id and s.asset_id=target_asset_id and s.id=record_id for update;
  if (expected=0 and prior.id is not null) or (expected>0 and (prior.id is null or prior.version<>expected)) or prior.voided then
    raise exception 'Service changed; reload history' using errcode='PT409';
  end if;
  select o.timezone into timezone from public.organizations o where o.id=target_organization_id;
  if action='void' then
    if expected=0 or exists (select 1 from jsonb_object_keys(payload) key where key not in ('command_id','id','expected_version','action','reason')) then
      raise exception 'Invalid void command' using errcode='22023';
    end if;
    saved := prior;
    saved.voided := true;
    saved.schedule_ids := '{}';
  else
    if not payload ?& array['service_date','title','provider','cost_cents','currency','notes','total_distance','schedule_ids'] then
      raise exception 'Missing service details' using errcode='22023';
    end if;
    foreach k in array array['service_date','title','currency'] loop
      if jsonb_typeof(payload->k) is distinct from 'string' then raise exception 'Invalid service text' using errcode='22023'; end if;
    end loop;
    foreach k in array array['provider','notes'] loop
      if payload->k <> 'null'::jsonb and jsonb_typeof(payload->k) <> 'string' then raise exception 'Invalid service text' using errcode='22023'; end if;
    end loop;
    if (payload->>'service_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (payload->'cost_cents' <> 'null'::jsonb and (jsonb_typeof(payload->'cost_cents') <> 'number' or (payload->>'cost_cents') !~ '^[0-9]+$'))
      or (payload->'total_distance' <> 'null'::jsonb and (jsonb_typeof(payload->'total_distance') <> 'string' or (payload->>'total_distance') !~ '^[0-9]{1,9}(\.[0-9])?$'))
      or jsonb_typeof(payload->'schedule_ids') is distinct from 'array' then raise exception 'Invalid service values' using errcode='22023'; end if;
    select coalesce(array_agg(value::uuid order by value),'{}'::uuid[]) into ids from jsonb_array_elements_text(payload->'schedule_ids');
    if cardinality(ids)>100 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Invalid schedules' using errcode='22023'; end if;
    saved := jsonb_populate_record(null::public.service_records,payload - array['command_id','expected_version','action','reason']);
    saved.title := btrim(saved.title);
    saved.provider := nullif(btrim(saved.provider),'');
    saved.notes := nullif(btrim(saved.notes),'');
    saved.schedule_ids := ids;
    saved.voided := false;
    if saved.service_date > (clock_timestamp() at time zone timezone)::date then raise exception 'Service cannot be in the future' using errcode='22023'; end if;
    if saved.total_distance is not null then
      select m.unit into saved.distance_unit from public.meters m where m.organization_id=target_organization_id and m.asset_id=target_asset_id;
      -- Unchanged historical values remain editable even if meter corrections now conflict.
      if (prior.id is null or row(saved.service_date,saved.total_distance) is distinct from row(prior.service_date,prior.total_distance))
        and not public.service_distance_valid(target_organization_id,target_asset_id,saved.service_date,saved.total_distance) then
        raise exception 'Service distance conflicts with meter history or has no baseline' using errcode='23514';
      end if;
    end if;
  end if;
  changed_effect := prior.id is null or action='void' or
    row(saved.service_date,saved.total_distance,saved.schedule_ids) is distinct from row(prior.service_date,prior.total_distance,prior.schedule_ids);
  saved.id := record_id; saved.organization_id := target_organization_id; saved.asset_id := target_asset_id; saved.asset_type := 'vehicle';
  saved.version := expected+1; saved.updated_by := auth.uid(); saved.updated_at := clock_timestamp();
  if expected=0 then insert into public.service_records select saved.*;
  else update public.service_records set service_date=saved.service_date,title=saved.title,provider=saved.provider,cost_cents=saved.cost_cents,
    currency=saved.currency,notes=saved.notes,total_distance=saved.total_distance,distance_unit=saved.distance_unit,schedule_ids=saved.schedule_ids,
    voided=saved.voided,version=saved.version,updated_by=saved.updated_by,updated_at=saved.updated_at
    where id=record_id and organization_id=target_organization_id;
  end if;
  insert into public.service_revisions(id,organization_id,asset_id,service_id,version,snapshot,reason,actor_id,request_payload)
    values(command_id,target_organization_id,target_asset_id,record_id,saved.version,to_jsonb(saved),reason,auth.uid(),payload);
  if not changed_effect then return record_id; end if;

  -- Reverse only effects whose exact resulting schedule version still owns the target.
  for effect in select e.* from public.service_schedule_effects e where e.service_id=record_id and e.organization_id=target_organization_id
    and e.reversal_of is null and not exists(select 1 from public.service_schedule_effects r where r.reversal_of=e.id) order by e.schedule_id
  loop
    select * into schedule from public.maintenance_assignments a where a.organization_id=target_organization_id and a.asset_id=target_asset_id and a.id=effect.schedule_id for update;
    if schedule.version is distinct from effect.after_version then raise exception 'A later service or manual schedule change prevents reversal' using errcode='PT409'; end if;
    update public.maintenance_assignments set next_due_usage=effect.before_usage,next_due_date=effect.before_date,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
      where id=schedule.id and organization_id=target_organization_id;
    insert into public.service_schedule_effects(organization_id,asset_id,service_id,revision_id,schedule_id,schedule_name,service_date,reversal_of,before_usage,after_usage,before_date,after_date,before_version,after_version,distance_interval,distance_unit,prior_updated_at,time_interval,time_unit)
      values(target_organization_id,target_asset_id,record_id,command_id,schedule.id,schedule.name,prior.service_date,effect.id,schedule.next_due_usage,effect.before_usage,schedule.next_due_date,effect.before_date,schedule.version,schedule.version+1,effect.distance_interval,schedule.distance_unit,schedule.updated_at,effect.time_interval,effect.time_unit);
  end loop;
  foreach selected_id in array saved.schedule_ids loop
    select * into schedule from public.maintenance_assignments a where a.organization_id=target_organization_id and a.asset_id=target_asset_id and a.id=selected_id for update;
    if not found then raise exception 'Schedule not found on this vehicle' using errcode='P0002'; end if;
    if schedule.paused or not exists(select 1 from public.maintenance_templates t where t.id=schedule.template_id and t.organization_id=target_organization_id and t.enabled) then
      raise exception 'Paused or disabled schedules cannot be satisfied' using errcode='55000';
    end if;
    select max(e.service_date) into latest_date from public.service_schedule_effects e where e.schedule_id=selected_id and e.organization_id=target_organization_id
      and e.reversal_of is null and not exists(select 1 from public.service_schedule_effects r where r.reversal_of=e.id);
    select max(e.after_version) into latest_version from public.service_schedule_effects e where e.schedule_id=selected_id and e.organization_id=target_organization_id;
    -- Remember manual targets even after a later completion is reversed. Version
    -- gaps identify manual edits; service writes always advance by exactly one.
    select max(e.prior_updated_at) into manual_change_at from public.service_schedule_effects e
      where e.schedule_id=selected_id and e.organization_id=target_organization_id
      and e.before_version>coalesce((select max(p.after_version) from public.service_schedule_effects p
        where p.schedule_id=selected_id and p.organization_id=target_organization_id and p.after_version<=e.before_version),1);
    if saved.service_date<latest_date or saved.service_date<(manual_change_at at time zone timezone)::date or (schedule.version>coalesce(latest_version,1) and saved.service_date<(schedule.updated_at at time zone timezone)::date) then
      raise exception 'Backdated service cannot overwrite later maintenance; save without schedule effects' using errcode='PT409';
    end if;
    usage := null; due_date := null;
    if schedule.distance_interval is not null then
      if saved.total_distance is null or saved.distance_unit<>schedule.distance_unit or not public.service_distance_valid(target_organization_id,target_asset_id,saved.service_date,saved.total_distance) then
        raise exception 'Valid total distance required for this schedule' using errcode='23514';
      end if;
      usage := saved.total_distance+schedule.distance_interval;
    end if;
    if schedule.time_interval is not null then
      due_date := (saved.service_date + make_interval(
        years => case when schedule.time_unit='years' then schedule.time_interval else 0 end,
        months => case when schedule.time_unit='months' then schedule.time_interval else 0 end,
        days => case when schedule.time_unit='days' then schedule.time_interval when schedule.time_unit='weeks' then schedule.time_interval*7 else 0 end))::date;
    end if;
    update public.maintenance_assignments set next_due_usage=usage,next_due_date=due_date,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
      where id=selected_id and organization_id=target_organization_id;
    insert into public.service_schedule_effects(organization_id,asset_id,service_id,revision_id,schedule_id,schedule_name,service_date,before_usage,after_usage,before_date,after_date,before_version,after_version,distance_interval,distance_unit,prior_updated_at,time_interval,time_unit)
      values(target_organization_id,target_asset_id,record_id,command_id,schedule.id,schedule.name,saved.service_date,schedule.next_due_usage,usage,schedule.next_due_date,due_date,schedule.version,schedule.version+1,schedule.distance_interval,schedule.distance_unit,schedule.updated_at,schedule.time_interval,schedule.time_unit);
  end loop;
  return record_id;
end;
$$;
