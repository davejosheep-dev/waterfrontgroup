-- Waterfront Reservations MVP
-- PostgreSQL/Supabase is the final authority for authorization and conflicts.
create extension if not exists pgcrypto;

create type public.staff_role as enum ('group_admin','group_manager','outlet_manager','reservations_staff','host','read_only');
create type public.resource_type as enum ('main_dining','private_room');
create type public.booking_type as enum ('regular_table','large_party','vip_room','private_event','walk_in');
create type public.reservation_status as enum ('draft','temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated','completed','expired','cancelled','no_show');
create type public.payment_requirement_status as enum ('not_required','pending','partially_paid','paid','waived','overdue','voided');
create type public.payment_status as enum ('recorded','voided','refunded');

create table public.outlets (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  timezone text not null default 'Asia/Manila', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint valid_timezone check (timezone = 'Asia/Manila')
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null, role public.staff_role not null, active boolean not null default true,
  can_view_payment_proof boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.staff_outlet_assignments (
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  primary key (user_id, outlet_id)
);

create table public.dining_areas (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  name text not null, resource_type public.resource_type not null, capacity integer not null check (capacity > 0),
  active boolean not null default true, minimum_duration_minutes integer check (minimum_duration_minutes > 0),
  default_duration_minutes integer not null check (default_duration_minutes > 0),
  grace_period_minutes integer not null default 0 check (grace_period_minutes >= 0),
  reset_buffer_minutes integer not null default 0 check (reset_buffer_minutes between 0 and 60),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (outlet_id, name)
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(), dining_area_id uuid not null references public.dining_areas(id),
  code text not null, minimum_capacity integer not null default 1 check (minimum_capacity > 0),
  maximum_capacity integer not null check (maximum_capacity >= minimum_capacity), active boolean not null default true,
  table_type text check (table_type in ('T1','T2','T3','custom')), position_x numeric(5,2), position_y numeric(5,2),
  floor_width numeric(5,2), floor_height numeric(5,2), rotation_degrees numeric(6,2) not null default 0,
  floor_zone text, seat_capacity_confirmed boolean not null default false,
  notes text, is_development_placeholder boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (dining_area_id, code),
  check (position_x is null or position_x between 0 and 100), check (position_y is null or position_y between 0 and 100),
  check (floor_width is null or floor_width > 0), check (floor_height is null or floor_height > 0)
);
create table public.table_combinations (
  id uuid primary key default gen_random_uuid(), dining_area_id uuid not null references public.dining_areas(id),
  name text not null, minimum_capacity integer not null default 1, maximum_capacity integer not null,
  active boolean not null default true, is_development_placeholder boolean not null default false,
  unique (dining_area_id, name), check (maximum_capacity >= minimum_capacity)
);
create table public.table_combination_members (
  combination_id uuid not null references public.table_combinations(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id), primary key (combination_id, table_id)
);

create table public.operating_hours (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  day_of_week smallint not null check (day_of_week between 0 and 6), open_time time not null, close_time time not null,
  active boolean not null default true, service_label text, unique (outlet_id, day_of_week, service_label)
);
create table public.outlet_policies (
  outlet_id uuid primary key references public.outlets(id), large_party_threshold integer not null check (large_party_threshold > 1),
  default_main_dining_duration_minutes integer not null default 120,
  main_dining_reset_buffer_minutes integer not null default 10 check (main_dining_reset_buffer_minutes between 0 and 60),
  regular_reminder_lead_hours integer not null default 24, large_party_reminder_lead_days integer not null default 7,
  currency text not null default 'PHP', updated_at timestamptz not null default now()
);
create table public.inquiry_sources (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  name text not null, active boolean not null default true, sort_order integer not null default 0,
  unique (outlet_id, name)
);
create table public.special_service_dates (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  local_date date not null, name text not null, deposit_required boolean not null default false,
  deposit_amount_centavos bigint check (deposit_amount_centavos is null or deposit_amount_centavos >= 0),
  open_time time, close_time time, active boolean not null default true, unique (outlet_id, local_date, name)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(), full_name text not null, mobile_display text not null,
  mobile_normalized text, email text, email_normalized text, company text, notes text,
  operational_contact_permission boolean not null default true, marketing_consent boolean,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index guests_mobile_normalized_idx on public.guests (mobile_normalized) where mobile_normalized is not null;
create index guests_email_normalized_idx on public.guests (email_normalized) where email_normalized is not null;

create table public.reservations (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  outlet_id uuid not null references public.outlets(id), guest_id uuid not null references public.guests(id),
  booking_type public.booking_type not null, dining_area_id uuid references public.dining_areas(id),
  local_date date not null, starts_at timestamptz not null, ends_at timestamptz not null,
  guest_count integer not null check (guest_count > 0), status public.reservation_status not null default 'draft',
  source text not null, occasion text, special_requests text, internal_notes text,
  specific_table_requested boolean not null default false, confirmation_due_at timestamptz,
  assigned_owner_id uuid references public.staff_profiles(user_id), created_by uuid not null references public.staff_profiles(user_id),
  updated_by uuid not null references public.staff_profiles(user_id), arrived_at timestamptz, seated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, cancellation_reason text, no_show_at timestamptz,
  has_unresolved_conflict boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index reservations_availability_idx on public.reservations (outlet_id, local_date, starts_at, ends_at, status);
create index reservations_status_idx on public.reservations (outlet_id, status, local_date);
create index reservations_guest_idx on public.reservations (guest_id, local_date desc);

create table public.reservation_table_assignments (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
  table_id uuid references public.dining_tables(id), table_combination_id uuid references public.table_combinations(id),
  assigned_by uuid not null references public.staff_profiles(user_id), assigned_at timestamptz not null default now(),
  check ((table_id is not null)::integer + (table_combination_id is not null)::integer = 1)
);
create table public.reservation_status_history (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
  from_status public.reservation_status, to_status public.reservation_status not null,
  actor_id uuid not null references public.staff_profiles(user_id), reason text, created_at timestamptz not null default now()
);
create table public.confirmation_deadline_extensions (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
  previous_due_at timestamptz not null, new_due_at timestamptz not null, actor_id uuid not null references public.staff_profiles(user_id),
  note text, created_at timestamptz not null default now(), check (new_due_at > previous_due_at)
);
create table public.reservation_override_events (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
  conflict_details jsonb not null, actor_id uuid not null references public.staff_profiles(user_id),
  reason text not null check (length(trim(reason)) >= 8), created_at timestamptz not null default now()
);
create table public.reservation_conflicts (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
  affected_reservation_id uuid references public.reservations(id), conflict_type text not null,
  details jsonb not null default '{}', resolved_at timestamptz, resolved_by uuid references public.staff_profiles(user_id),
  resolution_note text, created_at timestamptz not null default now()
);

create table public.outlet_blackouts (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  local_date date not null, reason text not null, source_reservation_id uuid references public.reservations(id),
  active boolean not null default true, created_at timestamptz not null default now()
);
create unique index one_active_private_event_blackout on public.outlet_blackouts(outlet_id, local_date)
  where active and source_reservation_id is not null;

create table public.payment_requirements (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
  required boolean not null, rule_source text not null check (rule_source in ('large_party','vip_room','private_event','special_service_date','manual')),
  amount_due_centavos bigint check (amount_due_centavos is null or amount_due_centavos >= 0), due_at timestamptz,
  status public.payment_requirement_status not null, waived_by uuid references public.staff_profiles(user_id),
  waiver_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((status <> 'waived') or (waived_by is not null and length(trim(waiver_reason)) >= 8)),
  unique (reservation_id, rule_source)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
  amount_centavos bigint not null check (amount_centavos > 0), currency text not null default 'PHP',
  method text not null check (method in ('cash','bank_transfer','gcash','card_external','other')),
  reference_number text, received_at timestamptz not null, recorded_by uuid not null references public.staff_profiles(user_id),
  notes text, proof_storage_path text, status public.payment_status not null default 'recorded',
  voided_by uuid references public.staff_profiles(user_id), void_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((status <> 'voided') or (voided_by is not null and length(trim(void_reason)) >= 8))
);

create table public.internal_notifications (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  recipient_user_id uuid references public.staff_profiles(user_id), recipient_role public.staff_role,
  reservation_id uuid references public.reservations(id), notification_type text not null, scheduled_for timestamptz not null,
  read_at timestamptz, resolved_at timestamptz, deduplication_key text not null unique, created_at timestamptz not null default now(),
  check (recipient_user_id is not null or recipient_role is not null)
);
create index internal_notifications_due_idx on public.internal_notifications (outlet_id, scheduled_for) where resolved_at is null;
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid references public.staff_profiles(user_id),
  outlet_id uuid references public.outlets(id), entity_type text not null, entity_id uuid, action text not null,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id, created_at desc);

create or replace function public.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = public as $$
  select role from public.staff_profiles where user_id = auth.uid() and active;
$$;
create or replace function public.has_outlet_access(target_outlet uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = auth.uid() and sp.active and
      (sp.role in ('group_admin','group_manager') or exists (
        select 1 from public.staff_outlet_assignments a where a.user_id = sp.user_id and a.outlet_id = target_outlet
      ))
  );
$$;
create or replace function public.can_mutate() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() not in ('read_only'), false);
$$;
create or replace function public.can_override() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_staff_role() in ('group_admin','group_manager','outlet_manager'), false);
$$;

