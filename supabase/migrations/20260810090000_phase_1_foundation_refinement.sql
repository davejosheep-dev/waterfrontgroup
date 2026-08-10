-- Phase 1 foundation refinement. This is additive so the Phase 2-4 reservation,
-- payment, floor, CRM, and marketing work remains compatible.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  default_currency text not null default 'PHP' check (default_currency ~ '^[A-Z]{3}$'),
  default_locale text not null default 'en-PH',
  status text not null default 'active' check (status in ('active','inactive')),
  contact_details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations(name,slug,default_currency,default_locale)
values ('Waterfront Group','waterfront-group','PHP','en-PH')
on conflict(slug) do nothing;

alter table public.outlets drop constraint if exists valid_timezone;
alter table public.outlets
  add column organization_id uuid,
  add column code text,
  add column currency text not null default 'PHP',
  add column locale text not null default 'en-PH',
  add column booking_state text not null default 'open',
  add column contact_details jsonb not null default '{}',
  add column address jsonb not null default '{}';

update public.outlets
set organization_id = (select id from public.organizations where slug='waterfront-group'),
    code = coalesce(code, upper(left(regexp_replace(slug,'[^a-z0-9]','','g'),8)));

alter table public.outlets
  alter column organization_id set not null,
  alter column code set not null,
  add constraint outlets_organization_fk foreign key(organization_id) references public.organizations(id),
  add constraint outlets_currency_check check (currency ~ '^[A-Z]{3}$'),
  add constraint outlets_booking_state_check check (booking_state in ('draft','open','paused','closed')),
  add constraint outlets_timezone_check check (length(trim(timezone)) between 3 and 64),
  add constraint outlets_organization_id_unique unique(organization_id,id);
create unique index outlets_organization_code_idx on public.outlets(organization_id,lower(code));
create unique index outlets_organization_slug_idx on public.outlets(organization_id,lower(slug));
create index outlets_organization_status_idx on public.outlets(organization_id,active,name,id);

alter table public.guests add column organization_id uuid;
update public.guests g
set organization_id = coalesce(
  (select o.organization_id from public.reservations r join public.outlets o on o.id=r.outlet_id where r.guest_id=g.id order by r.created_at limit 1),
  (select id from public.organizations where slug='waterfront-group')
);
alter table public.guests
  alter column organization_id set not null,
  add constraint guests_organization_fk foreign key(organization_id) references public.organizations(id),
  add constraint guests_organization_id_unique unique(organization_id,id),
  add constraint guests_identity_minimum_check check (length(trim(full_name)) > 0 or mobile_normalized is not null or email_normalized is not null);
create index guests_organization_name_idx on public.guests(organization_id,lower(full_name),created_at,id);
create index guests_organization_mobile_idx on public.guests(organization_id,mobile_normalized) where mobile_normalized is not null;
create index guests_organization_email_idx on public.guests(organization_id,email_normalized) where email_normalized is not null;

alter table public.reservations add column organization_id uuid;
update public.reservations r set organization_id=o.organization_id from public.outlets o where o.id=r.outlet_id;
alter table public.reservations
  alter column organization_id set not null,
  add constraint reservations_organization_fk foreign key(organization_id) references public.organizations(id),
  add constraint reservations_organization_outlet_fk foreign key(organization_id,outlet_id) references public.outlets(organization_id,id),
  add constraint reservations_organization_guest_fk foreign key(organization_id,guest_id) references public.guests(organization_id,id);
create index reservations_organization_service_idx on public.reservations(organization_id,outlet_id,local_date,starts_at,id);

create table public.permissions (
  permission_key text primary key check (permission_key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  code text not null check (code ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 2 and 80),
  scope_type text not null check (scope_type in ('platform','organization','venue')),
  system_template boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_type='platform') = (organization_id is null))
);
create unique index roles_tenant_code_idx on public.roles(coalesce(organization_id,'00000000-0000-0000-0000-000000000000'::uuid),code);
create index roles_organization_active_idx on public.roles(organization_id,active,name,id);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(permission_key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(role_id,permission_key)
);

