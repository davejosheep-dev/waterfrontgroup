-- Waterfront Reservations Phase 4: event sales, space inventory, proposals, and execution.
-- All occupancy claims are made against physical event_space rows.  The database is
-- authoritative for stage transitions, money totals, expiry, and overlap protection.

create extension if not exists btree_gist;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index companies_org_name_idx on public.companies(organization_id, lower(name));

create table public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null,
  guest_id uuid not null,
  title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (organization_id, company_id) references public.companies(organization_id,id) on delete cascade,
  foreign key (organization_id, guest_id) references public.guests(organization_id,id) on delete cascade,
  unique (company_id, guest_id)
);

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid,
  code text not null check (code = lower(code) and code ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 2 and 100),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  unique (organization_id, venue_id, code)
);

create table public.event_spaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9_-]+$'),
  name text not null check (length(trim(name)) between 2 and 120),
  location text,
  description text,
  min_capacity integer not null default 1 check (min_capacity > 0),
  max_capacity integer not null check (max_capacity >= min_capacity),
  features jsonb not null default '[]'::jsonb,
  allowed_event_type_ids uuid[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  unique (venue_id, code),
  unique (organization_id, venue_id, id),
  unique (organization_id, id)
);
create index event_spaces_scope_idx on public.event_spaces(organization_id,venue_id,active,sort_order,code,id);

create table public.event_space_combinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9_-]+$'),
  name text not null check (length(trim(name)) between 2 and 120),
  min_capacity integer not null default 1 check (min_capacity > 0),
  max_capacity integer not null check (max_capacity >= min_capacity),
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  unique (venue_id, code),
  unique (organization_id, venue_id, id),
  unique (organization_id, id)
);
create table public.event_space_combination_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  combination_id uuid not null,
  space_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (combination_id, space_id),
  foreign key (organization_id, combination_id) references public.event_space_combinations(organization_id,id) on delete cascade,
  foreign key (organization_id, space_id) references public.event_spaces(organization_id,id) on delete cascade
);
create index event_space_combination_members_space_idx on public.event_space_combination_members(space_id,combination_id);

create table public.event_space_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  space_id uuid,
  effective_from date not null default current_date,
  effective_to date,
  minimum_duration_minutes integer not null default 120 check (minimum_duration_minutes between 15 and 1440),
  setup_buffer_minutes integer not null default 60 check (setup_buffer_minutes between 0 and 1440),
  teardown_buffer_minutes integer not null default 30 check (teardown_buffer_minutes between 0 and 1440),
  rental_fee numeric(14,2) not null default 0 check (rental_fee >= 0),
  minimum_spend numeric(14,2) not null default 0 check (minimum_spend >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  deposit_percent numeric(5,2) not null default 30 check (deposit_percent between 0 and 100),
  cancellation_policy jsonb not null default '{}'::jsonb,
  commercial_snapshot jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  foreign key (organization_id, space_id) references public.event_spaces(organization_id,id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  unique (venue_id, space_id, effective_from)
);
create index event_space_rules_lookup_idx on public.event_space_rules(organization_id,venue_id,space_id,active,effective_from,effective_to);

create table public.event_inventory_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  space_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_type text not null check (block_type in ('maintenance','buyout','private_use','closed','other')),
  reason text not null check (length(trim(reason)) >= 3),
  active boolean not null default true,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  foreign key (organization_id, space_id) references public.event_spaces(organization_id,id) on delete cascade,
  check (ends_at > starts_at)
);
create index event_inventory_blocks_calendar_idx on public.event_inventory_blocks(organization_id,venue_id,space_id,starts_at,ends_at) where active;

create table public.event_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  guest_id uuid,
  company_id uuid,
  event_type_id uuid,
  contact_name text not null check (length(trim(contact_name)) between 2 and 160),
  contact_email text check (contact_email is null or position('@' in contact_email) > 1),
  contact_phone text,
  event_name text,
  source text not null default 'staff_entry' check (length(trim(source)) between 2 and 80),
  requested_starts_at timestamptz not null,
  requested_ends_at timestamptz not null,
  alternate_dates jsonb not null default '[]'::jsonb,
  expected_guests integer not null check (expected_guests > 0),
  preferred_space_ids uuid[] not null default '{}',
  budget numeric(14,2) check (budget is null or budget >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  requirements jsonb not null default '{}'::jsonb,
  stage text not null default 'new_inquiry' check (stage in ('new_inquiry','qualified','availability_checked','pencil_booking','proposal_sent','negotiation','deposit_pending','confirmed','planning','event_day','completed','final_billing','closed','lost','cancelled')),
  owner_user_id uuid references public.staff_profiles(user_id),
  next_action_at timestamptz,
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  probability smallint not null default 20 check (probability between 0 and 100),
  lost_reason text,
  converted_event_id uuid,
  idempotency_key text,
  created_by uuid references public.staff_profiles(user_id),
  updated_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  foreign key (organization_id, guest_id) references public.guests(organization_id,id) on delete set null,
  foreign key (organization_id, company_id) references public.companies(organization_id,id) on delete set null,
  foreign key (event_type_id) references public.event_types(id) on delete set null,
  check (requested_ends_at > requested_starts_at),
  unique (organization_id, idempotency_key)
);
create index event_inquiries_pipeline_idx on public.event_inquiries(organization_id,venue_id,stage,next_action_at,created_at desc,id);
create index event_inquiries_owner_idx on public.event_inquiries(organization_id,owner_user_id,next_action_at,id);
create index event_inquiries_open_idx on public.event_inquiries(organization_id,venue_id,next_action_at,id) where stage not in ('closed','lost','cancelled');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  inquiry_id uuid not null unique references public.event_inquiries(id) on delete restrict,
  guest_id uuid,
  company_id uuid,
  event_type_id uuid,
  name text not null check (length(trim(name)) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  setup_starts_at timestamptz not null,
  teardown_ends_at timestamptz not null,
  expected_headcount integer not null check (expected_headcount > 0),
  final_headcount integer check (final_headcount is null or final_headcount > 0),
  status text not null default 'planning' check (status in ('new_inquiry','qualified','availability_checked','pencil_booking','proposal_sent','negotiation','deposit_pending','confirmed','planning','event_day','completed','final_billing','closed','lost','cancelled')),
  owner_user_id uuid references public.staff_profiles(user_id),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  quoted_total numeric(14,2) not null default 0 check (quoted_total >= 0),
  balance_due numeric(14,2) not null default 0 check (balance_due >= 0),
  created_by uuid references public.staff_profiles(user_id),
  updated_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  foreign key (organization_id, guest_id) references public.guests(organization_id,id) on delete set null,
  foreign key (organization_id, company_id) references public.companies(organization_id,id) on delete set null,
  foreign key (event_type_id) references public.event_types(id) on delete set null,
  check (ends_at > starts_at),
  check (setup_starts_at <= starts_at and teardown_ends_at >= ends_at and teardown_ends_at > setup_starts_at)
);
create index events_calendar_idx on public.events(organization_id,venue_id,status,setup_starts_at,teardown_ends_at,id);
create index events_owner_idx on public.events(organization_id,owner_user_id,status,starts_at,id);

