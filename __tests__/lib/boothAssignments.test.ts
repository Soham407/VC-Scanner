import {
  approveBoothAssignmentBatch,
  createBoothAssignmentBatch
} from '../../src/lib/boothAssignments';
import { supabase } from '../../src/lib/supabase';

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn()
  }
}));

describe('boothAssignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a booth assignment batch through RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        batch_id: 'batch-1',
        scan_count: 3
      },
      error: null
    });

    await expect(createBoothAssignmentBatch('booth-1')).resolves.toEqual({
      batchId: 'batch-1',
      scanCount: 3
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_booth_assignment_batch', {
      target_booth_id: 'booth-1'
    });
  });

  it('approves a booth assignment batch through RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        assigned_count: 3
      },
      error: null
    });

    await expect(approveBoothAssignmentBatch('batch-1')).resolves.toEqual({
      assignedCount: 3
    });

    expect(supabase.rpc).toHaveBeenCalledWith('approve_booth_assignment_batch', {
      target_batch_id: 'batch-1'
    });
  });
});
