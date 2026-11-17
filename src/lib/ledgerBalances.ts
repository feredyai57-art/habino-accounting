import { AccountingEntry } from '../types';

export type EntryWithRunningBalance = AccountingEntry & {
  runningBalance: number;
  balanceType: 'بد' | 'بس' | '—';
};

export const getEntriesWithRunningBalance = (
  entries: AccountingEntry[]
): EntryWithRunningBalance[] => {
  const sorted = [...entries].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0 || !a.created_at || !b.created_at) return dateOrder;
    return a.created_at.localeCompare(b.created_at);
  });
  const balances = new Map<string, number>();

  return sorted.map(entry => {
    const balance = (balances.get(entry.accountCode) || 0) + entry.debit - entry.credit;
    balances.set(entry.accountCode, balance);

    return {
      ...entry,
      runningBalance: Math.abs(balance),
      balanceType: balance > 0 ? 'بد' : balance < 0 ? 'بس' : '—'
    };
  });
};
