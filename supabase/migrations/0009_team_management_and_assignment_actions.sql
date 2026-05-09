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

  if not public.is_team_leader(target_team_id, current_user_id) then
    raise exception 'Only a team leader can list team members';
  end if;

  return query
  select
    memberships.user_id,
    users.email,
    memberships.created_at,
    public.is_team_leader(target_team_id, memberships.user_id) as is_leader
  from public.team_memberships memberships
  join auth.users users on users.id = memberships.user_id
  where memberships.team_id = target_team_id
  order by memberships.created_at asc;
end;
$$;

revoke all on function public.list_team_members(uuid) from public;
grant execute on function public.list_team_members(uuid) to authenticated;

create or replace function public.update_team_assignment_state(
  target_scanned_lead_id uuid,
  target_assignment_state text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;

  if target_assignment_state not in ('assigned', 'done', 'needs_review') then
    raise exception 'Unsupported assignment state';
  end if;

  update public.lead_assignments
  set assignment_state = target_assignment_state,
      updated_at = now()
  where scanned_lead_id = target_scanned_lead_id
    and assigned_to_user_id = auth.uid();

  if not found then
    raise exception 'Assignment not found or not assigned to current user';
  end if;
end;
$$;

revoke all on function public.update_team_assignment_state(uuid, text) from public;
grant execute on function public.update_team_assignment_state(uuid, text) to authenticated;