insert into public.permissions(permission_key,description) values
  ('organizations.read','Read organization settings'),('organizations.manage','Manage organization settings'),
  ('venues.read','Read accessible venues'),('venues.manage','Manage venue settings'),
  ('staff.read','Read staff memberships'),('staff.invite','Invite staff members'),('staff.deactivate','Deactivate staff memberships'),
  ('roles.manage','Manage role permission bundles'),('guests.read','Read organization guests'),
  ('guests.create','Create organization guests'),('guests.update','Update organization guests'),('guests.merge','Merge duplicate guests'),
  ('guest_notes.read','Read ordinary guest notes'),('guest_notes.write','Write ordinary guest notes'),('guest_notes.sensitive','Access sensitive guest notes'),
  ('consents.read','Read consent history'),('consents.manage','Capture or withdraw consent'),('audit.read','Read audit events'),
  ('reservations.read','Read reservations'),('reservations.manage','Manage reservations'),
  ('floor.read','Read floor plans'),('floor.manage','Manage floor plans'),
  ('payments.read','Read payment status'),('payments.manage','Manage manual payments'),('reports.read','Read operational reports')
on conflict(permission_key) do update set description=excluded.description;

with organization as (select id from public.organizations where slug='waterfront-group'),
templates(code,name,scope_type) as (values
  ('organization_owner','Organization owner','organization'),
  ('organization_admin','Organization administrator','organization'),
  ('organization_member','Organization member','organization'),
  ('venue_manager','Venue manager','venue'),('host','Host / reservation agent','venue'),
  ('finance','Finance user','venue'),('marketing_crm','Marketing / CRM user','organization'),
  ('analyst_viewer','Analyst / viewer','organization')
)
insert into public.roles(organization_id,code,name,scope_type,system_template)
select organization.id,templates.code,templates.name,templates.scope_type,true from organization cross join templates
on conflict do nothing;

with organization_roles as (
  select r.id,r.code from public.roles r join public.organizations o on o.id=r.organization_id where o.slug='waterfront-group'
), bundle(role_code,permission_key) as (values
  ('organization_owner','organizations.read'),('organization_owner','organizations.manage'),('organization_owner','venues.read'),('organization_owner','venues.manage'),
  ('organization_owner','staff.read'),('organization_owner','staff.invite'),('organization_owner','staff.deactivate'),('organization_owner','roles.manage'),
  ('organization_owner','guests.read'),('organization_owner','guests.create'),('organization_owner','guests.update'),('organization_owner','guests.merge'),
  ('organization_owner','guest_notes.read'),('organization_owner','guest_notes.write'),('organization_owner','guest_notes.sensitive'),
  ('organization_owner','consents.read'),('organization_owner','consents.manage'),('organization_owner','audit.read'),
  ('organization_owner','reservations.read'),('organization_owner','reservations.manage'),('organization_owner','floor.read'),('organization_owner','floor.manage'),
  ('organization_owner','payments.read'),('organization_owner','payments.manage'),('organization_owner','reports.read'),
  ('organization_admin','organizations.read'),('organization_admin','venues.read'),('organization_admin','venues.manage'),
  ('organization_admin','staff.read'),('organization_admin','staff.invite'),('organization_admin','staff.deactivate'),
  ('organization_admin','guests.read'),('organization_admin','guests.create'),('organization_admin','guests.update'),('organization_admin','guests.merge'),
  ('organization_admin','guest_notes.read'),('organization_admin','guest_notes.write'),('organization_admin','consents.read'),('organization_admin','consents.manage'),('organization_admin','audit.read'),
  ('organization_member','organizations.read'),('organization_member','venues.read'),
  ('venue_manager','venues.read'),('venue_manager','venues.manage'),('venue_manager','staff.read'),
  ('venue_manager','guests.read'),('venue_manager','guests.create'),('venue_manager','guests.update'),('venue_manager','guest_notes.read'),('venue_manager','guest_notes.write'),
  ('venue_manager','consents.read'),('venue_manager','consents.manage'),('venue_manager','reservations.read'),('venue_manager','reservations.manage'),
  ('venue_manager','floor.read'),('venue_manager','floor.manage'),('venue_manager','payments.read'),('venue_manager','payments.manage'),('venue_manager','reports.read'),
  ('host','venues.read'),('host','guests.read'),('host','guests.create'),('host','guests.update'),('host','guest_notes.read'),('host','guest_notes.write'),
  ('host','consents.read'),('host','consents.manage'),('host','reservations.read'),('host','reservations.manage'),('host','floor.read'),
  ('finance','venues.read'),('finance','payments.read'),('finance','payments.manage'),('finance','reports.read'),
  ('marketing_crm','venues.read'),('marketing_crm','guests.read'),('marketing_crm','guests.create'),('marketing_crm','guests.update'),('marketing_crm','consents.read'),('marketing_crm','consents.manage'),
  ('analyst_viewer','organizations.read'),('analyst_viewer','venues.read'),('analyst_viewer','guests.read'),('analyst_viewer','reservations.read'),('analyst_viewer','floor.read'),('analyst_viewer','payments.read'),('analyst_viewer','reports.read')
)
insert into public.role_permissions(role_id,permission_key)
select organization_roles.id,bundle.permission_key from organization_roles join bundle on bundle.role_code=organization_roles.code
on conflict do nothing;

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  status text not null default 'active' check (status in ('invited','active','inactive')),
  joined_at timestamptz,
  disabled_at timestamptz,
  disabled_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,user_id),
  check (
    (status='invited' and joined_at is null and disabled_at is null)
    or (status='active' and joined_at is not null and disabled_at is null)
    or (status='inactive' and joined_at is not null and disabled_at is not null)
  )
);
create index organization_memberships_user_idx on public.organization_memberships(user_id,status,organization_id);

