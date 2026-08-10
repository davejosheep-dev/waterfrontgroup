-- Waterfront Reservations Phase 3: controlled manual payments and transactional messaging.
-- Additive migration. Existing Phase 1 payments are deliberately mapped to draft/unverified.

create type public.manual_payment_status as enum ('draft','submitted_for_verification','verified','rejected','voided','partially_refunded','refunded');
create type public.payment_channel_type as enum ('gcash_qr','bdo_terminal','instapay','cash','other_bank_transfer','other');
create type public.proof_validation_status as enum ('pending','valid','rejected','redacted','quarantined');
create type public.refund_workflow_status as enum ('draft','submitted_for_verification','verified','rejected','voided');
create type public.reconciliation_status as enum ('draft','prepared','reviewed','reopened');
create type public.communication_consent_status as enum ('granted','withdrawn','unknown','suppressed');

create table public.payment_channel_configs (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  channel_type public.payment_channel_type not null,
  display_name text not null,
  account_merchant_label text,
  protected_details_ciphertext text,
  masked_summary text not null,
  qr_storage_path text,
  reference_required boolean not null default true,
  proof_required boolean not null default true,
  verifier_roles public.staff_role[] not null default array['group_admin','group_manager','outlet_manager']::public.staff_role[],
  supported_booking_types public.booking_type[] not null default enum_range(null::public.booking_type),
  instruction_version integer not null default 1 check (instruction_version > 0),
  guest_instructions text,
  terms_version text not null default 'preview-2026-08',
  active_from timestamptz,
  active_until timestamptz,
  active boolean not null default false,
  receiving_details_approved_at timestamptz,
  receiving_details_approved_by uuid references public.staff_profiles(user_id),
  created_by uuid not null references public.staff_profiles(user_id),
  updated_by uuid not null references public.staff_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_until is null or active_from is null or active_until > active_from),
  check (not active or receiving_details_approved_by is not null)
);
create unique index payment_channel_config_version_idx on public.payment_channel_configs(outlet_id,display_name,instruction_version);
create index payment_channel_active_idx on public.payment_channel_configs(outlet_id,active,channel_type);

alter table public.payments
  add column payment_requirement_id uuid references public.payment_requirements(id),
  add column payment_channel_config_id uuid references public.payment_channel_configs(id),
  add column channel_config_version integer,
  add column workflow_status public.manual_payment_status not null default 'draft',
  add column transaction_at timestamptz,
  add column proof_received_at timestamptz,
  add column external_reference text,
  add column external_reference_normalized text,
  add column payer_name text,
  add column card_brand text,
  add column card_last_four text,
  add column submitted_by uuid references public.staff_profiles(user_id),
  add column verified_by uuid references public.staff_profiles(user_id),
  add column submitted_at timestamptz,
  add column verified_at timestamptz,
  add column rejected_at timestamptz,
  add column rejection_reason text,
  add column correction_of_payment_id uuid references public.payments(id),
  add column self_verification_override boolean not null default false,
  add column self_verification_reason text,
  add column secondary_review_completed_at timestamptz,
  add column duplicate_reference_warning boolean not null default false,
  add column overpayment_exception boolean not null default false,
  add column overpayment_reason text;

alter table public.payments
  add constraint payment_php_only check (currency='PHP'),
  add constraint payment_safe_card_last_four check (card_last_four is null or card_last_four ~ '^[0-9]{4}$'),
  add constraint payment_no_self_verify check (verified_by is null or verified_by <> recorded_by or self_verification_override),
  add constraint payment_emergency_reason check (not self_verification_override or length(trim(coalesce(self_verification_reason,''))) >= 12),
  add constraint payment_rejection_reason check (workflow_status <> 'rejected' or length(trim(coalesce(rejection_reason,''))) >= 8),
  add constraint payment_overage_reason check (not overpayment_exception or length(trim(coalesce(overpayment_reason,''))) >= 12);