create table public.event_space_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  inquiry_id uuid references public.event_inquiries(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'active' check (state in ('active','expired','released','converted')),
  priority smallint not null default 1 check (priority between 1 and 9),
  idempotency_key text,
  created_by uuid references public.staff_profiles(user_id),
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  check (ends_at > starts_at),
  check (event_id is not null or inquiry_id is not null),
  unique (organization_id,idempotency_key)
);
create index event_space_holds_expiry_idx on public.event_space_holds(state,expires_at) where state='active';
create index event_space_holds_calendar_idx on public.event_space_holds(organization_id,venue_id,starts_at,ends_at) where state='active';

create table public.event_space_hold_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  hold_id uuid not null references public.event_space_holds(id) on delete cascade,
  space_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupancy tstzrange generated always as (tstzrange(starts_at,ends_at,'[)')) stored,
  state text not null default 'active' check (state in ('active','released','converted')),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  foreign key (organization_id, space_id) references public.event_spaces(organization_id,id) on delete cascade,
  check (ends_at > starts_at),
  unique (hold_id,space_id),
  exclude using gist (space_id with =, occupancy with &&) where (state='active')
);
create index event_space_hold_resources_lookup_idx on public.event_space_hold_resources(organization_id,venue_id,space_id,starts_at,ends_at) where state='active';

create table public.event_space_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  space_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupancy tstzrange generated always as (tstzrange(starts_at,ends_at,'[)')) stored,
  state text not null default 'active' check (state in ('active','released')),
  assigned_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  foreign key (organization_id, space_id) references public.event_spaces(organization_id,id) on delete cascade,
  check (ends_at > starts_at),
  unique (event_id,space_id),
  exclude using gist (space_id with =, occupancy with &&) where (state='active')
);
create index event_space_assignments_calendar_idx on public.event_space_assignments(organization_id,venue_id,space_id,starts_at,ends_at) where state='active';

create table public.event_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  inquiry_id uuid references public.event_inquiries(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade,
  check ((inquiry_id is not null)::integer + (event_id is not null)::integer = 1)
);
create index event_status_history_lookup_idx on public.event_status_history(organization_id,venue_id,created_at desc,id);

create table public.event_outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index event_outbox_pending_idx on public.event_outbox_events(created_at,id) where published_at is null;

create table public.event_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','issued','accepted','declined','superseded')),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  calculation_version text not null default 'phase4-v1',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  service_charge_total numeric(14,2) not null default 0 check (service_charge_total >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  deposit_due numeric(14,2) not null default 0 check (deposit_due >= 0),
  terms_snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.staff_profiles(user_id),
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  unique (event_id,version),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index event_proposals_event_idx on public.event_proposals(event_id,version desc);

create table public.event_proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.event_proposals(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 240),
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default 'item',
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(6,3) not null default 0 check (tax_rate between 0 and 100),
  service_charge_rate numeric(6,3) not null default 0 check (service_charge_rate between 0 and 100),
  line_total numeric(14,2) not null check (line_total >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index event_proposal_line_items_proposal_idx on public.event_proposal_line_items(proposal_id,id);

create table public.event_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  proposal_id uuid references public.event_proposals(id) on delete restrict,
  schedule_type text not null check (schedule_type in ('deposit','milestone','balance','refund_hold')),
  due_at timestamptz not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','partially_paid','paid','waived','voided','overdue')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index event_payment_schedules_due_idx on public.event_payment_schedules(organization_id,venue_id,status,due_at,event_id);

create table public.event_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  schedule_id uuid references public.event_payment_schedules(id) on delete set null,
  provider text not null check (length(trim(provider)) between 2 and 80),
  provider_reference text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'recorded' check (status in ('recorded','voided','refunded')),
  idempotency_key text not null,
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid references public.staff_profiles(user_id),
  unique (organization_id,idempotency_key),
  unique (provider,provider_reference),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index event_payments_event_idx on public.event_payments(event_id,received_at desc,id);

create table public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  task_type text not null check (task_type in ('follow_up','hold_expiry','deposit_due','menu_selection','headcount_due','approval','site_visit','final_billing','other')),
  title text not null check (length(trim(title)) between 2 and 200),
  owner_user_id uuid references public.staff_profiles(user_id),
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  completed_at timestamptz,
  completed_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index event_tasks_due_idx on public.event_tasks(organization_id,venue_id,status,due_at,event_id);

create table public.event_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  requirement_type text not null,
  value jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','in_progress','complete','waived')),
  owner_user_id uuid references public.staff_profiles(user_id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);

create table public.event_attendance_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('expected','final','actual')),
  headcount integer not null check (headcount > 0),
  captured_by uuid references public.staff_profiles(user_id),
  captured_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);

create table public.event_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  sensitive boolean not null default false,
  author_id uuid references public.staff_profiles(user_id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);

create table public.event_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  proposal_id uuid references public.event_proposals(id) on delete set null,
  file_name text not null,
  storage_path text not null,
  document_type text not null,
  checksum text,
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','blocked')),
  visibility text not null default 'staff' check (visibility in ('staff','finance','client')),
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, venue_id) references public.outlets(organization_id,id) on delete cascade
);

create or replace function public.can_transition_event_stage(from_stage text,to_stage text)
returns boolean language sql immutable as $$
  select case when from_stage=to_stage then true else case from_stage
    when 'new_inquiry' then to_stage in ('qualified','lost','cancelled')
    when 'qualified' then to_stage in ('availability_checked','pencil_booking','planning','lost','cancelled')
    when 'availability_checked' then to_stage in ('pencil_booking','proposal_sent','lost','cancelled')
    when 'pencil_booking' then to_stage in ('proposal_sent','negotiation','deposit_pending','planning','lost','cancelled')
    when 'proposal_sent' then to_stage in ('negotiation','deposit_pending','lost','cancelled')
    when 'negotiation' then to_stage in ('proposal_sent','deposit_pending','lost','cancelled')
    when 'deposit_pending' then to_stage in ('confirmed','lost','cancelled')
    when 'confirmed' then to_stage in ('planning','cancelled')
    when 'planning' then to_stage in ('event_day','cancelled')
    when 'event_day' then to_stage in ('completed','cancelled')
    when 'completed' then to_stage in ('final_billing')
    when 'final_billing' then to_stage in ('closed')
    else false end end;
$$;

