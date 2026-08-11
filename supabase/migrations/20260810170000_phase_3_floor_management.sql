-- Phase 3: versioned floor plans and live service operations.
--
-- The floor is an operational projection over Phase 2 reservations and the
-- reservation_inventory_resources ledger.  These tables hold geometry,
-- service-run facts, and append-only events; they never replace the Phase 2
-- booking conflict rules.

create extension if not exists btree_gist;

insert into public.permissions(permission_key, description) values
  ('floor_plans.read','Read floor plan versions and layouts'),
  ('floor_plans.manage','Create and edit draft floor plans'),
  ('floor_plans.publish','Publish or archive floor plan versions'),
  ('service_runs.read','Read live service runs and floor snapshots'),
  ('service_runs.open_close','Open, reconcile, and close service runs'),
  ('floor.arrive','Check guests in on the floor'),
  ('floor.seat','Seat reservations and walk-ins'),
  ('floor.assign','Assign or reassign tables'),
  ('floor.transfer','Transfer an active table session'),
  ('floor.complete','Complete active dining sessions'),
  ('floor.clear','Clear tables after service'),
  ('floor.join_temporary','Create temporary table joins'),
  ('floor.override','Apply manager table-state overrides'),
  ('floor.correct_history','Correct or reopen historical sessions')
on conflict(permission_key) do update set description=excluded.description;

with organization_roles as (
  select r.id, r.code
  from public.roles r
  join public.organizations o on o.id=r.organization_id
  where o.slug='waterfront-group'
), bundle(role_code,permission_key) as (values
  ('organization_owner','floor_plans.read'),('organization_owner','floor_plans.manage'),('organization_owner','floor_plans.publish'),
  ('organization_owner','service_runs.read'),('organization_owner','service_runs.open_close'),('organization_owner','floor.arrive'),
  ('organization_owner','floor.seat'),('organization_owner','floor.assign'),('organization_owner','floor.transfer'),
  ('organization_owner','floor.complete'),('organization_owner','floor.clear'),('organization_owner','floor.join_temporary'),
  ('organization_owner','floor.override'),('organization_owner','floor.correct_history'),
  ('organization_admin','floor_plans.read'),('organization_admin','floor_plans.manage'),('organization_admin','floor_plans.publish'),
  ('organization_admin','service_runs.read'),('organization_admin','service_runs.open_close'),('organization_admin','floor.arrive'),
  ('organization_admin','floor.seat'),('organization_admin','floor.assign'),('organization_admin','floor.transfer'),
  ('organization_admin','floor.complete'),('organization_admin','floor.clear'),('organization_admin','floor.join_temporary'),
  ('organization_admin','floor.override'),('organization_admin','floor.correct_history'),
  ('venue_manager','floor_plans.read'),('venue_manager','floor_plans.manage'),('venue_manager','floor_plans.publish'),
  ('venue_manager','service_runs.read'),('venue_manager','service_runs.open_close'),('venue_manager','floor.arrive'),
  ('venue_manager','floor.seat'),('venue_manager','floor.assign'),('venue_manager','floor.transfer'),('venue_manager','floor.complete'),
  ('venue_manager','floor.clear'),('venue_manager','floor.join_temporary'),('venue_manager','floor.override'),('venue_manager','floor.correct_history'),
  ('host','floor_plans.read'),('host','service_runs.read'),('host','floor.arrive'),('host','floor.seat'),('host','floor.assign'),
  ('host','floor.transfer'),('host','floor.complete'),('host','floor.clear'),
  ('analyst_viewer','floor_plans.read'),('analyst_viewer','service_runs.read')
)
insert into public.role_permissions(role_id,permission_key)
select organization_roles.id,bundle.permission_key
from organization_roles join bundle on bundle.role_code=organization_roles.code
on conflict do nothing;

create table public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 120),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  current_version_id uuid,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade,
  unique (venue_id,name)
);
create index floor_plans_scope_idx on public.floor_plans(organization_id,venue_id,status,updated_at desc,id);

create table public.floor_plan_versions (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  effective_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  canvas_width numeric(8,2) not null default 1200 check (canvas_width > 0),
  canvas_height numeric(8,2) not null default 760 check (canvas_height > 0),
  validation_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_summary)='object'),
  source_version_id uuid references public.floor_plan_versions(id) on delete set null,
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_plan_id,version_number)
);
create unique index floor_plan_one_published_idx on public.floor_plan_versions(floor_plan_id) where status='published';
create index floor_plan_versions_lookup_idx on public.floor_plan_versions(floor_plan_id,status,version_number desc,id);
alter table public.floor_plans
  add constraint floor_plans_current_version_fk foreign key(current_version_id) references public.floor_plan_versions(id) on delete set null;

create table public.floor_sections (
  id uuid primary key default gen_random_uuid(),
  floor_plan_version_id uuid not null references public.floor_plan_versions(id) on delete cascade,
  code text not null check (code=lower(code) and code ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 2 and 80),
  color text not null default '#2b766c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  service_section text,
  created_at timestamptz not null default now(),
  unique(floor_plan_version_id,code)
);
create index floor_sections_version_idx on public.floor_sections(floor_plan_version_id,sort_order,id);

create table public.floor_objects (
  id uuid primary key default gen_random_uuid(),
  floor_plan_version_id uuid not null references public.floor_plan_versions(id) on delete cascade,
  section_id uuid references public.floor_sections(id) on delete set null,
  object_type text not null check (object_type in ('table','wall','bar','door','stage','planter','label','fixture')),
  table_id uuid references public.dining_tables(id) on delete restrict,
  label text check (label is null or length(trim(label)) between 1 and 120),
  x numeric(7,3) not null check (x>=0 and x<=100),
  y numeric(7,3) not null check (y>=0 and y<=100),
  width numeric(7,3) not null check (width>0 and width<=100),
  height numeric(7,3) not null check (height>0 and height<=100),
  rotation numeric(7,3) not null default 0,
  z_index integer not null default 0,
  style jsonb not null default '{}'::jsonb check (jsonb_typeof(style)='object'),
  accessible_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((object_type='table') = (table_id is not null)),
  check (object_type<>'table' or label is not null)
);
create unique index floor_objects_table_once_idx on public.floor_objects(floor_plan_version_id,table_id) where object_type='table' and table_id is not null;
create index floor_objects_version_layer_idx on public.floor_objects(floor_plan_version_id,z_index,id);
create index floor_objects_table_idx on public.floor_objects(table_id) where table_id is not null;

