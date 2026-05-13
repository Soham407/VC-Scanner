export function StatusPill({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'danger'; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
