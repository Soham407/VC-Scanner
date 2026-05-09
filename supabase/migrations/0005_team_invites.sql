create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  invited_email text not null,
  invited_email_normalized text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_invites_email_normalized_check
    check (invited_email_normalized = lower(trim(invited_email)))
);

create unique index if not exists team_invites_pending_unique_idx
  on public.team_invites(team_id, invited_email_normalized)
  where status = 'pending';

create index if not exists team_invites_email_status_idx
  on public.team_invites(invited_email_normalized, status, created_at);

alter table public.team_invites enable row level security;

drop policy if exists "team_invites_select_leader_or_invited" on public.team_invites;
create policy "team_invites_select_leader_or_invited"
on public.team_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.teams
    where teams.id = team_invites.team_id
      and teams.created_by = auth.uid()
  )
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
  and exists (
    select 1
    from public.teams
    where teams.id = team_invites.team_id
      and teams.created_by = auth.uid()
  )
);

create or replace function public.respond_to_team_invite(invite_id uuid, decision text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target_invite public.team_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  if current_email = '' then
    raise exception 'Authenticated email required';
  end if;

  if decision not in ('accept', 'decline') then
    raise exception 'Unsupported invite decision';
  end if;

  select *
  into target_invite
  from public.team_invites
  where id = invite_id
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if target_invite.status <> 'pending' then
    raise exception 'Invite is no longer pending';
  end if;

  if target_invite.invited_email_normalized <> current_email then
    raise exception 'Invite email mismatch';
  end if;

  if decision = 'accept' then
    insert into public.team_memberships (team_id, user_id)
    values (target_invite.team_id, current_user_id)
    on conflict (team_id, user_id) do nothing;

    update public.team_invites
    set
      invited_user_id = current_user_id,
      responded_at = now(),
      status = 'accepted'
    where id = target_invite.id;
  else
    update public.team_invites
    set
      invited_user_id = null,
      responded_at = now(),
      status = 'declined'
    where id = target_invite.id;
  end if;
end;
$$;

revoke all on function public.respond_to_team_invite(uuid, text) from public;
grant execute on function public.respond_to_team_invite(uuid, text) to authenticated;
