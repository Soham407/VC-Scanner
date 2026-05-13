create or replace function public.create_team(team_name text)
returns public.teams
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  created_team public.teams;
  trimmed_name text := nullif(trim(team_name), '');
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  if trimmed_name is null then
    raise exception 'Team name is required';
  end if;

  insert into public.teams (name, created_by)
  values (trimmed_name, current_user_id)
  returning * into created_team;

  insert into public.team_memberships (team_id, user_id)
  values (created_team.id, current_user_id)
  on conflict (team_id, user_id) do nothing;

  insert into public.user_team_contexts (user_id, team_id)
  values (current_user_id, created_team.id)
  on conflict (user_id) do update
  set team_id = excluded.team_id,
      updated_at = now();

  return created_team;
end;
$$;

revoke all on function public.create_team(text) from public;
grant execute on function public.create_team(text) to authenticated;
