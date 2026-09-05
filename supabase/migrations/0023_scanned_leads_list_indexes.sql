-- Every read of scanned_leads filters by user_id (the RLS policy itself is
-- auth.uid() = user_id) or by team_id, and always orders by created_at desc.
-- user_id had no index at all; team_id had one that did not cover the sort.

create index if not exists scanned_leads_user_created_idx
  on public.scanned_leads (user_id, created_at desc);

create index if not exists scanned_leads_team_created_idx
  on public.scanned_leads (team_id, created_at desc);

drop index if exists public.scanned_leads_team_id_idx;