create or replace function public.normalize_ph_mobile(raw text) returns text language plpgsql immutable as $$
declare digits text := regexp_replace(coalesce(raw,''), '[^0-9]', '', 'g');
begin
  if left(digits,2) = '00' then digits := substr(digits,3); end if;
  if left(digits,2) = '63' then digits := substr(digits,3); end if;
  if left(digits,1) = '0' then digits := substr(digits,2); end if;
  if length(digits) = 10 and left(digits,1) = '9' then return '+63' || digits; end if;
  return null;
end $$;

create or replace function public.refresh_payment_requirement_status() returns trigger
language plpgsql security definer set search_path=public as $$
declare paid bigint;
begin
  select coalesce(sum(amount_centavos),0) into paid from public.payments where reservation_id=new.reservation_id and status='recorded';
  update public.payment_requirements set status=case
    when status in ('waived','voided') then status
    when paid=0 then 'pending'::public.payment_requirement_status
    when amount_due_centavos is null or paid>=amount_due_centavos then 'paid'::public.payment_requirement_status
    else 'partially_paid'::public.payment_requirement_status end,
    updated_at=now() where reservation_id=new.reservation_id;
  return new;
end $$;
create trigger payments_refresh_requirements after insert or update of status,amount_centavos on public.payments
for each row execute function public.refresh_payment_requirement_status();

