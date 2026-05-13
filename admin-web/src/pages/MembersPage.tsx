import { useEffect, useState } from 'react';

import { loadTeamMembers, promoteTeamMemberToLeader } from '../lib/api';
import type { TeamMember } from '../lib/types';
import { EmptyState } from '../components/EmptyState';

export function MembersPage({ teamId }: { teamId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoading(true);
    loadTeamMembers(teamId)
      .then((rows) => {
        if (active) setMembers(rows);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load members');
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
          <div className="eyebrow">Members</div>
          <h2>Team members and roles</h2>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="card stack">
        {loading ? <div className="loading-card">Loading members...</div> : null}
        {!loading && members.length === 0 ? (
          <EmptyState title="No members found">Invite workers from the Invites page. Accepted invitations appear here.</EmptyState>
        ) : null}
        {members.map((member) => (
          <div className="mini-row" key={member.userId}>
            <div>
              <strong>{member.email}</strong>
              <p className="muted">{member.isLeader ? 'Team leader' : 'Worker'}</p>
            </div>
            <button
              className="ghost-button"
              disabled={member.isLeader || Boolean(busyUserId)}
              onClick={async () => {
                setBusyUserId(member.userId);
                setError(null);
                try {
                  await promoteTeamMemberToLeader(teamId, member.userId);
                  setMembers(await loadTeamMembers(teamId));
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to promote member');
                } finally {
                  setBusyUserId(null);
                }
              }}
            >
              {busyUserId === member.userId ? 'Promoting...' : member.isLeader ? 'Leader' : 'Promote'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
