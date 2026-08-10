-- Waterfront Reservations Phase 4: Guest CRM, consent, and controlled marketing.
-- Additive only. Production marketing flags remain false and all legacy consent is backfilled as unknown.

create schema if not exists private;

create type public.guest_crm_status as enum ('active','merged','anonymized','restricted','deceased');
create type public.guest_contact_channel as enum ('email','mobile','whatsapp');
create type public.guest_contact_state as enum ('unverified','verified','invalid','bounced','complained','retired');
create type public.identity_candidate_status as enum ('open','dismissed','merged','not_same_person');
create type public.crm_consent_purpose as enum ('marketing','transactional');
create type public.crm_consent_status as enum ('granted','withdrawn','objected','unknown','not_applicable');
create type public.crm_scope_type as enum ('outlet','brand','group');
create type public.marketing_channel as enum ('email','whatsapp');
create type public.marketing_suppression_reason as enum ('unsubscribe','objection','hard_bounce','complaint','invalid','privacy_restriction','manual');
create type public.marketing_campaign_status as enum ('draft','content_review','audience_review','approved','scheduled','sending','paused','completed','cancelled','failed');
create type public.marketing_recipient_state as enum ('snapshotted','excluded','queued','claimed','submitted','accepted','sent','delivered','failed','suppressed','dead_letter');
create type public.marketing_delivery_event_type as enum ('accepted','sent','delivered','soft_bounce','hard_bounce','complained','unsubscribed','provider_reported_open','provider_reported_click','failed');
create type public.privacy_request_status as enum ('submitted','identity_review','in_progress','completed','restricted','declined');

alter table public.guests
  add column preferred_name text,
  add column crm_status public.guest_crm_status not null default 'active',
  add column merged_into_guest_id uuid references public.guests(id),
  add column crm_version integer not null default 1 check (crm_version > 0),
  add column crm_updated_at timestamptz not null default now(),
  add constraint guests_merged_target_check check ((crm_status = 'merged') = (merged_into_guest_id is not null));

create index guests_crm_status_idx on public.guests(crm_status,crm_updated_at desc);
create index guests_merged_into_idx on public.guests(merged_into_guest_id) where merged_into_guest_id is not null;

create table public.outlet_crm_marketing_settings (
  outlet_id uuid primary key references public.outlets(id),
  crm_profiles_enabled boolean not null default false,
  crm_merge_enabled boolean not null default false,
  marketing_segments_enabled boolean not null default false,
  marketing_email_send_enabled boolean not null default false,
  marketing_whatsapp_send_enabled boolean not null default false,
  marketing_exports_enabled boolean not null default false,
  emergency_stop boolean not null default true,
  consent_notice_version text,
  privacy_notice_version text,
  consent_notice_hash text,
  frequency_policy_approved boolean not null default false,
  frequency_window_days integer check (frequency_window_days is null or frequency_window_days > 0),
  email_frequency_cap integer check (email_frequency_cap is null or email_frequency_cap > 0),
  whatsapp_frequency_cap integer check (whatsapp_frequency_cap is null or whatsapp_frequency_cap > 0),
  quiet_hours_start time,
  quiet_hours_end time,
  provider_configuration_approved_at timestamptz,
  legal_privacy_approved_at timestamptz,
  updated_by uuid references public.staff_profiles(user_id),
  updated_at timestamptz not null default now(),
  check (not marketing_email_send_enabled or (not emergency_stop and frequency_policy_approved and provider_configuration_approved_at is not null and legal_privacy_approved_at is not null and consent_notice_hash is not null)),
  check (not marketing_whatsapp_send_enabled or marketing_email_send_enabled)
);

insert into public.outlet_crm_marketing_settings(outlet_id)
select id from public.outlets on conflict(outlet_id) do nothing;