create index payments_verification_queue_idx on public.payments(workflow_status,submitted_at) where workflow_status='submitted_for_verification';
create index payments_reference_idx on public.payments(payment_channel_config_id,external_reference_normalized) where external_reference_normalized is not null;
create index payments_requirement_workflow_idx on public.payments(payment_requirement_id,workflow_status);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id),
  refund_record_id uuid,
  storage_path text not null unique,
  original_safe_filename text not null,
  detected_mime_type text not null check (detected_mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  sha256_hash text not null check (sha256_hash ~ '^[a-f0-9]{64}$'),
  validation_status public.proof_validation_status not null default 'pending',
  uploaded_by uuid not null references public.staff_profiles(user_id),
  uploaded_at timestamptz not null default now(),
  replaced_proof_id uuid references public.payment_proofs(id),
  replacement_reason text,
  active_version boolean not null default true,
  viewed_at timestamptz,
  check ((payment_id is not null)::integer + (refund_record_id is not null)::integer = 1)
);
create index payment_proofs_payment_idx on public.payment_proofs(payment_id,active_version);
create index payment_proofs_hash_idx on public.payment_proofs(sha256_hash);

create table public.payment_verification_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id),
  from_status public.manual_payment_status,
  to_status public.manual_payment_status not null,
  actor_id uuid not null references public.staff_profiles(user_id),
  checklist jsonb not null default '{}',
  exceptions jsonb not null default '[]',
  reason text,
  created_at timestamptz not null default now()
);
create index payment_verification_timeline_idx on public.payment_verification_events(payment_id,created_at);

create table public.refund_records (
  id uuid primary key default gen_random_uuid(),
  original_payment_id uuid not null references public.payments(id),
  amount_centavos bigint not null check (amount_centavos > 0),
  reason text not null check (length(trim(reason)) >= 8),
  external_reference text,
  transaction_at timestamptz,
  status public.refund_workflow_status not null default 'draft',
  recorded_by uuid not null references public.staff_profiles(user_id),
  submitted_by uuid references public.staff_profiles(user_id),
  verified_by uuid references public.staff_profiles(user_id),
  submitted_at timestamptz,
  verified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (verified_by is null or verified_by <> recorded_by)
);
alter table public.payment_proofs add constraint payment_proofs_refund_fk foreign key(refund_record_id) references public.refund_records(id);
create index refund_records_payment_idx on public.refund_records(original_payment_id,status);

create table public.daily_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  local_business_date date not null,
  status public.reconciliation_status not null default 'draft',
  totals_snapshot jsonb not null default '{}',
  open_exceptions jsonb not null default '[]',
  discrepancy_notes text,
  prepared_by uuid references public.staff_profiles(user_id),
  prepared_at timestamptz,
  reviewed_by uuid references public.staff_profiles(user_id),
  reviewed_at timestamptz,
  reopened_by uuid references public.staff_profiles(user_id),
  reopened_at timestamptz,
  reopened_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(outlet_id,local_business_date),
  check (reviewed_by is null or reviewed_by <> prepared_by),
  check (status <> 'reopened' or length(trim(coalesce(reopened_reason,''))) >= 8)
);

