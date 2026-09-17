create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'archived')),
  timezone text not null default 'UTC' check (length(btrim(timezone)) > 0),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'admin', 'driver', 'read_only')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index memberships_user_id_organization_id_idx
  on public.memberships (user_id, organization_id) where status = 'active';

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

-- Provisioning is administrative until explicit onboarding/management commands exist.
revoke all on public.organizations, public.memberships from public, anon, authenticated;
grant select on public.organizations, public.memberships to authenticated;
grant all on public.organizations, public.memberships to service_role;

-- Reading only one's own memberships avoids recursive RLS and exposes no member directory.
create policy memberships_select_own_active on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) and status = 'active');

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships
      where memberships.organization_id = organizations.id
        and memberships.user_id = (select auth.uid())
        and memberships.status = 'active'
    )
  );
