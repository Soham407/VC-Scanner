do $$
begin
  if to_regclass('public.booths') is not null and to_regclass('public.teams') is null then
    execute 'alter table public.booths rename to teams';
  end if;

  if to_regclass('public.booth_memberships') is not null and to_regclass('public.team_memberships') is null then
    execute 'alter table public.booth_memberships rename to team_memberships';
  end if;

  if to_regclass('public.user_booth_contexts') is not null and to_regclass('public.user_team_contexts') is null then
    execute 'alter table public.user_booth_contexts rename to user_team_contexts';
  end if;

  if to_regclass('public.booth_invites') is not null and to_regclass('public.team_invites') is null then
    execute 'alter table public.booth_invites rename to team_invites';
  end if;

  if to_regclass('public.booth_assignment_batches') is not null and to_regclass('public.team_assignment_batches') is null then
    execute 'alter table public.booth_assignment_batches rename to team_assignment_batches';
  end if;

  if to_regclass('public.booth_assignment_batch_items') is not null and to_regclass('public.team_assignment_batch_items') is null then
    execute 'alter table public.booth_assignment_batch_items rename to team_assignment_batch_items';
  end if;

  if to_regclass('public.booth_assignment_cursors') is not null and to_regclass('public.team_assignment_cursors') is null then
    execute 'alter table public.booth_assignment_cursors rename to team_assignment_cursors';
  end if;

  if to_regclass('public.booth_leaders') is not null and to_regclass('public.team_leaders') is null then
    execute 'alter table public.booth_leaders rename to team_leaders';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scanned_leads'
      and column_name = 'booth_id'
  ) then
    execute 'alter table public.scanned_leads rename column booth_id to team_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lead_assignments'
      and column_name = 'booth_id'
  ) then
    execute 'alter table public.lead_assignments rename column booth_id to team_id';
  end if;

  if to_regclass('public.booth_invites_pending_unique_idx') is not null
    and to_regclass('public.team_invites_pending_unique_idx') is null then
    execute 'alter index public.booth_invites_pending_unique_idx rename to team_invites_pending_unique_idx';
  end if;

  if to_regclass('public.booth_invites_email_status_idx') is not null
    and to_regclass('public.team_invites_email_status_idx') is null then
    execute 'alter index public.booth_invites_email_status_idx rename to team_invites_email_status_idx';
  end if;

  if to_regclass('public.scanned_leads_booth_id_idx') is not null
    and to_regclass('public.scanned_leads_team_id_idx') is null then
    execute 'alter index public.scanned_leads_booth_id_idx rename to scanned_leads_team_id_idx';
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.respond_to_booth_invite(uuid, text)') is not null
    and to_regprocedure('public.respond_to_team_invite(uuid, text)') is null then
    execute 'alter function public.respond_to_booth_invite(uuid, text) rename to respond_to_team_invite';
  end if;

  if to_regprocedure('public.create_booth_assignment_batch(uuid)') is not null
    and to_regprocedure('public.create_team_assignment_batch(uuid)') is null then
    execute 'alter function public.create_booth_assignment_batch(uuid) rename to create_team_assignment_batch';
  end if;

  if to_regprocedure('public.approve_booth_assignment_batch(uuid)') is not null
    and to_regprocedure('public.approve_team_assignment_batch(uuid)') is null then
    execute 'alter function public.approve_booth_assignment_batch(uuid) rename to approve_team_assignment_batch';
  end if;

  if to_regprocedure('public.is_booth_leader(uuid, uuid)') is not null
    and to_regprocedure('public.is_team_leader(uuid, uuid)') is null then
    execute 'alter function public.is_booth_leader(uuid, uuid) rename to is_team_leader';
  end if;

  if to_regprocedure('public.promote_booth_member_to_leader(uuid, uuid)') is not null
    and to_regprocedure('public.promote_team_member_to_leader(uuid, uuid)') is null then
    execute 'alter function public.promote_booth_member_to_leader(uuid, uuid) rename to promote_team_member_to_leader';
  end if;

  if to_regprocedure('public.list_booth_members(uuid)') is not null
    and to_regprocedure('public.list_team_members(uuid)') is null then
    execute 'alter function public.list_booth_members(uuid) rename to list_team_members';
  end if;

  if to_regprocedure('public.update_booth_assignment_state(uuid, text)') is not null
    and to_regprocedure('public.update_team_assignment_state(uuid, text)') is null then
    execute 'alter function public.update_booth_assignment_state(uuid, text) rename to update_team_assignment_state';
  end if;
end;
$$;
