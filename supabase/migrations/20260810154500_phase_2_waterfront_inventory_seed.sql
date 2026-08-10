-- Seed the initial Waterfront Seafood & Cocktails inventory from the supplied
-- floor-plan reference. The records are real booking inventory, not UI demo
-- rows; managers can refine positions and combinations in the next phase.
with venue as (
  select id, organization_id
  from public.outlets
  where slug = 'waterfront-seafood-cocktails' and active
  limit 1
)
insert into public.dining_areas(
  outlet_id, name, resource_type, capacity, active,
  minimum_duration_minutes, default_duration_minutes, grace_period_minutes,
  reset_buffer_minutes
)
select venue.id, 'Main Dining', 'main_dining', 91, true, 60, 120, 10, 10
from venue
on conflict (outlet_id, name) do update
set capacity = excluded.capacity,
    active = true,
    minimum_duration_minutes = excluded.minimum_duration_minutes,
    default_duration_minutes = excluded.default_duration_minutes,
    grace_period_minutes = excluded.grace_period_minutes,
    reset_buffer_minutes = excluded.reset_buffer_minutes;

with area as (
  select da.id
  from public.dining_areas da
  join public.outlets o on o.id = da.outlet_id
  where o.slug = 'waterfront-seafood-cocktails' and da.name = 'Main Dining'
  limit 1
), inventory as (
  select 'T1-' || lpad(n::text, 2, '0') as code, 1 as minimum_capacity, 2 as maximum_capacity, 'T1' as table_type, 3 as priority
  from generate_series(1, 9) as values_1(n)
  union all
  select 'T2-' || lpad(n::text, 2, '0'), 1, 4, 'T2', 2
  from generate_series(1, 18) as values_2(n)
  union all
  select 'T3-' || lpad(n::text, 2, '0'), 1, 4, 'T3', 1
  from generate_series(1, 4) as values_3(n)
)
insert into public.dining_tables(
  dining_area_id, code, minimum_capacity, maximum_capacity, active,
  table_type, priority, online_eligible, staff_eligible,
  seat_capacity_confirmed, is_development_placeholder, notes
)
select area.id, inventory.code, inventory.minimum_capacity, inventory.maximum_capacity, true,
       inventory.table_type, inventory.priority, true, true, false, false,
       'Waterfront reference floor-plan inventory; verify final seat map during Phase 3 setup.'
from area cross join inventory
on conflict (dining_area_id, code) do update
set minimum_capacity = excluded.minimum_capacity,
    maximum_capacity = excluded.maximum_capacity,
    active = true,
    table_type = excluded.table_type,
    priority = excluded.priority,
    online_eligible = true,
    staff_eligible = true,
    is_development_placeholder = false,
    notes = excluded.notes;

with area as (
  select da.id
  from public.dining_areas da
  join public.outlets o on o.id = da.outlet_id
  where o.slug = 'waterfront-seafood-cocktails' and da.name = 'Main Dining'
  limit 1
), pairs(name, first_code, second_code) as (
  values
    ('T2-01 + T2-02','T2-01','T2-02'),('T2-03 + T2-04','T2-03','T2-04'),
    ('T2-05 + T2-06','T2-05','T2-06'),('T2-07 + T2-08','T2-07','T2-08'),
    ('T2-09 + T2-10','T2-09','T2-10'),('T2-11 + T2-12','T2-11','T2-12'),
    ('T2-13 + T2-14','T2-13','T2-14'),('T2-15 + T2-16','T2-15','T2-16'),
    ('T2-17 + T2-18','T2-17','T2-18')
), combinations as (
  insert into public.table_combinations(
    dining_area_id, name, minimum_capacity, maximum_capacity, active,
    online_eligible, staff_eligible, priority, is_development_placeholder
  )
  select area.id, pairs.name, 5, 8, true, true, true, 0, false
  from area cross join pairs
  on conflict (dining_area_id, name) do update
  set minimum_capacity = excluded.minimum_capacity,
      maximum_capacity = excluded.maximum_capacity,
      active = true,
      online_eligible = true,
      staff_eligible = true,
      is_development_placeholder = false
  returning id, dining_area_id, name
)
insert into public.table_combination_members(combination_id, table_id)
select combinations.id, tables.id
from combinations
join pairs on pairs.name = combinations.name
join public.dining_tables tables on tables.dining_area_id = combinations.dining_area_id
  and tables.code in (pairs.first_code, pairs.second_code)
on conflict do nothing;

-- Give the initial layout a few useful preference signals without promising
-- that every plan label is final; the manager can change these mappings later.
with venue_area as (
  select da.id as area_id
  from public.dining_areas da
  join public.outlets o on o.id = da.outlet_id
  where o.slug = 'waterfront-seafood-cocktails' and da.name = 'Main Dining'
  limit 1
), feature_map(code, feature_code) as (
  values ('T1-01','window'),('T1-02','window'),('T2-17','outdoor'),('T2-18','outdoor'),('T3-01','quiet')
)
insert into public.dining_table_features(table_id, feature_id)
select tables.id, features.id
from venue_area
join public.dining_tables tables on tables.dining_area_id = venue_area.area_id
join feature_map on feature_map.code = tables.code
join public.outlets outlets on outlets.id = (select da.outlet_id from public.dining_areas da where da.id = venue_area.area_id)
join public.table_features features on features.organization_id = outlets.organization_id and features.code = feature_map.feature_code
on conflict do nothing;

-- Make the default turn and pacing decisions explicit in versioned rules.
insert into public.reservation_rules(
  organization_id, venue_id, service_period_id, configuration_version_id,
  rule_type, name, priority, channel, value
)
select sp.organization_id, sp.venue_id, sp.id, cv.id, 'duration', 'Standard dining turn', 0, null,
       jsonb_build_object('durationMinutes', sp.default_duration_minutes)
from public.service_periods sp
join public.reservation_configuration_versions cv on cv.venue_id = sp.venue_id and cv.version = sp.configuration_version
join public.outlets o on o.id = sp.venue_id and o.slug = 'waterfront-seafood-cocktails'
where not exists (
  select 1 from public.reservation_rules r
  where r.service_period_id = sp.id and r.rule_type = 'duration' and r.name = 'Standard dining turn'
);

insert into public.reservation_rules(
  organization_id, venue_id, service_period_id, configuration_version_id,
  rule_type, name, priority, channel, value
)
select sp.organization_id, sp.venue_id, sp.id, cv.id, 'pacing', 'Arrival pacing', 0, 'public',
       jsonb_build_object('intervalMinutes', 30, 'maxArrivals', 12)
from public.service_periods sp
join public.reservation_configuration_versions cv on cv.venue_id = sp.venue_id and cv.version = sp.configuration_version
join public.outlets o on o.id = sp.venue_id and o.slug = 'waterfront-seafood-cocktails'
where not exists (
  select 1 from public.reservation_rules r
  where r.service_period_id = sp.id and r.rule_type = 'pacing' and r.name = 'Arrival pacing'
);
