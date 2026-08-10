-- Idempotent development data. The Sydney venue is explicitly a training fixture
-- used to verify cross-time-zone and venue-scope behavior; it is not a public outlet.
insert into public.organizations(name,slug,default_currency,default_locale)
values ('Waterfront Group','waterfront-group','PHP','en-PH')
on conflict(slug) do update set name=excluded.name;

with organization as (select id from public.organizations where slug='waterfront-group')
insert into public.outlets (organization_id,name,code,slug,timezone,currency,locale,booking_state) values
((select id from organization),'Waterfront Seafood & Cocktails','ILOILO','waterfront-seafood-cocktails','Asia/Manila','PHP','en-PH','open'),
((select id from organization),'Waterfront Training Venue · Sydney','SYD-TRAIN','waterfront-training-sydney','Australia/Sydney','AUD','en-AU','draft')
on conflict (slug) do update set organization_id=excluded.organization_id,name=excluded.name,code=excluded.code,timezone=excluded.timezone,currency=excluded.currency,locale=excluded.locale,booking_state=excluded.booking_state;

with o as (select id from public.outlets where slug='waterfront-seafood-cocktails')
insert into public.dining_areas(outlet_id,name,resource_type,capacity,minimum_duration_minutes,default_duration_minutes,grace_period_minutes,reset_buffer_minutes)
select id,'Main Dining Area','main_dining',60,null,120,0,10 from o union all
select id,'VIP Room','private_room',24,180,240,30,10 from o
on conflict (outlet_id,name) do update set capacity=excluded.capacity,minimum_duration_minutes=excluded.minimum_duration_minutes,default_duration_minutes=excluded.default_duration_minutes,grace_period_minutes=excluded.grace_period_minutes,reset_buffer_minutes=excluded.reset_buffer_minutes;

insert into public.outlet_policies(outlet_id,large_party_threshold,default_main_dining_duration_minutes,main_dining_reset_buffer_minutes,regular_reminder_lead_hours,large_party_reminder_lead_days)
select id,10,120,10,24,7 from public.outlets where slug='waterfront-seafood-cocktails'
on conflict (outlet_id) do update set large_party_threshold=excluded.large_party_threshold;

-- Placement transcribed from the Waterfront floor-plan reference supplied by management.
-- Table capacities remain unconfirmed; the Main Dining area hard limit remains 60 guests.
with a as (select id from public.dining_areas where name='Main Dining Area' and outlet_id=(select id from public.outlets where slug='waterfront-seafood-cocktails')),
t(code,table_type,min_cap,max_cap,x,y,w,h,rotation,zone) as (values
('T1-01','T1',1,2,11,16,6.5,9,0,'left_dining'),('T1-02','T1',1,2,22,16,6.5,9,0,'left_dining'),
('T1-03','T1',1,2,33,16,6.5,9,0,'left_dining'),('T1-04','T1',1,2,43,16,6.5,9,0,'left_dining'),
('T1-05','T1',1,2,19,33,6.5,9,0,'left_dining'),('T1-06','T1',1,2,29,33,6.5,9,0,'left_dining'),
('T1-07','T1',1,2,19,50,6.5,9,0,'left_dining'),('T1-08','T1',1,2,29,50,6.5,9,0,'left_dining'),
('T1-09','T1',1,2,43,39,6.5,9,90,'left_dining'),
('T2-01','T2',2,4,11,32,8,13,0,'left_dining'),('T2-02','T2',2,4,11,48,8,13,0,'left_dining'),
('T2-03','T2',2,4,11,65,8,13,0,'left_dining'),('T2-04','T2',2,4,35,32,8,13,0,'left_dining'),
('T2-05','T2',2,4,35,48,8,13,0,'left_dining'),('T2-06','T2',2,4,35,65,8,13,0,'left_dining'),
('T2-07','T2',2,4,51,25,8,13,0,'center_dining'),('T2-08','T2',2,4,62,25,8,13,0,'center_dining'),
('T2-09','T2',2,4,51,44,8,13,0,'center_dining'),('T2-10','T2',2,4,62,44,8,13,0,'center_dining'),
('T2-11','T2',2,4,51,64,8,13,0,'center_dining'),('T2-12','T2',2,4,62,64,8,13,0,'center_dining'),
('T2-13','T2',2,4,75,55,8,13,90,'right_dining'),('T2-14','T2',2,4,84,55,8,13,90,'right_dining'),
('T2-15','T2',2,4,92,55,8,13,90,'right_dining'),('T2-16','T2',2,4,75,76,8,13,0,'right_dining'),
('T2-17','T2',2,4,84,76,8,13,0,'right_dining'),('T2-18','T2',2,4,93,76,8,13,0,'right_dining'),
('T3-01','T3',2,4,74,20,7.5,10,45,'right_dining'),('T3-02','T3',2,4,85,20,7.5,10,45,'right_dining'),
('T3-03','T3',2,4,74,36,7.5,10,45,'right_dining'),('T3-04','T3',2,4,85,36,7.5,10,45,'right_dining'))
insert into public.dining_tables(dining_area_id,code,table_type,minimum_capacity,maximum_capacity,position_x,position_y,floor_width,floor_height,rotation_degrees,floor_zone,seat_capacity_confirmed,notes,is_development_placeholder)
select a.id,t.code,t.table_type,t.min_cap,t.max_cap,t.x,t.y,t.w,t.h,t.rotation,t.zone,false,'Placement from supplied Waterfront reference; confirm operational capacity before production',false from a cross join t
on conflict (dining_area_id,code) do update set table_type=excluded.table_type,position_x=excluded.position_x,position_y=excluded.position_y,floor_width=excluded.floor_width,floor_height=excluded.floor_height,rotation_degrees=excluded.rotation_degrees,floor_zone=excluded.floor_zone,notes=excluded.notes;

