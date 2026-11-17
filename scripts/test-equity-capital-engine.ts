import assert from 'node:assert/strict';
import {
  buildEquityEventJournal,
  buildFixedAssetOpeningJournal,
  buildDividendJournal,
  buildOpeningEquityClassificationJournal,
  buildOpeningShareCapitalJournal,
  buildShareIssueJournal,
  allocateWholeShareRights,
  allocateDividendByOwnership,
  calculateRightsEntitlements,
  calculateNetProfitForPeriod,
  calculateStatutoryReserveAllocation,
  transferShares,
  transferPartnershipInterest,
  validateEquityOpeningProfile
} from '../src/lib/equityCapitalEngine';
import { EquityCompanyProfile, EquityOwnershipPosition } from '../src/types';

const profile: EquityCompanyProfile = {
  id: 'equity-profile-test',
  tenantId: 'tenant-equity-test',
  legalForm: 'joint_stock',
  registeredCapital: 1_000_000,
  authorizedShares: 1_200,
  issuedShares: 1_000,
  nominalShareValue: 1_000,
  currency: 'IRT',
  effectiveDate: '1405/01/01'
};

const owners: EquityOwnershipPosition[] = [
  {
    id: 'owner-a', tenantId: profile.tenantId, ownerTafsiliCode: '4001', ownerName: 'شریک الف',
    effectiveDate: profile.effectiveDate, shareCount: 600, ownershipPercent: 60,
    committedCapital: 600_000, paidCapital: 400_000
  },
  {
    id: 'owner-b', tenantId: profile.tenantId, ownerTafsiliCode: '4002', ownerName: 'شریک ب',
    effectiveDate: profile.effectiveDate, shareCount: 400, ownershipPercent: 40,
    committedCapital: 400_000, paidCapital: 200_000
  }
];

assert.deepEqual(validateEquityOpeningProfile(profile, owners), []);
assert.ok(validateEquityOpeningProfile({ ...profile, registeredCapital: 900_000 }, owners).length > 0);
assert.ok(validateEquityOpeningProfile(profile, owners.map(owner => ({ ...owner, ownershipPercent: 50 })))
  .some(error => error.includes('share proportion')));
assert.equal(calculateNetProfitForPeriod([
  { id: 'income-in-period', tenantId: profile.tenantId, documentNumber: 'DOC-TX-1', date: '1405/02/01', description: 'Income', accountCode: '40102', accountTitle: 'Service revenue', debit: 0, credit: 500_000 },
  { id: 'cost-in-period', tenantId: profile.tenantId, documentNumber: 'DOC-INV-2', date: '1405/02/05', description: 'Cost', accountCode: '50101', accountTitle: 'COGS', debit: 150_000, credit: 0 },
  { id: 'expense-in-period', tenantId: profile.tenantId, documentNumber: 'DOC-TX-3', date: '1405/02/08', description: 'Expense', accountCode: '60102', accountTitle: 'Rent', debit: 50_000, credit: 0 },
  { id: 'income-out-period', tenantId: profile.tenantId, documentNumber: 'DOC-TX-4', date: '1405/03/01', description: 'Later income', accountCode: '40102', accountTitle: 'Service revenue', debit: 0, credit: 900_000 },
  { id: 'opening-income', tenantId: profile.tenantId, documentNumber: 'DOC-OPN-LEGACY', date: '1405/02/02', description: 'Opening', accountCode: '40102', accountTitle: 'Service revenue', debit: 0, credit: 900_000 }
], '1405/02/01', '1405/02/29'), 300_000);

const openingCapital = buildOpeningShareCapitalJournal({
  tenantId: profile.tenantId,
  documentNumber: 'DOC-OPN-CAP-TEST',
  effectiveDate: profile.effectiveDate,
  profile,
  positions: owners
});
assert.equal(openingCapital.reduce((total, entry) => total + entry.debit, 0), 1_000_000);
assert.equal(openingCapital.reduce((total, entry) => total + entry.credit, 0), 1_000_000);
assert.equal(openingCapital.find(entry => entry.accountCode === '30103')?.debit, 600_000);
assert.equal(openingCapital.find(entry => entry.accountCode === '30104')?.debit, 400_000);
assert.equal(openingCapital.filter(entry => entry.accountCode === '30101').length, 2);

