-- Keep the internal cleanup RPC callable only by the server-side service role.
revoke all on function public.release_expired_inventory_holds() from public, anon, authenticated;
grant execute on function public.release_expired_inventory_holds() to service_role;

-- SECURITY DEFINER helpers must use a fixed search path.
alter function public.can_transition_reservation(public.reservation_status, public.reservation_status)
  set search_path = public, extensions;
