-- Normalize users.role to user/admin/owner and enforce constraint.
-- Keeps compatibility for previous 'regular' baseline role by converting it to 'user'.

alter table if exists public.users
  add column if not exists role text;

update public.users
set role = lower(btrim(coalesce(role, '')));

update public.users
set role = 'user'
where role in ('', 'regular') or role is null;

-- Any unexpected value is safely downgraded to user.
update public.users
set role = 'user'
where role not in ('user', 'admin', 'owner');

alter table public.users
  alter column role set default 'user';

alter table public.users
  alter column role set not null;

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('user', 'admin', 'owner'));

create index if not exists users_role_idx
  on public.users (role);