create table public.staff_capability_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete cascade,
  capability text not null check (capability in (
    'crm_guest_search','crm_guest_operational_write','crm_guest_merge','crm_consent_read','crm_consent_withdraw','crm_consent_grant',
    'crm_suppression_manage','crm_privacy_admin','marketing_segment_edit','marketing_campaign_edit','marketing_campaign_approve',
    'marketing_campaign_report','marketing_settings_manage','marketing_test_send','marketing_export','staff_capability_manage'
  )),
  granted_by uuid references public.staff_profiles(user_id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index staff_capability_active_idx on public.staff_capability_assignments(user_id,coalesce(outlet_id,'00000000-0000-0000-0000-000000000000'::uuid),capability) where revoked_at is null;
create index staff_capability_user_idx on public.staff_capability_assignments(user_id,outlet_id) where revoked_at is null;

create or replace function private.has_capability(required_capability text, target_outlet uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.staff_profiles sp
    join public.staff_capability_assignments ca on ca.user_id=sp.user_id and ca.revoked_at is null
    where sp.user_id=(select auth.uid()) and sp.active and ca.capability=required_capability
      and (ca.outlet_id is null or target_outlet is null or ca.outlet_id=target_outlet)
      and (target_outlet is null or public.has_outlet_access(target_outlet))
  );
$$;

create or replace function private.can_access_guest(target_guest uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.staff_profiles sp where sp.user_id=(select auth.uid()) and sp.active
      and (
        sp.role in ('group_admin','group_manager')
        or exists(select 1 from public.reservations r where r.guest_id=target_guest and public.has_outlet_access(r.outlet_id))
        or exists(select 1 from public.public_booking_requests p where p.linked_guest_id=target_guest and public.has_outlet_access(p.outlet_id))
      )
  );
$$;

create or replace function private.has_guest_capability(required_capability text, target_guest uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.staff_profiles sp
    join public.staff_capability_assignments ca on ca.user_id=sp.user_id and ca.revoked_at is null
    where sp.user_id=(select auth.uid()) and sp.active and ca.capability=required_capability
      and (
        ca.outlet_id is null
        or exists(select 1 from public.reservations r where r.guest_id=target_guest and r.outlet_id=ca.outlet_id and public.has_outlet_access(r.outlet_id))
        or exists(select 1 from public.public_booking_requests p where p.linked_guest_id=target_guest and p.outlet_id=ca.outlet_id and public.has_outlet_access(p.outlet_id))
      )
  );
$$;

grant usage on schema private to authenticated;
revoke all on function private.has_capability(text,uuid) from public,anon;
revoke all on function private.can_access_guest(uuid) from public,anon;
revoke all on function private.has_guest_capability(text,uuid) from public,anon;
grant execute on function private.has_capability(text,uuid), private.can_access_guest(uuid), private.has_guest_capability(text,uuid) to authenticated;

-- Conservative defaults translate existing roles into explicit capabilities without creating new broad role names.
insert into public.staff_capability_assignments(user_id,outlet_id,capability,granted_by)
select sp.user_id,null,c.capability,sp.user_id
from public.staff_profiles sp
cross join lateral (values
  ('crm_guest_search'),('crm_guest_operational_write'),('crm_guest_merge'),('crm_consent_read'),('crm_consent_withdraw'),('crm_consent_grant'),
  ('crm_suppression_manage'),('crm_privacy_admin'),('marketing_segment_edit'),('marketing_campaign_edit'),('marketing_campaign_approve'),
  ('marketing_campaign_report'),('marketing_settings_manage'),('marketing_test_send'),('marketing_export'),('staff_capability_manage')
) c(capability)
where sp.role='group_admin'
on conflict do nothing;

insert into public.staff_capability_assignments(user_id,outlet_id,capability,granted_by)
select sp.user_id,case when sp.role='group_manager' then null else a.outlet_id end,c.capability,sp.user_id
from public.staff_profiles sp
left join public.staff_outlet_assignments a on a.user_id=sp.user_id
cross join lateral (values ('crm_guest_search'),('crm_guest_operational_write'),('crm_guest_merge'),('crm_consent_read'),('crm_consent_withdraw'),('marketing_campaign_report')) c(capability)
where sp.role in ('group_manager','outlet_manager') and (sp.role='group_manager' or a.outlet_id is not null)
on conflict do nothing;

insert into public.staff_capability_assignments(user_id,outlet_id,capability,granted_by)
select sp.user_id,a.outlet_id,c.capability,sp.user_id
from public.staff_profiles sp join public.staff_outlet_assignments a on a.user_id=sp.user_id
cross join lateral (values ('crm_guest_search'),('crm_guest_operational_write'),('crm_consent_withdraw')) c(capability)
where sp.role in ('reservations_staff','host')
on conflict do nothing;

create table public.guest_contact_points (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete restrict,
  channel public.guest_contact_channel not null,
  display_value text not null check (length(trim(display_value)) between 3 and 320),
  normalized_value text not null check (length(trim(normalized_value)) between 3 and 320),
  primary_for_channel boolean not null default false,
  state public.guest_contact_state not null default 'unverified',
  source text not null,
  source_record_type text,
  source_record_id uuid,
  last_confirmed_at timestamptz,
  verified_at timestamptz,
  invalid_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  retired_at timestamptz,
  created_by uuid references public.staff_profiles(user_id),
  updated_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(guest_id,channel,normalized_value)
);
create index guest_contact_normalized_idx on public.guest_contact_points(channel,normalized_value) where retired_at is null;
create unique index guest_contact_one_primary_idx on public.guest_contact_points(guest_id,channel) where primary_for_channel and retired_at is null;
create index guest_contact_guest_idx on public.guest_contact_points(guest_id,state);

create table public.guest_identity_candidates (
  id uuid primary key default gen_random_uuid(),
  guest_a_id uuid not null references public.guests(id),
  guest_b_id uuid not null references public.guests(id),
  reason_codes text[] not null check (cardinality(reason_codes) > 0),
  confidence_class text not null check (confidence_class in ('strong','moderate','weak')),
  status public.identity_candidate_status not null default 'open',
  detected_at timestamptz not null default now(),
  reviewed_by uuid references public.staff_profiles(user_id),
  review_reason text,
  resolved_at timestamptz,
  check (guest_a_id < guest_b_id),
  unique(guest_a_id,guest_b_id)
);
create index guest_identity_open_idx on public.guest_identity_candidates(status,confidence_class,detected_at) where status='open';
create index guest_identity_guest_b_idx on public.guest_identity_candidates(guest_b_id);

create table public.guest_merge_events (
  id uuid primary key default gen_random_uuid(),
  survivor_guest_id uuid not null references public.guests(id),
  merged_guest_id uuid not null references public.guests(id),
  actor_id uuid not null references public.staff_profiles(user_id),
  reason text not null check (length(trim(reason)) >= 8),
  decision_snapshot jsonb not null,
  reversible_mapping jsonb not null default '{}',
  correction_of_event_id uuid references public.guest_merge_events(id),
  created_at timestamptz not null default now(),
  check (survivor_guest_id <> merged_guest_id)
);
create index guest_merge_survivor_idx on public.guest_merge_events(survivor_guest_id,created_at desc);
create index guest_merge_merged_idx on public.guest_merge_events(merged_guest_id,created_at desc);

create table public.crm_tags (
  id uuid primary key default gen_random_uuid(), outlet_id uuid references public.outlets(id),
  name text not null check (length(trim(name)) between 2 and 60), description text, category text not null,
  operational_display_allowed boolean not null default true, segmentation_allowed boolean not null default false,
  visibility_capability text not null default 'crm_guest_search', active boolean not null default true,
  created_by uuid not null references public.staff_profiles(user_id), updated_by uuid not null references public.staff_profiles(user_id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(outlet_id,name)
);
create table public.guest_tag_assignments (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id), tag_id uuid not null references public.crm_tags(id),
  outlet_id uuid references public.outlets(id), source text not null, assigned_by uuid not null references public.staff_profiles(user_id),
  assigned_at timestamptz not null default now(), expires_at timestamptz, removed_by uuid references public.staff_profiles(user_id), removed_at timestamptz, removal_reason text
);
create unique index guest_tag_active_idx on public.guest_tag_assignments(guest_id,tag_id,coalesce(outlet_id,'00000000-0000-0000-0000-000000000000'::uuid)) where removed_at is null;
create index guest_tag_tag_idx on public.guest_tag_assignments(tag_id,guest_id) where removed_at is null;

create table public.guest_preferences (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id), outlet_id uuid references public.outlets(id),
  preference_type text not null check (preference_type in ('seating_area','contact_language','service_style','other_approved')),
  structured_value text not null check (length(structured_value) <= 160), source text not null check (source in ('guest_supplied','staff_observed','derived')),
  confidence text check (confidence in ('confirmed','likely','observed')), visibility_class text not null check (visibility_class in ('operational','manager','private_service')),
  last_confirmed_at timestamptz, expires_at timestamptz, retired_at timestamptz,
  created_by uuid references public.staff_profiles(user_id), updated_by uuid references public.staff_profiles(user_id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index guest_preferences_guest_idx on public.guest_preferences(guest_id,preference_type) where retired_at is null;

create table public.guest_important_dates (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id), outlet_id uuid references public.outlets(id),
  date_type text not null check (date_type in ('birthday','anniversary','other_approved')),
  month smallint not null check (month between 1 and 12), day smallint not null check (day between 1 and 31), year smallint,
  source text not null, visibility_class text not null default 'manager', last_confirmed_at timestamptz,
  created_by uuid references public.staff_profiles(user_id), created_at timestamptz not null default now()
);
create index guest_important_dates_month_idx on public.guest_important_dates(month,day,guest_id);

create table public.guest_notes (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id), outlet_id uuid not null references public.outlets(id),
  note_category text not null check (note_category in ('service','reservation_context','relationship')),
  visibility_class text not null check (visibility_class in ('operational','manager','private_service')),
  note_text text not null check (length(trim(note_text)) between 2 and 500), author_id uuid not null references public.staff_profiles(user_id),
  supersedes_note_id uuid references public.guest_notes(id), restricted_at timestamptz, restriction_reason text, expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index guest_notes_timeline_idx on public.guest_notes(guest_id,outlet_id,created_at desc);

create table public.guest_metric_snapshots (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id), calculation_version integer not null,
  as_of timestamptz not null, first_reservation_date date, first_completed_visit_date date, last_completed_visit_date date,
  completed_visit_count integer not null default 0, upcoming_reservation_count integer not null default 0,
  cancellation_count integer not null default 0, no_show_count integer not null default 0,
  average_party_size numeric(8,2), maximum_party_size integer,
  source_summary jsonb not null default '{}', booking_type_summary jsonb not null default '{}', created_at timestamptz not null default now(),
  unique(guest_id,calculation_version,as_of)
);
create index guest_metric_latest_idx on public.guest_metric_snapshots(guest_id,as_of desc);

