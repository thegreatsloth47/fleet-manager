-- Persist explicit customization and stable maintenance anchors. No service is recorded.
create function public.maintenance_shift(value date, amount integer, unit text) returns date
language sql immutable set search_path='' as $$
  select (value + make_interval(years => case when unit='years' then amount else 0 end,
    months => case when unit='months' then amount else 0 end,
    days => case when unit='days' then amount when unit='weeks' then amount*7 else 0 end))::date;
$$;
revoke all on function public.maintenance_shift(date,integer,text) from public,anon,authenticated;
alter table public.maintenance_assignments
  add column template_overridden boolean not null default false,
  add column baseline_usage numeric,
  add column baseline_date date;
-- Old rows have no edit provenance. Preserve any divergent configuration as customized.
update public.maintenance_assignments a set
  template_overridden=row(a.name,a.distance_interval,a.distance_unit,a.time_interval,a.time_unit,a.upcoming_percent,a.due_percent)
    is distinct from row(t.name,t.distance_interval,t.distance_unit,t.time_interval,t.time_unit,t.upcoming_percent,t.due_percent)
    or a.version > 1 + (select count(*) from public.service_schedule_effects e where e.organization_id=a.organization_id and e.schedule_id=a.id),
  baseline_usage=a.next_due_usage-a.distance_interval,
  baseline_date=public.maintenance_shift(a.next_due_date,-a.time_interval,a.time_unit)
from public.maintenance_templates t where t.id=a.template_id and t.organization_id=a.organization_id;
-- An exact service effect supplies the true calendar anchor (including month-end clamping).
update public.maintenance_assignments a set baseline_date=e.service_date,
  baseline_usage=coalesce(s.total_distance,a.baseline_usage)
from public.service_schedule_effects e join public.service_records s on s.id=e.service_id and s.organization_id=e.organization_id
where e.schedule_id=a.id and e.organization_id=a.organization_id and e.after_usage is not distinct from a.next_due_usage and e.after_date is not distinct from a.next_due_date
  and row(e.distance_interval,e.time_interval,e.time_unit) is not distinct from row(a.distance_interval,a.time_interval,a.time_unit)
  and e.after_version=(select max(latest.after_version) from public.service_schedule_effects latest
    where latest.schedule_id=a.id and latest.organization_id=a.organization_id and latest.reversal_of is null
      and not exists(select 1 from public.service_schedule_effects reversed where reversed.reversal_of=latest.id))
  and e.reversal_of is null and not exists(select 1 from public.service_schedule_effects r where r.reversal_of=e.id);

