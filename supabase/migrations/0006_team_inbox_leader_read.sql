alter table public.scanned_leads force row level security;

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (
    team_id is not null
    and exists (
      select 1
      from public.teams teams
      where teams.id = scanned_leads.team_id
        and teams.created_by = (select auth.uid())
    )
  )
);
