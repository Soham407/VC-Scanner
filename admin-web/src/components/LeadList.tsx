import { Link } from 'react-router-dom';

import { formatDate, initials, stateLabel } from '../lib/format';
import type { Lead } from '../lib/types';
import { StatusPill } from './StatusPill';

export function LeadList({
  emptyText,
  leads,
  loading,
  query,
  setQuery
}: {
  emptyText: string;
  leads: Lead[];
  loading: boolean;
  query: string;
  setQuery: (query: string) => void;
}) {
  const filtered = leads.filter((lead) => {
    const text = `${lead.fullName ?? ''} ${lead.companyName ?? ''} ${lead.email ?? ''} ${lead.phoneNumber ?? ''}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" />
      <div className="list">
        {loading ? <div className="card">Loading leads...</div> : null}
        {!loading && filtered.length === 0 ? <div className="card">{emptyText}</div> : null}
        {filtered.map((lead) => (
          <article className="card lead-row" key={lead.id}>
            <div className="lead-badge">{initials(lead.fullName ?? lead.companyName ?? lead.email)}</div>
            <div className="lead-content">
              <div className="card-top">
                <strong>{lead.fullName ?? 'Unnamed lead'}</strong>
                <StatusPill tone={lead.assignmentState === 'done' ? 'success' : lead.assignmentState === 'needs_review' ? 'warning' : 'neutral'}>
                  {stateLabel(lead.assignmentState)}
                </StatusPill>
              </div>
              <p className="muted">
                {lead.companyName ?? 'No company'} · {lead.email ?? 'No email'} · {formatDate(lead.createdAt)}
              </p>
            </div>
            <Link className="ghost-button" to={`/leads/${lead.id}`}>
              Open
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
