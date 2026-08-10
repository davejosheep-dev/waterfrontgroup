-- Keep the reference plan within the 0â€“100 coordinate system. The supplied
-- drawing placed T2-18 at x=93 with an 8% width, which clips one percent of
-- the canvas and should be surfaced as a validator error rather than shipped.
update public.floor_plan_versions v
set status='draft',updated_at=now()
where v.status='published'
  and exists(select 1 from public.floor_plans p where p.id=v.floor_plan_id and p.name='Main Dining Â· Waterfront Reference');

update public.floor_objects fo
set x=least(100-fo.width,fo.x),updated_at=now()
where fo.object_type='table' and fo.label='T2-18'
  and fo.x+fo.width>100;

update public.floor_plan_versions v
set validation_summary=public.validate_floor_plan_version(v.id),status='published',published_at=coalesce(v.published_at,now()),effective_at=coalesce(v.effective_at,now()),updated_at=now()
where v.status='draft'
  and exists(select 1 from public.floor_plans p where p.id=v.floor_plan_id and p.name='Main Dining Â· Waterfront Reference');

