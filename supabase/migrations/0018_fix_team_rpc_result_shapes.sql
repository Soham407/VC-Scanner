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

create or replace function public.approve_team_assignment_batch(target_batch_id uuid)
returns table(assigned_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_batch public.team_assignment_batches%rowtype;
  worker_count integer := 0;
  start_index integer := 0;
  assigned_total integer := 0;
  current_lead_id uuid;
  selected_position integer;
  selected_user_id uuid;
  min_load integer;
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
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

  if not exists (
    select 1
    from public.team_assignment_batch_items items
    where items.batch_id = target_batch_id
  ) then
    raise exception 'Assignment batch is empty';
  end if;

  create temporary table worker_loads_tmp (
    position integer primary key,
    user_id uuid not null,
    load_count integer not null
  ) on commit drop;

  insert into worker_loads_tmp (position, user_id, load_count)
  select
    (row_number() over (order by memberships.created_at, memberships.user_id) - 1)::integer,
    memberships.user_id,
    coalesce(existing_loads.active_load, 0)::integer
  from public.team_memberships memberships
  left join (
    select
      assignments.assigned_to_user_id,
      count(*)::integer as active_load
    from public.lead_assignments assignments
    where assignments.team_id = target_batch.team_id
      and assignments.assignment_state in ('assigned', 'needs_review')
    group by assignments.assigned_to_user_id
  ) existing_loads
    on existing_loads.assigned_to_user_id = memberships.user_id
  where memberships.team_id = target_batch.team_id
    and not public.is_team_leader(memberships.team_id, memberships.user_id)
  order by memberships.created_at, memberships.user_id;

  select count(*)::integer into worker_count
  from worker_loads_tmp;

  if worker_count = 0 then
    raise exception 'No workers available for assignment';
  end if;

  select assignment_cursor.next_worker_index
  into start_index
  from public.team_assignment_cursors assignment_cursor
  where assignment_cursor.team_id = target_batch.team_id
  for update;

  start_index := coalesce(start_index, 0);

  for current_lead_id in
    select items.scanned_lead_id
    from public.team_assignment_batch_items items
    left join public.lead_assignments existing_assignment
      on existing_assignment.scanned_lead_id = items.scanned_lead_id
    where items.batch_id = target_batch_id
      and existing_assignment.scanned_lead_id is null
    order by items.created_at, items.scanned_lead_id
  loop
    select min(load_count) into min_load
    from worker_loads_tmp;

    select workers.position, workers.user_id
    into selected_position, selected_user_id
    from worker_loads_tmp workers
    where workers.load_count = min_load
    order by
      mod((workers.position - mod(start_index, worker_count) + worker_count), worker_count),
      workers.position
    limit 1;

    insert into public.lead_assignments (
      scanned_lead_id,
      team_id,
      assigned_to_user_id,
      assigned_by_user_id,
      batch_id,
      assignment_state
    )
    values (
      current_lead_id,
      target_batch.team_id,
      selected_user_id,
      current_user_id,
      target_batch_id,
      'assigned'
    )
    on conflict (scanned_lead_id) do nothing;

    if found then
      update worker_loads_tmp
      set load_count = load_count + 1
      where position = selected_position;

      assigned_total := assigned_total + 1;
      start_index := selected_position + 1;
    end if;
  end loop;

  update public.team_assignment_batches
  set
    status = 'approved',
    approved_at = now()
  where id = target_batch_id;

  insert into public.team_assignment_cursors (team_id, next_worker_index, updated_at)
  values (target_batch.team_id, mod(start_index, worker_count), now())
  on conflict (team_id) do update
  set
    next_worker_index = excluded.next_worker_index,
    updated_at = excluded.updated_at;

  return query select assigned_total::integer;
end;
$$;

revoke all on function public.approve_team_assignment_batch(uuid) from public;
grant execute on function public.approve_team_assignment_batch(uuid) to authenticated;
