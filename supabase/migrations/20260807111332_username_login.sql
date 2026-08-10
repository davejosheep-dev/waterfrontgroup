-- Staff usernames are an application-level alias. Supabase Auth continues to
-- authenticate the underlying verified email identity.
alter table public.staff_profiles add column username text;

update public.staff_profiles
set username = left(
  case
    when lower(split_part(coalesce(email, 'staff'), '@', 1)) ~ '^[a-z]'
      then regexp_replace(lower(split_part(coalesce(email, 'staff'), '@', 1)), '[^a-z0-9._-]', '', 'g')
    else 'staff'
  end,
  22
) || '_' || left(replace(user_id::text, '-', ''), 8);

alter table public.staff_profiles
  alter column username set not null,
  add constraint staff_profiles_username_format_check
    check (username = lower(username) and username ~ '^[a-z][a-z0-9._-]{2,31}$');

create unique index staff_profiles_username_unique_idx on public.staff_profiles(username);
comment on column public.staff_profiles.username is 'Private staff login alias. Resolved to the verified Auth email only on the server.';
