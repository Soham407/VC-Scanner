alter table public.scanned_leads
add column if not exists secondary_image_url text;
