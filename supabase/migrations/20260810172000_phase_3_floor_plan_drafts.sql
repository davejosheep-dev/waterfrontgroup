-- Save editor changes into a new immutable draft version. Published versions
-- are never edited in place, which keeps historical service runs reproducible.
create or replace function public.save_floor_plan_draft(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_plan public.floor_plans;
  v_current public.floor_plan_versions;
  v_target public.floor_plan_versions;
  v_org uuid;
  v_venue uuid;
  v_next integer;
  v_item jsonb;
  v_table_id uuid;
  v_changed integer := 0;
  v_row_count integer := 0;
begin
  select * into v_plan from public.floor_plans where id=nullif(payload->>'floor_plan_id','')::uuid for update;
  if v_plan.id is null then raise exception 'FLOOR_PLAN_NOT_FOUND'; end if;
  v_org:=v_plan.organization_id; v_venue:=v_plan.venue_id;
  if auth.uid() is not null and not private.has_atomic_permission('floor_plans.manage',v_org,v_venue) then raise exception 'Not authorized'; end if;
  select * into v_current from public.floor_plan_versions where id=v_plan.current_version_id;
  if v_current.id is not null and v_current.status='draft' then
    v_target:=v_current;
  else
    select coalesce(max(version_number),0)+1 into v_next from public.floor_plan_versions where floor_plan_id=v_plan.id;
    insert into public.floor_plan_versions(floor_plan_id,version_number,status,canvas_width,canvas_height,source_version_id,created_by)
    values(v_plan.id,v_next,'draft',coalesce(v_current.canvas_width,1200),coalesce(v_current.canvas_height,760),v_current.id,auth.uid()) returning * into v_target;
    create temporary table if not exists floor_section_map(old_id uuid primary key,new_id uuid not null) on commit drop;
    truncate floor_section_map;
    if v_current.id is not null then
      insert into floor_section_map(old_id,new_id)
      select old_section.id,gen_random_uuid() from public.floor_sections old_section where old_section.floor_plan_version_id=v_current.id;
      insert into public.floor_sections(id,floor_plan_version_id,code,name,color,sort_order,service_section)
      select map.new_id,v_target.id,old_section.code,old_section.name,old_section.color,old_section.sort_order,old_section.service_section
      from floor_section_map map join public.floor_sections old_section on old_section.id=map.old_id;
      insert into public.floor_objects(floor_plan_version_id,section_id,object_type,table_id,label,x,y,width,height,rotation,z_index,style,accessible_label)
      select v_target.id,map.new_id,old_object.object_type,old_object.table_id,old_object.label,old_object.x,old_object.y,old_object.width,old_object.height,old_object.rotation,old_object.z_index,old_object.style,old_object.accessible_label
      from public.floor_objects old_object left join floor_section_map map on map.old_id=old_object.section_id
      where old_object.floor_plan_version_id=v_current.id;
    else
      insert into public.floor_sections(floor_plan_version_id,code,name,color,sort_order) values(v_target.id,'main','Main Dining','#2b766c',0);
    end if;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(payload->'objects','[]'::jsonb)) loop
    v_table_id:=nullif(v_item->>'table_id','')::uuid;
    if v_table_id is null then continue; end if;
    update public.floor_objects set x=coalesce((v_item->>'x')::numeric,x),y=coalesce((v_item->>'y')::numeric,y),width=coalesce((v_item->>'width')::numeric,width),height=coalesce((v_item->>'height')::numeric,height),rotation=coalesce((v_item->>'rotation')::numeric,rotation),label=coalesce(nullif(v_item->>'label',''),label),updated_at=now()
    where floor_plan_version_id=v_target.id and object_type='table' and table_id=v_table_id;
    get diagnostics v_row_count = row_count;
    v_changed:=v_changed+v_row_count;
  end loop;
  update public.floor_plan_versions set validation_summary=public.validate_floor_plan_version(v_target.id),updated_at=now() where id=v_target.id;
  update public.floor_plans set status='draft',updated_at=now() where id=v_plan.id;
  return jsonb_build_object('floorPlanId',v_plan.id,'versionId',v_target.id,'versionNumber',v_target.version_number,'status','draft','changedObjects',v_changed,'validation',public.validate_floor_plan_version(v_target.id));
end $$;

revoke execute on function public.save_floor_plan_draft(jsonb) from public,anon;
grant execute on function public.save_floor_plan_draft(jsonb) to authenticated,service_role;