create or replace function public.transition_reservation_status(target_reservation uuid, next_status public.reservation_status, reason text default null)
returns public.reservations language plpgsql security definer set search_path=public as $$
declare r public.reservations; allowed public.reservation_status[]; old_status public.reservation_status;
begin
  select * into r from public.reservations where id=target_reservation for update;
  if r.id is null or not public.has_outlet_access(r.outlet_id) or not public.can_mutate() then raise exception 'Not authorized'; end if;
  old_status := r.status;
  allowed := case r.status
    when 'draft' then array['temporary_hold','pending_confirmation','pending_deposit','cancelled']::public.reservation_status[]
    when 'temporary_hold' then array['pending_confirmation','pending_deposit','confirmed','expired','cancelled']::public.reservation_status[]
    when 'pending_confirmation' then array['pending_deposit','confirmed','expired','cancelled']::public.reservation_status[]
    when 'pending_deposit' then array['confirmed','expired','cancelled']::public.reservation_status[]
    when 'confirmed' then array['arrived','cancelled','no_show']::public.reservation_status[]
    when 'arrived' then array['seated','cancelled','no_show']::public.reservation_status[]
    when 'seated' then array['completed']::public.reservation_status[] else array[]::public.reservation_status[] end;
  if not (next_status=any(allowed)) then raise exception 'Invalid reservation status transition'; end if;
  if next_status='confirmed' and exists(select 1 from public.payment_requirements where reservation_id=r.id and required and status not in ('paid','waived','voided')) then
    raise exception 'Required deposit is not paid or waived';
  end if;
  if next_status in ('cancelled','no_show','expired') and length(trim(coalesce(reason,'')))<3 then raise exception 'A reason is required'; end if;
  update public.reservations set status=next_status,updated_by=auth.uid(),updated_at=now(),
    arrived_at=case when next_status='arrived' then now() else arrived_at end,
    seated_at=case when next_status='seated' then now() else seated_at end,
    completed_at=case when next_status='completed' then now() else completed_at end,
    cancelled_at=case when next_status='cancelled' then now() else cancelled_at end,
    cancellation_reason=case when next_status='cancelled' then reason else cancellation_reason end,
    no_show_at=case when next_status='no_show' then now() else no_show_at end where id=r.id returning * into r;
  insert into public.reservation_status_history(reservation_id,from_status,to_status,actor_id,reason) values(r.id,old_status,next_status,auth.uid(),reason);
  insert into public.audit_log(actor_id,outlet_id,entity_type,entity_id,action,metadata) values(auth.uid(),r.outlet_id,'reservation',r.id,'status_changed',jsonb_build_object('to',next_status,'reason',reason));
  return r;
