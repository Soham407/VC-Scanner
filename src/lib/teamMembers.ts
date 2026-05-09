import { supabase } from './supabase';

export type TeamMember = {
  createdAt: string;
  email: string;
  isLeader: boolean;
  userId: string;
};

type TeamMemberRow = {
  created_at: string;
  email: string;
  is_leader: boolean;
  user_id: string;
};

export async function loadTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('list_team_members', {
    target_team_id: teamId
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as TeamMemberRow[]).map((row) => ({
    createdAt: row.created_at,
    email: row.email,
    isLeader: row.is_leader,
    userId: row.user_id
  }));
}

export async function promoteTeamMemberToLeader(
  teamId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('promote_team_member_to_leader', {
    target_team_id: teamId,
    target_user_id: userId
  });

  if (error) {
    throw new Error(error.message);
  }
}
