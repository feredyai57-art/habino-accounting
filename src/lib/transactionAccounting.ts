import { Transaction, TransactionPurpose } from '../types';

const PURPOSE_GROUPS: Partial<Record<TransactionPurpose, string[]>> = {
  revenue: ['6'],
  customer_advance: ['3'],
  loan_proceeds: ['3', '4'],
  owner_contribution: ['5'],
  expense: ['7', '8'],
  supplier_advance: ['1'],
  loan_repayment: ['3', '4'],
  owner_withdrawal: ['5']
};

export function getTransactionPurposeGroups(purpose: TransactionPurpose): string[] {
  if (purpose === 'receivable_collection') return ['1'];
  if (purpose === 'payable_settlement') return ['3'];
  return PURPOSE_GROUPS[purpose] || [];
}

export function isTransactionCounterAccountAllowed(
  purpose: TransactionPurpose,
  accountCode: string,
  groupCode: string
): boolean {
  if (purpose === 'receivable_collection') return accountCode === '10201';
  if (purpose === 'payable_settlement') return accountCode === '20101';
  if (purpose === 'customer_advance') return accountCode === '20201';
  if (purpose === 'supplier_advance') return ['10401', '10402'].includes(accountCode);
  if (purpose === 'owner_contribution') return ['30101', '30102'].includes(accountCode);
  if (purpose === 'owner_withdrawal') return accountCode === '30102';
  return getTransactionPurposeGroups(purpose).includes(groupCode);
}

export function getTransactionPurpose(tx: Transaction): TransactionPurpose {
  if (tx.purpose) return tx.purpose;
  return tx.type === 'expense' ? 'expense' : tx.type === 'transfer' ? 'transfer' : 'revenue';
}

export function affectsProfitAndLoss(tx: Transaction): boolean {
  const purpose = getTransactionPurpose(tx);
  return purpose === 'revenue' || purpose === 'expense';
}

export function getTransactionAccountCode(tx: Transaction): string | undefined {
  const purpose = getTransactionPurpose(tx);
  if (purpose === 'receivable_collection') return '10201';
  if (purpose === 'payable_settlement') return '20101';
  return tx.counterAccountCode || tx.expenseAccountCode ||
    (purpose === 'revenue' ? '40102' : purpose === 'expense' ? '60102' : undefined);
}

export function getTransactionPartyBalanceDelta(tx: Transaction): number {
  if (!tx.purpose) {
    if (tx.type === 'income') return -tx.amount;
    if (tx.type === 'expense') return tx.amount;
  }
  switch (getTransactionPurpose(tx)) {
    case 'receivable_collection':
      return -tx.amount;
    case 'customer_advance':
      return -tx.amount;
    case 'payable_settlement':
    case 'supplier_advance':
      return tx.amount;
    default:
      return 0;
  }
}
