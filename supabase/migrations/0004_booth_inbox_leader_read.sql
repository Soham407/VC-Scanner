alter table public.scanned_leads force row level security;

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (
    booth_id is not null
    and exists (
      select 1
      from public.booths booths
      where booths.id = scanned_leads.booth_id
        and booths.created_by = (select auth.uid())
    )
  )
);