const fixedAsset = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: profile.tenantId,
  assetTag: 'BLD-TEST',
  title: 'ساختمان آزمون',
  assetClass: 'building' as const,
  accountCode: '20602',
  acquisitionDate: '1400/01/01',
  inServiceDate: '1400/02/01',
  grossCost: 2_000_000,
  accumulatedDepreciation: 200_000,
  residualValue: 0,
  usefulLifeMonths: 240,
  depreciationMethod: 'straight_line' as const,
  valuationReference: 'گزارش ارزش‌گذاری آزمون',
  journalDocumentNumber: 'DOC-OPN-ASSET-TEST',
  status: 'active' as const
};
const fixedAssetJournal = buildFixedAssetOpeningJournal({
  tenantId: profile.tenantId,
  documentNumber: fixedAsset.journalDocumentNumber,
  date: fixedAsset.inServiceDate,
  asset: fixedAsset,
  offsetAccountCode: '30103',
  offsetAccountTitle: 'حساب تراز افتتاحیه'
});
assert.equal(fixedAssetJournal.reduce((total, entry) => total + entry.debit, 0), 2_000_000);
assert.equal(fixedAssetJournal.reduce((total, entry) => total + entry.credit, 0), 2_000_000);
assert.ok(fixedAssetJournal.every(entry => entry.referenceId === fixedAsset.id));
const positiveOpeningClassification = buildOpeningEquityClassificationJournal({
  tenantId: profile.tenantId,
  documentNumber: 'DOC-OPN-CLASS-PROFIT',
  effectiveDate: profile.effectiveDate,
  amount: 25_000,
  accountCode: '30201',
  accountTitle: 'سود (زیان) انباشته',
  approvalReference: 'مصوبه افتتاحیه'
});
assert.equal(positiveOpeningClassification.find(entry => entry.accountCode === '30103')?.debit, 25_000);
assert.equal(positiveOpeningClassification.find(entry => entry.accountCode === '30201')?.credit, 25_000);
const negativeOpeningClassification = buildOpeningEquityClassificationJournal({
  tenantId: profile.tenantId,
  documentNumber: 'DOC-OPN-CLASS-LOSS',
  effectiveDate: profile.effectiveDate,
  amount: -5_000,
  accountCode: '30201',
  accountTitle: 'سود (زیان) انباشته',
  approvalReference: 'صورت مالی افتتاحیه'
});
assert.equal(negativeOpeningClassification.find(entry => entry.accountCode === '30103')?.credit, 5_000);
assert.equal(negativeOpeningClassification.find(entry => entry.accountCode === '30201')?.debit, 5_000);

assert.deepEqual(calculateRightsEntitlements(owners, 300).map(item => item.entitledShares), [180, 120]);
const wholeShareRights = allocateWholeShareRights(owners, 7);
assert.equal(wholeShareRights.reduce((total, item) => total + item.entitledShares, 0), 7);
assert.deepEqual(wholeShareRights.map(item => item.entitledShares), [4, 3]);

const transferredOwners = transferShares(owners, '4001', { ownerTafsiliCode: '4002', ownerName: 'شریک ب' }, 100, '1405/02/01');
assert.equal(transferredOwners.reduce((total, owner) => total + (owner.shareCount || 0), 0), 1_000);
assert.equal(transferredOwners.find(owner => owner.ownerTafsiliCode === '4001')?.ownershipPercent, 50);
assert.equal(transferredOwners.find(owner => owner.ownerTafsiliCode === '4002')?.ownershipPercent, 50);
assert.equal(transferredOwners.reduce((total, owner) => total + owner.committedCapital, 0), 1_000_000);
assert.equal(transferredOwners.reduce((total, owner) => total + owner.paidCapital, 0), 600_000);

const fullTransferOwners = transferShares(owners, '4001', { ownerTafsiliCode: '4003', ownerName: 'شریک ج' }, 600, '1405/02/02');
assert.equal(fullTransferOwners.find(owner => owner.ownerTafsiliCode === '4001')?.shareCount, 0);
assert.equal(fullTransferOwners.find(owner => owner.ownerTafsiliCode === '4001')?.ownershipPercent, 0);
assert.equal(fullTransferOwners.reduce((total, owner) => total + (owner.shareCount || 0), 0), 1_000);
assert.ok(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(
  fullTransferOwners.find(owner => owner.ownerTafsiliCode === '4003')?.id || ''
));

