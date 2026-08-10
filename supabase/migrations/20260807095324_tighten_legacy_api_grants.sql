-- New Supabase projects can grant broad Data API privileges by default.
-- Keep every unauthenticated operation behind the reviewed Next.js routes.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Function EXECUTE is granted to PUBLIC by PostgreSQL unless explicitly revoked.
-- Remove that inherited surface, then restore only the authenticated staff RPCs.
revoke execute on all functions in schema public from public;

grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.has_outlet_access(uuid) to authenticated;
grant execute on function public.can_mutate() to authenticated;
grant execute on function public.can_override() to authenticated;
grant execute on function public.create_reservation_atomic(jsonb) to authenticated;
grant execute on function public.transition_reservation_status(uuid,public.reservation_status,text) to authenticated;
grant execute on function public.convert_public_request_atomic(uuid,jsonb) to authenticated;
grant execute on function public.record_manual_payment_atomic(jsonb) to authenticated;
grant execute on function public.review_manual_payment(uuid,public.manual_payment_status,jsonb,text,boolean) to authenticated;
grant execute on function public.execute_guest_merge(uuid,uuid,text,jsonb,text) to authenticated;
grant execute on function public.claim_marketing_recipients(text,integer) to service_role;

-- Pin helper search paths so caller-controlled schemas cannot shadow dependencies.
alter function public.normalize_ph_mobile(text) set search_path = '';
alter function public.guests_normalize() set search_path = '';
