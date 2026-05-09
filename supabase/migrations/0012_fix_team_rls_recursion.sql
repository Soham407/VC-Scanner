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

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
on public.teams
for select
to authenticated
using (
  public.is_team_leader(teams.id, auth.uid())
  or exists (
    select 1
    from public.team_memberships memberships
    where memberships.team_id = teams.id
      and memberships.user_id = auth.uid()
  )
);