const partnershipOwners = owners.map(owner => ({ ...owner, shareCount: undefined }));
const transferredInterest = transferPartnershipInterest(
  partnershipOwners,
  '4001',
  { ownerTafsiliCode: '4003', ownerName: 'شریک ج' },
  10,
  '1405/02/03'
);
assert.equal(transferredInterest.reduce((total, owner) => total + owner.ownershipPercent, 0), 100);
assert.equal(transferredInterest.reduce((total, owner) => total + owner.committedCapital, 0), 1_000_000);

const dividendAllocations = allocateDividendByOwnership(101, owners);
assert.equal(dividendAllocations.reduce((total, allocation) => total + allocation.amount, 0), 101);
assert.equal(dividendAllocations[0].amount, 60.6);
assert.equal(dividendAllocations[1].amount, 40.4);
const dividendJournal = buildDividendJournal({
  tenantId: profile.tenantId,
  eventId: 'dividend-test',
  effectiveDate: '1405/12/29',
  eventType: 'dividend_declaration',
  amount: 101,
  positions: owners
});
assert.equal(dividendJournal.reduce((total, entry) => total + entry.debit, 0), 101);
assert.equal(dividendJournal.reduce((total, entry) => total + entry.credit, 0), 101);
assert.equal(dividendJournal.filter(entry => entry.accountCode === '20402' && entry.tafsiliType === 'partner').length, 2);

const statutoryReserve = calculateStatutoryReserveAllocation(1_000_000, 90_000, 1_000_000);
assert.equal(statutoryReserve.allocation, 10_000);
assert.equal(statutoryReserve.endingReserve, 100_000);

const increaseEntries = buildEquityEventJournal({
  tenantId: profile.tenantId,
  eventId: 'increase-test',
  eventType: 'capital_increase',
  effectiveDate: '1405/03/01',
  amount: 100_000,
  unpaidCapital: 20_000,
  sourceAccountCode: '10102',
  sourceAccountTitle: 'بانک',
  ownerTafsiliCode: '4001',
  ownerTafsiliTitle: 'شریک الف'
});
assert.equal(increaseEntries.reduce((total, entry) => total + entry.debit, 0), 100_000);
assert.equal(increaseEntries.reduce((total, entry) => total + entry.credit, 0), 100_000);
assert.equal(increaseEntries.find(entry => entry.accountCode === '30104')?.debit, 20_000);

const shareIssueEntries = buildShareIssueJournal({
  tenantId: profile.tenantId,
  eventId: 'share-issue-test',
  effectiveDate: '1405/04/01',
  nominalShareValue: 1_000,
  sourceAccountCode: '10102',
  sourceAccountTitle: 'بانک',
  unpaidCapital: 1_000,
  sharePremium: 700,
  allocations: [
    { ownerTafsiliCode: '4001', ownerName: 'شریک الف', shareCount: 4 },
    { ownerTafsiliCode: '4002', ownerName: 'شریک ب', shareCount: 3 }
  ]
});
assert.equal(shareIssueEntries.reduce((total, entry) => total + entry.debit, 0), 7_700);
assert.equal(shareIssueEntries.reduce((total, entry) => total + entry.credit, 0), 7_700);
assert.equal(shareIssueEntries.filter(entry => entry.accountCode === '30101').length, 2);
assert.equal(shareIssueEntries.find(entry => entry.accountCode === '30105')?.credit, 700);

const appropriationEntries = buildEquityEventJournal({
  tenantId: profile.tenantId,
  eventId: 'appropriation-test',
  eventType: 'profit_appropriation',
  effectiveDate: '1405/12/29',
  amount: 15_000,
  statutoryReserveAmount: 5_000,
  optionalReserveAmount: 10_000
});
assert.equal(appropriationEntries.reduce((total, entry) => total + entry.debit, 0), 15_000);
assert.equal(appropriationEntries.reduce((total, entry) => total + entry.credit, 0), 15_000);

console.log('All equity capital engine tests passed.');