import { useEffect, useState } from 'react';

import { loadTeamMembers, promoteTeamMemberToLeader } from '../lib/api';
import type { TeamMember } from '../lib/types';

export function MembersPage({ teamId }: { teamId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    loadTeamMembers(teamId)
      .then(setMembers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load members'));
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
        {members.length === 0 ? <p className="muted">No members found.</p> : null}
        {members.map((member) => (
          <div className="mini-row" key={member.userId}>
            <div>
              <strong>{member.email}</strong>
              <p className="muted">{member.isLeader ? 'Leader' : 'Worker'} · {member.userId}</p>
            </div>
            <button
              className="ghost-button"
              disabled={member.isLeader || busyUserId === member.userId}
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
              Promote
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
