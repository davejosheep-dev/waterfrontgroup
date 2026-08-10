-- Qualify the JSON column so PL/pgSQL does not confuse it with the
-- decision_snapshot function argument during the idempotency lookup.
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
  if exists(select 1 from public.guest_merge_events gme where gme.decision_snapshot->>'idempotency_key'=idempotency_key) then
    return (select gme.id from public.guest_merge_events gme where gme.decision_snapshot->>'idempotency_key'=idempotency_key limit 1);
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

revoke execute on function public.execute_guest_merge(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.execute_guest_merge(uuid,uuid,text,jsonb,text) to authenticated;

