begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id) values
  ('66666666-6666-4666-8666-666666666666'),
  ('77777777-7777-4777-8777-777777777777');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.create_organization('Anonymous')$$, '42501', null, 'Anonymous users cannot call organization creation');

set local role authenticated;
select throws_ok($$select public.create_organization('Missing identity')$$, '42501', null, 'A missing authenticated identity is rejected inside the function');
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","user_metadata":{"owner_id":"77777777-7777-4777-8777-777777777777"}}', true);
select throws_ok($$select public.create_organization(null)$$, '22023', null, 'Null names are rejected');
select throws_ok($$select public.create_organization('   ')$$, '22023', null, 'Blank names are rejected');
select throws_ok($$select public.create_organization(repeat('x', 201))$$, '22023', null, 'Oversized names are rejected');
select set_config('test.created_org_a', public.create_organization('  Team A  ')::text, true);
select results_eq('select name from public.organizations', array['Team A']::text[], 'Creator can immediately read the trimmed organization');
select is((select count(*) from public.memberships), 1::bigint, 'Creation inserts exactly one membership');
select is((select role from public.memberships where organization_id = current_setting('test.created_org_a')::uuid), 'owner', 'Creator receives Owner role');
select is((select status from public.memberships where organization_id = current_setting('test.created_org_a')::uuid), 'active', 'Owner membership is active');
select is((select user_id from public.memberships where organization_id = current_setting('test.created_org_a')::uuid), '66666666-6666-4666-8666-666666666666'::uuid, 'Owner comes from Auth identity, ignoring metadata');
select throws_ok($$insert into public.organizations (name) values ('Bypass')$$, '42501', null, 'Direct organization inserts remain denied');
select throws_ok($$insert into public.memberships (organization_id, user_id, role) values (current_setting('test.created_org_a')::uuid, '77777777-7777-4777-8777-777777777777', 'owner')$$, '42501', null, 'Creator cannot grant memberships directly');

select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 0::bigint, 'Another signed-in user cannot see the newly created organization');
select set_config('test.created_org_b', public.create_organization('Team B')::text, true);
select results_eq('select name from public.organizations', array['Team B']::text[], 'Second creator sees only their own organization');
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
select is((select count(*) from public.organizations where id = current_setting('test.created_org_b')::uuid), 0::bigint, 'First creator cannot read second organization by ID');

reset role;
update public.memberships set status = 'revoked' where organization_id = current_setting('test.created_org_a')::uuid;
set local role authenticated;
select is((select count(*) from public.organizations), 0::bigint, 'Revoked owner loses access with the same Auth claims');

-- Simulate failure of the second insert to prove no ownerless organization survives.
reset role;
create function pg_temp.reject_test_membership() returns trigger language plpgsql as $$
begin
  raise exception 'Simulated membership failure' using errcode = '23514';
end;
$$;
create trigger reject_test_membership before insert on public.memberships
  for each row execute function pg_temp.reject_test_membership();
set local role authenticated;
select throws_ok($$select public.create_organization('Must roll back')$$, '23514', 'Simulated membership failure', 'Membership failure fails the whole creation');
reset role;
select is((select count(*) from public.organizations where name = 'Must roll back'), 0::bigint, 'Failed creation leaves no orphan organization');
select is((select count(*) from public.memberships where organization_id in (current_setting('test.created_org_a')::uuid, current_setting('test.created_org_b')::uuid)), 2::bigint, 'Successful organizations retain exactly their original memberships');

select * from finish();
rollback;
