import { AccountingEntry, Client, Invoice, InventoryItem } from '../types';
import { cleanDateStr, toPostgresDate } from './dateUtils';

interface TenantScopedRow {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  createdAt?: string | null;
  created_at?: string | null;
  date?: string | null;
}

const getRowTenantId = (row: { tenantId?: string; tenant_id?: string }): string =>
  row.tenantId || row.tenant_id || 'tenant-main';

export const getTenantResetAt = (tenantId: string): string | null => {
  if (typeof window === 'undefined' || tenantId === 'all') return null;
  return (
    localStorage.getItem(`habino_factory_reset_${tenantId}`) ||
    localStorage.getItem(`habino_pnl_purged_at_${tenantId}`) ||
    localStorage.getItem(`habino_last_known_reset_version_${tenantId}`) ||
    (tenantId === 'tenant-main' ? localStorage.getItem('habino_factory_reset_completed') : null)
  );
};

export const isNewerThanTenantReset = (row: TenantScopedRow, tenantId: string): boolean => {
  const resetAt = getTenantResetAt(tenantId);
  return !resetAt || hasFinancialRecordsNotSafelyOlderThan([row], resetAt);
};

export const resolveInvoiceTenantId = (params: {
  isSuperAdmin: boolean;
  activeTenantId?: string;
  userTenantId?: string;
  clientTenantId?: string;
  invoiceTenantId?: string;
}): string => {
  const {
    isSuperAdmin,
    activeTenantId,
    userTenantId,
    clientTenantId,
    invoiceTenantId
  } = params;

  if (!isSuperAdmin) {
    return [userTenantId, activeTenantId]
      .find(tenantId => Boolean(tenantId && tenantId !== 'all')) || 'tenant-main';
  }
  if (activeTenantId && activeTenantId !== 'all') return activeTenantId;

  return [clientTenantId, invoiceTenantId, userTenantId]
    .find(tenantId => Boolean(tenantId && tenantId !== 'all')) || 'tenant-main';
};

export const getInvoiceAccountingEntries = (
  entries: AccountingEntry[],
  invoice: Invoice,
  tenantId?: string
): AccountingEntry[] => {
  const invoiceDocumentNumber = `DOC-INV-${invoice.invoiceNumber}`;
  const invoiceTenantId = tenantId || invoice.tenantId;

  return entries.filter(entry => {
    const isInvoiceEntry =
      entry.referenceId === invoice.id ||
      entry.documentNumber === invoiceDocumentNumber;
    const isSameTenant =
      !invoiceTenantId ||
      !entry.tenantId ||
      entry.tenantId === invoiceTenantId;
    return isInvoiceEntry && isSameTenant;
  });
};

export const mergeCloudInvoicesWithLocal = (
  localInvoices: Invoice[],
  remoteInvoices: Invoice[],
  tenantId: string,
  signatures: Record<string, Partial<Invoice>> = {}
): Invoice[] => {
  if (remoteInvoices.length === 0 && !getTenantResetAt(tenantId)) {
    return localInvoices;
  }
  const localForTenant = localInvoices.filter(invoice =>
    (tenantId === 'all' || getRowTenantId(invoice) === tenantId) &&
    isNewerThanTenantReset(invoice, tenantId)
  );
  const otherTenantInvoices = tenantId === 'all'
    ? []
    : localInvoices.filter(invoice => getRowTenantId(invoice) !== tenantId);
  const localById = new Map(localForTenant.map(invoice => [invoice.id, invoice]));
  const remoteForTenant = remoteInvoices.filter(invoice =>
    tenantId === 'all' || getRowTenantId(invoice) === tenantId
  );
  const remoteIds = new Set(remoteForTenant.map(invoice => invoice.id));

  const mergedRemoteInvoices = remoteForTenant.map(remoteInvoice => {
    const localInvoice = localById.get(remoteInvoice.id);
    const signature = signatures[remoteInvoice.id] ||
      (remoteInvoice.shareToken ? signatures[remoteInvoice.shareToken] : undefined);
    const signatureUrl = remoteInvoice.signatureUrl ||
      signature?.signatureUrl ||
      localInvoice?.signatureUrl;

    return {
      ...remoteInvoice,
      signatureUrl,
      isSigned: remoteInvoice.isSigned || signature?.isSigned || localInvoice?.isSigned || Boolean(signatureUrl),
      signedAt: remoteInvoice.signedAt || signature?.signedAt || localInvoice?.signedAt,
      shareToken: remoteInvoice.shareToken || signature?.shareToken || localInvoice?.shareToken,
      signatureMetadata: remoteInvoice.signatureMetadata ||
        signature?.signatureMetadata ||
        localInvoice?.signatureMetadata
    };
  });

  const unsyncedLocalInvoices = localForTenant
    .filter(invoice => !remoteIds.has(invoice.id));

  return [...otherTenantInvoices, ...mergedRemoteInvoices, ...unsyncedLocalInvoices];
};

