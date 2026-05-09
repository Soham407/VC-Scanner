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
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          team_id: 'team-1',
          teams: { name: 'Main Team' },
          created_at: '2026-05-02T10:00:00.000Z',
          id: 'invite-1',
          invited_email: 'user@example.com'
        }
      ],
      error: null
    });
    const eqStatus = jest.fn().mockReturnValue({ order });
    const eqInvitedEmail = jest.fn().mockReturnValue({ eq: eqStatus });
    const select = jest.fn().mockReturnValue({ eq: eqInvitedEmail });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listPendingTeamInvitesForEmail('User@Example.com')).resolves.toEqual([
      {
        teamId: 'team-1',
        teamName: 'Main Team',
        createdAt: '2026-05-02T10:00:00.000Z',
        id: 'invite-1',
        invitedEmail: 'user@example.com'
      }
    ]);

    expect(supabase.from).toHaveBeenCalledWith('team_invites');
    expect(eqInvitedEmail).toHaveBeenCalledWith('invited_email_normalized', 'user@example.com');
    expect(eqStatus).toHaveBeenCalledWith('status', 'pending');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
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