create or replace function public.release_expired_event_holds()
returns integer language plpgsql security definer set search_path=public,extensions as $$
declare released_count integer;
begin
  update public.event_space_holds
  set state='expired', released_at=now(), release_reason='Hold expired'
  where state='active' and expires_at <= now();
  get diagnostics released_count = row_count;
  update public.event_space_hold_resources r
  set state='released'
  from public.event_space_holds h
  where r.hold_id=h.id and h.state='expired' and r.state='active';
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  select h.organization_id,h.venue_id,'event_hold',h.id,'event.hold_expired',jsonb_build_object('hold_id',h.id,'inquiry_id',h.inquiry_id,'event_id',h.event_id),h.id::text||':expired'
  from public.event_space_holds h
  where h.state='expired' and h.released_at >= now()-interval '5 seconds'
  on conflict(idempotency_key) do nothing;
  return released_count;
end $$;

create or replace function public.create_event_inquiry_atomic(payload jsonb)
returns public.event_inquiries language plpgsql security definer set search_path=public,extensions as $$
declare
  v_org uuid := nullif(payload->>'organization_id','')::uuid;
  v_venue uuid := nullif(payload->>'venue_id','')::uuid;
  v_guest uuid := nullif(payload->>'guest_id','')::uuid;
  v_company uuid := nullif(payload->>'company_id','')::uuid;
  v_type uuid := nullif(payload->>'event_type_id','')::uuid;
  v_actor uuid := auth.uid();
  v_key text := nullif(trim(payload->>'idempotency_key'),'');
  v_row public.event_inquiries;
  v_start timestamptz := (payload->>'requested_starts_at')::timestamptz;
  v_end timestamptz := (payload->>'requested_ends_at')::timestamptz;
  v_name text := trim(coalesce(payload->>'contact_name',''));
begin
  if v_org is null or v_venue is null or v_start is null or v_end is null or v_end <= v_start or v_name='' or (payload->>'expected_guests')::integer < 1 then raise exception using errcode='22023',message='INVALID_EVENT_INQUIRY'; end if;
  if auth.uid() is not null and not private.has_atomic_permission('event_inquiries.create',v_org,v_venue) then raise exception using errcode='42501',message='Not authorized'; end if;
  if v_key is not null then select * into v_row from public.event_inquiries where organization_id=v_org and idempotency_key=v_key limit 1; if v_row.id is not null then return v_row; end if; end if;
  if not exists(select 1 from public.outlets o where o.id=v_venue and o.organization_id=v_org and o.active) then raise exception using errcode='P0002',message='VENUE_NOT_FOUND'; end if;
  insert into public.event_inquiries(organization_id,venue_id,guest_id,company_id,event_type_id,contact_name,contact_email,contact_phone,event_name,source,requested_starts_at,requested_ends_at,alternate_dates,expected_guests,preferred_space_ids,budget,currency,requirements,stage,owner_user_id,next_action_at,estimated_value,probability,idempotency_key,created_by,updated_by)
  values(v_org,v_venue,v_guest,v_company,v_type,v_name,nullif(lower(trim(payload->>'contact_email')),''),nullif(trim(payload->>'contact_phone'),''),nullif(trim(payload->>'event_name'),''),coalesce(nullif(trim(payload->>'source'),''),'staff_entry'),v_start,v_end,coalesce(payload->'alternate_dates','[]'::jsonb),(payload->>'expected_guests')::integer,coalesce(array(select jsonb_array_elements_text(coalesce(payload->'preferred_space_ids','[]'::jsonb))::uuid),'{}'),nullif(payload->>'budget','')::numeric,coalesce(nullif(payload->>'currency',''),'PHP'),coalesce(payload->'requirements','{}'::jsonb),'new_inquiry',nullif(payload->>'owner_user_id','')::uuid,nullif(payload->>'next_action_at','')::timestamptz,coalesce(nullif(payload->>'estimated_value','')::numeric,0),coalesce(nullif(payload->>'probability','')::smallint,20),v_key,v_actor,v_actor)
  returning * into v_row;
  insert into public.event_status_history(organization_id,venue_id,inquiry_id,to_stage,reason,actor_id) values(v_org,v_venue,v_row.id,'new_inquiry','Inquiry captured',v_actor);
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(v_org,v_venue,'event_inquiry',v_row.id,'event.inquiry_created',jsonb_build_object('inquiry_id',v_row.id,'source',v_row.source),coalesce(v_key,v_row.id::text||':created')) on conflict(idempotency_key) do nothing;
  return v_row;
exception when unique_violation then
  select * into v_row from public.event_inquiries where organization_id=v_org and idempotency_key=v_key limit 1;
  if v_row.id is not null then return v_row; end if;
  raise;
end $$;