export const mergeCloudAccountingEntriesWithLocal = (
  localEntries: AccountingEntry[],
  remoteEntries?: AccountingEntry[],
  tenantId: string = 'tenant-main'
): AccountingEntry[] => {
  if (remoteEntries === undefined) {
    return localEntries;
  }
  if (remoteEntries.length === 0 && !getTenantResetAt(tenantId)) {
    return localEntries;
  }
  const localForTenant = localEntries.filter(entry =>
    (tenantId === 'all' || getRowTenantId(entry) === tenantId) &&
    isNewerThanTenantReset(entry, tenantId)
  );
  const otherTenantEntries = tenantId === 'all'
    ? []
    : localEntries.filter(entry => getRowTenantId(entry) !== tenantId);
  const entriesById = new Map(localForTenant.map(entry => [entry.id, entry]));
  remoteEntries
    .filter(entry => tenantId === 'all' || getRowTenantId(entry) === tenantId)
    .forEach(entry => entriesById.set(entry.id, entry));
  return [...otherTenantEntries, ...entriesById.values()];
};

export const mergeCloudRowsWithLocal = <T extends TenantScopedRow>(
  localRows: T[],
  remoteRows?: T[],
  tenantId: string = 'tenant-main'
): T[] => {
  if (remoteRows === undefined) {
    return localRows;
  }
  if (remoteRows.length === 0 && !getTenantResetAt(tenantId)) {
    return localRows;
  }
  const rows = localRows as TenantScopedRow[];
  const remoteTenantRows = (remoteRows as TenantScopedRow[]).filter(row =>
    tenantId === 'all' || getRowTenantId(row) === tenantId
  );
  const localForTenant = rows.filter(row =>
    (tenantId === 'all' || getRowTenantId(row) === tenantId) &&
    isNewerThanTenantReset(row, tenantId)
  );
  const otherTenantRows = tenantId === 'all'
    ? []
    : rows.filter(row => getRowTenantId(row) !== tenantId);
  const remoteIds = new Set(remoteTenantRows.map(row => row.id));
  const mergedTenantRows = [
    ...remoteTenantRows,
    ...localForTenant.filter(row => !remoteIds.has(row.id))
  ];
  return [...otherTenantRows, ...mergedTenantRows] as T[];
};

export const mergeCloudClientsWithLocal = (
  localRows: Client[],
  remoteRows?: Client[],
  tenantId: string = 'tenant-main'
): Client[] => {
  const mergedRows = mergeCloudRowsWithLocal(localRows, remoteRows, tenantId);
  if (!remoteRows) return mergedRows;

  const localById = new Map(
    localRows
      .filter(row => tenantId === 'all' || getRowTenantId(row) === tenantId)
      .map(row => [row.id, row])
  );
  const remoteIds = new Set(
    remoteRows
      .filter(row => tenantId === 'all' || getRowTenantId(row) === tenantId)
      .map(row => row.id)
  );

  return mergedRows.map(client => {
    if (!remoteIds.has(client.id)) return client;
    const localClient = localById.get(client.id);
    if (!localClient || getRowTenantId(localClient) !== getRowTenantId(client)) return client;

    const preserveLocalCreditLimit =
      Number(localClient.creditLimit) > 0 && !(Number(client.creditLimit) > 0);
    const preserveLocalCreditBlock =
      localClient.isBlockedForCredit === true && client.isBlockedForCredit !== true;
    if (!preserveLocalCreditLimit && !preserveLocalCreditBlock) return client;

    return {
      ...client,
      ...(preserveLocalCreditLimit ? { creditLimit: localClient.creditLimit } : {}),
      ...(preserveLocalCreditBlock ? { isBlockedForCredit: true } : {}),
      metadata: {
        ...(client.metadata || {}),
        ...(localClient.metadata || {}),
        ...(preserveLocalCreditLimit ? { habino_credit_limit: localClient.creditLimit } : {}),
        ...(preserveLocalCreditBlock ? { habino_is_blocked_for_credit: true } : {})
      }
    };
  });
};