end $$;
create or replace function public.guests_normalize() returns trigger language plpgsql as $$
begin
  new.mobile_normalized := public.normalize_ph_mobile(new.mobile_display);
  new.email_normalized := nullif(lower(trim(new.email)), '');
  new.updated_at := now(); return new;
end $$;
create trigger guests_normalize_before_write before insert or update on public.guests for each row execute function public.guests_normalize();

-- Atomic create path. Advisory locking serializes availability decisions per outlet/local date.
create or replace function public.create_reservation_atomic(payload jsonb)
returns public.reservations language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (payload->>'outlet_id')::uuid;
  v_guest uuid := (payload->>'guest_id')::uuid;
  v_area uuid := nullif(payload->>'dining_area_id','')::uuid;
  v_date date := (payload->>'local_date')::date;
  v_start timestamptz := (payload->>'starts_at')::timestamptz;
  v_end timestamptz := (payload->>'ends_at')::timestamptz;
  v_count integer := (payload->>'guest_count')::integer;
  v_type public.booking_type := (payload->>'booking_type')::public.booking_type;
  v_table uuid := nullif(payload->>'table_id','')::uuid;
  v_combo uuid := nullif(payload->>'table_combination_id','')::uuid;
  v_table_ids uuid[] := array[]::uuid[]; v_table_capacity integer;
  v_status public.reservation_status := coalesce((payload->>'status')::public.reservation_status, 'pending_confirmation');
  v_threshold integer; v_capacity integer; v_buffer integer := 0; v_min_duration integer;
  v_committed integer := 0; v_conflicts jsonb := '[]'::jsonb; v_res public.reservations;
  v_override boolean := coalesce((payload->>'override')::boolean, false); v_reason text := payload->>'override_reason';
  v_is_live boolean; v_special_deposit boolean := false; v_manual_deposit boolean := coalesce((payload->>'manual_deposit_required')::boolean,false);
  v_waiver_reason text := payload->>'deposit_waiver_reason'; v_requirement_status public.payment_requirement_status := 'pending';
