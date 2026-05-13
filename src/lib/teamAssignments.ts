import { supabase } from './supabase';

type CreateBatchRpcResult = {
  batch_id: string;
  scan_count: number;
};

type ApproveBatchRpcResult = {
  assigned_count: number;
};

function firstRow<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, index) => index);

  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = indices[index];
    indices[index] = indices[swapIndex];
    indices[swapIndex] = current;
  }

  return indices;
}

export type CreatedTeamAssignmentBatch = {
  batchId: string;
  scanCount: number;
};

export type ApprovedTeamAssignmentBatch = {
  assignedCount: number;
};

export type TeamWorkerAllocation = {
  count: number;
  userId: string;
};

export type PendingTeamAssignmentBatchItem = {
  createdAt: string;
  scannedLeadId: string;
};

export type PendingTeamAssignmentBatch = {
  batchId: string;
  scanCount: number;
  items: PendingTeamAssignmentBatchItem[];
};

export type AssignmentState = 'assigned' | 'done' | 'needs_review';

export function buildDefaultWorkerAllocations(
  workers: Array<{ userId: string }>,
  totalCount: number
): TeamWorkerAllocation[] {
  if (workers.length === 0) {
    return [];
  }

  const safeTotalCount = Math.max(0, Math.trunc(totalCount));
  const baseCount = Math.floor(safeTotalCount / workers.length);
  const remainder = safeTotalCount % workers.length;
  const counts = workers.map(() => baseCount);
  const shuffledIndices = shuffleIndices(workers.length);

  for (let index = 0; index < remainder; index += 1) {
    counts[shuffledIndices[index]] += 1;
  }

  return workers.map((worker, index) => ({
    count: counts[index],
    userId: worker.userId
  }));
}

export async function createTeamAssignmentBatch(
  teamId: string
): Promise<CreatedTeamAssignmentBatch> {
  const { data, error } = await supabase.rpc('create_team_assignment_batch', {
    target_team_id: teamId
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = firstRow(data as CreateBatchRpcResult | CreateBatchRpcResult[] | null);
  if (!row || !row.batch_id) {
    throw new Error('Batch creation returned no row');
  }

  return {
    batchId: row.batch_id,
    scanCount: row.scan_count
  };
}

export async function loadPendingTeamAssignmentBatch(
  teamId: string
): Promise<PendingTeamAssignmentBatch | null> {
  const { data: batchData, error: batchError } = await supabase
    .from('team_assignment_batches')
    .select('id, scan_count, created_at')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (batchError) {
    throw new Error(batchError.message);
  }

  if (!batchData) {
    return null;
  }

  const { data: itemData, error: itemError } = await supabase
    .from('team_assignment_batch_items')
    .select('scanned_lead_id, created_at')
    .eq('batch_id', batchData.id)
    .order('created_at', { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  return {
    batchId: batchData.id,
    scanCount: batchData.scan_count,
    items: ((itemData ?? []) as Array<{ created_at: string; scanned_lead_id: string }>).map((row) => ({
      createdAt: row.created_at,
      scannedLeadId: row.scanned_lead_id
    }))
  };
}

export async function approveTeamAssignmentBatch(
  batchId: string,
  allocations: TeamWorkerAllocation[]
): Promise<ApprovedTeamAssignmentBatch> {
  const { data, error } = await supabase.rpc('approve_team_assignment_batch', {
    target_batch_id: batchId,
    worker_allocations: allocations
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = firstRow(data as ApproveBatchRpcResult | ApproveBatchRpcResult[] | null);
  if (!row) {
    throw new Error('Batch approval returned no row');
  }

  return {
    assignedCount: row.assigned_count
  };
}

export async function addTeamAssignmentBatchItem(
  batchId: string,
  scannedLeadId: string
): Promise<void> {
  const { error } = await supabase.rpc('add_team_assignment_batch_item', {
    target_batch_id: batchId,
    target_scanned_lead_id: scannedLeadId
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeTeamAssignmentBatchItem(
  batchId: string,
  scannedLeadId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_team_assignment_batch_item', {
    target_batch_id: batchId,
    target_scanned_lead_id: scannedLeadId
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateTeamAssignmentState(
  scannedLeadId: string,
  assignmentState: AssignmentState
): Promise<void> {
  const { error } = await supabase.rpc('update_team_assignment_state', {
    target_assignment_state: assignmentState,
    target_scanned_lead_id: scannedLeadId
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function reassignTeamAssignment(
  scannedLeadId: string,
  assignedToUserId: string
): Promise<void> {
  const { error } = await supabase.rpc('reassign_team_assignment', {
    target_assigned_to_user_id: assignedToUserId,
    target_scanned_lead_id: scannedLeadId
  });

  if (error) {
    throw new Error(error.message);
  }
}
