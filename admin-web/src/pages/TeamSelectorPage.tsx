import { useEffect, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { createTeam, loadAccessibleTeams, setActiveTeamId } from '../lib/api';
import { formatDate } from '../lib/format';
import type { AccessibleTeam } from '../lib/types';

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

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Workspace</div>
          <h2>Select a team</h2>
        </div>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const team = await createTeam(name);
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
          <button className="primary-button" disabled={busy}>
            <Plus size={16} />
            Create
          </button>
        </form>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="grid-cards">
        {loading ? <div className="card">Loading teams...</div> : null}
        {!loading && teams.length === 0 ? <div className="card">No teams available yet.</div> : null}
        {teams.map((team) => (
          <button
            key={team.id}
            className="card card-button"
            onClick={async () => {
              await setActiveTeamId(team.id);
              await onTeamSelected(team.id);
              navigate('/inbox');
            }}
          >
            <div className="card-top">
              <strong>{team.name}</strong>
              {team.id === activeTeamId ? <Check size={16} /> : null}
            </div>
            <p className="muted">Created {formatDate(team.createdAt)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
