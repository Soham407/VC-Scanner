create or replace function public.update_scanned_lead_details(
  target_scanned_lead_id uuid,
  target_full_name text,
  target_job_title text,
  target_company_name text,
  target_address text,
  target_email text,
  target_phone_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lead public.scanned_leads%rowtype;
begin
  select *
  into target_lead
  from public.scanned_leads
  where id = target_scanned_lead_id;

  if not found then
    raise exception 'Scanned lead not found';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;

  if not (
    target_lead.user_id = auth.uid()
    or (
      target_lead.team_id is not null
      and public.is_team_leader(target_lead.team_id, auth.uid())
    )
    or exists (
      select 1
      from public.lead_assignments assignments
      where assignments.scanned_lead_id = target_scanned_lead_id
        and assignments.assigned_to_user_id = auth.uid()
    )
  ) then
    raise exception 'Not allowed to update scanned lead';
  end if;

  update public.scanned_leads
  set
    full_name = nullif(btrim(target_full_name), ''),
    job_title = nullif(btrim(target_job_title), ''),
    company_name = nullif(btrim(target_company_name), ''),
    address = nullif(btrim(target_address), ''),
    email = nullif(btrim(target_email), ''),
    phone_number = nullif(btrim(target_phone_number), ''),
    parse_status = case
      when coalesce(
        nullif(btrim(target_full_name), ''),
        nullif(btrim(target_company_name), ''),
        nullif(btrim(target_email), ''),
        nullif(btrim(target_phone_number), ''),
        nullif(btrim(target_job_title), ''),
        nullif(btrim(target_address), '')
      ) is null then 'unparsed'
      else 'parsed'
    end
  where id = target_scanned_lead_id;
end;
$$;

revoke all on function public.update_scanned_lead_details(uuid, text, text, text, text, text, text) from public;
grant execute on function public.update_scanned_lead_details(uuid, text, text, text, text, text, text) to authenticated;