with a as (select id from public.dining_areas where name='Main Dining Area' and outlet_id=(select id from public.outlets where slug='waterfront-seafood-cocktails'))
insert into public.table_combinations(dining_area_id,name,minimum_capacity,maximum_capacity,is_development_placeholder)
select id,'T1-05 + T1-06',2,4,false from a on conflict (dining_area_id,name) do update set minimum_capacity=excluded.minimum_capacity,maximum_capacity=excluded.maximum_capacity;
insert into public.table_combination_members(combination_id,table_id)
select c.id,t.id from public.table_combinations c join public.dining_tables t on t.dining_area_id=c.dining_area_id and t.code in ('T1-05','T1-06') where c.name='T1-05 + T1-06' on conflict do nothing;

with o as (select id from public.outlets where slug='waterfront-seafood-cocktails'), d as (select generate_series(0,6)::smallint day)
insert into public.operating_hours(outlet_id,day_of_week,open_time,close_time,active,service_label)
select o.id,d.day,'10:00','22:00',true,'All day' from o cross join d on conflict (outlet_id,day_of_week,service_label) do nothing;

with o as (select id from public.outlets where slug='waterfront-seafood-cocktails'), s(name,sort_order) as (values
('Facebook Messenger',1),('Instagram',2),('WhatsApp',3),('Viber',4),('Phone',5),('Landline',6),('Email',7),('Walk-in',8),('Referral',9),('Corporate account',10),('Other',11))
insert into public.inquiry_sources(outlet_id,name,sort_order) select o.id,s.name,s.sort_order from o cross join s on conflict (outlet_id,name) do update set sort_order=excluded.sort_order;

with organization as (select id from public.organizations where slug='waterfront-group'),
sources(code,display_name,channel_category,sort_order) as (values
  ('website','Website','owned',1),('facebook','Facebook','social',2),('instagram','Instagram','social',3),
  ('whatsapp','WhatsApp','messaging',4),('viber','Viber','messaging',5),('phone','Phone','phone',6),
  ('email','Email','email',7),('walk_in','Walk-in','walk_in',8),('staff_entry','Staff Entry','staff',9),
  ('google','Google','search',10),('partner','Partner','partner',11)
)
insert into public.booking_sources(organization_id,venue_id,code,display_name,channel_category,sort_order)
select organization.id,null,sources.code,sources.display_name,sources.channel_category,sources.sort_order from organization cross join sources
on conflict(organization_id,venue_id,code) do update set display_name=excluded.display_name,channel_category=excluded.channel_category,sort_order=excluded.sort_order,active=true;
