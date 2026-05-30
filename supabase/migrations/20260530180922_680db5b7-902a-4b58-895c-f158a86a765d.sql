
-- Enums
create type public.app_role as enum ('organizer', 'attendee');
create type public.session_status as enum ('scheduled', 'active', 'closed');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  registered_device_fingerprint text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Sessions
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  start_time timestamptz not null,
  end_time timestamptz not null,
  status public.session_status not null default 'scheduled',
  geo_lat double precision not null,
  geo_lng double precision not null,
  geo_radius_meters integer not null default 100,
  current_token text,
  token_expires_at timestamptz,
  short_code text,
  late_window_minutes integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.sessions (organizer_id);
create index on public.sessions (current_token);
grant select, insert, update, delete on public.sessions to authenticated;
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;

-- Session enrollments
create table public.session_attendees (
  session_id uuid not null references public.sessions(id) on delete cascade,
  attendee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, attendee_id)
);
grant select, insert, delete on public.session_attendees to authenticated;
grant all on public.session_attendees to service_role;
alter table public.session_attendees enable row level security;

-- Attendance records
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  attendee_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy double precision,
  device_fingerprint text,
  is_flagged boolean not null default false,
  flag_reason text,
  is_late boolean not null default false,
  unique (session_id, attendee_id)
);
create index on public.attendance_records (session_id);
grant select, update on public.attendance_records to authenticated;
grant all on public.attendance_records to service_role;
alter table public.attendance_records enable row level security;

-- RLS policies
-- profiles: read all authenticated (needed for organizer to see names), update own
create policy "profiles_select_all_auth" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid());

-- user_roles: select own
create policy "user_roles_select_own" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- sessions: organizer manages own; attendee can select if enrolled
create policy "sessions_organizer_all" on public.sessions for all to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "sessions_attendee_select_enrolled" on public.sessions for select to authenticated
  using (exists (select 1 from public.session_attendees sa where sa.session_id = sessions.id and sa.attendee_id = auth.uid()));

-- session_attendees: organizer manages own; attendee can see own enrollments
create policy "session_attendees_organizer_all" on public.session_attendees for all to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_attendees.session_id and s.organizer_id = auth.uid()))
  with check (exists (select 1 from public.sessions s where s.id = session_attendees.session_id and s.organizer_id = auth.uid()));
create policy "session_attendees_self_select" on public.session_attendees for select to authenticated
  using (attendee_id = auth.uid());

-- attendance_records: organizer of session sees+updates; attendee sees own
create policy "attendance_organizer_select" on public.attendance_records for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = attendance_records.session_id and s.organizer_id = auth.uid()));
create policy "attendance_organizer_update" on public.attendance_records for update to authenticated
  using (exists (select 1 from public.sessions s where s.id = attendance_records.session_id and s.organizer_id = auth.uid()));
create policy "attendance_attendee_select_own" on public.attendance_records for select to authenticated
  using (attendee_id = auth.uid());

-- Trigger: auto-create profile + role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.app_role;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, '')
  );

  v_role := coalesce(nullif(new.raw_user_meta_data->>'role',''), 'attendee')::public.app_role;
  insert into public.user_roles (user_id, role) values (new.id, v_role);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Realtime
alter publication supabase_realtime add table public.attendance_records;
alter publication supabase_realtime add table public.sessions;
