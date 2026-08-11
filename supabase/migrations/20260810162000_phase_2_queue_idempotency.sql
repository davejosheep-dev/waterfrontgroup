alter table public.waitlist_entries
  add column if not exists idempotency_key text;
alter table public.walk_ins
  add column if not exists idempotency_key text;

create unique index if not exists waitlist_entries_idempotency_idx
  on public.waitlist_entries(organization_id, venue_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists walk_ins_idempotency_idx
  on public.walk_ins(organization_id, venue_id, idempotency_key)
  where idempotency_key is not null;
