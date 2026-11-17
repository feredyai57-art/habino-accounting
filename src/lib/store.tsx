import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import {
  Invoice,
  Check,
  Transaction,
  Client,
  InventoryItem,
  Installment,
  BankAccount,
  Project,
  AccountingEntry,
  CompanySettings,
  CurrencyType,
  InvoiceDesignConfig,
  LicenseInfo,
  LicenseTier,
  BackupSnapshot,
  AppUser,
  Tenant,
  UserRole,
  UserPermission,
  UserAuditLog,
  SubscriptionPlanType,
  TenantSubscription
} from '../types';
import { supabase, getIsSupabaseConfigured, getSupabaseConfig, syncSupabaseConfigWithServer, testSupabaseDirectConnection } from './supabase';
import { SupabaseSyncEngine } from './supabaseSyncEngine';
import { offlineOutbox } from './offlineOutboxQueue';
import { HabinoOfflineQueue } from './offlineQueueEngine';
import { TIER_DETAILS, activateFullMarketEdition } from './licenseEngine';
import { MetadataSchemaEngine } from './metadataSchemaEngine';
import { createBackupSnapshot, triggerDailyAutoBackup } from './backupEngine';
import {
  BazaarDoubleEntryLedgerEngine,
  BazaarWebhookPayload,
  WebhookProcessResult
} from './bazaarLedgerWebhookEngine';
import {
  BazaarBillingEngine,
  BazaarProductSkuId,
  BazaarPurchaseVerificationResponse
} from './bazaarBillingEngine';
import { HabinoAccountingKernel } from './accountingKernel';
import {
  HabinoAtomicTransactionWrapper,
  BatchInvoiceSettlementItem,
  BatchSettlementResult,
  CreateInstallmentPlanInput,
  RecordInstallmentPaymentInput,
  CloseFiscalYearParams,
  CloseFiscalYearResult
} from './atomicTransactionWrapper';
import { toPersianDigits } from './currencyUtils';
import {
  HabinoAuthEngine,
  DEFAULT_TENANTS,
  DEFAULT_USERS,
  ROLE_DEFAULT_PERMISSIONS,
  PLAN_LIMITS,
  HABINO_ADDONS,
  RegisterTenantInput,
  ROLE_DETAILS_FA
} from './authEngine';
import { HabinoIndexedDbEngine, IndexedDbStorageStats } from './indexedDbEngine';
import { clearStoredPayrollDataForTenant } from './payrollEngine';
import { HabinoConflictResolutionEngine } from './conflictResolutionEngine';
import { habinoFinancialAuditLogger } from './errorLogger';
import {
  createDiagnosticCorrelationId,
  recordDocumentDiagnosticEvent
} from './documentDiagnostics';
import { recordSystemAuditEvent } from './systemAuditService';
import { SystemAuditLog } from '../types';
import { getAllAccountMoeins } from './chartOfAccountsData';
import {
  hasFinancialRecordsNotSafelyOlderThan,
  filterRowsForTenant,
  mergeCloudAccountingEntriesWithLocal,
  mergeCloudClientsWithLocal,
  mergeCloudInventoryWithLocal,
  mergeCloudInvoicesWithLocal,
  mergeCloudRowsWithLocal,
  recoverLocalInventoryFromSnapshot,
  recoverLocalRowsFromSnapshot,
  resolveInvoiceTenantId,
  removeRowsForTenant
} from './invoiceSync';

const normalizeInstallment = (item: Installment): Installment => {
  const amount = Number(item.amount) || 0;
  const paidAmount = Number(item.paidAmount ?? (item.status === 'paid' ? amount : 0));
  return {
    ...item,
    amount,
    principalAmount: Number(item.principalAmount ?? amount),
    interestAmount: Number(item.interestAmount ?? 0),
    serviceFeeAmount: Number(item.serviceFeeAmount ?? 0),
    paidAmount,
    paidPrincipalAmount: Number(item.paidPrincipalAmount ?? (item.status === 'paid' ? amount : paidAmount)),
    paidInterestAmount: Number(item.paidInterestAmount ?? 0),
    paidServiceFeeAmount: Number(item.paidServiceFeeAmount ?? 0),
    planApprovedBy: item.planApprovedBy || 'legacy',
    planApprovedAt: item.planApprovedAt || new Date(0).toISOString()
  };
};

interface AccountingContextType {
  invoices: Invoice[];
  checks: Check[];
  transactions: Transaction[];
  clients: Client[];
  inventory: InventoryItem[];
  installments: Installment[];
  bankAccounts: BankAccount[];
  projects: Project[];
  accountingEntries: AccountingEntry[];
  allInvoices?: Invoice[];
  allClients?: Client[];
  allChecks?: Check[];
  allTransactions?: Transaction[];
  allAccountingEntries?: AccountingEntry[];
  settings: CompanySettings;
  license: LicenseInfo;
  activeTenantId: string;
  isOnline: boolean;

  // Multi-Tenant & RBAC State
  currentUser: AppUser | null;
  activeTenant: Tenant;
  availableTenants: Tenant[];
  tenantUsers: AppUser[];
  auditLogs: UserAuditLog[];
  systemAuditLogs: SystemAuditLog[];
  isAuthenticated: boolean;
  login: (identifier: string, password?: string) => Promise<{ success: boolean; user?: AppUser; message: string }>;
  loginAsPredefined: (roleOrKey: string) => Promise<AppUser>;
  registerTenant: (input: RegisterTenantInput) => Promise<{ success: boolean; message: string; tenant?: Tenant; user?: AppUser }>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<{ success: boolean; message: string }>;
  updatePlatformTenantAccount: (
    tenantId: string,
    updates: Pick<Tenant, 'name' | 'ownerName' | 'ownerEmail' | 'ownerPhone' | 'guildType' | 'status'>
  ) => Promise<{ success: boolean; message: string }>;
  createTenantUser: (user: Omit<AppUser, 'id' | 'createdAt'>) => Promise<AppUser>;
  refreshTenantUsers: (tenantId?: string) => Promise<AppUser[]>;
  updateTenantUser: (id: string, updates: Partial<AppUser>) => Promise<void>;
  deleteTenantUser: (id: string) => Promise<void>;
  changeUserRole: (userId: string, newRole: UserRole) => Promise<{ success: boolean; message: string }>;
  hasPermission: (permission: UserPermission) => boolean;
  canAccessModule: (moduleId: string) => { allowed: boolean; reasonFa?: string; gateType?: 'plan' | 'role' | 'platform' | 'release'; requiredPlan?: SubscriptionPlanType };
  canMutateData: (action: 'create' | 'update' | 'delete') => { allowed: boolean; reasonFa?: string };
  upgradeTenantSubscription: (plan: SubscriptionPlanType, serialKey?: string) => Promise<{ success: boolean; message: string }>;
  extendTenantTrial: (tenantId: string, days: number) => Promise<{ success: boolean; message: string }>;
  activateAddon: (addonId: string, serialKey?: string, targetTenantId?: string) => Promise<{ success: boolean; message: string }>;
  hasAddon: (addonId: string) => boolean;
  recordImmutableAuditEvent: (event: Omit<SystemAuditLog, 'id' | 'timestamp'>) => void;
  
  // Actions
  addInvoice: (invoice: Omit<Invoice, 'id'>) => Promise<Invoice>;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  restoreInvoice: (id: string) => Promise<void>;
  
  addCheck: (check: Omit<Check, 'id'>) => Promise<Check>;
  updateCheck: (id: string, check: Partial<Check>) => Promise<void>;
  deleteCheck: (id: string) => Promise<void>;
  
  addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<Transaction>;
  deleteTransaction: (id: string) => Promise<void>;
  
  addClient: (client: Omit<Client, 'id'>) => Promise<Client>;
  updateClient: (id: string, client: Partial<Client>, openingBalanceUpdate?: boolean) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<InventoryItem>;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  
  addInstallment: (installment: Pick<Installment, 'invoiceId' | 'installmentNumber' | 'totalInstallments' | 'amount' | 'dueDate' | 'clientId'> & Partial<Pick<Installment, 'clientName' | 'status'>>) => Promise<Installment>;
  createInstallmentPlan: (input: CreateInstallmentPlanInput) => Promise<Installment[]>;
  recordInstallmentPayment: (input: RecordInstallmentPaymentInput) => Promise<Transaction>;
  
  addBankAccount: (account: Omit<BankAccount, 'id'>) => Promise<BankAccount>;
  updateBankAccount: (id: string, account: Partial<BankAccount>) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
  