create table public.service_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_date date not null,
  service_period_id uuid references public.service_periods(id) on delete restrict,
  floor_plan_version_id uuid not null references public.floor_plan_versions(id) on delete restrict,
  status text not null default 'open' check (status in ('open','reconciling','closed')),
  opened_at timestamptz not null default now(),
  opened_by uuid references public.staff_profiles(user_id),
  closed_at timestamptz,
  closed_by uuid references public.staff_profiles(user_id),
  last_event_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade,
  unique(venue_id,service_date,service_period_id)
);
create index service_runs_scope_idx on public.service_runs(organization_id,venue_id,service_date,status,id);

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  service_run_id uuid not null references public.service_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  walk_in_id uuid references public.walk_ins(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  state text not null default 'planned' check (state in ('planned','active','clearing','cleared','voided')),
  party_size integer not null check (party_size>0),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  actual_arrived_at timestamptz,
  actual_seated_at timestamptz,
  actual_completed_at timestamptz,
  actual_cleared_at timestamptz,
  expected_clear_at timestamptz,
  correction_reason text,
  version bigint not null default 1 check (version>0),
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade,
  check ((reservation_id is not null)::integer + (walk_in_id is not null)::integer <= 1),
  check (planned_end_at is null or planned_start_at is null or planned_end_at>planned_start_at)
);
create unique index table_sessions_one_active_reservation_idx on public.table_sessions(service_run_id,reservation_id)
where reservation_id is not null and state in ('planned','active','clearing');
create unique index table_sessions_one_active_walkin_idx on public.table_sessions(service_run_id,walk_in_id)
where walk_in_id is not null and state in ('planned','active','clearing');
create index table_sessions_run_state_idx on public.table_sessions(service_run_id,state,updated_at desc,id);
create index table_sessions_reservation_idx on public.table_sessions(reservation_id,created_at desc,id);

create table public.table_session_tables (
  id uuid primary key default gen_random_uuid(),
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  service_run_id uuid not null references public.service_runs(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  assigned_by uuid references public.staff_profiles(user_id),
  removed_by uuid references public.staff_profiles(user_id),
  reason text,
  check (removed_at is null or removed_at>=assigned_at)
);
alter table public.table_session_tables
  add constraint table_session_tables_no_overlap
  exclude using gist(service_run_id with =,table_id with =,tstzrange(assigned_at,coalesce(removed_at,'infinity'::timestamptz),'[)') with &&);
create index table_session_tables_session_idx on public.table_session_tables(table_session_id,removed_at,id);
create index table_session_tables_table_idx on public.table_session_tables(service_run_id,table_id,removed_at,id);

create table public.arrival_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_run_id uuid references public.service_runs(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete cascade,
  table_session_id uuid references public.table_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('checked_in','partial_arrival','arrival_corrected','departed')),
  arrived_count integer not null check (arrived_count>=0),
  actor_id uuid references public.staff_profiles(user_id),
  reason text,
  created_at timestamptz not null default now(),
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade,
  check (reservation_id is not null or table_session_id is not null)
);
create index arrival_events_reservation_idx on public.arrival_events(reservation_id,created_at desc,id);
create index arrival_events_run_idx on public.arrival_events(service_run_id,created_at desc,id);

create table public.service_stage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_run_id uuid not null references public.service_runs(id) on delete cascade,
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  stage text not null check (stage in ('greeted','ordered','courses','dessert','check_presented','paid','other')),
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.staff_profiles(user_id),
  notes text,
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index service_stage_events_session_idx on public.service_stage_events(table_session_id,occurred_at desc,id);

create table public.table_state_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_run_id uuid not null references public.service_runs(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id) on delete restrict,
  override_type text not null check (override_type in ('blocked','unavailable','hold','maintenance')),
  reason text not null check (length(trim(reason))>=3),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  cleared_at timestamptz,
  cleared_by uuid references public.staff_profiles(user_id),
  created_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade,
  check (expires_at is null or expires_at>starts_at)
);
create index table_state_overrides_active_idx on public.table_state_overrides(service_run_id,table_id,starts_at,expires_at) where cleared_at is null;

create table public.floor_operation_events (
  id uuid primary key default gen_random_uuid(),
  command_id text not null unique check (length(trim(command_id)) between 8 and 160),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_run_id uuid references public.service_runs(id) on delete set null,
  actor_id uuid references public.staff_profiles(user_id),
  event_type text not null check (event_type in ('service.opened','service.closed','plan.published','arrival.recorded','reservation.assigned','reservation.reassigned','session.seated','session.transferred','session.completed','session.cleared','table.blocked','table.unblocked','session.corrected')),
  aggregate_type text not null check (aggregate_type in ('service_run','floor_plan','reservation','table_session','table')),
  aggregate_id uuid,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index floor_operation_events_run_idx on public.floor_operation_events(service_run_id,created_at desc,id);
create index floor_operation_events_aggregate_idx on public.floor_operation_events(aggregate_type,aggregate_id,created_at desc,id);

create table public.floor_outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null,
  service_run_id uuid references public.service_runs(id) on delete set null,
  event_type text not null check (event_type in ('service_run.updated','reservation.status_changed','table_session.updated','table_assignment.changed','floor_plan.published')),
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  event_key text not null unique,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  foreign key (organization_id,venue_id) references public.outlets(organization_id,id) on delete cascade
);
create index floor_outbox_pending_idx on public.floor_outbox_events(created_at,id) where published_at is null;

-- Historical operation events are immutable by design.
create or replace function private.prevent_floor_event_mutation() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
begin
  raise exception 'FLOOR_OPERATION_EVENT_IMMUTABLE';
end $$;
drop trigger if exists floor_operation_events_immutable on public.floor_operation_events;
create trigger floor_operation_events_immutable before update or delete on public.floor_operation_events
for each row execute function private.prevent_floor_event_mutation();

create or replace function private.prevent_published_floor_version_mutation() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
begin
  if old.status='published' and (new.floor_plan_id,new.version_number,new.canvas_width,new.canvas_height,new.validation_summary) is distinct from (old.floor_plan_id,old.version_number,old.canvas_width,old.canvas_height,old.validation_summary) then
    raise exception 'PUBLISHED_FLOOR_VERSION_IMMUTABLE';
  end if;
  return new;
end $$;
drop trigger if exists floor_plan_versions_immutable on public.floor_plan_versions;
create trigger floor_plan_versions_immutable before update on public.floor_plan_versions
for each row execute function private.prevent_published_floor_version_mutation();

