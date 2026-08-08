create extension if not exists "uuid-ossp";

create table if not exists public.call_sessions (
  id uuid primary key,
  caller_id uuid not null,
  recipient_id uuid not null,
  room_name text not null unique,
  status text not null check (status in ('ringing','connecting','active','declined','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_call_sessions_recipient_status_created
  on public.call_sessions (recipient_id, status, created_at desc);

create index if not exists idx_call_sessions_caller_status_created
  on public.call_sessions (caller_id, status, created_at desc);

alter table public.call_sessions
  add constraint call_sessions_caller_recipient_check
  check (caller_id <> recipient_id);

alter table public.call_sessions
  alter column room_name set not null;

alter table public.call_sessions
  enable row level security;

create policy if not exists call_sessions_select_participants
  on public.call_sessions
  for select
  using (
    auth.uid() is not null
    and (auth.uid() = caller_id or auth.uid() = recipient_id)
  );

create policy if not exists call_sessions_insert_participants
  on public.call_sessions
  for insert
  with check (
    auth.uid() is not null
    and auth.uid() = caller_id
    and auth.uid() <> recipient_id
  );

create policy if not exists call_sessions_update_participants
  on public.call_sessions
  for update
  using (
    auth.uid() is not null
    and (auth.uid() = caller_id or auth.uid() = recipient_id)
  )
  with check (
    auth.uid() is not null
    and (auth.uid() = caller_id or auth.uid() = recipient_id)
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_sessions'
  ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;
end $$;
