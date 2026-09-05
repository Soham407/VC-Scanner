import { useEffect, useMemo, useState } from 'react';

import {
  addBatchItem,
  approveBatch,
  createAssignmentBatch,
  loadPendingAssignmentBatch,
  loadAllTeamLeads,
  loadTeamMembers,
  reassignLead,
  removeBatchItem
} from '../lib/api';
import type { Lead, PendingBatch, TeamMember } from '../lib/types';
import { EmptyState } from '../components/EmptyState';

type WorkerAllocation = {
  count: number;
  userId: string;
};

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

function buildDefaultWorkerAllocations(workers: TeamMember[], totalCount: number): WorkerAllocation[] {
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

export function AssignPage({ teamId }: { teamId: string }) {
  const [batch, setBatch] = useState<PendingBatch | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [allocations, setAllocations] = useState<WorkerAllocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [batchData, leadData, memberData] = await Promise.all([
      loadPendingAssignmentBatch(teamId),
      loadAllTeamLeads(teamId),
      loadTeamMembers(teamId)
    ]);
    setBatch(batchData);
    setLeads(leadData);
    setMembers(memberData);
  }

  const workerMembers = useMemo(() => members.filter((member) => !member.isLeader), [members]);
  const workerMemberIds = useMemo(() => workerMembers.map((member) => member.userId).join(','), [workerMembers]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    refresh()
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load assignment data');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teamId]);

  const assignedIds = new Set(batch?.items.map((item) => item.scannedLeadId));
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const unassignedLeads = leads.filter((lead) => !lead.assignedToUserId);
  const assignedLeads = leads.filter((lead) => lead.assignedToUserId);
  const batchSize = batch?.items.length ?? 0;
  const allocationTotal = allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  const canApproveBatch = batchSize > 0 && workerMembers.length > 0 && allocationTotal === batchSize;
  const allocationResetKey = `${batch?.batchId ?? ''}:${batchSize}:${workerMemberIds}`;

  useEffect(() => {
    if (batchSize === 0 || workerMembers.length === 0) {
      setAllocations([]);
      return;
    }

    setAllocations(buildDefaultWorkerAllocations(workerMembers, batchSize));
  }, [allocationResetKey, workerMembers, batchSize]);

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Assignments</div>
          <h2>Batch review and reassignment</h2>
        </div>
        <button
          className="primary-button"
          disabled={busy || Boolean(batch)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setNotice(null);
            try {
              const created = await createAssignmentBatch(teamId);
              await refresh();
              setNotice(`Created batch with ${created.scanCount} scans`);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to create batch');
            } finally {
              setBusy(false);
            }
          }}
        >
          {batch ? 'Batch pending' : 'New batch'}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="success-text">{notice}</p> : null}
      {loading ? <div className="card loading-card">Loading assignment workspace...</div> : null}

      <div className="two-col">
        <div className="card stack">
          <div className="card-top">
            <strong>Pending batch</strong>
            <span>{batch ? `${batch.items.length} scans` : 'None'}</span>
          </div>
          {batch ? (
            <>
              <div className="stack">
                <div className="card-top">
                  <strong>Worker allocations</strong>
                  <span>
                    {allocationTotal}/{batch.items.length}
                  </span>
                </div>
                {workerMembers.length === 0 ? (
                  <EmptyState title="No workers yet">Add at least one worker before approving assignments.</EmptyState>
                ) : (
                  <div className="list compact">
                    {workerMembers.map((member) => {
                      const allocation = allocations.find((entry) => entry.userId === member.userId);

                      return (
                        <div className="mini-row" key={member.userId}>
                          <span>{member.email}</span>
                          <input
                            aria-label={`Cards for ${member.email}`}
                            min={0}
                            type="number"
                            value={allocation?.count ?? 0}
                            onChange={(event) => {
                              const nextCount = Number.parseInt(event.target.value, 10);
                              const normalizedCount = Number.isNaN(nextCount) ? 0 : Math.max(0, nextCount);
                              setAllocations((currentAllocations) => {
                                const nextAllocations = currentAllocations.map((entry) =>
                                  entry.userId === member.userId
                                    ? { ...entry, count: normalizedCount }
                                    : entry
                                );

                                if (nextAllocations.some((entry) => entry.userId === member.userId)) {
                                  return nextAllocations;
                                }

                                return [...nextAllocations, { userId: member.userId, count: normalizedCount }];
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="list compact">
                {batch.items.map((item) => (
                  <div className="mini-row" key={item.scannedLeadId}>
                    <span>{leadById.get(item.scannedLeadId)?.companyName ?? leadById.get(item.scannedLeadId)?.fullName ?? 'Untitled lead'}</span>
                    <button
                      className="ghost-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        setNotice(null);
                        try {
                          await removeBatchItem(batch.batchId, item.scannedLeadId);
                          await refresh();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to remove lead from batch');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="primary-button"
                disabled={busy || !canApproveBatch}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    if (workerMembers.length === 0) {
                      setError('Add at least one worker before approving assignments.');
                      return;
                    }

                    if (!batch) {
                      setError('No pending batch is available.');
                      return;
                    }

                    if (allocationTotal !== batch.items.length) {
                      setError('Worker counts must total the selected batch size before approval.');
                      return;
                    }

                    const count = await approveBatch(
                      batch.batchId,
                      allocations
                    );
                    await refresh();
                    setNotice(`Approved ${count} assignments`);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to approve batch');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Approve batch
              </button>
            </>
          ) : (
            <EmptyState title="No pending batch">Create a batch to collect unassigned scans for team distribution.</EmptyState>
          )}
        </div>

        <div className="card stack">
          <div className="card-top">
            <strong>Unassigned leads</strong>
            <span>{unassignedLeads.length}</span>
          </div>
          <div className="list compact">
            {!loading && unassignedLeads.length === 0 ? (
              <EmptyState title="No unassigned leads">New team scans will appear here before they are assigned.</EmptyState>
            ) : null}
            {unassignedLeads.map((lead) => (
              <div className="mini-row" key={lead.id}>
                <span>{lead.companyName ?? lead.fullName ?? 'Untitled lead'}</span>
                <button
                  className="ghost-button"
                  disabled={busy || !batch || assignedIds.has(lead.id)}
                  onClick={async () => {
                    if (!batch) return;
                    setBusy(true);
                    setError(null);
                    setNotice(null);
                    try {
                      await addBatchItem(batch.batchId, lead.id);
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to add lead to batch');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="card-top">
          <strong>Reassign active cards</strong>
          <span>{assignedLeads.length}</span>
        </div>
        <div className="list compact">
          {!loading && assignedLeads.length === 0 ? <EmptyState title="No assigned cards yet">Approved batches and reassigned leads appear here.</EmptyState> : null}
          {assignedLeads.map((lead) => (
            <div className="mini-row reassignment-row" key={lead.id}>
              <div>
                <strong>{lead.companyName ?? lead.fullName ?? 'Unnamed company'}</strong>
                <p className="muted">
                  {lead.fullName ?? 'No contact'} · {lead.assignmentState ?? 'assigned'}
                </p>
              </div>
              <select
                aria-label={`Reassign ${lead.companyName ?? lead.fullName ?? lead.id}`}
                value={lead.assignedToUserId ?? ''}
                disabled={busy || workerMembers.length === 0}
                onChange={async (event) => {
                  if (!event.target.value || event.target.value === lead.assignedToUserId) return;
                  setBusy(true);
                  setError(null);
                  setNotice(null);
                  try {
                    await reassignLead(lead.id, event.target.value);
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to reassign lead');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {workerMembers.length === 0 ? <option value="">No workers available</option> : null}
                {workerMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.email}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
