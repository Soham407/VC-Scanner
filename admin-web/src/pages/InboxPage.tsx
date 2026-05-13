import { useEffect, useState } from 'react';

import { loadTeamLeads } from '../lib/api';
import type { Lead } from '../lib/types';
import { LeadList } from '../components/LeadList';

export function InboxPage({ teamId }: { teamId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadTeamLeads(teamId)
      .then((rows) => {
        if (!active) return;
        setLeads(rows);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load inbox');
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
          <div className="eyebrow">Team inbox</div>
          <h2>Leads waiting for review</h2>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      <LeadList emptyText="No leads match this team yet." leads={leads} loading={loading} query={query} setQuery={setQuery} />
    </section>
  );
}
