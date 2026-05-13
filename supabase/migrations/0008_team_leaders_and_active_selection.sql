create table if not exists public.team_leaders (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.team_leaders enable row level security;

create or replace function public.is_team_leader(target_team_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
set row_security = off
as $$
  select exists (
    select 1
    from public.teams teams
    where teams.id = target_team_id
      and teams.created_by = target_user_id
  ) or exists (
    select 1
    from public.team_leaders leaders
    where leaders.team_id = target_team_id
      and leaders.user_id = target_user_id
  );
$$;

drop policy if exists "team_leaders_select_self_or_creator" on public.team_leaders;
create policy "team_leaders_select_self_or_creator"
on public.team_leaders
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_team_leader(team_leaders.team_id, auth.uid())
);

create or replace function public.promote_team_member_to_leader(target_team_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  if not public.is_team_leader(target_team_id, current_user_id) then
    raise exception 'Only a team leader can promote another leader';
  end if;

  if not exists (
    select 1
    from public.team_memberships memberships
    where memberships.team_id = target_team_id
      and memberships.user_id = target_user_id
  ) then
    raise exception 'Target user must already be a team member';
  end if;

  insert into public.team_leaders (team_id, user_id)
  values (target_team_id, target_user_id)
  on conflict (team_id, user_id) do nothing;
end;
$$;

revoke all on function public.promote_team_member_to_leader(uuid, uuid) from public;
grant execute on function public.promote_team_member_to_leader(uuid, uuid) to authenticated;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
on public.teams
for select
using (
  public.is_team_leader(teams.id, auth.uid())
  or exists (
    select 1
    from public.team_memberships memberships
    where memberships.team_id = teams.id
      and memberships.user_id = auth.uid()
  )
);

drop policy if exists "team_invites_select_leader_or_invited" on public.team_invites;
create policy "team_invites_select_leader_or_invited"
on public.team_invites
for select
to authenticated
using (
  public.is_team_leader(team_invites.team_id, auth.uid())
  or lower(coalesce(auth.jwt() ->> 'email', '')) = team_invites.invited_email_normalized
);

drop policy if exists "team_invites_insert_leader" on public.team_invites;
create policy "team_invites_insert_leader"
on public.team_invites
for insert
to authenticated
with check (
  auth.uid() = invited_by
  and status = 'pending'
  and responded_at is null
  and invited_user_id is null
  and public.is_team_leader(team_invites.team_id, auth.uid())
);

drop policy if exists "lead_assignments_select_leader_or_worker" on public.lead_assignments;
create policy "lead_assignments_select_leader_or_worker"
on public.lead_assignments
for select
to authenticated
using (
  assigned_to_user_id = auth.uid()
  or public.is_team_leader(lead_assignments.team_id, auth.uid())
);

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
to authenticated
using (
  auth.uid() = user_id
  or (
    team_id is not null
    and public.is_team_leader(scanned_leads.team_id, auth.uid())
  )
  or exists (
    select 1
    from public.lead_assignments assignments
    where assignments.scanned_lead_id = scanned_leads.id
      and assignments.assigned_to_user_id = auth.uid()
  )
);

drop policy if exists "team_assignment_batches_select_member" on public.team_assignment_batches;
create policy "team_assignment_batches_select_member"
on public.team_assignment_batches
for select
to authenticated
using (
  public.is_team_leader(team_assignment_batches.team_id, auth.uid())
);

drop policy if exists "team_assignment_batch_items_select_member" on public.team_assignment_batch_items;
create policy "team_assignment_batch_items_select_member"
on public.team_assignment_batch_items
for select
to authenticated
using (
  exists (
    select 1
    from public.team_assignment_batches batches
    where batches.id = team_assignment_batch_items.batch_id
      and public.is_team_leader(batches.team_id, auth.uid())
  )
);

drop policy if exists "lead_assignments_update_worker_state" on public.lead_assignments;
create policy "lead_assignments_update_worker_state"
on public.lead_assignments
for update
to authenticated
using (assigned_to_user_id = auth.uid())
with check (assigned_to_user_id = auth.uid());

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
