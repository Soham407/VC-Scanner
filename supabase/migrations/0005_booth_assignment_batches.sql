create table if not exists public.booth_assignment_batches (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references public.booths(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  scan_count integer not null default 0 check (scan_count >= 0),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create unique index if not exists booth_assignment_batches_pending_unique_idx
  on public.booth_assignment_batches(booth_id)
  where status = 'pending';

create table if not exists public.booth_assignment_batch_items (
  batch_id uuid not null references public.booth_assignment_batches(id) on delete cascade,
  scanned_lead_id uuid not null references public.scanned_leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (batch_id, scanned_lead_id),
  unique (scanned_lead_id)
);

create table if not exists public.lead_assignments (
  scanned_lead_id uuid primary key references public.scanned_leads(id) on delete cascade,
  booth_id uuid not null references public.booths(id) on delete cascade,
  assigned_to_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by_user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid references public.booth_assignment_batches(id) on delete set null,
  assignment_state text not null default 'assigned' check (assignment_state in ('assigned', 'done', 'needs_review')),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_assignments_assigned_to_idx
  on public.lead_assignments(assigned_to_user_id, booth_id, assignment_state, assigned_at desc);

create index if not exists lead_assignments_batch_idx
  on public.lead_assignments(batch_id);

create table if not exists public.booth_assignment_cursors (
  booth_id uuid primary key references public.booths(id) on delete cascade,
  next_worker_index integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.booth_assignment_batches enable row level security;
alter table public.booth_assignment_batch_items enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.booth_assignment_cursors enable row level security;

drop policy if exists "booth_assignment_batches_select_member" on public.booth_assignment_batches;
create policy "booth_assignment_batches_select_member"
on public.booth_assignment_batches
for select
to authenticated
using (
  exists (
    select 1
    from public.booth_memberships memberships
    where memberships.booth_id = booth_assignment_batches.booth_id
      and memberships.user_id = auth.uid()
  )
);

drop policy if exists "booth_assignment_batch_items_select_member" on public.booth_assignment_batch_items;
create policy "booth_assignment_batch_items_select_member"
on public.booth_assignment_batch_items
for select
to authenticated
using (
  exists (
    select 1
    from public.booth_assignment_batches batches
    join public.booth_memberships memberships on memberships.booth_id = batches.booth_id
    where batches.id = booth_assignment_batch_items.batch_id
      and memberships.user_id = auth.uid()
  )
);

drop policy if exists "lead_assignments_select_leader_or_worker" on public.lead_assignments;
create policy "lead_assignments_select_leader_or_worker"
on public.lead_assignments
for select
to authenticated
using (
  assigned_to_user_id = auth.uid()
  or exists (
    select 1
    from public.booths booths
    where booths.id = lead_assignments.booth_id
      and booths.created_by = auth.uid()
  )
);

drop policy if exists "lead_assignments_update_worker_state" on public.lead_assignments;
create policy "lead_assignments_update_worker_state"
on public.lead_assignments
for update
to authenticated
using (assigned_to_user_id = auth.uid())
with check (assigned_to_user_id = auth.uid());

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.booths booths
    where booths.id = scanned_leads.booth_id
      and booths.created_by = auth.uid()
  )
  or exists (
    select 1
    from public.lead_assignments assignments
    where assignments.scanned_lead_id = scanned_leads.id
      and assignments.assigned_to_user_id = auth.uid()
  )
);

create or replace function public.create_booth_assignment_batch(target_booth_id uuid)
returns table(batch_id uuid, scan_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_batch_id uuid;
  existing_scan_count integer;
  created_batch_id uuid;
  created_scan_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  if not exists (
    select 1
    from public.booths
    where booths.id = target_booth_id
      and booths.created_by = current_user_id
  ) then
    raise exception 'Only the booth leader can create assignment batches';
  end if;

  select batches.id, batches.scan_count
  into existing_batch_id, existing_scan_count
  from public.booth_assignment_batches batches
  where batches.booth_id = target_booth_id
    and batches.status = 'pending'
  order by batches.created_at desc
  limit 1;

  if existing_batch_id is not null then
    return query select existing_batch_id, existing_scan_count;
    return;
  end if;

  insert into public.booth_assignment_batches (booth_id, created_by, status)
  values (target_booth_id, current_user_id, 'pending')
  returning id into created_batch_id;

  insert into public.booth_assignment_batch_items (batch_id, scanned_lead_id)
  select created_batch_id, leads.id
  from public.scanned_leads leads
  where leads.booth_id = target_booth_id
    and not exists (
      select 1
      from public.lead_assignments assignments
      where assignments.scanned_lead_id = leads.id
    )
  order by leads.created_at asc
  on conflict (scanned_lead_id) do nothing;

  get diagnostics created_scan_count = row_count;

  update public.booth_assignment_batches
  set scan_count = created_scan_count
  where id = created_batch_id;

  if created_scan_count = 0 then
    delete from public.booth_assignment_batches
    where id = created_batch_id;

    raise exception 'No unassigned scans available';
  end if;

  return query select created_batch_id, created_scan_count;
end;
$$;

revoke all on function public.create_booth_assignment_batch(uuid) from public;
grant execute on function public.create_booth_assignment_batch(uuid) to authenticated;

create or replace function public.approve_booth_assignment_batch(target_batch_id uuid)
returns table(assigned_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_batch public.booth_assignment_batches%rowtype;
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
  from public.booth_assignment_batches batches
  where batches.id = target_batch_id
  for update;

  if not found then
    raise exception 'Assignment batch not found';
  end if;

  if target_batch.status <> 'pending' then
    raise exception 'Assignment batch has already been approved';
  end if;

  if not exists (
    select 1
    from public.booths
    where booths.id = target_batch.booth_id
      and booths.created_by = current_user_id
  ) then
    raise exception 'Only the booth leader can approve assignment batches';
  end if;

  create temporary table worker_loads_tmp (
    position integer primary key,
    user_id uuid not null,
    load_count integer not null
  ) on commit drop;

  insert into worker_loads_tmp (position, user_id, load_count)
  select
    row_number() over (order by memberships.created_at, memberships.user_id) - 1,
    memberships.user_id,
    coalesce(existing_loads.active_load, 0)
  from public.booth_memberships memberships
  left join (
    select
      assignments.assigned_to_user_id,
      count(*)::integer as active_load
    from public.lead_assignments assignments
    where assignments.booth_id = target_batch.booth_id
      and assignments.assignment_state in ('assigned', 'needs_review')
    group by assignments.assigned_to_user_id
  ) existing_loads
    on existing_loads.assigned_to_user_id = memberships.user_id
  where memberships.booth_id = target_batch.booth_id
    and memberships.user_id <> target_batch.created_by
  order by memberships.created_at, memberships.user_id;

  select count(*)::integer into worker_count
  from worker_loads_tmp;

  if worker_count = 0 then
    raise exception 'No workers available for assignment';
  end if;

  select assignment_cursor.next_worker_index
  into start_index
  from public.booth_assignment_cursors assignment_cursor
  where assignment_cursor.booth_id = target_batch.booth_id
  for update;

  start_index := coalesce(start_index, 0);

  for current_lead_id in
    select items.scanned_lead_id
    from public.booth_assignment_batch_items items
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
      booth_id,
      assigned_to_user_id,
      assigned_by_user_id,
      batch_id,
      assignment_state
    )
    values (
      current_lead_id,
      target_batch.booth_id,
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

  update public.booth_assignment_batches
  set
    status = 'approved',
    approved_at = now()
  where id = target_batch_id;

  insert into public.booth_assignment_cursors (booth_id, next_worker_index, updated_at)
  values (target_batch.booth_id, mod(start_index, worker_count), now())
  on conflict (booth_id) do update
  set
    next_worker_index = excluded.next_worker_index,
    updated_at = excluded.updated_at;

  return query select assigned_total;
end;
$$;

revoke all on function public.approve_booth_assignment_batch(uuid) from public;
grant execute on function public.approve_booth_assignment_batch(uuid) to authenticated;
