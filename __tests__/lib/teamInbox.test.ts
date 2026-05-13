import { loadTeamInboxReview } from '../../src/lib/teamInbox';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

describe('teamInbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createQueryChain<T>(result: { data: T; error: null }) {
    const chain: {
      eq: jest.Mock;
      is: jest.Mock;
      maybeSingle: jest.Mock;
      order: jest.Mock;
    } = {
      eq: jest.fn(() => chain),
      is: jest.fn(() => chain),
      maybeSingle: jest.fn().mockResolvedValue(result),
      order: jest.fn().mockResolvedValue(result)
    };

    return chain;
  }

  it('returns leader inbox rows for all scans in the active team', async () => {
    const activeTeamQuery = createQueryChain({
      data: { team_id: 'team-1' },
      error: null
    });

    const teamQuery = createQueryChain({
      data: {
        created_by: 'leader-1',
        id: 'team-1',
        name: 'North Hall'
      },
      error: null
    });

    const leaderQuery = createQueryChain({
      data: null,
      error: null
    });

    const inboxQuery = createQueryChain({
      data: [
        {
          id: 'lead-2',
          team_id: 'team-1',
          user_id: 'worker-2',
          full_name: 'Ada Lovelace',
          job_title: 'Engineer',
          company_name: 'Acme',
          product_services: 'Automation systems',
          email: 'ada@example.com',
          phone_number: null,
          image_url: 'worker-2/lead-2.jpg',
          raw_ocr_text: 'Ada',
          parse_status: 'parsed',
          created_at: '2026-05-01T12:00:00Z'
        },
        {
          id: 'lead-1',
          team_id: 'team-1',
          user_id: 'leader-1',
          full_name: 'Grace Hopper',
          job_title: 'Captain',
          company_name: 'Navy',
          product_services: null,
          email: 'grace@example.com',
          phone_number: null,
          image_url: 'leader-1/lead-1.jpg',
          raw_ocr_text: 'Grace',
          parse_status: 'parsed',
          created_at: '2026-05-01T11:00:00Z'
        }
      ],
      error: null
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'user_team_contexts') {
        return {
          select: jest.fn().mockReturnValue(activeTeamQuery)
        };
      }

      if (table === 'teams') {
        return {
          select: jest.fn().mockReturnValue(teamQuery)
        };
      }

      if (table === 'team_leaders') {
        return {
          select: jest.fn().mockReturnValue(leaderQuery)
        };
      }

      if (table === 'scanned_leads') {
        return {
          select: jest.fn().mockReturnValue(inboxQuery)
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(loadTeamInboxReview('leader-1')).resolves.toEqual({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      items: [
        {
          address: null,
          assignedAt: null,
          assignedToUserId: null,
          assignmentState: null,
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          productServices: 'Automation systems',
          rawText: 'Ada'
        },
        {
          address: null,
          assignedAt: null,
          assignedToUserId: null,
          assignmentState: null,
          teamId: 'team-1',
          capturedByUserId: 'leader-1',
          companyName: 'Navy',
          createdAt: '2026-05-01T11:00:00Z',
          email: 'grace@example.com',
          fullName: 'Grace Hopper',
          id: 'lead-1',
          imagePath: 'leader-1/lead-1.jpg',
          jobTitle: 'Captain',
          parseStatus: 'parsed',
          phoneNumber: null,
          productServices: null,
          rawText: 'Grace'
        }
      ],
      mode: 'leader-inbox'
    });
  });

  it('includes assigned rows in leader inbox mode', async () => {
    const activeTeamQuery = createQueryChain({
      data: { team_id: 'team-1' },
      error: null
    });

    const teamQuery = createQueryChain({
      data: {
        created_by: 'leader-1',
        id: 'team-1',
        name: 'North Hall'
      },
      error: null
    });

    const leaderQuery = createQueryChain({
      data: null,
      error: null
    });

    const inboxQuery = createQueryChain({
      data: [
        {
          id: 'lead-2',
          team_id: 'team-1',
          user_id: 'worker-2',
          full_name: 'Ada Lovelace',
          job_title: 'Engineer',
          company_name: 'Acme',
          product_services: 'Automation systems',
          email: 'ada@example.com',
          phone_number: null,
          image_url: 'worker-2/lead-2.jpg',
          raw_ocr_text: 'Ada',
          parse_status: 'parsed',
          created_at: '2026-05-01T12:00:00Z',
          lead_assignments: {
            assigned_at: '2026-05-04T10:00:00Z',
            assigned_to_user_id: 'worker-9',
            assignment_state: 'assigned'
          }
        }
      ],
      error: null
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'user_team_contexts') {
        return {
          select: jest.fn().mockReturnValue(activeTeamQuery)
        };
      }

      if (table === 'teams') {
        return {
          select: jest.fn().mockReturnValue(teamQuery)
        };
      }

      if (table === 'team_leaders') {
        return {
          select: jest.fn().mockReturnValue(leaderQuery)
        };
      }

      if (table === 'scanned_leads') {
        return {
          select: jest.fn().mockReturnValue(inboxQuery)
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(loadTeamInboxReview('leader-1')).resolves.toEqual({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      items: [
        {
          address: null,
          assignedAt: '2026-05-04T10:00:00Z',
          assignedToUserId: 'worker-9',
          assignmentState: 'assigned',
          teamId: 'team-1',
          capturedByUserId: 'worker-2',
          companyName: 'Acme',
          createdAt: '2026-05-01T12:00:00Z',
          email: 'ada@example.com',
          fullName: 'Ada Lovelace',
          id: 'lead-2',
          imagePath: 'worker-2/lead-2.jpg',
          jobTitle: 'Engineer',
          parseStatus: 'parsed',
          phoneNumber: null,
          productServices: 'Automation systems',
          rawText: 'Ada'
        }
      ],
      mode: 'leader-inbox'
    });
  });

  it('returns worker assigned-work rows scoped to the signed-in worker', async () => {
    const activeTeamQuery = createQueryChain({
      data: { team_id: 'team-1' },
      error: null
    });

    const teamQuery = createQueryChain({
      data: {
        created_by: 'leader-1',
        id: 'team-1',
        name: 'North Hall'
      },
      error: null
    });

    const leaderQuery = createQueryChain({
      data: null,
      error: null
    });

    const assignmentQuery = createQueryChain({
      data: [
        {
          assigned_at: '2026-05-01T13:10:00Z',
          assigned_to_user_id: 'worker-7',
          assignment_state: 'assigned',
          scanned_leads: {
            id: 'lead-3',
            team_id: 'team-1',
            user_id: 'worker-9',
            full_name: 'Worker User',
            job_title: null,
            company_name: 'Acme',
            product_services: 'Control panels',
            email: null,
            phone_number: null,
            image_url: 'worker-9/lead-3.jpg',
            raw_ocr_text: 'Worker',
            parse_status: 'parsed',
            created_at: '2026-05-01T13:00:00Z'
          }
        }
      ],
      error: null
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'user_team_contexts') {
        return {
          select: jest.fn().mockReturnValue(activeTeamQuery)
        };
      }

      if (table === 'teams') {
        return {
          select: jest.fn().mockReturnValue(teamQuery)
        };
      }

      if (table === 'team_leaders') {
        return {
          select: jest.fn().mockReturnValue(leaderQuery)
        };
      }

      if (table === 'lead_assignments') {
        return {
          select: jest.fn().mockReturnValue(assignmentQuery)
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(loadTeamInboxReview('worker-7')).resolves.toEqual({
      activeTeamId: 'team-1',
      teamName: 'North Hall',
      items: [
        {
          address: null,
          assignedAt: '2026-05-01T13:10:00Z',
          assignedToUserId: 'worker-7',
          assignmentState: 'assigned',
          teamId: 'team-1',
          capturedByUserId: 'worker-9',
          companyName: 'Acme',
          createdAt: '2026-05-01T13:00:00Z',
          email: null,
          fullName: 'Worker User',
          id: 'lead-3',
          imagePath: 'worker-9/lead-3.jpg',
          jobTitle: null,
          parseStatus: 'parsed',
          phoneNumber: null,
          productServices: 'Control panels',
          rawText: 'Worker'
        }
      ],
      mode: 'worker-history'
    });
  });

  it('falls back to personal history when the active team context is stale', async () => {
    const activeTeamQuery = createQueryChain({
      data: { team_id: 'team-missing' },
      error: null
    });

    const teamQuery = createQueryChain({
      data: null,
      error: null
    });

    const userHistoryQuery = createQueryChain({
      data: [
        {
          id: 'lead-solo',
          team_id: null,
          user_id: 'user-1',
          full_name: 'Solo User',
          job_title: null,
          company_name: 'Personal Co',
          product_services: 'Solo consulting',
          email: null,
          phone_number: null,
          image_url: 'user-1/lead-solo.jpg',
          raw_ocr_text: 'Solo User',
          parse_status: 'parsed',
          created_at: '2026-05-01T14:00:00Z'
        }
      ],
      error: null
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'user_team_contexts') {
        return {
          select: jest.fn().mockReturnValue(activeTeamQuery)
        };
      }

      if (table === 'teams') {
        return {
          select: jest.fn().mockReturnValue(teamQuery)
        };
      }

      if (table === 'scanned_leads') {
        return {
          select: jest.fn().mockReturnValue(userHistoryQuery)
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(loadTeamInboxReview('user-1')).resolves.toEqual({
      activeTeamId: null,
      teamName: null,
      items: [
        {
          address: null,
          assignedAt: null,
          assignedToUserId: null,
          assignmentState: null,
          teamId: null,
          capturedByUserId: 'user-1',
          companyName: 'Personal Co',
          createdAt: '2026-05-01T14:00:00Z',
          email: null,
          fullName: 'Solo User',
          id: 'lead-solo',
          imagePath: 'user-1/lead-solo.jpg',
          jobTitle: null,
          parseStatus: 'parsed',
          phoneNumber: null,
          productServices: 'Solo consulting',
          rawText: 'Solo User'
        }
      ],
      mode: 'worker-history'
    });
  });
});
