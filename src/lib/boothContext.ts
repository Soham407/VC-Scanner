import { supabase } from './supabase';

type ActiveBoothContextRow = {
  booth_id: string;
};

export async function getActiveBoothId(): Promise<string | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_booth_contexts')
    .select('booth_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ActiveBoothContextRow | null)?.booth_id ?? null;
}

export async function setActiveBoothId(boothId: string | null): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error('Authenticated user required for booth context');
  }

  const userId = userData.user.id;

  if (boothId === null) {
    const { error } = await supabase.from('user_booth_contexts').delete().eq('user_id', userId);
    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase
    .from('user_booth_contexts')
    .upsert(
      {
        booth_id: boothId,
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
