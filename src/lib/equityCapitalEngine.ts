import {
  AccountingEntry,
  EquityCompanyProfile,
  EquityOwnershipPosition,
  FixedAssetRecord
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { resolveAccountCoding } from './chartOfAccountsData';
import { fromPostgresDate } from './dateUtils';

const SHARE_CAPITAL_ACCOUNT = '30101';
const UNCALLED_CAPITAL_ACCOUNT = '30104';
const SHARE_PREMIUM_ACCOUNT = '30105';
const REVALUATION_RESERVE_ACCOUNT = '30301';
const STATUTORY_RESERVE_ACCOUNT = '30401';
const OPTIONAL_RESERVE_ACCOUNT = '30402';
const RETAINED_EARNINGS_ACCOUNT = '30201';
const DIVIDENDS_PAYABLE_ACCOUNT = '20402';

export interface EquityJournalLineInput {
  accountCode: string;
  accountTitle: string;
  debit: number;
  credit: number;
  description: string;
  tafsiliCode?: string;
  tafsiliTitle?: string;
  tafsiliType?: AccountingEntry['tafsiliType'];
}

export interface StatutoryReserveAllocation {
  allocation: number;
  endingReserve: number;
  targetReserve: number;
}

export const calculateNetProfitForPeriod = (
  entries: AccountingEntry[],
  periodStart: string,
  periodEnd: string
): number => {
  const start = fromPostgresDate(periodStart);
  const end = fromPostgresDate(periodEnd);
  if (!start || !end || start > end) throw new Error('Profit calculation requires a valid ordered reporting period.');

  return entries.reduce((netProfit, entry) => {
    const date = fromPostgresDate(entry.date);
    if (!date || date < start || date > end || entry.documentNumber?.startsWith('DOC-OPN-')) return netProfit;
    const groupCode = entry.groupCode || resolveAccountCoding(entry.accountCode).group?.code;
    if (groupCode === '6') return netProfit + (Number(entry.credit) || 0) - (Number(entry.debit) || 0);
    if (groupCode === '7' || groupCode === '8') {
      return netProfit - ((Number(entry.debit) || 0) - (Number(entry.credit) || 0));
    }
    return netProfit;
  }, 0);
};

export const validateFixedAssetRecord = (asset: FixedAssetRecord): string[] => {
  const errors: string[] = [];
  if (!asset.assetTag.trim() || !asset.title.trim()) errors.push('Fixed asset tag and title are required.');
  if (!Number.isFinite(asset.grossCost) || asset.grossCost <= 0) errors.push('Fixed asset gross cost must be positive.');
  if (!Number.isFinite(asset.accumulatedDepreciation) || asset.accumulatedDepreciation < 0 || asset.accumulatedDepreciation > asset.grossCost) {
    errors.push('Accumulated depreciation must be between zero and gross cost.');
  }
  if (!Number.isFinite(asset.residualValue) || asset.residualValue < 0 || asset.residualValue > asset.grossCost) {
    errors.push('Residual value must be between zero and gross cost.');
  }
  if (asset.assetClass === 'land' && asset.depreciationMethod !== 'none') {
    errors.push('Land defaults to non-depreciable; a different treatment requires a documented exception.');
  }
  if (asset.depreciationMethod !== 'none' &&
    (!Number.isInteger(asset.usefulLifeMonths) || (asset.usefulLifeMonths || 0) <= 0)) {
    errors.push('Depreciable assets require a positive documented useful life.');
  }
  if (!asset.valuationReference.trim() || !asset.journalDocumentNumber.startsWith('DOC-OPN-')) {
    errors.push('Opening fixed assets require a supporting valuation reference and opening journal number.');
  }
  if (asset.accumulatedDepreciation > asset.grossCost - asset.residualValue + 0.01) {
    errors.push('Accumulated depreciation cannot reduce the carrying amount below residual value.');
  }
  return errors;
};

export const buildOpeningShareCapitalJournal = (params: {
  tenantId: string;
  documentNumber: string;
  effectiveDate: string;
  profile: EquityCompanyProfile;
  positions: EquityOwnershipPosition[];
}): Omit<AccountingEntry, 'id'>[] => {
  const validationErrors = validateEquityOpeningProfile(params.profile, params.positions);
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '));

  const paidCapital = params.positions.reduce((total, position) => total + position.paidCapital, 0);
  const uncalledCapital = params.profile.registeredCapital - paidCapital;
  const lines: EquityJournalLineInput[] = [];

  if (paidCapital > 0) {
    lines.push({
      accountCode: '30103',
      accountTitle: 'حساب تراز افتتاحیه',
      debit: paidCapital,
      credit: 0,
      description: 'طبقه‌بندی مانده افتتاحیه به آورده پرداخت‌شده شرکا'
    });
  }
  if (uncalledCapital > 0) {
    lines.push({
      accountCode: UNCALLED_CAPITAL_ACCOUNT,
      accountTitle: 'سرمایه تعهدشده پرداخت‌نشده',
      debit: uncalledCapital,
      credit: 0,
      description: 'ثبت سرمایه تعهدشده پرداخت‌نشده'
    });
  }
  params.positions.filter(position => position.committedCapital > 0).forEach(position => {
    lines.push({
      accountCode: SHARE_CAPITAL_ACCOUNT,
      accountTitle: 'سرمایه ثبت‌شده',
      debit: 0,
      credit: position.committedCapital,
      description: `سرمایه تعهدشده شریک ${position.ownerName}`,
      tafsiliCode: position.ownerTafsiliCode,
      tafsiliTitle: position.ownerName,
      tafsiliType: 'partner'
    });
  });

  return createEquityJournalEntries({
    tenantId: params.tenantId,
    documentNumber: params.documentNumber,
    date: params.effectiveDate,
    lines
  });
};

export const buildOpeningEquityClassificationJournal = (params: {
  tenantId: string;
  documentNumber: string;
  effectiveDate: string;
  amount: number;
  accountCode: '30201' | '30301' | '30401' | '30402';
  accountTitle: string;
  approvalReference: string;
}): Omit<AccountingEntry, 'id'>[] => {
  if (!Number.isFinite(params.amount) || params.amount === 0 || !params.approvalReference.trim()) {
    throw new Error('Opening equity classification requires a non-zero amount and supporting reference.');
  }
  const amount = Math.abs(params.amount);
  const classificationIsCredit = params.amount > 0;
  return createEquityJournalEntries({
    tenantId: params.tenantId,
    documentNumber: params.documentNumber,
    date: params.effectiveDate,
    lines: [
      {
        accountCode: '30103',
        accountTitle: 'حساب تراز افتتاحیه',
        debit: classificationIsCredit ? amount : 0,
        credit: classificationIsCredit ? 0 : amount,
        description: `طبقه‌بندی مستند حساب تراز افتتاحیه: ${params.approvalReference}`
      },
      {
        accountCode: params.accountCode,
        accountTitle: params.accountTitle,
        debit: classificationIsCredit ? 0 : amount,
        credit: classificationIsCredit ? amount : 0,
        description: `طبقه‌بندی مانده افتتاحیه بر اساس ${params.approvalReference}`
      }
    ]
  });
};

export const buildShareIssueJournal = (params: {
  tenantId: string;
  eventId: string;
  effectiveDate: string;
  nominalShareValue: number;
  sourceAccountCode: string;
  sourceAccountTitle: string;
  unpaidCapital: number;
  sharePremium: number;
  allocations: Array<{ ownerTafsiliCode: string; ownerName: string; shareCount: number }>;
}): Omit<AccountingEntry, 'id'>[] => {
  const totalShares = params.allocations.reduce((total, allocation) => total + allocation.shareCount, 0);
  const capitalIncrease = totalShares * params.nominalShareValue;
  const paidAmount = capitalIncrease + params.sharePremium - params.unpaidCapital;
  if (
    !Number.isFinite(params.nominalShareValue) || params.nominalShareValue <= 0 ||
    !Number.isInteger(totalShares) || totalShares <= 0 ||
    params.allocations.some(allocation => !allocation.ownerTafsiliCode || !allocation.ownerName.trim() ||
      !Number.isInteger(allocation.shareCount) || allocation.shareCount < 0) ||
    params.unpaidCapital < 0 || params.unpaidCapital > capitalIncrease ||
    params.sharePremium < 0 || paidAmount < 0
  ) {
    throw new Error('Share issue allocations, nominal value, unpaid capital, or share premium are invalid.');
  }
  const lines: EquityJournalLineInput[] = [
    ...(paidAmount > 0 ? [{
      accountCode: params.sourceAccountCode,
      accountTitle: params.sourceAccountTitle,
      debit: paidAmount,
      credit: 0,
      description: 'منبع مستند صدور سهام جدید'
    }] : []),
    ...(params.unpaidCapital > 0 ? [{
      accountCode: UNCALLED_CAPITAL_ACCOUNT,
      accountTitle: 'سرمایه تعهدشده پرداخت‌نشده',
      debit: params.unpaidCapital,
      credit: 0,
      description: 'ثبت سرمایه تعهدشده سهام جدید پرداخت‌نشده'
    }] : []),
    ...params.allocations.filter(allocation => allocation.shareCount > 0).map(allocation => ({
      accountCode: SHARE_CAPITAL_ACCOUNT,
      accountTitle: 'سرمایه ثبت‌شده',
      debit: 0,
      credit: allocation.shareCount * params.nominalShareValue,
      description: `صدور ${allocation.shareCount} سهم به ${allocation.ownerName}`,
      tafsiliCode: allocation.ownerTafsiliCode,
      tafsiliTitle: allocation.ownerName,
      tafsiliType: 'partner' as const
    })),
    ...(params.sharePremium > 0 ? [{
      accountCode: SHARE_PREMIUM_ACCOUNT,
      accountTitle: 'صرف سهام',
      debit: 0,
      credit: params.sharePremium,
      description: 'صرف سهام مصوب'
    }] : [])
  ];
  return createEquityJournalEntries({
    tenantId: params.tenantId,
    documentNumber: `DOC-EQT-${params.eventId}`,
    date: params.effectiveDate,
    lines,
    referenceId: params.eventId
  });
};

const amountIsValid = (amount: number): boolean => Number.isFinite(amount) && amount >= 0;

export const validateEquityOpeningProfile = (
  profile: EquityCompanyProfile,
  positions: EquityOwnershipPosition[]
): string[] => {
  const errors: string[] = [];
  if (!amountIsValid(profile.registeredCapital)) errors.push('Registered capital must be a finite non-negative amount.');
  if (positions.some(position =>
    !position.ownerTafsiliCode ||
    !position.ownerName.trim() ||
    !amountIsValid(position.ownershipPercent) ||
    !amountIsValid(position.committedCapital) ||
    !amountIsValid(position.paidCapital) ||
    position.paidCapital > position.committedCapital
  )) {
    errors.push('Every owner position must have a valid partner, ownership percentage, and paid/committed capital.');
  }

  const totalPercent = positions.reduce((total, position) => total + position.ownershipPercent, 0);
  if (positions.length > 0 && Math.abs(totalPercent - 100) > 0.01) {
    errors.push('Active owner percentages must total 100%.');
  }

  if (profile.legalForm === 'joint_stock') {
    const authorizedShares = Number(profile.authorizedShares);
    const issuedShares = Number(profile.issuedShares);
    const nominalShareValue = Number(profile.nominalShareValue);
    const heldShares = positions.reduce((total, position) => total + (Number(position.shareCount) || 0), 0);
    const committedCapital = positions.reduce((total, position) => total + position.committedCapital, 0);
    if (!Number.isInteger(authorizedShares) || authorizedShares <= 0) {
      errors.push('A joint-stock company requires a positive authorized share count.');
    }
    if (!Number.isInteger(issuedShares) || issuedShares <= 0 || issuedShares > authorizedShares) {
      errors.push('Issued shares must be positive and cannot exceed authorized shares.');
    }
    if (!Number.isFinite(nominalShareValue) || nominalShareValue <= 0) {
      errors.push('A positive nominal value per share is required.');
    }
    if (Number.isFinite(issuedShares) && Number.isFinite(nominalShareValue) &&
      Math.abs(profile.registeredCapital - issuedShares * nominalShareValue) > 0.01) {
      errors.push('Registered capital must equal issued shares multiplied by nominal value.');
    }
    if (Number.isInteger(issuedShares) && Math.abs(heldShares - issuedShares) > 0.000001) {
      errors.push('Owner share counts must equal the issued share count.');
    }
    if (Math.abs(committedCapital - profile.registeredCapital) > 0.01) {
      errors.push('Shareholder commitments must equal registered capital.');
    }
    if (Number.isInteger(issuedShares) && issuedShares > 0 && positions.some(position =>
      Math.abs(position.ownershipPercent - (Number(position.shareCount) || 0) / issuedShares * 100) > 0.01
    )) {
      errors.push('Each shareholder ownership percentage must match their issued-share proportion.');
    }
  } else if (positions.length > 0) {
    const committedCapital = positions.reduce((total, position) => total + position.committedCapital, 0);
    if (Math.abs(committedCapital - profile.registeredCapital) > 0.01) {
      errors.push('Partner commitments must equal registered capital.');
    }
  }

  return errors;
};

export const calculateRightsEntitlements = (
  positions: EquityOwnershipPosition[],
  newShares: number
): Array<{ ownerTafsiliCode: string; entitledShares: number }> => {
  const totalShares = positions.reduce((total, position) => total + (Number(position.shareCount) || 0), 0);
  if (!Number.isInteger(newShares) || newShares <= 0 || totalShares <= 0) {
    throw new Error('Rights entitlement requires positive new shares and an existing share register.');
  }
  return positions.map(position => ({
    ownerTafsiliCode: position.ownerTafsiliCode,
    entitledShares: newShares * (Number(position.shareCount) || 0) / totalShares
  }));
};

  export const allocateWholeShareRights = (
    positions: EquityOwnershipPosition[],
    newShares: number
  ): Array<{ ownerTafsiliCode: string; entitledShares: number }> => {
    const entitlements = calculateRightsEntitlements(positions, newShares);
    const allocations = entitlements.map(entitlement => ({
      ownerTafsiliCode: entitlement.ownerTafsiliCode,
      entitledShares: Math.floor(entitlement.entitledShares),
      remainder: entitlement.entitledShares - Math.floor(entitlement.entitledShares)
    }));
    let unallocated = newShares - allocations.reduce((total, allocation) => total + allocation.entitledShares, 0);
    const priority = [...allocations].sort((left, right) => right.remainder - left.remainder);
    for (let index = 0; index < priority.length && unallocated > 0; index++, unallocated--) {
      priority[index].entitledShares += 1;
    }
    return allocations.map(({ ownerTafsiliCode, entitledShares }) => ({ ownerTafsiliCode, entitledShares }));
  };

export const transferPartnershipInterest = (
    positions: EquityOwnershipPosition[],
    fromOwnerCode: string,
    toOwner: Pick<EquityOwnershipPosition, 'ownerTafsiliCode' | 'ownerName'>,
    ownershipPercent: number,
    effectiveDate: string
  ): EquityOwnershipPosition[] => {
    if (!Number.isFinite(ownershipPercent) || ownershipPercent <= 0 || fromOwnerCode === toOwner.ownerTafsiliCode) {
      throw new Error('A partnership interest transfer requires a positive percentage and two different owners.');
    }
    const seller = positions.find(position => position.ownerTafsiliCode === fromOwnerCode);
    if (!seller || seller.ownershipPercent + 0.000001 < ownershipPercent) {
      throw new Error('The transferor does not hold enough ownership interest.');
    }
    const buyer = positions.find(position => position.ownerTafsiliCode === toOwner.ownerTafsiliCode);
    const proportion = ownershipPercent / seller.ownershipPercent;
    const transferredCommittedCapital = seller.committedCapital * proportion;
    const transferredPaidCapital = seller.paidCapital * proportion;
    const next = positions.filter(position =>
      position.ownerTafsiliCode !== fromOwnerCode && position.ownerTafsiliCode !== toOwner.ownerTafsiliCode
    );
    const sellerPercent = seller.ownershipPercent - ownershipPercent;
    if (sellerPercent >= 0) {
      next.push({
        ...seller,
        id: uuidv4(),
        effectiveDate,
        ownershipPercent: sellerPercent,
        committedCapital: seller.committedCapital - transferredCommittedCapital,
        paidCapital: seller.paidCapital - transferredPaidCapital
      });
    }
    next.push({
      ...(buyer || seller),
      id: uuidv4(),
      ownerTafsiliCode: toOwner.ownerTafsiliCode,
      ownerName: toOwner.ownerName,
      effectiveDate,
      ownershipPercent: (buyer?.ownershipPercent || 0) + ownershipPercent,
      committedCapital: (buyer?.committedCapital || 0) + transferredCommittedCapital,
      paidCapital: (buyer?.paidCapital || 0) + transferredPaidCapital
    });
    return next;
  };

export const allocateDividendByOwnership = (
    totalDividend: number,
    positions: EquityOwnershipPosition[]
  ): Array<{ ownerTafsiliCode: string; ownerName: string; amount: number }> => {
    if (!Number.isFinite(totalDividend) || totalDividend <= 0 || positions.length === 0) {
      throw new Error('Dividend allocation requires a positive amount and at least one owner.');
    }
    const totalPercent = positions.reduce((total, position) => total + position.ownershipPercent, 0);
    if (Math.abs(totalPercent - 100) > 0.01) throw new Error('Dividend allocation requires ownership percentages totaling 100%.');
    let allocated = 0;
    return positions.map((position, index) => {
      const amount = index === positions.length - 1
        ? Math.round((totalDividend - allocated) * 100) / 100
        : Math.round(totalDividend * position.ownershipPercent / 100 * 100) / 100;
      allocated += amount;
      return { ownerTafsiliCode: position.ownerTafsiliCode, ownerName: position.ownerName, amount };
    });
  };

export const transferShares = (
  positions: EquityOwnershipPosition[],
  fromOwnerCode: string,
  toOwner: Pick<EquityOwnershipPosition, 'ownerTafsiliCode' | 'ownerName'>,
  shares: number,
  effectiveDate: string
): EquityOwnershipPosition[] => {
  if (!Number.isInteger(shares) || shares <= 0 || fromOwnerCode === toOwner.ownerTafsiliCode) {
    throw new Error('A share transfer requires a positive whole-share quantity and two different owners.');
  }
  const seller = positions.find(position => position.ownerTafsiliCode === fromOwnerCode);
  if (!seller || (Number(seller.shareCount) || 0) < shares) {
    throw new Error('The transferor does not hold enough shares.');
  }

  const totalShares = positions.reduce((total, position) => total + (Number(position.shareCount) || 0), 0);
  const buyer = positions.find(position => position.ownerTafsiliCode === toOwner.ownerTafsiliCode);
  const next = positions
    .filter(position => position.ownerTafsiliCode !== fromOwnerCode && position.ownerTafsiliCode !== toOwner.ownerTafsiliCode)
    .map(position => ({ ...position, effectiveDate }));
  const sellerShares = (Number(seller.shareCount) || 0) - shares;
  const buyerShares = (Number(buyer?.shareCount) || 0) + shares;
  const shareProportion = shares / Math.max(1, Number(seller.shareCount) || 0);
  const transferredCommittedCapital = seller.committedCapital * shareProportion;
  const transferredPaidCapital = seller.paidCapital * shareProportion;

  if (sellerShares >= 0) {
    next.push({
      ...seller,
      id: uuidv4(),
      effectiveDate,
      shareCount: sellerShares,
      committedCapital: seller.committedCapital - transferredCommittedCapital,
      paidCapital: seller.paidCapital - transferredPaidCapital,
      ownershipPercent: totalShares ? sellerShares / totalShares * 100 : 0
    });
  }
  next.push({
    ...(buyer || seller),
    id: uuidv4(),
    ownerTafsiliCode: toOwner.ownerTafsiliCode,
    ownerName: toOwner.ownerName,
    effectiveDate,
    shareCount: buyerShares,
    ownershipPercent: totalShares ? buyerShares / totalShares * 100 : 0,
    committedCapital: (buyer?.committedCapital || 0) + transferredCommittedCapital,
    paidCapital: (buyer?.paidCapital || 0) + transferredPaidCapital
  });
  return next;
};

export const calculateStatutoryReserveAllocation = (
  netProfit: number,
  currentReserve: number,
  registeredCapital: number,
  requiredRate = 0.05,
  reserveCapRate = 0.1
): StatutoryReserveAllocation => {
  if (![netProfit, currentReserve, registeredCapital, requiredRate, reserveCapRate].every(Number.isFinite) ||
    netProfit < 0 || currentReserve < 0 || registeredCapital < 0 || requiredRate < 0 || reserveCapRate < 0) {
    throw new Error('Reserve calculation inputs must be finite non-negative values.');
  }
  const targetReserve = registeredCapital * reserveCapRate;
  const requiredAllocation = netProfit * requiredRate;
  const allocation = Math.min(requiredAllocation, Math.max(0, targetReserve - currentReserve));
  return { allocation, endingReserve: currentReserve + allocation, targetReserve };
};

export const createEquityJournalEntries = (params: {
  tenantId: string;
  documentNumber: string;
  date: string;
  lines: EquityJournalLineInput[];
  referenceId?: string;
}): Omit<AccountingEntry, 'id'>[] => {
  const { lines } = params;
  if (lines.length < 2 || lines.some(line =>
    !line.accountCode || !line.accountTitle || !line.description.trim() ||
    !amountIsValid(line.debit) || !amountIsValid(line.credit) ||
    (line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0)
  )) {
    throw new Error('Equity journal lines must have an account, description, and one positive debit or credit amount.');
  }
  const debit = lines.reduce((total, line) => total + line.debit, 0);
  const credit = lines.reduce((total, line) => total + line.credit, 0);
  if (Math.abs(debit - credit) > 0.01) throw new Error('Equity journal entries must balance.');

  return lines.map(line => ({
    tenantId: params.tenantId,
    documentNumber: params.documentNumber,
    date: params.date,
    description: line.description,
    accountCode: line.accountCode,
    accountTitle: line.accountTitle,
    debit: line.debit,
    credit: line.credit,
    referenceId: params.referenceId,
    tafsiliCode: line.tafsiliCode,
    tafsiliTitle: line.tafsiliTitle,
    tafsiliType: line.tafsiliType
  }));
};

export const buildFixedAssetOpeningJournal = (params: {
  tenantId: string;
  documentNumber: string;
  date: string;
  asset: FixedAssetRecord;
  offsetAccountCode: string;
  offsetAccountTitle: string;
  partnerTafsiliCode?: string;
  partnerTafsiliTitle?: string;
}): Omit<AccountingEntry, 'id'>[] => {
  const errors = validateFixedAssetRecord(params.asset);
  if (errors.length > 0) throw new Error(errors.join(' '));
  const netBookValue = params.asset.grossCost - params.asset.accumulatedDepreciation;
  const partnerDetail = params.offsetAccountCode === '30101'
    ? {
        tafsiliCode: params.partnerTafsiliCode,
        tafsiliTitle: params.partnerTafsiliTitle,
        tafsiliType: 'partner' as const
      }
    : {};
  return createEquityJournalEntries({
    tenantId: params.tenantId,
    documentNumber: params.documentNumber,
    date: params.date,
    referenceId: params.asset.id,
    lines: [
      {
        accountCode: params.asset.accountCode,
        accountTitle: params.asset.title,
        debit: params.asset.grossCost,
        credit: 0,
        description: `دارایی افتتاحیه ${params.asset.assetTag} - ${params.asset.title}`
      },
      ...(params.asset.accumulatedDepreciation > 0 ? [{
        accountCode: '21101',
        accountTitle: 'استهلاک انباشته دارایی‌های ثابت',
        debit: 0,
        credit: params.asset.accumulatedDepreciation,
        description: `استهلاک انباشته تا تاریخ افتتاحیه ${params.asset.assetTag}`
      }] : []),
      ...(netBookValue > 0 ? [{
        accountCode: params.offsetAccountCode,
        accountTitle: params.offsetAccountTitle,
        debit: 0,
        credit: netBookValue,
        description: `مقابل ارزش دفتری افتتاحیه ${params.asset.assetTag}`,
        ...partnerDetail
      }] : [])
    ]
  });
};

export const buildDividendJournal = (params: {
  tenantId: string;
  eventId: string;
  effectiveDate: string;
  eventType: 'dividend_declaration' | 'dividend_payment';
  amount: number;
  positions: EquityOwnershipPosition[];
  sourceAccountCode?: string;
  sourceAccountTitle?: string;
}): Omit<AccountingEntry, 'id'>[] => {
  const allocations = allocateDividendByOwnership(params.amount, params.positions);
  let lines: EquityJournalLineInput[];
  if (params.eventType === 'dividend_declaration') {
    lines = [
      { accountCode: RETAINED_EARNINGS_ACCOUNT, accountTitle: 'سود (زیان) انباشته', debit: params.amount, credit: 0, description: 'سود سهام مصوب' },
      ...allocations.map(allocation => ({
        accountCode: DIVIDENDS_PAYABLE_ACCOUNT,
        accountTitle: 'سود سهام پرداختنی',
        debit: 0,
        credit: allocation.amount,
        description: `سود سهام مصوب برای ${allocation.ownerName}`,
        tafsiliCode: allocation.ownerTafsiliCode,
        tafsiliTitle: allocation.ownerName,
        tafsiliType: 'partner' as const
      }))
    ];
  } else {
    if (!params.sourceAccountCode || !params.sourceAccountTitle) {
      throw new Error('Dividend payment requires a cash or bank account.');
    }
    lines = [
      ...allocations.map(allocation => ({
        accountCode: DIVIDENDS_PAYABLE_ACCOUNT,
        accountTitle: 'سود سهام پرداختنی',
        debit: allocation.amount,
        credit: 0,
        description: `تسویه سود سهام ${allocation.ownerName}`,
        tafsiliCode: allocation.ownerTafsiliCode,
        tafsiliTitle: allocation.ownerName,
        tafsiliType: 'partner' as const
      })),
      { accountCode: params.sourceAccountCode, accountTitle: params.sourceAccountTitle, debit: 0, credit: params.amount, description: 'پرداخت سود سهام مصوب' }
    ];
  }
  return createEquityJournalEntries({
    tenantId: params.tenantId,
    documentNumber: `DOC-EQT-${params.eventId}`,
    date: params.effectiveDate,
    lines,
    referenceId: params.eventId
  });
};

export const buildEquityEventJournal = (params: {
  tenantId: string;
  eventId: string;
  eventType: 'capital_increase' | 'capital_decrease' | 'profit_appropriation' | 'dividend_declaration' | 'dividend_payment';
  effectiveDate: string;
  amount: number;
  sourceAccountCode?: string;
  sourceAccountTitle?: string;
  ownerTafsiliCode?: string;
  ownerTafsiliTitle?: string;
  sharePremium?: number;
  unpaidCapital?: number;
  statutoryReserveAmount?: number;
  optionalReserveAmount?: number;
}): Omit<AccountingEntry, 'id'>[] => {
  const { amount } = params;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Equity event amount must be positive.');
  const documentNumber = `DOC-EQT-${params.eventId}`;
  const ownerDetail = params.ownerTafsiliCode && params.ownerTafsiliTitle
    ? { tafsiliCode: params.ownerTafsiliCode, tafsiliTitle: params.ownerTafsiliTitle, tafsiliType: 'partner' as const }
    : {};
  let lines: EquityJournalLineInput[];

  switch (params.eventType) {
    case 'capital_increase': {
      if (!params.sourceAccountCode || !params.sourceAccountTitle) throw new Error('Capital increase requires a documented source account.');
      const unpaidCapital = params.unpaidCapital ?? 0;
      const sharePremium = params.sharePremium ?? 0;
      const paidAmount = amount + sharePremium - unpaidCapital;
      if (unpaidCapital < 0 || unpaidCapital > amount || sharePremium < 0 || paidAmount < 0) {
        throw new Error('Uncalled capital and share premium must be valid non-negative amounts.');
      }
      lines = [
        ...(paidAmount > 0 ? [{ accountCode: params.sourceAccountCode, accountTitle: params.sourceAccountTitle, debit: paidAmount, credit: 0, description: 'منبع مستند افزایش سرمایه', ...ownerDetail }] : []),
        ...(unpaidCapital > 0 ? [{ accountCode: UNCALLED_CAPITAL_ACCOUNT, accountTitle: 'سرمایه تعهدشده پرداخت‌نشده', debit: unpaidCapital, credit: 0, description: 'ثبت سرمایه تعهدشده پرداخت‌نشده', ...ownerDetail }] : []),
        { accountCode: SHARE_CAPITAL_ACCOUNT, accountTitle: 'سرمایه ثبت‌شده', debit: 0, credit: amount, description: 'ثبت افزایش سرمایه مصوب', ...ownerDetail },
        ...(sharePremium > 0 ? [{ accountCode: SHARE_PREMIUM_ACCOUNT, accountTitle: 'صرف سهام', debit: 0, credit: sharePremium, description: 'ثبت صرف سهام مصوب', ...ownerDetail }] : [])
      ];
      break;
    }
    case 'capital_decrease':
      if (!params.sourceAccountCode || !params.sourceAccountTitle) throw new Error('Capital decrease requires a documented settlement account.');
      lines = [
        { accountCode: SHARE_CAPITAL_ACCOUNT, accountTitle: 'سرمایه ثبت‌شده', debit: amount, credit: 0, description: 'کاهش سرمایه مصوب', ...ownerDetail },
        { accountCode: params.sourceAccountCode, accountTitle: params.sourceAccountTitle, debit: 0, credit: amount, description: 'تسویه کاهش سرمایه', ...ownerDetail }
      ];
      break;
    case 'profit_appropriation': {
      const reserve = params.statutoryReserveAmount ?? 0;
      const optionalReserve = params.optionalReserveAmount ?? 0;
      if (reserve + optionalReserve > amount + 0.01) throw new Error('Reserve allocations cannot exceed net profit.');
      if (Math.abs(reserve + optionalReserve - amount) > 0.01) {
        throw new Error('The appropriation journal must allocate its full amount to statutory or optional reserves.');
      }
      lines = [
        { accountCode: RETAINED_EARNINGS_ACCOUNT, accountTitle: 'سود (زیان) انباشته', debit: amount, credit: 0, description: 'تخصیص سود مصوب' },
        ...(reserve > 0 ? [{ accountCode: STATUTORY_RESERVE_ACCOUNT, accountTitle: 'اندوخته قانونی', debit: 0, credit: reserve, description: 'تخصیص اندوخته قانونی' }] : []),
        ...(optionalReserve > 0 ? [{ accountCode: OPTIONAL_RESERVE_ACCOUNT, accountTitle: 'اندوخته اختیاری', debit: 0, credit: optionalReserve, description: 'تخصیص اندوخته اختیاری' }] : [])
      ];
      break;
    }
    case 'dividend_declaration':
      lines = [
        { accountCode: RETAINED_EARNINGS_ACCOUNT, accountTitle: 'سود (زیان) انباشته', debit: amount, credit: 0, description: 'سود سهام مصوب' },
        { accountCode: DIVIDENDS_PAYABLE_ACCOUNT, accountTitle: 'سود سهام پرداختنی', debit: 0, credit: amount, description: 'ایجاد بدهی سود سهام' }
      ];
      break;
    case 'dividend_payment':
      if (!params.sourceAccountCode || !params.sourceAccountTitle) throw new Error('Dividend payment requires a cash or bank account.');
      lines = [
        { accountCode: DIVIDENDS_PAYABLE_ACCOUNT, accountTitle: 'سود سهام پرداختنی', debit: amount, credit: 0, description: 'تسویه سود سهام مصوب', ...ownerDetail },
        { accountCode: params.sourceAccountCode, accountTitle: params.sourceAccountTitle, debit: 0, credit: amount, description: 'پرداخت سود سهام' }
      ];
      break;
  }

  return createEquityJournalEntries({
    tenantId: params.tenantId,
    documentNumber,
    date: params.effectiveDate,
    lines,
    referenceId: params.eventId
  });
};