create table public.maintenance_revisions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  record_id uuid not null,
  record_type text not null check(record_type in ('template','schedule')),
  version integer not null,
  snapshot jsonb not null,
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp()
);
create index maintenance_revision_version on public.maintenance_revisions(organization_id,record_type,record_id,version);
alter table public.maintenance_revisions enable row level security;
revoke all on public.maintenance_revisions from public,anon,authenticated;
grant select on public.maintenance_revisions to authenticated;
grant all on public.maintenance_revisions to service_role;
create policy maintenance_revisions_read on public.maintenance_revisions for select to authenticated using (exists(
  select 1 from public.memberships m where m.organization_id=maintenance_revisions.organization_id
    and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','read_only')));
insert into public.maintenance_revisions(organization_id,record_id,record_type,version,snapshot,actor_id)
select organization_id,id,'schedule',version,to_jsonb(a),updated_by from public.maintenance_assignments a;
insert into public.maintenance_revisions(organization_id,record_id,record_type,version,snapshot,actor_id)
select organization_id,id,'template',version,to_jsonb(t),updated_by from public.maintenance_templates t;
create function public.audit_maintenance() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.maintenance_revisions(organization_id,record_id,record_type,version,snapshot,actor_id)
  values(new.organization_id,new.id,TG_ARGV[0],new.version,to_jsonb(new),new.updated_by);
  return new;
end;
$$;
revoke all on function public.audit_maintenance() from public,anon,authenticated;
create trigger maintenance_assignment_audit after insert or update on public.maintenance_assignments
for each row execute function public.audit_maintenance('schedule');
create trigger maintenance_template_audit after insert or update on public.maintenance_templates
for each row execute function public.audit_maintenance('template');

create or replace function public.save_maintenance(target_organization_id uuid, target_asset_id uuid, payload jsonb)
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
  confirmed jsonb;
  actual jsonb;
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
    and not (target_asset_id is null and key in ('enabled','update_existing','schedule_versions'))
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
    if payload ? 'update_existing' and jsonb_typeof(payload->'update_existing') <> 'boolean' then
      raise exception 'Invalid propagation choice' using errcode='22023';
    end if;
    if coalesce((payload->>'update_existing')::boolean,false) then
      if expected=0 or jsonb_typeof(payload->'schedule_versions') is distinct from 'object' then
        raise exception 'Confirm affected schedules first' using errcode='22023';
      end if;
      -- Match the asset-before-template lock order used by schedule/service commands.
      -- Lock all tenant vehicles so new assignments and archive changes cannot race confirmation.
      perform 1 from public.assets where organization_id=target_organization_id and asset_type='vehicle' order by id for update;
    end if;
    perform 1 from public.maintenance_templates where organization_id=target_organization_id and id=(payload->>'id')::uuid for update;
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
    if coalesce((payload->>'update_existing')::boolean,false) then
      select coalesce(jsonb_object_agg(a.id::text,a.version),'{}'::jsonb) into actual
      from public.maintenance_assignments a join public.assets v on v.id=a.asset_id and v.organization_id=a.organization_id
      where a.organization_id=target_organization_id and a.template_id=definition.id and not a.template_overridden and v.archived_at is null;
      confirmed := payload->'schedule_versions';
      if actual <> confirmed then raise exception 'Affected schedules changed; reload and confirm again' using errcode='PT409'; end if;
      for prior in select a.* from public.maintenance_assignments a
        where a.organization_id=target_organization_id and actual ? a.id::text order by a.id for update
      loop
        if (definition.distance_interval is not null and prior.baseline_usage is null)
          or (definition.time_interval is not null and prior.baseline_date is null) then
          raise exception 'Set a maintenance baseline on the vehicle schedule before adding this interval' using errcode='P1001';
        end if;
        schedule.meter_id := null;
        if definition.distance_interval is not null then
          select m.id into schedule.meter_id from public.meters m where m.organization_id=target_organization_id
            and m.asset_id=prior.asset_id and m.unit=definition.distance_unit;
          if schedule.meter_id is null then raise exception 'Template distance unit must match each vehicle meter' using errcode='P1001'; end if;
        end if;
        update public.maintenance_assignments set name=btrim(definition.name), distance_interval=definition.distance_interval,
          distance_unit=definition.distance_unit,time_interval=definition.time_interval,time_unit=definition.time_unit,
          upcoming_percent=definition.upcoming_percent,due_percent=definition.due_percent,meter_id=schedule.meter_id,
          next_due_usage=case when definition.distance_interval is not null then prior.baseline_usage+definition.distance_interval end,
          -- A manually entered target may not round-trip through month subtraction
          -- (March 31 minus one month plus one month is March 29 in a leap year).
          -- Descriptive/window-only edits must preserve that exact target.
          next_due_date=case when row(definition.time_interval,definition.time_unit) is not distinct from row(prior.time_interval,prior.time_unit) then prior.next_due_date
            when definition.time_interval is not null then public.maintenance_shift(prior.baseline_date,definition.time_interval,definition.time_unit) end,
          version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
        where id=prior.id and organization_id=target_organization_id;
      end loop;
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
        raise exception 'Template changed; reload' using errcode = 'PT409';
      end if;
      insert into public.maintenance_assignments (id,organization_id,asset_id,template_id,meter_id,name,distance_interval,distance_unit,time_interval,time_unit,upcoming_percent,due_percent,next_due_usage,next_due_date,paused,updated_by,baseline_usage,baseline_date)
      values (schedule.id,target_organization_id,target_asset_id,schedule.template_id,schedule.meter_id,btrim(schedule.name),schedule.distance_interval,schedule.distance_unit,schedule.time_interval,schedule.time_unit,schedule.upcoming_percent,schedule.due_percent,schedule.next_due_usage,schedule.next_due_date,schedule.paused,auth.uid(),
        case when schedule.distance_interval is not null then schedule.next_due_usage-schedule.distance_interval
          else (select u.accumulated::numeric from public.maintenance_usage(target_organization_id) u where u.asset_id=target_asset_id) end,
        case when schedule.time_interval is not null then public.maintenance_shift(schedule.next_due_date,-schedule.time_interval,schedule.time_unit)
          else (select (clock_timestamp() at time zone o.timezone)::date from public.organizations o where o.id=target_organization_id) end) returning id into saved;
    else
      select * into prior from public.maintenance_assignments where id=schedule.id and organization_id=target_organization_id and asset_id=target_asset_id for update;
      if not found then raise exception 'Assignment not found' using errcode = 'P0002'; end if;
      if prior.template_id <> schedule.template_id then raise exception 'Assignment template is immutable' using errcode = '23514'; end if;
      update public.maintenance_assignments set
        template_overridden=prior.template_overridden or row(prior.name,prior.distance_interval,prior.distance_unit,prior.time_interval,prior.time_unit,prior.upcoming_percent,prior.due_percent)
          is distinct from row(btrim(schedule.name),schedule.distance_interval,schedule.distance_unit,schedule.time_interval,schedule.time_unit,schedule.upcoming_percent,schedule.due_percent),
        baseline_usage=case when row(prior.next_due_usage,prior.distance_interval,prior.distance_unit) is distinct from row(schedule.next_due_usage,schedule.distance_interval,schedule.distance_unit)
          and schedule.distance_interval is not null then schedule.next_due_usage-schedule.distance_interval else prior.baseline_usage end,
        baseline_date=case when row(prior.next_due_date,prior.time_interval,prior.time_unit) is distinct from row(schedule.next_due_date,schedule.time_interval,schedule.time_unit)
          and schedule.time_interval is not null then public.maintenance_shift(schedule.next_due_date,-schedule.time_interval,schedule.time_unit) else prior.baseline_date end,
        name=btrim(schedule.name),meter_id=schedule.meter_id,distance_interval=schedule.distance_interval,distance_unit=schedule.distance_unit,
        time_interval=schedule.time_interval,time_unit=schedule.time_unit,upcoming_percent=schedule.upcoming_percent,due_percent=schedule.due_percent,
        next_due_usage=schedule.next_due_usage,next_due_date=schedule.next_due_date,paused=schedule.paused,version=version+1,updated_by=auth.uid(),updated_at=now()
      where id=schedule.id and organization_id=target_organization_id and asset_id=target_asset_id and version=expected returning id into saved;
    end if;
  end if;
  if saved is null then raise exception 'Maintenance changed or no longer available; reload' using errcode = 'PT409'; end if;
  return saved;
end;
$$;
revoke all on function public.save_maintenance(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_maintenance(uuid, uuid, jsonb) to authenticated;


-- Keep service anchors and reversal state in the same transaction as existing effects.
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
    update public.maintenance_assignments set
      baseline_usage=coalesce((select (r.snapshot->>'baseline_usage')::numeric from public.maintenance_revisions r where r.record_type='schedule' and r.record_id=schedule.id and r.organization_id=target_organization_id and r.version=effect.before_version order by r.id desc limit 1),effect.before_usage-effect.distance_interval),
      baseline_date=coalesce((select (r.snapshot->>'baseline_date')::date from public.maintenance_revisions r where r.record_type='schedule' and r.record_id=schedule.id and r.organization_id=target_organization_id and r.version=effect.before_version order by r.id desc limit 1),public.maintenance_shift(effect.before_date,-effect.time_interval,effect.time_unit)),
      next_due_usage=effect.before_usage,next_due_date=effect.before_date,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
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
    update public.maintenance_assignments set baseline_usage=saved.total_distance,baseline_date=saved.service_date,next_due_usage=usage,next_due_date=due_date,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
      where id=selected_id and organization_id=target_organization_id;
    insert into public.service_schedule_effects(organization_id,asset_id,service_id,revision_id,schedule_id,schedule_name,service_date,before_usage,after_usage,before_date,after_date,before_version,after_version,distance_interval,distance_unit,prior_updated_at,time_interval,time_unit)
      values(target_organization_id,target_asset_id,record_id,command_id,schedule.id,schedule.name,saved.service_date,schedule.next_due_usage,usage,schedule.next_due_date,due_date,schedule.version,schedule.version+1,schedule.distance_interval,schedule.distance_unit,schedule.updated_at,schedule.time_interval,schedule.time_unit);
  end loop;
  return record_id;
end;
$$;
