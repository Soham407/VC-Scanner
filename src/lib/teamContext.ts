import { supabase } from './supabase';

type ActiveTeamContextRow = {
  team_id: string;
};

export async function getActiveTeamId(): Promise<string | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_team_contexts')
    .select('team_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ActiveTeamContextRow | null)?.team_id ?? null;
}

export async function setActiveTeamId(teamId: string | null): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error('Authenticated user required for team context');
  }

  const userId = userData.user.id;

  if (teamId === null) {
    const { error } = await supabase.from('user_team_contexts').delete().eq('user_id', userId);
    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase
    .from('user_team_contexts')
    .upsert(
      {
        team_id: teamId,
        user_id: userId
      },
      {
        onConflict: 'user_id'
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}
