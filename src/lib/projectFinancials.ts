import { AccountingEntry } from '../types';
import { fromPostgresDate } from './dateUtils';

export interface ProjectFinancialSummary {
  income: number;
  directCosts: number;
  operatingExpenses: number;
  ledgerLineCount: number;
}

export function getProjectMonthKey(date?: string | null): string | undefined {
  const jalaliDate = fromPostgresDate(date);
  const match = jalaliDate.match(/^(\d{4})[/-](\d{1,2})/);
  if (!match) return undefined;

  const month = Number(match[2]);
  return month >= 1 && month <= 12
    ? `${match[1]}/${String(month).padStart(2, '0')}`
    : undefined;
}

export function getProjectFinancialEntries(
  projectId: string,
  entries: AccountingEntry[],
  monthKey?: string | null
): AccountingEntry[] {
  return entries.filter(entry => {
    if (entry.projectTag !== projectId) return false;
    if (monthKey && getProjectMonthKey(entry.date) !== monthKey) return false;
    return entry.accountCode.startsWith('4') ||
      entry.accountCode.startsWith('5') ||
      entry.accountCode.startsWith('6');
  });
}

export function getProjectFinancialSummary(
  projectId: string,
  entries: AccountingEntry[],
  monthKey?: string | null
): ProjectFinancialSummary {
  return getProjectFinancialEntries(projectId, entries, monthKey)
    .reduce<ProjectFinancialSummary>((summary, entry) => {
    const debit = Number(entry.debit) || 0;
    const credit = Number(entry.credit) || 0;
    if (entry.accountCode.startsWith('4')) {
      summary.income += credit - debit;
      summary.ledgerLineCount += 1;
    } else if (entry.accountCode.startsWith('5')) {
      summary.directCosts += debit - credit;
      summary.ledgerLineCount += 1;
    } else if (entry.accountCode.startsWith('6')) {
      summary.operatingExpenses += debit - credit;
      summary.ledgerLineCount += 1;
    }
    return summary;
  }, { income: 0, directCosts: 0, operatingExpenses: 0, ledgerLineCount: 0 });
}
