import { supabase } from './supabase';
import type { AccessibleTeam, AssignmentState, Lead, PendingBatch, TeamAccess, TeamInvite, TeamMember } from './types';

type TeamRow = {
  created_at: string;
  created_by: string;
  id: string;
  name: string;
};

type LeadRow = {
  address: string | null;
  company_name: string | null;
  created_at: string;
  email: string | null;
  full_name: string | null;
  id: string;
  image_url: string | null;
  job_title: string | null;
  parse_status: 'parsed' | 'unparsed';
  phone_number: string | null;
  product_services: string | null;
  raw_ocr_text: string | null;
  team_id: string | null;
  user_id: string;
  lead_assignments?: AssignmentRow | AssignmentRow[] | null;
};

type AssignmentRow = {
  assigned_at: string;
  assigned_to_user_id: string | null;
  assignment_state: AssignmentState;
  scanned_leads?: LeadRow | LeadRow[] | null;
};

const LEAD_SELECT_FIELDS = [
  'id',
  'team_id',
  'user_id',
  'address',
  'full_name',
  'job_title',
  'company_name',
  'product_services',
  'email',
  'phone_number',
  'image_url',
  'raw_ocr_text',
  'parse_status',
  'created_at'
].join(', ');

function firstRow<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapTeam(row: TeamRow): AccessibleTeam {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    name: row.name
  };
}

function mapLead(row: LeadRow): Lead {
  const assignment = firstRow(row.lead_assignments ?? null);
  return {
    address: row.address,
    assignedAt: assignment?.assigned_at ?? null,
    assignedToUserId: assignment?.assigned_to_user_id ?? null,
    assignmentState: assignment?.assignment_state ?? null,
    capturedByUserId: row.user_id,
    companyName: row.company_name,
    createdAt: row.created_at,
    email: row.email,
    fullName: row.full_name,
    id: row.id,
    imagePath: row.image_url,
    jobTitle: row.job_title,
    parseStatus: row.parse_status,
    phoneNumber: row.phone_number,
    productServices: row.product_services,
    rawText: row.raw_ocr_text,
    teamId: row.team_id
  };
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

export async function loadAccessibleTeams(): Promise<AccessibleTeam[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, created_by, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeamRow[]).map(mapTeam);
}

export async function createTeam(name: string): Promise<AccessibleTeam> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Team name is required');

  const { data, error } = await supabase.rpc('create_team', {
    team_name: trimmedName
  });
  if (error) throw new Error(error.message);

  const row = firstRow(data as TeamRow | TeamRow[] | null);
  if (!row) throw new Error('Team creation returned no row');

  return mapTeam(row);
}

export async function getActiveTeamId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_team_contexts')
    .select('team_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { team_id: string } | null)?.team_id ?? null;
}

export async function getTeamAccess(teamId: string | null, userId: string): Promise<TeamAccess> {
  if (!teamId) {
    return { canManageTeam: false, teamId: null, teamName: null };
  }

  const { data: teamData, error: teamError } = await supabase
    .from('teams')
    .select('id, name, created_by')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) throw new Error(teamError.message);
  if (!teamData) return { canManageTeam: false, teamId: null, teamName: null };

  const team = teamData as { created_by: string; id: string; name: string };
  if (team.created_by === userId) {
    return { canManageTeam: true, teamId: team.id, teamName: team.name };
  }

  const { data: leaderData, error: leaderError } = await supabase
    .from('team_leaders')
    .select('user_id')
    .eq('team_id', team.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (leaderError) throw new Error(leaderError.message);

  return {
    canManageTeam: Boolean((leaderData as { user_id: string } | null)?.user_id),
    teamId: team.id,
    teamName: team.name
  };
}

