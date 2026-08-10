-- Waterfront Reservations Phase 2: public booking requests and guest self-service.
-- Additive only. Anonymous clients receive no direct table policies; public writes are server-controlled.

create type public.public_request_type as enum ('main_dining','vip_room','private_event');
create type public.public_request_status as enum (
  'submitted','under_review','more_information_required','alternative_proposed','approved_converted',
  'declined','withdrawn_by_guest','closed_duplicate','expired_unresolved'
);
create type public.public_availability_state as enum ('available','limited','unavailable','requires_staff_review');
create type public.public_actor_type as enum ('guest','staff','system');
create type public.guest_change_type as enum ('cancel','reschedule');
create type public.guest_change_status as enum ('submitted','under_review','approved','declined','withdrawn');
create type public.transactional_message_status as enum ('queued','sent','failed','suppressed');

create table public.public_booking_policies (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  public_booking_enabled boolean not null default false,
  public_availability_enabled boolean not null default false,
  minimum_lead_time_minutes integer not null default 120 check (minimum_lead_time_minutes >= 0),
  maximum_advance_days integer not null default 90 check (maximum_advance_days between 1 and 730),
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes in (15,30,60)),
  maximum_public_party_size integer not null default 60 check (maximum_public_party_size > 0),
  allow_main_dining_requests boolean not null default true,
  allow_vip_room_requests boolean not null default false,
  allow_private_event_requests boolean not null default false,
  require_email boolean not null default false,
  guest_withdrawal_enabled boolean not null default true,
  reschedule_request_enabled boolean not null default true,
  cancellation_request_enabled boolean not null default true,
  transactional_email_enabled boolean not null default false,
  limited_availability_messaging_enabled boolean not null default false,
  permit_closed_date_alternative_inquiry boolean not null default false,
  retention_days_rejected integer not null default 180 check (retention_days_rejected between 30 and 2555),
  duplicate_window_hours integer not null default 24 check (duplicate_window_hours between 1 and 720),
  response_target_minutes integer not null default 60 check (response_target_minutes > 0),
  terms_url text,
  privacy_url text,
  operational_contact_text text not null default 'Waterfront may contact you to handle this request.',
  main_dining_instructions text,
  vip_room_instructions text,
  private_event_instructions text,
  terms_version text not null default 'preview-2026-08',
  privacy_version text not null default 'preview-2026-08',
  effective_at timestamptz,
  is_management_confirmed boolean not null default false,
  updated_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not public_booking_enabled or is_management_confirmed)
);

create table public.public_booking_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  outlet_id uuid not null references public.outlets(id),
  request_type public.public_request_type not null,
  requested_local_date date not null,
  requested_starts_at timestamptz not null,
  requested_ends_at timestamptz,
  duration_minutes integer not null check (duration_minutes between 60 and 720),
  guest_count integer not null check (guest_count > 0),
  guest_full_name text not null check (length(trim(guest_full_name)) between 2 and 100),
  mobile_display text not null,
  mobile_normalized text not null,
  email text,
  email_normalized text,
  company text,
  occasion text,
  seating_preference text,
  public_special_request text check (length(public_special_request) <= 500),
  source text not null default 'Website' check (source = 'Website'),
  campaign_source text,
  campaign_medium text,
  campaign_name text,
  status public.public_request_status not null default 'submitted',
  availability_snapshot public.public_availability_state not null,
  likely_deposit_required boolean not null default false,
  terms_version_accepted text not null,
  terms_accepted_at timestamptz not null,
  privacy_notice_version text not null,
  marketing_consent boolean not null default false,
  assigned_owner_id uuid references public.staff_profiles(user_id),
  linked_guest_id uuid references public.guests(id),
  linked_reservation_id uuid unique references public.reservations(id),
  closure_reason_category text,
  internal_resolution_note text,
  first_reviewed_at timestamptz,
  resolved_at timestamptz,
  idempotency_hash text not null unique,
  duplicate_fingerprint_hash text,
  abuse_category text,
  network_key_hash text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'approved_converted') = (linked_reservation_id is not null)),
  check ((status not in ('declined','closed_duplicate','expired_unresolved')) or closure_reason_category is not null)
);

