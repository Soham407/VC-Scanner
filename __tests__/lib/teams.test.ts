import { createTeam } from '../../src/lib/teams';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn()
  }
}));

describe('teams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates teams through the RPC that also creates creator membership', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          created_at: '2026-05-13T12:00:00Z',
          created_by: 'user-1',
          id: 'team-1',
          name: 'Main Team'
        }
      ],
      error: null
    });

    await expect(createTeam('  Main Team  ')).resolves.toEqual({
      createdAt: '2026-05-13T12:00:00Z',
      createdBy: 'user-1',
      id: 'team-1',
      name: 'Main Team'
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_team', {
      team_name: 'Main Team'
    });
  });
});
