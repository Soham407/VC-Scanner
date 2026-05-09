import { supabase } from './supabase';

export type AccessibleTeam = {
  createdAt: string;
  createdBy: string;
  id: string;
  name: string;
};

type TeamInsertRow = {
  created_at: string;
  created_by: string;
  id: string;
  name: string;
};

type TeamRow = {
  created_at: string;
  created_by: string;
  id: string;
  name: string;
};

function mapTeamRow(row: TeamRow): AccessibleTeam {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    name: row.name
  };
}

export async function loadAccessibleTeams(): Promise<AccessibleTeam[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, created_by, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as TeamRow[]).map(mapTeamRow);
}

export async function createTeam(name: string): Promise<AccessibleTeam> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Team name is required');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Authenticated user required for team creation');
  }

  const { data, error } = await supabase
    .from('teams')
    .insert({
      created_by: userData.user.id,
      name: trimmedName
    })
    .select('id, name, created_by, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Team creation returned no row');
  }

  const team = mapTeamRow(data as TeamInsertRow);

  const { error: membershipError } = await supabase.from('team_memberships').insert({
    team_id: team.id,
    user_id: userData.user.id
  });

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const { error: contextError } = await supabase
    .from('user_team_contexts')
    .upsert(
      {
        team_id: team.id,
        user_id: userData.user.id
      },
      {
        onConflict: 'user_id'
      }
    );

  if (contextError) {
    throw new Error(contextError.message);
  }

  return team;
}
