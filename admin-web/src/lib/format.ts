export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function initials(name: string | null | undefined): string {
  const source = name?.trim() || 'Lead';
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function stateLabel(state: string | null | undefined): string {
  if (!state) return 'Unassigned';
  return state.replace(/_/g, ' ');
}
