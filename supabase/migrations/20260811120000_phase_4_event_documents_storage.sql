-- Events refinement: private attachments, generated document metadata, and
-- immutable document versions. This migration is additive and intentionally
-- must be applied through the normal Supabase review/release workflow.

alter table public.event_documents
  add column if not exists source_type text not null default 'upload'
    check (source_type in ('upload', 'generated')),
  add column if not exists mime_type text,
  add column if not exists byte_size bigint,
  add column if not exists document_version integer not null default 1
    check (document_version > 0);

create index if not exists event_documents_event_created_idx
  on public.event_documents(event_id, created_at desc);

create or replace function private.prevent_event_document_mutation()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  raise exception using errcode = '55000', message = 'EVENT_DOCUMENT_IMMUTABLE';
end;
$$;

drop trigger if exists event_document_immutable on public.event_documents;
create trigger event_document_immutable
before update or delete on public.event_documents
for each row execute function private.prevent_event_document_mutation();

drop policy if exists event_documents_manage on public.event_documents;
create policy event_documents_manage
on public.event_documents
for insert to authenticated
with check (private.has_atomic_permission('event_documents.manage', organization_id, venue_id));

grant insert on public.event_documents to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-files',
  'event-files',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_files_select on storage.objects;
create policy event_files_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'event-files'
  and exists (
    select 1
    from public.event_documents d
    where d.storage_path = name
      and private.has_atomic_permission('event_documents.read', d.organization_id, d.venue_id)
  )
);

drop policy if exists event_files_insert on storage.objects;
create policy event_files_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'event-files'
  and exists (
    select 1
    from public.events e
    where e.organization_id::text = (storage.foldername(name))[1]
      and e.id::text = (storage.foldername(name))[2]
      and private.has_atomic_permission('event_documents.manage', e.organization_id, e.venue_id)
  )
);

drop policy if exists event_files_delete on storage.objects;
create policy event_files_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'event-files'
  and exists (
    select 1
    from public.events e
    where e.organization_id::text = (storage.foldername(name))[1]
      and e.id::text = (storage.foldername(name))[2]
      and private.has_atomic_permission('event_documents.manage', e.organization_id, e.venue_id)
  )
);
