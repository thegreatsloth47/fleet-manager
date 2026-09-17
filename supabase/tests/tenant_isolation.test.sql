begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555');
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Organization A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Organization B');
insert into public.memberships (organization_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'admin', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'read_only', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'driver', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'owner', 'revoked');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select ok(row_security_active('public.organizations'), 'Organization RLS is active for application users');
select ok(row_security_active('public.memberships'), 'Membership RLS is active for application users');
select results_eq('select name from public.organizations', array['Organization A']::text[], 'A sees only A, ignoring forged organization metadata');
select is((select count(*) from public.organizations where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'A cannot read B by a known UUID');
select is((select count(*) from public.memberships), 1::bigint, 'A sees only its own active membership');
select is((select count(*) from public.memberships where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'A cannot read B memberships');
select is((select count(*) from public.memberships where user_id = '33333333-3333-4333-8333-333333333333'), 0::bigint, 'A cannot enumerate other users even in A');
select throws_ok($$insert into public.organizations (name) values ('Unauthorized')$$, '42501', null, 'Organization creation is not granted');
select throws_ok($$insert into public.memberships (organization_id, user_id, role) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'owner')$$, '42501', null, 'Users cannot enroll themselves in B');
select throws_ok($$update public.memberships set role = 'owner'$$, '42501', null, 'Users cannot change roles');
select throws_ok($$delete from public.memberships$$, '42501', null, 'Users cannot delete memberships');
select throws_ok($$update public.organizations set name = 'Unauthorized'$$, '42501', null, 'Users cannot edit organizations');
select throws_ok($$delete from public.organizations$$, '42501', null, 'Users cannot delete organizations');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select results_eq('select name from public.organizations', array['Organization B']::text[], 'B sees only B');
select is((select count(*) from public.organizations where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'B cannot read A');
select is((select count(*) from public.memberships where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'B cannot read A memberships');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select results_eq('select name from public.organizations order by name', array['Organization A', 'Organization B']::text[], 'A multi-organization user can read both organizations');
select is((select count(*) from public.memberships), 2::bigint, 'Multi-organization user sees both own memberships');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 0::bigint, 'Revoked membership grants no organization access');
select is((select count(*) from public.memberships), 0::bigint, 'Revoked membership is not returned');
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 0::bigint, 'Authenticated outsider sees no organizations');
select is((select count(*) from public.memberships), 0::bigint, 'Authenticated outsider sees no memberships');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok('select * from public.organizations', '42501', null, 'Anonymous callers cannot read organizations');
select throws_ok('select * from public.memberships', '42501', null, 'Anonymous callers cannot read memberships');

-- Verify RLS denies writes independently of table grants, including self-promotion.
reset role;
grant insert, update, delete on public.organizations, public.memberships to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok($$insert into public.organizations (name) values ('Unauthorized')$$, '42501', null, 'RLS rejects organization insertion even with a table grant');
select throws_ok($$insert into public.memberships (organization_id, user_id, role) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'owner')$$, '42501', null, 'RLS rejects membership insertion even with a table grant');
update public.memberships set role = 'owner';
select is((select count(*) from public.memberships where role = 'owner'), 0::bigint, 'RLS prevents self-promotion even with a table grant');
update public.organizations set name = 'Unauthorized';
select is((select count(*) from public.organizations where name = 'Unauthorized'), 0::bigint, 'RLS prevents organization updates even with a table grant');
delete from public.memberships;
select is((select count(*) from public.memberships), 2::bigint, 'RLS prevents membership deletion even with a table grant');
delete from public.organizations;
select is((select count(*) from public.organizations), 2::bigint, 'RLS prevents organization deletion even with a table grant');

reset role;
update public.memberships set status = 'revoked' where user_id = '33333333-3333-4333-8333-333333333333';
set local role authenticated;
select is((select count(*) from public.organizations), 0::bigint, 'Revocation takes effect with the same authenticated JWT');

select * from finish();
rollback;
