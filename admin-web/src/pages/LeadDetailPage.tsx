import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getLeadImageUrl, loadLead, loadTeamMembers, reassignLead, updateAssignmentState, updateLeadDetails } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Lead, TeamMember } from '../lib/types';
import { EmptyState } from '../components/EmptyState';

export function LeadDetailPage({
  canManageTeam,
  teamId,
  userId
}: {
  canManageTeam: boolean;
  teamId: string | null;
  userId: string;
}) {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string | null>(null);
  const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) return;
    setLead(null);
    setPrimaryImageUrl(null);
    setSecondaryImageUrl(null);
    setError(null);
    loadLead(leadId, teamId)
      .then(setLead)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load lead'));
    if (teamId && canManageTeam) {
      loadTeamMembers(teamId)
        .then(setMembers)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load team members'));
    } else {
      setMembers([]);
    }
  }, [canManageTeam, leadId, teamId]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getLeadImageUrl(lead?.imagePath ?? null),
      getLeadImageUrl(lead?.secondaryImagePath ?? null)
    ]).then(([primary, secondary]) => {
      if (!active) return;
      setPrimaryImageUrl(primary);
      setSecondaryImageUrl(secondary);
    });
    return () => {
      active = false;
    };
  }, [lead?.imagePath, lead?.secondaryImagePath]);

  if (!lead) {
    return <section className="page-stack">{error ? <p className="error-text">{error}</p> : <div className="card">Loading lead...</div>}</section>;
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Lead detail</div>
          <h2>{lead.companyName ?? lead.fullName ?? 'Unnamed company'}</h2>
          <p className="muted">{lead.fullName ?? 'No contact name'}</p>
        </div>
        <button className="ghost-button" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      <div className="two-col">
        <form
          className="card stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError(null);
            setNotice(null);
            try {
              await updateLeadDetails(lead.id, lead);
              const refreshed = await loadLead(lead.id, teamId);
              setLead(refreshed);
              setNotice('Lead details saved.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to save lead');
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="field"><span>Full name</span><input value={lead.fullName ?? ''} onChange={(e) => setLead({ ...lead, fullName: e.target.value })} /></label>
          <label className="field"><span>Job title</span><input value={lead.jobTitle ?? ''} onChange={(e) => setLead({ ...lead, jobTitle: e.target.value })} /></label>
          <label className="field"><span>Company</span><input value={lead.companyName ?? ''} onChange={(e) => setLead({ ...lead, companyName: e.target.value })} /></label>
          <label className="field"><span>Email</span><input value={lead.email ?? ''} onChange={(e) => setLead({ ...lead, email: e.target.value })} /></label>
          <label className="field"><span>Phone</span><input value={lead.phoneNumber ?? ''} onChange={(e) => setLead({ ...lead, phoneNumber: e.target.value })} /></label>
          <label className="field"><span>Address</span><textarea value={lead.address ?? ''} onChange={(e) => setLead({ ...lead, address: e.target.value })} /></label>
          <label className="field"><span>Product / services</span><textarea value={lead.productServices ?? ''} onChange={(e) => setLead({ ...lead, productServices: e.target.value })} /></label>
          <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save lead'}</button>
          {notice ? <p className="success-text">{notice}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </form>

        <div className="stack">
          {lead.teamId ? (
            <div className="card stack">
              <div className="eyebrow">Assignment</div>
              <p className="muted">
                Assigned to: {members.find((member) => member.userId === lead.assignedToUserId)?.email ?? (lead.assignedToUserId ? 'Unknown Worker' : 'Unassigned')}
              </p>
              <p className="muted">State: {lead.assignmentState ?? 'unassigned'}</p>

              {lead.assignedToUserId === userId ? (
                <label className="field">
                  <span>My status</span>
                  <select
                    value={lead.assignmentState ?? 'assigned'}
                    onChange={async (event) => {
                      const nextState = event.target.value as Lead['assignmentState'];
                      if (!nextState) return;
                      setSaving(true);
                      setError(null);
                      setNotice(null);
                      try {
                        await updateAssignmentState(lead.id, nextState);
                        setLead(await loadLead(lead.id, teamId));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to update status');
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving}
                  >
                    <option value="assigned">Assigned</option>
                    <option value="needs_review">Needs review</option>
                    <option value="done">Done</option>
                  </select>
                </label>
              ) : null}

              {canManageTeam ? (
                <>
                  <label className="field">
                    <span>Reassign to worker</span>
                    <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                      <option value="">{members.some((member) => !member.isLeader) ? 'Select a worker' : 'No workers available'}</option>
                      {members
                        .filter((member) => !member.isLeader)
                        .map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="primary-button"
                    disabled={!reassignTo || saving || reassignTo === lead.assignedToUserId}
                    onClick={async () => {
                      setSaving(true);
                      setError(null);
                      setNotice(null);
                      try {
                        await reassignLead(lead.id, reassignTo);
                        const refreshed = await loadLead(lead.id, teamId);
                        setLead(refreshed);
                        setReassignTo('');
                        setNotice('Assignment updated.');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to reassign lead');
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Reassign
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="card">
            <div className="eyebrow">Metadata</div>
            {primaryImageUrl || secondaryImageUrl ? (
              <div className="card-image-stack">
                {primaryImageUrl ? (
                  <figure className="card-image-figure">
                    <img className="lead-image" src={primaryImageUrl} alt="Scanned business card front" />
                    <figcaption className="muted">Front side</figcaption>
                  </figure>
                ) : null}
                {secondaryImageUrl ? (
                  <figure className="card-image-figure">
                    <img className="lead-image" src={secondaryImageUrl} alt="Scanned business card back" />
                    <figcaption className="muted">Back side</figcaption>
                  </figure>
                ) : null}
              </div>
            ) : (
              <EmptyState title="No card image">This lead has no available card image or the image link could not be opened.</EmptyState>
            )}
            <p className="muted">Captured: {formatDate(lead.createdAt)}</p>
            <p className="muted">Saved to: {lead.teamId ? 'Company team' : 'Personal scans'}</p>
            <details className="raw-text">
              <summary>Raw OCR</summary>
              <pre>{lead.rawText ?? 'Empty'}</pre>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
