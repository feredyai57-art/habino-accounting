import { AccountingEntry, FixedAssetRecord } from '../types';
import { validateFixedAssetRecord } from './equityCapitalEngine';

const FIXED_ASSET_CODES = new Set(['20601', '20602', '20603', '20604', '20605']);
const OPENING_CLASSIFICATION_CODES = new Set(['30101', '30102', '30103', '30201']);

export const validateOpeningPeriodJournalEntries = (entries: AccountingEntry[]): string[] => {
  const openingEntries = entries.filter(entry => entry.documentNumber?.startsWith('DOC-OPN-'));
  const errors: string[] = [];
  const entriesByDocument = new Map<string, AccountingEntry[]>();

  openingEntries.forEach(entry => {
    const documentEntries = entriesByDocument.get(entry.documentNumber) || [];
    documentEntries.push(entry);
    entriesByDocument.set(entry.documentNumber, documentEntries);
  });

  entriesByDocument.forEach((documentEntries, documentNumber) => {
    const debit = documentEntries.reduce((total, entry) => total + (Number(entry.debit) || 0), 0);
    const credit = documentEntries.reduce((total, entry) => total + (Number(entry.credit) || 0), 0);
    if (Math.abs(debit - credit) > 0.01) {
      errors.push(`سند افتتاحیه ${documentNumber} متوازن نیست.`);
    }
  });

  const capitalEntries = openingEntries.filter(entry => entry.accountCode === '30101');
  if (capitalEntries.some(entry =>
    entry.credit <= 0 || entry.debit !== 0 || entry.tafsiliType !== 'partner' || !entry.tafsiliCode || !entry.tafsiliTitle
  )) {
    errors.push('آورده سرمایه‌ای باید بستانکار حساب ۳۰۱۰۱ و با تفصیلی معتبر شریک ثبت شود.');
  }
  if (openingEntries.some(entry => entry.accountCode === '30102' &&
    (entry.debit + entry.credit <= 0 || entry.tafsiliType !== 'partner' || !entry.tafsiliCode || !entry.tafsiliTitle)
  )) {
    errors.push('هر آرتیکل حساب جاری شرکا در افتتاحیه باید تفصیلی معتبر شریک داشته باشد.');
  }

  const fixedAssetEntries = openingEntries.filter(entry => FIXED_ASSET_CODES.has(entry.accountCode));
  const accumulatedDepreciationEntries = openingEntries.filter(entry => entry.accountCode === '21101');
  const fixedAssetDocuments = new Set(fixedAssetEntries.map(entry => entry.documentNumber));

  if (accumulatedDepreciationEntries.some(entry => !fixedAssetDocuments.has(entry.documentNumber))) {
    errors.push('استهلاک انباشته افتتاحیه باید به سند همان دارایی ثابت متصل باشد.');
  }

  fixedAssetDocuments.forEach(documentNumber => {
    const documentEntries = entriesByDocument.get(documentNumber) || [];
    const assetLines = documentEntries.filter(entry => FIXED_ASSET_CODES.has(entry.accountCode));
    const depreciationLines = documentEntries.filter(entry => entry.accountCode === '21101');
    const grossCost = assetLines.reduce((total, entry) => total + (Number(entry.debit) || 0), 0);
    const accumulatedDepreciation = depreciationLines.reduce((total, entry) => total + (Number(entry.credit) || 0), 0);

    if (
      assetLines.length !== 1 ||
      assetLines[0].debit <= 0 ||
      assetLines[0].credit !== 0 ||
      !assetLines[0].description.trim()
    ) {
      errors.push(`سند ${documentNumber} باید یک قلم دارایی با بهای ناخالص و شرح مشخص داشته باشد.`);
    }
    if (depreciationLines.some(entry => entry.debit !== 0 || entry.credit < 0 || !entry.description.trim())) {
      errors.push(`استهلاک انباشته در سند ${documentNumber} باید بستانکار و دارای شرح باشد.`);
    }
    if (accumulatedDepreciation > grossCost + 0.01) {
      errors.push(`استهلاک انباشته در سند ${documentNumber} از بهای ناخالص دارایی بیشتر است.`);
    }
  });

  const unclassifiedEquityBalance = openingEntries
    .filter(entry => entry.accountCode === '30103')
    .reduce((balance, entry) => balance + (Number(entry.debit) || 0) - (Number(entry.credit) || 0), 0);
  if (Math.abs(unclassifiedEquityBalance) > 0.01) {
    errors.push('مانده موقت حساب ۳۰۱۰۳ باقی است؛ افتتاحیه را با سرمایه مستند شریک یا سود و زیان انباشته مستند طبقه‌بندی کنید.');
  }

  const invalidClassificationEntries = openingEntries.filter(entry =>
    OPENING_CLASSIFICATION_CODES.has(entry.accountCode) &&
    entry.accountCode !== '30101' &&
    !entry.description.trim()
  );
  if (invalidClassificationEntries.length > 0) {
    errors.push('شرح آرتیکل‌های طبقه‌بندی حقوق صاحبان سهام در سند افتتاحیه الزامی است.');
  }

  return errors;
};

export const validateFixedAssetOpeningRegister = (
  entries: AccountingEntry[],
  assets: FixedAssetRecord[]
): string[] => {
  const errors: string[] = [];
  const activeAssets = assets.filter(asset => asset.status === 'active');
  const assetById = new Map(activeAssets.map(asset => [asset.id, asset]));

  activeAssets.forEach(asset => {
    const assetErrors = validateFixedAssetRecord(asset);
    if (assetErrors.length > 0) {
      errors.push(...assetErrors.map(message => `${asset.assetTag}: ${message}`));
      return;
    }
    const linkedEntries = entries.filter(entry =>
      entry.referenceId === asset.id && entry.documentNumber === asset.journalDocumentNumber
    );
    const assetCost = linkedEntries
      .filter(entry => entry.accountCode === asset.accountCode)
      .reduce((total, entry) => total + (Number(entry.debit) || 0) - (Number(entry.credit) || 0), 0);
    const accumulatedDepreciation = linkedEntries
      .filter(entry => entry.accountCode === '21101')
      .reduce((total, entry) => total + (Number(entry.credit) || 0) - (Number(entry.debit) || 0), 0);
    if (linkedEntries.length === 0 || Math.abs(assetCost - asset.grossCost) > 0.01) {
      errors.push(`دارایی «${asset.assetTag}» سند افتتاحیه متناظر با بهای ناخالص ثبت‌شده ندارد.`);
    }
    if (Math.abs(accumulatedDepreciation - asset.accumulatedDepreciation) > 0.01) {
      errors.push(`استهلاک انباشته دارایی «${asset.assetTag}» با دفترکل تطبیق ندارد.`);
    }
  });

  entries.filter(entry => entry.documentNumber?.startsWith('DOC-OPN-') && FIXED_ASSET_CODES.has(entry.accountCode))
    .forEach(entry => {
      if (!entry.referenceId || !assetById.has(entry.referenceId)) {
        errors.push(`آرتیکل دارایی ثابت در سند ${entry.documentNumber} به رجیستر دارایی معتبر متصل نیست.`);
      }
    });
  return errors;
};