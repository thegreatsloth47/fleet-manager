alter table public.organizations add column slug text;

-- One allocation path also covers existing administrative fixture provisioning.
create function public.assign_organization_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  suffix integer := 1;
begin
  if TG_OP = 'UPDATE' and old.slug is not null then
    if new.slug is distinct from old.slug then
      raise exception 'Organization slugs cannot be changed' using errcode = '22023';
    end if;
    return new;
  end if;
  -- Organization creation is infrequent. Serialize allocation to avoid races
  -- between equal names and names that already contain a numeric suffix.
  perform pg_catalog.pg_advisory_xact_lock(20261024, 1);
  base := trim(both '-' from left(regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g'), 48));
  if base = '' then base := 'organization'; end if;
  if base = any(array['api','auth','organizations','settings','admin','dashboard','vehicles','maintenance','new','login','logout','signup','help','support']) then
    base := 'org-' || base;
  end if;
  candidate := base;
  while exists(select 1 from public.organizations where slug = candidate and id <> new.id) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;
revoke all on function public.assign_organization_slug() from public, anon, authenticated;
create trigger organizations_assign_slug before insert or update on public.organizations
for each row execute function public.assign_organization_slug();

-- Backfill without changing IDs, memberships, or tenant-owned records.
update public.organizations set slug = null where slug is null;
alter table public.organizations alter column slug set not null;
alter table public.organizations add constraint organizations_slug_unique unique (slug);
alter table public.organizations add constraint organizations_slug_format
  check (length(slug) between 1 and 63 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