begin
  if auth.uid() is null or not public.has_outlet_access(v_outlet) or not public.can_mutate() then raise exception 'Not authorized'; end if;
  if v_end <= v_start or v_count < 1 then raise exception 'Invalid reservation interval or party size'; end if;
  select large_party_threshold into v_threshold from public.outlet_policies where outlet_id = v_outlet;
  if v_type = 'regular_table' and v_count >= v_threshold then v_type := 'large_party'; end if;
  if v_type = 'large_party' and v_count < v_threshold then v_type := 'regular_table'; end if;
  select exists(select 1 from public.special_service_dates where outlet_id=v_outlet and local_date=v_date and active and deposit_required) into v_special_deposit;
  if v_status='confirmed' and (v_count>=v_threshold or v_type in ('vip_room','private_event') or v_special_deposit or v_manual_deposit) then
    if not public.can_override() or length(trim(coalesce(v_waiver_reason,''))) < 8 then raise exception 'A required deposit must be recorded before confirmation'; end if;
    v_requirement_status := 'waived';
  end if;
  v_is_live := v_status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated');
  perform pg_advisory_xact_lock(hashtextextended(v_outlet::text || ':' || v_date::text, 0));

  if v_is_live and v_type <> 'private_event' and exists (
    select 1 from public.outlet_blackouts where outlet_id = v_outlet and local_date = v_date and active
  ) then v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('type','private_event_date_closure'));
  end if;

  if v_is_live and v_type = 'private_event' then
    select coalesce(jsonb_agg(jsonb_build_object('type','existing_booking','reservation_id',id,'code',code)), '[]'::jsonb)
      into v_conflicts from public.reservations where outlet_id = v_outlet and local_date = v_date
      and status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated');
  elsif v_is_live and v_type in ('regular_table','large_party','walk_in') then
    select capacity, reset_buffer_minutes into v_capacity, v_buffer from public.dining_areas where id = v_area and outlet_id = v_outlet and resource_type = 'main_dining' and active;
    if v_capacity is null then raise exception 'Active Main Dining area is required'; end if;
    select coalesce(sum(r.guest_count),0) into v_committed from public.reservations r
      join public.dining_areas a on a.id = r.dining_area_id
      where r.outlet_id = v_outlet and r.dining_area_id = v_area
      and r.status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated')
      and r.starts_at < v_end + make_interval(mins => v_buffer)
      and v_start < r.ends_at + make_interval(mins => a.reset_buffer_minutes);
    if v_committed + v_count > v_capacity then v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('type','main_dining_capacity','capacity',v_capacity,'committed',v_committed,'requested',v_count)); end if;
    if v_table is not null and v_combo is not null then raise exception 'Choose a table or a table combination, not both'; end if;
    if v_table is not null then
      select array[id], maximum_capacity into v_table_ids, v_table_capacity from public.dining_tables where id=v_table and dining_area_id=v_area and active;
    elsif v_combo is not null then
      select array_agg(m.table_id), c.maximum_capacity into v_table_ids, v_table_capacity
      from public.table_combinations c join public.table_combination_members m on m.combination_id=c.id
      where c.id=v_combo and c.dining_area_id=v_area and c.active group by c.maximum_capacity;
    end if;
    if v_table is not null or v_combo is not null then
      if coalesce(array_length(v_table_ids,1),0)=0 or v_count > v_table_capacity then
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('type','table_capacity_or_configuration','requested',v_count,'maximum',v_table_capacity));
      elsif exists (
        select 1 from public.reservation_table_assignments x join public.reservations r on r.id=x.reservation_id
        where r.status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated')
        and r.starts_at < v_end + make_interval(mins => v_buffer) and v_start < r.ends_at + make_interval(mins => v_buffer)
        and (x.table_id = any(v_table_ids) or exists (
          select 1 from public.table_combination_members xm where xm.combination_id=x.table_combination_id and xm.table_id=any(v_table_ids)
        ))
      ) then v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('type','physical_table_overlap','table_ids',to_jsonb(v_table_ids)));
      end if;
    end if;
  elsif v_is_live and v_type = 'vip_room' then
    select capacity, reset_buffer_minutes, minimum_duration_minutes into v_capacity, v_buffer, v_min_duration
      from public.dining_areas where id = v_area and outlet_id = v_outlet and resource_type = 'private_room' and active;
    if v_capacity is null or v_count > v_capacity then v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('type','vip_capacity','capacity',v_capacity)); end if;
    if extract(epoch from (v_end-v_start))/60 < v_min_duration then v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('type','vip_minimum_duration','minutes',v_min_duration)); end if;
    if exists (select 1 from public.reservations r where r.dining_area_id = v_area and r.status in ('temporary_hold','pending_confirmation','pending_deposit','confirmed','arrived','seated') and r.starts_at < v_end + make_interval(mins => v_buffer) and v_start < r.ends_at + make_interval(mins => v_buffer))
      then v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('type','vip_overlap')); end if;
  end if;

  if jsonb_array_length(v_conflicts) > 0 and (not v_override or not public.can_override() or length(trim(coalesce(v_reason,''))) < 8) then
    raise exception using message = 'Reservation conflict', detail = v_conflicts::text, hint = 'Managers may use a dedicated override with a meaningful reason.';
  end if;

  insert into public.reservations (code,outlet_id,guest_id,booking_type,dining_area_id,local_date,starts_at,ends_at,guest_count,status,source,occasion,special_requests,internal_notes,specific_table_requested,confirmation_due_at,assigned_owner_id,created_by,updated_by,has_unresolved_conflict)
  values (coalesce(payload->>'code','WF-'||to_char(v_date,'YYMMDD')||'-'||upper(substr(gen_random_uuid()::text,1,5))),v_outlet,v_guest,v_type,v_area,v_date,v_start,v_end,v_count,v_status,payload->>'source',payload->>'occasion',payload->>'special_requests',payload->>'internal_notes',coalesce((payload->>'specific_table_requested')::boolean,false),nullif(payload->>'confirmation_due_at','')::timestamptz,nullif(payload->>'assigned_owner_id','')::uuid,auth.uid(),auth.uid(),jsonb_array_length(v_conflicts)>0)
  returning * into v_res;

  if v_type = 'private_event' and v_is_live then insert into public.outlet_blackouts(outlet_id,local_date,reason,source_reservation_id) values(v_outlet,v_date,'Whole-restaurant private event',v_res.id); end if;
  if v_table is not null or v_combo is not null then
    insert into public.reservation_table_assignments(reservation_id,table_id,table_combination_id,assigned_by)
    values(v_res.id,v_table,v_combo,auth.uid());
  end if;
  if v_count>=v_threshold then insert into public.payment_requirements(reservation_id,required,rule_source,amount_due_centavos,due_at,status,waived_by,waiver_reason) values(v_res.id,true,'large_party',nullif(payload->>'deposit_amount_centavos','')::bigint,nullif(payload->>'deposit_due_at','')::timestamptz,v_requirement_status,case when v_requirement_status='waived' then auth.uid() end,case when v_requirement_status='waived' then v_waiver_reason end); end if;
  if v_type='vip_room' then insert into public.payment_requirements(reservation_id,required,rule_source,amount_due_centavos,due_at,status,waived_by,waiver_reason) values(v_res.id,true,'vip_room',nullif(payload->>'deposit_amount_centavos','')::bigint,nullif(payload->>'deposit_due_at','')::timestamptz,v_requirement_status,case when v_requirement_status='waived' then auth.uid() end,case when v_requirement_status='waived' then v_waiver_reason end); end if;
  if v_type='private_event' then insert into public.payment_requirements(reservation_id,required,rule_source,amount_due_centavos,due_at,status,waived_by,waiver_reason) values(v_res.id,true,'private_event',nullif(payload->>'deposit_amount_centavos','')::bigint,nullif(payload->>'deposit_due_at','')::timestamptz,v_requirement_status,case when v_requirement_status='waived' then auth.uid() end,case when v_requirement_status='waived' then v_waiver_reason end); end if;
  if v_special_deposit then insert into public.payment_requirements(reservation_id,required,rule_source,amount_due_centavos,due_at,status,waived_by,waiver_reason) values(v_res.id,true,'special_service_date',nullif(payload->>'deposit_amount_centavos','')::bigint,nullif(payload->>'deposit_due_at','')::timestamptz,v_requirement_status,case when v_requirement_status='waived' then auth.uid() end,case when v_requirement_status='waived' then v_waiver_reason end); end if;
  if v_manual_deposit then insert into public.payment_requirements(reservation_id,required,rule_source,amount_due_centavos,due_at,status,waived_by,waiver_reason) values(v_res.id,true,'manual',nullif(payload->>'deposit_amount_centavos','')::bigint,nullif(payload->>'deposit_due_at','')::timestamptz,v_requirement_status,case when v_requirement_status='waived' then auth.uid() end,case when v_requirement_status='waived' then v_waiver_reason end); end if;
  if v_status in ('temporary_hold','pending_confirmation','pending_deposit') then
    if v_type='private_event' or v_count>=v_threshold then
      insert into public.internal_notifications(outlet_id,recipient_role,reservation_id,notification_type,scheduled_for,deduplication_key)
      values(v_outlet,'reservations_staff',v_res.id,'confirmation_7_day',greatest(now(),v_start-interval '7 days'),v_res.id::text||':confirmation_7_day') on conflict(deduplication_key) do nothing;
    end if;
    if v_type in ('regular_table','vip_room') then
      insert into public.internal_notifications(outlet_id,recipient_role,reservation_id,notification_type,scheduled_for,deduplication_key)
      values(v_outlet,'reservations_staff',v_res.id,'confirmation_24_hour',greatest(now(),v_start-interval '24 hours'),v_res.id::text||':confirmation_24_hour') on conflict(deduplication_key) do nothing;
    end if;
    if nullif(payload->>'confirmation_due_at','') is not null then
      insert into public.internal_notifications(outlet_id,recipient_role,reservation_id,notification_type,scheduled_for,deduplication_key)
      values(v_outlet,'reservations_staff',v_res.id,'pencil_confirmation_due',greatest(now(),(payload->>'confirmation_due_at')::timestamptz),v_res.id::text||':pencil:'||(payload->>'confirmation_due_at')) on conflict(deduplication_key) do nothing;
    end if;
  end if;
  if jsonb_array_length(v_conflicts)>0 then
    insert into public.reservation_override_events(reservation_id,conflict_details,actor_id,reason) values(v_res.id,v_conflicts,auth.uid(),v_reason);
    insert into public.reservation_conflicts(reservation_id,conflict_type,details) select v_res.id, value->>'type', value from jsonb_array_elements(v_conflicts);
  end if;
  insert into public.reservation_status_history(reservation_id,to_status,actor_id,reason) values(v_res.id,v_status,auth.uid(),'Reservation created');
  insert into public.audit_log(actor_id,outlet_id,entity_type,entity_id,action,metadata) values(auth.uid(),v_outlet,'reservation',v_res.id,'created',jsonb_build_object('status',v_status,'override',v_override));
  return v_res;