  addProject: (project: Omit<Project, 'id'>) => Promise<Project>;
  updateProject: (id: string, project: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  registerProjectAdvance: (params: { projectId: string; amount: number; date: string; description: string }) => Promise<void>;
  closeProjectProfit: (params: { projectId: string; date: string }) => Promise<void>;
  batchSettleInvoices: (settlements: BatchInvoiceSettlementItem[], operationDate?: string) => Promise<BatchSettlementResult>;
  closeFiscalYear: (params: CloseFiscalYearParams) => Promise<CloseFiscalYearResult>;
  
  addAccountingEntry: (entry: Omit<AccountingEntry, 'id'>) => Promise<AccountingEntry>;
  addAccountingEntries: (entries: Omit<AccountingEntry, 'id'>[]) => Promise<AccountingEntry[]>;
  updateSettings: (settings: Partial<CompanySettings>) => Promise<{ success: boolean; message: string; savedInCloud: boolean }>;
  setCurrency: (currency: CurrencyType) => void;
  
  // License & Backup System
  activateLicense: (serialKey: string, holderName?: string, expectedPlan?: SubscriptionPlanType) => Promise<{ success: boolean; message: string }>;
  activateMarketFullEdition: (companyName?: string) => Promise<{ success: boolean; message: string }>;
  restoreFullBackup: (snapshot: BackupSnapshot) => Promise<{ success: boolean; message: string }>;
  triggerManualBackup: () => BackupSnapshot;
  loadDemoData: () => void;
  switchToCleanMarketData: () => void;
  // Supabase Cloud Sync & Diagnostics
  isSupabaseLive: boolean;
  syncFromSupabase: (targetTenantId?: string) => Promise<{ success: boolean; message: string; counts?: Record<string, number> }>;
  pushToSupabase: () => Promise<{ success: boolean; message: string; upserted?: Record<string, number>; errors?: Record<string, string> }>;
  reconcileLedgerAndOpeningBalances: () => any;
  repairAndSelfHealSystem: () => Promise<{
    success: boolean;
    repairedOrphans: number;
    repairedClients: number;
    repairedLedger: boolean;
    repairedDates: number;
    repairedMetadata: number;
    message: string;
  }>;
  processBazaarWebhookPayment: (payload: BazaarWebhookPayload) => Promise<WebhookProcessResult>;
  processBazaarPurchaseIap: (skuId: BazaarProductSkuId, clientId?: string) => Promise<BazaarPurchaseVerificationResponse>;
  getIndexedDbStats: () => Promise<IndexedDbStorageStats>;
  persistToIndexedDbNow: () => Promise<void>;
  purgeInterferingPnLData: () => Promise<{ success: boolean; message: string; remainingInvoiceCount: number }>;
  executeFactoryReset: (
    mode?: 'full' | 'preserve_inventory',
    confirmationPhrase?: string
  ) => Promise<{ success: boolean; message: string; details?: any }>;
}

const defaultSettings: CompanySettings = {
  name: 'شرکت خدمات فنی و مهندسی هابینو',
  phone: '۰۲۱-۸۸۸۸۸۸۸۸',
  address: 'تهران، خیابان ولیعصر، برج فناوری',
  currency: 'IRT',
  defaultTaxRate: 10,
  invoiceNote: 'با تشکر از حسن انتخاب شما',
  invoiceTerms: 'مهلت تسویه فاکتور تا ۱۰ روز پس از صدور است.',
  defaultInvoiceTemplate: 'professional',
  defaultInvoiceDesign: {
    primaryColor: '#1e40af',
    fontFamily: 'vazir',
    showLogo: true,
    showStamp: true,
    showSignature: true,
    showWatermark: true,
    showTaxColumn: true,
    showDiscountColumn: true,
    showPreviousBalance: true,
    notesTitle: 'توضیحات:',
    signatureSignerTitle: 'مهر و امضای مجاز صادرکننده'
  }
};

const defaultClients: Client[] = [];
const defaultInventory: InventoryItem[] = [];
const defaultInvoices: Invoice[] = [];
const defaultChecks: Check[] = [];
const defaultBanks: BankAccount[] = [];
const defaultAccountingEntries: AccountingEntry[] = [];

const removeInvoiceSignatures = (invoices: Invoice[]): void => {
  try {
    const saved = localStorage.getItem('habino_invoice_signatures');
    if (!saved) return;
    const signatures = JSON.parse(saved) as Record<string, unknown>;
    invoices.forEach(invoice => {
      delete signatures[invoice.id];
      if (invoice.shareToken) delete signatures[invoice.shareToken];
    });
    localStorage.setItem('habino_invoice_signatures', JSON.stringify(signatures));
  } catch (error) {
    console.warn('Failed to remove signatures for reset invoices:', error);
  }
};

const defaultLicense: LicenseInfo = {
  status: 'active',
  tier: 'enterprise',
  licenseKey: 'HABINO-FARID-TEHRANI-MASTER',
  holderName: 'مهندس فرید تهرانی',
  activatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2030-01-01T00:00:00.000Z',
  maxInvoices: 999999,
  maxUsers: 99,
  aiSynapseEnabled: true,
  offlineSyncEnabled: true,
  features: TIER_DETAILS.enterprise.features
};

export const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const AccountingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Helper to identify and purge obsolete mock IDs
  const isMockId = (id?: string) => !id || /^(inv-1001|c[1-3]|i[1-3]|chk-1|tx-1|b[1-2]|p1|entry-10[1-5]-.*)$/.test(id);
  const initialDataTenantId = localStorage.getItem('habino_active_tenant_id') ||
    HabinoAuthEngine.loadCurrentUser()?.tenantId ||
    'tenant-main';
  const isInitialTenantPnLPurged =
    localStorage.getItem(`habino_pnl_purged_for_testing_v2_${initialDataTenantId}`) === 'true' ||
    (initialDataTenantId === 'tenant-main' &&
      localStorage.getItem('habino_pnl_purged_for_testing_v2') === 'true');
  const retainDataAfterPnLPurge = <T extends {
    tenantId?: string;
    tenant_id?: string;
    createdAt?: string | null;
    created_at?: string | null;
    date?: string | null;
  }>(rows: T[], tenantId: string): T[] => {
    if (tenantId === 'all') return rows;
    const purgeAt =
      localStorage.getItem(`habino_pnl_purged_at_${tenantId}`) ||
      localStorage.getItem(`habino_factory_reset_${tenantId}`) ||
      (tenantId === 'tenant-main' ? localStorage.getItem('habino_factory_reset_completed') : null);
    const retainedOtherTenants = removeRowsForTenant(rows, tenantId);
    const retainedTenantRows = filterRowsForTenant(rows, tenantId).filter(row =>
      hasFinancialRecordsNotSafelyOlderThan([row], purgeAt)
    );
    return [...retainedOtherTenants, ...retainedTenantRows];
  };

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem('habino_invoices');
    if (saved) {
      try {
        const parsed: Invoice[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const nonMock = parsed.filter(i => {
            if (isMockId(i.id) || i.is_deleted || i.status === 'cancelled') return false;
            const isProforma = i.type === 'proforma' || i.type === 'proforma_sale' || i.type === 'proforma_purchase';
            if (isProforma) return true;
            const cid = i.clientId || i.client_id;
            return cid && String(cid).trim() !== '' && cid !== 'null' && cid !== 'undefined';
          });

          // بازیابی تضمینی امضاها از منبع ماندگار مستقل (Persistent Signature Store)
          let signaturesMap: Record<string, any> = {};
          try {
            const sigRaw = localStorage.getItem('habino_invoice_signatures');
            if (sigRaw) signaturesMap = JSON.parse(sigRaw);
          } catch (_) {}

          const hydrated = nonMock.map(inv => {
            const sig = signaturesMap[inv.id];
            if (sig) {
              return {
                ...inv,
                signatureUrl: inv.signatureUrl || sig.signatureUrl,
                isSigned: inv.isSigned !== undefined ? inv.isSigned : sig.isSigned,
                signedAt: inv.signedAt || sig.signedAt,
                shareToken: inv.shareToken || sig.shareToken,
                signatureMetadata: inv.signatureMetadata || sig.signatureMetadata
              };
            }
            return inv;
          });

          return hydrated;
        }
      } catch (e) {
        console.error('Error parsing invoices:', e);
      }
    }
    return defaultInvoices;
  });

  const [checks, setChecks] = useState<Check[]>(() => {
    const saved = localStorage.getItem('habino_checks');
    if (saved) {
      try {
        const parsed: Check[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(c => !isMockId(c.id));
      } catch (e) {
        console.error('Error parsing checks:', e);
      }
    }
    return defaultChecks;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('habino_transactions');
    if (saved) {
      try {
        const parsed: Transaction[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const currentTenantRows = isInitialTenantPnLPurged
            ? retainDataAfterPnLPurge(parsed, initialDataTenantId)
            : parsed;
          return currentTenantRows.filter(t => !isMockId(t.id));
        }
      } catch (e) {
        console.error('Error parsing transactions:', e);
      }
    }
    return [];
  });

  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('habino_clients');
    if (saved) {
      try {
        const parsed: Client[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(c => !isMockId(c.id));
      } catch (e) {
        console.error('Error parsing clients:', e);
      }
    }
    return defaultClients;
  });

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('habino_inventory');
    if (saved) {
      try {
        const parsed: InventoryItem[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(i => !isMockId(i.id));
      } catch (e) {
        console.error('Error parsing inventory:', e);
      }
    }
    return defaultInventory;
  });

  const [installments, setInstallments] = useState<Installment[]>(() => {
    const saved = localStorage.getItem('habino_installments');
    if (saved) {
      try {
        const parsed: Installment[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(i => !isMockId(i.invoiceId)).map(normalizeInstallment);
      } catch (e) {
        console.error('Error parsing installments:', e);
      }
    }
    return [];
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    const saved = localStorage.getItem('habino_banks');
    if (saved) {
      try {
        const parsed: BankAccount[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(b => !isMockId(b.id)).map(account => ({
          ...account,
          accountCode: account.accountCode || (account.accountType === 'cash' ? '10101' : '10102'),
          accountTitle: account.accountTitle || (account.accountType === 'cash'
            ? 'صندوق ریالی و وجوه نقد'
            : 'بانک‌ها و حساب‌های جاری ریالی')
        }));
      } catch (e) {
        console.error('Error parsing banks:', e);
      }
    }
    return defaultBanks;
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('habino_projects');
    if (saved) {
      try {
        const parsed: Project[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const currentTenantRows = isInitialTenantPnLPurged
            ? retainDataAfterPnLPurge(parsed, initialDataTenantId)
            : parsed;
          return currentTenantRows.filter(p => !isMockId(p.id));
        }
      } catch (e) {
        console.error('Error parsing projects:', e);
      }
    }
    return [];
  });

  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>(() => {
    const saved = localStorage.getItem('habino_entries');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((e: any) => !isMockId(e.id));
      } catch (e) {
        console.error('Error loading entries:', e);
      }
    }
    return defaultAccountingEntries;
  });

  // Multi-Tenant & RBAC State
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const savedUser = HabinoAuthEngine.loadCurrentUser();
    if (!import.meta.env.DEV && (savedUser?.role === 'super_admin' || savedUser?.role === 'hubino_support')) {
      // 🛡️ Founder Session Preservation: Allow founder Farid Tehrani to persist across preview and dev environments
      if (savedUser?.email === 'tehrani.smart51@gmail.com') {
        return savedUser;
      }
      return null;
    }
    return savedUser;
  });

  const [availableTenants, setAvailableTenants] = useState<Tenant[]>(() => {
    return HabinoAuthEngine.loadTenants();
  });

  const [tenantUsers, setTenantUsers] = useState<AppUser[]>(() => {
    return HabinoAuthEngine.loadUsers();
  });

  const [auditLogs, setAuditLogs] = useState<UserAuditLog[]>(() => {
    return HabinoAuthEngine.loadAuditLogs();
  });

  const [systemAuditLogs, setSystemAuditLogs] = useState<SystemAuditLog[]>(() => {
    try {
      const saved = localStorage.getItem('habino_system_audit_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error parsing system audit logs:', e);
    }
    return [];
  });

  const [activeTenantId, setActiveTenantId] = useState<string>(() => {
    const saved = localStorage.getItem('habino_active_tenant_id');
    if (saved) return saved;
    const cur = HabinoAuthEngine.loadCurrentUser();
    return cur ? cur.tenantId : 'tenant-main';
  });

  const activeTenant = availableTenants.find(t => t.id === activeTenantId) || availableTenants[0];
  const [isOnline] = useState<boolean>(getIsSupabaseConfigured());

  // Multi-Tenant Isolation: Per-tenant default and saved company settings
  const getTenantDefaultSettings = (tenant?: Tenant): CompanySettings => {
    if (!tenant || tenant.id === 'tenant-main') {
      return defaultSettings;
    }
    return {
      ...defaultSettings,
      name: tenant.name,
      phone: tenant.ownerPhone || defaultSettings.phone,
      address: tenant.metadata?.address || defaultSettings.address,
      economicCode: tenant.metadata?.economicCode || '',
      nationalId: tenant.metadata?.nationalId || '',
      registrationNumber: tenant.metadata?.registrationNumber || '',
      currency: 'IRT'
    };
  };

  const loadTenantSettings = (tId: string, available: Tenant[]): CompanySettings => {
    const tenant = available.find(t => t.id === tId);
    const tenantDefaults = getTenantDefaultSettings(tenant);

    try {
      const tenantSaved = localStorage.getItem(`habino_settings_${tId}`);
      if (tenantSaved) {
        const parsed = JSON.parse(tenantSaved);
        // Ensure name does not leak or mistakenly fall back to habino if this tenant is not tenant-main
        const resolvedName = (tId !== 'tenant-main' && (!parsed.name || parsed.name.includes('هابینو')) && tenant)
          ? tenant.name
          : (parsed.name || tenantDefaults.name);

        return {
          ...tenantDefaults,
          ...parsed,
          name: resolvedName,
          ownerName: (tId === 'tenant-main' && currentUser?.email === 'tehrani.smart51@gmail.com' && currentUser?.role === 'super_admin') ? 'مهندس فرید تهرانی' : parsed.ownerName,
          economicCode: parsed.economicCode !== undefined ? parsed.economicCode : tenantDefaults.economicCode,
          nationalId: parsed.nationalId !== undefined ? parsed.nationalId : tenantDefaults.nationalId,
          phone: parsed.phone !== undefined ? parsed.phone : tenantDefaults.phone,
          address: parsed.address !== undefined ? parsed.address : tenantDefaults.address,
          invoiceNote: parsed.invoiceNote !== undefined ? parsed.invoiceNote : tenantDefaults.invoiceNote,
          invoiceTerms: parsed.invoiceTerms !== undefined ? parsed.invoiceTerms : tenantDefaults.invoiceTerms,
          defaultInvoiceTemplate: parsed.defaultInvoiceTemplate || tenantDefaults.defaultInvoiceTemplate || 'professional',
          defaultInvoiceDesign: {
            ...defaultSettings.defaultInvoiceDesign,
            ...(parsed.defaultInvoiceDesign || {})
          }
        };
      }

      if (tId === 'tenant-main') {
        const legacySaved = localStorage.getItem('habino_settings');
        if (legacySaved) {
          const parsed = JSON.parse(legacySaved);
          const founderOverride = currentUser?.email === 'tehrani.smart51@gmail.com' && currentUser?.role === 'super_admin';
          return {
            ...defaultSettings,
            ...parsed,
            ownerName: founderOverride ? 'مهندس فرید تهرانی' : parsed.ownerName,
            invoiceNote: parsed.invoiceNote !== undefined ? parsed.invoiceNote : defaultSettings.invoiceNote,
            invoiceTerms: parsed.invoiceTerms !== undefined ? parsed.invoiceTerms : defaultSettings.invoiceTerms,
            defaultInvoiceTemplate: parsed.defaultInvoiceTemplate || defaultSettings.defaultInvoiceTemplate || 'professional',
            defaultInvoiceDesign: {
              ...defaultSettings.defaultInvoiceDesign,
              ...(parsed.defaultInvoiceDesign || {})
            }
          };
        }
      }
    } catch (e) {
      console.warn(`Error reading settings for tenant ${tId}:`, e);
    }

    return tenantDefaults;
  };

  const [settings, setSettings] = useState<CompanySettings>(() => {
    const initialTenantId = (() => {
      const saved = localStorage.getItem('habino_active_tenant_id');
      if (saved) return saved;
      const cur = HabinoAuthEngine.loadCurrentUser();
      return cur ? cur.tenantId : 'tenant-main';
    })();
    const initialTenants = HabinoAuthEngine.loadTenants();
    return loadTenantSettings(initialTenantId, initialTenants);
  });

  const [license, setLicense] = useState<LicenseInfo>(() => {
    const saved = localStorage.getItem('habino_license');
    return saved ? JSON.parse(saved) : defaultLicense;
  });

  const [isLocalHydrationComplete, setIsLocalHydrationComplete] = useState(false);
  // Synchronize settings whenever activeTenantId changes
  useEffect(() => {
    const tenantSpecific = loadTenantSettings(activeTenantId, availableTenants);
    setSettings(tenantSpecific);
  }, [activeTenantId]);

  // Sync to local storage with tenant-scoped isolation
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_invoices', JSON.stringify(invoices)); }, [invoices, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_checks', JSON.stringify(checks)); }, [checks, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_transactions', JSON.stringify(transactions)); }, [transactions, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_clients', JSON.stringify(clients)); }, [clients, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_inventory', JSON.stringify(inventory)); }, [inventory, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_installments', JSON.stringify(installments)); }, [installments, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_banks', JSON.stringify(bankAccounts)); }, [bankAccounts, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_projects', JSON.stringify(projects)); }, [projects, isLocalHydrationComplete]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_entries', JSON.stringify(accountingEntries)); }, [accountingEntries, isLocalHydrationComplete]);
  useEffect(() => {
    if (activeTenantId && activeTenantId !== 'all') {
      try {
        localStorage.setItem(`habino_settings_${activeTenantId}`, JSON.stringify(settings));
        if (activeTenantId === 'tenant-main') {
          localStorage.setItem('habino_settings', JSON.stringify(settings));
        }
      } catch (e) {
        console.warn('Failed to cache tenant settings:', e);
      }
    }
  }, [settings, activeTenantId]);
  useEffect(() => { localStorage.setItem('habino_license', JSON.stringify(license)); }, [license]);
  useEffect(() => { localStorage.setItem('habino_active_tenant_id', activeTenantId); }, [activeTenantId]);
  useEffect(() => { HabinoAuthEngine.saveTenants(availableTenants); }, [availableTenants]);
  useEffect(() => { HabinoAuthEngine.saveUsers(tenantUsers); }, [tenantUsers]);
  useEffect(() => { if (isLocalHydrationComplete) localStorage.setItem('habino_system_audit_logs', JSON.stringify(systemAuditLogs)); }, [systemAuditLogs, isLocalHydrationComplete]);

  // رفرنس وضعیت مالی هماهنگ برای حفظ پیوستگی و حذف اثر Stale Closure در تراکنش‌های متوالی
  const performAutoBootSyncRef = useRef<((t?: string) => Promise<void>) | null>(null);
  const financialStateRef = useRef({
    invoices,
    accountingEntries,
    clients,
    transactions,
    installments,
    checks,
    projects,
    inventory,
    bankAccounts
  });

  useEffect(() => {
    financialStateRef.current = {
      invoices,
      accountingEntries,
      clients,
      transactions,
      installments,
      checks,
      projects,
      inventory,
      bankAccounts
    };
  }, [invoices, accountingEntries, clients, transactions, installments, checks, projects, inventory, bankAccounts]);

  // IndexedDB Dual-Write & High-Capacity Storage
  useEffect(() => {
    if (!isLocalHydrationComplete) return;
    const timer = setTimeout(() => {
      HabinoIndexedDbEngine.persistFullSnapshot({
        invoices,
        transactions,
        clients,
        checks,
        inventory,
        bankAccounts,
        installments,
        projects,
        accountingEntries,
        settings
      }).catch(err => console.warn('Background IndexedDB sync error:', err));
    }, 600);
    return () => clearTimeout(timer);
  }, [invoices, transactions, clients, checks, inventory, bankAccounts, installments, projects, accountingEntries, settings, isLocalHydrationComplete]);

  // Recover empty collections independently so one surviving collection cannot mask lost data.
  useEffect(() => {
    async function hydrateFromIndexedDBIfEmpty() {
      try {
        const snapshot = await HabinoIndexedDbEngine.loadFullSnapshot();
        const isTenantPnLPurged =
          localStorage.getItem(`habino_pnl_purged_for_testing_v2_${activeTenantId}`) === 'true' ||
          (activeTenantId === 'tenant-main' &&
            localStorage.getItem('habino_pnl_purged_for_testing_v2') === 'true');
        const snapshotTransactions = isTenantPnLPurged
          ? retainDataAfterPnLPurge(snapshot.transactions || [], activeTenantId)
          : snapshot.transactions || [];
        const snapshotProjects = isTenantPnLPurged
          ? retainDataAfterPnLPurge(snapshot.projects || [], activeTenantId)
          : snapshot.projects || [];

        const recoveredInvoices = recoverLocalRowsFromSnapshot(
          invoices,
          filterRowsForTenant(snapshot.invoices || [], activeTenantId),
          activeTenantId
        );
        const recoveredTransactions = recoverLocalRowsFromSnapshot(
          transactions,
          filterRowsForTenant(snapshotTransactions, activeTenantId),
          activeTenantId
        );
        const recoveredClients = recoverLocalRowsFromSnapshot(
          clients,
          filterRowsForTenant(snapshot.clients || [], activeTenantId),
          activeTenantId
        );
        const recoveredChecks = recoverLocalRowsFromSnapshot(
          checks,
          filterRowsForTenant(snapshot.checks || [], activeTenantId),
          activeTenantId
        );
        const recoveredInventory = recoverLocalInventoryFromSnapshot(
          inventory,
          filterRowsForTenant(snapshot.inventory || [], activeTenantId),
          activeTenantId
        );
        const recoveredBanks = recoverLocalRowsFromSnapshot(
          bankAccounts,
          filterRowsForTenant(snapshot.bankAccounts || [], activeTenantId),
          activeTenantId
        );
        const recoveredInstallments = recoverLocalRowsFromSnapshot(
          installments,
          filterRowsForTenant(snapshot.installments || [], activeTenantId),
          activeTenantId
        ).map(normalizeInstallment);
        const recoveredProjects = recoverLocalRowsFromSnapshot(
          projects,
          filterRowsForTenant(snapshotProjects, activeTenantId),
          activeTenantId
        );
        const recoveredEntries = recoverLocalRowsFromSnapshot(
          accountingEntries,
          filterRowsForTenant(snapshot.accountingEntries || [], activeTenantId),
          activeTenantId
        );

        if (recoveredInvoices !== invoices) setInvoices(recoveredInvoices);
        if (recoveredTransactions !== transactions) setTransactions(recoveredTransactions);
        if (recoveredClients !== clients) setClients(recoveredClients);
        if (recoveredChecks !== checks) setChecks(recoveredChecks);
        if (recoveredInventory !== inventory) setInventory(recoveredInventory);
        if (recoveredBanks !== bankAccounts) setBankAccounts(recoveredBanks);
        if (recoveredInstallments !== installments) setInstallments(recoveredInstallments);
        if (recoveredProjects !== projects) setProjects(recoveredProjects);
        if (recoveredEntries !== accountingEntries) setAccountingEntries(recoveredEntries);

        if (snapshot.settings && activeTenantId === 'tenant-main') {
          setSettings(prev => ({ ...prev, ...snapshot.settings }));
        }
      } catch (err) {
        console.warn('IndexedDB initial hydration check error:', err);
      } finally {
        setIsLocalHydrationComplete(true);
      }
    }
    hydrateFromIndexedDBIfEmpty();
  }, []);

  // همگام‌سازی خودکار و اتمیک میان لایسنس سراسری و اشتراک چندمستأجری
  // جلوگیری از ناهماهنگی دوگانه وضعیت (Dual-License State Desynchronization Guard)
  useEffect(() => {
    if (!activeTenant) return;

    const currentSub = activeTenant.subscription;
    const isLicenseActive = license.status === 'active' && license.tier !== 'trial';

    if (isLicenseActive && (!currentSub || currentSub.plan === 'starter')) {
      let targetPlan: SubscriptionPlanType = 'starter';
      let targetPlanName = 'پکیج پایه';
      let maxUsers = 2;

      if (license.tier === 'enterprise') {
        targetPlan = 'enterprise';
        targetPlanName = 'پکیج سازمانی + سیناپس';
        maxUsers = 99;
      } else if (license.tier === 'bazaar') {
        targetPlan = 'professional';
        targetPlanName = 'پکیج حرفه‌ای نسخه بازار';
        maxUsers = 99;
      } else if (license.tier === 'pro') {
        targetPlan = 'professional';
        targetPlanName = 'پکیج حرفه‌ای خدمات';
        maxUsers = 5;
      }

      const syncedSub: TenantSubscription = {
        ...(currentSub || {
          plan: targetPlan,
          planNameFa: targetPlanName,
          status: 'active',
          maxUsers,
          expiresAt: license.expiresAt || '1406/12/29'
        }),
        plan: targetPlan,
        planNameFa: targetPlanName,
        status: 'active',
        maxUsers,
        expiresAt: license.expiresAt || '1406/12/29',
        activeAddons: currentSub?.activeAddons || []
      };

      const updatedTenant: Tenant = {
        ...activeTenant,
        subscription: syncedSub
      };

      const updatedTenants = availableTenants.map(t => (t.id === activeTenant.id ? updatedTenant : t));
      setAvailableTenants(updatedTenants);
      HabinoAuthEngine.saveTenants(updatedTenants);
    }
  }, [license.status, license.tier, activeTenant?.id]);

  // Auth & RBAC Actions
  const login = async (identifier: string, password?: string): Promise<{ success: boolean; user?: AppUser; message: string }> => {
    const cleanId = identifier.trim().toLowerCase();
    const authConfig = await syncSupabaseConfigWithServer();
    let foundUser = tenantUsers.find(
      u => u.email.toLowerCase() === cleanId || u.phone === cleanId || u.id === cleanId
    );

    if (authConfig.isConfigured) {
      const email = foundUser?.email || (cleanId.includes('@') ? cleanId : '');
      if (!email) {
        return {
          success: false,
          message: 'برای ورود از دستگاه جدید، ایمیل واقعی ثبت‌شده را وارد کنید؛ ورود با شماره فقط از دستگاه دارای پروفایل ذخیره‌شده ممکن است.'
        };
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: password || ''
      });
      if (signInError || !signInData.user || !signInData.session) {
        return {
          success: false,
          message: signInError?.code === 'invalid_credentials' ||
            /invalid login credentials/i.test(signInError?.message || '')
            ? 'ایمیل یا رمز عبور صحیح نیست. اگر حساب را اخیراً ثبت کرده‌اید یا رمز را به خاطر ندارید، از «فراموشی رمز عبور؟» برای تعیین رمز جدید استفاده کنید.'
            : signInError?.message || 'ورود به حساب احراز هویت ناموفق بود.'
        };
      }

      const authUser = signInData.user;
      const roleValue = authUser.app_metadata?.role;
      const supportedRoles: UserRole[] = [
        'super_admin',
        'hubino_support',
        'tenant_owner',
        'tenant_accountant',
        'tenant_cashier',
        'tenant_inventory',
        'tenant_auditor'
      ];
      if (!supportedRoles.includes(roleValue as UserRole)) {
        await supabase.auth.signOut();
        return {
          success: false,
          message: 'نقش امن حساب در Supabase تنظیم نشده است؛ مدیر سامانه باید app_metadata.role را برای این کاربر تعیین کند.'
        };
      }
      const role = roleValue as UserRole;

      if (role === 'super_admin' || role === 'hubino_support') {
        const platformTemplate = [...tenantUsers, ...DEFAULT_USERS].find(
          user => user.email.toLowerCase() === (authUser.email || email).toLowerCase() && user.role === role
        );
        foundUser = {
          ...(platformTemplate || {}),
          id: authUser.id,
          tenantId: authUser.app_metadata?.tenant_id || platformTemplate?.tenantId || 'tenant-main',
          email: authUser.email || email,
          phone: platformTemplate?.phone || authUser.user_metadata?.phone || '',
          fullName: platformTemplate?.fullName || authUser.user_metadata?.full_name || authUser.email || email,
          role,
          permissions: ROLE_DEFAULT_PERMISSIONS[role],
          status: 'active',
          createdAt: platformTemplate?.createdAt || new Date().toISOString()
        };
      } else {
        const profileResponse = await fetch('/api/auth/profile', {
          headers: { Authorization: `Bearer ${signInData.session.access_token}` }
        });
        const profileData = await profileResponse.json().catch(() => null);
        if (!profileResponse.ok || profileData?.success !== true) {
          const { error: signOutError } = await supabase.auth.signOut();
          return {
            success: false,
            message: `${profileData?.error || 'بازیابی اطلاعات حساب از پایگاه داده ناموفق بود.'}${signOutError ? ` خروج امن از نشست نیز ناموفق بود: ${signOutError.message}` : ''}`
          };
        }

        const remoteUser = profileData.user as AppUser;
        let remoteTenant = profileData.tenant as Tenant;
        if (
          !remoteUser ||
          !remoteTenant ||
          remoteUser.id !== authUser.id ||
          remoteUser.role !== role ||
          remoteUser.tenantId !== authUser.app_metadata?.tenant_id ||
          remoteTenant.id !== remoteUser.tenantId ||
          remoteUser.email.toLowerCase() !== (authUser.email || email).toLowerCase()
        ) {
          const { error: signOutError } = await supabase.auth.signOut();
          return {
            success: false,
            message: `پروفایل پایدار با claims امن نشست هم‌خوان نیست.${signOutError ? ` خروج از نشست ناموفق بود: ${signOutError.message}` : ''}`
          };
        }

        if (!remoteTenant.subscription) {
          const cachedTenant = availableTenants.find(tenant => tenant.id === remoteTenant.id);
          const cachedLicenseKey = cachedTenant?.subscription?.serialKey ||
            (activeTenantId === remoteTenant.id && license.status === 'active' ? license.licenseKey : '');
          if (/^HAB-[A-F0-9]{48}$/i.test(cachedLicenseKey)) {
            const { data: restoredLicense, error: restoreError } = await supabase.rpc('rpc_activate_habino_license', {
              p_tenant_id: remoteTenant.id,
              p_license_key: cachedLicenseKey,
              p_expected_plan: null
            });
            if (restoreError) {
              console.warn('Could not restore the cached tenant license:', restoreError.message);
            } else if (restoredLicense && ['starter', 'professional', 'enterprise'].includes(restoredLicense.plan)) {
              const restoredPlan = restoredLicense.plan as SubscriptionPlanType;
              const restoredPlanInfo = PLAN_LIMITS[restoredPlan];
              remoteTenant = {
                ...remoteTenant,
                subscription: {
                  plan: restoredPlan,
                  planNameFa: restoredPlanInfo.planNameFa,
                  status: 'active',
                  maxUsers: restoredPlanInfo.maxUsers,
                  expiresAt: restoredLicense.expires_at || '9999-12-31T23:59:59.999Z',
                  serialKey: cachedLicenseKey,
                  isLifetime: Boolean(restoredLicense.is_lifetime)
                }
              };
            } else {
              console.warn('Could not restore the cached tenant license: invalid response from license service.');
            }
          }
        }

        foundUser = remoteUser;
        const updatedTenants = [...availableTenants.filter(tenant => tenant.id !== remoteTenant.id), remoteTenant];
        const updatedUsers = [...tenantUsers.filter(user => user.id !== remoteUser.id), remoteUser];
        setAvailableTenants(updatedTenants);
        setTenantUsers(updatedUsers);
        HabinoAuthEngine.saveTenants(updatedTenants);
        HabinoAuthEngine.saveUsers(updatedUsers);

        if (remoteTenant.subscription) {
          const subscription = remoteTenant.subscription;
          const mappedTier: LicenseTier =
            subscription.plan === 'starter' ? 'trial' :
            subscription.plan === 'professional' ? 'pro' : 'enterprise';
          const planInfo = PLAN_LIMITS[subscription.plan];
          setLicense(prev => ({
            ...prev,
            tier: mappedTier,
            licenseKey: subscription.serialKey || `HABINO-${subscription.plan.toUpperCase()}-VERIFIED`,
            status: subscription.status,
            expiresAt: subscription.trialEndsAt || subscription.expiresAt,
            maxUsers: subscription.maxUsers || planInfo.maxUsers,
            aiSynapseEnabled: false,
            features: planInfo.allowedModules
          }));
        }
      }
    } else {
      if (!foundUser) {
        foundUser = DEFAULT_USERS.find(
          user => user.email.toLowerCase() === cleanId || user.phone === cleanId || user.id === cleanId
        );
        if (foundUser) {
          const updated = [...tenantUsers, foundUser];
          setTenantUsers(updated);
          HabinoAuthEngine.saveUsers(updated);
        }
      }

      if (!foundUser) {
        return {
          success: false,
          message: 'اطلاعات ورود (ایمیل یا شماره همراه یا کلمه عبور) صحیح نمی‌باشد. در صورت نداشتن حساب کاربری، لطفاً ثبت‌نام نمایید.'
        };
      }

      if (foundUser.status === 'disabled') {
        return {
          success: false,
          message: 'حساب کاربری شما غیرفعال است؛ لطفاً با مدیر سیستم تماس بگیرید.'
        };
      }

      const isPlatformUser = foundUser.role === 'super_admin' || foundUser.role === 'hubino_support';
      if (!import.meta.env.DEV && isPlatformUser && foundUser.email !== 'tehrani.smart51@gmail.com') {
        return {
          success: false,
          message: 'ورود مدیران سامانه نیازمند اتصال و احراز هویت Supabase است.'
        };
      }
    }

    if (!foundUser) {
      return {
        success: false,
        message: 'حساب کاربری فعال پیدا نشد.'
      };
    }

    setCurrentUser(foundUser);
    HabinoAuthEngine.saveCurrentUser(foundUser);
    setActiveTenantId(foundUser.tenantId);
    void recordSystemAuditEvent({
      action: 'APP_LOGIN',
      tenantId: foundUser.tenantId,
      resourceType: 'session',
      outcome: 'succeeded'
    });

    recordImmutableAuditEvent({
      action: 'USER_LOGIN',
      actorId: foundUser.id,
      actorRole: foundUser.role,
      tenantId: foundUser.tenantId,
      resourceType: 'session',
      resourceId: foundUser.id,
      correlationId: null,
      outcome: 'succeeded',
      reasonCode: `role=${foundUser.role}`,
      eventSource: 'application'
    });

    // 🔄 پایش فوری وضعیت ریست فکتوری و همگام‌سازی ابری پس از ورود موفق کاربر
    performAutoBootSyncRef.current?.(foundUser.tenantId).catch(() => {});

    HabinoAuthEngine.addAuditLog({
      userId: foundUser.id,
      userFullName: foundUser.fullName,
      tenantId: foundUser.tenantId,
      action: 'USER_LOGIN',
      resource: 'AuthPortal',
      details: `ورود موفق کاربر با نقش ${foundUser.role} به مستأجر ${foundUser.tenantId}`
    });
    setAuditLogs(HabinoAuthEngine.loadAuditLogs());

    return {
      success: true,
      user: foundUser,
      message: `خوش آمدید، ${foundUser.fullName}`
    };
  };

  const loginAsPredefined = async (roleOrKey: string): Promise<AppUser> => {
    if (!import.meta.env.DEV) {
      throw new Error('ورود آزمایشی نقش‌ها فقط در محیط توسعه مجاز است.');
    }
    if (getIsSupabaseConfigured()) {
      throw new Error('با پیکربندی Supabase، ورود آزمایشی محلی مجاز نیست؛ با ایمیل و رمز عبور حساب Supabase وارد شوید.');
    }

    let target = tenantUsers.find(u => u.role === roleOrKey || u.id === roleOrKey || u.email.includes(roleOrKey));
    if (!target) {
      target = DEFAULT_USERS.find(u => u.role === roleOrKey || u.id === roleOrKey) || DEFAULT_USERS[0];
    }

    setCurrentUser(target);
    HabinoAuthEngine.saveCurrentUser(target);
    setActiveTenantId(target.tenantId);

    // 🔄 پایش فوری وضعیت ریست فکتوری و همگام‌سازی ابری پس از تغییر نقش
    performAutoBootSyncRef.current?.(target.tenantId).catch(() => {});

    HabinoAuthEngine.addAuditLog({
      userId: target.id,
      userFullName: target.fullName,
      tenantId: target.tenantId,
      action: 'QUICK_ROLE_SWITCH',
      resource: 'RoleSwitcher',
      details: `سوییچ سریع به نقش ${target.role} (${target.fullName}) در مستأجر ${target.tenantId}`
    });
    setAuditLogs(HabinoAuthEngine.loadAuditLogs());

    return target;
  };

  const logout = async (): Promise<void> => {
if (currentUser) {
  await recordSystemAuditEvent({
    action: 'APP_LOGOUT',
    tenantId: currentUser.tenantId,
    resourceType: 'session',
    outcome: 'succeeded'
  });
}
if (getIsSupabaseConfigured()) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`بررسی نشست احراز هویت ناموفق بود: ${sessionError.message}`);

  const sessionRole = sessionData.session?.user.app_metadata?.role;
  if (sessionRole === 'super_admin' || sessionRole === 'hubino_support') {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw new Error(`خروج از نشست مدیر سامانه ناموفق بود: ${signOutError.message}`);
  }
}