create or replace function public.validate_floor_plan_version(target_version uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_org uuid;
  v_venue uuid;
  v_duplicate uuid[];
  v_missing uuid[];
  v_inactive uuid[];
  v_geometry jsonb;
begin
  select o.organization_id,o.id into v_org,v_venue
  from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id join public.outlets o on o.id=p.venue_id
  where v.id=target_version;
  if v_venue is null then raise exception 'FLOOR_VERSION_NOT_FOUND'; end if;
  if auth.uid() is not null and not private.has_atomic_permission('floor_plans.read',v_org,v_venue) then raise exception 'Not authorized'; end if;
  select coalesce(array_agg(table_id order by table_id),'{}'::uuid[]) into v_duplicate
  from (select fo.table_id from public.floor_objects fo where fo.floor_plan_version_id=target_version and fo.object_type='table' group by fo.table_id having count(*)>1) d;
  select coalesce(array_agg(dt.id order by dt.id),'{}'::uuid[]) into v_missing
  from public.dining_tables dt join public.dining_areas da on da.id=dt.dining_area_id
  where da.outlet_id=v_venue and da.active and dt.active and dt.staff_eligible
    and not exists(select 1 from public.floor_objects fo where fo.floor_plan_version_id=target_version and fo.object_type='table' and fo.table_id=dt.id);
  select coalesce(array_agg(fo.table_id order by fo.table_id),'{}'::uuid[]) into v_inactive
  from public.floor_objects fo left join public.dining_tables dt on dt.id=fo.table_id
  where fo.floor_plan_version_id=target_version and fo.object_type='table' and (dt.id is null or not dt.active or not exists(select 1 from public.dining_areas da where da.id=dt.dining_area_id and da.outlet_id=v_venue));
  select coalesce(jsonb_agg(jsonb_build_object('id',fo.id,'reason','out_of_bounds') order by fo.id),'[]'::jsonb) into v_geometry
  from public.floor_objects fo
  where fo.floor_plan_version_id=target_version and (fo.x<0 or fo.y<0 or fo.x+fo.width>100 or fo.y+fo.height>100);
  return jsonb_build_object(
    'versionId',target_version,
    'valid',cardinality(v_duplicate)=0 and cardinality(v_inactive)=0 and cardinality(v_missing)=0 and jsonb_array_length(v_geometry)=0,
    'duplicateTableIds',to_jsonb(v_duplicate),
    'missingTableIds',to_jsonb(v_missing),
    'inactiveTableIds',to_jsonb(v_inactive),
    'geometryErrors',v_geometry,
    'checkedAt',now()
  );
end $$;

create or replace function public.publish_floor_plan(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_plan uuid := nullif(payload->>'floor_plan_id','')::uuid;
  v_version uuid := nullif(payload->>'version_id','')::uuid;
  v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text);
  v_org uuid;
  v_venue uuid;
  v_validation jsonb;
  v_result jsonb;
begin
  select p.organization_id,p.venue_id into v_org,v_venue from public.floor_plans p where p.id=v_plan for update;
  if v_plan is null or v_org is null then raise exception 'FLOOR_PLAN_NOT_FOUND'; end if;
  if auth.uid() is not null and not private.has_atomic_permission('floor_plans.publish',v_org,v_venue) then raise exception 'Not authorized'; end if;
  select coalesce(v_version,v.current_version_id) into v_version from public.floor_plans v where v.id=v_plan;
  if v_version is null or not exists(select 1 from public.floor_plan_versions where id=v_version and floor_plan_id=v_plan and status='draft') then raise exception 'DRAFT_FLOOR_VERSION_REQUIRED'; end if;
  select public.validate_floor_plan_version(v_version) into v_validation;
  if not coalesce((v_validation->>'valid')::boolean,false) then raise exception using errcode='P0001',message='FLOOR_PLAN_INVALID',detail=v_validation::text; end if;
  if exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  update public.floor_plan_versions set status='archived',archived_at=now(),updated_at=now() where floor_plan_id=v_plan and status='published';
  update public.floor_plan_versions set status='published',published_at=now(),effective_at=coalesce((payload->>'effective_at')::timestamptz,now()),validation_summary=v_validation,updated_at=now() where id=v_version;
  update public.floor_plans set status='published',current_version_id=v_version,updated_at=now() where id=v_plan;
  v_result:=jsonb_build_object('floorPlanId',v_plan,'versionId',v_version,'status','published','validation',v_validation,'publishedAt',now());
  insert into public.floor_operation_events(command_id,organization_id,venue_id,actor_id,event_type,aggregate_type,aggregate_id,after_state) values(v_command,v_org,v_venue,auth.uid(),'plan.published','floor_plan',v_plan,v_result);
  insert into public.floor_outbox_events(organization_id,venue_id,event_type,aggregate_id,payload,event_key) values(v_org,v_venue,'floor_plan.published',v_version,jsonb_build_object('floorPlanId',v_plan,'versionId',v_version),v_command||':floor_plan.published') on conflict(event_key) do nothing;
  return v_result;
end $$;

create or replace function public.open_service_run(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_org uuid := nullif(payload->>'organization_id','')::uuid;
  v_venue uuid := nullif(payload->>'venue_id','')::uuid;
  v_date date := (payload->>'service_date')::date;
  v_period uuid := nullif(payload->>'service_period_id','')::uuid;
  v_plan_version uuid := nullif(payload->>'floor_plan_version_id','')::uuid;
  v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text);
  v_run public.service_runs;
  v_result jsonb;
begin
  if v_org is null or v_venue is null or v_date is null then raise exception 'SERVICE_RUN_DETAILS_REQUIRED'; end if;
  if auth.uid() is not null and not private.has_atomic_permission('service_runs.open_close',v_org,v_venue) then raise exception 'Not authorized'; end if;
  select * into v_run from public.service_runs where venue_id=v_venue and service_date=v_date and service_period_id is not distinct from v_period for update;
  if v_run.id is null then
    if v_plan_version is null then select p.current_version_id into v_plan_version from public.floor_plans p where p.venue_id=v_venue and p.status='published' order by p.updated_at desc limit 1; end if;
    if v_plan_version is null or not exists(select 1 from public.floor_plan_versions where id=v_plan_version and status='published') then raise exception 'PUBLISHED_FLOOR_VERSION_REQUIRED'; end if;
    insert into public.service_runs(organization_id,venue_id,service_date,service_period_id,floor_plan_version_id,opened_by,last_event_at) values(v_org,v_venue,v_date,v_period,v_plan_version,auth.uid(),now()) returning * into v_run;
  elsif v_plan_version is not null and v_run.floor_plan_version_id<>v_plan_version and v_run.status='open' then
    update public.service_runs set floor_plan_version_id=v_plan_version,version=version+1,updated_at=now() where id=v_run.id returning * into v_run;
  end if;
  if exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  v_result:=jsonb_build_object('serviceRunId',v_run.id,'venueId',v_run.venue_id,'serviceDate',v_run.service_date,'servicePeriodId',v_run.service_period_id,'floorPlanVersionId',v_run.floor_plan_version_id,'status',v_run.status,'version',v_run.version);
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,after_state) values(v_command,v_org,v_venue,v_run.id,auth.uid(),'service.opened','service_run',v_run.id,v_result);
  update public.service_runs set last_event_at=now(),updated_at=now() where id=v_run.id;
  insert into public.floor_outbox_events(organization_id,venue_id,service_run_id,event_type,aggregate_id,payload,event_key) values(v_org,v_venue,v_run.id,'service_run.updated',v_run.id,v_result,v_command||':service_run.updated') on conflict(event_key) do nothing;
  return v_result;
