-- Phase 2: table-aware reservations, availability, holds, waitlist, and walk-ins.
-- This migration is additive. Existing Phase 1-4 request/payment/CRM tables remain
-- compatible while the new resource ledger becomes the authority for new bookings.

create extension if not exists btree_gist;

alter table public.dining_tables
  add column if not exists online_eligible boolean not null default true,
  add column if not exists staff_eligible boolean not null default true,
  add column if not exists priority integer not null default 0,
  add column if not exists active_from date,
  add column if not exists active_to date,
  add constraint dining_tables_active_dates_check check (active_to is null or active_from is null or active_to >= active_from);

alter table public.table_combinations
  add column if not exists online_eligible boolean not null default true,
  add column if not exists staff_eligible boolean not null default true,
  add column if not exists priority integer not null default 0,
  add column if not exists active_from date,
  add column if not exists active_to date,
  add constraint table_combinations_active_dates_check check (active_to is null or active_from is null or active_to >= active_from);

create table public.table_features (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code = lower(code) and code ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 2 and 80),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.dining_table_features (
  table_id uuid not null references public.dining_tables(id) on delete cascade,
  feature_id uuid not null references public.table_features(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (table_id, feature_id)
);

create table public.service_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  code text not null check (code = lower(code) and code ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 2 and 80),
  default_duration_minutes integer not null default 120 check (default_duration_minutes between 15 and 720),
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 5 and 120),
  booking_window_days integer not null default 90 check (booking_window_days between 1 and 730),
  cutoff_minutes integer not null default 30 check (cutoff_minutes between 0 and 1440),
  active boolean not null default true,
  configuration_version integer not null default 1 check (configuration_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  unique (venue_id, code)
);
create index service_periods_scope_idx on public.service_periods(organization_id, venue_id, active, code, id);

create table public.service_schedules (
  id uuid primary key default gen_random_uuid(),
  service_period_id uuid not null references public.service_periods(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  local_start time not null,
  local_end time not null,
  effective_from date not null default current_date,
  effective_to date,
  active boolean not null default true,
  check (local_end > local_start),
  check (effective_to is null or effective_to >= effective_from),
  unique (service_period_id, day_of_week, effective_from)
);
create index service_schedules_lookup_idx on public.service_schedules(service_period_id, day_of_week, effective_from, effective_to, active);

create table public.service_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_period_id uuid references public.service_periods(id) on delete cascade,
  local_date date not null,
  exception_type text not null check (exception_type in ('closed','modified','open')),
  local_start time,
  local_end time,
  reason text not null check (length(trim(reason)) >= 3),
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check ((exception_type = 'closed' and local_start is null and local_end is null) or (exception_type <> 'closed' and local_start is not null and local_end is not null and local_end > local_start)),
  unique (venue_id, service_period_id, local_date)
);
create index service_exceptions_lookup_idx on public.service_exceptions(organization_id, venue_id, local_date, active);

create table public.reservation_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'published' check (status in ('draft','published','retired')),
  published_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  unique (venue_id, version)
);
create unique index reservation_configuration_published_idx on public.reservation_configuration_versions(venue_id) where status = 'published';

create table public.reservation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_period_id uuid references public.service_periods(id) on delete cascade,
  configuration_version_id uuid references public.reservation_configuration_versions(id) on delete restrict,
  rule_type text not null check (rule_type in ('duration','booking_window','cutoff','pacing','capacity','cancellation','deposit','channel','overbooking')),
  name text not null check (length(trim(name)) between 2 and 120),
  priority integer not null default 0,
  party_min integer check (party_min is null or party_min > 0),
  party_max integer check (party_max is null or party_max >= party_min),
  channel text check (channel is null or channel in ('public','staff','phone','walk_in','waitlist','integration')),
  effective_from date not null default current_date,
  effective_to date,
  value jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  check (party_max is null or party_min is not null),
  check (jsonb_typeof(value) = 'object')
);
create index reservation_rules_lookup_idx on public.reservation_rules(organization_id, venue_id, service_period_id, rule_type, effective_from, effective_to, priority desc);

create table public.inventory_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_period_id uuid references public.service_periods(id) on delete cascade,
  dining_area_id uuid references public.dining_areas(id) on delete cascade,
  table_id uuid references public.dining_tables(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_type text not null check (block_type in ('maintenance','buyout','operational_hold','manager_hold','closure')),
  reason text not null check (length(trim(reason)) >= 3),
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check (ends_at > starts_at),
  check (table_id is not null or dining_area_id is not null or service_period_id is not null)
);
create index inventory_blocks_lookup_idx on public.inventory_blocks(organization_id, venue_id, starts_at, ends_at) where active;
create index inventory_blocks_table_idx on public.inventory_blocks(table_id, starts_at, ends_at) where active and table_id is not null;

alter table public.reservations
  alter column created_by drop not null,
  alter column updated_by drop not null,
  add column if not exists channel text not null default 'staff',
  add column if not exists service_period_id uuid references public.service_periods(id) on delete set null,
  add column if not exists configuration_version integer not null default 1,
  add column if not exists policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text,
  add column if not exists public_manage_token_hash text,
  add constraint reservations_channel_check check (channel in ('public','staff','phone','walk_in','waitlist','integration'));
