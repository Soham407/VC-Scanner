import { useEffect, useState } from 'react';

import { LeadList } from '../components/LeadList';
import { loadPersonalLeads } from '../lib/api';
import type { Lead } from '../lib/types';

export function MyLeadsPage({ userId }: { userId: string }) {
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
    setError(null);
    setPage(0);
    loadPersonalLeads(userId, 0)
      .then((result) => {
        if (!active) return;
        setLeads(result.leads);
        setHasMore(result.hasMore);
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

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    loadPersonalLeads(userId, nextPage)
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
          <div className="eyebrow">Personal use</div>
          <h2>My leads</h2>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      <LeadList emptyText="No personal leads found for this account yet." leads={leads} loading={loading} query={query} setQuery={setQuery} />
      {hasMore && !loading ? (
        <button className="ghost-button" disabled={loadingMore} onClick={handleLoadMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