end $$;

create or replace function public.close_service_run(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_run public.service_runs;
  v_org uuid;
  v_venue uuid;
  v_force boolean := coalesce((payload->>'force')::boolean,false);
  v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text);
  v_open uuid[];
  v_result jsonb;
begin
  select * into v_run from public.service_runs where id=nullif(payload->>'service_run_id','')::uuid for update;
  if v_run.id is null then raise exception 'SERVICE_RUN_NOT_FOUND'; end if;
  v_org:=v_run.organization_id; v_venue:=v_run.venue_id;
  if auth.uid() is not null and not private.has_atomic_permission('service_runs.open_close',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_open from public.table_sessions where service_run_id=v_run.id and state in ('planned','active','clearing');
  if cardinality(v_open)>0 and not v_force then
    update public.service_runs set status='reconciling',version=version+1,updated_at=now() where id=v_run.id returning * into v_run;
    return jsonb_build_object('serviceRunId',v_run.id,'status',v_run.status,'requiresReconciliation',true,'openSessionIds',to_jsonb(v_open));
  end if;
  update public.service_runs set status='closed',closed_at=now(),closed_by=auth.uid(),version=version+1,updated_at=now() where id=v_run.id returning * into v_run;
  v_result:=jsonb_build_object('serviceRunId',v_run.id,'status',v_run.status,'closedAt',v_run.closed_at,'openSessionIds',to_jsonb(v_open));
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,after_state) values(v_command,v_org,v_venue,v_run.id,auth.uid(),'service.closed','service_run',v_run.id,v_result);
  insert into public.floor_outbox_events(organization_id,venue_id,service_run_id,event_type,aggregate_id,payload,event_key) values(v_org,v_venue,v_run.id,'service_run.updated',v_run.id,v_result,v_command||':service_run.updated') on conflict(event_key) do nothing;
  return v_result;
end $$;

create or replace function public.assign_floor_reservation(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_res public.reservations;
  v_run public.service_runs;
  v_org uuid; v_venue uuid;
  v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text);
  v_table_ids uuid[]; v_table_id uuid; v_old jsonb; v_result jsonb;
  v_combination uuid := nullif(payload->>'combination_id','')::uuid;
  v_existing_count integer;
begin
  select * into v_res from public.reservations where id=nullif(payload->>'reservation_id','')::uuid for update;
  if v_res.id is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  select * into v_run from public.service_runs where id=nullif(payload->>'service_run_id','')::uuid and venue_id=v_res.outlet_id for update;
  if v_run.id is null then raise exception 'SERVICE_RUN_NOT_FOUND'; end if;
  v_org:=v_res.organization_id; v_venue:=v_res.outlet_id;
  if auth.uid() is not null and not private.has_atomic_permission('floor.assign',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.table_sessions where service_run_id=v_run.id and reservation_id=v_res.id and state='active') then raise exception 'TRANSFER_ACTIVE_SESSION'; end if;
  if exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  if v_combination is not null then
    select array_agg(m.table_id order by m.table_id) into v_table_ids
    from public.table_combination_members m join public.table_combinations c on c.id=m.combination_id
    join public.dining_areas da on da.id=c.dining_area_id
    where c.id=v_combination and c.active and da.outlet_id=v_venue;
  else
    select array_agg(value::uuid order by value::uuid) into v_table_ids from jsonb_array_elements_text(coalesce(payload->'table_ids','[]'::jsonb));
  end if;
  if coalesce(array_length(v_table_ids,1),0)=0 then raise exception 'TABLE_ASSIGNMENT_REQUIRED'; end if;
  if array_length(v_table_ids,1)>1 and v_combination is null and auth.uid() is not null and not private.has_atomic_permission('floor.join_temporary',v_org,v_venue) then raise exception 'COMBINATION_REQUIRED'; end if;
  select count(*) into v_existing_count from public.dining_tables dt join public.dining_areas da on da.id=dt.dining_area_id where dt.id=any(v_table_ids) and da.outlet_id=v_venue and dt.active and dt.staff_eligible;
  if v_existing_count<>coalesce(array_length(v_table_ids,1),0) then raise exception 'TABLE_NOT_AVAILABLE'; end if;
  select sum(dt.maximum_capacity)::integer into v_existing_count from public.dining_tables dt where dt.id=any(v_table_ids);
  if coalesce(v_existing_count,0)<v_res.guest_count then raise exception 'TABLE_CAPACITY_TOO_SMALL'; end if;
  perform dt.id from public.dining_tables dt where dt.id=any(v_table_ids) order by dt.id for update;
  if exists(select 1 from public.inventory_blocks b where b.active and b.venue_id=v_venue and b.starts_at<v_res.ends_at and v_res.starts_at<b.ends_at and (b.table_id=any(v_table_ids) or b.dining_area_id in (select dt.dining_area_id from public.dining_tables dt where dt.id=any(v_table_ids)))) then raise exception 'TABLE_BLOCKED'; end if;
  select coalesce(jsonb_agg(r.table_id order by r.table_id),'[]'::jsonb) into v_old from public.reservation_inventory_resources r where r.reservation_id=v_res.id and r.resource_state='active';
  update public.reservation_inventory_resources set resource_state='released' where reservation_id=v_res.id and resource_state='active';
  delete from public.reservation_table_assignments where reservation_id=v_res.id;
  foreach v_table_id in array v_table_ids loop
    insert into public.reservation_inventory_resources(organization_id,venue_id,table_id,reservation_id,starts_at,ends_at,resource_state,assignment_source,configuration_version) values(v_org,v_venue,v_table_id,v_res.id,v_res.starts_at,v_res.ends_at,'active','manual',v_res.configuration_version);
    insert into public.reservation_table_assignments(reservation_id,table_id,assigned_by) values(v_res.id,v_table_id,auth.uid());
  end loop;
  v_result:=jsonb_build_object('reservationId',v_res.id,'serviceRunId',v_run.id,'oldTableIds',v_old,'tableIds',to_jsonb(v_table_ids),'combinationId',v_combination,'assignedAt',now());
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,before_state,after_state,reason) values(v_command,v_org,v_venue,v_run.id,auth.uid(),case when v_old='[]'::jsonb then 'reservation.assigned' else 'reservation.reassigned' end,'reservation',v_res.id,jsonb_build_object('tableIds',v_old),v_result,nullif(payload->>'reason',''));
  update public.service_runs set version=version+1,last_event_at=now(),updated_at=now() where id=v_run.id;
  insert into public.floor_outbox_events(organization_id,venue_id,service_run_id,event_type,aggregate_id,payload,event_key) values(v_org,v_venue,v_run.id,'table_assignment.changed',v_res.id,v_result,v_command||':table_assignment.changed') on conflict(event_key) do nothing;
  return v_result;