create unique index reservations_idempotency_idx on public.reservations(organization_id, idempotency_key) where idempotency_key is not null;
create index reservations_phase2_day_idx on public.reservations(organization_id, outlet_id, local_date, starts_at, status, id);
create index reservations_consuming_idx on public.reservations(outlet_id, starts_at, ends_at, id) where status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated');

alter table public.reservation_status_history
  alter column actor_id drop not null,
  add column if not exists actor_type text not null default 'staff' check (actor_type in ('guest','staff','system'));

alter table public.reservation_table_assignments alter column assigned_by drop not null;

create table public.inventory_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  hold_token_hash text not null unique check (length(hold_token_hash) = 64),
  idempotency_key text,
  service_period_id uuid references public.service_periods(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null check (party_size > 0),
  state text not null default 'active' check (state in ('active','finalized','released','expired')),
  expires_at timestamptz not null,
  configuration_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check (ends_at > starts_at),
  check (expires_at > created_at)
);
create unique index inventory_holds_idempotency_idx on public.inventory_holds(organization_id, idempotency_key) where idempotency_key is not null;
create index inventory_holds_expiry_idx on public.inventory_holds(venue_id, expires_at) where state = 'active';

create table public.reservation_inventory_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  table_id uuid not null references public.dining_tables(id) on delete restrict,
  reservation_id uuid references public.reservations(id) on delete cascade,
  hold_id uuid references public.inventory_holds(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  resource_state text not null check (resource_state in ('held','active','released')),
  assignment_source text not null default 'auto' check (assignment_source in ('auto','manual','hold','walk_in','waitlist')),
  assignment_score numeric(12,4),
  configuration_version integer not null default 1,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check (ends_at > starts_at),
  check ((reservation_id is not null)::integer + (hold_id is not null)::integer = 1)
);
alter table public.reservation_inventory_resources
  add constraint reservation_inventory_resources_no_overlap
  exclude using gist (table_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (resource_state in ('held','active'));
create index reservation_inventory_resources_reservation_idx on public.reservation_inventory_resources(reservation_id) where reservation_id is not null;
create index reservation_inventory_resources_hold_idx on public.reservation_inventory_resources(hold_id) where hold_id is not null;
create index reservation_inventory_resources_venue_time_idx on public.reservation_inventory_resources(venue_id, starts_at, ends_at) where resource_state in ('held','active');

-- Preserve existing assigned inventory in the new resource ledger before new commands use it.
insert into public.reservation_inventory_resources(organization_id,venue_id,table_id,reservation_id,starts_at,ends_at,resource_state,assignment_source,configuration_version)
select r.organization_id,r.outlet_id,a.table_id,r.id,r.starts_at,r.ends_at,'active','manual',r.configuration_version
from public.reservation_table_assignments a
join public.reservations r on r.id=a.reservation_id
where a.table_id is not null and r.status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated')
on conflict do nothing;
insert into public.reservation_inventory_resources(organization_id,venue_id,table_id,reservation_id,starts_at,ends_at,resource_state,assignment_source,configuration_version)
select r.organization_id,r.outlet_id,member.table_id,r.id,r.starts_at,r.ends_at,'active','manual',r.configuration_version
from public.reservation_table_assignments a
join public.table_combination_members member on member.combination_id=a.table_combination_id
join public.reservations r on r.id=a.reservation_id
where a.table_combination_id is not null and r.status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated')
on conflict do nothing;

create table public.reservation_change_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  actor_id uuid references public.staff_profiles(user_id),
  actor_type text not null check (actor_type in ('guest','staff','system')),
  change_type text not null check (change_type in ('created','updated','rescheduled','assigned','unassigned','cancelled','reinstated','note_added')),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade
);
create index reservation_change_log_reservation_idx on public.reservation_change_log(reservation_id, created_at desc, id);

create table public.reservation_outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  aggregate_type text not null check (aggregate_type in ('reservation','waitlist','walk_in','deposit')),
  aggregate_id uuid not null,
  event_type text not null check (event_type in ('reservation.created','reservation.changed','reservation.cancelled','reservation.no_show','waitlist.offer_created','deposit.status_changed')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade
);
create index reservation_outbox_pending_idx on public.reservation_outbox_events(created_at, id) where published_at is null;

create table public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  reservation_id uuid references public.reservations(id) on delete cascade,
  hold_id uuid references public.inventory_holds(id) on delete cascade,
  policy_type text not null check (policy_type in ('reservation_terms','privacy_notice','cancellation_policy','deposit_policy')),
  policy_version text not null,
  actor_type text not null check (actor_type in ('guest','staff','system')),
  actor_id uuid references public.staff_profiles(user_id),
  evidence jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check ((reservation_id is not null)::integer + (hold_id is not null)::integer = 1)
);
create index policy_acceptances_reservation_idx on public.policy_acceptances(reservation_id, accepted_at desc) where reservation_id is not null;

