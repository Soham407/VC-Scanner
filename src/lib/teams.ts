import { supabase } from './supabase';

export type AccessibleTeam = {
  createdAt: string;
  createdBy: string;
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

  const { data, error } = await supabase.rpc('create_team', {
    team_name: trimmedName
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Team creation returned no row');
  }

  return mapTeamRow(data as TeamRow);
}