create table public.venue_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  venue_id uuid not null,
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  status text not null default 'active' check (status in ('active','inactive')),
  joined_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,venue_id) references public.outlets(organization_id,id) on delete restrict,
  unique(venue_id,user_id),
  check (status<>'inactive' or disabled_at is not null)
);
create index venue_memberships_user_scope_idx on public.venue_memberships(user_id,status,organization_id,venue_id);

insert into public.organization_memberships(organization_id,user_id,role_id,status,joined_at)
select o.id,sp.user_id,r.id,'active',now()
from public.staff_profiles sp cross join public.organizations o
join public.roles r on r.organization_id=o.id and r.code=case sp.access_role
  when 'superadmin' then 'organization_owner' when 'owner' then 'analyst_viewer' else 'organization_member' end
where o.slug='waterfront-group'
on conflict(organization_id,user_id) do nothing;

insert into public.venue_memberships(organization_id,venue_id,user_id,role_id,status)
select o.organization_id,a.outlet_id,a.user_id,r.id,'active'
from public.staff_outlet_assignments a join public.outlets o on o.id=a.outlet_id
join public.staff_profiles sp on sp.user_id=a.user_id
join public.roles r on r.organization_id=o.organization_id and r.code=case when sp.access_role='manager' then 'venue_manager' else 'host' end
on conflict(venue_id,user_id) do nothing;

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null check (position('@' in email) > 1),
  inviter_id uuid not null references public.staff_profiles(user_id),
  organization_role_id uuid not null references public.roles(id),
  venue_role_id uuid references public.roles(id),
  venue_ids uuid[] not null default '{}',
  token_hash text not null unique check (length(token_hash)=64),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.staff_profiles(user_id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  resent_at timestamptz,
  check (expires_at > created_at),
  check (not (accepted_at is not null and cancelled_at is not null)),
  check ((accepted_at is null) = (accepted_by is null)),
  check ((cancelled_at is null) = (cancelled_by is null)),
  check ((cardinality(venue_ids)=0) = (venue_role_id is null))
);
create unique index staff_invitations_pending_email_idx on public.staff_invitations(organization_id,lower(email)) where accepted_at is null and cancelled_at is null;
create index staff_invitations_expiry_idx on public.staff_invitations(organization_id,expires_at) where accepted_at is null and cancelled_at is null;

