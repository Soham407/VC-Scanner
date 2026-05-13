import { useEffect, useState } from 'react';

import { LeadList } from '../components/LeadList';
import { loadPersonalLeads } from '../lib/api';
import type { Lead } from '../lib/types';

export function MyLeadsPage({ userId }: { userId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadPersonalLeads(userId)
      .then((rows) => {
        if (!active) return;
        setLeads(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load personal leads');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Personal use</div>
          <h2>My leads</h2>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      <LeadList emptyText="No personal leads found for this account yet." leads={leads} loading={loading} query={query} setQuery={setQuery} />
    </section>
  );
}
