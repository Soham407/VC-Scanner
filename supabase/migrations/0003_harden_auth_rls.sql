alter table public.scanned_leads force row level security;

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "scanned_leads_insert_own" on public.scanned_leads;
create policy "scanned_leads_insert_own"
on public.scanned_leads
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "scanned_leads_update_own" on public.scanned_leads;
create policy "scanned_leads_update_own"
on public.scanned_leads
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "scanned_leads_delete_own" on public.scanned_leads;
create policy "scanned_leads_delete_own"
on public.scanned_leads
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "card_images_select_own" on storage.objects;
create policy "card_images_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'card-images'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "card_images_insert_own" on storage.objects;
create policy "card_images_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'card-images'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

drop policy if exists "card_images_delete_own" on storage.objects;
create policy "card_images_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'card-images'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);