create or replace function private.enforce_invitation_scope() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.roles r where r.id=new.organization_role_id and r.organization_id=new.organization_id and r.scope_type='organization' and r.active) then
    raise exception using errcode='23514',message='Invitation organization role is outside the organization';
  end if;
  if new.venue_role_id is not null and not exists(select 1 from public.roles r where r.id=new.venue_role_id and r.organization_id=new.organization_id and r.scope_type='venue' and r.active) then
    raise exception using errcode='23514',message='Invitation venue role is outside the organization';
  end if;
  if exists(select 1 from unnest(new.venue_ids) venue_id where not exists(
    select 1 from public.outlets o where o.id=venue_id and o.organization_id=new.organization_id and o.active
  )) then
    raise exception using errcode='23514',message='Invitation contains a venue outside the organization';
  end if;
  return new;
end $$;
create trigger staff_invitation_scope_guard before insert or update on public.staff_invitations
for each row execute function private.enforce_invitation_scope();

create table public.booking_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  venue_id uuid,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  display_name text not null,
  channel_category text not null check (channel_category in ('owned','social','messaging','phone','email','walk_in','staff','search','partner')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,venue_id) references public.outlets(organization_id,id),
  unique nulls not distinct(organization_id,venue_id,code)
);
create index booking_sources_scope_idx on public.booking_sources(organization_id,venue_id,active,sort_order,id);

with organization as (select id from public.organizations where slug='waterfront-group'),
sources(code,display_name,channel_category,sort_order) as (values
  ('website','Website','owned',1),('facebook','Facebook','social',2),('instagram','Instagram','social',3),
  ('whatsapp','WhatsApp','messaging',4),('viber','Viber','messaging',5),('phone','Phone','phone',6),
  ('email','Email','email',7),('walk_in','Walk-in','walk_in',8),('staff_entry','Staff Entry','staff',9),
  ('google','Google','search',10),('partner','Partner','partner',11)
)
insert into public.booking_sources(organization_id,venue_id,code,display_name,channel_category,sort_order)
select organization.id,null,sources.code,sources.display_name,sources.channel_category,sources.sort_order
from organization cross join sources
on conflict(organization_id,venue_id,code) do update
set display_name=excluded.display_name,
    channel_category=excluded.channel_category,
    sort_order=excluded.sort_order,
    active=true;

