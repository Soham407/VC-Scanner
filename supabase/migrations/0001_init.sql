create table if not exists public.scanned_leads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text,
  job_title text,
  company_name text,
  email text,
  phone_number text,
  image_url text,
  raw_ocr_text text,
  parse_status text not null default 'parsed' check (parse_status in ('parsed', 'unparsed')),
  created_at timestamptz not null default now()
);

alter table public.scanned_leads enable row level security;

drop policy if exists "scanned_leads_select_own" on public.scanned_leads;
create policy "scanned_leads_select_own"
on public.scanned_leads
for select
using (auth.uid() = user_id);

drop policy if exists "scanned_leads_insert_own" on public.scanned_leads;
create policy "scanned_leads_insert_own"
on public.scanned_leads
for insert
with check (auth.uid() = user_id);

drop policy if exists "scanned_leads_update_own" on public.scanned_leads;
create policy "scanned_leads_update_own"
on public.scanned_leads
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "scanned_leads_delete_own" on public.scanned_leads;
create policy "scanned_leads_delete_own"
on public.scanned_leads
for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do nothing;

drop policy if exists "card_images_select_own" on storage.objects;
create policy "card_images_select_own"
on storage.objects
for select
using (
  bucket_id = 'card-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "card_images_insert_own" on storage.objects;
create policy "card_images_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'card-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "card_images_delete_own" on storage.objects;
create policy "card_images_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'card-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
