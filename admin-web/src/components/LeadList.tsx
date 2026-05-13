import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

import { formatDate, initials, stateLabel } from '../lib/format';
import type { Lead } from '../lib/types';
import { EmptyState } from './EmptyState';
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
  const trimmedQuery = query.trim().toLowerCase();
  const filtered = leads.filter((lead) => {
    const text = `${lead.fullName ?? ''} ${lead.companyName ?? ''} ${lead.email ?? ''} ${lead.phoneNumber ?? ''}`.toLowerCase();
    return text.includes(trimmedQuery);
  });
  const needsReview = leads.filter((lead) => lead.assignmentState === 'needs_review').length;
  const done = leads.filter((lead) => lead.assignmentState === 'done').length;
  const unassigned = leads.filter((lead) => !lead.assignmentState).length;

  return (
    <>
      <div className="metric-grid">
        <div className="metric-card">
          <span>Total</span>
          <strong>{leads.length}</strong>
        </div>
        <div className="metric-card">
          <span>Needs review</span>
          <strong>{needsReview}</strong>
        </div>
        <div className="metric-card">
          <span>Done</span>
          <strong>{done}</strong>
        </div>
        <div className="metric-card">
          <span>Unassigned</span>
          <strong>{unassigned}</strong>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" />
        </div>
        <span className="result-count">{filtered.length} shown</span>
      </div>

      <div className="list">
        {loading ? <div className="card loading-card">Loading leads...</div> : null}
        {!loading && filtered.length === 0 ? (
          <div className="card">
            <EmptyState title={trimmedQuery ? 'No matching leads' : 'No leads yet'}>
              {trimmedQuery ? 'Clear the search or try a name, company, email, or phone number.' : emptyText}
            </EmptyState>
          </div>
        ) : null}
        {filtered.map((lead) => (
          <article className="card lead-row" key={lead.id}>
            <div className="lead-badge">{initials(lead.companyName ?? lead.fullName ?? lead.email)}</div>
            <div className="lead-content">
              <div className="card-top">
                <strong>{lead.companyName ?? lead.fullName ?? 'Unnamed company'}</strong>
                <StatusPill tone={lead.assignmentState === 'done' ? 'success' : lead.assignmentState === 'needs_review' ? 'warning' : 'neutral'}>
                  {stateLabel(lead.assignmentState)}
                </StatusPill>
              </div>
              <p className="muted">
                {lead.fullName ?? 'No contact'} <span aria-hidden="true">·</span> {lead.email ?? 'No email'} <span aria-hidden="true">·</span> {formatDate(lead.createdAt)}
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