create table public.guest_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  guest_id uuid not null,
  alias_type text not null check (alias_type in ('name','external_reference','merged_guest_id')),
  alias_value text not null check (length(trim(alias_value)) between 1 and 320),
  source text not null,
  created_at timestamptz not null default now(),
  foreign key(organization_id,guest_id) references public.guests(organization_id,id) on delete restrict,
  unique(organization_id,alias_type,alias_value)
);
create index guest_aliases_lookup_idx on public.guest_aliases(organization_id,alias_type,lower(alias_value),id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  venue_id uuid,
  actor_id uuid references public.staff_profiles(user_id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id text,
  before_summary jsonb not null default '{}',
  after_summary jsonb not null default '{}',
  context jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(organization_id,venue_id) references public.outlets(organization_id,id)
);
create index audit_events_tenant_timeline_idx on public.audit_events(organization_id,venue_id,created_at desc,id desc);
create index audit_events_resource_idx on public.audit_events(organization_id,resource_type,resource_id,created_at desc,id desc);

create table public.idempotency_keys (
  organization_id uuid not null references public.organizations(id),
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_reference jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(organization_id,operation,idempotency_key)
);
create index idempotency_keys_expiry_idx on public.idempotency_keys(expires_at);

-- Bring organization scope into the canonical guest tables introduced in Phase 4.
alter table public.guest_contact_points add column organization_id uuid;
update public.guest_contact_points cp set organization_id=g.organization_id from public.guests g where g.id=cp.guest_id;
alter table public.guest_contact_points
  alter column organization_id set not null,
  add constraint guest_contact_points_organization_fk foreign key(organization_id) references public.organizations(id),
  add constraint guest_contact_points_organization_guest_fk foreign key(organization_id,guest_id) references public.guests(organization_id,id);
create index guest_contact_points_tenant_lookup_idx on public.guest_contact_points(organization_id,channel,normalized_value,id) where retired_at is null;

create or replace function private.enforce_guest_contact_tenant_and_collision() returns trigger
language plpgsql security invoker set search_path='' as $$
declare guest_organization uuid;
begin
  select g.organization_id into guest_organization from public.guests g where g.id=new.guest_id;
  if guest_organization is null or new.organization_id<>guest_organization then
    raise exception using errcode='23514', message='Guest contact organization does not match guest';
  end if;
  if new.retired_at is null and new.state<>'invalid' and exists(
    select 1 from public.guest_contact_points cp
    where cp.organization_id=new.organization_id and cp.channel=new.channel and cp.normalized_value=new.normalized_value
      and cp.guest_id<>new.guest_id and cp.retired_at is null and cp.state<>'invalid' and cp.id<>new.id
  ) then
    raise exception using errcode='23505', message='CONTACT_ALREADY_BELONGS_TO_ANOTHER_GUEST';
  end if;
  return new;
end $$;
create trigger guest_contact_tenant_collision_guard before insert or update on public.guest_contact_points
for each row execute function private.enforce_guest_contact_tenant_and_collision();

create or replace function private.has_organization_access(target_organization uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.staff_profiles sp join public.organization_memberships om on om.user_id=sp.user_id
    where sp.user_id=(select auth.uid()) and sp.active and om.status='active' and om.organization_id=target_organization
  );
$$;

create or replace function private.has_atomic_permission(required_permission text,target_organization uuid,target_venue uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.staff_profiles sp
    join public.organization_memberships om on om.user_id=sp.user_id and om.organization_id=target_organization and om.status='active'
    join public.role_permissions rp on rp.role_id=om.role_id and rp.permission_key=required_permission
    where sp.user_id=(select auth.uid()) and sp.active
  ) or exists(
    select 1 from public.staff_profiles sp
    join public.venue_memberships vm on vm.user_id=sp.user_id and vm.organization_id=target_organization and vm.status='active'
    join public.role_permissions rp on rp.role_id=vm.role_id and rp.permission_key=required_permission
    where sp.user_id=(select auth.uid()) and sp.active and target_venue is not null and vm.venue_id=target_venue
  );
$$;

create or replace function public.accept_staff_invitation(invitation_token_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare invitation public.staff_invitations%rowtype;
declare current_user_id uuid := (select auth.uid());
declare current_email text := lower(coalesce((select auth.jwt()->>'email'),''));
declare target_venue uuid;
begin
  if current_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  select * into invitation from public.staff_invitations i
  where i.token_hash=invitation_token_hash and i.accepted_at is null and i.cancelled_at is null
  for update;
  if invitation.id is null then raise exception using errcode='P0002',message='INVITATION_NOT_FOUND_OR_ALREADY_USED'; end if;
  if invitation.expires_at<=now() then raise exception using errcode='22023',message='INVITATION_EXPIRED'; end if;
  if lower(invitation.email)<>current_email then raise exception using errcode='42501',message='INVITATION_EMAIL_MISMATCH'; end if;
  if not exists(select 1 from public.staff_profiles sp where sp.user_id=current_user_id and sp.active) then
    raise exception using errcode='42501',message='ACTIVE_STAFF_PROFILE_REQUIRED';
  end if;

  insert into public.organization_memberships(organization_id,user_id,role_id,status,joined_at)
  values(invitation.organization_id,current_user_id,invitation.organization_role_id,'active',now())
  on conflict(organization_id,user_id) do update set role_id=excluded.role_id,status='active',joined_at=coalesce(public.organization_memberships.joined_at,now()),disabled_at=null,disabled_by=null,updated_at=now();

  foreach target_venue in array invitation.venue_ids loop
    insert into public.venue_memberships(organization_id,venue_id,user_id,role_id,status)
    values(invitation.organization_id,target_venue,current_user_id,invitation.venue_role_id,'active')
    on conflict(venue_id,user_id) do update set role_id=excluded.role_id,status='active',disabled_at=null,disabled_by=null,updated_at=now();
  end loop;

  update public.staff_invitations set accepted_at=now(),accepted_by=current_user_id where id=invitation.id;
  insert into public.audit_events(organization_id,actor_id,action,resource_type,resource_id,after_summary)
  values(invitation.organization_id,current_user_id,'staff.invitation.accepted','staff_invitation',invitation.id,jsonb_build_object('venue_count',cardinality(invitation.venue_ids)));
  return true;
end $$;

alter table public.organizations enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.venue_memberships enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.booking_sources enable row level security;
alter table public.guest_aliases enable row level security;
alter table public.audit_events enable row level security;
alter table public.idempotency_keys enable row level security;

create policy organizations_member_read on public.organizations for select to authenticated using (private.has_organization_access(id));
create policy permissions_authenticated_read on public.permissions for select to authenticated using ((select auth.uid()) is not null);
create policy roles_member_read on public.roles for select to authenticated using (organization_id is not null and private.has_organization_access(organization_id));
create policy role_permissions_member_read on public.role_permissions for select to authenticated using (exists(select 1 from public.roles r where r.id=role_id and r.organization_id is not null and private.has_organization_access(r.organization_id)));
create policy organization_memberships_self_or_staff_read on public.organization_memberships for select to authenticated using (user_id=(select auth.uid()) or private.has_atomic_permission('staff.read',organization_id,null));
create policy venue_memberships_self_or_staff_read on public.venue_memberships for select to authenticated using (user_id=(select auth.uid()) or private.has_atomic_permission('staff.read',organization_id,venue_id));
create policy booking_sources_member_read on public.booking_sources for select to authenticated using (private.has_atomic_permission('venues.read',organization_id,venue_id));
create policy guest_aliases_guest_read on public.guest_aliases for select to authenticated using (private.has_atomic_permission('guests.read',organization_id,null));
create policy audit_events_permission_read on public.audit_events for select to authenticated using (private.has_atomic_permission('audit.read',organization_id,venue_id));
create policy guests_organization_permission_read on public.guests for select to authenticated using (private.has_atomic_permission('guests.read',organization_id,null));

revoke all on public.organizations,public.permissions,public.roles,public.role_permissions,public.organization_memberships,public.venue_memberships,
  public.staff_invitations,public.booking_sources,public.guest_aliases,public.audit_events,public.idempotency_keys from anon,authenticated;
grant select on public.organizations,public.permissions,public.roles,public.role_permissions,public.organization_memberships,public.venue_memberships,
  public.booking_sources,public.guest_aliases,public.audit_events to authenticated;

revoke execute on function private.has_organization_access(uuid) from public,anon,authenticated;
revoke execute on function private.has_atomic_permission(text,uuid,uuid) from public,anon,authenticated;
revoke execute on function private.enforce_guest_contact_tenant_and_collision() from public,anon,authenticated;
revoke execute on function private.enforce_invitation_scope() from public,anon,authenticated;
revoke execute on function public.accept_staff_invitation(text) from public,anon;
grant execute on function private.has_organization_access(uuid),private.has_atomic_permission(text,uuid,uuid) to authenticated;
grant execute on function public.accept_staff_invitation(text) to authenticated;

comment on table public.outlets is 'Venues/concepts. The legacy table name is retained for Phase 2-4 compatibility.';
comment on table public.staff_invitations is 'Single-use, expiring invitation records. Raw tokens are never stored.';
comment on table public.audit_events is 'Append-only tenant audit history with redacted summaries.';
