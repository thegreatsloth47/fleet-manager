begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666'),
  ('77777777-7777-4777-8777-777777777777');
insert into public.organizations (id, name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B');
insert into public.memberships (organization_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'read_only', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'driver', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'owner', 'revoked'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '77777777-7777-4777-8777-777777777777', 'owner', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777', 'read_only', 'active');
insert into public.assets (id, organization_id, asset_type, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vehicle', 'Van A'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'vehicle', 'Van B');
insert into public.vehicle_profiles (asset_id, organization_id, vin) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'VIN-A'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'VIN-B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select ok(row_security_active('public.assets'), 'Asset RLS is active');
select ok(row_security_active('public.vehicle_profiles'), 'Vehicle profile RLS is active');
select is((select count(*) from public.assets), 1::bigint, 'Owner reads only their own assets despite forged metadata');
select is((select count(*) from public.vehicle_profiles), 1::bigint, 'Owner reads only their own profiles');
select is((select count(*) from public.assets where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0::bigint, 'Foreign asset ID cannot be read');
select throws_ok($$select public.save_vehicle('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Owner cannot create for another organization');
select throws_ok($$select public.save_vehicle('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001', 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Owner cannot edit another organization');
select throws_ok($$select public.archive_vehicle('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001')$$, '42501', null, 'Owner cannot archive another organization');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-0000-4000-8000-000000000001', 'New van', 'active', null, null, null, null, null, null, null)$$, 'P0002', null, 'Foreign asset with own tenant scope is not found');
select throws_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-0000-4000-8000-000000000001')$$, 'P0002', null, 'Foreign asset cannot be archived with own tenant scope');
select lives_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Created', 'active', null, null, null, null, ' abc ', null, null)$$, 'Owner creates both asset and profile');
select is((select count(*) from public.assets a join public.vehicle_profiles v on v.asset_id = a.id where a.name = 'Created' and v.vin = 'ABC'), 1::bigint, 'Creation trims and uppercases VIN');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Created', 'active', null, null, null, null, null, null, null)$$, '23505', null, 'Live display names are unique');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Rolled back', 'active', null, null, null, null, 'abc', null, null)$$, '23505', null, 'VIN uniqueness is normalized');
select is((select count(*) from public.assets where name = 'Rolled back'), 0::bigint, 'Failed profile insert rolls back asset');
select lives_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Renamed', 'out_of_service', null, null, null, null, 'VIN-A', null, null)$$, 'Owner edits both records');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Bad edit', 'active', null, null, null, null, 'ABC', null, null)$$, '23505', null, 'Conflicting VIN prevents an edit');
select is((select count(*) from public.assets where name = 'Renamed' and status = 'out_of_service'), 1::bigint, 'Failed profile edit rolls back asset changes');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, '', 'active', null, null, null, null, null, null, null)$$, '23514', null, 'Blank names are rejected in database');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'invalid', null, null, null, null, null, null, null)$$, '23514', null, 'Invalid operational statuses are rejected');
select lives_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001')$$, 'Owner archives vehicle');
select lives_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001')$$, 'Repeated archive succeeds without restoring');
select is((select count(*) from public.assets where id = 'aaaaaaaa-0000-4000-8000-000000000001' and archived_at is not null), 1::bigint, 'Archived vehicle remains visible');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Restore', 'active', null, null, null, null, 'VIN-A', null, null)$$, '55000', null, 'Archived vehicle cannot be edited');
select lives_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Renamed', 'active', null, null, null, null, null, null, null)$$, 'Archived names may be reused');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Reserved VIN', 'active', null, null, null, null, 'VIN-A', null, null)$$, '23505', null, 'Archived VINs remain reserved');
select lives_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Second null VIN', 'active', null, null, null, null, null, null, null)$$, 'Multiple null VINs are allowed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select lives_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Admin van', 'active', null, null, null, null, null, null, null)$$, 'Admin can create');
select lives_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (select id from public.assets where name = 'Admin van'), 'Admin edited', 'active', 'Ford', 'Transit', 2024, 'Work van', 'ADMIN-VIN', 'ABC-123', 'MO')$$, 'Admin can edit all identification fields');
select is((select count(*) from public.assets a join public.vehicle_profiles v on v.asset_id = a.id where a.name = 'Admin edited' and a.make = 'Ford' and a.model = 'Transit' and a.year = 2024 and a.description = 'Work van' and v.vin = 'ADMIN-VIN' and v.plate = 'ABC-123' and v.jurisdiction = 'MO'), 1::bigint, 'All fields persist in their appropriate table');
select lives_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (select id from public.assets where name = 'Admin edited'))$$, 'Admin can archive');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select ok((select count(*) from public.assets) > 0, 'Read-only members can read assets');
select ok((select count(*) from public.vehicle_profiles) > 0, 'Read-only members can read profiles');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Read-only cannot create');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Read-only cannot edit');
select throws_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001')$$, '42501', null, 'Read-only cannot archive');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select is((select count(*) from public.assets), 0::bigint, 'Driver cannot read assets');
select is((select count(*) from public.vehicle_profiles), 0::bigint, 'Driver cannot read profiles');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Driver cannot create');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Driver cannot edit');
select throws_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001')$$, '42501', null, 'Driver cannot archive');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select is((select count(*) from public.assets), 0::bigint, 'Revoked cannot read assets');
select is((select count(*) from public.vehicle_profiles), 0::bigint, 'Revoked cannot read profiles');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Revoked cannot create');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Revoked cannot edit');
select throws_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001')$$, '42501', null, 'Revoked cannot archive');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select is((select count(*) from public.assets), 0::bigint, 'Outsider cannot read assets');
select is((select count(*) from public.vehicle_profiles), 0::bigint, 'Outsider cannot read profiles');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Outsider cannot create');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Outsider cannot edit');
select throws_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001')$$, '42501', null, 'Outsider cannot archive');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select is((select count(*) from public.assets where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1::bigint, 'Multi-tenant member can read B');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Owner in B with read-only role in A cannot write A');
select lives_ok($$select public.save_vehicle('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 'Renamed', 'active', null, null, null, null, 'VIN-A', null, null)$$, 'Names and VINs can repeat across tenants');
reset role;
update public.memberships set status = 'revoked' where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and user_id = '77777777-7777-4777-8777-777777777777';

set local role authenticated;
select throws_ok($$select public.save_vehicle('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Revocation is effective with unchanged JWT');
select is((select count(*) from public.assets where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'Revocation removes read access immediately');
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select * from public.assets$$, '42501', null, 'Anonymous cannot read assets');
select throws_ok($$select * from public.vehicle_profiles$$, '42501', null, 'Anonymous cannot read vehicle_profiles');
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Anonymous cannot save');
select throws_ok($$select public.archive_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001')$$, '42501', null, 'Anonymous cannot archive');

set local role authenticated;
select throws_ok($$select public.save_vehicle('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'New van', 'active', null, null, null, null, null, null, null)$$, '42501', null, 'Missing authenticated identity cannot save');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select throws_ok($$delete from public.assets$$, '42501', null, 'Owner cannot delete assets');
select throws_ok($$update public.assets set organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, '42501', null, 'Owner cannot reassign assets');
select throws_ok($$delete from public.vehicle_profiles$$, '42501', null, 'Owner cannot delete vehicle_profiles');
select throws_ok($$update public.vehicle_profiles set organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, '42501', null, 'Owner cannot reassign vehicle_profiles');
-- Verify direct-write RLS independently of table privileges.
reset role;
grant insert, update, delete on public.assets, public.vehicle_profiles to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","organization_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select throws_ok($$insert into public.assets (organization_id, asset_type, name) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'vehicle', 'Bypass')$$, '42501', null, 'RLS blocks direct partial asset creation even with grants');
select throws_ok($$insert into public.vehicle_profiles (organization_id, asset_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid())$$, '42501', null, 'RLS blocks direct profile creation even with grants');
update public.assets set name = 'Bypass', archived_at = null;
update public.vehicle_profiles set vin = 'BYPASS';
delete from public.vehicle_profiles;
delete from public.assets;
select is((select count(*) from public.assets where name = 'Bypass'), 0::bigint, 'RLS blocks direct asset edits and restoration');
select is((select count(*) from public.vehicle_profiles where vin = 'BYPASS'), 0::bigint, 'RLS blocks direct profile edits');
select is((select count(*) from public.assets where id = 'aaaaaaaa-0000-4000-8000-000000000001' and archived_at is not null), 1::bigint, 'RLS prevents deleting archived asset');
select is((select count(*) from public.vehicle_profiles where asset_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1::bigint, 'RLS prevents deleting profile');
reset role;
-- B already has VIN-A from the cross-tenant VIN reuse test. Clear the VIN in
-- this attempted update so only the composite foreign key can reject it.
select throws_ok($$update public.vehicle_profiles set organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', vin = null where asset_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '23503', null, 'Composite foreign key prevents mismatched tenant profiles');
select throws_ok($$update public.assets set asset_type = 'equipment' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '23514', null, 'Equipment is not an implemented asset type');
select * from finish();
rollback;
