-- Remove both inherited and direct function grants created by platform defaults.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Authenticated staff RPCs. Each privileged function performs its own role,
-- outlet, capability, and/or maker-checker authorization before mutation.
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

-- Dispatch remains worker-only.
grant execute on function public.claim_marketing_recipients(text,integer) to service_role;