export const mergeCloudInventoryWithLocal = (
  localItems: InventoryItem[],
  remoteItems?: InventoryItem[],
  tenantId: string = 'tenant-main'
): InventoryItem[] => {
  if (remoteItems === undefined) {
    return localItems;
  }
  const items = localItems || [];
  const localForTenant = items.filter(item =>
    tenantId === 'all' || getRowTenantId(item) === tenantId
  );
  const otherTenantItems = tenantId === 'all'
    ? []
    : items.filter(item => getRowTenantId(item) !== tenantId);

  const remoteTenantItems = (remoteItems || []).filter(item =>
    tenantId === 'all' || getRowTenantId(item) === tenantId
  );

  // If cloud has 0 items and local has items, keep all local items!
  // Inventory items are persistent goods/assets and must NOT be purged by reset timestamps.
  if (remoteTenantItems.length === 0) {
    return localItems;
  }

  const localById = new Map(localForTenant.map(item => [item.id, item]));
  const remoteIds = new Set(remoteTenantItems.map(item => item.id));

  const mergedRemoteItems = remoteTenantItems.map(remoteItem => {
    const localItem = localById.get(remoteItem.id);
    if (!localItem) return remoteItem;

    // Preserve non-zero stock, buyPrice, sellPrice from local if remote has 0 or missing
    const stock = Number(remoteItem.stock) > 0
      ? Number(remoteItem.stock)
      : (Number(localItem.stock) || 0);

    const buyPrice = Number(remoteItem.buyPrice) > 0
      ? Number(remoteItem.buyPrice)
      : (Number(localItem.buyPrice) || 0);

    const sellPrice = Number(remoteItem.sellPrice) > 0
      ? Number(remoteItem.sellPrice)
      : (Number(localItem.sellPrice) || 0);

    return {
      ...localItem,
      ...remoteItem,
      stock,
      buyPrice,
      sellPrice,
      metadata: {
        ...(localItem.metadata || {}),
        ...(remoteItem.metadata || {})
      }
    };
  });

  const unsyncedLocalItems = localForTenant.filter(item => !remoteIds.has(item.id));
  return [...otherTenantItems, ...mergedRemoteItems, ...unsyncedLocalItems];
};

export const recoverLocalRowsFromSnapshot = <T extends TenantScopedRow>(
  localRows: T[],
  snapshotRows: T[],
  tenantId: string = 'tenant-main'
): T[] => {
  const rows = localRows as TenantScopedRow[];
  const snapshot = snapshotRows as TenantScopedRow[];
  const localForTenant = rows.filter(row => tenantId === 'all' || getRowTenantId(row) === tenantId);
  const otherTenantRows = tenantId === 'all'
    ? []
    : rows.filter(row => getRowTenantId(row) !== tenantId);
  const retainedLocalRows = localForTenant.filter(row => isNewerThanTenantReset(row, tenantId));
  if (retainedLocalRows.length > 0) {
    return [...otherTenantRows, ...retainedLocalRows] as T[];
  }
  if (localForTenant.length > 0 && !getTenantResetAt(tenantId)) {
    return localRows;
  }
  const recoverableRows = snapshot.filter(row =>
    (tenantId === 'all' || getRowTenantId(row) === tenantId) &&
    isNewerThanTenantReset(row, tenantId)
  );
  return [...otherTenantRows, ...recoverableRows] as T[];
};

