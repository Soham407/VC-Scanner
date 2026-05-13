import { useEffect, useState } from 'react';

import { createTeamInvite, listPendingTeamInvitesForTeam } from '../lib/api';
import { formatDate } from '../lib/format';
import type { TeamInvite } from '../lib/types';

export function InvitesPage({ teamId }: { teamId: string }) {
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setInvites(await listPendingTeamInvitesForTeam(teamId));
  }

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invites'));
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
        <button className="primary-button" disabled={busy || !email.trim()}>Invite</button>
      </form>

      <div className="card stack">
        {invites.length === 0 ? <p className="muted">No pending invitations.</p> : null}
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