export async function setActiveTeamId(teamId: string | null): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Authenticated user required');

  if (teamId === null) {
    const { error } = await supabase.from('user_team_contexts').delete().eq('user_id', userData.user.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from('user_team_contexts')
    .upsert({ team_id: teamId, user_id: userData.user.id }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

export async function loadTeamLeads(teamId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('scanned_leads')
    .select(`${LEAD_SELECT_FIELDS}, lead_assignments!left(assigned_at, assignment_state, assigned_to_user_id)`)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as LeadRow[]).map(mapLead);
}

export async function loadPersonalLeads(userId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('scanned_leads')
    .select(`${LEAD_SELECT_FIELDS}, lead_assignments!left(assigned_at, assignment_state, assigned_to_user_id)`)
    .eq('user_id', userId)
    .is('team_id', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as LeadRow[]).map(mapLead);
}

export async function loadAssignedLeads(teamId: string, userId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('lead_assignments')
    .select(`assigned_at, assignment_state, assigned_to_user_id, scanned_leads!inner(${LEAD_SELECT_FIELDS})`)
    .eq('team_id', teamId)
    .eq('assigned_to_user_id', userId)
    .order('assigned_at', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as AssignmentRow[])
    .map((row) => {
      const lead = firstRow(row.scanned_leads ?? null);
      return lead
        ? mapLead({
            ...lead,
            lead_assignments: {
              assigned_at: row.assigned_at,
              assigned_to_user_id: row.assigned_to_user_id,
              assignment_state: row.assignment_state
            }
          })
        : null;
    })
    .filter((lead): lead is Lead => lead !== null);
}

export async function loadLead(leadId: string, teamId?: string | null): Promise<Lead> {
  const { data, error } = await supabase
    .from('scanned_leads')
    .select(`${LEAD_SELECT_FIELDS}, lead_assignments!left(assigned_at, assignment_state, assigned_to_user_id)`)
    .eq('id', leadId)
    .single();
  if (error) throw new Error(error.message);
  return mapLead(data as unknown as LeadRow);
}

export async function updateLeadDetails(leadId: string, updates: {
  address: string | null;
  companyName: string | null;
  email: string | null;
  fullName: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
  productServices: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('update_scanned_lead_details', {
    target_address: normalizeNullable(updates.address),
    target_company_name: normalizeNullable(updates.companyName),
    target_email: normalizeNullable(updates.email),
    target_full_name: normalizeNullable(updates.fullName),
    target_job_title: normalizeNullable(updates.jobTitle),
    target_phone_number: normalizeNullable(updates.phoneNumber),
    target_product_services: normalizeNullable(updates.productServices),
    target_scanned_lead_id: leadId
  });
  if (error) throw new Error(error.message);
}

export async function getLeadImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage.from('card-images').createSignedUrl(path, 60 * 15);
  if (error) return null;
  return data.signedUrl;
}

export async function loadTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('list_team_members', { target_team_id: teamId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ created_at: string; email: string; is_leader: boolean; user_id: string }>).map((row) => ({
    createdAt: row.created_at,
    email: row.email,
    isLeader: row.is_leader,
    userId: row.user_id
  }));
}

export async function promoteTeamMemberToLeader(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('promote_team_member_to_leader', {
    target_team_id: teamId,
    target_user_id: userId
  });
  if (error) throw new Error(error.message);
}

export async function createTeamInvite(teamId: string, invitedEmail: string): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Authenticated user required');
  const { error } = await supabase.from('team_invites').insert({
    invited_by: userData.user.id,
    invited_email: invitedEmail.trim(),
    invited_email_normalized: invitedEmail.trim().toLowerCase(),
    status: 'pending',
    team_id: teamId
  });
  if (error) throw new Error(error.message);
}

export async function listPendingTeamInvitesForTeam(teamId: string): Promise<TeamInvite[]> {
  const { data, error } = await supabase
    .from('team_invites')
    .select('id, invited_email, created_at')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ created_at: string; id: string; invited_email: string }>).map((row) => ({
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email
  }));
}