create table public.communication_consents (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id),
  contact_point_id uuid not null references public.guest_contact_points(id), purpose public.crm_consent_purpose not null,
  channel public.marketing_channel not null, scope_type public.crm_scope_type not null, scope_id text not null,
  status public.crm_consent_status not null, text_version text, text_hash text, evidence_hash text,
  capture_source text not null, actor_id uuid references public.staff_profiles(user_id), captured_at timestamptz not null,
  withdrawn_or_objected_at timestamptz, withdrawal_source text, reason_category text,
  expires_at timestamptz, reconfirmation_due_at timestamptz, supersedes_consent_id uuid references public.communication_consents(id),
  created_at timestamptz not null default now(),
  check (status <> 'granted' or (text_version is not null and text_hash is not null and evidence_hash is not null)),
  check (status not in ('withdrawn','objected') or withdrawn_or_objected_at is not null)
);
create index communication_consents_current_idx on public.communication_consents(guest_id,contact_point_id,purpose,channel,scope_type,scope_id,captured_at desc);
create index communication_consents_contact_idx on public.communication_consents(contact_point_id,captured_at desc);

create table public.communication_suppressions (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id),
  contact_point_id uuid references public.guest_contact_points(id), purpose public.crm_consent_purpose not null default 'marketing',
  channel public.marketing_channel, scope_type public.crm_scope_type, scope_id text,
  reason public.marketing_suppression_reason not null, source text not null, provider_event_id text,
  effective_at timestamptz not null default now(), expires_at timestamptz, created_by uuid references public.staff_profiles(user_id),
  lifted_at timestamptz, lifted_by uuid references public.staff_profiles(user_id), lift_reason text,
  check (lifted_at is null or (lifted_by is not null and length(trim(lift_reason)) >= 8)),
  check (reason not in ('unsubscribe','objection','hard_bounce','complaint','privacy_restriction') or expires_at is null)
);
create index communication_suppressions_active_idx on public.communication_suppressions(guest_id,channel,scope_type,scope_id,effective_at) where lifted_at is null;
create index communication_suppressions_contact_idx on public.communication_suppressions(contact_point_id) where lifted_at is null;

