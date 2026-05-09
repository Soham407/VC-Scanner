create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_memberships (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.user_team_contexts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint user_team_contexts_membership_fk
    foreign key (team_id, user_id)
    references public.team_memberships (team_id, user_id)
    on delete cascade
);

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.user_team_contexts enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
on public.teams
for select
using (
  exists (
    select 1
    from public.team_memberships memberships
    where memberships.team_id = teams.id
      and memberships.user_id = auth.uid()
  )
);

drop policy if exists "teams_insert_creator" on public.teams;
create policy "teams_insert_creator"
on public.teams
for insert
with check (auth.uid() = created_by);

drop policy if exists "teams_update_creator" on public.teams;
create policy "teams_update_creator"
on public.teams
for update
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "teams_delete_creator" on public.teams;
create policy "teams_delete_creator"
on public.teams
for delete
using (auth.uid() = created_by);

drop policy if exists "team_memberships_select_own" on public.team_memberships;
create policy "team_memberships_select_own"
on public.team_memberships
for select
using (auth.uid() = user_id);

drop policy if exists "team_memberships_insert_own" on public.team_memberships;
create policy "team_memberships_insert_own"
on public.team_memberships
for insert
with check (auth.uid() = user_id);

drop policy if exists "team_memberships_delete_own" on public.team_memberships;
create policy "team_memberships_delete_own"
on public.team_memberships
for delete
using (auth.uid() = user_id);

drop policy if exists "user_team_contexts_select_own" on public.user_team_contexts;
create policy "user_team_contexts_select_own"
on public.user_team_contexts
for select
using (auth.uid() = user_id);

drop policy if exists "user_team_contexts_insert_own_member" on public.user_team_contexts;
create policy "user_team_contexts_insert_own_member"
on public.user_team_contexts
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.team_memberships memberships
    where memberships.user_id = auth.uid()
      and memberships.team_id = user_team_contexts.team_id
  )
);

drop policy if exists "user_team_contexts_update_own_member" on public.user_team_contexts;
create policy "user_team_contexts_update_own_member"
on public.user_team_contexts
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.team_memberships memberships
    where memberships.user_id = auth.uid()
      and memberships.team_id = user_team_contexts.team_id
  )
);

drop policy if exists "user_team_contexts_delete_own" on public.user_team_contexts;
create policy "user_team_contexts_delete_own"
on public.user_team_contexts
for delete
using (auth.uid() = user_id);

alter table public.scanned_leads
add column if not exists team_id uuid references public.teams(id) on delete set null;

create index if not exists scanned_leads_team_id_idx on public.scanned_leads(team_id);

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
using (
  auth.uid() = user_id
  or (
    team_id is not null
    and exists (
      select 1
      from public.team_memberships memberships
      where memberships.team_id = scanned_leads.team_id
        and memberships.user_id = auth.uid()
    )
  )
);

drop policy if exists "scanned_leads_insert_own" on public.scanned_leads;
create policy "scanned_leads_insert_own"
on public.scanned_leads
for insert
with check (
  auth.uid() = user_id
  and (
    team_id is null
    or exists (
      select 1
      from public.team_memberships memberships
      where memberships.team_id = scanned_leads.team_id
        and memberships.user_id = auth.uid()
    )
  )
);

drop policy if exists "scanned_leads_update_own" on public.scanned_leads;
create policy "scanned_leads_update_own"
on public.scanned_leads
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    team_id is null
    or exists (
      select 1
      from public.team_memberships memberships
      where memberships.team_id = scanned_leads.team_id
        and memberships.user_id = auth.uid()
    )
  )
);