exception when exclusion_violation then raise exception using errcode='P0001',message='TABLE_CONFLICT';
end $$;

create or replace function public.record_floor_arrival(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_res public.reservations;
  v_run public.service_runs;
  v_org uuid;
  v_venue uuid;
  v_count integer := (payload->>'arrived_count')::integer;
  v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text);
  v_type text;
  v_result jsonb;
begin
  select * into v_res from public.reservations where id=nullif(payload->>'reservation_id','')::uuid for update;
  if v_res.id is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  select * into v_run from public.service_runs where id=nullif(payload->>'service_run_id','')::uuid and venue_id=v_res.outlet_id for update;
  if v_run.id is null then raise exception 'SERVICE_RUN_NOT_FOUND'; end if;
  v_org:=v_res.organization_id; v_venue:=v_res.outlet_id;
  if auth.uid() is not null and not private.has_atomic_permission('floor.arrive',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if v_count is null or v_count<1 or v_count>v_res.guest_count then raise exception 'ARRIVAL_COUNT_OUT_OF_RANGE'; end if;
  if v_res.status not in ('confirmed','arrived') then raise exception 'RESERVATION_NOT_READY_FOR_ARRIVAL'; end if;
  if exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  if v_res.status='confirmed' then perform public.transition_reservation_status_v2(v_res.id,'arrived',null); end if;
  v_type:=case when v_count=v_res.guest_count then 'checked_in' else 'partial_arrival' end;
  insert into public.arrival_events(organization_id,venue_id,service_run_id,reservation_id,event_type,arrived_count,actor_id,reason) values(v_org,v_venue,v_run.id,v_res.id,v_type,v_count,auth.uid(),nullif(payload->>'reason',''));
  v_result:=jsonb_build_object('reservationId',v_res.id,'serviceRunId',v_run.id,'arrivedCount',v_count,'partySize',v_res.guest_count,'eventType',v_type,'recordedAt',now());
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,after_state) values(v_command,v_org,v_venue,v_run.id,auth.uid(),'arrival.recorded','reservation',v_res.id,v_result);
  update public.service_runs set version=version+1,last_event_at=now(),updated_at=now() where id=v_run.id;
  return v_result;
end $$;

create or replace function public.seat_floor_reservation(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_res public.reservations;
  v_run public.service_runs;
  v_session public.table_sessions;
  v_org uuid;
  v_venue uuid;
  v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text);
  v_table_ids uuid[];
  v_table_id uuid;
  v_result jsonb;
begin
  select * into v_res from public.reservations where id=nullif(payload->>'reservation_id','')::uuid for update;
  if v_res.id is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  select * into v_run from public.service_runs where id=nullif(payload->>'service_run_id','')::uuid and venue_id=v_res.outlet_id for update;
  if v_run.id is null then raise exception 'SERVICE_RUN_NOT_FOUND'; end if;
  v_org:=v_res.organization_id; v_venue:=v_res.outlet_id;
  if auth.uid() is not null and not private.has_atomic_permission('floor.seat',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  if v_res.status not in ('arrived','confirmed') then raise exception 'RESERVATION_NOT_READY_TO_SEAT'; end if;
  select array_agg(r.table_id order by r.table_id) into v_table_ids from public.reservation_inventory_resources r where r.reservation_id=v_res.id and r.resource_state='active';
  if coalesce(array_length(v_table_ids,1),0)=0 then raise exception 'TABLE_ASSIGNMENT_REQUIRED'; end if;
  select * into v_session from public.table_sessions where service_run_id=v_run.id and reservation_id=v_res.id and state in ('planned','active','clearing') for update;
  if v_session.id is null then
    insert into public.table_sessions(service_run_id,organization_id,venue_id,reservation_id,guest_id,state,party_size,planned_start_at,planned_end_at,actual_arrived_at,actual_seated_at,expected_clear_at,created_by)
    values(v_run.id,v_org,v_venue,v_res.id,v_res.guest_id,'active',v_res.guest_count,v_res.starts_at,v_res.ends_at,coalesce(v_res.arrived_at,now()),now(),v_res.ends_at,auth.uid()) returning * into v_session;
    foreach v_table_id in array v_table_ids loop
      insert into public.table_session_tables(table_session_id,service_run_id,table_id,assigned_by) values(v_session.id,v_run.id,v_table_id,auth.uid());
    end loop;
    if v_res.status='confirmed' then perform public.transition_reservation_status_v2(v_res.id,'arrived',null); end if;
    perform public.transition_reservation_status_v2(v_res.id,'seated',null);
  end if;
  v_result:=jsonb_build_object('sessionId',v_session.id,'reservationId',v_res.id,'serviceRunId',v_run.id,'state','active','tableIds',to_jsonb(v_table_ids),'seatedAt',coalesce(v_session.actual_seated_at,now()),'expectedClearAt',v_res.ends_at);
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,after_state) values(v_command,v_org,v_venue,v_run.id,auth.uid(),'session.seated','table_session',v_session.id,v_result);
  update public.service_runs set version=version+1,last_event_at=now(),updated_at=now() where id=v_run.id;
  insert into public.floor_outbox_events(organization_id,venue_id,service_run_id,event_type,aggregate_id,payload,event_key) values(v_org,v_venue,v_run.id,'table_session.updated',v_session.id,v_result,v_command||':table_session.updated') on conflict(event_key) do nothing;
  return v_result;
exception when exclusion_violation then raise exception using errcode='P0001',message='TABLE_CONFLICT';
end $$;

create or replace function public.transfer_floor_session(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_session public.table_sessions;
  v_run public.service_runs;
  v_res public.reservations;
  v_org uuid; v_venue uuid;
  v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text);
  v_table_ids uuid[]; v_table_id uuid; v_old jsonb; v_result jsonb;
