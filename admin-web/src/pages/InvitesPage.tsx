import { useEffect, useState } from 'react';

import { createTeamInvite, listPendingTeamInvitesForTeam } from '../lib/api';
import { formatDate } from '../lib/format';
import type { TeamInvite } from '../lib/types';
import { EmptyState } from '../components/EmptyState';

export function InvitesPage({ teamId }: { teamId: string }) {
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setInvites(await listPendingTeamInvitesForTeam(teamId));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listPendingTeamInvitesForTeam(teamId)
      .then((rows) => {
        if (active) setInvites(rows);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load invites');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teamId]);

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Invites</div>
          <h2>Pending invitations</h2>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <form
        className="inline-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await createTeamInvite(teamId, email);
            setEmail('');
            await refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create invite');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="teammate@company.com" />
        <button className="primary-button" disabled={busy || !email.trim()}>{busy ? 'Sending...' : 'Invite'}</button>
      </form>

      <div className="card stack">
        {loading ? <div className="loading-card">Loading invitations...</div> : null}
        {!loading && invites.length === 0 ? (
          <EmptyState title="No pending invitations">Invite workers who should receive and complete assigned card follow-ups.</EmptyState>
        ) : null}
        {invites.map((invite) => (
          <div className="mini-row" key={invite.id}>
            <strong>{invite.invitedEmail}</strong>
            <span>{formatDate(invite.createdAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
