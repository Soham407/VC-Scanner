import {
  createTeamInvite,
  listPendingTeamInvitesForEmail,
  respondToTeamInvite
} from '../../src/lib/teamInvites';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn(),
    rpc: jest.fn()
  }
}));

describe('teamInvites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a pending invite for any email address', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'leader-1' } },
      error: null
    });

    const single = jest.fn().mockResolvedValue({
      data: {
        team_id: 'team-1',
        created_at: '2026-05-02T11:30:00.000Z',
        id: 'invite-1',
        invited_email: 'worker@example.com',
        status: 'pending'
      },
      error: null
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(
      createTeamInvite({
        teamId: 'team-1',
        invitedEmail: 'Worker@Example.com'
      })
    ).resolves.toEqual({
      teamId: 'team-1',
      createdAt: '2026-05-02T11:30:00.000Z',
      id: 'invite-1',
      invitedEmail: 'worker@example.com',
      status: 'pending'
    });

    expect(supabase.from).toHaveBeenCalledWith('team_invites');
    expect(insert).toHaveBeenCalledWith({
      team_id: 'team-1',
      invited_by: 'leader-1',
      invited_email: 'Worker@Example.com',
      invited_email_normalized: 'worker@example.com',
      status: 'pending'
    });
  });

  it('lists pending invites for the signed-in email in oldest-first order', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          team_id: 'team-1',
          team_name: 'Main Team',
          team_leader_email: 'leader@example.com',
          created_at: '2026-05-02T10:00:00.000Z',
          id: 'invite-1',
          invited_email: 'user@example.com'
        }
      ],
      error: null
    });

    await expect(listPendingTeamInvitesForEmail('User@Example.com')).resolves.toEqual([
      {
        teamId: 'team-1',
        teamName: 'Main Team',
        teamLeaderEmail: 'leader@example.com',
        createdAt: '2026-05-02T10:00:00.000Z',
        id: 'invite-1',
        invitedEmail: 'user@example.com'
      }
    ]);

    expect(supabase.rpc).toHaveBeenCalledWith('list_pending_team_invites_for_current_user');
  });

  it('responds to an invite through the secure RPC workflow', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });

    await expect(respondToTeamInvite('invite-1', 'accept')).resolves.toBeUndefined();

    expect(supabase.rpc).toHaveBeenCalledWith('respond_to_team_invite', {
      decision: 'accept',
      invite_id: 'invite-1'
    });
  });
});