begin
  select * into v_session from public.table_sessions where id=nullif(payload->>'table_session_id','')::uuid for update;
  if v_session.id is not null and exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  if v_session.id is null or v_session.state<>'active' then raise exception 'ACTIVE_SESSION_REQUIRED'; end if;
  select * into v_run from public.service_runs where id=v_session.service_run_id for update;
  v_org:=v_session.organization_id; v_venue:=v_session.venue_id;
  if auth.uid() is not null and not private.has_atomic_permission('floor.transfer',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if v_session.reservation_id is null then raise exception 'RESERVATION_ASSIGNMENT_REQUIRED'; end if;
  select * into v_res from public.reservations where id=v_session.reservation_id for update;
  select array_agg(value::uuid order by value::uuid) into v_table_ids from jsonb_array_elements_text(coalesce(payload->'table_ids','[]'::jsonb));
  if coalesce(array_length(v_table_ids,1),0)=0 then raise exception 'TABLE_ASSIGNMENT_REQUIRED'; end if;
  select coalesce(jsonb_agg(table_id order by table_id),'[]'::jsonb) into v_old from public.table_session_tables where table_session_id=v_session.id and removed_at is null;
  update public.table_session_tables set removed_at=now(),removed_by=auth.uid(),reason=nullif(payload->>'reason','') where table_session_id=v_session.id and removed_at is null;
  update public.reservation_inventory_resources set resource_state='released' where reservation_id=v_res.id and resource_state='active';
  foreach v_table_id in array v_table_ids loop
    if not exists(select 1 from public.dining_tables dt join public.dining_areas da on da.id=dt.dining_area_id where dt.id=v_table_id and da.outlet_id=v_venue and dt.active and dt.staff_eligible) then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.inventory_blocks b where b.active and b.venue_id=v_venue and b.starts_at<v_res.ends_at and v_res.starts_at<b.ends_at and b.table_id=v_table_id) then raise exception 'TABLE_BLOCKED'; end if;
    insert into public.reservation_inventory_resources(organization_id,venue_id,table_id,reservation_id,starts_at,ends_at,resource_state,assignment_source,configuration_version) values(v_org,v_venue,v_table_id,v_res.id,v_res.starts_at,v_res.ends_at,'active','manual',v_res.configuration_version);
    insert into public.table_session_tables(table_session_id,service_run_id,table_id,assigned_by,reason) values(v_session.id,v_run.id,v_table_id,auth.uid(),nullif(payload->>'reason',''));
  end loop;
  update public.table_sessions set version=version+1,updated_at=now() where id=v_session.id returning * into v_session;
  v_result:=jsonb_build_object('sessionId',v_session.id,'reservationId',v_res.id,'serviceRunId',v_run.id,'state',v_session.state,'oldTableIds',v_old,'tableIds',to_jsonb(v_table_ids),'reason',nullif(payload->>'reason',''),'transferredAt',now());
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,before_state,after_state,reason) values(v_command,v_org,v_venue,v_run.id,auth.uid(),'session.transferred','table_session',v_session.id,jsonb_build_object('tableIds',v_old),v_result,nullif(payload->>'reason',''));
  update public.service_runs set version=version+1,last_event_at=now(),updated_at=now() where id=v_run.id;
  return v_result;
exception when exclusion_violation then raise exception using errcode='P0001',message='TABLE_CONFLICT';
end $$;

create or replace function public.complete_floor_session(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_session public.table_sessions; v_res public.reservations; v_org uuid; v_venue uuid; v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text); v_result jsonb;
begin
  select * into v_session from public.table_sessions where id=nullif(payload->>'table_session_id','')::uuid for update;
  if v_session.id is null or v_session.state<>'active' then raise exception 'ACTIVE_SESSION_REQUIRED'; end if;
  v_org:=v_session.organization_id; v_venue:=v_session.venue_id;
  if auth.uid() is not null and not private.has_atomic_permission('floor.complete',v_org,v_venue) then raise exception 'Not authorized'; end if;
  update public.table_sessions set state='clearing',actual_completed_at=now(),version=version+1,updated_at=now() where id=v_session.id returning * into v_session;
  if v_session.reservation_id is not null then select * into v_res from public.reservations where id=v_session.reservation_id for update; if v_res.status='seated' then perform public.transition_reservation_status_v2(v_res.id,'completed',null); end if; end if;
  v_result:=jsonb_build_object('sessionId',v_session.id,'reservationId',v_session.reservation_id,'serviceRunId',v_session.service_run_id,'state','clearing','completedAt',v_session.actual_completed_at);
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,after_state) values(v_command,v_org,v_venue,v_session.service_run_id,auth.uid(),'session.completed','table_session',v_session.id,v_result);
  update public.service_runs set version=version+1,last_event_at=now(),updated_at=now() where id=v_session.service_run_id;
  return v_result;
end $$;

create or replace function public.clear_floor_session(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_session public.table_sessions; v_org uuid; v_venue uuid; v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text); v_result jsonb;
begin
  select * into v_session from public.table_sessions where id=nullif(payload->>'table_session_id','')::uuid for update;
  if v_session.id is not null and exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  if v_session.id is null or v_session.state not in ('active','clearing') then raise exception 'SESSION_NOT_READY_TO_CLEAR'; end if;
  v_org:=v_session.organization_id; v_venue:=v_session.venue_id;
  if auth.uid() is not null and not private.has_atomic_permission('floor.clear',v_org,v_venue) then raise exception 'Not authorized'; end if;
  update public.table_sessions set state='cleared',actual_cleared_at=now(),version=version+1,updated_at=now() where id=v_session.id returning * into v_session;
  update public.table_session_tables set removed_at=coalesce(removed_at,now()),removed_by=auth.uid() where table_session_id=v_session.id and removed_at is null;
  v_result:=jsonb_build_object('sessionId',v_session.id,'reservationId',v_session.reservation_id,'serviceRunId',v_session.service_run_id,'state','cleared','clearedAt',v_session.actual_cleared_at);
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,after_state) values(v_command,v_org,v_venue,v_session.service_run_id,auth.uid(),'session.cleared','table_session',v_session.id,v_result);
  update public.service_runs set version=version+1,last_event_at=now(),updated_at=now() where id=v_session.service_run_id;
  return v_result;
end $$;