create table public.marketing_segments (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  name text not null, description text, active boolean not null default true, owner_id uuid not null references public.staff_profiles(user_id),
  current_version integer not null default 1 check (current_version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(outlet_id,name)
);
create table public.marketing_segment_versions (
  id uuid primary key default gen_random_uuid(), segment_id uuid not null references public.marketing_segments(id), version integer not null,
  rule_schema_version integer not null default 1, validated_rules jsonb not null, plain_language_summary text not null,
  estimated_count integer, exact_count integer, calculated_at timestamptz, created_by uuid not null references public.staff_profiles(user_id),
  created_at timestamptz not null default now(), unique(segment_id,version), check (jsonb_typeof(validated_rules)='object')
);
create index marketing_segment_versions_segment_idx on public.marketing_segment_versions(segment_id,version desc);

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(), outlet_id uuid not null references public.outlets(id),
  internal_name text not null, channel public.marketing_channel not null, purpose public.crm_consent_purpose not null default 'marketing' check (purpose='marketing'),
  scope_type public.crm_scope_type not null default 'outlet', scope_id text not null,
  segment_id uuid not null references public.marketing_segments(id), status public.marketing_campaign_status not null default 'draft',
  current_version integer not null default 1, creator_id uuid not null references public.staff_profiles(user_id),
  approved_version_id uuid, approved_by uuid references public.staff_profiles(user_id), approved_at timestamptz,
  scheduled_for timestamptz, schedule_timezone text not null default 'Asia/Manila' check (schedule_timezone='Asia/Manila'),
  paused_at timestamptz, paused_by uuid references public.staff_profiles(user_id), cancelled_at timestamptz,
  cancelled_by uuid references public.staff_profiles(user_id), cancellation_reason text, failed_at timestamptz, failure_category text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (approved_by is null or approved_by <> creator_id)
);
create index marketing_campaign_status_idx on public.marketing_campaigns(outlet_id,status,scheduled_for);
create table public.marketing_campaign_versions (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.marketing_campaigns(id), version integer not null,
  segment_version_id uuid not null references public.marketing_segment_versions(id), sender_identity text not null,
  subject text, preheader text, sanitized_html text, plain_text text not null, template_key text,
  provider_template_name text, provider_template_status text check (provider_template_status in ('not_required','pending','approved','rejected')),
  personalization_fields text[] not null default array['preferred_name','outlet_name','preference_url'],
  tracking_enabled boolean not null default false, utm_config jsonb not null default '{}', integrity_hash text not null,
  created_by uuid not null references public.staff_profiles(user_id), created_at timestamptz not null default now(), unique(campaign_id,version)
);
alter table public.marketing_campaigns add constraint marketing_campaigns_approved_version_fk foreign key(approved_version_id) references public.marketing_campaign_versions(id);
create index marketing_campaign_versions_campaign_idx on public.marketing_campaign_versions(campaign_id,version desc);

create or replace function private.enforce_campaign_approval() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null then
    if new.approved_by<>(select auth.uid()) or new.creator_id=new.approved_by or not private.has_capability('marketing_campaign_approve',new.outlet_id) then
      raise exception 'A separate authorized approver is required';
    end if;
    if new.approved_version_id is null or new.status<>'approved' then raise exception 'An immutable approved version is required'; end if;
    new.approved_at:=now();
  end if;
  if old.status in ('approved','scheduled') and (new.segment_id<>old.segment_id or new.channel<>old.channel or new.scope_type<>old.scope_type or new.scope_id<>old.scope_id or new.scheduled_for is distinct from old.scheduled_for) then
    new.status:='draft'; new.approved_by:=null; new.approved_at:=null; new.approved_version_id:=null;
  end if;
  return new;
end $$;
create trigger marketing_campaign_approval_guard before update on public.marketing_campaigns for each row execute function private.enforce_campaign_approval();

