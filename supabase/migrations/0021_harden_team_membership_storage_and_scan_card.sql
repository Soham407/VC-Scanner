create or replace function public.create_team(team_name text)
returns public.teams
language plpgsql
security definer
set search_path = public, auth
set row_security = off
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

  if exists (
    select 1
    from public.team_memberships memberships
    where memberships.user_id = current_user_id
  ) then
    raise exception 'User already belongs to a team';
  end if;

  insert into public.teams (name, created_by)
  values (trimmed_name, current_user_id)
  returning * into created_team;

  insert into public.team_memberships (team_id, user_id)
  values (created_team.id, current_user_id);

  return created_team;
end;
$$;

revoke all on function public.create_team(text) from public;
grant execute on function public.create_team(text) to authenticated;

create or replace function public.respond_to_team_invite(invite_id uuid, decision text)
returns void
language plpgsql
security definer
set search_path = public, auth
set row_security = off
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
    if exists (
      select 1
      from public.team_memberships memberships
      where memberships.user_id = current_user_id
    ) then
      raise exception 'User already belongs to a team';
    end if;

    insert into public.team_memberships (team_id, user_id)
    values (target_invite.team_id, current_user_id);

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

create or replace function public.card_image_lead_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  file_name text;
  lead_id_text text;
  lead_match text[];
begin
  if object_name is null then
    return null;
  end if;

  if position('/' in object_name) = 0 then
    return null;
  end if;

  file_name := split_part(object_name, '/', 2);

  if file_name = '' then
    return null;
  end if;

  lead_match := regexp_match(
    file_name,
    '^([0-9a-fA-F-]{36})(?:-[^.]+)?\.(?:jpg|jpeg|png|webp)$'
  );

  if lead_match is null or array_length(lead_match, 1) < 1 then
    return null;
  end if;

  lead_id_text := lead_match[1];

  begin
    return lead_id_text::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;
end;
$$;

drop policy if exists "team_memberships_insert_own" on public.team_memberships;
create policy "team_memberships_insert_own"
on public.team_memberships
for insert
to authenticated
with check (false);

drop policy if exists "teams_insert_creator" on public.teams;
create policy "teams_insert_creator"
on public.teams
for insert
to authenticated
with check (false);

drop policy if exists "card_images_select_own" on storage.objects;
create policy "card_images_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'card-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "card_images_select_team_member" on storage.objects;
create policy "card_images_select_team_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'card-images'
  and exists (
    select 1
    from public.scanned_leads leads
    where leads.id = public.card_image_lead_id(name)
      and (
        leads.user_id = auth.uid()
        or (
          leads.team_id is not null
          and exists (
            select 1
            from public.team_memberships memberships
            where memberships.team_id = leads.team_id
              and memberships.user_id = auth.uid()
          )
        )
      )
  )
);
