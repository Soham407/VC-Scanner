create or replace function public.list_pending_team_invites_for_current_user()
returns table(
  id uuid,
  team_id uuid,
  team_name text,
  team_leader_email text,
  invited_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  if current_email = '' then
    raise exception 'Authenticated email required';
  end if;

  return query
  select
    invites.id,
    invites.team_id,
    teams.name::text as team_name,
    inviter.email::text as team_leader_email,
    invites.invited_email::text,
    invites.created_at
  from public.team_invites invites
  join public.teams teams on teams.id = invites.team_id
  join auth.users inviter on inviter.id = invites.invited_by
  where invites.invited_email_normalized = current_email
    and invites.status = 'pending'
  order by invites.created_at asc;
end;
$$;

revoke all on function public.list_pending_team_invites_for_current_user() from public;
grant execute on function public.list_pending_team_invites_for_current_user() to authenticated;
