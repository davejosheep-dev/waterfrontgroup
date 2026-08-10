-- Four-role access control. A Waterfront "concept" is represented by an outlet.
-- The legacy staff_role column remains for compatibility with Phase 1-4 functions.

alter table public.staff_profiles
  add column access_role text,
  add column email text,
  add column primary_outlet_id uuid references public.outlets(id),
  add column version integer not null default 1,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.staff_profiles(user_id);

update public.staff_profiles
set access_role = case role
  when 'group_admin' then 'superadmin'
  when 'group_manager' then 'owner'
  when 'outlet_manager' then 'manager'
  else 'staff'
end;

update public.staff_profiles sp
set primary_outlet_id = (
  select a.outlet_id
  from public.staff_outlet_assignments a
  where a.user_id = sp.user_id
  order by a.outlet_id
  limit 1
)
where sp.access_role in ('manager', 'staff');

alter table public.staff_profiles
  alter column access_role set not null,
  add constraint staff_profiles_access_role_check
    check (access_role in ('superadmin', 'owner', 'manager', 'staff')),
  add constraint staff_profiles_role_scope_check
    check (
      (access_role in ('superadmin', 'owner') and primary_outlet_id is null)
      or (access_role in ('manager', 'staff') and primary_outlet_id is not null)
    ) not valid,
  add constraint staff_profiles_version_check check (version > 0);

alter table public.staff_profiles validate constraint staff_profiles_role_scope_check;
create unique index staff_profiles_email_unique_idx on public.staff_profiles(lower(email)) where email is not null;
create index staff_profiles_access_role_idx on public.staff_profiles(access_role) where active;
create index staff_profiles_primary_outlet_idx on public.staff_profiles(primary_outlet_id) where active;

comment on column public.staff_profiles.access_role is 'Application role: superadmin, owner, manager, or staff.';
comment on column public.staff_profiles.primary_outlet_id is 'The assigned concept for manager and staff roles; null for group-wide roles.';
comment on column public.staff_profiles.deactivated_at is 'Soft-removal timestamp retained for auditability.';

create or replace function public.current_access_role() returns text
language sql stable security definer set search_path = '' as $$
  select sp.access_role
  from public.staff_profiles sp
  where sp.user_id = (select auth.uid()) and sp.active;
$$;

create or replace function private.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_access_role() = 'superadmin', false);
$$;

create or replace function public.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select case sp.access_role
    when 'superadmin' then 'group_admin'::public.staff_role
    when 'owner' then 'read_only'::public.staff_role
    when 'manager' then 'outlet_manager'::public.staff_role
    else 'reservations_staff'::public.staff_role
  end
  from public.staff_profiles sp
  where sp.user_id = (select auth.uid()) and sp.active;
$$;

create or replace function public.has_outlet_access(target_outlet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = (select auth.uid())
      and sp.active
      and (
        sp.access_role in ('superadmin', 'owner')
        or sp.primary_outlet_id = target_outlet
        or exists (
          select 1 from public.staff_outlet_assignments a
          where a.user_id = sp.user_id and a.outlet_id = target_outlet
        )
      )
  );
$$;

create or replace function public.can_mutate() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_access_role() in ('superadmin', 'manager', 'staff'), false);
$$;

create or replace function public.can_override() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_access_role() in ('superadmin', 'manager'), false);
$$;

create or replace function public.get_current_access_context()
returns table (
  user_id uuid,
  full_name text,
  access_role text,
  concept_id uuid,
  concept_name text
)
language sql stable security definer set search_path = '' as $$
  select sp.user_id, sp.full_name, sp.access_role, sp.primary_outlet_id,
    case when sp.access_role in ('superadmin', 'owner') then 'All concepts' else o.name end
  from public.staff_profiles sp
  left join public.outlets o on o.id = sp.primary_outlet_id
  where sp.user_id = (select auth.uid()) and sp.active;
$$;

create or replace function private.has_capability(required_capability text, target_outlet uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    private.is_superadmin()
    or exists (
      select 1
      from public.staff_profiles sp
      join public.staff_capability_assignments ca on ca.user_id = sp.user_id and ca.revoked_at is null
      where sp.user_id = (select auth.uid())
        and sp.active
        and ca.capability = required_capability
        and (ca.outlet_id is null or target_outlet is null or ca.outlet_id = target_outlet)
        and (target_outlet is null or public.has_outlet_access(target_outlet))
    )
  );
$$;

drop policy if exists profiles_self_or_admin on public.staff_profiles;
create policy profiles_self_or_superadmin on public.staff_profiles
for select to authenticated
using (user_id = (select auth.uid()) or private.is_superadmin());

drop policy if exists assignments_read on public.staff_outlet_assignments;
create policy assignments_self_or_superadmin on public.staff_outlet_assignments
for select to authenticated
using (user_id = (select auth.uid()) or private.is_superadmin());

-- The secret-key-only administrative route writes these tables after it verifies
-- the calling user's live database role. Authenticated clients remain read-only.
revoke insert, update, delete on public.staff_profiles from anon, authenticated;
revoke insert, update, delete on public.staff_outlet_assignments from anon, authenticated;
grant select on public.staff_profiles, public.staff_outlet_assignments, public.outlets to authenticated;

revoke execute on function public.current_access_role() from public, anon, authenticated;
revoke execute on function public.get_current_access_context() from public, anon, authenticated;
revoke execute on function private.is_superadmin() from public, anon, authenticated;
revoke execute on function private.has_capability(text,uuid) from public, anon, authenticated;
grant execute on function public.current_access_role() to authenticated;
grant execute on function public.get_current_access_context() to authenticated;

