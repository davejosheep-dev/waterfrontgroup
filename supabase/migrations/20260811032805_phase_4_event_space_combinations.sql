-- A combination consumes every physical member in the hold/assignment ledger.
with venue as (select id,organization_id from public.outlets where slug='waterfront-seafood-cocktails')
insert into public.event_space_combinations(organization_id,venue_id,code,name,min_capacity,max_capacity,priority)
select venue.organization_id,venue.id,'GARDEN_TERRACE','Garden + Terrace',32,168,10 from venue
on conflict(venue_id,code) do update set name=excluded.name,min_capacity=excluded.min_capacity,max_capacity=excluded.max_capacity,priority=excluded.priority,active=true;

with venue as (select id,organization_id from public.outlets where slug='waterfront-seafood-cocktails'), combination as (select c.id,c.organization_id from public.event_space_combinations c join venue on venue.id=c.venue_id where c.code='GARDEN_TERRACE'), spaces as (select es.id,es.organization_id from public.event_spaces es join venue on venue.id=es.venue_id where es.code in ('GARDEN','TERRACE'))
insert into public.event_space_combination_members(organization_id,combination_id,space_id)
select combination.organization_id,combination.id,spaces.id from combination cross join spaces on conflict do nothing;
