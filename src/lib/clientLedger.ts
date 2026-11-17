import { AccountingEntry, Invoice } from '../types';
import { getInvoiceBalanceDelta } from './invoiceBalance';

const CLIENT_CONTROL_ACCOUNT_CODES = new Set(['10201', '10401', '10402', '20101', '20201']);

const normalizeOpeningReference = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizePartyName = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

export const isClientOpeningEntry = (
  entry: AccountingEntry,
  clientId: string,
  clientName?: string
): boolean => {
  if (!entry.documentNumber?.startsWith('DOC-OPN')) return false;
  if (entry.referenceId) return entry.referenceId === clientId;

  const documentSuffix = entry.documentNumber.slice('DOC-OPN-'.length);
  const normalizedSuffix = normalizeOpeningReference(documentSuffix);
  const normalizedClientId = normalizeOpeningReference(clientId);
  if (normalizedSuffix === normalizedClientId) return true;

  if (entry.documentNumber === `DOC-OPN-${clientId.slice(0, 8).toUpperCase()}`) return true;

  if (entry.clientId) return entry.clientId === clientId;
  if (!clientName || !entry.description?.startsWith('مانده حساب اول دوره')) return false;
  const descriptionSeparator = entry.description.lastIndexOf(' - ');
  if (descriptionSeparator < 0) return false;
  const describedPartyName = entry.description.slice(descriptionSeparator + 3);
  return normalizePartyName(describedPartyName) === normalizePartyName(clientName);
};

export interface ClientLedgerSummary {
  entries: AccountingEntry[];
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export const getClientLedgerSummary = (
  entries: AccountingEntry[],
  clientId: string,
  clientName?: string
): ClientLedgerSummary => {
  const clientEntries = entries.filter(
    entry =>
      CLIENT_CONTROL_ACCOUNT_CODES.has(entry.accountCode) &&
      (
        entry.clientId === clientId ||
        isClientOpeningEntry(entry, clientId, clientName)
      )
  );
  const totalDebit = clientEntries.reduce((total, entry) => total + (Number(entry.debit) || 0), 0);
  const totalCredit = clientEntries.reduce((total, entry) => total + (Number(entry.credit) || 0), 0);

  return {
    entries: clientEntries,
    totalDebit,
    totalCredit,
    balance: totalDebit - totalCredit
  };
};

export const getClientAccountBalance = (
  entries: AccountingEntry[],
  clientId: string,
  fallbackBalance: number,
  clientName?: string
): number => {
  const ledger = getClientLedgerSummary(entries, clientId, clientName);
  return ledger.entries.length > 0 ? ledger.balance : Number(fallbackBalance) || 0;
};

export const getClientBalanceBeforeInvoice = (
  entries: AccountingEntry[],
  invoice: Invoice,
  fallbackBalance: number,
  clientName?: string
): number => {
  const clientLedger = getClientLedgerSummary(entries, invoice.clientId, clientName || invoice.clientName);
  const invoiceDocumentNumber = `DOC-INV-${invoice.invoiceNumber}`;
  const isInvoiceEntry = (entry: AccountingEntry) =>
    entry.referenceId === invoice.id || entry.documentNumber === invoiceDocumentNumber;
  const invoiceEntries = clientLedger.entries.filter(isInvoiceEntry);
  const invoiceTimestamp = Date.parse(invoice.created_at || '');

  if (invoiceEntries.length === 0 || !Number.isFinite(invoiceTimestamp)) {
    return invoiceEntries.length > 0
      ? clientLedger.balance - getInvoiceBalanceDelta(invoice.type, invoice.remainingAmount)
      : (invoice.previousBalance ?? Number(fallbackBalance)) || 0;
  }

  const entriesBeforeInvoice = clientLedger.entries.filter(entry => {
    if (entry.documentNumber?.startsWith('DOC-OPN')) return true;
    if (isInvoiceEntry(entry)) return false;

    const entryTimestamp = Date.parse(entry.created_at || '');
    return Number.isFinite(entryTimestamp) && entryTimestamp < invoiceTimestamp;
  });

  return entriesBeforeInvoice.reduce(
    (balance, entry) => balance + (Number(entry.debit) || 0) - (Number(entry.credit) || 0),
    0
  );
};

export const getClientEntryDocumentLabel = (
  entry: AccountingEntry,
  invoices: Invoice[]
): string => {
  if (entry.documentNumber?.startsWith('DOC-OPN')) return 'سند افتتاحیه';
  if (entry.documentNumber?.startsWith('DOC-INV')) {
    const invoice = invoices.find(candidate =>
      candidate.id === entry.referenceId ||
      entry.documentNumber === `DOC-INV-${candidate.invoiceNumber}`
    );
    switch (invoice?.type) {
      case 'sale':
        return 'فاکتور فروش';
      case 'service':
        return 'فاکتور خدمات';
      case 'purchase':
        return 'فاکتور خرید';
      case 'sale_return':
        return 'برگشت از فروش';
      case 'purchase_return':
        return 'برگشت از خرید';
      default:
        return 'سند فاکتور';
    }
  }
  if (entry.documentNumber?.startsWith('DOC-TX')) return 'دریافت / پرداخت';
  if (entry.documentNumber?.startsWith('DOC-CHK')) return 'سند چک';
  return 'سند حسابداری';
};
