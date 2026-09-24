-- This is the only application write path: owner identity and role are never inputs.
create function public.create_organization(organization_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  new_organization_id uuid;
  normalized_name text := btrim(organization_name);
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if normalized_name is null or char_length(normalized_name) not between 1 and 200 then
    raise exception 'Organization name must contain 1 to 200 characters' using errcode = '22023';
  end if;

  insert into public.organizations (name)
  values (normalized_name)
  returning id into new_organization_id;

  insert into public.memberships (organization_id, user_id, role, status)
  values (new_organization_id, owner_id, 'owner', 'active');

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text) from public, anon, authenticated;
grant execute on function public.create_organization(text) to authenticated;
