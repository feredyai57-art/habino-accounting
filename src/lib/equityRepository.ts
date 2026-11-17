import { EquityCompanyProfile, EquityEvent, EquityOwnershipPosition, FixedAssetRecord } from '../types';
import { indexedDbEngine } from './indexedDbEngine';
import { offlineOutbox } from './offlineOutboxQueue';
import { getSupabaseClient, getSupabaseConfig } from './supabase';
import { v5 as uuidv5 } from 'uuid';

const LOCAL_KEYS = {
  equityCompanyProfiles: 'habino_equity_profiles_v1',
  equityOwnershipPositions: 'habino_equity_ownership_v1',
  equityEvents: 'habino_equity_events_v1',
  fixedAssets: 'habino_fixed_assets_v1'
} as const;

type EquityStoreName = keyof typeof LOCAL_KEYS;
type EquityRecord = EquityCompanyProfile | EquityOwnershipPosition | EquityEvent | FixedAssetRecord;

const readLocalStorageRows = <T extends EquityRecord>(storeName: EquityStoreName): T[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEYS[storeName]);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows as T[] : [];
  } catch {
    return [];
  }
};

const writeLocalStorageRows = (storeName: EquityStoreName, rows: EquityRecord[]): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEYS[storeName], JSON.stringify(rows));
  } catch (error) {
    console.warn(`[EquityRepository] Failed to persist ${storeName} fallback cache:`, error);
  }
};

export const loadEquityRecords = async <T extends EquityRecord>(
  storeName: EquityStoreName,
  tenantId: string
): Promise<T[]> => {
  const indexedRows = await indexedDbEngine.getAll<T>(storeName);
  const localRows = readLocalStorageRows<T>(storeName);
  let remoteRows: T[] = [];
  const config = getSupabaseConfig();
  if (config.isConfigured) {
    const tableName = storeName === 'equityCompanyProfiles'
      ? 'equity_company_profiles'
      : storeName === 'equityOwnershipPositions'
        ? 'equity_ownership_positions'
        : storeName === 'equityEvents'
          ? 'equity_events'
          : 'fixed_assets';
    let data: Record<string, any>[] | null = null;
    try {
      const result = await getSupabaseClient()
        .from(tableName)
        .select('*')
        .eq('tenant_id', tenantId);
      if (!result.error && Array.isArray(result.data)) data = result.data;
    } catch (error) {
      console.warn('[EquityRepository] Remote read failed; preserving local records:', error);
    }
    if (Array.isArray(data)) {
      remoteRows = data.map((row: Record<string, any>) => {
        if (storeName === 'equityCompanyProfiles') {
          return {
            id: row.id,
            tenantId: row.tenant_id,
            legalForm: row.legal_form,
            registeredCapital: Number(row.registered_capital) || 0,
            authorizedShares: row.authorized_shares == null ? undefined : Number(row.authorized_shares),
            issuedShares: row.issued_shares == null ? undefined : Number(row.issued_shares),
            nominalShareValue: row.nominal_share_value == null ? undefined : Number(row.nominal_share_value),
            currency: row.currency,
            effectiveDate: row.effective_date,
            version: Number(row.version) || 1,
            updatedAt: row.updated_at
          } as EquityCompanyProfile as T;
        }
        if (storeName === 'equityOwnershipPositions') {
          return {
            id: row.id,
            tenantId: row.tenant_id,
            ownerTafsiliCode: row.owner_tafsili_code,
            ownerName: row.owner_name,
            effectiveDate: row.effective_date,
            shareCount: row.share_count == null ? undefined : Number(row.share_count),
            ownershipPercent: Number(row.ownership_percent) || 0,
            committedCapital: Number(row.committed_capital) || 0,
            paidCapital: Number(row.paid_capital) || 0,
            version: Number(row.version) || 1,
            updatedAt: row.updated_at
          } as EquityOwnershipPosition as T;
        }
        if (storeName === 'equityEvents') return {
          id: row.id,
          tenantId: row.tenant_id,
          eventType: row.event_type,
          status: row.status,
          effectiveDate: row.effective_date,
          payload: row.payload || {},
          journalDocumentNumber: row.journal_document_number || undefined,
          approvalReference: row.approval_reference || undefined,
          approvedBy: row.approved_by || undefined,
          approvedAt: row.approved_at || undefined,
          createdAt: row.created_at,
          version: Number(row.version) || 1
        } as EquityEvent as T;
        return {
          id: row.id,
          tenantId: row.tenant_id,
          assetTag: row.asset_tag,
          title: row.title,
          assetClass: row.asset_class,
          accountCode: row.account_code,
          acquisitionDate: row.acquisition_date,
          inServiceDate: row.in_service_date,
          grossCost: Number(row.gross_cost) || 0,
          accumulatedDepreciation: Number(row.accumulated_depreciation) || 0,
          residualValue: Number(row.residual_value) || 0,
          usefulLifeMonths: row.useful_life_months == null ? undefined : Number(row.useful_life_months),
          depreciationMethod: row.depreciation_method,
          valuationReference: row.valuation_reference,
          journalDocumentNumber: row.journal_document_number,
          status: row.status,
          version: Number(row.version) || 1,
          updatedAt: row.updated_at
        } as FixedAssetRecord as T;
      });
      for (const row of remoteRows) await indexedDbEngine.putItem(storeName, row);
      writeLocalStorageRows(storeName, [...localRows.filter(row => row.tenantId !== tenantId), ...remoteRows]);
    }
  }
  const merged = new Map<string, T>();
  [...localRows, ...indexedRows, ...remoteRows].forEach(row => {
    if (row.tenantId !== tenantId) return;
    const existing = merged.get(row.id);
    const existingTimestamp = Date.parse(
      (existing as any)?.updatedAt || (existing as any)?.createdAt || ''
    ) || 0;
    const rowTimestamp = Date.parse((row as any).updatedAt || (row as any).createdAt || '') || 0;
    const existingVersion = Number((existing as any)?.version) || 0;
    const rowVersion = Number((row as any).version) || 0;
    if (!existing || rowVersion > existingVersion || (rowVersion === existingVersion && rowTimestamp > existingTimestamp)) {
      merged.set(row.id, row);
    }
  });
  return Array.from(merged.values());
};

