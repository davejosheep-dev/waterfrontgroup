begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table('public','guest_contact_points','canonical guest contacts exist');
select has_table('public','communication_consents','append-only consent ledger exists');
select has_table('public','communication_suppressions','suppression ledger exists');
select has_table('public','guest_identity_candidates','duplicate review queue exists');
select has_table('public','guest_merge_events','immutable merge events exist');
select has_table('public','marketing_segments','segments exist');
select has_table('public','marketing_segment_versions','segment versions exist');
select has_table('public','marketing_campaigns','campaigns exist');
select has_table('public','marketing_campaign_versions','campaign versions exist');
select has_table('public','campaign_audience_snapshots','audience snapshots exist');
select has_table('public','campaign_recipients','isolated marketing recipients exist');
select has_table('public','marketing_delivery_events','delivery evidence exists');
select has_table('public','marketing_preference_tokens','hashed preference tokens exist');

select ok((select bool_and(not marketing_email_send_enabled and not marketing_whatsapp_send_enabled and not marketing_exports_enabled and emergency_stop) from public.outlet_crm_marketing_settings),'all production send/export flags default off and emergency stop defaults on');
select is((select count(*) from public.communication_consents where capture_source in ('legacy_guest_boolean','phase2_public_request_unapproved_mapping') and status<>'unknown'),0::bigint,'legacy consent never widens to granted');
select is((select count(*) from public.guest_contact_points where source='legacy_guest_columns' and state<>'unverified'),0::bigint,'backfilled contacts are not marked verified');
select is((select count(*) from public.communication_consents where purpose='marketing' and status='granted' and (text_version is null or text_hash is null or evidence_hash is null)),0::bigint,'grants require complete evidence');
select is((select count(*) from public.marketing_campaigns where approved_by=creator_id),0::bigint,'campaign creator cannot be recorded as approver');
select is((select count(*) from public.campaign_recipients group by campaign_version_id,recipient_deduplication_key having count(*)>1),0::bigint,'approved version cannot contain a duplicate normalized recipient');

select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('guest_contact_points','communication_consents','communication_suppressions','guest_identity_candidates','guest_merge_events','marketing_segments','marketing_segment_versions','marketing_campaigns','marketing_campaign_versions','campaign_audience_snapshots','campaign_recipients','marketing_delivery_events','marketing_preference_tokens','privacy_requests')),'RLS is enabled on every sensitive Phase 4 table');
select ok(not has_table_privilege('anon','public.guest_contact_points','select'),'anonymous cannot read guest contacts');
select ok(not has_table_privilege('anon','public.communication_consents','select'),'anonymous cannot read consent evidence');
select ok(not has_table_privilege('anon','public.campaign_recipients','select'),'anonymous cannot read campaign audiences');
select ok(not has_function_privilege('anon','public.execute_guest_merge(uuid,uuid,text,jsonb,text)','execute'),'anonymous cannot execute guest merge');

select * from finish();
rollback;
