export const getCurrentDocumentTimestamp = (): string => new Date().toISOString();

export const formatDocumentTime = (timestamp?: string): string => {
  if (!timestamp) return '—';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(date);
};
