import { useEffect, useState } from 'react';

import { LeadList } from '../components/LeadList';
import { loadAssignedLeads } from '../lib/api';
import type { Lead } from '../lib/types';

export function AssignedPage({ teamId, userId }: { teamId: string; userId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadAssignedLeads(teamId, userId)
      .then((rows) => {
        if (!active) return;
        setLeads(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load assigned work');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Worker assignments</div>
          <h2>Assigned cards</h2>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      <LeadList emptyText="No assigned cards for this team yet." leads={leads} loading={loading} query={query} setQuery={setQuery} />
    </section>
  );
}
