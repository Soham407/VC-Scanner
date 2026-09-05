import { useEffect, useState } from 'react';

import { loadTeamLeads } from '../lib/api';
import type { Lead } from '../lib/types';
import { LeadList } from '../components/LeadList';

export function InboxPage({ teamId }: { teamId: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(0);
    loadTeamLeads(teamId, 0)
      .then((result) => {
        if (!active) return;
        setLeads(result.leads);
        setHasMore(result.hasMore);
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

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    loadTeamLeads(teamId, nextPage)
      .then((result) => {
        setLeads((prev) => [...prev, ...result.leads]);
        setHasMore(result.hasMore);
        setPage(nextPage);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load more leads');
      })
      .finally(() => {
        setLoadingMore(false);
      });
  };

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
      {hasMore && !loading ? (
        <button className="ghost-button" disabled={loadingMore} onClick={handleLoadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
