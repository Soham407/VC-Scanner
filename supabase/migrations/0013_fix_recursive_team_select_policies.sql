drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
on public.teams
for select
to authenticated
using (
  exists (
    select 1
    from public.team_memberships memberships
    where memberships.team_id = teams.id
      and memberships.user_id = auth.uid()
  )
);

drop policy if exists "team_leaders_select_self_or_creator" on public.team_leaders;
create policy "team_leaders_select_self_or_creator"
on public.team_leaders
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.team_memberships memberships
    where memberships.team_id = team_leaders.team_id
      and memberships.user_id = auth.uid()
  )
);
