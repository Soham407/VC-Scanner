import type { ReactNode } from 'react';

export function EmptyState({
  action,
  children,
  title
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p className="muted">{children}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