create table public.campaign_audience_snapshots (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.marketing_campaigns(id),
  campaign_version_id uuid not null references public.marketing_campaign_versions(id), segment_version_id uuid not null references public.marketing_segment_versions(id),
  generated_at timestamptz not null default now(), generated_by uuid not null references public.staff_profiles(user_id),
  total_evaluated integer not null, eligible_count integer not null, exclusion_totals jsonb not null,
  rule_schema_version integer not null, consent_policy_version text not null, integrity_hash text not null unique,
  unique(campaign_version_id)
);
create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(), snapshot_id uuid not null references public.campaign_audience_snapshots(id),
  campaign_id uuid not null references public.marketing_campaigns(id), campaign_version_id uuid not null references public.marketing_campaign_versions(id),
  guest_id uuid not null references public.guests(id), contact_point_id uuid not null references public.guest_contact_points(id),
  recipient_deduplication_key text not null, eligibility_at_snapshot boolean not null, snapshot_reason_code text,
  send_time_eligible boolean, send_time_reason_code text, state public.marketing_recipient_state not null default 'snapshotted',
  idempotency_key text not null unique, attempt_count integer not null default 0, retry_after timestamptz,
  claimed_at timestamptz, claimed_by text, submitted_at timestamptz, accepted_at timestamptz, sent_at timestamptz,
  delivered_at timestamptz, failed_at timestamptz, suppressed_at timestamptz, dead_lettered_at timestamptz,
  provider_message_id text, last_error_category text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(campaign_version_id,recipient_deduplication_key)
);
create index campaign_recipients_claim_idx on public.campaign_recipients(state,retry_after,created_at) where state in ('queued','failed');
create index campaign_recipients_campaign_idx on public.campaign_recipients(campaign_id,state);
create index campaign_recipients_guest_idx on public.campaign_recipients(guest_id,campaign_id);
create index campaign_recipients_contact_idx on public.campaign_recipients(contact_point_id);

create table public.marketing_delivery_events (
  id uuid primary key default gen_random_uuid(), campaign_recipient_id uuid not null references public.campaign_recipients(id),
  provider text not null, provider_event_id text not null, event_type public.marketing_delivery_event_type not null,
  provider_reported_at timestamptz, received_at timestamptz not null default now(), deduplication_hash text not null unique,
  reason_category text, minimal_metadata jsonb not null default '{}', raw_metadata_expires_at timestamptz,
  unique(provider,provider_event_id)
);
create index marketing_delivery_recipient_idx on public.marketing_delivery_events(campaign_recipient_id,received_at);

