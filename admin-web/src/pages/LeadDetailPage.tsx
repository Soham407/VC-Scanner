import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getLeadImageUrl, loadLead, loadTeamMembers, reassignLead, updateAssignmentState, updateLeadDetails } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Lead, TeamMember } from '../lib/types';

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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reassignTo, setReassignTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) return;
    setLead(null);
    setImageUrl(null);
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
    void getLeadImageUrl(lead?.imagePath ?? null).then((url) => {
      if (active) setImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [lead?.imagePath]);

  if (!lead) {
    return <section className="page-stack">{error ? <p className="error-text">{error}</p> : <div className="card">Loading lead...</div>}</section>;
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Lead detail</div>
          <h2>{lead.fullName ?? 'Unnamed lead'}</h2>
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
            try {
              await updateLeadDetails(lead.id, lead);
              const refreshed = await loadLead(lead.id, teamId);
              setLead(refreshed);
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
          <label className="field"><span>Address</span><input value={lead.address ?? ''} onChange={(e) => setLead({ ...lead, address: e.target.value })} /></label>
          <label className="field"><span>Product / services</span><textarea value={lead.productServices ?? ''} onChange={(e) => setLead({ ...lead, productServices: e.target.value })} /></label>
          <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save lead'}</button>
        </form>

        <div className="stack">
          {lead.teamId ? (
            <div className="card stack">
              <div className="eyebrow">Assignment</div>
              <p className="muted">
                Assigned to: {members.find((member) => member.userId === lead.assignedToUserId)?.email ?? lead.assignedToUserId ?? 'Unassigned'}
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
                      <option value="">Select a worker</option>
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
                      try {
                        await reassignLead(lead.id, reassignTo);
                        const refreshed = await loadLead(lead.id, teamId);
                        setLead(refreshed);
                        setReassignTo('');
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
            {imageUrl ? <img className="lead-image" src={imageUrl} alt="Scanned business card" /> : null}
            <p className="muted">Captured: {formatDate(lead.createdAt)}</p>
            <p className="muted">Capture team: {lead.teamId ?? 'Personal'}</p>
            <p className="muted">Image: {lead.imagePath ?? 'No image path'}</p>
            <details className="raw-text">
              <summary>Raw OCR</summary>
              <pre>{lead.rawText ?? 'Empty'}</pre>
            </details>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