end $$;

-- RLS: outlet scope is enforced for every exposed operational table. Mutations are checked again in RPC/server actions.
alter table public.outlets enable row level security; alter table public.staff_profiles enable row level security;
alter table public.staff_outlet_assignments enable row level security; alter table public.dining_areas enable row level security;
alter table public.dining_tables enable row level security; alter table public.table_combinations enable row level security;
alter table public.table_combination_members enable row level security; alter table public.operating_hours enable row level security;
alter table public.outlet_policies enable row level security; alter table public.inquiry_sources enable row level security;
alter table public.special_service_dates enable row level security; alter table public.guests enable row level security;
alter table public.reservations enable row level security; alter table public.reservation_table_assignments enable row level security;
alter table public.reservation_status_history enable row level security; alter table public.reservation_override_events enable row level security;
alter table public.confirmation_deadline_extensions enable row level security;
alter table public.reservation_conflicts enable row level security; alter table public.outlet_blackouts enable row level security;
alter table public.payment_requirements enable row level security; alter table public.payments enable row level security;
alter table public.internal_notifications enable row level security; alter table public.audit_log enable row level security;

create policy outlets_read on public.outlets for select using (public.has_outlet_access(id));
create policy profiles_self_or_admin on public.staff_profiles for select using (user_id = auth.uid() or public.current_staff_role() in ('group_admin','group_manager'));
create policy assignments_read on public.staff_outlet_assignments for select using (user_id=auth.uid() or public.current_staff_role() in ('group_admin','group_manager'));
create policy areas_read on public.dining_areas for select using (public.has_outlet_access(outlet_id));
create policy areas_manage on public.dining_areas for all using (public.has_outlet_access(outlet_id) and public.current_staff_role() in ('group_admin','group_manager','outlet_manager')) with check (public.has_outlet_access(outlet_id));
create policy tables_read on public.dining_tables for select using (exists(select 1 from public.dining_areas a where a.id=dining_area_id and public.has_outlet_access(a.outlet_id)));
create policy combinations_read on public.table_combinations for select using (exists(select 1 from public.dining_areas a where a.id=dining_area_id and public.has_outlet_access(a.outlet_id)));
create policy combination_members_read on public.table_combination_members for select using (exists(select 1 from public.table_combinations c join public.dining_areas a on a.id=c.dining_area_id where c.id=combination_id and public.has_outlet_access(a.outlet_id)));
create policy hours_read on public.operating_hours for select using (public.has_outlet_access(outlet_id));
create policy policies_read on public.outlet_policies for select using (public.has_outlet_access(outlet_id));
create policy sources_read on public.inquiry_sources for select using (public.has_outlet_access(outlet_id));
create policy special_dates_read on public.special_service_dates for select using (public.has_outlet_access(outlet_id));
create policy guests_read on public.guests for select using (exists(select 1 from public.reservations r where r.guest_id=id and public.has_outlet_access(r.outlet_id)));
create policy reservations_read on public.reservations for select using (public.has_outlet_access(outlet_id));
create policy reservations_write on public.reservations for update using (public.has_outlet_access(outlet_id) and public.can_mutate()) with check (public.has_outlet_access(outlet_id));
create policy assignments_operational on public.reservation_table_assignments for all using (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id) and public.can_mutate())) with check (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)));
create policy status_history_read on public.reservation_status_history for select using (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)));
create policy extensions_read on public.confirmation_deadline_extensions for select using (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)));
create policy overrides_read on public.reservation_override_events for select using (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)));
create policy conflicts_read on public.reservation_conflicts for select using (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)));
create policy blackouts_read on public.outlet_blackouts for select using (public.has_outlet_access(outlet_id));
create policy requirements_read on public.payment_requirements for select using (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)));
create policy payments_read on public.payments for select using (exists(select 1 from public.reservations r where r.id=reservation_id and public.has_outlet_access(r.outlet_id)));
create policy notifications_access on public.internal_notifications for select using (public.has_outlet_access(outlet_id) and (recipient_user_id=auth.uid() or recipient_role=public.current_staff_role()));
create policy audit_read on public.audit_log for select using (outlet_id is not null and public.has_outlet_access(outlet_id));

-- Private payment proof bucket. Object paths begin with the reservation UUID.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy payment_proofs_select on storage.objects for select using (
  bucket_id='payment-proofs' and exists(
    select 1 from public.staff_profiles sp join public.reservations r on r.id::text=(storage.foldername(name))[1]
    where sp.user_id=auth.uid() and sp.active and (sp.can_view_payment_proof or sp.role in ('group_admin','group_manager','outlet_manager','reservations_staff')) and public.has_outlet_access(r.outlet_id)
  )
);
create policy payment_proofs_insert on storage.objects for insert with check (
  bucket_id='payment-proofs' and public.can_mutate() and exists(
    select 1 from public.reservations r where r.id::text=(storage.foldername(name))[1] and public.has_outlet_access(r.outlet_id)
  )
);

revoke all on function public.create_reservation_atomic(jsonb) from public;
grant execute on function public.create_reservation_atomic(jsonb) to authenticated;
revoke all on function public.transition_reservation_status(uuid,public.reservation_status,text) from public;
grant execute on function public.transition_reservation_status(uuid,public.reservation_status,text) to authenticated;