export async function findPendingInvitesForCurrentUser(): Promise<TeamInvite[]> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.trim().toLowerCase();
  if (!email) return [];

  const { data, error } = await supabase
    .from('team_invites')
    .select('id, team_id, invited_email, created_at, teams(name)')
    .eq('invited_email_normalized', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{
    created_at: string;
    id: string;
    invited_email: string;
    team_id: string;
    teams?: { name?: string } | { name?: string }[] | null;
  }>).map((row) => ({
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email,
    teamId: row.team_id,
    teamName: firstRow(row.teams ?? null)?.name ?? null
  }));
}

export async function listPendingTeamInvitesForEmail(email: string): Promise<TeamInvite[]> {
  const { data, error } = await supabase
    .from('team_invites')
    .select('id, team_id, invited_email, created_at, teams(name)')
    .eq('invited_email_normalized', email.trim().toLowerCase())
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ created_at: string; id: string; invited_email: string; team_id: string; teams?: { name?: string } | { name?: string }[] | null }>).map((row) => ({
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email,
    teamId: row.team_id,
    teamName: firstRow(row.teams ?? null)?.name ?? null
  }));
}

export async function respondToTeamInvite(inviteId: string, decision: 'accept' | 'decline'): Promise<void> {
  const { error } = await supabase.rpc('respond_to_team_invite', { decision, invite_id: inviteId });
  if (error) throw new Error(error.message);
}

export async function createAssignmentBatch(teamId: string): Promise<{ batchId: string; scanCount: number }> {
  const { data, error } = await supabase.rpc('create_team_assignment_batch', { target_team_id: teamId });
  if (error) throw new Error(error.message);
  const row = firstRow(data as Array<{ batch_id: string; scan_count: number }> | { batch_id: string; scan_count: number } | null);
  if (!row) throw new Error('Batch creation returned no row');
  return { batchId: row.batch_id, scanCount: row.scan_count };
}

export async function loadPendingAssignmentBatch(teamId: string): Promise<PendingBatch | null> {
  const { data: batchData, error: batchError } = await supabase
    .from('team_assignment_batches')
    .select('id, scan_count, created_at')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (batchError) throw new Error(batchError.message);
  if (!batchData) return null;

  const { data: itemData, error: itemError } = await supabase
    .from('team_assignment_batch_items')
    .select('scanned_lead_id, created_at')
    .eq('batch_id', batchData.id)
    .order('created_at', { ascending: true });
  if (itemError) throw new Error(itemError.message);

  return {
    batchId: batchData.id,
    scanCount: batchData.scan_count,
    items: ((itemData ?? []) as Array<{ created_at: string; scanned_lead_id: string }>).map((row) => ({
      createdAt: row.created_at,
      scannedLeadId: row.scanned_lead_id
    }))
  };
}

export async function addBatchItem(batchId: string, leadId: string): Promise<void> {
  const { error } = await supabase.rpc('add_team_assignment_batch_item', {
    target_batch_id: batchId,
    target_scanned_lead_id: leadId
  });
  if (error) throw new Error(error.message);
}

export async function removeBatchItem(batchId: string, leadId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_team_assignment_batch_item', {
    target_batch_id: batchId,
    target_scanned_lead_id: leadId
  });
  if (error) throw new Error(error.message);
}

export async function approveBatch(batchId: string): Promise<number> {
  const { data, error } = await supabase.rpc('approve_team_assignment_batch', { target_batch_id: batchId });
  if (error) throw new Error(error.message);
  const row = firstRow(data as Array<{ assigned_count: number }> | { assigned_count: number } | null);
  return row?.assigned_count ?? 0;
}

export async function reassignLead(leadId: string, assignedToUserId: string): Promise<void> {
  const { error } = await supabase.rpc('reassign_team_assignment', {
    target_assigned_to_user_id: assignedToUserId,
    target_scanned_lead_id: leadId
  });
  if (error) throw new Error(error.message);
}

export async function updateAssignmentState(leadId: string, assignmentState: AssignmentState): Promise<void> {
  const { error } = await supabase.rpc('update_team_assignment_state', {
    target_assignment_state: assignmentState,
    target_scanned_lead_id: leadId
  });
  if (error) throw new Error(error.message);
}