create table public.reservation_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  required_amount_centavos bigint check (required_amount_centavos is null or required_amount_centavos >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  due_at timestamptz,
  status text not null default 'not_required' check (status in ('not_required','pending','partially_paid','paid','waived','overdue','voided')),
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  unique (reservation_id)
);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  guest_id uuid references public.guests(id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  mobile_display text not null,
  email text,
  service_date date not null,
  preferred_start_local time,
  preferred_end_local time,
  party_size integer not null check (party_size > 0),
  source text not null default 'staff',
  priority integer not null default 0,
  quoted_wait_minutes integer check (quoted_wait_minutes is null or quoted_wait_minutes >= 0),
  status text not null default 'open' check (status in ('open','offered','converted','expired','removed')),
  expires_at timestamptz,
  notes text,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check (preferred_end_local is null or preferred_start_local is null or preferred_end_local >= preferred_start_local)
);
create index waitlist_open_rank_idx on public.waitlist_entries(venue_id, service_date, status, priority desc, created_at, id) where status in ('open','offered');

create table public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  waitlist_entry_id uuid not null references public.waitlist_entries(id) on delete cascade,
  hold_id uuid references public.inventory_holds(id) on delete set null,
  offered_starts_at timestamptz not null,
  offered_ends_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'offered' check (status in ('offered','accepted','expired','declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade,
  check (offered_ends_at > offered_starts_at)
);
create index waitlist_offers_expiry_idx on public.waitlist_offers(venue_id, expires_at) where status = 'offered';

create table public.walk_ins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  guest_id uuid references public.guests(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  mobile_display text,
  party_size integer not null check (party_size > 0),
  quoted_wait_minutes integer check (quoted_wait_minutes is null or quoted_wait_minutes >= 0),
  status text not null default 'waiting' check (status in ('waiting','seated','converted','left','cancelled')),
  notes text,
  arrived_at timestamptz not null default now(),
  seated_at timestamptz,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id, id) on delete cascade
);
create index walk_ins_queue_idx on public.walk_ins(venue_id, status, arrived_at, id) where status in ('waiting','seated');

insert into public.table_features(organization_id, code, name, description)
select o.id, f.code, f.name, f.description
from public.organizations o
cross join (values
  ('accessible','Accessible','Clearance for mobility devices'),
  ('window','Window','Window-side preference'),
  ('outdoor','Outdoor','Open-air seating'),
  ('quiet','Quiet','Lower-traffic location')
) as f(code,name,description)
on conflict (organization_id, code) do update set name=excluded.name, description=excluded.description, active=true;

with venue as (select id, organization_id from public.outlets where active), periods(code,name,start_time,end_time) as (values
  ('lunch','Lunch','10:00'::time,'16:00'::time),
  ('dinner','Dinner','16:00'::time,'22:00'::time)
)
insert into public.service_periods(organization_id,venue_id,code,name,default_duration_minutes,slot_interval_minutes,booking_window_days,cutoff_minutes)
select venue.organization_id,venue.id,periods.code,periods.name,120,30,90,30 from venue cross join periods
on conflict (venue_id,code) do update set name=excluded.name, default_duration_minutes=excluded.default_duration_minutes, slot_interval_minutes=excluded.slot_interval_minutes, active=true;

insert into public.service_schedules(service_period_id,day_of_week,local_start,local_end,effective_from)
select p.id,d.day,case p.code when 'lunch' then '10:00'::time else '16:00'::time end,case p.code when 'lunch' then '16:00'::time else '22:00'::time end,current_date
from public.service_periods p cross join (values (0::smallint),(1::smallint),(2::smallint),(3::smallint),(4::smallint),(5::smallint),(6::smallint)) d(day)
on conflict (service_period_id,day_of_week,effective_from) do update set local_start=excluded.local_start,local_end=excluded.local_end,active=true;

insert into public.reservation_configuration_versions(organization_id,venue_id,version,status,published_at,snapshot)
select o.organization_id,o.id,1,'published',now(),jsonb_build_object('phase','2','source','initial_inventory') from public.outlets o
on conflict (venue_id,version) do update set status='published',published_at=coalesce(reservation_configuration_versions.published_at,excluded.published_at);

insert into public.permissions(permission_key,description) values
  ('reservation_config.read','Read venue reservation configuration'),('reservation_config.manage','Manage venue reservation configuration'),
  ('inventory_blocks.manage','Create or release inventory blocks'),('availability.read_internal','Read internal availability details'),
  ('reservations.create','Create reservations'),('reservations.update','Edit and reschedule reservations'),('reservations.cancel','Cancel reservations'),
  ('reservations.override_rules','Override reservation rules with reason'),('reservations.assign_tables','Assign physical tables'),
  ('waitlist.read','Read waitlist'),('waitlist.manage','Manage waitlist offers'),('walkins.manage','Manage walk-ins'),
  ('deposits.record','Record reservation deposit state'),('deposits.refund_request','Request a deposit refund'),('guest_pii.read','Read guest contact details'),
  ('reservation_notes.sensitive','Read sensitive reservation notes')
on conflict (permission_key) do update set description=excluded.description;