create or replace function public.block_floor_table(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_org uuid := nullif(payload->>'organization_id','')::uuid; v_venue uuid := nullif(payload->>'venue_id','')::uuid; v_run uuid := nullif(payload->>'service_run_id','')::uuid; v_table uuid := nullif(payload->>'table_id','')::uuid; v_command text := coalesce(nullif(payload->>'command_id',''),gen_random_uuid()::text); v_result jsonb; v_block public.table_state_overrides;
begin
  if auth.uid() is not null and not private.has_atomic_permission('floor.override',v_org,v_venue) then raise exception 'Not authorized'; end if;
  if length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'A reason is required'; end if;
  if exists(select 1 from public.floor_operation_events where command_id=v_command) then select after_state into v_result from public.floor_operation_events where command_id=v_command; return v_result; end if;
  insert into public.table_state_overrides(organization_id,venue_id,service_run_id,table_id,override_type,reason,starts_at,expires_at,created_by) values(v_org,v_venue,v_run,v_table,coalesce(nullif(payload->>'override_type',''),'blocked'),trim(payload->>'reason'),coalesce((payload->>'starts_at')::timestamptz,now()),(payload->>'expires_at')::timestamptz,auth.uid()) returning * into v_block;
  v_result:=jsonb_build_object('overrideId',v_block.id,'serviceRunId',v_run,'tableId',v_table,'type',v_block.override_type,'reason',v_block.reason,'expiresAt',v_block.expires_at);
  insert into public.floor_operation_events(command_id,organization_id,venue_id,service_run_id,actor_id,event_type,aggregate_type,aggregate_id,after_state,reason) values(v_command,v_org,v_venue,v_run,auth.uid(),'table.blocked','table',v_table,v_result,v_block.reason);
  return v_result;
end $$;

-- Seed the published Waterfront reference plan from the physical table
-- inventory.  The geometry is plan-relative (0â€“100), so it scales on tablets.
with positions(code,x,y,w,h,rotation,zone) as (values
  ('T1-01',11,16,6.5,9,0,'left_dining'),('T1-02',22,16,6.5,9,0,'left_dining'),('T1-03',33,16,6.5,9,0,'left_dining'),('T1-04',43,16,6.5,9,0,'left_dining'),
  ('T1-05',19,33,6.5,9,0,'left_dining'),('T1-06',29,33,6.5,9,0,'left_dining'),('T1-07',19,50,6.5,9,0,'left_dining'),('T1-08',29,50,6.5,9,0,'left_dining'),('T1-09',43,39,6.5,9,90,'left_dining'),
  ('T2-01',11,32,8,13,0,'left_dining'),('T2-02',11,48,8,13,0,'left_dining'),('T2-03',11,65,8,13,0,'left_dining'),('T2-04',35,32,8,13,0,'left_dining'),('T2-05',35,48,8,13,0,'left_dining'),('T2-06',35,65,8,13,0,'left_dining'),
  ('T2-07',51,25,8,13,0,'center_dining'),('T2-08',62,25,8,13,0,'center_dining'),('T2-09',51,44,8,13,0,'center_dining'),('T2-10',62,44,8,13,0,'center_dining'),('T2-11',51,64,8,13,0,'center_dining'),('T2-12',62,64,8,13,0,'center_dining'),
  ('T2-13',75,55,8,13,90,'right_dining'),('T2-14',84,55,8,13,90,'right_dining'),('T2-15',92,55,8,13,90,'right_dining'),('T2-16',75,76,8,13,0,'right_dining'),('T2-17',84,76,8,13,0,'right_dining'),('T2-18',93,76,8,13,0,'right_dining'),
  ('T3-01',74,20,7.5,10,45,'right_dining'),('T3-02',85,20,7.5,10,45,'right_dining'),('T3-03',74,36,7.5,10,45,'right_dining'),('T3-04',85,36,7.5,10,45,'right_dining')
)
update public.dining_tables dt set position_x=p.x,position_y=p.y,floor_width=p.w,floor_height=p.h,rotation_degrees=p.rotation,floor_zone=p.zone,updated_at=now()
from positions p, public.dining_areas da, public.outlets o
where o.slug='waterfront-seafood-cocktails' and o.id=da.outlet_id and da.id=dt.dining_area_id and dt.code=p.code;

with venues as (
  select o.organization_id,o.id venue_id
  from public.outlets o
  where o.active and exists(select 1 from public.dining_areas da join public.dining_tables dt on dt.dining_area_id=da.id where da.outlet_id=o.id and da.active and dt.active)
), plans as (
  insert into public.floor_plans(organization_id,venue_id,name,status)
  select organization_id,venue_id,'Main Dining Â· Waterfront Reference','draft' from venues
  on conflict(venue_id,name) do update set updated_at=now()
  returning id,organization_id,venue_id
), existing_plans as (
  select p.id,p.organization_id,p.venue_id from plans p
  union all
  select p.id,p.organization_id,p.venue_id from public.floor_plans p join venues v on v.venue_id=p.venue_id where not exists(select 1 from plans x where x.id=p.id) and p.name='Main Dining Â· Waterfront Reference'
), versions as (
  insert into public.floor_plan_versions(floor_plan_id,version_number,status,effective_at,published_at,validation_summary)
  select p.id,1,'draft',null,null,'{}'::jsonb from existing_plans p
  where not exists(select 1 from public.floor_plan_versions v where v.floor_plan_id=p.id and v.version_number=1)
  returning id,floor_plan_id
)
select 1;

insert into public.floor_sections(floor_plan_version_id,code,name,color,sort_order,service_section)
select v.id,'main','Main Dining','#2b766c',0,'main_dining'
from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id
where v.version_number=1 and p.name='Main Dining Â· Waterfront Reference'
on conflict(floor_plan_version_id,code) do nothing;

insert into public.floor_objects(floor_plan_version_id,section_id,object_type,table_id,label,x,y,width,height,rotation,z_index,style,accessible_label)
select v.id,s.id,'table',dt.id,dt.code,coalesce(dt.position_x,5),coalesce(dt.position_y,5),coalesce(dt.floor_width,8),coalesce(dt.floor_height,10),coalesce(dt.rotation_degrees,0),10,
       jsonb_build_object('tableType',coalesce(dt.table_type,'custom'),'seatCapacity',dt.maximum_capacity,'zone',coalesce(dt.floor_zone,'main_dining')),
       dt.code||' Â· '||dt.maximum_capacity||' seats'
from public.floor_plan_versions v
join public.floor_plans p on p.id=v.floor_plan_id
join public.floor_sections s on s.floor_plan_version_id=v.id and s.code='main'
join public.dining_areas da on da.outlet_id=p.venue_id and da.active
join public.dining_tables dt on dt.dining_area_id=da.id and dt.active
where v.version_number=1 and p.name='Main Dining Â· Waterfront Reference'
on conflict(floor_plan_version_id,table_id) where object_type='table' and table_id is not null do update set x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height,rotation=excluded.rotation,label=excluded.label,style=excluded.style,accessible_label=excluded.accessible_label,updated_at=now();

insert into public.floor_objects(floor_plan_version_id,object_type,label,x,y,width,height,rotation,z_index,style,accessible_label)
select v.id,obj.object_type,obj.label,obj.x,obj.y,obj.width,obj.height,obj.rotation,obj.z_index,obj.style,obj.accessible_label
from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id
cross join (values
  ('bar','Cocktail bar Â· 8 stools',7::numeric,88::numeric,31::numeric,9::numeric,0::numeric,2,'{"tone":"dark"}'::jsonb,'Cocktail bar'),
  ('door','Main entrance',44::numeric,94::numeric,10::numeric,4::numeric,0::numeric,3,'{"tone":"muted"}'::jsonb,'Main entrance'),
  ('label','River windows',5::numeric,4::numeric,90::numeric,3::numeric,0::numeric,1,'{"tone":"muted","uppercase":true}'::jsonb,'River windows')
) as obj(object_type,label,x,y,width,height,rotation,z_index,style,accessible_label)
where v.version_number=1 and p.name='Main Dining Â· Waterfront Reference'
  and not exists(select 1 from public.floor_objects fo where fo.floor_plan_version_id=v.id and fo.object_type=obj.object_type and fo.label=obj.label);

update public.floor_plan_versions v set validation_summary=public.validate_floor_plan_version(v.id),status='published',published_at=coalesce(v.published_at,now()),effective_at=coalesce(v.effective_at,now()),updated_at=now()
where v.version_number=1;
update public.floor_plans p set status='published',current_version_id=(select v.id from public.floor_plan_versions v where v.floor_plan_id=p.id and v.version_number=1),updated_at=now()
where p.name='Main Dining Â· Waterfront Reference';

alter table public.floor_plans enable row level security;
alter table public.floor_plan_versions enable row level security;
alter table public.floor_sections enable row level security;
alter table public.floor_objects enable row level security;
alter table public.service_runs enable row level security;
alter table public.table_sessions enable row level security;
alter table public.table_session_tables enable row level security;
alter table public.arrival_events enable row level security;
alter table public.service_stage_events enable row level security;
alter table public.table_state_overrides enable row level security;
alter table public.floor_operation_events enable row level security;
alter table public.floor_outbox_events enable row level security;

create policy floor_plans_read on public.floor_plans for select to authenticated using (private.has_atomic_permission('floor_plans.read',organization_id,venue_id));
create policy floor_plans_manage on public.floor_plans for all to authenticated using (private.has_atomic_permission('floor_plans.manage',organization_id,venue_id)) with check (private.has_atomic_permission('floor_plans.manage',organization_id,venue_id));
create policy floor_versions_read on public.floor_plan_versions for select to authenticated using (exists(select 1 from public.floor_plans p where p.id=floor_plan_id and private.has_atomic_permission('floor_plans.read',p.organization_id,p.venue_id)));
create policy floor_versions_manage on public.floor_plan_versions for all to authenticated using (exists(select 1 from public.floor_plans p where p.id=floor_plan_id and private.has_atomic_permission('floor_plans.manage',p.organization_id,p.venue_id))) with check (exists(select 1 from public.floor_plans p where p.id=floor_plan_id and private.has_atomic_permission('floor_plans.manage',p.organization_id,p.venue_id)));
create policy floor_sections_read on public.floor_sections for select to authenticated using (exists(select 1 from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id where v.id=floor_plan_version_id and private.has_atomic_permission('floor_plans.read',p.organization_id,p.venue_id)));
create policy floor_sections_manage on public.floor_sections for all to authenticated using (exists(select 1 from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id where v.id=floor_plan_version_id and private.has_atomic_permission('floor_plans.manage',p.organization_id,p.venue_id))) with check (exists(select 1 from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id where v.id=floor_plan_version_id and private.has_atomic_permission('floor_plans.manage',p.organization_id,p.venue_id)));
create policy floor_objects_read on public.floor_objects for select to authenticated using (exists(select 1 from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id where v.id=floor_plan_version_id and private.has_atomic_permission('floor_plans.read',p.organization_id,p.venue_id)));
create policy floor_objects_manage on public.floor_objects for all to authenticated using (exists(select 1 from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id where v.id=floor_plan_version_id and private.has_atomic_permission('floor_plans.manage',p.organization_id,p.venue_id))) with check (exists(select 1 from public.floor_plan_versions v join public.floor_plans p on p.id=v.floor_plan_id where v.id=floor_plan_version_id and private.has_atomic_permission('floor_plans.manage',p.organization_id,p.venue_id)));
create policy service_runs_read on public.service_runs for select to authenticated using (private.has_atomic_permission('service_runs.read',organization_id,venue_id));
create policy service_runs_manage on public.service_runs for all to authenticated using (private.has_atomic_permission('service_runs.open_close',organization_id,venue_id)) with check (private.has_atomic_permission('service_runs.open_close',organization_id,venue_id));
create policy table_sessions_read on public.table_sessions for select to authenticated using (private.has_atomic_permission('service_runs.read',organization_id,venue_id));
create policy table_session_tables_read on public.table_session_tables for select to authenticated using (exists(select 1 from public.table_sessions s where s.id=table_session_id and private.has_atomic_permission('service_runs.read',s.organization_id,s.venue_id)));
create policy arrival_events_read on public.arrival_events for select to authenticated using (private.has_atomic_permission('service_runs.read',organization_id,venue_id));
create policy service_stage_events_read on public.service_stage_events for select to authenticated using (private.has_atomic_permission('service_runs.read',organization_id,venue_id));
create policy table_state_overrides_read on public.table_state_overrides for select to authenticated using (private.has_atomic_permission('service_runs.read',organization_id,venue_id));
create policy table_state_overrides_manage on public.table_state_overrides for all to authenticated using (private.has_atomic_permission('floor.override',organization_id,venue_id)) with check (private.has_atomic_permission('floor.override',organization_id,venue_id));
create policy floor_operation_events_read on public.floor_operation_events for select to authenticated using (private.has_atomic_permission('audit.read',organization_id,venue_id));
create policy floor_outbox_events_read on public.floor_outbox_events for select to authenticated using (private.has_atomic_permission('service_runs.read',organization_id,venue_id));

revoke all on public.floor_plans,public.floor_plan_versions,public.floor_sections,public.floor_objects,public.service_runs,public.table_sessions,public.table_session_tables,public.arrival_events,public.service_stage_events,public.table_state_overrides,public.floor_operation_events,public.floor_outbox_events from anon;
grant select on public.floor_plans,public.floor_plan_versions,public.floor_sections,public.floor_objects,public.service_runs,public.table_sessions,public.table_session_tables,public.arrival_events,public.service_stage_events,public.table_state_overrides,public.floor_operation_events,public.floor_outbox_events to authenticated;
grant all on public.floor_plans,public.floor_plan_versions,public.floor_sections,public.floor_objects,public.service_runs,public.table_sessions,public.table_session_tables,public.arrival_events,public.service_stage_events,public.table_state_overrides,public.floor_operation_events,public.floor_outbox_events to service_role;
revoke execute on function public.validate_floor_plan_version(uuid),public.publish_floor_plan(jsonb),public.open_service_run(jsonb),public.close_service_run(jsonb),public.assign_floor_reservation(jsonb),public.record_floor_arrival(jsonb),public.seat_floor_reservation(jsonb),public.transfer_floor_session(jsonb),public.complete_floor_session(jsonb),public.clear_floor_session(jsonb),public.block_floor_table(jsonb) from public,anon;
grant execute on function public.validate_floor_plan_version(uuid),public.publish_floor_plan(jsonb),public.open_service_run(jsonb),public.close_service_run(jsonb),public.assign_floor_reservation(jsonb),public.record_floor_arrival(jsonb),public.seat_floor_reservation(jsonb),public.transfer_floor_session(jsonb),public.complete_floor_session(jsonb),public.clear_floor_session(jsonb),public.block_floor_table(jsonb) to authenticated,service_role;

