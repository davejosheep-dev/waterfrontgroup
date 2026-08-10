begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public','organizations','organization tenant exists');
select has_table('public','organization_memberships','organization memberships exist');
select has_table('public','venue_memberships','venue memberships exist');
select has_table('public','roles','custom-capable roles exist');
select has_table('public','permissions','atomic permissions exist');
select has_table('public','role_permissions','permission bundles exist');
select has_table('public','staff_invitations','expiring invitations exist');
select has_table('public','booking_sources','tenant booking sources exist');
select has_table('public','guest_aliases','merge aliases exist');
select has_table('public','audit_events','append-only audit events exist');
select has_table('public','idempotency_keys','idempotency boundary exists');

select col_is_not_null('public','outlets','organization_id','every venue has an organization');
select col_is_not_null('public','guests','organization_id','every guest has an organization');
select col_is_not_null('public','reservations','organization_id','every reservation has an organization');
select col_is_not_null('public','guest_contact_points','organization_id','every canonical contact has an organization');

select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (
  'organizations','organization_memberships','venue_memberships','roles','permissions','role_permissions','staff_invitations','booking_sources','guest_aliases','audit_events','idempotency_keys'
)),'RLS is enabled on every new exposed tenant table');

select ok(not has_table_privilege('anon','public.organizations','select'),'anonymous cannot enumerate organizations');
select ok(not has_table_privilege('anon','public.organization_memberships','select'),'anonymous cannot read memberships');
select ok(not has_table_privilege('authenticated','public.staff_invitations','select'),'browser clients cannot read invitation hashes');
select ok(not has_table_privilege('authenticated','public.audit_events','update'),'audit events cannot be updated by routine users');
select ok(not has_table_privilege('authenticated','public.audit_events','delete'),'audit events cannot be deleted by routine users');
select is((select count(*) from public.permissions),25::bigint,'all initial atomic permissions are seeded');
select is((select count(*) from public.booking_sources where code in ('website','facebook','instagram','whatsapp','viber','phone','email','walk_in','staff_entry','google','partner')),11::bigint,'the required source catalog is seeded');

select * from finish();
rollback;