create index public_requests_queue_idx on public.public_booking_requests(outlet_id,status,submitted_at);
create index public_requests_requested_date_idx on public.public_booking_requests(outlet_id,requested_local_date,request_type);
create index public_requests_owner_idx on public.public_booking_requests(outlet_id,assigned_owner_id,status);
create index public_requests_mobile_idx on public.public_booking_requests(outlet_id,mobile_normalized,submitted_at desc);
create index public_requests_email_idx on public.public_booking_requests(outlet_id,email_normalized,submitted_at desc) where email_normalized is not null;
create index public_requests_duplicate_idx on public.public_booking_requests(duplicate_fingerprint_hash,submitted_at desc) where duplicate_fingerprint_hash is not null;

create table public.public_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.public_booking_requests(id) on delete restrict,
  event_type text not null,
  actor_type public.public_actor_type not null,
  actor_staff_id uuid references public.staff_profiles(user_id),
  public_message text,
  private_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check ((actor_type = 'staff') = (actor_staff_id is not null))
);
create index public_request_events_timeline_idx on public.public_request_events(request_id,created_at);

create table public.public_access_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.public_booking_requests(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  purpose text not null default 'guest_manage' check (purpose in ('guest_manage')),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index public_access_tokens_request_idx on public.public_access_tokens(request_id,created_at desc);

create table public.guest_change_requests (
  id uuid primary key default gen_random_uuid(),
  public_request_id uuid not null references public.public_booking_requests(id),
  reservation_id uuid not null references public.reservations(id),
  change_type public.guest_change_type not null,
  proposed_local_date date,
  proposed_starts_at timestamptz,
  guest_details text check (length(guest_details) <= 500),
  status public.guest_change_status not null default 'submitted',
  assigned_owner_id uuid references public.staff_profiles(user_id),
  staff_reason text,
  resolved_by uuid references public.staff_profiles(user_id),
  resolved_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guest_change_requests_queue_idx on public.guest_change_requests(status,submitted_at);

create table public.transactional_messages (
  id uuid primary key default gen_random_uuid(),
  public_request_id uuid references public.public_booking_requests(id),
  reservation_id uuid references public.reservations(id),
  channel text not null default 'email' check (channel = 'email'),
  template_key text not null,
  template_version text not null,
  recipient_encrypted text not null,
  idempotency_key text not null unique,
  provider_message_id text,
  status public.transactional_message_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_category text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_request_id is not null or reservation_id is not null)
);
create index transactional_messages_queue_idx on public.transactional_messages(status,created_at) where status in ('queued','failed');

-- Website is an additive inquiry source. Existing source history remains untouched.
insert into public.inquiry_sources(outlet_id,name,active,sort_order)
select id,'Website',true,-10 from public.outlets
on conflict(outlet_id,name) do update set active=true;

-- Seed disabled, unconfirmed placeholder policy rows for every existing outlet.
insert into public.public_booking_policies(outlet_id)
select id from public.outlets
on conflict(outlet_id) do nothing;

-- Staff conversion serializes the request, delegates all conflict/deposit logic to Phase 1,
-- and links the resulting reservation before committing. It cannot convert the request twice.
create or replace function public.convert_public_request_atomic(target_request uuid, reservation_payload jsonb)
returns public.reservations language plpgsql security definer set search_path=public as $$
declare req public.public_booking_requests; guest_id uuid; created_reservation public.reservations; payload jsonb;
begin
  select * into req from public.public_booking_requests where id=target_request for update;
  if req.id is null or not public.has_outlet_access(req.outlet_id) or not public.can_mutate() then raise exception 'Not authorized'; end if;
  if req.status='approved_converted' or req.linked_reservation_id is not null then raise exception 'Request already converted'; end if;
  if req.status not in ('under_review','more_information_required','alternative_proposed') then raise exception 'Request must be reviewed before conversion'; end if;

  guest_id := nullif(reservation_payload->>'guest_id','')::uuid;
  if guest_id is null then
    select id into guest_id from public.guests where mobile_normalized=req.mobile_normalized order by updated_at desc limit 1;
  end if;
  if guest_id is null then
    insert into public.guests(full_name,mobile_display,email,company,operational_contact_permission,marketing_consent)
    values(req.guest_full_name,req.mobile_display,req.email,req.company,true,req.marketing_consent) returning id into guest_id;
  end if;

  payload := reservation_payload || jsonb_build_object(
    'outlet_id',req.outlet_id,'guest_id',guest_id,'guest_count',req.guest_count,
    'local_date',req.requested_local_date,'starts_at',req.requested_starts_at,
    'ends_at',coalesce(req.requested_ends_at,req.requested_starts_at + make_interval(mins=>req.duration_minutes)),
    'source','Website','occasion',req.occasion,'special_requests',req.public_special_request
  );
  created_reservation := public.create_reservation_atomic(payload);
  update public.public_booking_requests set status='approved_converted',linked_guest_id=guest_id,
    linked_reservation_id=created_reservation.id,resolved_at=now(),updated_at=now() where id=req.id;
  insert into public.public_request_events(request_id,event_type,actor_type,actor_staff_id,public_message,private_metadata)
  values(req.id,'approved_converted','staff',auth.uid(),'Your request was approved and a reservation was created.',jsonb_build_object('reservation_id',created_reservation.id));
  insert into public.audit_log(actor_id,outlet_id,entity_type,entity_id,action,metadata)
  values(auth.uid(),req.outlet_id,'public_booking_request',req.id,'converted',jsonb_build_object('reservation_id',created_reservation.id));
  return created_reservation;
end $$;

alter table public.public_booking_policies enable row level security;
alter table public.public_booking_requests enable row level security;
alter table public.public_request_events enable row level security;
alter table public.public_access_tokens enable row level security;
alter table public.guest_change_requests enable row level security;
alter table public.transactional_messages enable row level security;

create policy public_booking_policies_staff_read on public.public_booking_policies for select using (public.has_outlet_access(outlet_id));
create policy public_booking_policies_manager_write on public.public_booking_policies for all
  using (public.has_outlet_access(outlet_id) and public.current_staff_role() in ('group_admin','group_manager','outlet_manager'))
  with check (public.has_outlet_access(outlet_id) and public.current_staff_role() in ('group_admin','group_manager','outlet_manager'));
create policy public_requests_staff_read on public.public_booking_requests for select using (public.has_outlet_access(outlet_id));
create policy public_requests_staff_update on public.public_booking_requests for update
  using (public.has_outlet_access(outlet_id) and public.can_mutate()) with check (public.has_outlet_access(outlet_id) and public.can_mutate());
create policy public_request_events_staff_read on public.public_request_events for select using (
  exists(select 1 from public.public_booking_requests r where r.id=request_id and public.has_outlet_access(r.outlet_id))
);
create policy public_tokens_manager_read on public.public_access_tokens for select using (
  public.current_staff_role() in ('group_admin','group_manager','outlet_manager') and
  exists(select 1 from public.public_booking_requests r where r.id=request_id and public.has_outlet_access(r.outlet_id))
);
create policy guest_change_staff_read on public.guest_change_requests for select using (
  exists(select 1 from public.public_booking_requests r where r.id=public_request_id and public.has_outlet_access(r.outlet_id))
);
create policy messages_staff_read on public.transactional_messages for select using (
  (public_request_id is not null and exists(select 1 from public.public_booking_requests r where r.id=public_request_id and public.has_outlet_access(r.outlet_id))) or
  (reservation_id is not null and exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)))
);

revoke all on public.public_booking_requests,public.public_request_events,public.public_access_tokens,public.guest_change_requests,public.transactional_messages from anon;
revoke all on function public.convert_public_request_atomic(uuid,jsonb) from public;
grant execute on function public.convert_public_request_atomic(uuid,jsonb) to authenticated;
