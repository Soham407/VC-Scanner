create table if not exists public.booths (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.booth_memberships (
  booth_id uuid not null references public.booths(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (booth_id, user_id)
);

create table if not exists public.user_booth_contexts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  booth_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint user_booth_contexts_membership_fk
    foreign key (booth_id, user_id)
    references public.booth_memberships (booth_id, user_id)
    on delete cascade
);

alter table public.booths enable row level security;
alter table public.booth_memberships enable row level security;
alter table public.user_booth_contexts enable row level security;

drop policy if exists "booths_select_member" on public.booths;
create policy "booths_select_member"
on public.booths
for select
using (
  exists (
    select 1
    from public.booth_memberships memberships
    where memberships.booth_id = booths.id
      and memberships.user_id = auth.uid()
  )
);

drop policy if exists "booths_insert_creator" on public.booths;
create policy "booths_insert_creator"
on public.booths
for insert
with check (auth.uid() = created_by);

drop policy if exists "booths_update_creator" on public.booths;
create policy "booths_update_creator"
on public.booths
for update
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "booths_delete_creator" on public.booths;
create policy "booths_delete_creator"
on public.booths
for delete
using (auth.uid() = created_by);

drop policy if exists "booth_memberships_select_own" on public.booth_memberships;
create policy "booth_memberships_select_own"
on public.booth_memberships
for select
using (auth.uid() = user_id);

drop policy if exists "booth_memberships_insert_own" on public.booth_memberships;
create policy "booth_memberships_insert_own"
on public.booth_memberships
for insert
with check (auth.uid() = user_id);

drop policy if exists "booth_memberships_delete_own" on public.booth_memberships;
create policy "booth_memberships_delete_own"
on public.booth_memberships
for delete
using (auth.uid() = user_id);

drop policy if exists "user_booth_contexts_select_own" on public.user_booth_contexts;
create policy "user_booth_contexts_select_own"
on public.user_booth_contexts
for select
using (auth.uid() = user_id);

drop policy if exists "user_booth_contexts_insert_own_member" on public.user_booth_contexts;
create policy "user_booth_contexts_insert_own_member"
on public.user_booth_contexts
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.booth_memberships memberships
    where memberships.user_id = auth.uid()
      and memberships.booth_id = user_booth_contexts.booth_id
  )
);

drop policy if exists "user_booth_contexts_update_own_member" on public.user_booth_contexts;
create policy "user_booth_contexts_update_own_member"
on public.user_booth_contexts
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.booth_memberships memberships
    where memberships.user_id = auth.uid()
      and memberships.booth_id = user_booth_contexts.booth_id
  )
);

drop policy if exists "user_booth_contexts_delete_own" on public.user_booth_contexts;
create policy "user_booth_contexts_delete_own"
on public.user_booth_contexts
for delete
using (auth.uid() = user_id);

alter table public.scanned_leads
add column if not exists booth_id uuid references public.booths(id) on delete set null;

create index if not exists scanned_leads_booth_id_idx on public.scanned_leads(booth_id);

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
using (
  auth.uid() = user_id
  or (
    booth_id is not null
    and exists (
      select 1
      from public.booth_memberships memberships
      where memberships.booth_id = scanned_leads.booth_id
        and memberships.user_id = auth.uid()
    )
  )
);

drop policy if exists "scanned_leads_insert_own" on public.scanned_leads;
create policy "scanned_leads_insert_own"
on public.scanned_leads
for insert
with check (
  auth.uid() = user_id
  and (
    booth_id is null
    or exists (
      select 1
      from public.booth_memberships memberships
      where memberships.booth_id = scanned_leads.booth_id
        and memberships.user_id = auth.uid()
    )
  )
);

drop policy if exists "scanned_leads_update_own" on public.scanned_leads;
create policy "scanned_leads_update_own"
on public.scanned_leads
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    booth_id is null
    or exists (
      select 1
      from public.booth_memberships memberships
      where memberships.booth_id = scanned_leads.booth_id
        and memberships.user_id = auth.uid()
    )
  )
);
