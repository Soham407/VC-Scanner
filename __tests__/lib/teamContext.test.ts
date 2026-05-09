import { getActiveTeamId, setActiveTeamId } from '../../src/lib/teamContext';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn()
  }
}));

describe('teamContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads active team id for the authenticated user', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });

    const maybeSingle = jest.fn().mockResolvedValue({
      data: { team_id: 'team-123' },
      error: null
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(getActiveTeamId()).resolves.toBe('team-123');

    expect(supabase.from).toHaveBeenCalledWith('user_team_contexts');
    expect(select).toHaveBeenCalledWith('team_id');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('returns null when no authenticated user is present', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null
    });

    await expect(getActiveTeamId()).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('persists active team id via upsert', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });

    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    await setActiveTeamId('team-123');

    expect(supabase.from).toHaveBeenCalledWith('user_team_contexts');
    expect(upsert).toHaveBeenCalledWith(
      {
        team_id: 'team-123',
        user_id: 'user-123'
      },
      {
        onConflict: 'user_id'
      }
    );
  });

  it('clears active team context when team id is null', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null
    });

    const eq = jest.fn().mockResolvedValue({ error: null });
    const deleteRow = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: deleteRow });

    await setActiveTeamId(null);

    expect(supabase.from).toHaveBeenCalledWith('user_team_contexts');
    expect(deleteRow).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('user_id', 'user-123');
  });
});
