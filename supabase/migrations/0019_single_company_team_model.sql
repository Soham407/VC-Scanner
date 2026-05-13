create unique index if not exists team_memberships_user_id_unique_idx
  on public.team_memberships(user_id);

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

drop function if exists public.approve_team_assignment_batch(uuid);

create or replace function public.approve_team_assignment_batch(
  target_batch_id uuid,
  worker_allocations jsonb
)
returns table(assigned_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_batch public.team_assignment_batches%rowtype;
  allocation_row record;
  allocation_total integer := 0;
  assignable_count integer := 0;
  assigned_total integer := 0;
  current_index integer := 1;
  ordered_lead_ids uuid[] := '{}';
  selected_lead_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  if worker_allocations is null or jsonb_typeof(worker_allocations) <> 'array' then
    raise exception 'Worker allocations are required';
  end if;

  select *
  into target_batch
  from public.team_assignment_batches batches
  where batches.id = target_batch_id
  for update;

  if not found then
    raise exception 'Assignment batch not found';
  end if;

  if target_batch.status <> 'pending' then
    raise exception 'Assignment batch has already been approved';
  end if;

  if not public.is_team_leader(target_batch.team_id, current_user_id) then
    raise exception 'Only the team leader can approve assignment batches';
  end if;

  create temporary table worker_allocations_tmp (
    ord integer primary key,
    user_id uuid not null unique,
    allocation_count integer not null check (allocation_count >= 0)
  ) on commit drop;

  insert into worker_allocations_tmp (ord, user_id, allocation_count)
  select
    items.ord::integer,
    (items.item ->> 'userId')::uuid,
    (items.item ->> 'count')::integer
  from jsonb_array_elements(worker_allocations) with ordinality as items(item, ord);

  select coalesce(sum(allocation_count), 0)::integer
  into allocation_total
  from worker_allocations_tmp;

  select coalesce(array_agg(items.scanned_lead_id order by random()), '{}'::uuid[])
  into ordered_lead_ids
  from public.team_assignment_batch_items items
  left join public.lead_assignments assignments
    on assignments.scanned_lead_id = items.scanned_lead_id
  where items.batch_id = target_batch_id
    and assignments.scanned_lead_id is null;

  assignable_count := coalesce(array_length(ordered_lead_ids, 1), 0);

  if assignable_count = 0 then
    raise exception 'Assignment batch is empty';
  end if;

  if allocation_total <> assignable_count then
    raise exception 'Worker allocation total must equal assignable cards';
  end if;

  if exists (
    select 1
    from worker_allocations_tmp allocations
    left join public.team_memberships memberships
      on memberships.team_id = target_batch.team_id
      and memberships.user_id = allocations.user_id
    where memberships.user_id is null
      or public.is_team_leader(target_batch.team_id, allocations.user_id)
  ) then
    raise exception 'All allocations must target workers in the team';
  end if;

  for allocation_row in
    select ord, user_id, allocation_count
    from worker_allocations_tmp
    order by ord
  loop
    for i in 1..allocation_row.allocation_count loop
      selected_lead_id := ordered_lead_ids[current_index];

      insert into public.lead_assignments (
        scanned_lead_id,
        team_id,
        assigned_to_user_id,
        assigned_by_user_id,
        batch_id,
        assignment_state
      )
      values (
        selected_lead_id,
        target_batch.team_id,
        allocation_row.user_id,
        current_user_id,
        target_batch_id,
        'assigned'
      )
      on conflict (scanned_lead_id) do nothing;

      if not found then
        raise exception 'Assignment batch item could not be assigned';
      end if;

      assigned_total := assigned_total + 1;
      current_index := current_index + 1;
    end loop;
  end loop;

  if assigned_total <> assignable_count then
    raise exception 'Assignment batch could not assign every selected card';
  end if;

  update public.team_assignment_batches
  set
    status = 'approved',
    approved_at = now()
  where id = target_batch_id;

  return query select assigned_total::integer;
end;
$$;

revoke all on function public.approve_team_assignment_batch(uuid, jsonb) from public;
grant execute on function public.approve_team_assignment_batch(uuid, jsonb) to authenticated;
