create or replace function public.list_team_members(target_team_id uuid)
returns table(
  user_id uuid,
  email text,
  created_at timestamptz,
  is_leader boolean
)
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

  if not exists (
    select 1
    from public.team_memberships memberships
    where memberships.team_id = target_team_id
      and memberships.user_id = current_user_id
  ) and not public.is_team_leader(target_team_id, current_user_id) then
    raise exception 'Only a team member can list team members';
  end if;

  return query
  select
    memberships.user_id,
    users.email::text,
    memberships.created_at,
    public.is_team_leader(target_team_id, memberships.user_id)::boolean as is_leader
  from public.team_memberships memberships
  join auth.users users on users.id = memberships.user_id
  where memberships.team_id = target_team_id
  order by memberships.created_at asc;
end;
$$;

revoke all on function public.list_team_members(uuid) from public;
grant execute on function public.list_team_members(uuid) to authenticated;
