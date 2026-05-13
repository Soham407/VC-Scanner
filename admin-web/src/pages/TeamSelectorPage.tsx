import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { createTeam, loadAccessibleTeams } from '../lib/api';
import { formatDate } from '../lib/format';
import type { AccessibleTeam } from '../lib/types';
import { EmptyState } from '../components/EmptyState';

export function TeamSelectorPage({
  activeTeamId,
  onTeamSelected
}: {
  activeTeamId: string | null;
  onTeamSelected: (teamId: string) => Promise<void>;
}) {
  const [teams, setTeams] = useState<AccessibleTeam[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setTeams(await loadAccessibleTeams());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const currentTeam = activeTeamId ? teams.find((team) => team.id === activeTeamId) ?? null : null;

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Workspace</div>
          <h2>{currentTeam ? 'Company team' : 'Create your first team'}</h2>
        </div>
        {!loading && !currentTeam ? (
          <form
            className="inline-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const team = await createTeam(name);
                setName('');
                await onTeamSelected(team.id);
                navigate('/inbox');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create team');
              } finally {
                setBusy(false);
              }
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New team name" />
            <button className="primary-button" disabled={busy || !name.trim()}>
              <Plus size={16} />
              {busy ? 'Creating...' : 'Create'}
            </button>
          </form>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {loading ? <div className="card loading-card">Loading team...</div> : null}

      {!loading && currentTeam ? (
        <div className="card stack">
          <div className="card-top">
            <strong>{currentTeam.name}</strong>
            <span>Company team</span>
          </div>
          <p className="muted">Created {formatDate(currentTeam.createdAt)}</p>
          <EmptyState title="Team settings">
            Each user belongs to one company team. Create a new team only for a brand-new company account.
          </EmptyState>
        </div>
      ) : null}

      {!loading && !currentTeam ? (
        <div className="card">
          <EmptyState title="No team yet">
            Create your first team to enable shared scanning, member invites, and assignment review.
          </EmptyState>
        </div>
      ) : null}
    </section>
  );
}
