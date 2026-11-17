import type { OutboxItem } from './offlineOutboxQueue';

const OUTBOX_SYNC_PRIORITY: Record<OutboxItem['type'], number> = {
  client: 10,
  equityProfile: 11,
  equityOwnership: 12,
  equityEvent: 13,
  fixedAsset: 14,
  bankAccount: 20,
  invoice: 30,
  installment: 40,
  check: 50,
  transaction: 60,
  entries: 70,
  signature: 80
};

export function orderOutboxItemsForSync<T extends Pick<OutboxItem, 'type' | 'createdAt'>>(items: T[]): T[] {
  return [...items].sort((left, right) =>
    OUTBOX_SYNC_PRIORITY[left.type] - OUTBOX_SYNC_PRIORITY[right.type] ||
    left.createdAt - right.createdAt
  );
}