with org as (select id from public.organizations where slug='waterfront-group'), role_map(code,permission_key) as (values
  ('organization_owner','reservation_config.read'),('organization_owner','reservation_config.manage'),('organization_owner','inventory_blocks.manage'),('organization_owner','availability.read_internal'),('organization_owner','reservations.create'),('organization_owner','reservations.update'),('organization_owner','reservations.cancel'),('organization_owner','reservations.override_rules'),('organization_owner','reservations.assign_tables'),('organization_owner','waitlist.read'),('organization_owner','waitlist.manage'),('organization_owner','walkins.manage'),('organization_owner','deposits.record'),('organization_owner','deposits.refund_request'),('organization_owner','guest_pii.read'),('organization_owner','reservation_notes.sensitive'),
  ('organization_admin','reservation_config.read'),('organization_admin','reservation_config.manage'),('organization_admin','inventory_blocks.manage'),('organization_admin','availability.read_internal'),('organization_admin','reservations.create'),('organization_admin','reservations.update'),('organization_admin','reservations.cancel'),('organization_admin','reservations.assign_tables'),('organization_admin','waitlist.read'),('organization_admin','waitlist.manage'),('organization_admin','walkins.manage'),('organization_admin','deposits.record'),('organization_admin','guest_pii.read'),
  ('venue_manager','reservation_config.read'),('venue_manager','reservation_config.manage'),('venue_manager','inventory_blocks.manage'),('venue_manager','availability.read_internal'),('venue_manager','reservations.create'),('venue_manager','reservations.update'),('venue_manager','reservations.cancel'),('venue_manager','reservations.override_rules'),('venue_manager','reservations.assign_tables'),('venue_manager','waitlist.read'),('venue_manager','waitlist.manage'),('venue_manager','walkins.manage'),('venue_manager','deposits.record'),('venue_manager','guest_pii.read'),
  ('host','reservation_config.read'),('host','reservations.create'),('host','reservations.update'),('host','reservations.cancel'),('host','reservations.assign_tables'),('host','waitlist.read'),('host','waitlist.manage'),('host','walkins.manage'),('host','guest_pii.read')
)
insert into public.role_permissions(role_id,permission_key)
select r.id,role_map.permission_key from org join public.roles r on r.organization_id=org.id join role_map on role_map.code=r.code
on conflict do nothing;

create or replace function public.release_expired_inventory_holds()
returns integer language plpgsql security definer set search_path=public,extensions as $$
declare released_count integer;
begin
  update public.inventory_holds set state='expired',released_at=now()
  where state='active' and expires_at <= now();
  get diagnostics released_count = row_count;
  update public.reservation_inventory_resources r set resource_state='released'
  from public.inventory_holds h where r.hold_id=h.id and h.state='expired' and r.resource_state='held';
  return released_count;
end $$;

create or replace function public.create_inventory_hold_atomic(payload jsonb)
returns public.inventory_holds language plpgsql security definer set search_path=public,extensions as $$
declare
  v_org uuid := nullif(payload->>'organization_id','')::uuid;
  v_venue uuid := nullif(payload->>'venue_id','')::uuid;
  v_period uuid := nullif(payload->>'service_period_id','')::uuid;
  v_start timestamptz := (payload->>'starts_at')::timestamptz;
  v_end timestamptz := (payload->>'ends_at')::timestamptz;
  v_party integer := (payload->>'party_size')::integer;
  v_hash text := payload->>'hold_token_hash';
  v_key text := nullif(payload->>'idempotency_key','');
  v_version integer := coalesce((payload->>'configuration_version')::integer,1);
  v_expires timestamptz := coalesce((payload->>'expires_at')::timestamptz,now()+interval '10 minutes');
  v_hold public.inventory_holds;
  v_table_ids uuid[];
  v_requested_table_ids uuid[];
  v_table_id uuid;