export const recoverLocalInventoryFromSnapshot = (
  localItems: InventoryItem[],
  snapshotItems: InventoryItem[],
  tenantId: string = 'tenant-main'
): InventoryItem[] => {
  const localForTenant = (localItems || []).filter(item =>
    tenantId === 'all' || getRowTenantId(item) === tenantId
  );
  const otherTenantItems = tenantId === 'all'
    ? []
    : (localItems || []).filter(item => getRowTenantId(item) !== tenantId);

  // If local already has items for this tenant, retain them
  if (localForTenant.length > 0) {
    return localItems;
  }

  // Otherwise recover all snapshot items for this tenant without applying financial reset timestamp filters
  const recoverableItems = (snapshotItems || []).filter(item =>
    tenantId === 'all' || getRowTenantId(item) === tenantId
  );
  return [...otherTenantItems, ...recoverableItems];
};

export const filterRowsForTenant = <T extends { tenantId?: string; tenant_id?: string }>(
  rows: T[],
  tenantId: string
): T[] => rows.filter(row =>
  tenantId === 'all' ||
  getRowTenantId(row) === tenantId
);

export const removeRowsForTenant = <T extends { tenantId?: string; tenant_id?: string }>(
  rows: T[],
  tenantId: string
): T[] => tenantId === 'all'
  ? []
  : rows.filter(row => getRowTenantId(row) !== tenantId);

export const parseRecordTimestamp = (record: {
  created_at?: string | null;
  createdAt?: string | null;
  date?: string | null;
  id?: string;
  updated_at?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, any>;
}): number | null => {
  // 1. Try explicit createdAt / created_at (typically ISO strings e.g. 2026-09-14T...)
  const isoCandidate = record.createdAt || record.created_at || record.updatedAt || record.updated_at ||
    record.metadata?.habino_client_sync_at || record.metadata?.created_at || record.metadata?.updated_at;
  if (isoCandidate) {
    const ts = Date.parse(isoCandidate);
    if (Number.isFinite(ts) && ts > 0) return ts;
  }

  // 2. Try date field (may be Jalali e.g. 1403/08/20 or Gregorian YYYY-MM-DD)
  if (record.date) {
    const cleanDate = cleanDateStr(record.date);
    const directTs = Date.parse(cleanDate);
    if (Number.isFinite(directTs) && new Date(directTs).getFullYear() > 1990) {
      return directTs;
    }
    const pgDate = toPostgresDate(cleanDate);
    if (pgDate) {
      const ts = Date.parse(`${pgDate}T00:00:00.000Z`);
      if (Number.isFinite(ts)) return ts;
    }
  }

  // 3. Try timestamp embedded in ID (e.g. inv-1741234567890 or doc-1741234567890)
  if (record.id) {
    const idMatch = record.id.match(/\b(17\d{10,11})\b/);
    if (idMatch) {
      const ts = Number(idMatch[1]);
      if (Number.isFinite(ts) && ts > 1600000000000 && ts < 2500000000000) {
        return ts;
      }
    }
  }

  // 4. For non-financial master data (such as Clients with a valid name), preserve them
  if ((record as any).name && !(record as any).invoiceNumber && !(record as any).documentNumber) {
    return Date.now();
  }

  return null;
};

export const hasFinancialRecordsNotSafelyOlderThan = (
  records: Array<{ created_at?: string | null; createdAt?: string | null; date?: string | null; id?: string }>,
  resetAt?: string | null
): boolean => {
  if (records.length === 0) return false;

  const normalizedResetAt = resetAt?.trim() || '';
  const numericResetAt = /^\d+$/.test(normalizedResetAt) ? Number(normalizedResetAt) : NaN;
  const resetTimestamp = Number.isFinite(numericResetAt) ? numericResetAt : Date.parse(normalizedResetAt);
  if (!Number.isFinite(resetTimestamp)) return true;

  return records.some(record => {
    const recordTs = parseRecordTimestamp(record);
    if (recordTs === null) {
      // Under an active reset, unparseable legacy records are safely treated as older than the reset
      return false;
    }
    return recordTs >= resetTimestamp;
  });
};