create or replace function public.transition_event_inquiry(target_inquiry uuid,next_stage text,reason text default null)
returns public.event_inquiries language plpgsql security definer set search_path=public,extensions as $$
declare v_row public.event_inquiries; v_old text; v_actor uuid := auth.uid();
begin
  select * into v_row from public.event_inquiries where id=target_inquiry for update;
  if v_row.id is null then raise exception using errcode='P0002',message='INQUIRY_NOT_FOUND'; end if;
  if v_actor is not null and not private.has_atomic_permission('event_inquiries.transition',v_row.organization_id,v_row.venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  v_old := v_row.stage;
  if not public.can_transition_event_stage(v_old,next_stage) then raise exception using errcode='22023',message='INVALID_EVENT_STAGE_TRANSITION'; end if;
  if next_stage in ('lost','cancelled') and length(trim(coalesce(reason,''))) < 3 then raise exception using errcode='22023',message='STAGE_REASON_REQUIRED'; end if;
  update public.event_inquiries set stage=next_stage,lost_reason=case when next_stage='lost' then reason else lost_reason end,updated_by=v_actor,updated_at=now() where id=v_row.id returning * into v_row;
  insert into public.event_status_history(organization_id,venue_id,inquiry_id,from_stage,to_stage,reason,actor_id) values(v_row.organization_id,v_row.venue_id,v_row.id,v_old,next_stage,reason,v_actor);
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(v_row.organization_id,v_row.venue_id,'event_inquiry',v_row.id,'event.stage_changed',jsonb_build_object('inquiry_id',v_row.id,'from',v_old,'to',next_stage,'reason',reason),v_row.id::text||':stage:'||next_stage||':'||extract(epoch from now())::bigint) on conflict(idempotency_key) do nothing;
  return v_row;
end $$;

create or replace function public.create_event_space_hold_atomic(payload jsonb)
returns public.event_space_holds language plpgsql security definer set search_path=public,extensions as $$
declare
  v_org uuid := nullif(payload->>'organization_id','')::uuid;
  v_venue uuid := nullif(payload->>'venue_id','')::uuid;
  v_inquiry uuid := nullif(payload->>'inquiry_id','')::uuid;
  v_event uuid := nullif(payload->>'event_id','')::uuid;
  v_key text := nullif(trim(payload->>'idempotency_key'),'');
  v_start timestamptz := (payload->>'starts_at')::timestamptz;
  v_end timestamptz := (payload->>'ends_at')::timestamptz;
  v_expires timestamptz := coalesce(nullif(payload->>'expires_at','')::timestamptz,now()+interval '24 hours');
  v_hold public.event_space_holds;
  v_space uuid;
  v_space_ids uuid[];
  v_actor uuid := auth.uid();
begin
  perform public.release_expired_event_holds();
  if v_org is null or v_venue is null or v_start is null or v_end is null or v_end<=v_start or v_expires<=now() then raise exception using errcode='22023',message='INVALID_EVENT_HOLD'; end if;
  if v_actor is not null and not private.has_atomic_permission('event_holds.create',v_org,v_venue) then raise exception using errcode='42501',message='Not authorized'; end if;
  if v_key is not null then select * into v_hold from public.event_space_holds where organization_id=v_org and idempotency_key=v_key limit 1; if v_hold.id is not null then return v_hold; end if; end if;
  select array_agg(value::uuid order by value::uuid) into v_space_ids from jsonb_array_elements_text(coalesce(payload->'space_ids','[]'::jsonb));
  if coalesce(array_length(v_space_ids,1),0)=0 then raise exception using errcode='22023',message='SPACE_SELECTION_REQUIRED'; end if;
  if exists(select 1 from unnest(v_space_ids) s(id) where not exists(select 1 from public.event_spaces es where es.id=s.id and es.organization_id=v_org and es.venue_id=v_venue and es.active)) then raise exception using errcode='P0002',message='SPACE_NOT_FOUND'; end if;
  foreach v_space in array v_space_ids loop perform 1 from public.event_space_hold_resources r where r.space_id=v_space and r.state='active' and r.starts_at<v_end and v_start<r.ends_at for update; perform 1 from public.event_space_assignments a where a.space_id=v_space and a.state='active' and a.starts_at<v_end and v_start<a.ends_at for update; end loop;
  if exists(select 1 from public.event_inventory_blocks b where b.organization_id=v_org and b.venue_id=v_venue and b.space_id=any(v_space_ids) and b.active and b.starts_at<v_end and v_start<b.ends_at) then raise exception using errcode='P0001',message='EVENT_SPACE_UNAVAILABLE'; end if;
  insert into public.event_space_holds(organization_id,venue_id,inquiry_id,event_id,starts_at,ends_at,expires_at,priority,idempotency_key,created_by)
  values(v_org,v_venue,v_inquiry,v_event,v_start,v_end,v_expires,coalesce(nullif(payload->>'priority','')::smallint,1),v_key,v_actor) returning * into v_hold;
  foreach v_space in array v_space_ids loop
    insert into public.event_space_hold_resources(organization_id,venue_id,hold_id,space_id,starts_at,ends_at) values(v_org,v_venue,v_hold.id,v_space,v_start,v_end);
  end loop;
  if v_inquiry is not null then update public.event_inquiries set stage=case when public.can_transition_event_stage(stage,'pencil_booking') then 'pencil_booking' else stage end,updated_by=v_actor,updated_at=now() where id=v_inquiry; end if;
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(v_org,v_venue,'event_hold',v_hold.id,'event.hold_created',jsonb_build_object('hold_id',v_hold.id,'inquiry_id',v_inquiry,'event_id',v_event,'space_ids',to_jsonb(v_space_ids),'expires_at',v_expires),coalesce(v_key,v_hold.id::text||':created')) on conflict(idempotency_key) do nothing;
  return v_hold;
exception when exclusion_violation then raise exception using errcode='P0001',message='EVENT_SPACE_UNAVAILABLE';
end $$;

create or replace function public.convert_event_inquiry_atomic(target_inquiry uuid)
returns public.events language plpgsql security definer set search_path=public,extensions as $$
declare i public.event_inquiries; e public.events; actor uuid := auth.uid();
begin
  select * into i from public.event_inquiries where id=target_inquiry for update;
  if i.id is null then raise exception using errcode='P0002',message='INQUIRY_NOT_FOUND'; end if;
  if actor is not null and not private.has_atomic_permission('events.create',i.organization_id,i.venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  if i.converted_event_id is not null then select * into e from public.events where id=i.converted_event_id; return e; end if;
  if i.stage in ('lost','cancelled','closed') then raise exception using errcode='22023',message='INQUIRY_CANNOT_CONVERT'; end if;
  insert into public.events(organization_id,venue_id,inquiry_id,guest_id,company_id,event_type_id,name,starts_at,ends_at,setup_starts_at,teardown_ends_at,expected_headcount,status,owner_user_id,currency,estimated_value,created_by,updated_by)
  values(i.organization_id,i.venue_id,i.id,i.guest_id,i.company_id,i.event_type_id,coalesce(i.event_name,i.contact_name||' event'),i.requested_starts_at,i.requested_ends_at,i.requested_starts_at,i.requested_ends_at,i.expected_guests,'planning',i.owner_user_id,i.currency,i.estimated_value,actor,actor) returning * into e;
  update public.event_inquiries set converted_event_id=e.id,stage='planning',updated_by=actor,updated_at=now() where id=i.id;
  update public.event_space_holds set event_id=e.id where inquiry_id=i.id and state='active';
  insert into public.event_status_history(organization_id,venue_id,inquiry_id,from_stage,to_stage,reason,actor_id) values(i.organization_id,i.venue_id,i.id,i.stage,'planning','Inquiry converted to event',actor);
  insert into public.event_status_history(organization_id,venue_id,event_id,to_stage,reason,actor_id) values(e.organization_id,e.venue_id,e.id,'planning','Event created from inquiry',actor);
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(e.organization_id,e.venue_id,'event',e.id,'event.created',jsonb_build_object('event_id',e.id,'inquiry_id',i.id),e.id::text||':created') on conflict(idempotency_key) do nothing;
  return e;
end $$;

create or replace function public.create_event_proposal_atomic(payload jsonb)
returns public.event_proposals language plpgsql security definer set search_path=public,extensions as $$
declare
  e public.events; p public.event_proposals; actor uuid := auth.uid(); event_id uuid := nullif(payload->>'event_id','')::uuid; next_version integer; item jsonb; line_base numeric; line_total numeric; subtotal numeric := 0; tax_total numeric := 0; service_total numeric := 0; v_discount numeric := 0;
begin
  select * into e from public.events where id=event_id for update;
  if e.id is null then raise exception using errcode='P0002',message='EVENT_NOT_FOUND'; end if;
  if actor is not null and not private.has_atomic_permission('proposals.create',e.organization_id,e.venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  select coalesce(max(version),0)+1 into next_version from public.event_proposals where event_id=e.id;
  insert into public.event_proposals(organization_id,venue_id,event_id,version,currency,deposit_due,terms_snapshot,created_by) values(e.organization_id,e.venue_id,e.id,next_version,coalesce(nullif(payload->>'currency',''),e.currency),coalesce(nullif(payload->>'deposit_due','')::numeric,0),coalesce(payload->'terms_snapshot','{}'::jsonb),actor) returning * into p;
  for item in select * from jsonb_array_elements(coalesce(payload->'line_items','[]'::jsonb)) loop
    line_base := round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,2);
    v_discount := round(coalesce(nullif(item->>'discount_amount','')::numeric,0),2);
    line_total := greatest(line_base-v_discount,0);
    insert into public.event_proposal_line_items(proposal_id,description,quantity,unit,unit_price,discount_amount,tax_rate,service_charge_rate,line_total,snapshot)
    values(p.id,trim(item->>'description'),(item->>'quantity')::numeric,coalesce(nullif(item->>'unit',''),'item'),(item->>'unit_price')::numeric,v_discount,coalesce(nullif(item->>'tax_rate','')::numeric,0),coalesce(nullif(item->>'service_charge_rate','')::numeric,0),line_total,item);
    subtotal := subtotal+line_total;
    tax_total := tax_total+round(line_total*coalesce(nullif(item->>'tax_rate','')::numeric,0)/100,2);
    service_total := service_total+round(line_total*coalesce(nullif(item->>'service_charge_rate','')::numeric,0)/100,2);
  end loop;
  update public.event_proposals set subtotal=round(subtotal,2),discount_total=round((select coalesce(sum(discount_amount),0) from public.event_proposal_line_items where proposal_id=p.id),2),tax_total=round(tax_total,2),service_charge_total=round(service_total,2),total=round(subtotal+tax_total+service_total,2) where id=p.id returning * into p;
  return p;
end $$;

create or replace function public.issue_event_proposal(target_proposal uuid,terms jsonb default null)
returns public.event_proposals language plpgsql security definer set search_path=public,extensions as $$
declare p public.event_proposals; e public.events; actor uuid := auth.uid();
begin
  select * into p from public.event_proposals where id=target_proposal for update;
  if p.id is null then raise exception using errcode='P0002',message='PROPOSAL_NOT_FOUND'; end if;
  if actor is not null and not private.has_atomic_permission('proposals.issue',p.organization_id,p.venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  if p.status<>'draft' then raise exception using errcode='22023',message='PROPOSAL_IMMUTABLE'; end if;
  update public.event_proposals set status='issued',issued_at=now(),terms_snapshot=coalesce(terms,terms_snapshot) where id=p.id returning * into p;
  select * into e from public.events where id=p.event_id;
  if e.status in ('planning','negotiation','pencil_booking') then update public.events set status='proposal_sent',quoted_total=p.total,balance_due=p.total,updated_by=actor,updated_at=now() where id=e.id; end if;
  insert into public.event_status_history(organization_id,venue_id,event_id,from_stage,to_stage,reason,actor_id) values(e.organization_id,e.venue_id,e.id,e.status,'proposal_sent','Proposal issued',actor);
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(p.organization_id,p.venue_id,'event_proposal',p.id,'event.proposal_issued',jsonb_build_object('proposal_id',p.id,'event_id',p.event_id,'version',p.version),p.id::text||':issued') on conflict(idempotency_key) do nothing;
  return p;
end $$;

create or replace function public.accept_event_proposal(target_proposal uuid)
returns public.event_proposals language plpgsql security definer set search_path=public,extensions as $$
declare p public.event_proposals; e public.events; actor uuid := auth.uid();
begin
  select * into p from public.event_proposals where id=target_proposal for update;
  if p.id is null then raise exception using errcode='P0002',message='PROPOSAL_NOT_FOUND'; end if;
  if actor is not null and not private.has_atomic_permission('proposals.accept_on_behalf',p.organization_id,p.venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  if p.status not in ('issued','accepted') then raise exception using errcode='22023',message='PROPOSAL_NOT_ISSUED'; end if;
  if p.status='accepted' then return p; end if;
  update public.event_proposals set status='accepted',accepted_at=now(),accepted_by=actor where id=p.id returning * into p;
  update public.event_proposals set status='superseded' where event_id=p.event_id and id<>p.id and status='issued';
  select * into e from public.events where id=p.event_id for update;
  update public.events set status='deposit_pending',quoted_total=p.total,balance_due=p.total,updated_by=actor,updated_at=now() where id=e.id;
  if p.deposit_due>0 then insert into public.event_payment_schedules(organization_id,venue_id,event_id,proposal_id,schedule_type,due_at,amount,currency) values(p.organization_id,p.venue_id,p.event_id,p.id,'deposit',now(),p.deposit_due,p.currency); end if;
  insert into public.event_status_history(organization_id,venue_id,event_id,from_stage,to_stage,reason,actor_id) values(e.organization_id,e.venue_id,e.id,e.status,'deposit_pending','Proposal accepted',actor);
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(p.organization_id,p.venue_id,'event_proposal',p.id,'event.proposal_accepted',jsonb_build_object('proposal_id',p.id,'event_id',p.event_id,'version',p.version),p.id::text||':accepted') on conflict(idempotency_key) do nothing;
  return p;
end $$;

create or replace function public.record_event_payment_atomic(payload jsonb)
returns public.event_payments language plpgsql security definer set search_path=public,extensions as $$
declare p public.event_payments; actor uuid := auth.uid(); org_id uuid := nullif(payload->>'organization_id','')::uuid; venue_id uuid := nullif(payload->>'venue_id','')::uuid; event_id uuid := nullif(payload->>'event_id','')::uuid; schedule_id uuid := nullif(payload->>'schedule_id','')::uuid; key text := trim(payload->>'idempotency_key');
begin
  if org_id is null or venue_id is null or event_id is null or length(key)<8 or (payload->>'amount')::numeric<=0 then raise exception using errcode='22023',message='INVALID_EVENT_PAYMENT'; end if;
  if actor is not null and not private.has_atomic_permission('event_payments.record',org_id,venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  select * into p from public.event_payments where organization_id=org_id and idempotency_key=key limit 1; if p.id is not null then return p; end if;
  insert into public.event_payments(organization_id,venue_id,event_id,schedule_id,provider,provider_reference,amount,currency,idempotency_key,metadata,recorded_by) values(org_id,venue_id,event_id,schedule_id,trim(payload->>'provider'),trim(payload->>'provider_reference'),(payload->>'amount')::numeric,coalesce(nullif(payload->>'currency',''),'PHP'),key,coalesce(payload->'metadata','{}'::jsonb),actor) returning * into p;
  if schedule_id is not null then update public.event_payment_schedules s set status=case when coalesce((select sum(ep.amount) from public.event_payments ep where ep.schedule_id=s.id and ep.status='recorded'),0)>=s.amount then 'paid' else 'partially_paid' end where s.id=schedule_id; end if;
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(org_id,venue_id,'event',event_id,'event.payment_received',jsonb_build_object('payment_id',p.id,'event_id',event_id,'amount',p.amount,'provider_reference',p.provider_reference),p.id::text||':received') on conflict(idempotency_key) do nothing;
  return p;
end $$;

create or replace function public.confirm_event_atomic(target_event uuid)
returns public.events language plpgsql security definer set search_path=public,extensions as $$
declare e public.events; p public.event_proposals; h public.event_space_holds; r record; actor uuid := auth.uid(); paid numeric := 0;
begin
  select * into e from public.events where id=target_event for update;
  if e.id is null then raise exception using errcode='P0002',message='EVENT_NOT_FOUND'; end if;
  if actor is not null and not private.has_atomic_permission('events.update',e.organization_id,e.venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  select * into p from public.event_proposals where event_id=e.id and status='accepted' order by version desc limit 1;
  if p.id is null then raise exception using errcode='22023',message='ACCEPTED_PROPOSAL_REQUIRED'; end if;
  select * into h from public.event_space_holds where event_id=e.id and state='active' and expires_at>now() order by priority desc,created_at desc limit 1 for update;
  if h.id is null then raise exception using errcode='P0001',message='EVENT_HOLD_REQUIRED'; end if;
  select coalesce(sum(ep.amount),0) into paid from public.event_payments ep join public.event_payment_schedules s on s.id=ep.schedule_id where s.event_id=e.id and s.schedule_type='deposit' and ep.status='recorded';
  if p.deposit_due>paid then raise exception using errcode='P0001',message='DEPOSIT_REQUIRED'; end if;
  for r in select * from public.event_space_hold_resources where hold_id=h.id and state='active' order by space_id for update loop
    insert into public.event_space_assignments(organization_id,venue_id,event_id,space_id,starts_at,ends_at,assigned_by) values(e.organization_id,e.venue_id,e.id,r.space_id,r.starts_at,r.ends_at,actor);
  end loop;
  update public.event_space_hold_resources set state='converted' where hold_id=h.id and state='active';
  update public.event_space_holds set state='converted' where id=h.id;
  update public.events set status='confirmed',quoted_total=p.total,balance_due=greatest(p.total-paid,0),updated_by=actor,updated_at=now() where id=e.id returning * into e;
  update public.event_inquiries set stage='confirmed',updated_by=actor,updated_at=now() where converted_event_id=e.id;
  insert into public.event_status_history(organization_id,venue_id,event_id,from_stage,to_stage,reason,actor_id) values(e.organization_id,e.venue_id,e.id,'deposit_pending','confirmed','Deposit-backed confirmation',actor);
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(e.organization_id,e.venue_id,'event',e.id,'event.confirmed',jsonb_build_object('event_id',e.id,'proposal_id',p.id),e.id::text||':confirmed') on conflict(idempotency_key) do nothing;
  return e;
exception when exclusion_violation then raise exception using errcode='P0001',message='EVENT_SPACE_UNAVAILABLE';
end $$;

create or replace function public.transition_event_status(target_event uuid,next_status text,reason text default null)
returns public.events language plpgsql security definer set search_path=public,extensions as $$
declare e public.events; old_status text; actor uuid := auth.uid();
begin
  select * into e from public.events where id=target_event for update;
  if e.id is null then raise exception using errcode='P0002',message='EVENT_NOT_FOUND'; end if;
  if actor is not null and not private.has_atomic_permission('events.update',e.organization_id,e.venue_id) then raise exception using errcode='42501',message='Not authorized'; end if;
  old_status:=e.status;
  if not public.can_transition_event_stage(old_status,next_status) then raise exception using errcode='22023',message='INVALID_EVENT_STAGE_TRANSITION'; end if;
  if next_status in ('lost','cancelled') and length(trim(coalesce(reason,'')))<3 then raise exception using errcode='22023',message='STAGE_REASON_REQUIRED'; end if;
  update public.events set status=next_status,updated_by=actor,updated_at=now() where id=e.id returning * into e;
  if next_status in ('cancelled','lost','closed') then update public.event_space_hold_resources set state='released' where hold_id in (select id from public.event_space_holds where event_id=e.id) and state='active'; update public.event_space_holds set state='released',released_at=now(),release_reason=coalesce(reason,'Event released') where event_id=e.id and state='active'; update public.event_space_assignments set state='released' where event_id=e.id and state='active'; end if;
  insert into public.event_status_history(organization_id,venue_id,event_id,from_stage,to_stage,reason,actor_id) values(e.organization_id,e.venue_id,e.id,old_status,next_status,reason,actor);
  insert into public.event_outbox_events(organization_id,venue_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key) values(e.organization_id,e.venue_id,'event',e.id,case when next_status='cancelled' then 'event.cancelled' when next_status='completed' then 'event.completed' else 'event.stage_changed' end,jsonb_build_object('event_id',e.id,'from',old_status,'to',next_status,'reason',reason),e.id::text||':stage:'||next_status||':'||extract(epoch from now())::bigint) on conflict(idempotency_key) do nothing;
  return e;
end $$;

create or replace function private.prevent_immutable_event_proposal()
returns trigger language plpgsql as $$
begin
  if old.status in ('issued','accepted','declined','superseded') then raise exception using errcode='55000',message='PROPOSAL_IMMUTABLE'; end if;
  return new;
end $$;
create trigger event_proposal_immutable before update on public.event_proposals for each row execute function private.prevent_immutable_event_proposal();

insert into public.permissions(permission_key,description) values
  ('event_config.read','Read event spaces and commercial rules'),('event_config.manage','Manage event spaces and rules'),('event_inventory.manage','Manage event inventory blocks'),
  ('event_inquiries.read','Read event inquiries'),('event_inquiries.create','Create event inquiries'),('event_inquiries.assign','Assign event owners'),('event_inquiries.transition','Move event inquiries through the sales pipeline'),
  ('events.read','Read event records'),('events.create','Convert inquiries into events'),('events.update','Update event plans and status'),('events.cancel','Cancel events'),('events.complete','Complete events'),
  ('event_holds.create','Create event space holds'),('event_holds.extend','Extend event holds'),('event_holds.override','Override event hold policy'),
  ('proposals.read','Read event proposals'),('proposals.create','Create event proposal drafts'),('proposals.issue','Issue event proposals'),('proposals.approve_discount','Approve non-standard proposal discounts'),('proposals.accept_on_behalf','Accept a proposal on behalf of a client'),
  ('event_finance.read','Read event finance'),('event_payments.record','Record provider-referenced event payments'),('event_refunds.request','Request event refunds'),('event_refunds.approve','Approve event refunds'),
  ('event_documents.read','Read event documents'),('event_documents.manage','Manage event documents'),('event_sensitive_notes.read','Read sensitive event notes')
on conflict(permission_key) do update set description=excluded.description;

with org as (select id from public.organizations where slug='waterfront-group'), role_map(code,permission_key) as (values
  ('organization_owner','event_config.read'),('organization_owner','event_config.manage'),('organization_owner','event_inventory.manage'),('organization_owner','event_inquiries.read'),('organization_owner','event_inquiries.create'),('organization_owner','event_inquiries.assign'),('organization_owner','event_inquiries.transition'),('organization_owner','events.read'),('organization_owner','events.create'),('organization_owner','events.update'),('organization_owner','events.cancel'),('organization_owner','events.complete'),('organization_owner','event_holds.create'),('organization_owner','event_holds.extend'),('organization_owner','event_holds.override'),('organization_owner','proposals.read'),('organization_owner','proposals.create'),('organization_owner','proposals.issue'),('organization_owner','proposals.approve_discount'),('organization_owner','proposals.accept_on_behalf'),('organization_owner','event_finance.read'),('organization_owner','event_payments.record'),('organization_owner','event_refunds.request'),('organization_owner','event_refunds.approve'),('organization_owner','event_documents.read'),('organization_owner','event_documents.manage'),('organization_owner','event_sensitive_notes.read'),
  ('organization_admin','event_config.read'),('organization_admin','event_config.manage'),('organization_admin','event_inventory.manage'),('organization_admin','event_inquiries.read'),('organization_admin','event_inquiries.create'),('organization_admin','event_inquiries.assign'),('organization_admin','event_inquiries.transition'),('organization_admin','events.read'),('organization_admin','events.create'),('organization_admin','events.update'),('organization_admin','event_holds.create'),('organization_admin','proposals.read'),('organization_admin','proposals.create'),('organization_admin','proposals.issue'),('organization_admin','event_finance.read'),('organization_admin','event_documents.read'),('organization_admin','event_documents.manage'),
  ('venue_manager','event_config.read'),('venue_manager','event_config.manage'),('venue_manager','event_inventory.manage'),('venue_manager','event_inquiries.read'),('venue_manager','event_inquiries.create'),('venue_manager','event_inquiries.assign'),('venue_manager','event_inquiries.transition'),('venue_manager','events.read'),('venue_manager','events.create'),('venue_manager','events.update'),('venue_manager','events.cancel'),('venue_manager','events.complete'),('venue_manager','event_holds.create'),('venue_manager','event_holds.extend'),('venue_manager','proposals.read'),('venue_manager','proposals.create'),('venue_manager','proposals.issue'),('venue_manager','event_finance.read'),('venue_manager','event_documents.read'),
  ('host','event_inquiries.read'),('host','event_inquiries.create'),('host','event_inquiries.transition'),('host','events.read'),('host','event_holds.create'),('host','proposals.read'),('host','event_documents.read'),
  ('finance','events.read'),('finance','proposals.read'),('finance','event_finance.read'),('finance','event_payments.record'),('finance','event_refunds.request'),('finance','event_refunds.approve'),('finance','event_documents.read'),
  ('analyst_viewer','event_inquiries.read'),('analyst_viewer','events.read'),('analyst_viewer','proposals.read'),('analyst_viewer','event_finance.read')
)
insert into public.role_permissions(role_id,permission_key)
select r.id,role_map.permission_key from org join public.roles r on r.organization_id=org.id join role_map on role_map.code=r.code on conflict do nothing;

alter table public.companies enable row level security;
alter table public.company_contacts enable row level security;
alter table public.event_types enable row level security;
alter table public.event_spaces enable row level security;
alter table public.event_space_combinations enable row level security;
alter table public.event_space_combination_members enable row level security;
alter table public.event_space_rules enable row level security;
alter table public.event_inventory_blocks enable row level security;
alter table public.event_inquiries enable row level security;
alter table public.events enable row level security;
alter table public.event_space_holds enable row level security;
alter table public.event_space_hold_resources enable row level security;
alter table public.event_space_assignments enable row level security;
alter table public.event_status_history enable row level security;
alter table public.event_outbox_events enable row level security;
alter table public.event_proposals enable row level security;
alter table public.event_proposal_line_items enable row level security;
alter table public.event_payment_schedules enable row level security;
alter table public.event_payments enable row level security;
alter table public.event_tasks enable row level security;
alter table public.event_requirements enable row level security;
alter table public.event_attendance_snapshots enable row level security;
alter table public.event_notes enable row level security;
alter table public.event_documents enable row level security;

create policy event_config_read on public.event_spaces for select to authenticated using (private.has_atomic_permission('event_config.read',organization_id,venue_id));
create policy event_config_manage on public.event_spaces for all to authenticated using (private.has_atomic_permission('event_config.manage',organization_id,venue_id)) with check (private.has_atomic_permission('event_config.manage',organization_id,venue_id));
create policy event_combinations_read on public.event_space_combinations for select to authenticated using (private.has_atomic_permission('event_config.read',organization_id,venue_id));
create policy event_combination_members_read on public.event_space_combination_members for select to authenticated using (private.has_atomic_permission('event_config.read',organization_id,null));
create policy event_rules_read on public.event_space_rules for select to authenticated using (private.has_atomic_permission('event_config.read',organization_id,venue_id));
create policy event_blocks_read on public.event_inventory_blocks for select to authenticated using (private.has_atomic_permission('event_config.read',organization_id,venue_id));
create policy event_blocks_manage on public.event_inventory_blocks for all to authenticated using (private.has_atomic_permission('event_inventory.manage',organization_id,venue_id)) with check (private.has_atomic_permission('event_inventory.manage',organization_id,venue_id));
create policy event_companies_read on public.companies for select to authenticated using (private.has_atomic_permission('event_inquiries.read',organization_id,null));
create policy event_company_contacts_read on public.company_contacts for select to authenticated using (private.has_atomic_permission('event_inquiries.read',organization_id,null));
create policy event_types_read on public.event_types for select to authenticated using (private.has_atomic_permission('event_config.read',organization_id,venue_id));
create policy event_inquiries_read on public.event_inquiries for select to authenticated using (private.has_atomic_permission('event_inquiries.read',organization_id,venue_id));
create policy events_read on public.events for select to authenticated using (private.has_atomic_permission('events.read',organization_id,venue_id));
create policy event_holds_read on public.event_space_holds for select to authenticated using (private.has_atomic_permission('event_inquiries.read',organization_id,venue_id));
create policy event_hold_resources_read on public.event_space_hold_resources for select to authenticated using (private.has_atomic_permission('event_inquiries.read',organization_id,venue_id));
create policy event_assignments_read on public.event_space_assignments for select to authenticated using (private.has_atomic_permission('events.read',organization_id,venue_id));
create policy event_history_read on public.event_status_history for select to authenticated using (private.has_atomic_permission('event_inquiries.read',organization_id,venue_id));
create policy event_outbox_read on public.event_outbox_events for select to authenticated using (private.has_atomic_permission('audit.read',organization_id,venue_id));
create policy event_proposals_read on public.event_proposals for select to authenticated using (private.has_atomic_permission('proposals.read',organization_id,venue_id));
create policy event_proposal_lines_read on public.event_proposal_line_items for select to authenticated using (exists(select 1 from public.event_proposals p where p.id=proposal_id and private.has_atomic_permission('proposals.read',p.organization_id,p.venue_id)));
create policy event_schedules_read on public.event_payment_schedules for select to authenticated using (private.has_atomic_permission('event_finance.read',organization_id,venue_id));
create policy event_payments_read on public.event_payments for select to authenticated using (private.has_atomic_permission('event_finance.read',organization_id,venue_id));
create policy event_tasks_read on public.event_tasks for select to authenticated using (private.has_atomic_permission('events.read',organization_id,venue_id));
create policy event_requirements_read on public.event_requirements for select to authenticated using (private.has_atomic_permission('events.read',organization_id,venue_id));
create policy event_attendance_read on public.event_attendance_snapshots for select to authenticated using (private.has_atomic_permission('events.read',organization_id,venue_id));
create policy event_notes_read on public.event_notes for select to authenticated using (private.has_atomic_permission('events.read',organization_id,venue_id) and (not sensitive or private.has_atomic_permission('event_sensitive_notes.read',organization_id,venue_id)));
create policy event_documents_read on public.event_documents for select to authenticated using (private.has_atomic_permission('event_documents.read',organization_id,venue_id));

revoke all on public.companies,public.company_contacts,public.event_types,public.event_spaces,public.event_space_combinations,public.event_space_combination_members,public.event_space_rules,public.event_inventory_blocks,public.event_inquiries,public.events,public.event_space_holds,public.event_space_hold_resources,public.event_space_assignments,public.event_status_history,public.event_outbox_events,public.event_proposals,public.event_proposal_line_items,public.event_payment_schedules,public.event_payments,public.event_tasks,public.event_requirements,public.event_attendance_snapshots,public.event_notes,public.event_documents from anon,authenticated;
grant select on public.companies,public.company_contacts,public.event_types,public.event_spaces,public.event_space_combinations,public.event_space_combination_members,public.event_space_rules,public.event_inventory_blocks,public.event_inquiries,public.events,public.event_space_holds,public.event_space_hold_resources,public.event_space_assignments,public.event_status_history,public.event_outbox_events,public.event_proposals,public.event_proposal_line_items,public.event_payment_schedules,public.event_payments,public.event_tasks,public.event_requirements,public.event_attendance_snapshots,public.event_notes,public.event_documents to authenticated;
grant all on public.companies,public.company_contacts,public.event_types,public.event_spaces,public.event_space_combinations,public.event_space_combination_members,public.event_space_rules,public.event_inventory_blocks,public.event_inquiries,public.events,public.event_space_holds,public.event_space_hold_resources,public.event_space_assignments,public.event_status_history,public.event_outbox_events,public.event_proposals,public.event_proposal_line_items,public.event_payment_schedules,public.event_payments,public.event_tasks,public.event_requirements,public.event_attendance_snapshots,public.event_notes,public.event_documents to service_role;
revoke all on function public.create_event_inquiry_atomic(jsonb),public.transition_event_inquiry(uuid,text,text),public.create_event_space_hold_atomic(jsonb),public.convert_event_inquiry_atomic(uuid),public.create_event_proposal_atomic(jsonb),public.issue_event_proposal(uuid,jsonb),public.accept_event_proposal(uuid),public.record_event_payment_atomic(jsonb),public.confirm_event_atomic(uuid),public.transition_event_status(uuid,text,text) from public,anon;
grant execute on function public.create_event_inquiry_atomic(jsonb) to anon,authenticated,service_role;
grant execute on function public.transition_event_inquiry(uuid,text,text),public.create_event_space_hold_atomic(jsonb),public.convert_event_inquiry_atomic(uuid),public.create_event_proposal_atomic(jsonb),public.issue_event_proposal(uuid,jsonb),public.accept_event_proposal(uuid),public.record_event_payment_atomic(jsonb),public.confirm_event_atomic(uuid),public.transition_event_status(uuid,text,text) to authenticated,service_role;
grant execute on function public.release_expired_event_holds() to service_role;

-- Initial event setup is intentionally conservative; operations can add or adjust
-- spaces and rules without changing accepted event snapshots.
with org as (select id from public.organizations where slug='waterfront-group'), venue as (select id,organization_id from public.outlets where slug='waterfront-seafood-cocktails')
insert into public.event_types(organization_id,venue_id,code,name,description)
select org.id,venue.id,x.code,x.name,x.description from org cross join venue cross join (values
  ('corporate','Corporate event','Company dinners, launches, and team gatherings'),
  ('social','Social celebration','Birthdays, anniversaries, and milestone celebrations'),
  ('wedding','Wedding reception','Wedding and family celebrations'),
  ('private_dining','Private dining','Chef-led and hosted private dining experiences')
) x(code,name,description) on conflict(organization_id,venue_id,code) do update set name=excluded.name,description=excluded.description,active=true;

with venue as (select id,organization_id from public.outlets where slug='waterfront-seafood-cocktails')
insert into public.event_spaces(organization_id,venue_id,code,name,location,description,min_capacity,max_capacity,features,sort_order)
select venue.organization_id,venue.id,x.code,x.name,x.location,x.description,x.min_capacity,x.max_capacity,x.features::jsonb,x.sort_order from venue cross join (values
  ('GARDEN','Waterfront Garden','Garden level','Open-air garden zone for receptions and cocktails',20,120,'["outdoor","waterfront","accessible"]',10),
  ('VIP','VIP Room','Main dining level','Private room for hosted dining and meetings',8,24,'["private","quiet","accessible"]',20),
  ('TERRACE','Terrace','Waterfront level','Covered terrace for smaller gatherings',12,48,'["outdoor","waterfront"]',30),
  ('MAIN','Main Dining Buyout','Main dining level','Full main dining buyout footprint',40,180,'["private","waterfront","accessible"]',40)
) x(code,name,location,description,min_capacity,max_capacity,features,sort_order) on conflict(venue_id,code) do update set name=excluded.name,location=excluded.location,description=excluded.description,max_capacity=excluded.max_capacity,features=excluded.features,sort_order=excluded.sort_order,active=true;

with venue as (select id,organization_id from public.outlets where slug='waterfront-seafood-cocktails')
insert into public.event_space_rules(organization_id,venue_id,space_id,minimum_duration_minutes,setup_buffer_minutes,teardown_buffer_minutes,rental_fee,minimum_spend,currency,deposit_percent,commercial_snapshot)
select venue.organization_id,venue.id,s.id,case when s.code='VIP' then 180 else 120 end,case when s.code='MAIN' then 120 else 60 end,30,0,0,'PHP',30,jsonb_build_object('source','phase4_reference_setup') from venue join public.event_spaces s on s.venue_id=venue.id on conflict(venue_id,space_id,effective_from) do update set minimum_duration_minutes=excluded.minimum_duration_minutes,setup_buffer_minutes=excluded.setup_buffer_minutes,teardown_buffer_minutes=excluded.teardown_buffer_minutes,deposit_percent=excluded.deposit_percent,active=true;
