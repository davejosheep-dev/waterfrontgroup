-- Keep read policies separate from write policies so authenticated SELECTs do
-- not evaluate a second permissive policy for every Phase 2 row.
drop policy if exists phase2_table_features_manage on public.table_features;
create policy phase2_table_features_insert on public.table_features
for insert to authenticated
with check (private.has_atomic_permission('reservation_config.manage',organization_id,null));
create policy phase2_table_features_update on public.table_features
for update to authenticated
using (private.has_atomic_permission('reservation_config.manage',organization_id,null))
with check (private.has_atomic_permission('reservation_config.manage',organization_id,null));
create policy phase2_table_features_delete on public.table_features
for delete to authenticated
using (private.has_atomic_permission('reservation_config.manage',organization_id,null));

drop policy if exists phase2_service_periods_manage on public.service_periods;
create policy phase2_service_periods_insert on public.service_periods
for insert to authenticated
with check (private.has_atomic_permission('reservation_config.manage',organization_id,venue_id));
create policy phase2_service_periods_update on public.service_periods
for update to authenticated
using (private.has_atomic_permission('reservation_config.manage',organization_id,venue_id))
with check (private.has_atomic_permission('reservation_config.manage',organization_id,venue_id));
create policy phase2_service_periods_delete on public.service_periods
for delete to authenticated
using (private.has_atomic_permission('reservation_config.manage',organization_id,venue_id));

drop policy if exists phase2_blocks_manage on public.inventory_blocks;
create policy phase2_blocks_insert on public.inventory_blocks
for insert to authenticated
with check (private.has_atomic_permission('inventory_blocks.manage',organization_id,venue_id));
create policy phase2_blocks_update on public.inventory_blocks
for update to authenticated
using (private.has_atomic_permission('inventory_blocks.manage',organization_id,venue_id))
with check (private.has_atomic_permission('inventory_blocks.manage',organization_id,venue_id));
create policy phase2_blocks_delete on public.inventory_blocks
for delete to authenticated
using (private.has_atomic_permission('inventory_blocks.manage',organization_id,venue_id));

drop policy if exists phase2_waitlist_manage on public.waitlist_entries;
create policy phase2_waitlist_insert on public.waitlist_entries
for insert to authenticated
with check (private.has_atomic_permission('waitlist.manage',organization_id,venue_id));
create policy phase2_waitlist_update on public.waitlist_entries
for update to authenticated
using (private.has_atomic_permission('waitlist.manage',organization_id,venue_id))
with check (private.has_atomic_permission('waitlist.manage',organization_id,venue_id));
create policy phase2_waitlist_delete on public.waitlist_entries
for delete to authenticated
using (private.has_atomic_permission('waitlist.manage',organization_id,venue_id));

drop policy if exists phase2_walkins_manage on public.walk_ins;
create policy phase2_walkins_insert on public.walk_ins
for insert to authenticated
with check (private.has_atomic_permission('walkins.manage',organization_id,venue_id));
create policy phase2_walkins_update on public.walk_ins
for update to authenticated
using (private.has_atomic_permission('walkins.manage',organization_id,venue_id))
with check (private.has_atomic_permission('walkins.manage',organization_id,venue_id));
create policy phase2_walkins_delete on public.walk_ins
for delete to authenticated
using (private.has_atomic_permission('walkins.manage',organization_id,venue_id));