create table public.marketing_preference_tokens (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id),
  token_hash text not null unique check (length(token_hash)=64), scope_type public.crm_scope_type not null, scope_id text not null,
  allowed_channels public.marketing_channel[] not null, expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index marketing_preference_tokens_guest_idx on public.marketing_preference_tokens(guest_id,created_at desc);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(), guest_id uuid not null references public.guests(id), outlet_id uuid references public.outlets(id),
  request_type text not null check (request_type in ('access','correction','objection','erasure_blocking','portability')),
  status public.privacy_request_status not null default 'submitted', source text not null, identity_verification_state text not null default 'pending',
  assigned_to uuid references public.staff_profiles(user_id), due_at timestamptz, resolution_summary text,
  completed_at timestamptz, created_by uuid references public.staff_profiles(user_id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index privacy_requests_queue_idx on public.privacy_requests(status,due_at,created_at);
create index privacy_requests_guest_idx on public.privacy_requests(guest_id,created_at desc);

-- Backfill canonical contacts. Existing values remain readable during dual-read validation.
insert into public.guest_contact_points(guest_id,channel,display_value,normalized_value,primary_for_channel,state,source)
select id,'mobile',mobile_display,mobile_normalized,true,'unverified','legacy_guest_columns'
from public.guests where mobile_normalized is not null
on conflict(guest_id,channel,normalized_value) do nothing;

insert into public.guest_contact_points(guest_id,channel,display_value,normalized_value,primary_for_channel,state,source)
select id,'email',email,email_normalized,true,'unverified','legacy_guest_columns'
from public.guests where email_normalized is not null
on conflict(guest_id,channel,normalized_value) do nothing;

-- Generate review candidates only; never merge automatically.
insert into public.guest_identity_candidates(guest_a_id,guest_b_id,reason_codes,confidence_class)
select least(a.guest_id,b.guest_id),greatest(a.guest_id,b.guest_id),
  array[case when a.channel='mobile' then 'exact_mobile' else 'exact_email' end],
  case when a.channel='mobile' then 'strong' else 'moderate' end
from public.guest_contact_points a
join public.guest_contact_points b on b.channel=a.channel and b.normalized_value=a.normalized_value and b.guest_id>a.guest_id
on conflict(guest_a_id,guest_b_id) do update set reason_codes=(select array_agg(distinct value) from unnest(public.guest_identity_candidates.reason_codes||excluded.reason_codes) value);

-- A legacy boolean does not prove purpose, channel, scope, text, evidence, or capture time.
insert into public.communication_consents(guest_id,contact_point_id,purpose,channel,scope_type,scope_id,status,capture_source,captured_at)
select g.id,cp.id,'marketing','email','outlet','waterfront-seafood-iloilo','unknown','legacy_guest_boolean',g.created_at
from public.guests g join public.guest_contact_points cp on cp.guest_id=g.id and cp.channel='email' and cp.primary_for_channel
where g.marketing_consent is not null;

-- Phase 2 rows retain their recorded notice version as migration evidence, but stay unknown until Waterfront approves a mapping policy.
insert into public.communication_consents(guest_id,contact_point_id,purpose,channel,scope_type,scope_id,status,text_version,evidence_hash,capture_source,captured_at)
select p.linked_guest_id,cp.id,'marketing','email','outlet','waterfront-seafood-iloilo','unknown',p.privacy_notice_version,
  encode(extensions.digest(p.id::text||':'||p.privacy_notice_version,'sha256'),'hex'),'phase2_public_request_unapproved_mapping',p.terms_accepted_at
from public.public_booking_requests p
join public.guest_contact_points cp on cp.guest_id=p.linked_guest_id and cp.channel='email' and cp.normalized_value=p.email_normalized
where p.linked_guest_id is not null and p.email_normalized is not null;

insert into public.audit_log(actor_id,outlet_id,entity_type,action,metadata)
select null,null,'phase_4_migration','compatibility_backfill_recorded',jsonb_build_object(
  'guest_count',(select count(*) from public.guests),
  'contact_point_count',(select count(*) from public.guest_contact_points),
  'duplicate_candidate_count',(select count(*) from public.guest_identity_candidates where status='open'),
  'unknown_marketing_consent_count',(select count(*) from public.communication_consents where purpose='marketing' and status='unknown'),
  'production_sending_enabled',false
);

-- Reviewed merge: one transaction, deterministic lock order, immutable event, and no reservation/payment status mutation.
create or replace function public.execute_guest_merge(
  survivor_id uuid, duplicate_id uuid, merge_reason text, decision_snapshot jsonb, idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target_outlet uuid; merge_event_id uuid;
begin
  if (select auth.uid()) is null or survivor_id=duplicate_id or length(trim(coalesce(merge_reason,'')))<8 then raise exception 'Invalid merge request'; end if;
  select r.outlet_id into target_outlet from public.reservations r where r.guest_id in (survivor_id,duplicate_id) order by r.created_at limit 1;
  if target_outlet is null or not private.has_capability('crm_guest_merge',target_outlet) then raise exception 'Not authorized'; end if;
  perform 1 from public.guests where id in (survivor_id,duplicate_id) order by id for update;
  if (select count(*) from public.guests where id in (survivor_id,duplicate_id) and crm_status='active')<>2 then raise exception 'Guest profiles are no longer mergeable'; end if;
  if exists(select 1 from public.guest_merge_events where decision_snapshot->>'idempotency_key'=idempotency_key) then
    return (select id from public.guest_merge_events where decision_snapshot->>'idempotency_key'=idempotency_key limit 1);
  end if;
  update public.reservations set guest_id=survivor_id where guest_id=duplicate_id;
  update public.public_booking_requests set linked_guest_id=survivor_id where linked_guest_id=duplicate_id;
  update public.guest_contact_points cp set guest_id=survivor_id,primary_for_channel=false,updated_at=now()
    where cp.guest_id=duplicate_id and not exists(select 1 from public.guest_contact_points existing where existing.guest_id=survivor_id and existing.channel=cp.channel and existing.normalized_value=cp.normalized_value);
  update public.guest_contact_points set retired_at=now(),state='retired',primary_for_channel=false,updated_at=now()
    where guest_id=duplicate_id and exists(select 1 from public.guest_contact_points existing where existing.guest_id=survivor_id and existing.channel=public.guest_contact_points.channel and existing.normalized_value=public.guest_contact_points.normalized_value);
  update public.communication_consents set guest_id=survivor_id where guest_id=duplicate_id;
  update public.communication_suppressions set guest_id=survivor_id where guest_id=duplicate_id;
  update public.guest_tag_assignments set guest_id=survivor_id where guest_id=duplicate_id;
  update public.guest_preferences set guest_id=survivor_id where guest_id=duplicate_id;
  update public.guest_important_dates set guest_id=survivor_id where guest_id=duplicate_id;
  update public.guest_notes set guest_id=survivor_id where guest_id=duplicate_id;
  update public.privacy_requests set guest_id=survivor_id where guest_id=duplicate_id;
  update public.guests set crm_status='merged',merged_into_guest_id=survivor_id,crm_version=crm_version+1,crm_updated_at=now() where id=duplicate_id;
  update public.guests set crm_version=crm_version+1,crm_updated_at=now() where id=survivor_id;
  insert into public.guest_merge_events(survivor_guest_id,merged_guest_id,actor_id,reason,decision_snapshot,reversible_mapping)
  values(survivor_id,duplicate_id,(select auth.uid()),merge_reason,decision_snapshot||jsonb_build_object('idempotency_key',idempotency_key),jsonb_build_object('reservation_ids',(select jsonb_agg(id) from public.reservations where guest_id=survivor_id))) returning id into merge_event_id;
  update public.guest_identity_candidates set status='merged',reviewed_by=(select auth.uid()),review_reason=merge_reason,resolved_at=now()
    where status='open' and guest_a_id in (survivor_id,duplicate_id) and guest_b_id in (survivor_id,duplicate_id);
  insert into public.audit_log(actor_id,outlet_id,entity_type,entity_id,action,metadata)
  values((select auth.uid()),target_outlet,'guest_merge',merge_event_id,'guest_merge_completed',jsonb_build_object('survivor_guest_id',survivor_id,'merged_guest_id',duplicate_id));
  return merge_event_id;
end $$;
revoke all on function public.execute_guest_merge(uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.execute_guest_merge(uuid,uuid,text,jsonb,text) to authenticated;

-- Worker-only atomic queue claim. Eligibility must be rechecked before provider submission.
create or replace function public.claim_marketing_recipients(worker_name text, batch_size integer default 50)
returns setof public.campaign_recipients language sql security definer set search_path = '' as $$
  update public.campaign_recipients cr set state='claimed',claimed_at=now(),claimed_by=worker_name,updated_at=now(),attempt_count=attempt_count+1
  where cr.id in (
    select queued.id from public.campaign_recipients queued
    join public.marketing_campaigns c on c.id=queued.campaign_id
    join public.outlet_crm_marketing_settings s on s.outlet_id=c.outlet_id
    where queued.state in ('queued','failed') and (queued.retry_after is null or queued.retry_after<=now())
      and c.status='sending' and not s.emergency_stop
      and ((c.channel='email' and s.marketing_email_send_enabled) or (c.channel='whatsapp' and s.marketing_whatsapp_send_enabled))
    order by queued.created_at for update of queued skip locked limit greatest(1,least(batch_size,200))
  ) returning cr.*;
$$;
revoke all on function public.claim_marketing_recipients(text,integer) from public,anon,authenticated;
grant execute on function public.claim_marketing_recipients(text,integer) to service_role;

-- Explicit RLS for every exposed Phase 4 table.
alter table public.outlet_crm_marketing_settings enable row level security;
alter table public.staff_capability_assignments enable row level security;
alter table public.guest_contact_points enable row level security;
alter table public.guest_identity_candidates enable row level security;
alter table public.guest_merge_events enable row level security;
alter table public.crm_tags enable row level security;
alter table public.guest_tag_assignments enable row level security;
alter table public.guest_preferences enable row level security;
alter table public.guest_important_dates enable row level security;
alter table public.guest_notes enable row level security;
alter table public.guest_metric_snapshots enable row level security;
alter table public.communication_consents enable row level security;
alter table public.communication_suppressions enable row level security;
alter table public.marketing_segments enable row level security;
alter table public.marketing_segment_versions enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_versions enable row level security;
alter table public.campaign_audience_snapshots enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.marketing_delivery_events enable row level security;
alter table public.marketing_preference_tokens enable row level security;
alter table public.privacy_requests enable row level security;

create policy crm_settings_read on public.outlet_crm_marketing_settings for select to authenticated using (public.has_outlet_access(outlet_id));
create policy crm_settings_manage on public.outlet_crm_marketing_settings for update to authenticated using (private.has_capability('marketing_settings_manage',outlet_id)) with check (private.has_capability('marketing_settings_manage',outlet_id));
create policy capabilities_self_read on public.staff_capability_assignments for select to authenticated using (user_id=(select auth.uid()) or private.has_capability('staff_capability_manage',outlet_id));
create policy capabilities_admin_write on public.staff_capability_assignments for all to authenticated using (private.has_capability('staff_capability_manage',outlet_id)) with check (private.has_capability('staff_capability_manage',outlet_id));

create policy guest_contacts_read on public.guest_contact_points for select to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_guest_search',guest_id));
create policy guest_contacts_write on public.guest_contact_points for insert to authenticated with check (private.can_access_guest(guest_id) and private.has_guest_capability('crm_guest_operational_write',guest_id));
create policy guest_contacts_update on public.guest_contact_points for update to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_guest_operational_write',guest_id)) with check (private.can_access_guest(guest_id));
create policy identity_candidates_read on public.guest_identity_candidates for select to authenticated using (private.can_access_guest(guest_a_id) and private.can_access_guest(guest_b_id) and private.has_guest_capability('crm_guest_merge',guest_a_id) and private.has_guest_capability('crm_guest_merge',guest_b_id));
create policy merge_events_read on public.guest_merge_events for select to authenticated using (private.can_access_guest(survivor_guest_id) and private.has_guest_capability('crm_guest_merge',survivor_guest_id));

create policy crm_tags_read on public.crm_tags for select to authenticated using (outlet_id is null or public.has_outlet_access(outlet_id));
create policy crm_tags_manage on public.crm_tags for all to authenticated using (outlet_id is not null and private.has_capability('crm_guest_operational_write',outlet_id)) with check (outlet_id is not null and private.has_capability('crm_guest_operational_write',outlet_id));
create policy guest_tags_read on public.guest_tag_assignments for select to authenticated using (private.can_access_guest(guest_id));
create policy guest_tags_write on public.guest_tag_assignments for insert to authenticated with check (private.can_access_guest(guest_id) and private.has_capability('crm_guest_operational_write',outlet_id));
create policy guest_preferences_read on public.guest_preferences for select to authenticated using (private.can_access_guest(guest_id));
create policy guest_preferences_write on public.guest_preferences for insert to authenticated with check (private.can_access_guest(guest_id) and private.has_capability('crm_guest_operational_write',outlet_id));
create policy guest_preferences_update on public.guest_preferences for update to authenticated using (private.can_access_guest(guest_id) and private.has_capability('crm_guest_operational_write',outlet_id)) with check (private.can_access_guest(guest_id));
create policy guest_dates_read on public.guest_important_dates for select to authenticated using (private.can_access_guest(guest_id));
create policy guest_dates_write on public.guest_important_dates for insert to authenticated with check (private.can_access_guest(guest_id) and private.has_capability('crm_guest_operational_write',outlet_id));
create policy guest_notes_read on public.guest_notes for select to authenticated using (private.can_access_guest(guest_id) and public.has_outlet_access(outlet_id));
create policy guest_notes_write on public.guest_notes for insert to authenticated with check (private.can_access_guest(guest_id) and private.has_capability('crm_guest_operational_write',outlet_id) and author_id=(select auth.uid()));
create policy guest_metrics_read on public.guest_metric_snapshots for select to authenticated using (private.can_access_guest(guest_id));

create policy communication_consents_read on public.communication_consents for select to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_consent_read',guest_id));
create policy communication_consents_append on public.communication_consents for insert to authenticated with check (private.can_access_guest(guest_id) and ((status='granted' and private.has_guest_capability('crm_consent_grant',guest_id)) or (status in ('withdrawn','objected','unknown','not_applicable') and private.has_guest_capability('crm_consent_withdraw',guest_id))));
create policy communication_suppressions_read on public.communication_suppressions for select to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_consent_read',guest_id));
create policy communication_suppressions_append on public.communication_suppressions for insert to authenticated with check (private.can_access_guest(guest_id) and private.has_guest_capability('crm_consent_withdraw',guest_id));
create policy communication_suppressions_lift on public.communication_suppressions for update to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_suppression_manage',guest_id)) with check (private.can_access_guest(guest_id) and private.has_guest_capability('crm_suppression_manage',guest_id));

create policy marketing_segments_read on public.marketing_segments for select to authenticated using (public.has_outlet_access(outlet_id) and (private.has_capability('marketing_segment_edit',outlet_id) or private.has_capability('marketing_campaign_report',outlet_id)));
create policy marketing_segments_write on public.marketing_segments for all to authenticated using (private.has_capability('marketing_segment_edit',outlet_id)) with check (private.has_capability('marketing_segment_edit',outlet_id));
create policy marketing_segment_versions_read on public.marketing_segment_versions for select to authenticated using (exists(select 1 from public.marketing_segments s where s.id=segment_id and public.has_outlet_access(s.outlet_id) and (private.has_capability('marketing_segment_edit',s.outlet_id) or private.has_capability('marketing_campaign_report',s.outlet_id))));
create policy marketing_segment_versions_write on public.marketing_segment_versions for insert to authenticated with check (exists(select 1 from public.marketing_segments s where s.id=segment_id and private.has_capability('marketing_segment_edit',s.outlet_id)));
create policy marketing_campaigns_read on public.marketing_campaigns for select to authenticated using (public.has_outlet_access(outlet_id) and (private.has_capability('marketing_campaign_edit',outlet_id) or private.has_capability('marketing_campaign_approve',outlet_id) or private.has_capability('marketing_campaign_report',outlet_id)));
create policy marketing_campaigns_write on public.marketing_campaigns for all to authenticated using (private.has_capability('marketing_campaign_edit',outlet_id) or private.has_capability('marketing_campaign_approve',outlet_id)) with check (private.has_capability('marketing_campaign_edit',outlet_id) or private.has_capability('marketing_campaign_approve',outlet_id));
create policy marketing_campaign_versions_read on public.marketing_campaign_versions for select to authenticated using (exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and public.has_outlet_access(c.outlet_id) and (private.has_capability('marketing_campaign_edit',c.outlet_id) or private.has_capability('marketing_campaign_approve',c.outlet_id) or private.has_capability('marketing_campaign_report',c.outlet_id))));
create policy marketing_campaign_versions_write on public.marketing_campaign_versions for insert to authenticated with check (exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and private.has_capability('marketing_campaign_edit',c.outlet_id)));
create policy audience_snapshots_read on public.campaign_audience_snapshots for select to authenticated using (exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and public.has_outlet_access(c.outlet_id) and (private.has_capability('marketing_campaign_approve',c.outlet_id) or private.has_capability('marketing_campaign_report',c.outlet_id))));
create policy audience_snapshots_write on public.campaign_audience_snapshots for insert to authenticated with check (exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and private.has_capability('marketing_campaign_approve',c.outlet_id)));
create policy campaign_recipients_read on public.campaign_recipients for select to authenticated using (exists(select 1 from public.marketing_campaigns c where c.id=campaign_id and public.has_outlet_access(c.outlet_id) and private.has_capability('marketing_campaign_report',c.outlet_id)));
create policy marketing_delivery_events_read on public.marketing_delivery_events for select to authenticated using (exists(select 1 from public.campaign_recipients cr join public.marketing_campaigns c on c.id=cr.campaign_id where cr.id=campaign_recipient_id and public.has_outlet_access(c.outlet_id) and private.has_capability('marketing_campaign_report',c.outlet_id)));
create policy preference_tokens_privacy_read on public.marketing_preference_tokens for select to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_privacy_admin',guest_id));
create policy preference_tokens_privacy_write on public.marketing_preference_tokens for insert to authenticated with check (private.can_access_guest(guest_id) and private.has_guest_capability('crm_privacy_admin',guest_id));
create policy privacy_requests_read on public.privacy_requests for select to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_privacy_admin',guest_id));
create policy privacy_requests_write on public.privacy_requests for all to authenticated using (private.can_access_guest(guest_id) and private.has_guest_capability('crm_privacy_admin',guest_id)) with check (private.can_access_guest(guest_id) and private.has_guest_capability('crm_privacy_admin',guest_id));

revoke all on public.outlet_crm_marketing_settings,public.staff_capability_assignments,public.guest_contact_points,public.guest_identity_candidates,
  public.guest_merge_events,public.crm_tags,public.guest_tag_assignments,public.guest_preferences,public.guest_important_dates,
  public.guest_notes,public.guest_metric_snapshots,public.communication_consents,public.communication_suppressions,
  public.marketing_segments,public.marketing_segment_versions,public.marketing_campaigns,public.marketing_campaign_versions,
  public.campaign_audience_snapshots,public.campaign_recipients,public.marketing_delivery_events,public.marketing_preference_tokens,
  public.privacy_requests from anon;
