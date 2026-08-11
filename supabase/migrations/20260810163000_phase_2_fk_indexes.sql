create index if not exists dining_table_features_feature_idx
  on public.dining_table_features(feature_id);
create index if not exists inventory_holds_created_by_idx
  on public.inventory_holds(created_by)
  where created_by is not null;
create index if not exists inventory_holds_scope_idx
  on public.inventory_holds(organization_id, venue_id, service_period_id, starts_at, ends_at);
create index if not exists reservation_inventory_resources_scope_idx
  on public.reservation_inventory_resources(organization_id, venue_id, table_id, starts_at, ends_at);
create index if not exists waitlist_entries_created_by_idx
  on public.waitlist_entries(created_by)
  where created_by is not null;
create index if not exists waitlist_entries_guest_idx
  on public.waitlist_entries(guest_id)
  where guest_id is not null;
create index if not exists walk_ins_created_by_idx
  on public.walk_ins(created_by)
  where created_by is not null;
create index if not exists walk_ins_guest_idx
  on public.walk_ins(guest_id)
  where guest_id is not null;
create index if not exists walk_ins_reservation_idx
  on public.walk_ins(reservation_id)
  where reservation_id is not null;
