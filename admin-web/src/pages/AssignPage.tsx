import { useEffect, useState } from 'react';

import {
  addBatchItem,
  approveBatch,
  createAssignmentBatch,
  loadPendingAssignmentBatch,
  loadTeamLeads,
  loadTeamMembers,
  reassignLead,
  removeBatchItem
} from '../lib/api';
import type { Lead, PendingBatch, TeamMember } from '../lib/types';

export function AssignPage({ teamId }: { teamId: string }) {
  const [batch, setBatch] = useState<PendingBatch | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [batchData, leadData, memberData] = await Promise.all([
      loadPendingAssignmentBatch(teamId),
      loadTeamLeads(teamId),
      loadTeamMembers(teamId)
    ]);
    setBatch(batchData);
    setLeads(leadData);
    setMembers(memberData);
  }

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load assignment data'));
  }, [teamId]);

  const assignedIds = new Set(batch?.items.map((item) => item.scannedLeadId));
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const workerMembers = members.filter((member) => !member.isLeader);
  const unassignedLeads = leads.filter((lead) => !lead.assignedToUserId);
  const assignedLeads = leads.filter((lead) => lead.assignedToUserId);

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
            try {
              const created = await createAssignmentBatch(teamId);
              await refresh();
              setError(`Created batch with ${created.scanCount} scans`);
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

      <div className="two-col">
        <div className="card stack">
          <div className="card-top">
            <strong>Pending batch</strong>
            <span>{batch ? `${batch.items.length} scans` : 'None'}</span>
          </div>
          {batch ? (
            <>
              <div className="list compact">
                {batch.items.map((item) => (
                  <div className="mini-row" key={item.scannedLeadId}>
                    <span>{leadById.get(item.scannedLeadId)?.fullName ?? leadById.get(item.scannedLeadId)?.companyName ?? item.scannedLeadId}</span>
                    <button className="ghost-button" disabled={busy} onClick={async () => { await removeBatchItem(batch.batchId, item.scannedLeadId); await refresh(); }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="primary-button"
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const count = await approveBatch(batch.batchId);
                    await refresh();
                    setError(`Approved ${count} assignments`);
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
            <p className="muted">Create a batch to collect unassigned scans.</p>
          )}
        </div>

        <div className="card stack">
          <div className="card-top">
            <strong>Unassigned leads</strong>
            <span>{unassignedLeads.length}</span>
          </div>
          <div className="list compact">
            {unassignedLeads.map((lead) => (
              <div className="mini-row" key={lead.id}>
                <span>{lead.fullName ?? lead.companyName ?? lead.id}</span>
                <button
                  className="ghost-button"
                  disabled={!batch || assignedIds.has(lead.id)}
                  onClick={async () => {
                    if (!batch) return;
                    await addBatchItem(batch.batchId, lead.id);
                    await refresh();
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
          {assignedLeads.length === 0 ? <p className="muted">No assigned cards yet.</p> : null}
          {assignedLeads.map((lead) => (
            <div className="mini-row reassignment-row" key={lead.id}>
              <div>
                <strong>{lead.fullName ?? lead.companyName ?? 'Unnamed lead'}</strong>
                <p className="muted">
                  {lead.companyName ?? 'No company'} · {lead.assignmentState ?? 'assigned'}
                </p>
              </div>
              <select
                aria-label={`Reassign ${lead.fullName ?? lead.id}`}
                value={lead.assignedToUserId ?? ''}
                disabled={busy}
                onChange={async (event) => {
                  setBusy(true);
                  setError(null);
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