begin
  perform public.release_expired_inventory_holds();
  if v_org is null or v_venue is null or v_start is null or v_end is null or v_end <= v_start or v_party < 1 or length(coalesce(v_hash,'')) <> 64 then raise exception 'Invalid inventory hold request'; end if;
  if v_expires <= now() then raise exception 'Hold expiry must be in the future'; end if;
  if auth.uid() is not null and not private.has_atomic_permission('reservations.create',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if v_key is not null then select * into v_hold from public.inventory_holds where organization_id=v_org and idempotency_key=v_key limit 1; if v_hold.id is not null then return v_hold; end if; end if;

  select array_agg(value::uuid order by value::uuid) into v_requested_table_ids from jsonb_array_elements_text(coalesce(payload->'table_ids','[]'::jsonb));
  if coalesce(array_length(v_requested_table_ids,1),0) > 0 then
    v_table_ids := v_requested_table_ids;
  else
    select array_agg(candidate.id) into v_table_ids from (
    select t.id from public.dining_tables t join public.dining_areas a on a.id=t.dining_area_id
    where a.outlet_id=v_venue and a.resource_type='main_dining' and a.active and t.active and t.online_eligible
      and t.minimum_capacity <= v_party and t.maximum_capacity >= v_party
      and (t.active_from is null or t.active_from <= (v_start at time zone (select timezone from public.outlets where id=v_venue))::date)
      and (t.active_to is null or t.active_to >= (v_start at time zone (select timezone from public.outlets where id=v_venue))::date)
      and not exists(select 1 from public.inventory_blocks b where b.active and b.venue_id=v_venue and b.table_id=t.id and b.starts_at < v_end and v_start < b.ends_at)
      and not exists(select 1 from public.reservation_inventory_resources x where x.table_id=t.id and x.resource_state in ('held','active') and x.starts_at < v_end and v_start < x.ends_at)
    order by t.priority desc,t.maximum_capacity-t.minimum_capacity,t.id limit 1
    ) candidate;
  end if;
  if coalesce(array_length(v_table_ids,1),0)=0 then
    select array_agg(m.table_id order by m.table_id) into v_table_ids
    from public.table_combinations c join public.table_combination_members m on m.combination_id=c.id
    join public.dining_areas a on a.id=c.dining_area_id
    where a.outlet_id=v_venue and a.resource_type='main_dining' and a.active and c.active and c.online_eligible and c.minimum_capacity <= v_party and c.maximum_capacity >= v_party
      and not exists(select 1 from public.inventory_blocks b where b.active and b.venue_id=v_venue and (b.dining_area_id=c.dining_area_id or b.table_id in (select cm.table_id from public.table_combination_members cm where cm.combination_id=c.id)) and b.starts_at < v_end and v_start < b.ends_at)
      and not exists(select 1 from public.reservation_inventory_resources x where x.table_id in (select cm.table_id from public.table_combination_members cm where cm.combination_id=c.id) and x.resource_state in ('held','active') and x.starts_at < v_end and v_start < x.ends_at)
    group by c.id order by c.priority desc,c.maximum_capacity-c.minimum_capacity,c.id limit 1;
  end if;
  if coalesce(array_length(v_table_ids,1),0)=0 then raise exception using errcode='P0001',message='SLOT_NO_LONGER_AVAILABLE'; end if;
  if exists(select 1 from unnest(v_table_ids) requested(id) where not exists(select 1 from public.dining_tables t join public.dining_areas a on a.id=t.dining_area_id where t.id=requested.id and a.outlet_id=v_venue and a.active and t.active and t.online_eligible)) then raise exception using errcode='P0001',message='SLOT_NO_LONGER_AVAILABLE'; end if;
  if exists(select 1 from public.reservation_inventory_resources x where x.table_id=any(v_table_ids) and x.resource_state in ('held','active') and x.starts_at < v_end and v_start < x.ends_at) then raise exception using errcode='P0001',message='SLOT_NO_LONGER_AVAILABLE'; end if;

  insert into public.inventory_holds(organization_id,venue_id,hold_token_hash,idempotency_key,service_period_id,starts_at,ends_at,party_size,expires_at,configuration_version,metadata,created_by)
  values(v_org,v_venue,v_hash,v_key,v_period,v_start,v_end,v_party,v_expires,v_version,coalesce(payload->'metadata','{}'::jsonb),auth.uid()) returning * into v_hold;
  foreach v_table_id in array v_table_ids loop
    insert into public.reservation_inventory_resources(organization_id,venue_id,table_id,hold_id,starts_at,ends_at,resource_state,assignment_source,configuration_version)
    values(v_org,v_venue,v_table_id,v_hold.id,v_start,v_end,'held','hold',v_version);
  end loop;
  return v_hold;
exception when exclusion_violation then raise exception using errcode='P0001',message='SLOT_NO_LONGER_AVAILABLE';
end $$;

create or replace function public.finalize_reservation_atomic(payload jsonb)
returns public.reservations language plpgsql security definer set search_path=public,extensions as $$
declare
  v_org uuid := nullif(payload->>'organization_id','')::uuid;
  v_venue uuid := nullif(payload->>'venue_id','')::uuid;
  v_period uuid := nullif(payload->>'service_period_id','')::uuid;
  v_res_id uuid := nullif(payload->>'reservation_id','')::uuid;
  v_hold uuid := nullif(payload->>'hold_id','')::uuid;
  v_guest uuid := nullif(payload->>'guest_id','')::uuid;
  v_area uuid := nullif(payload->>'dining_area_id','')::uuid;
  v_start timestamptz := (payload->>'starts_at')::timestamptz;
  v_end timestamptz := (payload->>'ends_at')::timestamptz;
  v_party integer := (payload->>'party_size')::integer;
  v_type public.booking_type := coalesce(nullif(payload->>'booking_type','')::public.booking_type,'regular_table');
  v_status public.reservation_status := coalesce(nullif(payload->>'status','')::public.reservation_status,'confirmed');
  v_channel text := coalesce(payload->>'channel','staff');
  v_key text := nullif(payload->>'idempotency_key','');
  v_actor text := coalesce(payload->>'actor_type','staff');
  v_manage_hash text := nullif(payload->>'public_manage_token_hash','');
  v_res public.reservations;
  v_mobile text := payload->>'mobile_display';
  v_email text := nullif(payload->>'email','');
  v_name text := trim(coalesce(payload->>'full_name',''));
  v_table_id uuid;
  v_table_ids uuid[];
begin
  perform public.release_expired_inventory_holds();
  if v_org is null or v_venue is null or v_start is null or v_end is null or v_end <= v_start or v_party < 1 then raise exception 'Invalid reservation request'; end if;
  if auth.uid() is not null and not private.has_atomic_permission('reservations.create',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if auth.uid() is null and v_actor <> 'guest' then raise exception 'Not authorized'; end if;
  if v_key is not null then select * into v_res from public.reservations where organization_id=v_org and idempotency_key=v_key limit 1; if v_res.id is not null then return v_res; end if; end if;
  if v_hold is not null then
    perform 1 from public.inventory_holds h where h.id=v_hold and h.organization_id=v_org and h.venue_id=v_venue and h.state='active' and h.expires_at > now() and h.starts_at=v_start and h.ends_at=v_end and h.party_size=v_party for update;
    if not found then raise exception using errcode='P0001',message='HOLD_EXPIRED'; end if;
    select array_agg(r.table_id order by r.table_id) into v_table_ids from public.reservation_inventory_resources r where r.hold_id=v_hold and r.resource_state='held';
  else
    select array_agg(value::uuid order by value::uuid) into v_table_ids from jsonb_array_elements_text(coalesce(payload->'table_ids','[]'::jsonb));
  end if;
  if coalesce(array_length(v_table_ids,1),0)=0 then raise exception using errcode='P0001',message='SLOT_NO_LONGER_AVAILABLE'; end if;
  if v_mobile is null or public.normalize_ph_mobile(v_mobile) is null then raise exception 'A valid mobile number is required'; end if;
  if v_name = '' then raise exception 'Guest name is required'; end if;
  if v_guest is null then
    select g.id into v_guest from public.guests g where g.organization_id=v_org and (g.mobile_normalized=public.normalize_ph_mobile(v_mobile) or (v_email is not null and g.email_normalized=lower(trim(v_email)))) order by g.updated_at desc limit 1;
    if v_guest is null then
      insert into public.guests(organization_id,full_name,mobile_display,email) values(v_org,v_name,v_mobile,v_email) returning id into v_guest;
    else
      update public.guests set full_name=case when length(v_name)>0 then v_name else full_name end,mobile_display=v_mobile,email=coalesce(v_email,email),updated_at=now() where id=v_guest;
    end if;
  end if;

  if v_area is null then select dining_area_id into v_area from public.dining_tables where id=v_table_ids[1]; end if;
  if exists(select 1 from public.inventory_blocks b where b.active and b.venue_id=v_venue and b.starts_at < v_end and v_start < b.ends_at and (b.table_id=any(v_table_ids) or b.dining_area_id in (select distinct dining_area_id from public.dining_tables where id=any(v_table_ids)))) then raise exception using errcode='P0001',message='SLOT_NO_LONGER_AVAILABLE'; end if;
  insert into public.reservations(code,outlet_id,organization_id,guest_id,booking_type,dining_area_id,local_date,starts_at,ends_at,guest_count,status,source,channel,service_period_id,configuration_version,policy_snapshot,idempotency_key,public_manage_token_hash,occasion,special_requests,created_by,updated_by)
  values(coalesce(payload->>'confirmation_code','WF-'||to_char((v_start at time zone (select timezone from public.outlets where id=v_venue))::date,'YYMMDD')||'-'||upper(substr(gen_random_uuid()::text,1,6))),v_venue,v_org,v_guest,v_type,v_area,(v_start at time zone (select timezone from public.outlets where id=v_venue))::date,v_start,v_end,v_party,v_status,coalesce(payload->>'source','Website'),v_channel,v_period,coalesce((payload->>'configuration_version')::integer,1),coalesce(payload->'policy_snapshot','{}'::jsonb),v_key,v_manage_hash,payload->>'occasion',payload->>'special_requests',auth.uid(),auth.uid()) returning * into v_res;
  if v_hold is not null then
    update public.reservation_inventory_resources set reservation_id=v_res.id,hold_id=null,resource_state='active',assignment_source=case when v_actor='guest' then 'hold' else 'auto' end where hold_id=v_hold and resource_state='held';
    update public.inventory_holds set state='finalized' where id=v_hold;
  else
    foreach v_table_id in array v_table_ids loop
      insert into public.reservation_inventory_resources(organization_id,venue_id,table_id,reservation_id,starts_at,ends_at,resource_state,assignment_source,configuration_version)
      values(v_org,v_venue,v_table_id,v_res.id,v_start,v_end,'active',case when v_actor='guest' then 'auto' else 'manual' end,coalesce((payload->>'configuration_version')::integer,1));
    end loop;
  end if;
  foreach v_table_id in array v_table_ids loop
    insert into public.reservation_table_assignments(reservation_id,table_id,assigned_by) values(v_res.id,v_table_id,auth.uid());
  end loop;
  insert into public.reservation_status_history(reservation_id,to_status,actor_id,actor_type,reason) values(v_res.id,v_status,auth.uid(),v_actor,'Reservation created');
  insert into public.reservation_change_log(organization_id,venue_id,reservation_id,actor_id,actor_type,change_type,after_state) values(v_org,v_venue,v_res.id,auth.uid(),v_actor,'created',to_jsonb(v_res));
  insert into public.reservation_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(v_org,v_venue,'reservation',v_res.id,'reservation.created',jsonb_build_object('reservation_id',v_res.id,'channel',v_channel),coalesce(v_key,v_res.id::text||':reservation.created')) on conflict(idempotency_key) do nothing;
  if coalesce((payload->>'terms_accepted')::boolean,false) then
    insert into public.policy_acceptances(organization_id,venue_id,reservation_id,policy_type,policy_version,actor_type,evidence) values(v_org,v_venue,v_res.id,'reservation_terms',coalesce(payload->>'terms_version','phase2-preview'),v_actor,coalesce(payload->'policy_evidence','{}'::jsonb));
  end if;
  return v_res;
exception when exclusion_violation then raise exception using errcode='P0001',message='SLOT_NO_LONGER_AVAILABLE';
end $$;

create or replace function public.transition_reservation_status_v2(target_reservation uuid,next_status public.reservation_status,reason text default null)
returns public.reservations language plpgsql security definer set search_path=public,extensions as $$
declare r public.reservations; old_status public.reservation_status; actor text := case when auth.uid() is null then 'system' else 'staff' end;
begin
  select * into r from public.reservations where id=target_reservation for update;
  if r.id is null or (auth.uid() is not null and not private.has_atomic_permission('reservations.update',r.organization_id,r.outlet_id)) then raise exception 'Not authorized'; end if;
  if not public.can_transition_reservation(r.status,next_status) then raise exception 'Invalid reservation status transition'; end if;
  if next_status in ('cancelled','no_show','expired') and length(trim(coalesce(reason,''))) < 3 then raise exception 'A reason is required'; end if;
  old_status := r.status;
  update public.reservations set status=next_status,updated_by=auth.uid(),updated_at=now(),arrived_at=case when next_status='arrived' then now() else arrived_at end,seated_at=case when next_status='seated' then now() else seated_at end,completed_at=case when next_status='completed' then now() else completed_at end,cancelled_at=case when next_status='cancelled' then now() else cancelled_at end,cancellation_reason=case when next_status='cancelled' then reason else cancellation_reason end,no_show_at=case when next_status='no_show' then now() else no_show_at end where id=r.id returning * into r;
  if next_status in ('completed','cancelled','no_show','expired') then update public.reservation_inventory_resources set resource_state='released' where reservation_id=r.id and resource_state='active'; end if;
  insert into public.reservation_status_history(reservation_id,from_status,to_status,actor_id,actor_type,reason) values(r.id,old_status,next_status,auth.uid(),actor,reason);
  insert into public.reservation_change_log(organization_id,venue_id,reservation_id,actor_id,actor_type,change_type,before_state,after_state,reason) values(r.organization_id,r.outlet_id,r.id,auth.uid(),actor,case when next_status='cancelled' then 'cancelled' else 'updated' end,jsonb_build_object('status',old_status),jsonb_build_object('status',next_status),reason);
  insert into public.reservation_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(r.organization_id,r.outlet_id,'reservation',r.id,case when next_status='cancelled' then 'reservation.cancelled' when next_status='no_show' then 'reservation.no_show' else 'reservation.changed' end,jsonb_build_object('reservation_id',r.id,'status',next_status,'reason',reason),r.id::text||':status:'||next_status||':'||extract(epoch from now())::bigint) on conflict(idempotency_key) do nothing;
  return r;
end $$;

create or replace function public.can_transition_reservation(from_status public.reservation_status,to_status public.reservation_status)
returns boolean language sql immutable as $$
  select case from_status
    when 'draft' then to_status in ('temporary_hold','pending_confirmation','pending_deposit','cancelled')
    when 'temporary_hold' then to_status in ('pending_confirmation','pending_deposit','confirmed','expired','cancelled')
    when 'pending_confirmation' then to_status in ('pending_deposit','confirmed','expired','cancelled')
    when 'pending_deposit' then to_status in ('confirmed','expired','cancelled')
    when 'confirmed' then to_status in ('arrived','cancelled','no_show')
    when 'arrived' then to_status in ('seated','cancelled','no_show')
    when 'seated' then to_status in ('completed')
    else false end
$$;

alter table public.table_features enable row level security;
alter table public.dining_table_features enable row level security;
alter table public.service_periods enable row level security;
alter table public.service_schedules enable row level security;
alter table public.service_exceptions enable row level security;
alter table public.reservation_configuration_versions enable row level security;
alter table public.reservation_rules enable row level security;
alter table public.inventory_blocks enable row level security;
alter table public.inventory_holds enable row level security;
alter table public.reservation_inventory_resources enable row level security;
alter table public.reservation_change_log enable row level security;
alter table public.reservation_outbox_events enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.reservation_deposits enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.waitlist_offers enable row level security;
alter table public.walk_ins enable row level security;

create policy phase2_table_features_read on public.table_features for select to authenticated using (private.has_organization_access(organization_id));
create policy phase2_table_features_manage on public.table_features for all to authenticated using (private.has_atomic_permission('reservation_config.manage',organization_id,null)) with check (private.has_atomic_permission('reservation_config.manage',organization_id,null));
create policy phase2_table_feature_links_read on public.dining_table_features for select to authenticated using (exists(select 1 from public.dining_tables dt join public.dining_areas da on da.id=dt.dining_area_id join public.outlets o on o.id=da.outlet_id where dt.id=table_id and private.has_atomic_permission('reservation_config.read',o.organization_id,o.id)));
create policy phase2_service_periods_read on public.service_periods for select to authenticated using (private.has_atomic_permission('reservation_config.read',organization_id,venue_id));
create policy phase2_service_periods_manage on public.service_periods for all to authenticated using (private.has_atomic_permission('reservation_config.manage',organization_id,venue_id)) with check (private.has_atomic_permission('reservation_config.manage',organization_id,venue_id));
create policy phase2_service_schedules_read on public.service_schedules for select to authenticated using (exists(select 1 from public.service_periods p where p.id=service_period_id and private.has_atomic_permission('reservation_config.read',p.organization_id,p.venue_id)));
create policy phase2_service_exceptions_read on public.service_exceptions for select to authenticated using (private.has_atomic_permission('reservation_config.read',organization_id,venue_id));
create policy phase2_config_versions_read on public.reservation_configuration_versions for select to authenticated using (private.has_atomic_permission('reservation_config.read',organization_id,venue_id));
create policy phase2_rules_read on public.reservation_rules for select to authenticated using (private.has_atomic_permission('reservation_config.read',organization_id,venue_id));
create policy phase2_blocks_read on public.inventory_blocks for select to authenticated using (private.has_atomic_permission('availability.read_internal',organization_id,venue_id));
create policy phase2_blocks_manage on public.inventory_blocks for all to authenticated using (private.has_atomic_permission('inventory_blocks.manage',organization_id,venue_id)) with check (private.has_atomic_permission('inventory_blocks.manage',organization_id,venue_id));
create policy phase2_holds_staff_read on public.inventory_holds for select to authenticated using (private.has_atomic_permission('availability.read_internal',organization_id,venue_id));
create policy phase2_resources_staff_read on public.reservation_inventory_resources for select to authenticated using (private.has_atomic_permission('availability.read_internal',organization_id,venue_id));
create policy phase2_changes_read on public.reservation_change_log for select to authenticated using (private.has_atomic_permission('reservations.read',organization_id,venue_id));
create policy phase2_outbox_read on public.reservation_outbox_events for select to authenticated using (private.has_atomic_permission('audit.read',organization_id,venue_id));
create policy phase2_policy_read on public.policy_acceptances for select to authenticated using (private.has_atomic_permission('reservations.read',organization_id,venue_id));
create policy phase2_deposit_read on public.reservation_deposits for select to authenticated using (private.has_atomic_permission('deposits.read',organization_id,venue_id));
create policy phase2_waitlist_read on public.waitlist_entries for select to authenticated using (private.has_atomic_permission('waitlist.read',organization_id,venue_id));
create policy phase2_waitlist_manage on public.waitlist_entries for all to authenticated using (private.has_atomic_permission('waitlist.manage',organization_id,venue_id)) with check (private.has_atomic_permission('waitlist.manage',organization_id,venue_id));
create policy phase2_offers_read on public.waitlist_offers for select to authenticated using (private.has_atomic_permission('waitlist.read',organization_id,venue_id));
create policy phase2_walkins_read on public.walk_ins for select to authenticated using (private.has_atomic_permission('walkins.manage',organization_id,venue_id));
create policy phase2_walkins_manage on public.walk_ins for all to authenticated using (private.has_atomic_permission('walkins.manage',organization_id,venue_id)) with check (private.has_atomic_permission('walkins.manage',organization_id,venue_id));

revoke all on public.table_features,public.dining_table_features,public.service_periods,public.service_schedules,public.service_exceptions,public.reservation_configuration_versions,public.reservation_rules,public.inventory_blocks,public.inventory_holds,public.reservation_inventory_resources,public.reservation_change_log,public.reservation_outbox_events,public.policy_acceptances,public.reservation_deposits,public.waitlist_entries,public.waitlist_offers,public.walk_ins from anon;
grant select on public.table_features,public.dining_table_features,public.service_periods,public.service_schedules,public.service_exceptions,public.reservation_configuration_versions,public.reservation_rules,public.inventory_blocks,public.inventory_holds,public.reservation_inventory_resources,public.reservation_change_log,public.reservation_outbox_events,public.policy_acceptances,public.reservation_deposits,public.waitlist_entries,public.waitlist_offers,public.walk_ins to authenticated;
grant all on public.table_features,public.dining_table_features,public.service_periods,public.service_schedules,public.service_exceptions,public.reservation_configuration_versions,public.reservation_rules,public.inventory_blocks,public.inventory_holds,public.reservation_inventory_resources,public.reservation_change_log,public.reservation_outbox_events,public.policy_acceptances,public.reservation_deposits,public.waitlist_entries,public.waitlist_offers,public.walk_ins to service_role;
revoke all on function public.create_inventory_hold_atomic(jsonb),public.finalize_reservation_atomic(jsonb),public.transition_reservation_status_v2(uuid,public.reservation_status,text) from public,anon;
grant execute on function public.create_inventory_hold_atomic(jsonb),public.finalize_reservation_atomic(jsonb),public.transition_reservation_status_v2(uuid,public.reservation_status,text) to authenticated,service_role;
grant execute on function public.release_expired_inventory_holds() to service_role;