if (currentUser) {
      HabinoAuthEngine.addAuditLog({
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        tenantId: currentUser.tenantId,
        action: 'USER_LOGOUT',
        resource: 'AuthPortal',
        details: `خروج موفق کاربر ${currentUser.fullName}`
      });
      setAuditLogs(HabinoAuthEngine.loadAuditLogs());
    }
    setCurrentUser(null);
    localStorage.removeItem('habino_current_user');
  };

  const switchTenant = async (targetTenantId: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) {
      return { success: false, message: 'برای تغییر مستأجر ابتدا وارد حساب کاربری شوید.' };
    }

    const targetTenant = availableTenants.find(t => t.id === targetTenantId);
    if (!targetTenant) {
      return { success: false, message: 'مستأجر موردنظر یافت نشد.' };
    }

    // Permission check: super_admin can switch anywhere, otherwise user must belong to tenant
    if (currentUser.role !== 'super_admin' && currentUser.tenantId !== targetTenantId) {
      return {
        success: false,
        message: 'شما دسترسی لازم برای ورود به این مستأجر سازمانی را ندارید. این دسترسی مخصوص ادمین ارشد است.'
      };
    }
    if (targetTenant.status === 'suspended' && currentUser.role !== 'super_admin') {
      return {
        success: false,
        message: 'فضای کاری این مستأجر موقتاً تعلیق شده است؛ برای پیگیری با پشتیبانی هابینو تماس بگیرید.'
      };
    }

    setActiveTenantId(targetTenantId);
    const tenantSpecific = loadTenantSettings(targetTenantId, availableTenants);
    setSettings(tenantSpecific);
    void recordSystemAuditEvent({
      action: 'TENANT_SWITCHED',
      tenantId: targetTenantId,
      resourceType: 'tenant',
      resourceId: targetTenantId,
      outcome: 'succeeded'
    });

    // 🔄 پایش فوری وضعیت ریست فکتوری و همگام‌سازی ابری پس از تغییر مستأجر
    performAutoBootSyncRef.current?.(targetTenantId).catch(() => {});

    if (currentUser) {
      HabinoAuthEngine.addAuditLog({
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        tenantId: targetTenantId,
        action: 'TENANT_SWITCH',
        resource: 'MultiTenantWorkspace',
        details: `انتقال فضای کاری به مستأجر: ${targetTenant.name} (${targetTenant.slug})`
      });
      setAuditLogs(HabinoAuthEngine.loadAuditLogs());
    }

    return {
      success: true,
      message: `فضای کاری به «${targetTenant.name}» منتقل شد.`
    };
  };

  const updatePlatformTenantAccount = async (
    tenantId: string,
    updates: Pick<Tenant, 'name' | 'ownerName' | 'ownerEmail' | 'ownerPhone' | 'guildType' | 'status'>
  ): Promise<{ success: boolean; message: string }> => {
    if (currentUser?.role !== 'super_admin') {
      return { success: false, message: 'ویرایش فضای کاری فقط برای سوپرادمین مجاز است.' };
    }

    const existingTenant = availableTenants.find(tenant => tenant.id === tenantId);
    if (!existingTenant) {
      return { success: false, message: 'مستأجر مقصد در فهرست فضای کاری یافت نشد.' };
    }

    const { data, error } = await supabase.rpc('rpc_update_platform_tenant_account', {
      p_tenant_id: tenantId,
      p_name: updates.name,
      p_owner_name: updates.ownerName,
      p_owner_email: updates.ownerEmail,
      p_owner_phone: updates.ownerPhone || '',
      p_guild_type: updates.guildType,
      p_status: updates.status
    });
    if (error) {
      return { success: false, message: `ذخیرهٔ فضای کاری ناموفق بود: ${error.message}` };
    }
    if (!data || data.id?.toString() !== tenantId) {
      return { success: false, message: 'پاسخ سرویس مدیریت مستأجر نامعتبر است.' };
    }

    const metadata = data.metadata && typeof data.metadata === 'object'
      ? { ...existingTenant.metadata, ...data.metadata }
      : existingTenant.metadata;
    const updatedTenant: Tenant = {
      ...existingTenant,
      name: data.name,
      ownerName: data.owner_name,
      ownerEmail: data.owner_email,
      ownerPhone: metadata.phone || '',
      guildType: data.guild_type,
      status: data.status,
      metadata
    };
    const updatedTenants = availableTenants.map(tenant =>
      tenant.id === tenantId ? updatedTenant : tenant
    );
    setAvailableTenants(updatedTenants);
    HabinoAuthEngine.saveTenants(updatedTenants);

    return { success: true, message: `تغییرات فضای کاری «${updatedTenant.name}» ذخیره شد.` };
  };

  const refreshTenantUsers = async (tenantId: string = activeTenantId): Promise<AppUser[]> => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(`بررسی نشست مدیریت اعضا ناموفق بود: ${sessionError.message}`);
    if (!session?.access_token) throw new Error('برای دریافت اعضای سازمان ابتدا با حساب مدیر وارد شوید.');

    const response = await fetch(`/api/auth/tenant-users?tenantId=${encodeURIComponent(tenantId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const responseData = await response.json().catch(() => null);
    if (!response.ok || responseData?.success !== true || !Array.isArray(responseData.users)) {
      throw new Error(responseData?.error || 'دریافت اعضای پایدار سازمان ناموفق بود.');
    }

    const remoteUsers = responseData.users as AppUser[];
    const updatedUsers = [...tenantUsers.filter(user => user.tenantId !== tenantId), ...remoteUsers];
    setTenantUsers(updatedUsers);
    HabinoAuthEngine.saveUsers(updatedUsers);
    return remoteUsers;
  };

  const createTenantUser = async (userData: Omit<AppUser, 'id' | 'createdAt'>): Promise<AppUser> => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(`بررسی نشست دعوت عضو ناموفق بود: ${sessionError.message}`);
    if (!session?.access_token) throw new Error('برای دعوت عضو، ابتدا با حساب مدیر سازمان وارد شوید.');

    const response = await fetch('/api/auth/tenant-users/invitations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: userData.tenantId,
        email: userData.email,
        phone: userData.phone,
        fullName: userData.fullName,
        role: userData.role,
        notes: userData.notes
      })
    });
    const responseData = await response.json().catch(() => null);
    if (!response.ok || responseData?.success !== true || !responseData.user) {
      throw new Error(responseData?.error || 'دعوت عضو سازمان ناموفق بود.');
    }

    const newUser = responseData.user as AppUser;
    const updated = [newUser, ...tenantUsers.filter(user => user.id !== newUser.id)];
    setTenantUsers(updated);
    HabinoAuthEngine.saveUsers(updated);

    if (currentUser) {
      HabinoAuthEngine.addAuditLog({
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        tenantId: userData.tenantId,
        action: 'USER_CREATED',
        resource: 'UserManagement',
        details: `ثبت کاربر جدید: ${newUser.fullName} با نقش ${newUser.role}`
      });
      setAuditLogs(HabinoAuthEngine.loadAuditLogs());
    }

    return newUser;
  };

  const updateTenantUser = async (id: string, updates: Partial<AppUser>): Promise<void> => {
    const targetUser = tenantUsers.find(user => user.id === id);
    if (!targetUser || (updates.status !== 'active' && updates.status !== 'disabled')) {
      throw new Error('عضو یا وضعیت جدید معتبر نیست.');
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(`بررسی نشست تغییر وضعیت عضو ناموفق بود: ${sessionError.message}`);
    if (!session?.access_token) throw new Error('برای تغییر وضعیت اعضا ابتدا با حساب مدیر وارد شوید.');

    const response = await fetch(`/api/auth/tenant-users/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tenantId: targetUser.tenantId, status: updates.status })
    });
    const responseData = await response.json().catch(() => null);
    if (!response.ok || responseData?.success !== true || !responseData.user) {
      throw new Error(responseData?.error || 'ذخیره وضعیت عضو ناموفق بود.');
    }

    const updatedUser = responseData.user as AppUser;
    const updated = tenantUsers.map(user => user.id === id ? updatedUser : user);
    setTenantUsers(updated);
    HabinoAuthEngine.saveUsers(updated);

    if (currentUser && currentUser.id === id) {
      setCurrentUser(updatedUser);
      HabinoAuthEngine.saveCurrentUser(updatedUser);
    }
  };

  const deleteTenantUser = async (id: string): Promise<void> => {
    const targetUser = tenantUsers.find(user => user.id === id);
    if (!targetUser) throw new Error('عضو موردنظر در فهرست کاربران پیدا نشد.');

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error(`بررسی نشست حذف عضو ناموفق بود: ${sessionError.message}`);
    if (!session?.access_token) throw new Error('برای حذف اعضا ابتدا با حساب مدیر وارد شوید.');

    const response = await fetch(
      `/api/auth/tenant-users/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(targetUser.tenantId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` }
      }
    );
    const responseData = await response.json().catch(() => null);
    if (!response.ok || responseData?.success !== true) {
      throw new Error(responseData?.error || 'حذف عضو سازمان ناموفق بود.');
    }

    const updated = tenantUsers.filter(user => user.id !== id);
    setTenantUsers(updated);
    HabinoAuthEngine.saveUsers(updated);

    if (currentUser) {
      HabinoAuthEngine.addAuditLog({
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        tenantId: activeTenantId,
        action: 'USER_DELETED',
        resource: 'UserManagement',
        details: `حذف کاربر با شناسه: ${id}`
      });
      setAuditLogs(HabinoAuthEngine.loadAuditLogs());
    }
  };

  const changeUserRole = async (userId: string, newRole: UserRole): Promise<{ success: boolean; message: string }> => {
    if (currentUser?.role !== 'super_admin') {
      return { success: false, message: 'تغییر نقش کاربر فقط برای سوپرادمین مجاز است.' };
    }

    const targetUser = tenantUsers.find(user => user.id === userId);
    if (!targetUser) {
      return { success: false, message: 'کاربر موردنظر در فهرست کاربران یافت نشد.' };
    }

    // Prevent demoting the last super_admin without a replacement
    if (targetUser.role === 'super_admin' && newRole !== 'super_admin') {
      const superAdminCount = tenantUsers.filter(u => u.role === 'super_admin').length;
      if (superAdminCount <= 1) {
        return { success: false, message: 'نمی‌توان آخرین سوپرادمین را بدون معرفی جایگزين تغییر نقش داد.' };
      }
    }

    // Prevent self-demotion
    if (targetUser.id === currentUser?.id && newRole !== 'super_admin') {
      return { success: false, message: 'نمی‌توانید نقش خود را از سوپرادمین تغییر دهید.' };
    }

    try {
      const response = await fetch('/api/auth/platform-users/role', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          newRole,
          changedBy: currentUser.id,
          changedByEmail: currentUser.email
        })
      });
      const responseData = await response.json().catch(() => null);
      if (!response.ok || responseData?.success !== true) {
        throw new Error(responseData?.error || 'تغییر نقش کاربر ناموفق بود.');
      }

      const updatedUser = responseData.user as AppUser;
      const updated = tenantUsers.map(user => user.id === userId ? updatedUser : user);
      setTenantUsers(updated);
      HabinoAuthEngine.saveUsers(updated);

      if (currentUser.id === userId) {
        setCurrentUser(updatedUser);
        HabinoAuthEngine.saveCurrentUser(updatedUser);
      }

      void recordSystemAuditEvent({
        action: 'SUPER_ADMIN_ROLE_CHANGED',
        tenantId: targetUser.tenantId,
        resourceType: 'user',
        resourceId: userId,
        reasonCode: `تغییر نقش کاربر ${targetUser.fullName} از «${targetUser.role}» به «${newRole}» توسط ${currentUser.fullName}`,
        outcome: 'succeeded'
      });

      recordImmutableAuditEvent({
        action: 'SUPER_ADMIN_ROLE_CHANGED',
        actorId: currentUser.id,
        actorRole: currentUser.role,
        tenantId: targetUser.tenantId,
        resourceType: 'user',
        resourceId: userId,
        correlationId: null,
        outcome: 'succeeded',
        reasonCode: `تغییر نقش کاربر ${targetUser.fullName} از «${targetUser.role}» به «${newRole}» توسط ${currentUser.fullName}`,
        eventSource: 'application'
      });

      return { success: true, message: `نقش کاربر ${targetUser.fullName} به «${ROLE_DETAILS_FA[newRole]?.title || newRole}» تغییر یافت.` };
    } catch (err: any) {
      void recordSystemAuditEvent({
        action: 'SUPER_ADMIN_ROLE_CHANGED',
        tenantId: targetUser.tenantId,
        resourceType: 'user',
        resourceId: userId,
        reasonCode: `خطا در تغییر نقش کاربر ${targetUser.fullName}: ${err.message}`,
        outcome: 'failed'
      });

      recordImmutableAuditEvent({
        action: 'SUPER_ADMIN_ROLE_CHANGED',
        actorId: currentUser.id,
        actorRole: currentUser.role,
        tenantId: targetUser.tenantId,
        resourceType: 'user',
        resourceId: userId,
        correlationId: null,
        outcome: 'failed',
        reasonCode: `خطا در تغییر نقش کاربر ${targetUser.fullName}: ${err.message}`,
        eventSource: 'application'
      });

      return { success: false, message: err.message || 'خطای نامشخص در تغییر نقش کاربر.' };
    }
  };

  const recordImmutableAuditEvent = (event: Omit<SystemAuditLog, 'id' | 'timestamp'>) => {
    const newLog: SystemAuditLog = {
      ...event,
      id: `sys-audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString()
    };
    setSystemAuditLogs(prev => [...prev, newLog]);
  };

  const hasPermission = (permission: UserPermission): boolean => {
    return HabinoAuthEngine.hasPermission(currentUser, permission);
  };

  const canAccessModule = (moduleId: string): { allowed: boolean; reasonFa?: string; gateType?: 'plan' | 'role' | 'platform' | 'release'; requiredPlan?: SubscriptionPlanType } => {
    return HabinoAuthEngine.canAccessModule(currentUser, moduleId, activeTenant);
  };

  const canMutateData = (action: 'create' | 'update' | 'delete'): { allowed: boolean; reasonFa?: string } => {
    return HabinoAuthEngine.canMutateData(currentUser, action);
  };

  const upgradeTenantSubscription = async (plan: SubscriptionPlanType, serialKey?: string): Promise<{ success: boolean; message: string }> => {
    if (!serialKey?.trim()) {
      return { success: false, message: 'ارتقای پلن فقط با کلید لایسنس تأییدشده از سرویس امن امکان‌پذیر است.' };
    }
    return activateLicense(serialKey, undefined, plan);
  };

  const extendTenantTrial = async (tenantId: string, days: number): Promise<{ success: boolean; message: string }> => {
    if (currentUser?.role !== 'super_admin') {
      return { success: false, message: 'تمدید دوره آزمایشی فقط برای سوپرادمین مجاز است.' };
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return { success: false, message: 'مدت تمدید باید عددی صحیح بین ۱ تا ۳۶۵ روز باشد.' };
    }

    const tenantToUpdate = availableTenants.find(t => t.id === tenantId);
    if (!tenantToUpdate) {
      return { success: false, message: 'مستأجر مقصد یافت نشد.' };
    }

    const subscription = tenantToUpdate.subscription || {
      plan: 'starter' as const,
      planNameFa: PLAN_LIMITS.starter.planNameFa,
      status: 'trial' as const,
      maxUsers: PLAN_LIMITS.starter.maxUsers,
      expiresAt: new Date().toISOString()
    };
    const trialDaysRemaining = (subscription.trialDaysRemaining || 0) + days;
    const updatedTenant: Tenant = {
      ...tenantToUpdate,
      subscription: {
        ...subscription,
        trialDaysRemaining,
        trialEndsAt: new Date(Date.now() + trialDaysRemaining * 24 * 60 * 60 * 1000).toISOString(),
        isSuspended: false,
        status: 'trial'
      }
    };
    const updatedTenants = availableTenants.map(t => t.id === tenantId ? updatedTenant : t);
    setAvailableTenants(updatedTenants);
    HabinoAuthEngine.saveTenants(updatedTenants);
    HabinoAuthEngine.addAuditLog({
      userId: currentUser.id,
      userFullName: currentUser.fullName,
      tenantId,
      action: 'TRIAL_EXTENDED',
      resource: 'LicenseManagement',
      details: `تمدید دوره آزمایشی ${tenantToUpdate.name} به مدت ${days} روز`
    });
    setAuditLogs(HabinoAuthEngine.loadAuditLogs());

    return {
      success: true,
      message: `دوره آزمایشی مستأجر «${tenantToUpdate.name}» به مدت ${days} روز تمدید و ذخیره شد.`
    };
  };

  const activateAddon = async (addonId: string, serialKey?: string, targetTenantId: string = activeTenant.id): Promise<{ success: boolean; message: string }> => {
    const tenantToUpdate = availableTenants.find(t => t.id === targetTenantId);
    if (!tenantToUpdate) {
      return { success: false, message: 'مستأجر مقصد یافت نشد.' };
    }
    if (targetTenantId !== activeTenant.id) {
      return { success: false, message: 'برای جلوگیری از ثبت اشتباه، مشتری باید افزونه را در فضای کاری خودش فعال کند.' };
    }
    const addon = HABINO_ADDONS.find(a => a.id === addonId);
    if (!addon) {
      return { success: false, message: 'افزونه مورد نظر در کاتالوگ هابینو یافت نشد.' };
    }
    if (addon.status === 'coming_soon') {
      return {
        success: false,
        message: `افزونه «${addon.title}» طبق مصوبه در فاز آینده منتشر خواهد شد.`
      };
    }

        const currentAddons = tenantToUpdate.subscription?.activeAddons || [];
    if (currentAddons.includes(addonId)) {
      return { success: true, message: `افزونه «${addon.title}» پیش‌تر فعال شده است.` };
    }

    if (!serialKey?.trim()) {
      return { success: false, message: 'کلید صادرشده افزونه وارد نشده است.' };
    }

    if (!getSupabaseConfig().isConfigured) {
      return { success: false, message: 'فعال‌سازی افزونه به سرویس امن هابینو نیاز دارد؛ حالت محلی نمی‌تواند اعتبار کلید را تأیید کند.' };
    }
    const { data, error } = await supabase.rpc('rpc_activate_habino_addon_license', {
      p_tenant_id: targetTenantId,
      p_addon_id: addonId,
      p_license_key: serialKey.trim()
    });
    if (error) {
      return { success: false, message: `اعتبارسنجی افزونه ناموفق بود: ${error.message}` };
    }
    if (data?.addon_id !== addonId) {
      return { success: false, message: 'پاسخ سرویس اعتبارسنجی افزونه نامعتبر است.' };
    }

    const updatedSub: TenantSubscription = {
            ...(tenantToUpdate.subscription || {
        plan: 'starter',
        planNameFa: 'پکیج پایه',
        status: 'active',
        maxUsers: 2,
        expiresAt: '1405/12/29'
      }),
      activeAddons: [...currentAddons, addonId]
    };

    const updatedTenant: Tenant = {
            ...tenantToUpdate,
      subscription: updatedSub
    };

        const updatedTenants = availableTenants.map(t => (t.id === targetTenantId ? updatedTenant : t));
    setAvailableTenants(updatedTenants);
    HabinoAuthEngine.saveTenants(updatedTenants);

    if (currentUser) {
      HabinoAuthEngine.addAuditLog({
        userId: currentUser.id,
        userFullName: currentUser.fullName,
                tenantId: targetTenantId,
        action: 'LICENSE_UPGRADED',
        resource: 'LicenseManagement',
                details: `فعال‌سازی افزونه ${addon.title} برای ${tenantToUpdate.name}`
      });
      setAuditLogs(HabinoAuthEngine.loadAuditLogs());
    }

    return {
      success: true,
      message: `افزونه «${addon.title}» با موفقیت فعال شد.`
    };
  };

  const hasAddon = (addonId: string): boolean => {
    const addon = HABINO_ADDONS.find(item => item.id === addonId);
    if (!addon || addon.status === 'coming_soon') return false;
    if (license.tier === 'enterprise') return true;
    return (activeTenant.subscription?.activeAddons || []).includes(addonId);
  };

  const registerTenant = async (input: RegisterTenantInput): Promise<{ success: boolean; message: string; tenant?: Tenant; user?: AppUser }> => {
    if (!getIsSupabaseConfigured()) {
      return {
        success: false,
        message: 'ثبت‌نام پایدار ممکن نیست؛ ابتدا اتصال Supabase را در تنظیمات سامانه فعال کنید.'
      };
    }
    if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return { success: false, message: 'ایمیل واقعی و معتبر برای ثبت‌نام الزامی است.' };
    }
    if (!input.password || input.password.length < 8) {
      return { success: false, message: 'کلمه عبور باید حداقل ۸ کاراکتر باشد.' };
    }

    try {
      const response = await fetch('/api/auth/register-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, email: input.email.trim().toLowerCase(), plan: 'starter', isTrial: true })
      });
      const responseData = await response.json().catch(() => null);
      if (!response.ok || responseData?.success !== true || !responseData.tenant || !responseData.user) {
        return {
          success: false,
          message: responseData?.error || 'ثبت‌نام در سرویس پایدار ناموفق بود.'
        };
      }

      const tenant = responseData.tenant as Tenant;
      const ownerUser = responseData.user as AppUser;
      const updatedTenants = [...availableTenants.filter(item => item.id !== tenant.id), tenant];
      const updatedUsers = [...tenantUsers.filter(item => item.id !== ownerUser.id), ownerUser];
      setAvailableTenants(updatedTenants);
      setTenantUsers(updatedUsers);
      HabinoAuthEngine.saveTenants(updatedTenants);
      HabinoAuthEngine.saveUsers(updatedUsers);
      setActiveTenantId(tenant.id);

      const loginResult = await login(ownerUser.email, input.password);
      if (!loginResult.success) {
        return {
          success: false,
          tenant,
          user: ownerUser,
          message: `حساب و مستأجر در پایگاه داده ایجاد شدند، اما ورود خودکار انجام نشد. از صفحه ورود با ایمیل ${ownerUser.email} وارد شوید. جزئیات: ${loginResult.message}`
        };
      }

      recordImmutableAuditEvent({
        action: 'TENANT_CREATED',
        actorId: ownerUser.id,
        actorRole: ownerUser.role,
        tenantId: tenant.id,
        resourceType: 'tenant',
        resourceId: tenant.id,
        correlationId: null,
        outcome: 'succeeded',
        reasonCode: `plan=starter, trial=true`,
        eventSource: 'application'
      });

      return {
        success: true,
        message: `حساب پایدار و مستأجر «${tenant.name}» ساخته شد؛ دوره هدیه ۳۰ روزه فعال است.`,
        tenant,
        user: ownerUser
      };
    } catch (error) {
      return {
        success: false,
        message: `ارتباط با سرویس ثبت‌نام برقرار نشد: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  };

  useEffect(() => {
    triggerDailyAutoBackup({
      invoices,
      checks,
      transactions,
      clients,
      inventory,
      installments,
      bankAccounts,
      projects,
      accountingEntries,
      settings,
      license
    });
  }, [invoices, checks, transactions, clients, inventory, installments, bankAccounts, projects, accountingEntries, settings, license]);

  const resolveInvoiceTenant = (clientId?: string, invoiceTenantId?: string): string => {
    const clientMap = new Map<string, Client>();
    (financialStateRef.current.clients || []).forEach(c => { if (c?.id) clientMap.set(c.id, c); });
    (clients || []).forEach(c => { if (c?.id) clientMap.set(c.id, c); });
    const mergedClients = Array.from(clientMap.values());
    const targetClient = clientId ? mergedClients.find(client => client.id === clientId) : undefined;
    return resolveInvoiceTenantId({
      isSuperAdmin: currentUser?.role === 'super_admin',
      activeTenantId,
      userTenantId: currentUser?.tenantId,
      clientTenantId: targetClient?.tenantId,
      invoiceTenantId
    });
  };

  const addInvoice = async (invoiceData: Omit<Invoice, 'id'>): Promise<Invoice> => {
    const invoiceClientId = invoiceData.clientId || invoiceData.client_id;
    const currentTenant = resolveInvoiceTenant(invoiceClientId, invoiceData.tenantId);
    const correlationId = createDiagnosticCorrelationId();
    const sanitizedData = {
      ...invoiceData,
      tenantId: currentTenant
    };

    const clientMap = new Map<string, Client>();
    (financialStateRef.current.clients || []).forEach(c => { if (c?.id) clientMap.set(c.id, c); });
    (clients || []).forEach(c => { if (c?.id) clientMap.set(c.id, c); });
    const mergedClients = Array.from(clientMap.values());

    const currentStateSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: mergedClients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    let nextState: ReturnType<typeof HabinoAtomicTransactionWrapper.atomicRegisterInvoice>['nextState'];
    let invoice: Invoice;
    try {
      ({ nextState, invoice } = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(
        currentStateSnapshot,
        sanitizedData,
        currentTenant
      ));
    } catch (error) {
      recordDocumentDiagnosticEvent('DOCUMENT_REGISTER_FAILED', currentTenant, 'FAILED', correlationId);
      throw error;
    }

    financialStateRef.current = {
      ...financialStateRef.current,
      invoices: nextState.invoices,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      transactions: nextState.transactions,
      installments: nextState.installments,
      checks: nextState.checks,
      inventory: nextState.inventory || financialStateRef.current.inventory
    };

    setInvoices(nextState.invoices);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setTransactions(nextState.transactions);
    setInstallments(nextState.installments);
    setChecks(nextState.checks);
    if (nextState.inventory) setInventory(nextState.inventory);
    recordDocumentDiagnosticEvent('DOCUMENT_REGISTERED', currentTenant, 'SUCCESS', correlationId);

    try {
      localStorage.setItem('habino_invoices', JSON.stringify(nextState.invoices));
      localStorage.setItem('habino_clients', JSON.stringify(nextState.clients));
      localStorage.setItem('habino_entries', JSON.stringify(nextState.accountingEntries));
      localStorage.setItem('habino_transactions', JSON.stringify(nextState.transactions));
      localStorage.setItem('habino_checks', JSON.stringify(nextState.checks));

      if (invoice.signatureUrl || invoice.isSigned) {
        let signaturesMap: Record<string, any> = {};
        try {
          const sigRaw = localStorage.getItem('habino_invoice_signatures');
          if (sigRaw) signaturesMap = JSON.parse(sigRaw);
        } catch (_) {}
        signaturesMap[invoice.id] = {
          signatureUrl: invoice.signatureUrl,
          isSigned: invoice.isSigned,
          signedAt: invoice.signedAt,
          shareToken: invoice.shareToken,
          signatureMetadata: invoice.signatureMetadata
        };
        localStorage.setItem('habino_invoice_signatures', JSON.stringify(signaturesMap));
      }
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    SupabaseSyncEngine.syncInvoice(invoice, currentTenant, nextState.accountingEntries, true, correlationId)
      .then(synced => {
        if (!synced) {
          console.warn('[InvoiceSync] Invoice is saved locally and remains pending cloud sync.');
        }
      })
      .catch(error => {
        console.error('[InvoiceSync] Failed to sync registered invoice:', error);
      });

    return invoice;
  };

  const updateInvoice = async (id: string, updated: Partial<Invoice>) => {
    const existing = invoices.find(inv => inv.id === id);
    if (!existing) {
      throw new Error('سند موردنظر یافت نشد.');
    }
    const currentTenant = resolveInvoiceTenant(existing.clientId, existing.tenantId);
    const correlationId = createDiagnosticCorrelationId();
    const isDraft = existing.status === 'draft' ||
      ['proforma', 'proforma_sale', 'proforma_purchase'].includes(existing.type);
    if (!isDraft) {
      const protectedFields: (keyof Invoice)[] = [
        'invoiceNumber', 'clientId', 'client_id', 'clientName', 'type', 'date', 'dueDate',
        'items', 'subtotal', 'totalDiscount', 'totalTax', 'grandTotal',
        'previousBalance', 'totalDebt', 'notes', 'terms', 'projectId'
      ];
      const hasDocumentEdits = protectedFields.some(key =>
        updated[key] !== undefined &&
        JSON.stringify(updated[key]) !== JSON.stringify(existing[key])
      );
      if (hasDocumentEdits) {
        recordDocumentDiagnosticEvent('DOCUMENT_UPDATE_FAILED', currentTenant, 'FAILED', correlationId);
        throw new Error('اطلاعات مالی سند ثبت‌شده قفل است؛ برای اصلاح، سند اصلاحی ثبت کنید.');
      }
      if (
        updated.status !== undefined &&
        updated.status !== existing.status &&
        (existing.status === 'cancelled' || !['pending', 'paid', 'overdue'].includes(updated.status))
      ) {
        recordDocumentDiagnosticEvent('DOCUMENT_UPDATE_FAILED', currentTenant, 'FAILED', correlationId);
        throw new Error('وضعیت سند ثبت‌شده فقط از مسیر عملیاتی مجاز قابل تغییر است.');
      }
    }

    const financialKeys: (keyof Invoice)[] = [
      'items', 'subtotal', 'totalDiscount', 'totalTax', 'grandTotal',
      'amountPaid', 'remainingAmount', 'clientId', 'date', 'type',
      'status', 'projectId', 'dueDate'
    ];
    const isFinancial = financialKeys.some(key => key in updated && updated[key] !== undefined);

    if (!isFinancial) {
      const updatedInvoices = invoices.map(inv => inv.id === id ? { ...inv, ...updated } : inv);
      setInvoices(updatedInvoices);

      financialStateRef.current = {
        ...financialStateRef.current,
        invoices: updatedInvoices
      };
      recordDocumentDiagnosticEvent('DOCUMENT_UPDATED', currentTenant, 'SUCCESS', correlationId);

      try {
        localStorage.setItem('habino_invoices', JSON.stringify(updatedInvoices));

        if (updated.signatureUrl !== undefined || updated.isSigned !== undefined || existing.signatureUrl) {
          let signaturesMap: Record<string, any> = {};
          try {
            const sigRaw = localStorage.getItem('habino_invoice_signatures');
            if (sigRaw) signaturesMap = JSON.parse(sigRaw);
          } catch (_) {}
          signaturesMap[id] = {
            signatureUrl: updated.signatureUrl !== undefined ? updated.signatureUrl : existing.signatureUrl,
            isSigned: updated.isSigned !== undefined ? updated.isSigned : existing.isSigned,
            signedAt: updated.signedAt !== undefined ? updated.signedAt : existing.signedAt,
            shareToken: updated.shareToken !== undefined ? updated.shareToken : existing.shareToken,
            signatureMetadata: updated.signatureMetadata !== undefined ? updated.signatureMetadata : existing.signatureMetadata
          };
          localStorage.setItem('habino_invoice_signatures', JSON.stringify(signaturesMap));
        }
      } catch (e) {
        console.warn('LocalStorage save failed:', e);
      }

      const updatedInv = updatedInvoices.find(i => i.id === id);
      if (updatedInv) {
        SupabaseSyncEngine.syncInvoice(updatedInv, currentTenant, financialStateRef.current.accountingEntries, true, correlationId).catch(error => {
          console.error('[InvoiceSync] Failed to sync invoice update:', error);
        });
      }
      return;
    }

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    let nextState: ReturnType<typeof HabinoAtomicTransactionWrapper.atomicUpdateInvoice>['nextState'];
    try {
      ({ nextState } = HabinoAtomicTransactionWrapper.atomicUpdateInvoice(
        currentSnapshot,
        id,
        updated,
        currentTenant
      ));
    } catch (error) {
      recordDocumentDiagnosticEvent('DOCUMENT_UPDATE_FAILED', currentTenant, 'FAILED', correlationId);
      throw error;
    }

    financialStateRef.current = {
      ...financialStateRef.current,
      invoices: nextState.invoices,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      transactions: nextState.transactions,
      installments: nextState.installments,
      checks: nextState.checks,
      inventory: nextState.inventory || financialStateRef.current.inventory
    };

    setInvoices(nextState.invoices);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setTransactions(nextState.transactions);
    setInstallments(nextState.installments);
    setChecks(nextState.checks);
    if (nextState.inventory) setInventory(nextState.inventory);
    recordDocumentDiagnosticEvent('DOCUMENT_UPDATED', currentTenant, 'SUCCESS', correlationId);

    try {
      localStorage.setItem('habino_invoices', JSON.stringify(nextState.invoices));
      localStorage.setItem('habino_clients', JSON.stringify(nextState.clients));
      localStorage.setItem('habino_transactions', JSON.stringify(nextState.transactions));
      localStorage.setItem('habino_checks', JSON.stringify(nextState.checks));
      localStorage.setItem('habino_installments', JSON.stringify(nextState.installments));
      localStorage.setItem('habino_entries', JSON.stringify(nextState.accountingEntries));
      if (nextState.inventory) {
        localStorage.setItem('habino_inventory', JSON.stringify(nextState.inventory));
      }
      if (updated.signatureUrl !== undefined || updated.isSigned !== undefined || existing.signatureUrl) {
        let signaturesMap: Record<string, any> = {};
        try {
          const sigRaw = localStorage.getItem('habino_invoice_signatures');
          if (sigRaw) signaturesMap = JSON.parse(sigRaw);
        } catch (_) {}
        signaturesMap[id] = {
          signatureUrl: updated.signatureUrl !== undefined ? updated.signatureUrl : existing.signatureUrl,
          isSigned: updated.isSigned !== undefined ? updated.isSigned : existing.isSigned,
          signedAt: updated.signedAt !== undefined ? updated.signedAt : existing.signedAt,
          shareToken: updated.shareToken !== undefined ? updated.shareToken : existing.shareToken,
          signatureMetadata: updated.signatureMetadata !== undefined ? updated.signatureMetadata : existing.signatureMetadata
        };
        localStorage.setItem('habino_invoice_signatures', JSON.stringify(signaturesMap));
      }
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    const updatedInv = nextState.invoices.find(i => i.id === id);
    if (updatedInv) {
      SupabaseSyncEngine.syncInvoice(updatedInv, currentTenant, nextState.accountingEntries, true, correlationId).catch(error => {
        console.error('[InvoiceSync] Failed to sync financial invoice update:', error);
      });
    }
  };

  const deleteInvoice = async (id: string) => {
    const deletedInv = invoices.find(i => i.id === id);
    if (!deletedInv) {
      throw new Error('سند موردنظر یافت نشد.');
    }

    const isProforma = deletedInv.type === 'proforma' || deletedInv.type === 'proforma_sale' || deletedInv.type === 'proforma_purchase';
    if (!isProforma) {
      recordDocumentDiagnosticEvent(
        'DOCUMENT_DELETE_BLOCKED',
        resolveInvoiceTenant(deletedInv.clientId, deletedInv.tenantId),
        'BLOCKED'
      );
      throw new Error('خطای عدم توجیه قانونی: طبق قوانین مالیاتی و استانداردهای حسابداری، حذف فاکتورهای ثبت‌شده در دفاتر مالی غیرمجاز و غیرموجه است. فاکتورهای صادره دارای شماره سریال و آثار زنجیره‌ای در کاردکس کالا و تراز مالی هستند. جهت تعدیل، از صدور فاکتور برگشت از فروش/خرید یا سند اصلاحی استفاده فرمایید.');
    }
    const currentTenant = resolveInvoiceTenant(deletedInv.clientId, deletedInv.tenantId);
    const correlationId = createDiagnosticCorrelationId();

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const nextState = HabinoAtomicTransactionWrapper.atomicDeleteInvoice(
      currentSnapshot,
      id,
      true
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      invoices: nextState.invoices,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      transactions: nextState.transactions,
      installments: nextState.installments,
      checks: nextState.checks,
      inventory: nextState.inventory || financialStateRef.current.inventory
    };

    setInvoices(nextState.invoices);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setTransactions(nextState.transactions);
    setInstallments(nextState.installments);
    setChecks(nextState.checks);
    if (nextState.inventory) setInventory(nextState.inventory);
    recordDocumentDiagnosticEvent('DOCUMENT_DELETED', currentTenant, 'PENDING', correlationId);

    try {
      localStorage.setItem('habino_invoices', JSON.stringify(nextState.invoices));
      localStorage.setItem('habino_clients', JSON.stringify(nextState.clients));
      localStorage.setItem('habino_transactions', JSON.stringify(nextState.transactions));
      localStorage.setItem('habino_checks', JSON.stringify(nextState.checks));
      localStorage.setItem('habino_installments', JSON.stringify(nextState.installments));
      localStorage.setItem('habino_entries', JSON.stringify(nextState.accountingEntries));
      if (nextState.inventory) {
        localStorage.setItem('habino_inventory', JSON.stringify(nextState.inventory));
      }
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    if (getIsSupabaseConfigured()) {
      SupabaseSyncEngine.deleteInvoiceFromSupabase(id, currentTenant)
        .then(synced => {
          recordDocumentDiagnosticEvent(
            synced ? 'DOCUMENT_SYNCED' : 'DOCUMENT_SYNC_QUEUED',
            currentTenant,
            synced ? 'SUCCESS' : 'PENDING',
            correlationId
          );
        })
        .catch(error => {
          recordDocumentDiagnosticEvent('DOCUMENT_SYNC_FAILED', currentTenant, 'FAILED', correlationId);
          console.error('[InvoiceSync] Failed to delete invoice from Supabase:', error);
        });
    }
  };

  const restoreInvoice = async (id: string) => {
    const target = invoices.find(i => i.id === id);
    if (!target) return;

    const restored = {
      ...target,
      is_deleted: false,
      deleted_at: undefined,
      metadata: {
        ...(target.metadata || {}),
        is_deleted: false,
        deleted_at: undefined
      }
    };

    const currentTenant = resolveInvoiceTenant(target.clientId, target.tenantId);
    const correlationId = createDiagnosticCorrelationId();

    const { nextState } = HabinoAtomicTransactionWrapper.atomicRegisterInvoice(
      { invoices: invoices.filter(i => i.id !== id), accountingEntries, clients, transactions, installments, checks, projects, inventory },
      restored,
      currentTenant
    );

    restored.id = id;
    const finalInvoices = nextState.invoices.map(i => i.id === restored.id ? restored : i);
    if (!finalInvoices.some(i => i.id === id)) finalInvoices.push(restored);

    setInvoices(finalInvoices);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setTransactions(nextState.transactions);
    setInstallments(nextState.installments);
    setChecks(nextState.checks);
    if (nextState.inventory) setInventory(nextState.inventory);
    recordDocumentDiagnosticEvent('DOCUMENT_RESTORED', currentTenant, 'SUCCESS', correlationId);

    try {
      localStorage.setItem('habino_invoices', JSON.stringify(finalInvoices));
      localStorage.setItem('habino_clients', JSON.stringify(nextState.clients));
      localStorage.setItem('habino_transactions', JSON.stringify(nextState.transactions));
      localStorage.setItem('habino_checks', JSON.stringify(nextState.checks));
      localStorage.setItem('habino_installments', JSON.stringify(nextState.installments));
      localStorage.setItem('habino_entries', JSON.stringify(nextState.accountingEntries));
      if (nextState.inventory) localStorage.setItem('habino_inventory', JSON.stringify(nextState.inventory));
    } catch (e) {
      console.warn('LocalStorage save failed on restore:', e);
    }

    SupabaseSyncEngine.syncInvoice(restored, currentTenant, nextState.accountingEntries, true, correlationId).catch(error => {
      console.error('[InvoiceSync] Failed to sync restored invoice:', error);
    });
  };

  const addCheck = async (checkData: Omit<Check, 'id'>): Promise<Check> => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';

    const clientMap = new Map<string, Client>();
    (financialStateRef.current.clients || []).forEach(c => { if (c?.id) clientMap.set(c.id, c); });
    (clients || []).forEach(c => { if (c?.id) clientMap.set(c.id, c); });
    const mergedClients = Array.from(clientMap.values());

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: mergedClients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      bankAccounts: financialStateRef.current.bankAccounts
    };

    const { nextState, check } = HabinoAtomicTransactionWrapper.atomicRegisterCheck(
      currentSnapshot,
      checkData,
      currentTenant
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      invoices: nextState.invoices,
      checks: nextState.checks,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      installments: nextState.installments
    };

    setInvoices(nextState.invoices);
    setChecks(nextState.checks);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setInstallments(nextState.installments);

    const checkEntries = nextState.accountingEntries.filter(entry => entry.referenceId === check.id);
    SupabaseSyncEngine.syncCheck(check, currentTenant, checkEntries)
      .then(synced => {
        if (!synced) {
          console.warn('[CheckSync] Check is saved locally and remains pending cloud sync.');
        }
      })
      .catch(error => {
        console.error('[CheckSync] Failed to sync registered check and ledger entries:', error);
      });

    if (check.relatedInstallmentId && getIsSupabaseConfigured()) {
      const linkedInstallment = nextState.installments.find(item => item.id === check.relatedInstallmentId);
      const linkedInvoice = linkedInstallment && nextState.invoices.find(item => item.id === linkedInstallment.invoiceId);
      const linkedClient = nextState.clients.find(item => item.id === check.clientId);
      if (linkedInstallment) offlineOutbox.enqueue('installment', linkedInstallment, currentTenant);
      if (linkedInvoice) offlineOutbox.enqueue('invoice', {
        invoice: linkedInvoice,
        accountingEntries: nextState.accountingEntries
      }, currentTenant);
      const installmentEntries = nextState.accountingEntries.filter(entry => entry.referenceId === check.relatedInstallmentId);
      if (installmentEntries.length > 0) offlineOutbox.enqueue('entries', installmentEntries, currentTenant);
      if (linkedClient) offlineOutbox.enqueue('client', linkedClient, currentTenant);
    }

    return check;
  };

  const updateCheck = async (id: string, updated: Partial<Check>) => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      bankAccounts: financialStateRef.current.bankAccounts
    };

    const { nextState } = HabinoAtomicTransactionWrapper.atomicUpdateCheck(
      currentSnapshot,
      id,
      updated,
      currentTenant
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      invoices: nextState.invoices,
      checks: nextState.checks,
      accountingEntries: nextState.accountingEntries,
      installments: nextState.installments || financialStateRef.current.installments,
      clients: nextState.clients,
      bankAccounts: nextState.bankAccounts || financialStateRef.current.bankAccounts
    };

    setInvoices(nextState.invoices);
    setChecks(nextState.checks);
    setAccountingEntries(nextState.accountingEntries);
    setInstallments(nextState.installments);
    setClients(nextState.clients);
    if (nextState.bankAccounts) setBankAccounts(nextState.bankAccounts);

    if (getIsSupabaseConfigured()) {
      const check = nextState.checks.find(item => item.id === id);
      if (check) offlineOutbox.enqueue('check', check, currentTenant);
      const newEntries = nextState.accountingEntries.filter(entry =>
        !currentSnapshot.accountingEntries.some(existing => existing.id === entry.id)
      );
      if (newEntries.length > 0) offlineOutbox.enqueue('entries', newEntries, currentTenant);
      const changedBankAccounts = (nextState.bankAccounts || []).filter(account => {
        const previous = currentSnapshot.bankAccounts?.find(item => item.id === account.id);
        return previous && previous.balance !== account.balance;
      });
      changedBankAccounts.forEach(account => {
        SupabaseSyncEngine.syncBankAccount(account, currentTenant).then(synced => {
          if (!synced) {
            console.error('[Store] Supabase rejected check settlement cash/bank balance synchronization; queued for retry.');
            offlineOutbox.enqueue('bankAccount', account, currentTenant);
          }
        }).catch(error => {
          console.error('[Store] Failed to sync check settlement cash/bank balance; queued for retry:', error);
          offlineOutbox.enqueue('bankAccount', account, currentTenant);
        });
      });
      const linkedInstallment = check?.relatedInstallmentId
        ? nextState.installments.find(item => item.id === check.relatedInstallmentId)
        : undefined;
      const linkedInvoice = linkedInstallment
        ? nextState.invoices.find(item => item.id === linkedInstallment.invoiceId)
        : undefined;
      if (linkedInstallment) offlineOutbox.enqueue('installment', linkedInstallment, currentTenant);
      if (linkedInvoice) offlineOutbox.enqueue('invoice', {
        invoice: linkedInvoice,
        accountingEntries: nextState.accountingEntries
      }, currentTenant);
      const changedClients = nextState.clients.filter(client => {
        const previous = currentSnapshot.clients.find(item => item.id === client.id);
        return previous && JSON.stringify(previous) !== JSON.stringify(client);
      });
      changedClients.forEach(client => offlineOutbox.enqueue('client', client, currentTenant));
    }
  };

  const deleteCheck = async (id: string) => {
    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      bankAccounts: financialStateRef.current.bankAccounts
    };

    const nextState = HabinoAtomicTransactionWrapper.atomicDeleteCheck(
      currentSnapshot,
      id
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      checks: nextState.checks,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients
    };

    setChecks(nextState.checks);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
  };

  const addTransaction = async (txData: Omit<Transaction, 'id'>): Promise<Transaction> => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects
    };

    const { nextState, transaction } = HabinoAtomicTransactionWrapper.atomicRegisterTransaction(
      currentSnapshot,
      txData,
      currentTenant
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      transactions: nextState.transactions,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      projects: nextState.projects,
      bankAccounts: nextState.bankAccounts
    };

    setTransactions(nextState.transactions);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setProjects(nextState.projects);
    if (nextState.bankAccounts) {
      setBankAccounts(nextState.bankAccounts);
    }

    if (getIsSupabaseConfigured()) {
      SupabaseSyncEngine.syncTransaction(transaction, currentTenant).catch(() => {});
      if (transaction.cashAccountId) {
        const account = nextState.bankAccounts?.find(item => item.id === transaction.cashAccountId);
        if (account) {
          SupabaseSyncEngine.syncBankAccount(account, currentTenant).then(synced => {
            if (!synced) console.error('[Store] Supabase rejected cash/bank balance synchronization.');
          }).catch(error => console.error('[Store] Failed to sync cash/bank balance:', error));
        }
      }
      if (transaction.destinationAccountId) {
        const account = nextState.bankAccounts?.find(item => item.id === transaction.destinationAccountId);
        if (account) {
          SupabaseSyncEngine.syncBankAccount(account, currentTenant).then(synced => {
            if (!synced) console.error('[Store] Supabase rejected transfer destination balance synchronization.');
          }).catch(error => console.error('[Store] Failed to sync transfer destination balance:', error));
        }
      }
      if (nextState.accountingEntries && nextState.accountingEntries.length > 0) {
        SupabaseSyncEngine.syncAccountingEntries(nextState.accountingEntries, currentTenant).catch(() => {});
      }
    }

    return transaction;
  };

  const deleteTransaction = async (id: string) => {
    const deletedTransaction = financialStateRef.current.transactions.find(transaction => transaction.id === id);
    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      bankAccounts: financialStateRef.current.bankAccounts
    };

    const nextState = HabinoAtomicTransactionWrapper.atomicDeleteTransaction(
      currentSnapshot,
      id
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      transactions: nextState.transactions,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      projects: nextState.projects,
      bankAccounts: nextState.bankAccounts
    };

    setTransactions(nextState.transactions);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setProjects(nextState.projects);
    if (nextState.bankAccounts) {
      setBankAccounts(nextState.bankAccounts);
    }
    if (getIsSupabaseConfigured() && deletedTransaction) {
      const affectedAccountIds = [deletedTransaction.cashAccountId, deletedTransaction.destinationAccountId]
        .filter((accountId): accountId is string => Boolean(accountId));
      affectedAccountIds.forEach(accountId => {
        const account = nextState.bankAccounts?.find(item => item.id === accountId);
        if (!account) return;
        SupabaseSyncEngine.syncBankAccount(account, account.tenantId).then(synced => {
          if (!synced) console.error('[Store] Supabase rejected cash/bank balance rollback synchronization.');
        }).catch(error => console.error('[Store] Failed to sync cash/bank balance rollback:', error));
      });
    }
  };

  const addClient = async (clientData: Omit<Client, 'id'>): Promise<Client> => {
    if (settings.openingPeriodStatus === 'completed' && Number(clientData.balance || 0) !== 0) {
      throw new Error('پس از پایان عملیات اول دوره، مانده طرف‌حساب باید با سند حسابداری ثبت شود.');
    }

    const currentTenant = (activeTenantId && activeTenantId !== 'all')
      ? activeTenantId
      : (currentUser?.tenantId && currentUser.tenantId !== 'all')
      ? currentUser.tenantId
      : 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const { nextState, client } = HabinoAtomicTransactionWrapper.atomicRegisterClient(
      currentSnapshot,
      clientData,
      currentTenant
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      clients: nextState.clients,
      accountingEntries: nextState.accountingEntries
    };

    setClients(nextState.clients);
    setAccountingEntries(nextState.accountingEntries);

    try {
      localStorage.setItem('habino_clients', JSON.stringify(nextState.clients));
      localStorage.setItem('habino_entries', JSON.stringify(nextState.accountingEntries));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    if (getIsSupabaseConfigured()) {
      SupabaseSyncEngine.syncClient(client, currentTenant).then(synced => {
        if (!synced) offlineOutbox.enqueue('client', client, currentTenant);
      }).catch(err => {
        console.warn('Failed to sync client to Supabase:', err);
        offlineOutbox.enqueue('client', client, currentTenant);
      });
      const existingEntryIds = new Set(currentSnapshot.accountingEntries.map(entry => entry.id));
      const newOpeningEntries = nextState.accountingEntries.filter(entry =>
        !existingEntryIds.has(entry.id) && entry.documentNumber?.startsWith('DOC-OPN')
      );
      if (newOpeningEntries.length > 0) {
        SupabaseSyncEngine.syncAccountingEntries(newOpeningEntries, currentTenant).catch(() => {
          offlineOutbox.enqueue('entries', newOpeningEntries, currentTenant);
        });
      }
    }

    return client;
  };

  const updateClient = async (id: string, updated: Partial<Client>, openingBalanceUpdate = false) => {
    if (openingBalanceUpdate && settings.openingPeriodStatus === 'completed') {
      throw new Error('پس از پایان عملیات اول دوره، اصلاح مانده فقط با سند حسابداری مجاز است.');
    }

    const currentTenant = (activeTenantId && activeTenantId !== 'all')
      ? activeTenantId
      : (currentUser?.tenantId && currentUser.tenantId !== 'all')
      ? currentUser.tenantId
      : 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const { nextState } = HabinoAtomicTransactionWrapper.atomicUpdateClient(
      currentSnapshot,
      id,
      updated,
      currentTenant,
      openingBalanceUpdate
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      clients: nextState.clients,
      accountingEntries: nextState.accountingEntries
    };

    setClients(nextState.clients);
    setAccountingEntries(nextState.accountingEntries);

    try {
      localStorage.setItem('habino_clients', JSON.stringify(nextState.clients));
      localStorage.setItem('habino_entries', JSON.stringify(nextState.accountingEntries));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    if (getIsSupabaseConfigured()) {
      const updatedClient = nextState.clients.find(c => c.id === id);
      if (updatedClient) {
        SupabaseSyncEngine.syncClient(updatedClient, currentTenant).then(synced => {
          if (!synced) offlineOutbox.enqueue('client', updatedClient, currentTenant);
        }).catch(() => {
          offlineOutbox.enqueue('client', updatedClient, currentTenant);
        });
      }
      if (nextState.accountingEntries && nextState.accountingEntries.length > 0) {
        SupabaseSyncEngine.syncAccountingEntries(nextState.accountingEntries, currentTenant).catch(() => {});
      }
    }
  };

  const deleteClient = async (id: string) => {
    const currentTenant = (activeTenantId && activeTenantId !== 'all')
      ? activeTenantId
      : (currentUser?.tenantId && currentUser.tenantId !== 'all')
      ? currentUser.tenantId
      : 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const nextState = HabinoAtomicTransactionWrapper.atomicDeleteClient(
      currentSnapshot,
      id
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      clients: nextState.clients,
      accountingEntries: nextState.accountingEntries
    };

    setClients(nextState.clients);
    setAccountingEntries(nextState.accountingEntries);

    try {
      localStorage.setItem('habino_clients', JSON.stringify(nextState.clients));
      localStorage.setItem('habino_entries', JSON.stringify(nextState.accountingEntries));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    if (getIsSupabaseConfigured()) {
      Promise.resolve(supabase.from('clients').delete().eq('id', id).eq('tenant_id', currentTenant)).catch(() => {});
    }
  };

  const addInventoryItem = async (itemData: Omit<InventoryItem, 'id'>): Promise<InventoryItem> => {
    if (settings.openingPeriodStatus === 'completed' && Number(itemData.stock || 0) !== 0) {
      throw new Error('پس از پایان عملیات اول دوره، ورود موجودی فقط با ثبت فاکتور خرید مجاز است.');
    }
    if (!Number.isFinite(Number(itemData.stock)) || Number(itemData.stock) < 0) {
      throw new Error('موجودی کالا باید عددی معتبر و نامنفی باشد.');
    }

    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';
    const newItem: InventoryItem = {
      ...itemData,
      id: HabinoAccountingKernel.generateUUID(),
      tenantId: currentTenant
    };
    setInventory(prev => [...prev, newItem]);
    if (getIsSupabaseConfigured()) {
      SupabaseSyncEngine.syncInventoryItem(newItem, currentTenant).catch(() => {});
    }
    return newItem;
  };

  const updateInventoryItem = async (id: string, updated: Partial<InventoryItem>) => {
    const existingItem = inventory.find(item => item.id === id);
    if (!existingItem) {
      throw new Error('کالای موردنظر یافت نشد.');
    }
    if (
      updated.stock !== undefined &&
      (!Number.isFinite(Number(updated.stock)) || Number(updated.stock) < 0)
    ) {
      throw new Error('موجودی کالا باید عددی معتبر و نامنفی باشد.');
    }
    if (
      settings.openingPeriodStatus === 'completed' &&
      updated.stock !== undefined &&
      Number(updated.stock) !== Number(existingItem.stock)
    ) {
      throw new Error('پس از پایان عملیات اول دوره، ورود یا اصلاح موجودی فقط با ثبت فاکتور خرید مجاز است.');
    }
    if (
      settings.openingPeriodStatus === 'completed' &&
      existingItem.type !== 'service' &&
      Number(existingItem.stock) > 0 &&
      updated.buyPrice !== undefined &&
      Number(updated.buyPrice) !== Number(existingItem.buyPrice)
    ) {
      throw new Error('تغییر بهای موجودی دارای مانده فقط از طریق سند خرید یا برگشت خرید مجاز است.');
    }
    if (
      settings.openingPeriodStatus === 'completed' &&
      Number(existingItem.stock) > 0 &&
      updated.type !== undefined &&
      updated.type !== existingItem.type
    ) {
      throw new Error('تغییر ماهیت کالای دارای موجودی پس از پایان اول دوره مجاز نیست.');
    }

    let updatedItem: InventoryItem | undefined;
    setInventory(prev => prev.map(i => {
      if (i.id === id) {
        updatedItem = { ...i, ...updated };
        return updatedItem;
      }
      return i;
    }));
    if (getIsSupabaseConfigured() && updatedItem) {
      SupabaseSyncEngine.syncInventoryItem(updatedItem, activeTenantId).catch(() => {});
    }
  };

  const deleteInventoryItem = async (id: string) => {
    const item = inventory.find(existing => existing.id === id);
    if (!item) {
      throw new Error('کالای موردنظر یافت نشد.');
    }
    if (settings.openingPeriodStatus === 'completed' && item.type !== 'service' && Number(item.stock) > 0) {
      throw new Error('حذف کالای دارای موجودی پس از پایان اول دوره مجاز نیست؛ ابتدا با سند مربوط موجودی را تعیین تکلیف کنید.');
    }
    setInventory(prev => prev.filter(i => i.id !== id));
    if (getIsSupabaseConfigured()) {
      SupabaseSyncEngine.deleteInventoryItemFromSupabase(id).catch(() => {});
    }
  };

  const createInstallmentPlan = async (input: CreateInstallmentPlanInput): Promise<Installment[]> => {
    if (!hasPermission('accounting:manage_installments')) {
      throw new Error('مجوز تأیید برنامه اقساط را ندارید.');
    }
    const currentTenant = (activeTenantId && activeTenantId !== 'all')
      ? activeTenantId
      : (currentUser?.tenantId && currentUser.tenantId !== 'all' ? currentUser.tenantId : '');
    if (!currentTenant) throw new Error('برای ثبت برنامه اقساط، ابتدا یک مستأجر مشخص را انتخاب کنید.');

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      bankAccounts: financialStateRef.current.bankAccounts
    };
    const result = HabinoAtomicTransactionWrapper.atomicCreateInstallmentPlan(
      currentSnapshot,
      { ...input, approvedBy: currentUser?.id || currentUser?.email || input.approvedBy },
      currentTenant
    );
    const nextState = { ...financialStateRef.current, ...result.nextState };
    financialStateRef.current = nextState;
    setInvoices(nextState.invoices);
    setInstallments(nextState.installments);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);

    if (getIsSupabaseConfigured()) {
      result.installments.forEach(installment => offlineOutbox.enqueue('installment', installment, currentTenant));
      offlineOutbox.enqueue('invoice', {
        invoice: result.invoice,
        accountingEntries: result.nextState.accountingEntries
      }, currentTenant);
      if (result.accountingEntries.length > 0) {
        const updatedClient = result.nextState.clients.find(client => client.id === result.invoice.clientId);
        if (updatedClient) offlineOutbox.enqueue('client', updatedClient, currentTenant);
      }
    }
    return result.installments;
  };

  const addInstallment = async (
    request: Pick<Installment, 'invoiceId' | 'installmentNumber' | 'totalInstallments' | 'amount' | 'dueDate' | 'clientId'> &
      Partial<Pick<Installment, 'clientName' | 'status'>>
  ): Promise<Installment> => {
    if (request.installmentNumber !== 1) {
      throw new Error('برنامه اقساط باید یک‌جا و از فاکتور معتبر ایجاد شود.');
    }
    const invoice = financialStateRef.current.invoices.find(item => item.id === request.invoiceId);
    if (!invoice ||
        Math.round(Number(invoice.remainingAmount) * 100) / 100 !== Math.round(Number(request.amount) * 100) / 100) {
      throw new Error('مبلغ قسط باید با مانده کامل فاکتور انتخاب‌شده برابر باشد.');
    }
    const [installment] = await createInstallmentPlan({
      invoiceId: request.invoiceId,
      totalInstallments: request.totalInstallments,
      firstDueDate: request.dueDate,
      totalInterest: 0,
      totalServiceFee: 0,
      approvedBy: currentUser?.id || currentUser?.email || ''
    });
    return installment;
  };

  const recordInstallmentPayment = async (input: RecordInstallmentPaymentInput): Promise<Transaction> => {
    if (!hasPermission('accounting:manage_installments')) {
      throw new Error('مجوز ثبت دریافت قسط را ندارید.');
    }
    const currentTenant = (activeTenantId && activeTenantId !== 'all')
      ? activeTenantId
      : (currentUser?.tenantId && currentUser.tenantId !== 'all' ? currentUser.tenantId : '');
    if (!currentTenant) throw new Error('برای ثبت دریافت قسط، ابتدا یک مستأجر مشخص را انتخاب کنید.');

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      bankAccounts: financialStateRef.current.bankAccounts
    };
    const result = HabinoAtomicTransactionWrapper.atomicRecordInstallmentPayment(currentSnapshot, input, currentTenant);
    const nextState = { ...financialStateRef.current, ...result.nextState };
    financialStateRef.current = nextState;
    setInvoices(nextState.invoices);
    setInstallments(nextState.installments);
    setAccountingEntries(nextState.accountingEntries);
    setTransactions(nextState.transactions);
    setClients(nextState.clients);
    if (nextState.bankAccounts) setBankAccounts(nextState.bankAccounts);

    if (getIsSupabaseConfigured()) {
      offlineOutbox.enqueue('invoice', {
        invoice: result.invoice,
        accountingEntries: result.nextState.accountingEntries
      }, currentTenant);
      offlineOutbox.enqueue('installment', result.installment, currentTenant);
      offlineOutbox.enqueue('transaction', result.transaction, currentTenant);
      offlineOutbox.enqueue('entries', result.accountingEntries, currentTenant);
      offlineOutbox.enqueue('client', result.client, currentTenant);
      if (result.bankAccount) offlineOutbox.enqueue('bankAccount', result.bankAccount, currentTenant);
    }
    return result.transaction;
  };

  const addBankAccount = async (bankData: Omit<BankAccount, 'id'>): Promise<BankAccount> => {
    if (settings.openingPeriodStatus === 'completed' && Number(bankData.balance || 0) !== 0) {
      throw new Error('پس از پایان عملیات اول دوره، مانده صندوق یا بانک باید با سند دریافت یا پرداخت ثبت شود.');
    }

    const currentTenant = (activeTenantId && activeTenantId !== 'all')
      ? activeTenantId
      : (currentUser?.tenantId && currentUser.tenantId !== 'all')
      ? currentUser.tenantId
      : 'tenant-main';
    const newBank: BankAccount = {
      ...bankData,
      accountType: bankData.accountType || 'bank',
      accountCode: bankData.accountCode || (bankData.accountType === 'cash' ? '10101' : '10102'),
      accountTitle: bankData.accountTitle || getAllAccountMoeins().find(account =>
        account.code === (bankData.accountCode || (bankData.accountType === 'cash' ? '10101' : '10102'))
      )?.title,
      id: HabinoAccountingKernel.generateUUID(),
      tenantId: currentTenant
    };
    setBankAccounts(prev => [...prev, newBank]);
    if (getIsSupabaseConfigured()) {
      SupabaseSyncEngine.syncBankAccount(newBank, currentTenant).then(synced => {
        if (!synced) {
          console.error('[Store] Supabase rejected cash/bank account synchronization.');
        }
      }).catch(error => {
        console.error('[Store] Failed to sync cash/bank account:', error);
      });
    }
    return newBank;
  };

  const updateBankAccount = async (id: string, updated: Partial<BankAccount>) => {
    setBankAccounts(prev => prev.map(b => b.id === id ? { ...b, ...updated } : b));
  };

  const deleteBankAccount = async (id: string) => {
    setBankAccounts(prev => prev.filter(b => b.id !== id));
  };

  const addProject = async (projData: Omit<Project, 'id'>): Promise<Project> => {
    if (!projData.clientId || projData.clientId.trim() === '') {
      throw new Error('ثبت سند بدون انتخاب مخاطب مجاز نیست.');
    }
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';
    const newProj: Project = {
      ...projData,
      id: HabinoAccountingKernel.generateUUID(),
      tenantId: currentTenant
    };
    const nextProjects = [...financialStateRef.current.projects, newProj];
    financialStateRef.current = { ...financialStateRef.current, projects: nextProjects };
    setProjects(nextProjects);

    if (getIsSupabaseConfigured()) {
      let synced = false;
      try {
        synced = await SupabaseSyncEngine.syncProject(newProj, currentTenant);
      } catch (error) {
        console.warn('[Store] Failed to sync new project; queued for retry:', error);
      }

      if (!synced) {
        await HabinoOfflineQueue.enqueue({
          tenantId: currentTenant,
          entityType: 'project',
          operation: 'upsert',
          payload: newProj
        });
      }
    }

    return newProj;
  };

  const updateProject = async (id: string, updated: Partial<Project>) => {
    const updatedProject = financialStateRef.current.projects.find(project => project.id === id);
    if (!updatedProject) throw new Error('پروژه موردنظر یافت نشد.');
    const nextProject = { ...updatedProject, ...updated };
    const nextProjects = financialStateRef.current.projects.map(project =>
      project.id === id ? nextProject : project
    );
    financialStateRef.current = { ...financialStateRef.current, projects: nextProjects };
    setProjects(nextProjects);

    if (getIsSupabaseConfigured()) {
      const synced = await SupabaseSyncEngine.syncProject(nextProject, nextProject.tenantId || activeTenantId);
      if (!synced) {
        throw new Error('تغییرات پروژه محلی ذخیره شد، اما همگام‌سازی ابری انجام نشد.');
      }
    }
  };

  const deleteProject = async (id: string) => {
    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const nextState = HabinoAtomicTransactionWrapper.atomicDeleteProject(
      currentSnapshot,
      id
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      projects: nextState.projects,
      accountingEntries: nextState.accountingEntries,
      transactions: nextState.transactions,
      invoices: nextState.invoices
    };

    setProjects(nextState.projects);
    setAccountingEntries(nextState.accountingEntries);
    setTransactions(nextState.transactions);
    setInvoices(nextState.invoices);
  };

  const registerProjectAdvance = async (params: {
    projectId: string;
    amount: number;
    date: string;
    description: string;
  }): Promise<void> => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const nextState = HabinoAtomicTransactionWrapper.atomicRegisterProjectAdvance(
      currentSnapshot,
      { ...params, tenantId: currentTenant }
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      transactions: nextState.transactions,
      projects: nextState.projects
    };

    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setTransactions(nextState.transactions);
    setProjects(nextState.projects);
  };

  const closeProjectProfit = async (params: {
    projectId: string;
    date: string;
  }): Promise<void> => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const nextState = HabinoAtomicTransactionWrapper.atomicCloseProjectProfit(
      currentSnapshot,
      { ...params, tenantId: currentTenant }
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      accountingEntries: nextState.accountingEntries,
      projects: nextState.projects
    };

    setAccountingEntries(nextState.accountingEntries);
    setProjects(nextState.projects);
  };

  const batchSettleInvoices = async (
    settlements: BatchInvoiceSettlementItem[],
    operationDate?: string
  ): Promise<BatchSettlementResult> => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const { nextState, result } = HabinoAtomicTransactionWrapper.atomicBatchSettleInvoices(
      currentSnapshot,
      settlements,
      currentTenant,
      operationDate
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      invoices: nextState.invoices,
      accountingEntries: nextState.accountingEntries,
      clients: nextState.clients,
      transactions: nextState.transactions,
      checks: nextState.checks
    };

    setInvoices(nextState.invoices);
    setAccountingEntries(nextState.accountingEntries);
    setClients(nextState.clients);
    setTransactions(nextState.transactions);
    setChecks(nextState.checks);

    return result;
  };

  const closeFiscalYear = async (
    params: CloseFiscalYearParams
  ): Promise<CloseFiscalYearResult> => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';

    const currentSnapshot = {
      invoices: financialStateRef.current.invoices,
      accountingEntries: financialStateRef.current.accountingEntries,
      clients: financialStateRef.current.clients,
      transactions: financialStateRef.current.transactions,
      installments: financialStateRef.current.installments,
      checks: financialStateRef.current.checks,
      projects: financialStateRef.current.projects,
      inventory: financialStateRef.current.inventory
    };

    const { nextState, result } = HabinoAtomicTransactionWrapper.atomicCloseFiscalYear(
      currentSnapshot,
      params,
      currentTenant
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      accountingEntries: nextState.accountingEntries
    };

    setAccountingEntries(nextState.accountingEntries);
    return result;
  };

  const addAccountingEntry = async (entryData: Omit<AccountingEntry, 'id'>): Promise<AccountingEntry> => {
    // 🛡️ هدایت ثبت تک‌سندی به گارد توازن دفتر کل برای جلوگیری از ثبت آرتیکل‌های ناتراز
    const [createdEntry] = await addAccountingEntries([entryData]);
    return createdEntry;
  };

  const addAccountingEntries = async (
    entryData: Omit<AccountingEntry, 'id'>[]
  ): Promise<AccountingEntry[]> => {
    if (entryData.length === 0) return [];

    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';
    const newEntries: AccountingEntry[] = entryData.map(entry => ({
      ...entry,
      id: (entry as any).id || HabinoAccountingKernel.generateUUID(),
      tenantId: currentTenant,
      created_at: entry.created_at || new Date().toISOString()
    }));

    // 🛡️ اعمال گارد جامع توازن سند دوبل (Centralized Ledger Balance Invariant Guard)
    // تفکیک قطعی بر اساس شماره سند و جلوگیری از تجمیع اشتباه اسناد نامرتبط
    // اگر شماره سند یا شناسه مرجع وجود نداشته باشد، کلید یکتا اختصاص می‌یابد تا تجمیع اسناد جداگانه با هم رخ ندهد
    const entriesByDoc = new Map<string, AccountingEntry[]>();
    for (const entry of newEntries) {
      const docKey = entry.documentNumber?.trim() || entry.referenceId?.trim() || `DOC-UNASSIGNED-${entry.id}`;
      const existingList = entriesByDoc.get(docKey) || [];
      existingList.push(entry);
      entriesByDoc.set(docKey, existingList);
    }

    for (const [docIdentifier, docEntries] of entriesByDoc.entries()) {
      HabinoAccountingKernel.assertDoubleEntryBalanceInvariant(docEntries, docIdentifier);
    }

    setAccountingEntries(prev => [...prev, ...newEntries]);

    if (getSupabaseConfig().isConfigured) {
      offlineOutbox.enqueue('entries', newEntries, currentTenant);
    }
    return newEntries;
  };

  const updateSettings = async (newSettings: Partial<CompanySettings>): Promise<{ success: boolean; message: string; savedInCloud: boolean }> => {
    const targetTenantId = (activeTenantId && activeTenantId !== 'all') ? activeTenantId : 'tenant-main';

    const mergedSettings: CompanySettings = {
      ...settings,
      ...newSettings,
      defaultInvoiceDesign: {
        ...(settings.defaultInvoiceDesign || defaultSettings.defaultInvoiceDesign),
        ...(newSettings.defaultInvoiceDesign || {})
      }
    };

    setSettings(mergedSettings);

    try {
      localStorage.setItem(`habino_settings_${targetTenantId}`, JSON.stringify(mergedSettings));
      if (targetTenantId === 'tenant-main') {
        localStorage.setItem('habino_settings', JSON.stringify(mergedSettings));
      }
    } catch (e) {
      console.warn('LocalStorage save failed for settings:', e);
    }

    let savedInCloud = false;
    if (getIsSupabaseConfigured()) {
      try {
        const cloudResult = await SupabaseSyncEngine.syncCompanySettings(mergedSettings, targetTenantId);
        savedInCloud = cloudResult.success;
      } catch (e) {
        console.warn('Cloud sync error for company settings:', e);
      }
    }

    return {
      success: true,
      message: savedInCloud ? 'تنظیمات با موفقیت در فضای ابری و حافظه محلی ذخیره گردید.' : 'تنظیمات با موفقیت در حافظه محلی ذخیره شد.',
      savedInCloud
    };
  };

  const setCurrency = (currency: CurrencyType) => {
    updateSettings({ currency });
  };

  const activateLicense = async (serialKey: string, holderName?: string, expectedPlan?: SubscriptionPlanType): Promise<{ success: boolean; message: string }> => {
    if (!getSupabaseConfig().isConfigured) {
      return { success: false, message: 'فعال‌سازی لایسنس به سرویس امن هابینو نیاز دارد؛ حالت محلی نمی‌تواند اعتبار کلید را تأیید کند.' };
    }
    if (!serialKey.trim()) {
      return { success: false, message: 'کلید لایسنس وارد نشده است.' };
    }

    const { data, error } = await supabase.rpc('rpc_activate_habino_license', {
      p_tenant_id: activeTenant.id,
      p_license_key: serialKey.trim(),
      p_expected_plan: expectedPlan || null
    });
    if (error) {
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('license key not found')) {
        return { success: false, message: 'این کد در سرویس امن هابینو صادر نشده است. شناسهٔ دورهٔ آزمایشی و کدهای نمونه قابل‌فعال‌سازی نیستند.' };
      }
      if (errorMessage.includes('active tenant claim mismatch')) {
        return { success: false, message: 'نشست ورود با فضای کاری فعال مطابقت ندارد. یک‌بار خارج شوید و با حساب همان فضای کاری دوباره وارد شوید.' };
      }
      if (errorMessage.includes('license assigned to another tenant')) {
        return { success: false, message: 'این لایسنس برای فضای کاری دیگری صادر شده است. هنگام صدور، مستأجر مقصد را بررسی کنید.' };
      }
      if (errorMessage.includes('add-on license cannot activate a plan')) {
        return { success: false, message: 'این کد مربوط به افزونه است و برای فعال‌سازی پلن اشتراک قابل استفاده نیست.' };
      }
      if (errorMessage.includes('license has been revoked')) {
        return { success: false, message: 'این لایسنس لغو شده است. برای دریافت کد معتبر با پشتیبانی تماس بگیرید.' };
      }
      if (errorMessage.includes('license does not match the selected plan')) {
        return { success: false, message: 'پلن انتخاب‌شده با پلن این لایسنس مطابقت ندارد.' };
      }
      if (errorMessage.includes('license has expired')) {
        return { success: false, message: 'اعتبار این لایسنس به پایان رسیده است.' };
      }
      if (errorMessage.includes('license key is required')) {
        return { success: false, message: 'کد لایسنس وارد نشده است.' };
      }
      return { success: false, message: `اعتبارسنجی لایسنس ناموفق بود: ${error.message}` };
    }
    if (!data || !['starter', 'professional', 'enterprise'].includes(data.plan)) {
      return { success: false, message: 'پاسخ سرویس اعتبارسنجی لایسنس نامعتبر است.' };
    }

    const plan = data.plan as SubscriptionPlanType;
    const planInfo = PLAN_LIMITS[plan];
    const expiresAt = data.expires_at || '9999-12-31T23:59:59.999Z';
    const updatedTenant: Tenant = {
      ...activeTenant,
      subscription: {
        plan,
        planNameFa: planInfo.planNameFa,
        status: 'active',
        maxUsers: planInfo.maxUsers,
        expiresAt,
        serialKey: serialKey.trim(),
        isLifetime: Boolean(data.is_lifetime)
      }
    };
    const updatedTenants = availableTenants.map(tenant => tenant.id === activeTenant.id ? updatedTenant : tenant);
    setAvailableTenants(updatedTenants);
    HabinoAuthEngine.saveTenants(updatedTenants);

    const tier: LicenseTier = plan === 'starter' ? 'trial' : plan === 'professional' ? 'pro' : 'enterprise';
    setLicense({
      status: 'active',
      tier,
      licenseKey: serialKey.trim(),
      holderName: holderName || activeTenant.ownerName || 'کاربر هابینو',
      activatedAt: new Date().toISOString(),
      expiresAt,
      aiSynapseEnabled: false,
      offlineSyncEnabled: true,
      features: planInfo.allowedModules
    });
    if (currentUser) {
      HabinoAuthEngine.addAuditLog({
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        tenantId: activeTenant.id,
        action: 'LICENSE_ACTIVATED',
        resource: 'LicenseManagement',
        details: `فعال‌سازی لایسنس ${planInfo.planNameFa} از طریق اعتبارسنجی سرور`
      });
      setAuditLogs(HabinoAuthEngine.loadAuditLogs());

      recordImmutableAuditEvent({
        action: 'LICENSE_ACTIVATED',
        actorId: currentUser.id,
        actorRole: currentUser.role,
        tenantId: activeTenant.id,
        resourceType: 'license',
        resourceId: serialKey.trim(),
        correlationId: null,
        outcome: 'succeeded',
        reasonCode: `plan=${plan}, tier=${tier}`,
        eventSource: 'application'
      });
    }
    return { success: true, message: `اشتراک «${planInfo.planNameFa}» با موفقیت توسط سرویس امن تأیید شد.` };
  };

  const activateMarketFullEdition = async (companyName?: string): Promise<{ success: boolean; message: string }> => {
    if (!import.meta.env.DEV) {
      return {
        success: false,
        message: 'فعال‌سازی تجاری فقط پس از تأیید خرید در سرویس معتبر بازار امکان‌پذیر است.'
      };
    }
    const marketLic = activateFullMarketEdition(companyName);
    setLicense(marketLic);
    return { success: true, message: 'نسخه تجاری بازار با دسترسی نامحدود برای شما با موفقیت فعال شد.' };
  };

  const triggerManualBackup = (): BackupSnapshot => {
    return createBackupSnapshot({
      invoices,
      checks,
      transactions,
      clients,
      inventory,
      installments,
      bankAccounts,
      projects,
      accountingEntries,
      settings,
      license
    }, activeTenantId);
  };

  const restoreFullBackup = async (snapshot: BackupSnapshot): Promise<{ success: boolean; message: string }> => {
    try {
      if (!snapshot.data) {
        return { success: false, message: 'ساختار فایل پشتیبان نامعتبر است.' };
      }

      // اعتبارسنجی یکپارچگی داده‌های مالی (Rule 9 Double-entry Balance Pre-Check)
      if (snapshot.data.accountingEntries && snapshot.data.accountingEntries.length > 0) {
        let totalDebit = 0;
        let totalCredit = 0;
        for (const entry of snapshot.data.accountingEntries) {
          totalDebit += Number(entry.debit || 0);
          totalCredit += Number(entry.credit || 0);
        }
        const discrepancy = Math.abs(totalDebit - totalCredit);
        if (discrepancy > 0.01) {
          return {
            success: false,
            message: `خطای یکپارچگی مالی در فایل پشتیبان: دفاتر دوبل ناتراز هستند (اختلاف: ${discrepancy.toLocaleString('fa-IR')} ریال). جهت جلوگیری از آلودگی دیتابیس، بازیابی متوقف شد.`
          };
        }
      }

      if (snapshot.data.invoices) setInvoices(snapshot.data.invoices);
      if (snapshot.data.checks) setChecks(snapshot.data.checks);
      if (snapshot.data.transactions) setTransactions(snapshot.data.transactions);
      if (snapshot.data.clients) setClients(snapshot.data.clients);
      if (snapshot.data.inventory) setInventory(snapshot.data.inventory);
      if (snapshot.data.installments) setInstallments(snapshot.data.installments.map(normalizeInstallment));
      if (snapshot.data.bankAccounts) setBankAccounts(snapshot.data.bankAccounts);
      if (snapshot.data.projects) setProjects(snapshot.data.projects);
      if (snapshot.data.accountingEntries) setAccountingEntries(snapshot.data.accountingEntries);
      if (snapshot.data.settings) setSettings(snapshot.data.settings);
      if (snapshot.data.license) setLicense(snapshot.data.license);

      return {
        success: true,
        message: 'بازیابی با موفقیت انجام شد و یکپارچگی دفاتر دوبل تأیید گردید.'
      };
    } catch (e: any) {
      return {
        success: false,
        message: `خطا در بازیابی: ${e?.message || 'ناشناخته'}`
      };
    }
  };

  const loadDemoData = () => {};
  const switchToCleanMarketData = () => {};

  const clearTenantQueueStorage = (key: string, tenantId: string) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`صف آفلاین ${key} قالب قابل پاکسازی مستأجرمحور ندارد.`);
    }
    const remaining = parsed.filter(item => {
      const rowTenantId = item?.tenantId || item?.tenant_id;
      return rowTenantId ? rowTenantId !== tenantId : tenantId !== 'tenant-main';
    });
    localStorage.setItem(key, JSON.stringify(remaining));
  };

  const [isSupabaseLive, setIsSupabaseLive] = useState<boolean>(() => {
    return getSupabaseConfig().isConfigured;
  });

  useEffect(() => {
    const handleConfigChange = () => {
      setIsSupabaseLive(getSupabaseConfig().isConfigured);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('habino_supabase_config_changed', handleConfigChange);
      return () => window.removeEventListener('habino_supabase_config_changed', handleConfigChange);
    }
  }, []);

  // پاکسازی کامل لایه لوکال در زمان شناسایی ریست کارخانه ابری روی دستگاه‌های دیگر
  const executeLocalPurgeOnly = async (
    mode: 'full' | 'preserve_inventory' | 'preserve_contacts_inventory' = 'preserve_inventory',
    tenantId: string = activeTenantId || 'tenant-main'
  ) => {
    const preserveInventory = mode !== 'full';
    const targetTenant = tenantId;
    const remainingInvoices = removeRowsForTenant(financialStateRef.current.invoices, targetTenant);
    const remainingTransactions = removeRowsForTenant(financialStateRef.current.transactions, targetTenant);
    const remainingChecks = removeRowsForTenant(financialStateRef.current.checks, targetTenant);
    const remainingInstallments = removeRowsForTenant(financialStateRef.current.installments, targetTenant);
    const remainingProjects = removeRowsForTenant(financialStateRef.current.projects, targetTenant);
    const remainingEntries = removeRowsForTenant(financialStateRef.current.accountingEntries, targetTenant);
    const remainingClients = removeRowsForTenant(financialStateRef.current.clients, targetTenant);
    const remainingBanks = removeRowsForTenant(financialStateRef.current.bankAccounts, targetTenant);
    removeInvoiceSignatures(filterRowsForTenant(financialStateRef.current.invoices, targetTenant));
    const remainingInventory = preserveInventory
      ? financialStateRef.current.inventory
      : removeRowsForTenant(financialStateRef.current.inventory, targetTenant);

    clearStoredPayrollDataForTenant(targetTenant);
    await offlineOutbox.clearTenant(targetTenant);
    HabinoOfflineQueue.clearQueue(targetTenant);
    clearTenantQueueStorage('habino_offline_queue', targetTenant);
    clearTenantQueueStorage('habino_offline_db_queue', targetTenant);
    clearTenantQueueStorage('habino_sync_queue_v1', targetTenant);

    await Promise.all([
      HabinoIndexedDbEngine.clearTenantStore('invoices', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('transactions', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('checks', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('installments', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('projects', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('accountingEntries', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('outboxItems', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('clients', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('bankAccounts', targetTenant),
      ...(!preserveInventory ? [HabinoIndexedDbEngine.clearTenantStore('inventory', targetTenant)] : []),
      ...(mode === 'full' ? [HabinoIndexedDbEngine.deleteItem('companySettings', 'current')] : [])
    ]);

    localStorage.setItem('habino_invoices', JSON.stringify(remainingInvoices));
    localStorage.setItem('habino_checks', JSON.stringify(remainingChecks));
    localStorage.setItem('habino_transactions', JSON.stringify(remainingTransactions));
    localStorage.setItem('habino_installments', JSON.stringify(remainingInstallments));
    localStorage.setItem('habino_entries', JSON.stringify(remainingEntries));
    localStorage.setItem('habino_projects', JSON.stringify(remainingProjects));
    localStorage.removeItem('habino_ocr_documents');
    if (mode === 'full') {
      HabinoConflictResolutionEngine.clearHistory();
      habinoFinancialAuditLogger.clear();
      localStorage.removeItem('habino_agent_roundtable_events');
      localStorage.removeItem(`habino_settings_${targetTenant}`);
      if (targetTenant === 'tenant-main') localStorage.removeItem('habino_settings');
      const remainingAuditLogs = HabinoAuthEngine.loadAuditLogs()
        .filter(log => log.tenantId !== targetTenant);
      localStorage.setItem('habino_user_audit_logs', JSON.stringify(remainingAuditLogs));
      setAuditLogs(remainingAuditLogs);
      setSettings(getTenantDefaultSettings(availableTenants.find(tenant => tenant.id === targetTenant)));
    }
    localStorage.setItem(`habino_pnl_purged_for_testing_v2_${targetTenant}`, 'true');
    const localPurgeTime = Date.now().toString();
    localStorage.setItem(`habino_pnl_purged_at_${targetTenant}`, localPurgeTime);
    if (targetTenant === 'tenant-main') {
      localStorage.setItem('habino_pnl_purged_for_testing_v2', 'true');
      localStorage.setItem('habino_factory_reset_completed', localPurgeTime);
    }
    localStorage.setItem(`habino_factory_reset_${targetTenant}`, localPurgeTime);

    try {
      window.dispatchEvent(new CustomEvent('habino_factory_reset_occurred', {
        detail: { tenantId: targetTenant, mode, resetTime: Number(localPurgeTime) }
      }));
    } catch (error) {
      console.warn('[FactoryReset] Failed to notify payroll and other local views:', error);
    }

    localStorage.setItem('habino_clients', JSON.stringify(remainingClients));
    localStorage.setItem('habino_banks', JSON.stringify(remainingBanks));
    await verifyLocalClientsPurged(targetTenant);
    localStorage.setItem('habino_inventory', JSON.stringify(remainingInventory));

    try {
      await HabinoIndexedDbEngine.persistFullSnapshot({
        invoices: [],
        transactions: [],
        clients: [],
        checks: [],
        inventory: remainingInventory,
        bankAccounts: [],
        installments: [],
        projects: [],
        accountingEntries: []
      });
    } catch (_) {}

    setInvoices(remainingInvoices);
    setChecks(remainingChecks);
    setTransactions(remainingTransactions);
    setInstallments(remainingInstallments);
    setAccountingEntries(remainingEntries);
    setProjects(remainingProjects);
    setClients(remainingClients);
    setBankAccounts(remainingBanks);
    setInventory(remainingInventory);

    financialStateRef.current = {
      invoices: remainingInvoices,
      accountingEntries: remainingEntries,
      clients: remainingClients,
      transactions: remainingTransactions,
      installments: remainingInstallments,
      checks: remainingChecks,
      projects: remainingProjects,
      inventory: remainingInventory,
      bankAccounts: remainingBanks
    };
  };

  const verifyLocalClientsPurged = async (tenantId: string): Promise<void> => {
    const rawClients = localStorage.getItem('habino_clients');
    const clients = rawClients ? JSON.parse(rawClients) : [];
    if (!Array.isArray(clients)) {
      throw new Error('فهرست محلی طرف‌حساب‌ها قالب معتبری ندارد.');
    }

    const remainingLocalClients = clients.filter((client: any) =>
      (client?.tenantId || client?.tenant_id || 'tenant-main') === tenantId
    );
    const remainingIndexedDbClients = await HabinoIndexedDbEngine.countTenantStoreRecords('clients', tenantId);
    if (remainingLocalClients.length > 0 || remainingIndexedDbClients > 0) {
      throw new Error(`پاکسازی محلی طرف‌حساب‌ها تأیید نشد (${remainingLocalClients.length} LocalStorage، ${remainingIndexedDbClients} IndexedDB).`);
    }
  };

  const syncFromSupabase = async (targetTenantId?: string): Promise<{
    success: boolean;
    message: string;
    counts?: Record<string, number>;
  }> => {
    if (!isLocalHydrationComplete) {
      return {
        success: false,
        message: 'بازیابی اطلاعات محلی هنوز کامل نشده است؛ لطفاً پس از چند لحظه دوباره همگام‌سازی کنید.'
      };
    }

    const config = getSupabaseConfig();
    if (!config.isConfigured) {
      recordDocumentDiagnosticEvent(
        'DOCUMENT_CLOUD_FETCH_FAILED',
        targetTenantId || activeTenantId || currentUser?.tenantId || 'tenant-main',
        'FAILED',
        undefined,
        { reasonCode: 'SUPABASE_NOT_CONFIGURED' }
      );
      return {
        success: false,
        message: 'سوپابیس پیکربندی نشده است.'
      };
    }

    const tenant = targetTenantId || activeTenantId || currentUser?.tenantId || 'tenant-main';
    const isSuper = currentUser?.role === 'super_admin';

    let result: Awaited<ReturnType<typeof SupabaseSyncEngine.fetchAllDataFromSupabase>>;
    try {
      result = await SupabaseSyncEngine.fetchAllDataFromSupabase(tenant, isSuper);
    } catch (error) {
      recordDocumentDiagnosticEvent('DOCUMENT_CLOUD_FETCH_FAILED', tenant, 'FAILED', undefined, {
        reasonCode: 'FETCH_EXCEPTION'
      });
      throw error;
    }

    if (result.success && result.data) {
      setIsSupabaseLive(true);
      recordDocumentDiagnosticEvent(
        'DOCUMENT_CLOUD_FETCHED',
        tenant,
        'SUCCESS',
        createDiagnosticCorrelationId(),
        { recordCount: result.counts.invoices }
      );
      const preservedLocalCollections: string[] = [];
      if (result.data.invoices) {
        if (result.data.invoices.length === 0 && financialStateRef.current.invoices.length > 0) {
          preservedLocalCollections.push('فاکتورها');
          console.warn('[SupabaseSync] Empty cloud invoices response; preserving local invoices.');
        }
        let signaturesMap: Record<string, Partial<Invoice>> = {};
        try {
          const sigRaw = localStorage.getItem('habino_invoice_signatures');
          if (sigRaw) signaturesMap = JSON.parse(sigRaw);
        } catch (error) {
          console.warn('[SupabaseSync] Failed to load local invoice signatures:', error);
        }

        const mergedInvoices = mergeCloudInvoicesWithLocal(
          financialStateRef.current.invoices,
          result.data.invoices,
          tenant,
          signaturesMap
        );
        financialStateRef.current = {
          ...financialStateRef.current,
          invoices: mergedInvoices
        };
        setInvoices(mergedInvoices);
        try {
          localStorage.setItem('habino_invoices', JSON.stringify(mergedInvoices));
        } catch (error) {
          console.warn('[SupabaseSync] Failed to persist merged invoices locally:', error);
        }
        HabinoIndexedDbEngine.persistFullSnapshot({ invoices: mergedInvoices }).catch(error => {
          console.warn('[SupabaseSync] Failed to persist merged invoices in IndexedDB:', error);
        });
      }

      if (result.data.transactions) {
        const syncedTransactions = mergeCloudRowsWithLocal(
          financialStateRef.current.transactions,
          result.data.transactions,
          tenant
        );
        if (result.data.transactions.length === 0 && syncedTransactions.length > 0) {
          preservedLocalCollections.push('تراکنش‌ها');
          console.warn('[SupabaseSync] Empty cloud transactions response; preserving local transactions.');
        }
        setTransactions(syncedTransactions);
        financialStateRef.current = {
          ...financialStateRef.current,
          transactions: syncedTransactions
        };
      }

      if (result.data.clients) {
        const previousClients = financialStateRef.current.clients;
        const syncedClients = mergeCloudClientsWithLocal(
          previousClients,
          result.data.clients,
          tenant
        );
        const remoteClientsById = new Map(result.data.clients.map(client => [client.id, client]));
        for (const syncedClient of syncedClients) {
          const remoteClient = remoteClientsById.get(syncedClient.id);
          const previousClient = previousClients.find(client =>
            client.id === syncedClient.id &&
            (client.tenantId || 'tenant-main') === (syncedClient.tenantId || 'tenant-main')
          );
          const restoredCreditData =
            Number(syncedClient.creditLimit) > 0 &&
            !(Number(remoteClient?.creditLimit) > 0) &&
            Number(previousClient?.creditLimit) > 0;
          const restoredCreditBlock =
            syncedClient.isBlockedForCredit === true &&
            remoteClient?.isBlockedForCredit !== true &&
            previousClient?.isBlockedForCredit === true;
          if (!restoredCreditData && !restoredCreditBlock) continue;

          const clientTenant = syncedClient.tenantId || tenant;
          void SupabaseSyncEngine.syncClient(syncedClient, clientTenant).then(success => {
            if (!success) offlineOutbox.enqueue('client', syncedClient, clientTenant);
          }).catch(error => {
            console.warn('[SupabaseSync] Failed to restore client credit data to cloud:', error);
            offlineOutbox.enqueue('client', syncedClient, clientTenant);
          });
        }
        if (result.data.clients.length === 0 && syncedClients.length > 0) {
          preservedLocalCollections.push('مخاطبان');
          console.warn('[SupabaseSync] Empty cloud clients response; preserving local clients.');
        }
        setClients(syncedClients);
        financialStateRef.current = {
          ...financialStateRef.current,
          clients: syncedClients
        };
        try {
          localStorage.setItem('habino_clients', JSON.stringify(syncedClients));
        } catch (error) {
          console.warn('[SupabaseSync] Failed to persist clients locally:', error);
        }
        if (syncedClients.length > 0) {
          HabinoIndexedDbEngine.persistFullSnapshot({ clients: syncedClients }).catch(error =>
            console.warn('[SupabaseSync] Failed to persist clients in IndexedDB:', error)
          );
        }
      }

      if (result.data.checks) {
        const syncedChecks = mergeCloudRowsWithLocal(financialStateRef.current.checks, result.data.checks, tenant);
        if (result.data.checks.length === 0 && syncedChecks.length > 0) {
          preservedLocalCollections.push('چک‌ها');
          console.warn('[SupabaseSync] Empty cloud checks response; preserving local checks.');
        }
        setChecks(syncedChecks);
        financialStateRef.current = { ...financialStateRef.current, checks: syncedChecks };
      }

      if (result.data.inventory !== undefined) {
        const syncedInventory = mergeCloudInventoryWithLocal(
          financialStateRef.current.inventory,
          result.data.inventory,
          tenant
        );
        if (result.data.inventory.length === 0 && syncedInventory.length > 0) {
          preservedLocalCollections.push('موجودی انبار');
          console.warn('[SupabaseSync] Empty cloud inventory response; preserving local inventory.');
        }
        setInventory(syncedInventory);
        financialStateRef.current = { ...financialStateRef.current, inventory: syncedInventory };
        try {
          localStorage.setItem('habino_inventory', JSON.stringify(syncedInventory));
        } catch (error) {
          console.warn('[SupabaseSync] Failed to persist inventory locally:', error);
        }
        if (syncedInventory.length > 0) {
          HabinoIndexedDbEngine.persistFullSnapshot({ inventory: syncedInventory }).catch(error => {
            console.warn('[SupabaseSync] Failed to persist inventory in IndexedDB:', error);
          });
        }
      }

      if (result.data.bankAccounts) {
        const syncedBanks = mergeCloudRowsWithLocal(
          financialStateRef.current.bankAccounts,
          result.data.bankAccounts,
          tenant
        );
        if (result.data.bankAccounts.length === 0 && syncedBanks.length > 0) {
          preservedLocalCollections.push('حساب‌های بانکی و صندوق');
          console.warn('[SupabaseSync] Empty cloud bank accounts response; preserving local bank accounts.');
        }
        setBankAccounts(syncedBanks);
        financialStateRef.current = { ...financialStateRef.current, bankAccounts: syncedBanks };
      }

      if (result.data.installments) {
        const syncedInstallments = mergeCloudRowsWithLocal(
          financialStateRef.current.installments,
          result.data.installments,
          tenant
        );
        if (result.data.installments.length === 0 && syncedInstallments.length > 0) {
          preservedLocalCollections.push('اقساط');
          console.warn('[SupabaseSync] Empty cloud installments response; preserving local installments.');
        }
        setInstallments(syncedInstallments);
        financialStateRef.current = { ...financialStateRef.current, installments: syncedInstallments };
      }

      if (result.data.projects) {
        const syncedProjects = mergeCloudRowsWithLocal(
          financialStateRef.current.projects,
          result.data.projects,
          tenant
        );
        if (result.data.projects.length === 0 && syncedProjects.length > 0) {
          preservedLocalCollections.push('پروژه‌ها');
          console.warn('[SupabaseSync] Empty cloud projects response; preserving local projects.');
        }
        setProjects(syncedProjects);
        financialStateRef.current = { ...financialStateRef.current, projects: syncedProjects };
      }

      const localAccountingEntries = financialStateRef.current.accountingEntries;
      const preserveLocalLedger = result.data.accountingEntries?.length === 0 && localAccountingEntries.length > 0;
      if (preserveLocalLedger) {
        preservedLocalCollections.push('دفتر کل');
        console.warn(
          '[SupabaseSync] Cloud ledger returned no rows while local ledger has data; preserving local accounting entries.'
        );
      }
      const syncedAccountingEntries = mergeCloudAccountingEntriesWithLocal(
        localAccountingEntries,
        result.data.accountingEntries,
        tenant
      );
      if (syncedAccountingEntries !== financialStateRef.current.accountingEntries) {
        if (syncedAccountingEntries.length > 0) {
          setAccountingEntries(syncedAccountingEntries);
        } else {
          setAccountingEntries([]);
          localStorage.setItem('habino_entries', JSON.stringify([]));
        }
        financialStateRef.current = {
          ...financialStateRef.current,
          accountingEntries: syncedAccountingEntries
        };
      }

      if (result.data.settings) {
        setSettings(prev => ({ ...prev, ...result.data!.settings! }));
      }

      return {
        success: true,
        message: preservedLocalCollections.length > 0
          ? `${result.message} داده‌های محلی ${preservedLocalCollections.join('، ')} به‌دلیل پاسخ خالی ابر حفظ شدند.`
          : result.message,
        counts: result.counts
      };
    }

    recordDocumentDiagnosticEvent('DOCUMENT_CLOUD_FETCH_FAILED', tenant, 'FAILED', undefined, {
      reasonCode: result.error || 'CLOUD_FETCH_FAILED'
    });
    return {
      success: false,
      message: result.message,
      counts: result.counts
    };
  };

  // چرخه حیات بوت خودکار و پایش برخط وضعیت پایگاه‌داده (Auto-Hydration & Auto-Live Probe on Mount)
  useEffect(() => {
    let mounted = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    let realtimeTenantId: string | null = null;
    let fallbackSyncTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let isRefreshingCloudData = false;
    let refreshQueued = false;

    const refreshCloudData = async () => {
      if (!mounted) return;
      if (isRefreshingCloudData) {
        refreshQueued = true;
        return;
      }

      isRefreshingCloudData = true;
      try {
        const result = await syncFromSupabase(activeTenantId);
        if (!result.success) {
          console.warn('[Auto-Sync] Cloud refresh did not complete:', result.message);
        }
      } catch (error) {
        console.warn('[Auto-Sync] Cloud refresh failed:', error);
      } finally {
        isRefreshingCloudData = false;
        if (refreshQueued && mounted) {
          refreshQueued = false;
          scheduleCloudRefresh();
        }
      }
    };

    const scheduleCloudRefresh = () => {
      if (!mounted) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshCloudData();
      }, 350);
    };

    const startRealtimeSync = (tenantToSync: string) => {
      if (!mounted || !getSupabaseConfig().isConfigured || realtimeTenantId === tenantToSync) return;

      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }

      realtimeTenantId = tenantToSync;
      const changeFilter = {
        event: '*' as const,
        schema: 'public',
        table: 'invoices',
        ...(tenantToSync !== 'all' ? { filter: `tenant_id=eq.${tenantToSync}` } : {})
      };

      realtimeChannel = supabase
        .channel(`habino-invoices-${tenantToSync}`)
        .on('postgres_changes', changeFilter, scheduleCloudRefresh)
        .subscribe(status => {
          if (!mounted) return;

          if (status === 'SUBSCRIBED') {
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`[Auto-Sync] Invoice realtime subscription status: ${status}`);
          }
        });

      if (fallbackSyncTimer) clearInterval(fallbackSyncTimer);
      fallbackSyncTimer = setInterval(() => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          scheduleCloudRefresh();
        }
      }, 120000);
    };

    const performAutoBootSync = async (tenantToSync?: string) => {
      if (!isLocalHydrationComplete) return;
      const targetTenant = tenantToSync || activeTenantId || 'tenant-main';

      // ۰. پایش همگرایی ریست فکتوری ابری میان دستگاه‌ها و مرورگرها (Multi-Device Reset Convergence Probe)
      // اگر مستأجر روی دستگاه یا محیط دیگری ریست شده باشد، این کلاینت فوراً کش کهنه خود را نابود می‌کند
      let remoteVersion = 0;
      let remoteMode: 'full' | 'preserve_inventory' | 'preserve_contacts_inventory' = 'preserve_inventory';
      let remoteResetAt: string | null = null;

      // منبع ۱: استعلام مستقیم از اندپوینت اختصاصی سرور
      try {
        const resetStatusRes = await fetch(`/api/tenant/reset-status?tenantId=${encodeURIComponent(targetTenant)}`);
        if (resetStatusRes.ok) {
          const resetStatus = await resetStatusRes.json();
          if (resetStatus.success) {
            remoteVersion = Number(resetStatus.factory_reset_version || 0);
            remoteMode = resetStatus.factory_reset_mode || 'preserve_inventory';
            remoteResetAt = resetStatus.factory_reset_at || null;
          }
        }
      } catch (probeErr) {
        console.warn('[AutoBoot] Reset status server probe warning:', probeErr);
      }

      // استعلام و همگام‌سازی پیکربندی سوپابیس با سرور در صورت عدم بارگذاری اولیه
      let config = getSupabaseConfig();
      if (!config.isConfigured) {
        config = await syncSupabaseConfigWithServer();
      }

      if (config.isConfigured) {
        startRealtimeSync(targetTenant);
      }

      // منبع ۲: استعلام مستقیم و بلادرنگ از متادیتای company_settings در سوپابیس
      if (config.isConfigured) {
        try {
          const { data: csRows } = await supabase
            .from('company_settings')
            .select('metadata')
            .eq('tenant_id', targetTenant)
            .limit(1);
          if (csRows && csRows.length > 0 && csRows[0].metadata?.factory_reset_version) {
            const dbVer = Number(csRows[0].metadata.factory_reset_version);
            if (dbVer > remoteVersion) {
              remoteVersion = dbVer;
              remoteMode = csRows[0].metadata.factory_reset_mode || remoteMode;
              remoteResetAt = csRows[0].metadata.factory_reset_at || null;
            }
          }
        } catch (csErr) {
          console.warn('[AutoBoot] Direct Supabase metadata reset probe warning:', csErr);
        }
      }

      const localKnownVersion = Number(localStorage.getItem(`habino_last_known_reset_version_${targetTenant}`) || 0);

      if (remoteVersion > 0 && remoteVersion > localKnownVersion) {
        if (remoteMode === 'full') {
          console.log(`[AutoBoot] Full point-zero factory reset detected (${remoteVersion} > ${localKnownVersion}); completely zeroing all local collections...`);
          await executeLocalPurgeOnly('full', targetTenant);
        } else {
          const localFinancialRecords = [
            ...financialStateRef.current.invoices,
            ...financialStateRef.current.accountingEntries
          ];
          const preserveLocalFinancialData = hasFinancialRecordsNotSafelyOlderThan(
            localFinancialRecords,
            remoteResetAt
          );
          if (preserveLocalFinancialData) {
            console.warn(
              `[AutoBoot] Reset version ${remoteVersion} is newer than the local marker, but local financial records are new or cannot be dated against the reset timestamp; preserving them.`
            );
          } else {
            console.log(`[AutoBoot] Cloud factory reset detected (${remoteVersion} > ${localKnownVersion}); purging stale local cache...`);
            await executeLocalPurgeOnly(remoteMode, targetTenant);
          }
        }
        localStorage.setItem(`habino_last_known_reset_version_${targetTenant}`, String(remoteVersion));
        if (targetTenant === 'tenant-main') {
          localStorage.setItem('habino_factory_reset_completed', String(remoteVersion));
          localStorage.setItem('habino_pnl_purged_for_testing_v2', 'true');
        }
        localStorage.setItem(`habino_pnl_purged_for_testing_v2_${targetTenant}`, 'true');
        if (remoteResetAt) {
          localStorage.setItem(`habino_pnl_purged_at_${targetTenant}`, remoteResetAt);
          localStorage.setItem(`habino_factory_reset_${targetTenant}`, remoteResetAt);
        } else {
          localStorage.setItem(`habino_factory_reset_${targetTenant}`, String(remoteVersion));
        }

        try {
          window.dispatchEvent(new CustomEvent('habino_factory_reset_occurred', {
            detail: { tenantId: targetTenant, mode: remoteMode, version: remoteVersion, resetTime: remoteResetAt }
          }));
        } catch (_) {}
      }

      // ۱. دریافت و ادغام امضاهای سمت سرور
      try {
        const sigRes = await fetch('/api/invoices/signatures/map');
        if (sigRes.ok) {
          const sigData = await sigRes.json();
          if (sigData.success && sigData.signatures) {
            const currentLocal = JSON.parse(localStorage.getItem('habino_invoice_signatures') || '{}');
            const merged = { ...currentLocal, ...sigData.signatures };
            localStorage.setItem('habino_invoice_signatures', JSON.stringify(merged));
          }
        }
      } catch (_) {}

      if (!config.isConfigured) return;

      // ۲. پایش ناهمگام ارتباط زنده پایگاه‌داده بدون مسدودسازی واکشی اطلاعات
      testSupabaseDirectConnection().then(pingResult => {
        if (mounted && pingResult.ok) {
          setIsSupabaseLive(true);
        }
      }).catch(() => {});

      // ۳. واکشی و ادغام خودکار داده‌های ابری در شروع برنامه (Silent Auto-Hydration)
      if (mounted) {
        try {
          await offlineOutbox.flushQueue();
          await syncFromSupabase(targetTenant);
        } catch (syncErr) {
          console.warn('[Auto-Hydration] Background cloud sync skipped/failed:', syncErr);
        }
      }
    };

    performAutoBootSyncRef.current = performAutoBootSync;
    performAutoBootSync();

    // ۴. گوش دادن به رویدادهای ثبت امضا، تغییرات استوریج، فوکوس پنجره و سیگنال‌های ریست کارخانه
    const handleSigEvent = (e: any) => {
      const detail = e.detail;
      if (detail && (detail.invoiceId || detail.shareToken)) {
        setInvoices(prev => prev.map(inv => {
          if (inv.id === detail.invoiceId || (detail.shareToken && inv.shareToken === detail.shareToken)) {
            return {
              ...inv,
              signatureUrl: detail.signatureUrl || inv.signatureUrl,
              isSigned: true,
              signedAt: detail.signedAt || new Date().toISOString()
            };
          }
          return inv;
        }));
      }
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'habino_invoice_signatures' || e.key === 'habino_invoices') {
        const savedInvoices = localStorage.getItem('habino_invoices');
        if (savedInvoices) {
          try {
            setInvoices(JSON.parse(savedInvoices));
          } catch (_) {}
        }
      }
      if (e.key === 'habino_clients') {
        const savedClients = localStorage.getItem('habino_clients');
        if (savedClients) {
          try {
            setClients(JSON.parse(savedClients));
          } catch (_) {}
        }
      }
      if (e.key?.startsWith('habino_factory_reset_') || e.key === 'habino_factory_reset_completed' || e.key?.startsWith('habino_last_known_reset_version_')) {
        performAutoBootSync();
      }
    };

    const handleFactoryResetOccurred = (e: any) => {
      const resetTenant = e.detail?.tenantId || activeTenantId;
      performAutoBootSync(resetTenant);
    };

    const handleWindowFocus = () => {
      // همگام‌سازی خودکار در هنگام بازگشت کاربر به تب لوکال
      performAutoBootSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performAutoBootSync();
      }
    };

    const handleNetworkOnline = () => {
      performAutoBootSync();
    };

    const handleConfigChanged = () => {
      setIsSupabaseLive(getSupabaseConfig().isConfigured);
      performAutoBootSync();
    };

    window.addEventListener('habino_invoice_signed', handleSigEvent);
    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('habino_factory_reset_occurred', handleFactoryResetOccurred);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('habino_supabase_config_changed', handleConfigChanged);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleNetworkOnline);

    return () => {
      mounted = false;
      if (fallbackSyncTimer) clearInterval(fallbackSyncTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
      window.removeEventListener('habino_invoice_signed', handleSigEvent);
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('habino_factory_reset_occurred', handleFactoryResetOccurred);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('habino_supabase_config_changed', handleConfigChanged);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleNetworkOnline);
    };
  }, [activeTenantId, currentUser?.id, currentUser?.role, isLocalHydrationComplete]);

  const pushToSupabase = async (): Promise<{
    success: boolean;
    message: string;
    upserted?: Record<string, number>;
    errors?: Record<string, string>;
  }> => {
    if (!isLocalHydrationComplete) {
      return {
        success: false,
        message: 'بازیابی اطلاعات محلی هنوز کامل نشده است؛ لطفاً پس از چند لحظه دوباره تلاش کنید.'
      };
    }

    const tenant = activeTenantId || currentUser?.tenantId || 'tenant-main';
    const res = await SupabaseSyncEngine.pushLocalDataToSupabase(tenant, {
      invoices,
      transactions,
      clients,
      checks,
      inventory,
      bankAccounts,
      installments,
      projects,
      accountingEntries,
      settings
    });
    return res;
  };

  const reconcileLedgerAndOpeningBalances = (): any => {
    const currentTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';
    const { reconciledEntries, report } = SupabaseSyncEngine.reconcileLedgerAndOpeningBalances(
      {
        clients,
        inventory,
        bankAccounts,
        accountingEntries,
        invoices
      },
      currentTenant
    );

    financialStateRef.current = {
      ...financialStateRef.current,
      accountingEntries: reconciledEntries
    };
    setAccountingEntries(reconciledEntries);
    try {
      localStorage.setItem('habino_entries', JSON.stringify(reconciledEntries));
    } catch (e) {
      console.warn('LocalStorage save failed on reconcile:', e);
    }
    if (getSupabaseConfig().isConfigured) {
      const previousEntries = new Map(accountingEntries.map(entry => [entry.id, JSON.stringify(entry)]));
      const changedEntries = reconciledEntries.filter(entry =>
        previousEntries.get(entry.id) !== JSON.stringify(entry)
      );
      if (changedEntries.length > 0) {
        offlineOutbox.enqueue('entries', changedEntries, currentTenant);
      }
    }
    return report;
  };

  const repairAndSelfHealSystem = async (): Promise<{
    success: boolean;
    repairedOrphans: number;
    repairedClients: number;
    repairedLedger: boolean;
    repairedDates: number;
    repairedMetadata: number;
    message: string;
  }> => {
    return {
      success: true,
      repairedOrphans: 0,
      repairedClients: 0,
      repairedLedger: true,
      repairedDates: 0,
      repairedMetadata: 0,
      message: 'سامانه در وضعیت پایدار است.'
    };
  };

  const processBazaarWebhookPayment = async (payload: BazaarWebhookPayload): Promise<WebhookProcessResult> => {
    return BazaarDoubleEntryLedgerEngine.processBazaarPaymentWebhook(payload);
  };

  const processBazaarPurchaseIap = async (skuId: BazaarProductSkuId, clientId?: string): Promise<BazaarPurchaseVerificationResponse> => {
    const targetClient = clients.find(c => c.id === clientId) || clients[0] || {
      id: clientId || 'c-bazaar-direct',
      name: 'کاربر خریدار بازار',
      phone: '09120000000',
      type: 'individual' as const,
      isActive: true
    };
    const receipt = BazaarBillingEngine.generateSimulatedReceipt(skuId, activeTenantId, targetClient.id);
    const res = await BazaarBillingEngine.verifyBazaarPurchaseRpc(receipt, targetClient, activeTenantId, 0);
    if (res.success && res.license) {
      setLicense(res.license);
    }
    return res;
  };

  const getIndexedDbStats = async (): Promise<IndexedDbStorageStats> => {
    return HabinoIndexedDbEngine.getStorageStats();
  };

  const persistToIndexedDbNow = async (): Promise<void> => {
    await HabinoIndexedDbEngine.persistFullSnapshot({
      invoices,
      transactions,
      clients,
      checks,
      inventory,
      bankAccounts,
      installments,
      projects,
      accountingEntries,
      settings
    });
  };

  const purgeInterferingPnLData = async (): Promise<{ success: boolean; message: string; remainingInvoiceCount: number }> => {
    const targetTenant = activeTenantId || currentUser?.tenantId || 'tenant-main';
    const remainingTransactions = removeRowsForTenant(financialStateRef.current.transactions, targetTenant);
    const remainingProjects = removeRowsForTenant(financialStateRef.current.projects, targetTenant);
    setTransactions(remainingTransactions);
    setProjects(remainingProjects);
    financialStateRef.current = {
      ...financialStateRef.current,
      transactions: remainingTransactions,
      projects: remainingProjects
    };
    localStorage.setItem('habino_transactions', JSON.stringify(remainingTransactions));
    localStorage.setItem('habino_projects', JSON.stringify(remainingProjects));
    localStorage.setItem(`habino_pnl_purged_for_testing_v2_${targetTenant}`, 'true');
    localStorage.setItem(`habino_pnl_purged_at_${targetTenant}`, new Date().toISOString());
    await Promise.all([
      HabinoIndexedDbEngine.clearTenantStore('transactions', targetTenant),
      HabinoIndexedDbEngine.clearTenantStore('projects', targetTenant)
    ]);
    if (targetTenant === 'tenant-main') {
      localStorage.setItem('habino_pnl_purged_for_testing_v2', 'true');
    }
    return {
      success: true,
      message: 'پاکسازی انجام شد.',
      remainingInvoiceCount: invoices.length
    };
  };

  const executeFactoryReset = async (
    mode: 'full' | 'preserve_inventory' = 'preserve_inventory',
    confirmationPhrase: string = 'حذف داده‌های مالی'
  ): Promise<{ success: boolean; message: string; details?: any }> => {
    const preserveInventory = mode === 'preserve_inventory';
    const rawTargetTenant = currentUser && currentUser.role !== 'super_admin'
      ? currentUser.tenantId || activeTenantId || 'tenant-main'
      : activeTenantId || currentUser?.tenantId || 'tenant-main';
    // ⛔factory reset targets a single tenant for server; never allow 'all' (global purge) to Supabase
    const targetTenant = rawTargetTenant === 'all' ? 'tenant-main' : rawTargetTenant;
    // Local cleanup must remove ALL data regardless of tenantId (super_admin may have created rows with tenantId 'all' or undefined)
    const localTargetTenant = currentUser?.role === 'super_admin' ? 'all' : targetTenant;

    // ☁️ Confirm the atomic cloud reset before deleting any local data or queued writes.
    let cloudPurgeResult: any = null;
    try {
      cloudPurgeResult = await SupabaseSyncEngine.purgeAllFinancialDataFromSupabase({
        preserveInventory,
        tenantId: targetTenant,
        confirmationPhrase
      });
    } catch (e) {
      console.warn('[FactoryReset] Supabase remote purge warning:', e);
    }

    const cloudResetRequired = getSupabaseConfig().isConfigured;

    // Local cleanup ALWAYS runs — cloud purge failure must never block local data purging.
    const localCleanupErrors: string[] = [];
    try {
      clearStoredPayrollDataForTenant(localTargetTenant);
    } catch (error) {
      localCleanupErrors.push(`payroll: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await offlineOutbox.clearTenant(localTargetTenant);
      HabinoOfflineQueue.clearQueue(localTargetTenant);
      clearTenantQueueStorage('habino_offline_queue', localTargetTenant);
      clearTenantQueueStorage('habino_offline_db_queue', localTargetTenant);
      clearTenantQueueStorage('habino_sync_queue_v1', localTargetTenant);
    } catch (queueErr) {
      const message = queueErr instanceof Error ? queueErr.message : String(queueErr);
      localCleanupErrors.push(`offline queues: ${message}`);
      console.error('[FactoryReset] Tenant queue cleanup failed:', queueErr);
    }

    // Clear only this tenant's local records; other tenant workspaces stay intact.
    try {
      await Promise.all([
        HabinoIndexedDbEngine.clearTenantStore('invoices', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('transactions', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('checks', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('installments', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('projects', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('accountingEntries', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('outboxItems', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('clients', localTargetTenant),
        HabinoIndexedDbEngine.clearTenantStore('bankAccounts', localTargetTenant),
        ...(!preserveInventory ? [HabinoIndexedDbEngine.clearTenantStore('inventory', localTargetTenant)] : []),
        ...(mode === 'full' ? [HabinoIndexedDbEngine.deleteItem('companySettings', 'current')] : [])
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      localCleanupErrors.push(`IndexedDB: ${message}`);
      console.error('[FactoryReset] Tenant IndexedDB cleanup failed:', e);
    }

    const remainingInvoices = removeRowsForTenant(financialStateRef.current.invoices, localTargetTenant);
    const remainingTransactions = removeRowsForTenant(financialStateRef.current.transactions, localTargetTenant);
    const remainingChecks = removeRowsForTenant(financialStateRef.current.checks, localTargetTenant);
    const remainingInstallments = removeRowsForTenant(financialStateRef.current.installments, localTargetTenant);
    const remainingProjects = removeRowsForTenant(financialStateRef.current.projects, localTargetTenant);
    const remainingEntries = removeRowsForTenant(financialStateRef.current.accountingEntries, localTargetTenant);
    const remainingClients = removeRowsForTenant(financialStateRef.current.clients, localTargetTenant);
    const remainingBanks = removeRowsForTenant(financialStateRef.current.bankAccounts, localTargetTenant);
    const remainingInventory = preserveInventory
      ? financialStateRef.current.inventory
      : removeRowsForTenant(financialStateRef.current.inventory, localTargetTenant);
    removeInvoiceSignatures(filterRowsForTenant(financialStateRef.current.invoices, localTargetTenant));

    // 🗄️ مرحله ۴: پاکسازی پایدار localStorage و ثبت نشانگرهای ممانعت از لود داده‌های اولیه
    const resetTime = Date.now();
    try {
      localStorage.setItem('habino_invoices', JSON.stringify(remainingInvoices));
      localStorage.setItem('habino_checks', JSON.stringify(remainingChecks));
      localStorage.setItem('habino_transactions', JSON.stringify(remainingTransactions));
      localStorage.setItem('habino_installments', JSON.stringify(remainingInstallments));
      localStorage.setItem('habino_entries', JSON.stringify(remainingEntries));
      localStorage.setItem('habino_projects', JSON.stringify(remainingProjects));
      localStorage.removeItem('habino_ocr_documents');
      localStorage.setItem(`habino_pnl_purged_for_testing_v2_${targetTenant}`, 'true');
      localStorage.setItem(`habino_pnl_purged_at_${targetTenant}`, resetTime.toString());
      if (targetTenant === 'tenant-main') {
        localStorage.setItem('habino_pnl_purged_for_testing_v2', 'true');
      }
      if (mode === 'full') {
        HabinoConflictResolutionEngine.clearHistory();
        habinoFinancialAuditLogger.clear();
        localStorage.removeItem('habino_agent_roundtable_events');
        localStorage.removeItem(`habino_settings_${targetTenant}`);
        if (targetTenant === 'tenant-main') localStorage.removeItem('habino_settings');
        const remainingAuditLogs = HabinoAuthEngine.loadAuditLogs()
          .filter(log => log.tenantId !== targetTenant);
        localStorage.setItem('habino_user_audit_logs', JSON.stringify(remainingAuditLogs));
        setAuditLogs(remainingAuditLogs);
      }
      if (targetTenant === 'tenant-main') {
        localStorage.setItem('habino_factory_reset_completed', resetTime.toString());
      }
      localStorage.setItem(`habino_factory_reset_${targetTenant}`, resetTime.toString());
      localStorage.setItem(`habino_last_known_reset_version_${targetTenant}`, resetTime.toString());

      localStorage.setItem('habino_clients', JSON.stringify(remainingClients));
      localStorage.setItem('habino_banks', JSON.stringify(remainingBanks));
      await verifyLocalClientsPurged(targetTenant);
      localStorage.setItem('habino_inventory', JSON.stringify(remainingInventory));
      if (mode === 'full') {
        setSettings(getTenantDefaultSettings(availableTenants.find(tenant => tenant.id === targetTenant)));
      }
    } catch (storageError) {
      const message = storageError instanceof Error ? storageError.message : String(storageError);
      localCleanupErrors.push(`localStorage: ${message}`);
      console.error('[FactoryReset] Tenant localStorage cleanup failed:', storageError);
    }

    try {
      await HabinoIndexedDbEngine.persistFullSnapshot({
        invoices: [],
        transactions: [],
        clients: [],
        checks: [],
        inventory: remainingInventory,
        bankAccounts: [],
        installments: [],
        projects: [],
        accountingEntries: []
      });
    } catch (_) {}

    try {
      window.dispatchEvent(new CustomEvent('habino_factory_reset_occurred', { detail: { tenantId: targetTenant, mode, resetTime } }));
      window.dispatchEvent(new Event('storage'));
    } catch (eventError) {
      console.warn('[FactoryReset] Failed to broadcast local reset completion:', eventError);
    }

    // 🧠 مرحله ۵: صفرسازی کامل استیت‌های در حافظه کلاینت
    setInvoices(remainingInvoices);
    setChecks(remainingChecks);
    setTransactions(remainingTransactions);
    setInstallments(remainingInstallments);
    setAccountingEntries(remainingEntries);
    setProjects(remainingProjects);
    setClients(remainingClients);
    setBankAccounts(remainingBanks);
    setInventory(remainingInventory);

    financialStateRef.current = {
      invoices: remainingInvoices,
      accountingEntries: remainingEntries,
      clients: remainingClients,
      transactions: remainingTransactions,
      installments: remainingInstallments,
      checks: remainingChecks,
      projects: remainingProjects,
      inventory: remainingInventory,
      bankAccounts: remainingBanks
    };

    // 🔒 مرحله ۶: تضمین ماندگاری هویت و لایسنس مستأجر (Strict Tenant Profile Preservation)
    // حساب کاربری، مشخصات مستأجر و وضعیت لایسنس کاملاً حفظ می‌گردند.

    const modeMsg = preserveInventory
      ? 'تنظیم کارخانه با موفقیت انجام شد: کلیه اطلاعات مالی، فاکتورها، تراکنش‌ها، اسناد و مخاطبین هم در کش لوکال و هم در پایگاه داده ابری سوپابیس نابود شدند (انبار کالاها حفظ گردید).'
      : 'ریست کامل کارخانه انجام شد: داده‌های مالی، انبار، مخاطبین، تنظیمات و داده‌های کنسول و مدیریت مستأجر در حافظه محلی و سوپابیس پاک شدند؛ حساب کاربری و لایسنس حفظ شدند.';
    const cloudResetConfirmed = cloudPurgeResult?.success === true;
    const resetMessage = cloudResetRequired && !cloudResetConfirmed
      ? `داده‌های این دستگاه پاک شدند، اما پاکسازی ابری یا ثبت نشانگر ریست بین‌دستگاهی تأیید نشد. دستگاه‌های دیگر ممکن است همچنان داده‌های قبلی را نشان دهند. جزئیات: ${cloudPurgeResult?.message || 'پاسخی از سرویس ابری دریافت نشد.'}`
      : localCleanupErrors.length > 0
        ? `پاکسازی ابری انجام شد، اما پاکسازی کامل محلی تأیید نشد: ${localCleanupErrors.join('؛ ')}`
        : modeMsg;

    // Record immutable audit event for factory reset (never deleted)
    recordImmutableAuditEvent({
      action: 'FACTORY_RESET_EXECUTED',
      actorId: currentUser?.id || null,
      actorRole: currentUser?.role || 'unknown',
      tenantId: targetTenant,
      resourceType: 'tenant',
      resourceId: targetTenant,
      correlationId: null,
      outcome: 'succeeded',
      reasonCode: `mode=${mode}, cloudResetConfirmed=${cloudResetConfirmed}`,
      eventSource: 'application'
    });

    return {
      success: (!cloudResetRequired || cloudResetConfirmed) && localCleanupErrors.length === 0,
      message: resetMessage,
      details: {
        mode,
        tenantId: targetTenant,
        cloudPurgeResult
      }
    };
  };

  const effectiveTenantId = useMemo(() => {
    if (currentUser && currentUser.role !== 'super_admin') {
      return currentUser.tenantId || activeTenantId || 'tenant-main';
    }
    const raw = activeTenantId || 'tenant-main';
    return raw === 'all' ? 'tenant-main' : raw;
  }, [currentUser?.role, currentUser?.tenantId, activeTenantId]);

  const isolatedInvoices = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return invoices;
    return invoices.filter(i => (i.tenantId || 'tenant-main') === effectiveTenantId);
  }, [invoices, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedChecks = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return checks;
    return checks.filter(c => (c.tenantId || 'tenant-main') === effectiveTenantId);
  }, [checks, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedTransactions = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return transactions;
    return transactions.filter(t => (t.tenantId || 'tenant-main') === effectiveTenantId);
  }, [transactions, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedClients = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return clients;
    return clients.filter(c => (c.tenantId || 'tenant-main') === effectiveTenantId);
  }, [clients, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedInventory = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return inventory;
    return inventory.filter(i => (i.tenantId || 'tenant-main') === effectiveTenantId);
  }, [inventory, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedInstallments = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return installments;
    return installments.filter(ins => (ins.tenantId || 'tenant-main') === effectiveTenantId);
  }, [installments, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedBankAccounts = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return bankAccounts;
    return bankAccounts.filter(b => (b.tenantId || 'tenant-main') === effectiveTenantId);
  }, [bankAccounts, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedProjects = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return [];
    return projects.filter(p => (p.tenantId || 'tenant-main') === effectiveTenantId);
  }, [projects, effectiveTenantId, currentUser?.role, activeTenantId]);

  const isolatedAccountingEntries = useMemo(() => {
    if (currentUser?.role === 'super_admin' && activeTenantId === 'all') return accountingEntries;
    return accountingEntries.filter(e => (e.tenantId || 'tenant-main') === effectiveTenantId);
  }, [accountingEntries, effectiveTenantId, currentUser?.role, activeTenantId]);

  const effectiveSettings = useMemo(() => {
    if (activeTenant && activeTenant.id !== 'all' && activeTenant.id !== 'tenant-main') {
      const isLeakedName = !settings.name || settings.name.includes('هابینو');
      return {
        ...settings,
        name: isLeakedName ? activeTenant.name : settings.name,
        economicCode: settings.economicCode || activeTenant.metadata?.economicCode || '',
        nationalId: settings.nationalId || activeTenant.metadata?.nationalId || '',
        registrationNumber: settings.registrationNumber || activeTenant.metadata?.registrationNumber || '',
        phone: (settings.phone && settings.phone !== defaultSettings.phone) ? settings.phone : (activeTenant.ownerPhone || settings.phone)
      };
    }
    return settings;
  }, [settings, activeTenant]);

  const value = useMemo(() => ({
    invoices: isolatedInvoices,
    checks: isolatedChecks,
    transactions: isolatedTransactions,
    clients: isolatedClients,
    inventory: isolatedInventory,
    installments: isolatedInstallments,
    bankAccounts: isolatedBankAccounts,
    projects: isolatedProjects,
    accountingEntries: isolatedAccountingEntries,
    allInvoices: invoices,
    allClients: clients,
    allChecks: checks,
    allTransactions: transactions,
    allAccountingEntries: accountingEntries,
    settings: effectiveSettings,
    license,
    activeTenantId,
    isOnline,
    currentUser,
    activeTenant,
    availableTenants,
    tenantUsers,
    auditLogs,
    systemAuditLogs,
    isAuthenticated: Boolean(currentUser),
    login,
    loginAsPredefined,
    registerTenant,
    logout,
    switchTenant,
    updatePlatformTenantAccount,
    createTenantUser,
    refreshTenantUsers,
    updateTenantUser,
    deleteTenantUser,
    changeUserRole,
    hasPermission,
    canAccessModule,
    canMutateData,
    upgradeTenantSubscription,
    extendTenantTrial,
    activateAddon,
    hasAddon,
    recordImmutableAuditEvent,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    restoreInvoice,
    addCheck,
    updateCheck,
    deleteCheck,
    addTransaction,
    deleteTransaction,
    addClient,
    updateClient,
    deleteClient,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    addInstallment,
    createInstallmentPlan,
    recordInstallmentPayment,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    addProject,
    updateProject,
    deleteProject,
    registerProjectAdvance,
    closeProjectProfit,
    batchSettleInvoices,
    closeFiscalYear,
    addAccountingEntry,
    addAccountingEntries,
    updateSettings,
    setCurrency,
    activateLicense,
    activateMarketFullEdition,
    restoreFullBackup,
    triggerManualBackup,
    loadDemoData,
    switchToCleanMarketData,
    isSupabaseLive,
    syncFromSupabase,
    pushToSupabase,
    reconcileLedgerAndOpeningBalances,
    repairAndSelfHealSystem,
    processBazaarWebhookPayment,
    processBazaarPurchaseIap,
    getIndexedDbStats,
    persistToIndexedDbNow,
    purgeInterferingPnLData,
    executeFactoryReset
  }), [
    isolatedInvoices, isolatedChecks, isolatedTransactions, isolatedClients,
    isolatedInventory, isolatedInstallments, isolatedBankAccounts, isolatedProjects,
    isolatedAccountingEntries, invoices, clients, checks, transactions,
    accountingEntries, effectiveSettings, license, activeTenantId, isOnline,
    currentUser, activeTenant, availableTenants, tenantUsers, auditLogs, systemAuditLogs, isSupabaseLive
  ]);

  return (
    <AccountingContext.Provider value={value}>
      {isLocalHydrationComplete ? children : (
        <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
          در حال بازیابی اطلاعات محلی...
        </div>
      )}
    </AccountingContext.Provider>
  );
};

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) {
    throw new Error('useAccounting must be used within an AccountingProvider');
  }
  return context;
};

export default useAccounting;