create table public.transactional_message_templates (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  template_key text not null,
  channel text not null check (channel in ('manual_copy','email','whatsapp')),
  provider_template_name text,
  purpose text not null,
  locale text not null default 'en',
  provider_approval_status text not null default 'not_required' check (provider_approval_status in ('not_required','pending','approved','rejected')),
  required_variables jsonb not null default '[]',
  body_template text not null,
  version integer not null default 1,
  active boolean not null default false,
  approved_by uuid references public.staff_profiles(user_id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(outlet_id,template_key,channel,locale,version),
  check (not active or approved_by is not null)
);

create table public.transactional_channel_consents (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guests(id),
  public_request_id uuid references public.public_booking_requests(id),
  channel text not null check (channel in ('email','whatsapp')),
  purpose text not null default 'transactional_reservation',
  status public.communication_consent_status not null default 'unknown',
  consent_text_version text,
  capture_source text,
  evidence_metadata jsonb not null default '{}',
  captured_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (guest_id is not null or public_request_id is not null)
);

alter table public.transactional_messages drop constraint if exists transactional_messages_channel_check;
alter table public.transactional_messages add constraint transactional_messages_channel_v3_check check (channel in ('manual_copy','email','whatsapp'));
alter table public.transactional_messages
  add column template_registry_id uuid references public.transactional_message_templates(id),
  add column consent_snapshot jsonb not null default '{}',
  add column delivery_state text not null default 'queued' check (delivery_state in ('queued','prepared_for_manual_send','manually_sent','accepted','sent','delivered','read','failed','suppressed','dead_letter')),
  add column fallback_message_id uuid references public.transactional_messages(id),
  add column retry_after timestamptz,
  add column dead_lettered_at timestamptz,
  add column business_event_version integer not null default 1;
create index transactional_outbox_processing_idx on public.transactional_messages(delivery_state,retry_after,created_at) where delivery_state in ('queued','failed');

-- Existing manual payment rows remain claims and count as zero until proof and human review are completed.
update public.payments set workflow_status='draft', external_reference_normalized=upper(regexp_replace(coalesce(reference_number,''),'[^A-Za-z0-9]','','g')) where workflow_status='draft';
update public.payments p set payment_requirement_id=(select pr.id from public.payment_requirements pr where pr.reservation_id=p.reservation_id order by pr.created_at limit 1) where p.payment_requirement_id is null;

-- Replace the Phase 1 legacy "recorded means paid" trigger. Under Phase 3 only human-verified
-- workflow states count, and verified refunds reduce the net. Reservation status is never changed here.
drop trigger if exists payments_refresh_requirements on public.payments;
create or replace function public.refresh_payment_requirement_status() returns trigger
language plpgsql security definer set search_path=public as $$
declare requirement_id uuid := new.payment_requirement_id; verified_gross bigint; verified_refunds bigint; due_amount bigint;
begin
  if requirement_id is null then return new; end if;
  select amount_due_centavos into due_amount from public.payment_requirements where id=requirement_id;
  select coalesce(sum(amount_centavos),0) into verified_gross from public.payments where payment_requirement_id=requirement_id and workflow_status in ('verified','partially_refunded','refunded');
  select coalesce(sum(rr.amount_centavos),0) into verified_refunds from public.refund_records rr join public.payments p on p.id=rr.original_payment_id where p.payment_requirement_id=requirement_id and rr.status='verified';
  update public.payment_requirements set status=case
    when status in ('waived','voided') then status
    when verified_gross-verified_refunds<=0 then 'pending'::public.payment_requirement_status
    when due_amount is null or verified_gross-verified_refunds>=due_amount then 'paid'::public.payment_requirement_status
    else 'partially_paid'::public.payment_requirement_status end,
    updated_at=now() where id=requirement_id;
  return new;
end $$;
create trigger payments_refresh_requirements after insert or update of workflow_status,amount_centavos on public.payments
for each row execute function public.refresh_payment_requirement_status();

create or replace function public.record_manual_payment_atomic(payload jsonb)
returns public.payments language plpgsql security definer set search_path=public as $$
declare req public.payment_requirements; res public.reservations; cfg public.payment_channel_configs; created_payment public.payments; proof_hash text; target_status public.manual_payment_status;
begin
  select * into req from public.payment_requirements where id=(payload->>'payment_requirement_id')::uuid;
  select r.* into res from public.reservations r where r.id=req.reservation_id;
  if req.id is null or not public.has_outlet_access(res.outlet_id) or not public.can_mutate() then raise exception 'Not authorized'; end if;
  select * into cfg from public.payment_channel_configs where id=(payload->>'payment_channel_config_id')::uuid and outlet_id=res.outlet_id and active;
  if cfg.id is null then raise exception 'An active approved payment channel is required'; end if;
  if (payload->>'amount_centavos')::bigint <= 0 then raise exception 'Payment amount must be positive'; end if;
  if cfg.reference_required and length(trim(coalesce(payload->>'external_reference',''))) < 3 then raise exception 'Transaction reference is required'; end if;
  proof_hash := lower(payload->>'proof_sha256');
  if cfg.proof_required and (proof_hash is null or proof_hash !~ '^[a-f0-9]{64}$') then raise exception 'A valid proof hash is required'; end if;
  target_status := case when coalesce((payload->>'submit_for_verification')::boolean,false) then 'submitted_for_verification'::public.manual_payment_status else 'draft'::public.manual_payment_status end;
  if exists(select 1 from public.payment_proofs where sha256_hash=proof_hash and active_version) then raise exception 'Duplicate proof requires manager resolution'; end if;

  insert into public.payments(reservation_id,payment_requirement_id,payment_channel_config_id,channel_config_version,amount_centavos,currency,method,reference_number,received_at,recorded_by,status,workflow_status,transaction_at,proof_received_at,external_reference,external_reference_normalized,payer_name,submitted_by,submitted_at)
  values(res.id,req.id,cfg.id,cfg.instruction_version,(payload->>'amount_centavos')::bigint,'PHP',
    case cfg.channel_type when 'gcash_qr' then 'gcash' when 'bdo_terminal' then 'card_external' when 'cash' then 'cash' when 'other' then 'other' else 'bank_transfer' end,
    payload->>'external_reference',now(),auth.uid(),'recorded',target_status,(payload->>'transaction_at')::timestamptz,now(),payload->>'external_reference',upper(regexp_replace(payload->>'external_reference','[^A-Za-z0-9]','','g')),payload->>'payer_name',case when target_status='submitted_for_verification' then auth.uid() end,case when target_status='submitted_for_verification' then now() end)
  returning * into created_payment;

  insert into public.payment_proofs(payment_id,storage_path,original_safe_filename,detected_mime_type,byte_size,sha256_hash,validation_status,uploaded_by)
  values(created_payment.id,payload->>'proof_storage_path',payload->>'proof_filename',payload->>'proof_mime',(payload->>'proof_bytes')::bigint,proof_hash,'valid',auth.uid());
  insert into public.payment_verification_events(payment_id,to_status,actor_id,reason) values(created_payment.id,target_status,auth.uid(),'Manual payment claim recorded with proof');
  insert into public.audit_log(actor_id,outlet_id,entity_type,entity_id,action,metadata) values(auth.uid(),res.outlet_id,'payment',created_payment.id,'manual_payment_recorded',jsonb_build_object('workflow_status',target_status,'channel_config_id',cfg.id));
  return created_payment;
end $$;

create or replace function public.review_manual_payment(target_payment uuid, next_status public.manual_payment_status, checklist jsonb default '{}', reason text default null, emergency_override boolean default false)
returns public.payments language plpgsql security definer set search_path=public as $$
declare p public.payments; req public.payment_requirements; res public.reservations; verified_total bigint; refunded_total bigint; next_req_status public.payment_requirement_status;
begin
  select * into p from public.payments where id=target_payment for update;
  select * into req from public.payment_requirements where id=p.payment_requirement_id for update;
  select * into res from public.reservations where id=p.reservation_id;
  if p.id is null or not public.has_outlet_access(res.outlet_id) or public.current_staff_role() not in ('group_admin','group_manager','outlet_manager') then raise exception 'Not authorized to verify payments'; end if;
  if p.workflow_status <> 'submitted_for_verification' or next_status not in ('verified','rejected') then raise exception 'Invalid payment review transition'; end if;
  if not exists(select 1 from public.payment_proofs where payment_id=p.id and active_version and validation_status='valid') then raise exception 'Valid proof is required'; end if;
  if next_status='verified' and coalesce(jsonb_array_length(checklist->'affirmed'),0) < 6 then raise exception 'Verification checklist is incomplete'; end if;
  if p.recorded_by=auth.uid() then
    if not (emergency_override and public.current_staff_role()='group_admin' and length(trim(coalesce(reason,'')))>=12) then raise exception 'Recorder cannot verify own payment'; end if;
  end if;
  if next_status='rejected' and length(trim(coalesce(reason,'')))<8 then raise exception 'Rejection reason is required'; end if;
  if next_status='verified' and exists(select 1 from public.payment_proofs pp join public.payment_proofs other on other.sha256_hash=pp.sha256_hash and other.id<>pp.id and other.active_version where pp.payment_id=p.id and pp.active_version) then raise exception 'Duplicate proof requires manager resolution'; end if;
  select coalesce(sum(amount_centavos),0) into verified_total from public.payments where payment_requirement_id=req.id and workflow_status in ('verified','partially_refunded','refunded') and id<>p.id;
  select coalesce(sum(rr.amount_centavos),0) into refunded_total from public.refund_records rr join public.payments pay on pay.id=rr.original_payment_id where pay.payment_requirement_id=req.id and rr.status='verified';
  if next_status='verified' and req.amount_due_centavos is not null and verified_total-refunded_total+p.amount_centavos>req.amount_due_centavos and not p.overpayment_exception then raise exception 'Verification would create overpayment'; end if;

  update public.payments set workflow_status=next_status,verified_by=case when next_status='verified' then auth.uid() end,verified_at=case when next_status='verified' then now() end,rejected_at=case when next_status='rejected' then now() end,rejection_reason=case when next_status='rejected' then reason end,self_verification_override=emergency_override,self_verification_reason=case when emergency_override then reason end,updated_at=now() where id=p.id returning * into p;
  insert into public.payment_verification_events(payment_id,from_status,to_status,actor_id,checklist,reason) values(p.id,'submitted_for_verification',next_status,auth.uid(),checklist,reason);
  if next_status='verified' then
    verified_total := verified_total-refunded_total+p.amount_centavos;
    next_req_status := case when verified_total<=0 then 'pending' when req.amount_due_centavos is null or verified_total>=req.amount_due_centavos then 'paid' else 'partially_paid' end;
    update public.payment_requirements set status=next_req_status,updated_at=now() where id=req.id;
    if next_req_status='paid' then
      insert into public.internal_notifications(outlet_id,recipient_role,reservation_id,notification_type,scheduled_for,deduplication_key)
      values(res.outlet_id,'reservations_staff',res.id,'deposit_verified_ready_for_confirmation',now(),res.id::text||':deposit_ready:'||req.id::text) on conflict(deduplication_key) do nothing;
    end if;
  end if;
  insert into public.audit_log(actor_id,outlet_id,entity_type,entity_id,action,metadata) values(auth.uid(),res.outlet_id,'payment',p.id,'manual_payment_reviewed',jsonb_build_object('status',next_status,'emergency_override',emergency_override));
  return p;
end $$;

alter table public.payment_channel_configs enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.payment_verification_events enable row level security;
alter table public.refund_records enable row level security;
alter table public.daily_payment_reconciliations enable row level security;
alter table public.transactional_message_templates enable row level security;
alter table public.transactional_channel_consents enable row level security;

create policy payment_channels_staff_read on public.payment_channel_configs for select using (public.has_outlet_access(outlet_id));
create policy payment_channels_manager_write on public.payment_channel_configs for all using (public.has_outlet_access(outlet_id) and public.current_staff_role() in ('group_admin','group_manager','outlet_manager')) with check (public.has_outlet_access(outlet_id));
create policy payment_proofs_authorized_read on public.payment_proofs for select using (exists(select 1 from public.payments p join public.reservations r on r.id=p.reservation_id where p.id=payment_id and public.has_outlet_access(r.outlet_id) and public.current_staff_role() in ('group_admin','group_manager','outlet_manager','reservations_staff')));
create policy payment_events_authorized_read on public.payment_verification_events for select using (exists(select 1 from public.payments p join public.reservations r on r.id=p.reservation_id where p.id=payment_id and public.has_outlet_access(r.outlet_id)));
create policy refunds_authorized_read on public.refund_records for select using (exists(select 1 from public.payments p join public.reservations r on r.id=p.reservation_id where p.id=original_payment_id and public.has_outlet_access(r.outlet_id)));
create policy reconciliations_authorized_read on public.daily_payment_reconciliations for select using (public.has_outlet_access(outlet_id));
create policy templates_authorized_read on public.transactional_message_templates for select using (public.has_outlet_access(outlet_id));
create policy consents_authorized_read on public.transactional_channel_consents for select using ((guest_id is not null and exists(select 1 from public.reservations r where r.guest_id=guest_id and public.has_outlet_access(r.outlet_id))) or (public_request_id is not null and exists(select 1 from public.public_booking_requests r where r.id=public_request_id and public.has_outlet_access(r.outlet_id))));

revoke all on public.payment_channel_configs,public.payment_proofs,public.payment_verification_events,public.refund_records,public.daily_payment_reconciliations from anon;
revoke all on function public.record_manual_payment_atomic(jsonb) from public;
revoke all on function public.review_manual_payment(uuid,public.manual_payment_status,jsonb,text,boolean) from public;
grant execute on function public.record_manual_payment_atomic(jsonb) to authenticated;
grant execute on function public.review_manual_payment(uuid,public.manual_payment_status,jsonb,text,boolean) to authenticated;

-- Reuse the existing private payment-proofs bucket. Keep MIME and size policy conservative.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
