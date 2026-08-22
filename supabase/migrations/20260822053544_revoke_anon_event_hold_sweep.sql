-- `release_expired_event_holds()` is a maintenance sweep, not part of the
-- public API. The Phase 4 migration granted it to service_role but never
-- revoked Postgres's default EXECUTE grant to PUBLIC, so it stayed callable
-- unauthenticated via /rest/v1/rpc/release_expired_event_holds.
--
-- Verified against the hosted project: has_function_privilege('anon', ...)
-- returned true for this function and false for its Phase 2 counterpart
-- release_expired_inventory_holds(), which 20260810153000 revoked correctly.
-- This applies the same treatment so the two behave alike.
--
-- Impact of the gap was bounded — the sweep only releases holds that have
-- already expired — but it was an unauthenticated write into event inventory
-- that was never intended to be reachable.

revoke execute on function public.release_expired_event_holds() from public, anon, authenticated;
grant execute on function public.release_expired_event_holds() to service_role;
