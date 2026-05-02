import { supabase } from './supabase';

type CreateBatchRpcResult = {
  batch_id: string;
  scan_count: number;
};

type ApproveBatchRpcResult = {
  assigned_count: number;
};

export type CreatedBoothAssignmentBatch = {
  batchId: string;
  scanCount: number;
};

export type ApprovedBoothAssignmentBatch = {
  assignedCount: number;
};

export async function createBoothAssignmentBatch(
  boothId: string
): Promise<CreatedBoothAssignmentBatch> {
  const { data, error } = await supabase.rpc('create_booth_assignment_batch', {
    target_booth_id: boothId
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data as CreateBatchRpcResult | null;
  if (!row || !row.batch_id) {
    throw new Error('Batch creation returned no row');
  }

  return {
    batchId: row.batch_id,
    scanCount: row.scan_count
  };
}

export async function approveBoothAssignmentBatch(
  batchId: string
): Promise<ApprovedBoothAssignmentBatch> {
  const { data, error } = await supabase.rpc('approve_booth_assignment_batch', {
    target_batch_id: batchId
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = data as ApproveBatchRpcResult | null;
  if (!row) {
    throw new Error('Batch approval returned no row');
  }

  return {
    assignedCount: row.assigned_count
  };
}
