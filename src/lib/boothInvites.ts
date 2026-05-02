import { supabase } from './supabase';

export type PendingBoothInvite = {
  boothId: string;
  boothName: string | null;
  createdAt: string;
  id: string;
  invitedEmail: string;
};

export type BoothInviteDecision = 'accept' | 'decline';

export type CreatedBoothInvite = {
  boothId: string;
  createdAt: string;
  id: string;
  invitedEmail: string;
  status: 'pending';
};

type BoothInviteInsertRow = {
  booth_id: string;
  created_at: string;
  id: string;
  invited_email: string;
  status: 'pending';
};

type BoothInvitePendingRow = {
  booth_id: string;
  booths?: { name?: unknown } | Array<{ name?: unknown }> | null;
  created_at: string;
  id: string;
  invited_email: string;
};

function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readBoothName(
  value: BoothInvitePendingRow['booths']
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

export async function createBoothInvite(params: {
  boothId: string;
  invitedEmail: string;
}): Promise<CreatedBoothInvite> {
  const normalizedInviteEmail = normalizeInviteEmail(params.invitedEmail);
  if (!normalizedInviteEmail) {
    throw new Error('Invite email is required');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Authenticated user required for booth invite creation');
  }

  const { data, error } = await supabase
    .from('booth_invites')
    .insert({
      booth_id: params.boothId,
      invited_by: userData.user.id,
      invited_email: params.invitedEmail.trim(),
      invited_email_normalized: normalizedInviteEmail,
      status: 'pending'
    })
    .select('id, booth_id, invited_email, status, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Invite creation returned no row');
  }

  const row = data as BoothInviteInsertRow;
  return {
    boothId: row.booth_id,
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email,
    status: 'pending'
  };
}

export async function listPendingBoothInvitesForEmail(
  email: string | null | undefined
): Promise<PendingBoothInvite[]> {
  const normalizedEmail = normalizeInviteEmail(email ?? '');
  if (!normalizedEmail) {
    return [];
  }

  const { data, error } = await supabase
    .from('booth_invites')
    .select('id, booth_id, invited_email, created_at, booths(name)')
    .eq('invited_email_normalized', normalizedEmail)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as BoothInvitePendingRow[];
  return rows.map((row) => ({
    boothId: row.booth_id,
    boothName: readBoothName(row.booths),
    createdAt: row.created_at,
    id: row.id,
    invitedEmail: row.invited_email
  }));
}

export async function respondToBoothInvite(
  inviteId: string,
  decision: BoothInviteDecision
): Promise<void> {
  const { error } = await supabase.rpc('respond_to_booth_invite', {
    decision,
    invite_id: inviteId
  });

  if (error) {
    throw new Error(error.message);
  }
}
