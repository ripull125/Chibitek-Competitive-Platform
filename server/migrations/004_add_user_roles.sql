-- Add role-based permissions on users table.
-- Roles: owner, admin, regular

alter table if exists public.users
  add column if not exists role text;

-- Backfill existing NULL/empty roles to regular.
update public.users
set role = 'regular'
where role is null or btrim(role) = '';

-- If legacy admins table exists, map those users to admin role.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'admins'
  ) then
    update public.users u
    set role = 'admin'
    from public.admins a
    where lower(u.email) = lower(a.email)
      and u.role <> 'owner';
  end if;
end $$;

alter table public.users
  alter column role set default 'regular';

alter table public.users
  alter column role set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'users'
      and constraint_name = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('owner', 'admin', 'regular'));
  end if;
end $$;

create index if not exists users_role_idx
  on public.users (role);

-- Optional helper to set the first owner manually after migration:
-- update public.users set role = 'owner' where lower(email) = 'your-owner-email@example.com';