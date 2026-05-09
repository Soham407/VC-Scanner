import { supabase } from './supabase';

export type PendingTeamInvite = {
  teamId: string;
  teamName: string | null;
  createdAt: string;
  id: string;
  invitedEmail: string;
};

export type TeamInviteDecision = 'accept' | 'decline';

export type CreatedTeamInvite = {
  teamId: string;
  createdAt: string;
  id: string;
  invitedEmail: string;
  status: 'pending';
};

export type TeamPendingInvite = {
  createdAt: string;
  id: string;
  invitedEmail: string;
};

type TeamInviteInsertRow = {
  team_id: string;
  created_at: string;
  id: string;
  invited_email: string;
  status: 'pending';
};

type TeamInvitePendingRow = {
  team_id: string;
  teams?: { name?: unknown } | Array<{ name?: unknown }> | null;
  created_at: string;
  id: string;
  invited_email: string;
};

function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readTeamName(
  value: TeamInvitePendingRow['teams']
): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first?.name === 'string' ? first.name : null;
  }

  if (value && typeof value === 'object' && typeof value.name === 'string') {
    return value.name;
  }

  return null;
}

export async function createTeamInvite(params: {
  teamId: string;
  invitedEmail: string;
}): Promise<CreatedTeamInvite> {
  const normalizedInviteEmail = normalizeInviteEmail(params.invitedEmail);
  if (!normalizedInviteEmail) {
    throw new Error('Invite email is required');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Authenticated user required for team invite creation');
  }

  const { data, error } = await supabase
    .from('team_invites')
    .insert({
      team_id: params.teamId,
      invited_by: userData.user.id,
      invited_email: params.invitedEmail.trim(),
      invited_email_normalized: normalizedInviteEmail,
      status: 'pending'
    })
    .select('id, team_id, invited_email, status, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Invite creation returned no row');
  }

  const row = data as TeamInviteInsertRow;
  return {
    teamId: row.team_id,
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email,
    status: 'pending'
  };
}

export async function listPendingTeamInvitesForEmail(
  email: string | null | undefined
): Promise<PendingTeamInvite[]> {
  const normalizedEmail = normalizeInviteEmail(email ?? '');
  if (!normalizedEmail) {
    return [];
  }

  const { data, error } = await supabase
    .from('team_invites')
    .select('id, team_id, invited_email, created_at, teams(name)')
    .eq('invited_email_normalized', normalizedEmail)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as TeamInvitePendingRow[];
  return rows.map((row) => ({
    teamId: row.team_id,
    teamName: readTeamName(row.teams),
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email
  }));
}

export async function listPendingTeamInvitesForTeam(teamId: string): Promise<TeamPendingInvite[]> {
  const { data, error } = await supabase
    .from('team_invites')
    .select('id, invited_email, created_at')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{ created_at: string; id: string; invited_email: string }>).map((row) => ({
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email
  }));
}

export async function respondToTeamInvite(
  inviteId: string,
  decision: TeamInviteDecision
): Promise<void> {
  const { error } = await supabase.rpc('respond_to_team_invite', {
    decision,
    invite_id: inviteId
  });

  if (error) {
    throw new Error(error.message);
  }
}