export const saveEquityRecord = async <T extends EquityRecord>(
  storeName: EquityStoreName,
  record: T
): Promise<void> => {
  const savedRecord = storeName === 'equityOwnershipPositions'
    ? {
        ...record,
        id: uuidv5(
          `${record.tenantId}:${(record as EquityOwnershipPosition).ownerTafsiliCode}:${(record as EquityOwnershipPosition).effectiveDate}`,
          uuidv5.URL
        )
      } as T
    : record;
  const currentRows = readLocalStorageRows(storeName);
  const updatedRows = [...currentRows.filter(row => {
    if (row.id === savedRecord.id) return false;
    if (storeName === 'equityOwnershipPositions') {
      const currentPosition = row as EquityOwnershipPosition;
      const nextPosition = savedRecord as EquityOwnershipPosition;
      return currentPosition.ownerTafsiliCode !== nextPosition.ownerTafsiliCode ||
        currentPosition.effectiveDate !== nextPosition.effectiveDate;
    }
    return true;
  }), savedRecord];
  writeLocalStorageRows(storeName, updatedRows);
  await indexedDbEngine.putItem(storeName, savedRecord);

  if (getSupabaseConfig().isConfigured) {
    const type = storeName === 'equityCompanyProfiles'
      ? 'equityProfile'
      : storeName === 'equityOwnershipPositions'
        ? 'equityOwnership'
        : storeName === 'equityEvents'
          ? 'equityEvent'
          : 'fixedAsset';
    offlineOutbox.enqueue(type, savedRecord, savedRecord.tenantId);
  }
};

export const getLatestEquityProfile = async (tenantId: string): Promise<EquityCompanyProfile | null> => {
  const rows = await loadEquityRecords<EquityCompanyProfile>('equityCompanyProfiles', tenantId);
  return rows.sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0] || null;
};

export const getLatestOwnershipPositions = (
  positions: EquityOwnershipPosition[],
  asOfDate: string
): EquityOwnershipPosition[] => {
  const latestByOwner = new Map<string, EquityOwnershipPosition>();
  positions
    .filter(position => position.effectiveDate <= asOfDate)
    .forEach(position => {
      const current = latestByOwner.get(position.ownerTafsiliCode);
      if (!current || position.effectiveDate > current.effectiveDate) {
        latestByOwner.set(position.ownerTafsiliCode, position);
      }
    });
  return Array.from(latestByOwner.values()).filter(position =>
    (Number(position.shareCount) || 0) > 0 || position.committedCapital > 0
  );
};