import {
  addTeamAssignmentBatchItem,
  approveTeamAssignmentBatch,
  buildDefaultWorkerAllocations,
  createTeamAssignmentBatch,
  loadPendingTeamAssignmentBatch,
  reassignTeamAssignment,
  removeTeamAssignmentBatchItem
} from '../../src/lib/teamAssignments';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn()
  }
}));

describe('teamAssignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createQueryChain<T>(result: { data: T; error: null }) {
    const chain: {
      eq: jest.Mock;
      limit: jest.Mock;
      maybeSingle: jest.Mock;
      order: jest.Mock;
      select: jest.Mock;
    } = {
      eq: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      maybeSingle: jest.fn().mockResolvedValue(result),
      order: jest.fn(() => chain),
      select: jest.fn(() => chain)
    };

    return chain;
  }

  it('creates a team assignment batch through RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          batch_id: 'batch-1',
          scan_count: 3
        }
      ],
      error: null
    });

    await expect(createTeamAssignmentBatch('team-1')).resolves.toEqual({
      batchId: 'batch-1',
      scanCount: 3
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_team_assignment_batch', {
      target_team_id: 'team-1'
    });
  });

  it('approves a team assignment batch through RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          assigned_count: 3
        }
      ],
      error: null
    });

    await expect(approveTeamAssignmentBatch('batch-1', [
      {
        count: 2,
        userId: 'worker-1'
      },
      {
        count: 1,
        userId: 'worker-2'
      }
    ])).resolves.toEqual({
      assignedCount: 3
    });

    expect(supabase.rpc).toHaveBeenCalledWith('approve_team_assignment_batch', {
      target_batch_id: 'batch-1',
      worker_allocations: [
        {
          count: 2,
          userId: 'worker-1'
        },
        {
          count: 1,
          userId: 'worker-2'
        }
      ]
    });
  });

  it('builds equal allocations and randomizes the extra card across workers', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const allocations = buildDefaultWorkerAllocations([
      { userId: 'worker-1' },
      { userId: 'worker-2' },
      { userId: 'worker-3' }
    ], 4);

    expect(allocations).toHaveLength(3);
    expect(allocations.map((allocation) => allocation.userId)).toEqual([
      'worker-1',
      'worker-2',
      'worker-3'
    ]);
    expect(allocations.map((allocation) => allocation.count).sort()).toEqual([1, 1, 2]);

    randomSpy.mockRestore();
  });

  it('loads the current pending batch for a team', async () => {
    const batchQuery: {
      eq: jest.Mock;
      limit: jest.Mock;
      maybeSingle: jest.Mock;
      order: jest.Mock;
      select: jest.Mock;
    } = {
      eq: jest.fn(() => batchQuery),
      limit: jest.fn(() => batchQuery),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'batch-1',
          scan_count: 2
        },
        error: null
      }),
      order: jest.fn(() => batchQuery),
      select: jest.fn(() => batchQuery)
    };
    let itemQuery: {
      eq: jest.Mock;
      order: jest.Mock;
      select: jest.Mock;
    };
    itemQuery = {
      eq: jest.fn(() => itemQuery),
      order: jest.fn().mockResolvedValue({
        data: [
          {
            created_at: '2026-05-04T10:00:00Z',
            scanned_lead_id: 'lead-1'
          },
          {
            created_at: '2026-05-04T10:05:00Z',
            scanned_lead_id: 'lead-2'
          }
        ],
        error: null
      }),
      select: jest.fn(() => itemQuery)
    };

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'team_assignment_batches') {
        return {
          select: jest.fn().mockReturnValue(batchQuery)
        };
      }

      if (table === 'team_assignment_batch_items') {
        return {
          select: jest.fn().mockReturnValue(itemQuery)
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(loadPendingTeamAssignmentBatch('team-1')).resolves.toEqual({
      batchId: 'batch-1',
      scanCount: 2,
      items: [
        {
          createdAt: '2026-05-04T10:00:00Z',
          scannedLeadId: 'lead-1'
        },
        {
          createdAt: '2026-05-04T10:05:00Z',
          scannedLeadId: 'lead-2'
        }
      ]
    });
  });

  it('adds and removes items from the pending batch through RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await addTeamAssignmentBatchItem('batch-1', 'lead-1');
    await removeTeamAssignmentBatchItem('batch-1', 'lead-1');

    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'add_team_assignment_batch_item', {
      target_batch_id: 'batch-1',
      target_scanned_lead_id: 'lead-1'
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'remove_team_assignment_batch_item', {
      target_batch_id: 'batch-1',
      target_scanned_lead_id: 'lead-1'
    });
  });

  it('reassigns an assignment through RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await reassignTeamAssignment('lead-1', 'worker-2');

    expect(supabase.rpc).toHaveBeenCalledWith('reassign_team_assignment', {
      target_assigned_to_user_id: 'worker-2',
      target_scanned_lead_id: 'lead-1'
    });
  });
});
