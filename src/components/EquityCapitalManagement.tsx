import React, { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAccounting } from '../lib/store';
import { generateNextTafsiliCode, getUnifiedFloatingTafsiliList, saveFloatingTafsili } from '../lib/floatingTafsiliEngine';
import { getCurrentJalaliDate } from '../lib/dateUtils';
import { formatCurrency } from '../lib/currencyUtils';
import {
  buildEquityEventJournal,
  buildDividendJournal,
  buildOpeningShareCapitalJournal,
  buildOpeningEquityClassificationJournal,
  buildShareIssueJournal,
  allocateWholeShareRights,
  calculateNetProfitForPeriod,
  calculateRightsEntitlements,
  calculateStatutoryReserveAllocation,
  buildFixedAssetOpeningJournal,
  transferPartnershipInterest,
  transferShares,
  validateEquityOpeningProfile
} from '../lib/equityCapitalEngine';
import { getLatestEquityProfile, getLatestOwnershipPositions, loadEquityRecords, saveEquityRecord } from '../lib/equityRepository';
import { EquityCompanyProfile, EquityEvent, EquityOwnershipPosition, FixedAssetClass, FixedAssetRecord } from '../types';

const JOURNAL_ACCOUNTS = [
  { code: '10101', title: 'صندوق و موجودی نقد' },
  { code: '10102', title: 'بانک‌ها و حساب‌های جاری' },
  { code: '20101', title: 'حساب‌های پرداختنی تجاری' },
  { code: '30102', title: 'جاری شرکا و سهامداران' },
  { code: '30104', title: 'سرمایه تعهدشده پرداخت‌نشده' },
  { code: '30105', title: 'صرف سهام' },
  { code: '30201', title: 'سود (زیان) انباشته' },
  { code: '30301', title: 'مازاد تجدید ارزیابی' },
  { code: '30401', title: 'اندوخته قانونی' },
  { code: '30402', title: 'اندوخته اختیاری' },
  { code: '20402', title: 'سود سهام پرداختنی' }
];

const EVENT_LABELS = {
  capital_increase: 'افزایش سرمایه',
  capital_decrease: 'کاهش سرمایه',
  partner_admission: 'ورود شریک با صدور سهم/سهم‌الشرکه',
  partner_exit: 'خروج شریک با انتقال مالکیت',
  profit_appropriation: 'تخصیص سود به اندوخته‌ها',
  dividend_declaration: 'تصویب سود سهام',
  dividend_payment: 'پرداخت سود سهام'
} as const;
type EquityOperationType = keyof typeof EVENT_LABELS | 'share_transfer';
const isCapitalIncreaseEventType = (eventType: EquityOperationType): boolean =>
  eventType === 'capital_increase' || eventType === 'partner_admission';
const isCapitalDecreaseEventType = (eventType: EquityOperationType): boolean => eventType === 'capital_decrease';

const FIXED_ASSET_ACCOUNTS: Record<FixedAssetClass, string> = {
  land: '20601', building: '20602', machinery: '20603', equipment: '20603',
  furniture: '20604', vehicle: '20605', other: '20603'
};

export const EquityCapitalManagement: React.FC = () => {
  const {
    accountingEntries,
    addAccountingEntries,
    clients,
    activeTenant,
    currentUser,
    settings
  } = useAccounting();
  const tenantId = activeTenant?.id && activeTenant.id !== 'all'
    ? activeTenant.id
    : currentUser?.tenantId || 'tenant-main';
  const [partnerRefresh, setPartnerRefresh] = useState(0);
  const partners = useMemo(() => getUnifiedFloatingTafsiliList(clients)
    .filter(account => account.type === 'partner' && account.isActive !== false)
    .filter(account => account.tenantId === tenantId), [clients, tenantId, partnerRefresh]);
  const [profile, setProfile] = useState<EquityCompanyProfile | null>(null);
  const [positions, setPositions] = useState<EquityOwnershipPosition[]>([]);
  const [events, setEvents] = useState<EquityEvent[]>([]);
  const [fixedAssets, setFixedAssets] = useState<FixedAssetRecord[]>([]);
  const [ownershipEffectiveDate, setOwnershipEffectiveDate] = useState(getCurrentJalaliDate());
  const [activeTab, setActiveTab] = useState<'profile' | 'ownership' | 'events' | 'assets'>('profile');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState<EquityOperationType>('capital_increase');
  const [eventDate, setEventDate] = useState(getCurrentJalaliDate());
  const [profitPeriodStart, setProfitPeriodStart] = useState(`${getCurrentJalaliDate().slice(0, 4)}/01/01`);
  const [profitPeriodEnd, setProfitPeriodEnd] = useState(getCurrentJalaliDate());
  const [eventAmount, setEventAmount] = useState(0);
  const [sourceAccount, setSourceAccount] = useState('10102');
  const [approvalReference, setApprovalReference] = useState('');
  const [ownerCode, setOwnerCode] = useState('');
  const [transferToCode, setTransferToCode] = useState('');
  const [shareCount, setShareCount] = useState(0);
  const [interestPercent, setInterestPercent] = useState(0);
  const [issuedSharesByOwner, setIssuedSharesByOwner] = useState<Record<string, number>>({});
  const [unpaidCapital, setUnpaidCapital] = useState(0);
  const [sharePremium, setSharePremium] = useState(0);
  const [optionalReserve, setOptionalReserve] = useState(0);
  const [openingApprovalReference, setOpeningApprovalReference] = useState('');
  const [classificationAccountCode, setClassificationAccountCode] = useState<'30201' | '30301' | '30401' | '30402'>('30201');
  const [newPartnerTitle, setNewPartnerTitle] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [assetTitle, setAssetTitle] = useState('');
  const [assetClass, setAssetClass] = useState<FixedAssetClass>('equipment');
  const [assetAcquisitionDate, setAssetAcquisitionDate] = useState(getCurrentJalaliDate());
  const [assetInServiceDate, setAssetInServiceDate] = useState(getCurrentJalaliDate());
  const [assetGrossCost, setAssetGrossCost] = useState(0);
  const [assetAccumulatedDepreciation, setAssetAccumulatedDepreciation] = useState(0);
  const [assetResidualValue, setAssetResidualValue] = useState(0);
  const [assetUsefulLifeMonths, setAssetUsefulLifeMonths] = useState(0);
  const [assetDepreciationMethod, setAssetDepreciationMethod] = useState<FixedAssetRecord['depreciationMethod']>('straight_line');
  const [assetValuationReference, setAssetValuationReference] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getLatestEquityProfile(tenantId),
      loadEquityRecords<EquityOwnershipPosition>('equityOwnershipPositions', tenantId),
      loadEquityRecords<EquityEvent>('equityEvents', tenantId),
      loadEquityRecords<FixedAssetRecord>('fixedAssets', tenantId)
    ]).then(([savedProfile, savedPositions, savedEvents, savedAssets]) => {
      if (!active) return;
      setProfile(savedProfile || {
        id: uuidv4(), tenantId, legalForm: 'other', registeredCapital: 0,
        currency: settings.currency, effectiveDate: getCurrentJalaliDate(), version: 1
      });
      setPositions(getLatestOwnershipPositions(
        savedPositions,
        getCurrentJalaliDate()
      ));
      setOwnershipEffectiveDate(savedPositions
        .map(position => position.effectiveDate)
        .sort((left, right) => right.localeCompare(left))[0] || savedProfile?.effectiveDate || getCurrentJalaliDate());
      setEvents(savedEvents.sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate)));
      setFixedAssets(savedAssets.filter(asset => asset.status === 'active'));
    }).catch(loadError => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [tenantId, settings.currency]);

  const equityAccountBalance = (accountCode: string, tafsiliCode?: string) => accountingEntries
    .filter(entry => entry.accountCode === accountCode && (!tafsiliCode || entry.tafsiliCode === tafsiliCode))
    .reduce((balance, entry) => balance + Number(entry.credit || 0) - Number(entry.debit || 0), 0);
  const calculatedPeriodProfit = useMemo(() => {
    try {
      return calculateNetProfitForPeriod(accountingEntries, profitPeriodStart, profitPeriodEnd);
    } catch {
      return 0;
    }
  }, [accountingEntries, profitPeriodStart, profitPeriodEnd]);

  const saveCompanyProfile = async () => {
    if (!profile) return;
    setError(null);
    setMessage(null);
    const errors = validateEquityOpeningProfile(profile, positions);
    if (errors.length > 0) {
      setError(errors.join(' '));
      return;
    }
    await saveEquityRecord('equityCompanyProfiles', { ...profile, updatedAt: new Date().toISOString() });
    setMessage('پروفایل سرمایه به‌صورت محلی ذخیره شد؛ در صورت اتصال، همگام‌سازی در صف قرار گرفت.');
  };

  const postOpeningCapitalJournal = async () => {
    if (!profile || !openingApprovalReference.trim()) {
      setError('پروفایل سرمایه و مرجع اسناد ثبتی/مصوبه افتتاحیه الزامی است.');
      return;
    }
    setError(null);
    setMessage(null);
    const validationErrors = validateEquityOpeningProfile(profile, positions);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }
    const documentNumber = `DOC-OPN-EQ-${tenantId}-${profile.effectiveDate.replace(/[^0-9]/g, '')}`;
    if (accountingEntries.some(entry => entry.documentNumber === documentNumber)) {
      setError('سند افتتاحیه سرمایه با همین تاریخ قبلاً ثبت شده است.');
      return;
    }
    const paidCapital = positions.reduce((total, position) => total + position.paidCapital, 0);
    if (equityAccountBalance('30103') + 0.01 < paidCapital) {
      setError('مانده بستانکار حساب تراز افتتاحیه برای طبقه‌بندی آورده پرداخت‌شده کافی نیست. ابتدا دارایی‌ها و بدهی‌های اول دوره را تطبیق کنید.');
      return;
    }
    try {
      const journal = buildOpeningShareCapitalJournal({
        tenantId,
        documentNumber,
        effectiveDate: profile.effectiveDate,
        profile,
        positions
      });
      await addAccountingEntries(journal);
      await createEvent('opening', {
        registeredCapital: profile.registeredCapital,
        paidCapital,
        uncalledCapital: profile.registeredCapital - paidCapital,
        ownership: positions.map(position => ({
          ownerTafsiliCode: position.ownerTafsiliCode,
          ownershipPercent: position.ownershipPercent,
          committedCapital: position.committedCapital,
          paidCapital: position.paidCapital
        }))
      }, documentNumber, profile.effectiveDate, openingApprovalReference);
      setMessage(`سند افتتاحیه سرمایه ${documentNumber} در دفترکل ثبت شد.`);
    } catch (openingError) {
      setError(openingError instanceof Error ? openingError.message : String(openingError));
    }
  };

  const classifyOpeningEquityBalance = async () => {
    if (!profile || !openingApprovalReference.trim()) {
      setError('برای طبقه‌بندی مانده افتتاحیه، مرجع مدرک الزامی است.');
      return;
    }
    const balance = equityAccountBalance('30103');
    if (Math.abs(balance) < 0.01) {
      setError('حساب تراز افتتاحیه مانده‌ای برای طبقه‌بندی ندارد.');
      return;
    }
    const account = JOURNAL_ACCOUNTS.find(item => item.code === classificationAccountCode);
    if (!account) return;
    const documentNumber = `DOC-OPN-EQ-CLASS-${tenantId}-${profile.effectiveDate.replace(/[^0-9]/g, '')}-${classificationAccountCode}`;
    if (accountingEntries.some(entry => entry.documentNumber === documentNumber)) {
      setError('سند طبقه‌بندی افتتاحیه برای این حساب قبلاً ثبت شده است.');
      return;
    }
    try {
      const journal = buildOpeningEquityClassificationJournal({
        tenantId,
        documentNumber,
        effectiveDate: profile.effectiveDate,
        amount: balance,
        accountCode: classificationAccountCode,
        accountTitle: account.title,
        approvalReference: openingApprovalReference
      });
      await addAccountingEntries(journal);
      await createEvent('opening', {
        classificationAccountCode,
        classifiedBalance: balance
      }, documentNumber, profile.effectiveDate, openingApprovalReference);
      setMessage(`مانده حساب ۳۰۱۰۳ با سند ${documentNumber} طبقه‌بندی شد.`);
    } catch (classificationError) {
      setError(classificationError instanceof Error ? classificationError.message : String(classificationError));
    }
  };

  const postFixedAssetOpening = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!assetValuationReference.trim()) {
      setError('مدرک مالکیت/ارزش‌گذاری دارایی الزامی است.');
      return;
    }
    if (fixedAssets.some(asset => asset.assetTag.toLowerCase() === assetTag.trim().toLowerCase())) {
      setError('شناسه دارایی در رجیستر همین مستأجر تکراری است.');
      return;
    }

    const assetId = uuidv4();
    const documentNumber = `DOC-OPN-ASSET-${assetId}`;
    const asset: FixedAssetRecord = {
      id: assetId,
      tenantId,
      assetTag: assetTag.trim(),
      title: assetTitle.trim(),
      assetClass,
      accountCode: FIXED_ASSET_ACCOUNTS[assetClass],
      acquisitionDate: assetAcquisitionDate,
      inServiceDate: assetInServiceDate,
      grossCost: assetGrossCost,
      accumulatedDepreciation: assetAccumulatedDepreciation,
      residualValue: assetResidualValue,
      usefulLifeMonths: assetDepreciationMethod === 'none' ? undefined : assetUsefulLifeMonths,
      depreciationMethod: assetDepreciationMethod,
      valuationReference: assetValuationReference.trim(),
      journalDocumentNumber: documentNumber,
      status: 'active',
      version: 1,
      updatedAt: new Date().toISOString()
    };

    try {
      const journal = buildFixedAssetOpeningJournal({
        tenantId,
        documentNumber,
        date: profile?.effectiveDate || getCurrentJalaliDate(),
        asset,
        offsetAccountCode: '30103',
        offsetAccountTitle: 'حساب تراز افتتاحیه'
      });
      await addAccountingEntries(journal);
      await saveEquityRecord('fixedAssets', asset);
      setFixedAssets(current => [...current, asset]);
      setAssetTag('');
      setAssetTitle('');
      setAssetGrossCost(0);
      setAssetAccumulatedDepreciation(0);
      setAssetResidualValue(0);
      setAssetUsefulLifeMonths(0);
      setAssetValuationReference('');
      setMessage(`دارایی ${asset.assetTag} و سند افتتاحیه ${documentNumber} ثبت شدند.`);
    } catch (assetError) {
      setError(assetError instanceof Error ? assetError.message : String(assetError));
    }
  };

  const saveOwnershipSnapshot = async () => {
    if (!profile) return;
    setError(null);
    setMessage(null);
    const errors = validateEquityOpeningProfile(profile, positions);
    if (errors.length > 0) {
      setError(errors.join(' '));
      return;
    }
    const datedPositions = positions.map(position => ({
      ...position,
      effectiveDate: ownershipEffectiveDate,
      updatedAt: new Date().toISOString()
    }));
    for (const position of datedPositions) {
      await saveEquityRecord('equityOwnershipPositions', position);
    }
    setPositions(datedPositions);
    setMessage('پروفایل سرمایه و snapshot مالکیت به‌صورت محلی ذخیره شد؛ در صورت اتصال، همگام‌سازی در صف قرار گرفت.');
  };

  const addPartnerPosition = () => {
    const partner = partners.find(item => item.code === ownerCode);
    if (!partner || positions.some(position => position.ownerTafsiliCode === partner.code)) return;
    setPositions(current => [...current, {
      id: uuidv4(), tenantId, ownerTafsiliCode: partner.code, ownerName: partner.title,
      effectiveDate: ownershipEffectiveDate,
      shareCount: profile?.legalForm === 'joint_stock' ? 0 : undefined,
      ownershipPercent: 0, committedCapital: 0, paidCapital: 0, version: 1
    }]);
  };

  const createTenantPartner = () => {
    const title = newPartnerTitle.trim();
    if (!title) return;
    const result = saveFloatingTafsili({
      code: generateNextTafsiliCode('partner'),
      title,
      type: 'partner',
      tenantId,
      isActive: true
    });
    if (!result.success) {
      setError(result.message);
      return;
    }
    setNewPartnerTitle('');
    setPartnerRefresh(value => value + 1);
    setMessage(`تفصیلی شریک «${title}» برای همین مستأجر ساخته شد.`);
  };

  const updatePosition = (id: string, field: keyof EquityOwnershipPosition, value: string) => {
    setPositions(current => current.map(position => {
      if (position.id !== id) return position;
      const numericFields = ['shareCount', 'ownershipPercent', 'committedCapital', 'paidCapital'];
      return {
        ...position,
        [field]: numericFields.includes(field) ? Number(value) : value
      };
    }));
  };

  const createEvent = async (
    type: EquityEvent['eventType'],
    payload: Record<string, unknown>,
    journalDocumentNumber?: string,
    effectiveDate = eventDate,
    approvalRef = approvalReference
  ) => {
    const event: EquityEvent = {
      id: uuidv4(), tenantId, eventType: type, status: 'posted', effectiveDate,
      payload: { ...payload, approvalReference: approvalRef.trim() },
      journalDocumentNumber, approvalReference: approvalRef.trim(),
      approvedBy: currentUser?.id, approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), version: 1
    };
    await saveEquityRecord('equityEvents', event);
    setEvents(current => [event, ...current]);
  };

  const postSelectedEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const eventAmountToPost = eventType === 'profit_appropriation' ? calculatedPeriodProfit : eventAmount;
    if (!profile || !approvalReference.trim()) {
      setError('پروفایل حقوقی و شماره مصوبه/مدرک پشتیبان الزامی است.');
      return;
    }
    const eventId = uuidv4();
    const account = JOURNAL_ACCOUNTS.find(item => item.code === sourceAccount);
    const isCapitalIncreaseEvent = isCapitalIncreaseEventType(eventType);
    const isCapitalDecreaseEvent = isCapitalDecreaseEventType(eventType);
    const isOwnershipTransferEvent = eventType === 'share_transfer' || eventType === 'partner_exit';
    try {
      if (isCapitalIncreaseEvent || isCapitalDecreaseEvent || eventType === 'profit_appropriation' || eventType === 'dividend_declaration' || eventType === 'dividend_payment') {
        if (isCapitalDecreaseEvent && !positions.some(position => position.ownerTafsiliCode === ownerCode)) {
          throw new Error('شریک مرتبط با مصوبه سرمایه را انتخاب کنید.');
        }
        if ((isCapitalIncreaseEvent || isCapitalDecreaseEvent) && profile.legalForm === 'joint_stock') {
          if (!Number.isInteger(shareCount) || shareCount <= 0 || !profile.nominalShareValue ||
            Math.abs(eventAmount - shareCount * profile.nominalShareValue) > 0.01) {
            throw new Error('مبلغ تغییر سرمایه سهامی باید با تعداد سهام × ارزش اسمی برابر باشد.');
          }
          if (isCapitalIncreaseEvent &&
            (profile.issuedShares || 0) + shareCount > (profile.authorizedShares || 0)) {
            throw new Error('تعداد سهام جدید از سهام مصوب باقیمانده بیشتر است.');
          }
          if (isCapitalIncreaseEvent &&
            positions.reduce((total, position) => total + (issuedSharesByOwner[position.ownerTafsiliCode] || 0), 0) !== shareCount) {
            throw new Error('جمع سهام تخصیص‌یافته به شرکا باید برابر تعداد سهام جدید باشد.');
          }
          if (isCapitalDecreaseEvent &&
            (Number(positions.find(position => position.ownerTafsiliCode === ownerCode)?.shareCount) || 0) < shareCount) {
            throw new Error('تعداد سهام کاهش‌یافته از سهام شریک بیشتر است.');
          }
        }
        if (isCapitalDecreaseEvent && eventAmount > profile.registeredCapital) {
          throw new Error('کاهش سرمایه نمی‌تواند از سرمایه ثبت‌شده بیشتر باشد.');
        }
        if (isCapitalDecreaseEvent &&
          eventAmount > (positions.find(position => position.ownerTafsiliCode === ownerCode)?.committedCapital || 0)) {
          throw new Error('مبلغ کاهش از تعهد سرمایه شریک بیشتر است.');
        }
        if (isCapitalIncreaseEvent && profile.legalForm !== 'joint_stock' &&
          !partners.some(partner => partner.code === ownerCode)) {
          throw new Error('برای افزایش سرمایه، شریک دریافت‌کننده را انتخاب کنید.');
        }
        if (isCapitalDecreaseEvent && sourceAccount === '30104' &&
          eventAmount > Math.max(0, -equityAccountBalance('30104', ownerCode))) {
          throw new Error('ابطال تعهد از مانده سرمایه پرداخت‌نشده همان شریک بیشتر است.');
        }
        if (isCapitalDecreaseEvent && sourceAccount !== '30104' &&
          eventAmount > (positions.find(position => position.ownerTafsiliCode === ownerCode)?.paidCapital || 0)) {
          throw new Error('بازپرداخت سرمایه از مبلغ پرداخت‌شده همان شریک بیشتر است.');
        }
        if ((isCapitalIncreaseEvent || isCapitalDecreaseEvent || eventType === 'dividend_payment') && !account) {
          throw new Error('حساب طرف سند را انتخاب کنید.');
        }
        if (eventType === 'dividend_declaration' && eventAmount > Math.max(0, equityAccountBalance('30201'))) {
          throw new Error('سود سهام مصوب از مانده بستانکار سود انباشته بیشتر است.');
        }
        if (eventType === 'profit_appropriation' && eventAmountToPost > Math.max(0, equityAccountBalance('30201'))) {
          throw new Error('سود تخصیص‌یافته از مانده بستانکار سود انباشته بیشتر است.');
        }
        if (eventType === 'dividend_payment' && !positions.some(position => position.ownerTafsiliCode === ownerCode)) {
          throw new Error('شریک دریافت‌کننده سود سهام را انتخاب کنید.');
        }
        if (eventType === 'dividend_payment' &&
          eventAmount > Math.max(0, equityAccountBalance('20402', ownerCode))) {
          throw new Error('پرداخت از مانده سود سهام پرداختنی همان شریک بیشتر است.');
        }

        let statutoryReserveAmount = 0;
        if (eventType === 'profit_appropriation') {
          const reserve = calculateStatutoryReserveAllocation(
            eventAmountToPost,
            Math.max(0, equityAccountBalance('30401')),
            profile.registeredCapital
          );
          statutoryReserveAmount = reserve.allocation;
          if (statutoryReserveAmount + optionalReserve <= 0 || statutoryReserveAmount + optionalReserve > eventAmountToPost) {
            throw new Error('مبلغ اندوخته‌ها نامعتبر است یا از سود خالص دوره بیشتر می‌شود.');
          }
        }

        const journal = eventType === 'dividend_declaration'
          ? buildDividendJournal({ tenantId, eventId, effectiveDate: eventDate, eventType, amount: eventAmount, positions })
          : isCapitalIncreaseEvent && profile.legalForm === 'joint_stock'
            ? buildShareIssueJournal({
                tenantId,
                eventId,
                effectiveDate: eventDate,
                nominalShareValue: profile.nominalShareValue || 0,
                sourceAccountCode: account?.code || '',
                sourceAccountTitle: account?.title || '',
                unpaidCapital,
                sharePremium,
                allocations: positions.map(position => ({
                  ownerTafsiliCode: position.ownerTafsiliCode,
                  ownerName: position.ownerName,
                  shareCount: issuedSharesByOwner[position.ownerTafsiliCode] || 0
                }))
              })
            : buildEquityEventJournal({
              tenantId,
              eventId,
              eventType: isCapitalIncreaseEvent
                ? 'capital_increase'
                : eventType as 'capital_decrease' | 'profit_appropriation' | 'dividend_declaration' | 'dividend_payment',
              effectiveDate: eventDate,
              amount: eventType === 'profit_appropriation' ? statutoryReserveAmount + optionalReserve : eventAmount,
              sourceAccountCode: account?.code,
              sourceAccountTitle: account?.title,
              ownerTafsiliCode: ownerCode || undefined,
              ownerTafsiliTitle: partners.find(partner => partner.code === ownerCode)?.title,
              unpaidCapital,
              sharePremium,
              statutoryReserveAmount,
              optionalReserveAmount: optionalReserve
            });
        await addAccountingEntries(journal);

        if (isCapitalIncreaseEvent || isCapitalDecreaseEvent) {
          const sign = isCapitalIncreaseEvent ? 1 : -1;
          const paidAmount = isCapitalIncreaseEvent ? eventAmount + sharePremium - unpaidCapital : eventAmount;
          const updatedProfile = {
            ...profile,
            registeredCapital: profile.registeredCapital + sign * eventAmount,
            issuedShares: profile.legalForm === 'joint_stock'
              ? (profile.issuedShares || 0) + sign * shareCount
              : profile.issuedShares,
            updatedAt: new Date().toISOString(),
            version: (profile.version || 0) + 1
          };
          const shareAllocations = profile.legalForm === 'joint_stock' && isCapitalIncreaseEvent
            ? new Map(Object.entries(issuedSharesByOwner))
            : new Map<string, number>();
          const updatedPositions = positions.map(position => {
            const allocatedShares = shareAllocations.get(position.ownerTafsiliCode) || 0;
            const affectedOwner = isCapitalIncreaseEvent && profile.legalForm === 'joint_stock'
              ? allocatedShares > 0
              : position.ownerTafsiliCode === ownerCode;
            const positionCapitalChange = profile.legalForm === 'joint_stock' && isCapitalIncreaseEvent
              ? allocatedShares * (profile.nominalShareValue || 0)
              : affectedOwner ? eventAmount : 0;
            const positionUnpaidCapital = isCapitalIncreaseEvent
              ? profile.legalForm === 'joint_stock'
                ? unpaidCapital * allocatedShares / shareCount
                : affectedOwner ? unpaidCapital : 0
              : 0;
            const nextShares = (Number(position.shareCount) || 0) +
              (profile.legalForm === 'joint_stock' && isCapitalIncreaseEvent
                ? allocatedShares
                : affectedOwner ? sign * shareCount : 0);
            const nextCommitted = position.committedCapital + (affectedOwner ? sign * positionCapitalChange : 0);
            const paidChange = isCapitalIncreaseEvent
              ? Math.max(0, positionCapitalChange - positionUnpaidCapital)
              : sourceAccount === '30104' ? 0 : positionCapitalChange;
            const nextPaid = position.paidCapital + (affectedOwner ? sign * paidChange : 0);
            return {
              ...position,
              shareCount: profile.legalForm === 'joint_stock' ? nextShares : position.shareCount,
              ownershipPercent: profile.legalForm === 'joint_stock' && updatedProfile.issuedShares
                ? nextShares / updatedProfile.issuedShares * 100
                : updatedProfile.registeredCapital > 0 ? nextCommitted / updatedProfile.registeredCapital * 100 : 0,
              committedCapital: nextCommitted,
              paidCapital: nextPaid,
              effectiveDate: eventDate,
              version: (position.version || 0) + 1
            };
          });
          if (isCapitalIncreaseEvent && profile.legalForm !== 'joint_stock' &&
            !positions.some(position => position.ownerTafsiliCode === ownerCode)) {
            const recipient = partners.find(partner => partner.code === ownerCode);
            if (!recipient) throw new Error('شریک دریافت‌کننده سرمایه یافت نشد.');
            updatedPositions.push({
              id: uuidv4(), tenantId, ownerTafsiliCode: recipient.code, ownerName: recipient.title,
              shareCount: undefined,
              effectiveDate: eventDate, ownershipPercent: eventAmount / updatedProfile.registeredCapital * 100,
              committedCapital: eventAmount, paidCapital: Math.max(0, paidAmount - sharePremium), version: 1
            });
            updatedPositions.forEach(position => {
              position.ownershipPercent = position.committedCapital / updatedProfile.registeredCapital * 100;
            });
          }
          if (updatedPositions.some(position => position.paidCapital > position.committedCapital || position.committedCapital < 0)) {
            throw new Error('مبلغ تغییر سرمایه با تعهد یا پرداخت ثبت‌شده شریک سازگار نیست.');
          }
          await saveEquityRecord('equityCompanyProfiles', updatedProfile);
          for (const position of updatedPositions) await saveEquityRecord('equityOwnershipPositions', position);
          setProfile(updatedProfile);
          setPositions(updatedPositions);
        }

        await createEvent(eventType, {
          amount: eventAmountToPost, sourceAccountCode: sourceAccount, ownerCode, shareCount,
          issuedSharesByOwner: isCapitalIncreaseEvent && profile.legalForm === 'joint_stock' ? issuedSharesByOwner : undefined,
          unpaidCapital, sharePremium, statutoryReserveAmount, optionalReserve
        }, `DOC-EQT-${eventId}`);
      } else if (isOwnershipTransferEvent) {
        const recipient = {
          ownerTafsiliCode: transferToCode,
          ownerName: partners.find(partner => partner.code === transferToCode)?.title || ''
        };
        const transferred = profile.legalForm === 'joint_stock'
          ? transferShares(positions, ownerCode, recipient, shareCount, eventDate)
          : transferPartnershipInterest(positions, ownerCode, recipient, interestPercent, eventDate);
        const totalShares = transferred.reduce((total, position) => total + (Number(position.shareCount) || 0), 0);
        const nextPositions = transferred.map(position => ({
          ...position,
          ownershipPercent: profile.legalForm === 'joint_stock'
            ? totalShares ? (Number(position.shareCount) || 0) / totalShares * 100 : 0
            : position.ownershipPercent,
          tenantId,
          version: (position.version || 0) + 1,
          updatedAt: new Date().toISOString()
        }));
        for (const position of nextPositions) await saveEquityRecord('equityOwnershipPositions', position);
        setPositions(nextPositions.filter(position =>
          (Number(position.shareCount) || 0) > 0 || position.committedCapital > 0
        ));
        await createEvent(eventType, {
          fromOwnerCode: ownerCode,
          toOwnerCode: transferToCode,
          shareCount: profile.legalForm === 'joint_stock' ? shareCount : undefined,
          ownershipPercent: profile.legalForm === 'joint_stock' ? undefined : interestPercent,
          considerationAmount: eventAmount,
          companyCapitalChanged: false
        });
      }
      setMessage('رویداد با مرجع مصوبه ثبت شد و داده‌ها برای همگام‌سازی آفلاین آماده‌اند.');
      setEventAmount(0);
      setApprovalReference('');
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : String(postError));
    }
  };

  const rightsEntitlements = profile?.legalForm === 'joint_stock' && shareCount > 0
    ? (() => {
        try { return calculateRightsEntitlements(positions, shareCount); } catch { return []; }
      })()
    : [];

  if (loading || !profile) {
    return <div className="p-8 text-sm text-slate-500">در حال بارگذاری دفتر سرمایه...</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">سرمایه و حقوق صاحبان سهام</h1>
          <p className="mt-1 text-xs text-slate-500">پروفایل حقوقی، دفتر مالکیت تاریخ‌دار و اسناد مصوب</p>
        </div>
        <div className="text-xs text-slate-500">سرمایه ثبت‌شده: {formatCurrency(profile.registeredCapital, settings.currency)}</div>
      </header>

      <nav className="flex gap-2 border-b border-slate-200">
        {([
          ['profile', 'مشخصات شرکت'], ['ownership', 'دفتر مالکیت'], ['assets', 'دارایی‌های ثابت'], ['events', 'رویدادها و اسناد']
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)}
            className={`px-3 py-2 text-sm border-b-2 ${activeTab === id ? 'border-teal-600 text-teal-800 font-bold' : 'border-transparent text-slate-500'}`}>
            {label}
          </button>
        ))}
      </nav>

      {error && <div role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {message && <div role="status" className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

      {activeTab === 'profile' && (
        <section className="max-w-3xl space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-slate-700">قالب حقوقی
              <select value={profile.legalForm} onChange={event => setProfile({ ...profile, legalForm: event.target.value as EquityCompanyProfile['legalForm'] })} className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm">
                <option value="joint_stock">سهامی</option>
                <option value="limited_liability">با مسئولیت محدود</option>
                <option value="general_partnership">تضامنی</option>
                <option value="other">سایر</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">تاریخ اثر
              <input value={profile.effectiveDate} onChange={event => setProfile({ ...profile, effectiveDate: event.target.value })} className="w-full rounded-md border border-slate-300 p-2 text-sm" />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">سرمایه ثبت‌شده
              <input type="number" min="0" value={profile.registeredCapital} onChange={event => setProfile({ ...profile, registeredCapital: Number(event.target.value) })} className="w-full rounded-md border border-slate-300 p-2 text-sm" />
            </label>
            {profile.legalForm === 'joint_stock' && <>
              <label className="space-y-1 text-xs font-medium text-slate-700">کل سهام مصوب
                <input type="number" min="1" step="1" value={profile.authorizedShares || ''} onChange={event => setProfile({ ...profile, authorizedShares: Number(event.target.value) })} className="w-full rounded-md border border-slate-300 p-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">سهام صادرشده
                <input type="number" min="1" step="1" value={profile.issuedShares || ''} onChange={event => setProfile({ ...profile, issuedShares: Number(event.target.value) })} className="w-full rounded-md border border-slate-300 p-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-700">ارزش اسمی هر سهم
                <input type="number" min="1" value={profile.nominalShareValue || ''} onChange={event => setProfile({ ...profile, nominalShareValue: Number(event.target.value) })} className="w-full rounded-md border border-slate-300 p-2 text-sm" />
              </label>
            </>}
          </div>
          <button type="button" onClick={() => void saveCompanyProfile()} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800">ذخیره پروفایل شرکت</button>
          <div className="max-w-xl space-y-3 border-t border-slate-200 pt-4">
            <label className="block space-y-1 text-xs text-slate-700">مرجع مدرک ثبتی/مصوبه افتتاحیه
              <input value={openingApprovalReference} onChange={event => setOpeningApprovalReference(event.target.value)} className="w-full rounded-md border border-slate-300 p-2 text-sm" />
            </label>
            <button type="button" onClick={() => void postOpeningCapitalJournal()} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-900">ثبت سند طبقه‌بندی سرمایه افتتاحیه</button>
            <p className="text-[11px] leading-5 text-slate-500">این سند دارایی را دوباره ثبت نمی‌کند؛ ۳۰۱۰۳ را به سرمایه‌ی مستند شرکا منتقل و تعهد پرداخت‌نشده را در ۳۰۱۰۴ نگه می‌دارد.</p>
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-700">مانده حساب تراز افتتاحیه (۳۰۱۰۳): {formatCurrency(equityAccountBalance('30103'), settings.currency)}</p>
              <label className="block space-y-1 text-xs text-slate-700">حساب طبقه‌بندی باقیمانده
                <select value={classificationAccountCode} onChange={event => setClassificationAccountCode(event.target.value as typeof classificationAccountCode)} className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm">
                  <option value="30201">سود (زیان) انباشته</option>
                  <option value="30301">مازاد تجدید ارزیابی مستند</option>
                  <option value="30401">اندوخته قانونی مصوب</option>
                  <option value="30402">اندوخته اختیاری مصوب</option>
                </select>
              </label>
              <button type="button" onClick={() => void classifyOpeningEquityBalance()} className="rounded-md border border-slate-700 px-4 py-2 text-sm font-bold text-slate-800">طبقه‌بندی مانده باقیمانده</button>
              <p className="text-[11px] text-slate-500">حساب مقصد فقط با مدرک/مصوبه پشتیبان انتخاب شود؛ مانده‌ی ۳۰۱۰۳ به‌خودی‌خود سرمایه‌ی شریک نیست.</p>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'assets' && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <form onSubmit={event => void postFixedAssetOpening(event)} className="space-y-3 border border-slate-200 p-4">
            <h2 className="text-sm font-bold text-slate-800">ثبت دارایی ثابت افتتاحیه</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">شناسه دارایی<input required value={assetTag} onChange={event => setAssetTag(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
              <label className="space-y-1 text-xs">عنوان دارایی<input required value={assetTitle} onChange={event => setAssetTitle(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
              <label className="space-y-1 text-xs">طبقه‌بندی
                <select value={assetClass} onChange={event => {
                  const nextClass = event.target.value as FixedAssetClass;
                  setAssetClass(nextClass);
                  if (nextClass === 'land') setAssetDepreciationMethod('none');
                  else if (assetDepreciationMethod === 'none') setAssetDepreciationMethod('straight_line');
                }} className="w-full rounded-md border bg-white p-2 text-sm">
                  <option value="land">زمین</option><option value="building">ساختمان</option>
                  <option value="machinery">ماشین‌آلات</option><option value="equipment">تجهیزات</option>
                  <option value="furniture">اثاثه</option><option value="vehicle">وسایط نقلیه</option><option value="other">سایر</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">تاریخ تحصیل<input required value={assetAcquisitionDate} onChange={event => setAssetAcquisitionDate(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
              <label className="space-y-1 text-xs">تاریخ آماده بهره‌برداری<input required value={assetInServiceDate} onChange={event => setAssetInServiceDate(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
              <label className="space-y-1 text-xs">بهای ناخالص<input type="number" min="1" value={assetGrossCost || ''} onChange={event => setAssetGrossCost(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>
              <label className="space-y-1 text-xs">استهلاک انباشته تا تاریخ افتتاحیه<input type="number" min="0" value={assetAccumulatedDepreciation} onChange={event => setAssetAccumulatedDepreciation(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>
              <label className="space-y-1 text-xs">ارزش اسقاط<input type="number" min="0" value={assetResidualValue} onChange={event => setAssetResidualValue(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>
              <label className="space-y-1 text-xs">روش استهلاک
                <select value={assetDepreciationMethod} onChange={event => setAssetDepreciationMethod(event.target.value as FixedAssetRecord['depreciationMethod'])} className="w-full rounded-md border bg-white p-2 text-sm">
                  <option value="none">بدون استهلاک</option><option value="straight_line">خط مستقیم</option>
                  <option value="declining_balance">مانده نزولی</option><option value="units_of_production">کارکرد تولید</option>
                </select>
              </label>
              {assetDepreciationMethod !== 'none' && <label className="space-y-1 text-xs">عمر مفید (ماه)<input type="number" min="1" step="1" value={assetUsefulLifeMonths || ''} onChange={event => setAssetUsefulLifeMonths(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>}
              <label className="space-y-1 text-xs">مرجع مالکیت/ارزش‌گذاری<input required value={assetValuationReference} onChange={event => setAssetValuationReference(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
            </div>
            <button type="submit" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white">ثبت دارایی و سند افتتاحیه</button>
            <p className="text-[11px] leading-5 text-slate-500">زمین به‌صورت پیش‌فرض مستهلک نمی‌شود. بهای ناخالص و استهلاک انباشته جدا ثبت می‌شوند؛ ارزش دفتری خالص نباید از ارزش اسقاط کمتر شود.</p>
          </form>
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">رجیستر دارایی‌های افتتاحیه</h2>
            {fixedAssets.length === 0 && <p className="text-xs text-slate-500">دارایی ثابتی ثبت نشده است.</p>}
            {fixedAssets.map(asset => <article key={asset.id} className="border border-slate-200 p-3 text-xs">
              <div className="flex justify-between gap-3"><strong>{asset.assetTag} • {asset.title}</strong><span>{asset.assetClass}</span></div>
              <div className="mt-1 text-slate-600">بهای ناخالص {formatCurrency(asset.grossCost, settings.currency)} • استهلاک {formatCurrency(asset.accumulatedDepreciation, settings.currency)}</div>
              <div className="mt-1 font-mono text-slate-500">{asset.journalDocumentNumber}</div>
            </article>)}
          </div>
        </section>
      )}

      {activeTab === 'ownership' && (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">تاریخ اثر
              <input value={ownershipEffectiveDate} onChange={event => setOwnershipEffectiveDate(event.target.value)} className="rounded-md border border-slate-300 p-2 text-sm" />
            </label>
            <input value={newPartnerTitle} onChange={event => setNewPartnerTitle(event.target.value)} placeholder="نام شریک جدید" className="min-w-48 rounded-md border border-slate-300 p-2 text-sm" />
            <button type="button" onClick={createTenantPartner} className="rounded-md border border-slate-400 px-3 py-2 text-sm text-slate-700">تعریف شریک این مستأجر</button>
            <select value={ownerCode} onChange={event => setOwnerCode(event.target.value)} className="min-w-56 rounded-md border border-slate-300 bg-white p-2 text-sm">
              <option value="">انتخاب شریک ثبت‌شده در تفصیلی‌ها</option>
              {partners.filter(partner => !positions.some(position => position.ownerTafsiliCode === partner.code)).map(partner => <option key={partner.id} value={partner.code}>{partner.code} - {partner.title}</option>)}
            </select>
            <button type="button" onClick={addPartnerPosition} className="rounded-md border border-teal-700 px-3 py-2 text-sm text-teal-800">افزودن مالک</button>
          </div>
          <div className="overflow-x-auto border border-slate-200">
            <table className="w-full min-w-[760px] text-right text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2">شریک</th>{profile.legalForm === 'joint_stock' && <th className="p-2">تعداد سهام</th>}<th className="p-2">درصد مالکیت</th><th className="p-2">تعهد سرمایه</th><th className="p-2">پرداخت‌شده</th></tr></thead>
              <tbody>{positions.map(position => <tr key={position.id} className="border-t border-slate-100">
                <td className="p-2">{position.ownerName} <span className="text-slate-400">({position.ownerTafsiliCode})</span></td>
                {profile.legalForm === 'joint_stock' && <td className="p-2"><input type="number" min="0" step="1" value={position.shareCount || 0} onChange={event => updatePosition(position.id, 'shareCount', event.target.value)} className="w-28 rounded border p-1" /></td>}
                <td className="p-2"><input type="number" min="0" max="100" step="0.000001" value={position.ownershipPercent} onChange={event => updatePosition(position.id, 'ownershipPercent', event.target.value)} className="w-28 rounded border p-1" /></td>
                <td className="p-2"><input type="number" min="0" value={position.committedCapital} onChange={event => updatePosition(position.id, 'committedCapital', event.target.value)} className="w-32 rounded border p-1" /></td>
                <td className="p-2"><input type="number" min="0" value={position.paidCapital} onChange={event => updatePosition(position.id, 'paidCapital', event.target.value)} className="w-32 rounded border p-1" /></td>
              </tr>)}</tbody>
            </table>
          </div>
          <button type="button" onClick={() => void saveOwnershipSnapshot()} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white">اعتبارسنجی و ذخیره snapshot</button>
          {profile.legalForm === 'joint_stock' && rightsEntitlements.length > 0 && <p className="text-xs text-slate-600">حق تقدم بر پایه تعداد سهام فعلی برای {shareCount.toLocaleString('fa-IR')} سهم جدید: {rightsEntitlements.map(item => `${item.ownerTafsiliCode}: ${item.entitledShares.toLocaleString('fa-IR')}`).join('، ')}</p>}
          <p className="text-xs text-amber-800">ورود/خروج شریک یا تغییر درصد در شرکت‌های غیرسهامی باید با قرارداد و مصوبه معتبر ثبت شود؛ سرقفلی یا ارزش‌گذاری روز به‌صورت خودکار برآورد نمی‌شود.</p>
        </section>
      )}

      {activeTab === 'events' && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <form onSubmit={event => void postSelectedEvent(event)} className="space-y-3 border border-slate-200 p-4">
            <h2 className="text-sm font-bold text-slate-800">ثبت رویداد مصوب</h2>
            <label className="block space-y-1 text-xs">نوع رویداد
              <select value={eventType} onChange={event => setEventType(event.target.value as EquityOperationType)} className="w-full rounded-md border p-2 text-sm">
                {Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                <option value="share_transfer">نقل‌وانتقال سهام میان مالکان</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">تاریخ اثر<input value={eventDate} onChange={event => setEventDate(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
              {eventType === 'profit_appropriation' && <>
                <label className="space-y-1 text-xs">از تاریخ<input value={profitPeriodStart} onChange={event => setProfitPeriodStart(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
                <label className="space-y-1 text-xs">تا تاریخ<input value={profitPeriodEnd} onChange={event => setProfitPeriodEnd(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
              </>}
              <label className="space-y-1 text-xs">{eventType === 'profit_appropriation' ? 'سود خالص محاسبه‌شده' : 'مبلغ / بهای معامله'}
                <input type="number" min="0" readOnly={eventType === 'profit_appropriation'} value={eventType === 'profit_appropriation' ? calculatedPeriodProfit : eventAmount} onChange={event => setEventAmount(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs">شماره مصوبه یا مدرک<input required value={approvalReference} onChange={event => setApprovalReference(event.target.value)} className="w-full rounded-md border p-2 text-sm" /></label>
              {(isCapitalIncreaseEventType(eventType) || isCapitalDecreaseEventType(eventType) || eventType === 'dividend_payment') && <label className="space-y-1 text-xs">حساب منبع/تسویه<select value={sourceAccount} onChange={event => setSourceAccount(event.target.value)} className="w-full rounded-md border bg-white p-2 text-sm">{JOURNAL_ACCOUNTS.filter(account => !isCapitalIncreaseEventType(eventType) || account.code !== '30104').map(account => <option key={account.code} value={account.code}>{account.code} - {account.title}</option>)}</select></label>}
              {(isCapitalIncreaseEventType(eventType) && profile.legalForm !== 'joint_stock' || isCapitalDecreaseEventType(eventType) || eventType === 'dividend_payment') && <label className="space-y-1 text-xs">شریک مرتبط<select value={ownerCode} onChange={event => setOwnerCode(event.target.value)} className="w-full rounded-md border bg-white p-2 text-sm"><option value="">انتخاب شریک</option>{(isCapitalIncreaseEventType(eventType) ? partners : positions).map(position => <option key={position.id} value={'code' in position ? position.code : position.ownerTafsiliCode}>{'title' in position ? position.title : position.ownerName}</option>)}</select></label>}
              {profile.legalForm === 'joint_stock' && (isCapitalIncreaseEventType(eventType) || isCapitalDecreaseEventType(eventType) || eventType === 'share_transfer' || eventType === 'partner_exit') && <label className="space-y-1 text-xs">تعداد سهام<input type="number" min="1" step="1" value={shareCount || ''} onChange={event => setShareCount(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>}
              {profile.legalForm === 'joint_stock' && isCapitalIncreaseEventType(eventType) && <div className="sm:col-span-2 space-y-2 border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs text-slate-700">تخصیص سهام مصوب جدید به هر شریک</strong>
                  <button type="button" onClick={() => {
                    try {
                      setIssuedSharesByOwner(Object.fromEntries(allocateWholeShareRights(positions, shareCount).map(item => [item.ownerTafsiliCode, item.entitledShares])));
                    } catch (allocationError) {
                      setError(allocationError instanceof Error ? allocationError.message : String(allocationError));
                    }
                  }} className="rounded border border-teal-700 px-2.5 py-1 text-[11px] text-teal-800">
                    پیشنهاد بر پایه حق تقدم
                  </button>
                </div>
                {positions.map(position => <label key={position.id} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                  <span>{position.ownerName} ({position.ownershipPercent.toLocaleString('fa-IR')}٪)</span>
                  <input type="number" min="0" step="1" value={issuedSharesByOwner[position.ownerTafsiliCode] || 0}
                    onChange={event => setIssuedSharesByOwner(current => ({ ...current, [position.ownerTafsiliCode]: Number(event.target.value) }))}
                    className="w-28 rounded border p-1.5 text-sm" />
                </label>)}
                <p className="text-[11px] text-slate-500">پیشنهاد حق تقدم صرفاً مبنای تناسبی است؛ تعداد نهایی باید با پذیره‌نویسی و مصوبه شرکت تطبیق داده شود.</p>
              </div>}
              {profile.legalForm !== 'joint_stock' && (eventType === 'share_transfer' || eventType === 'partner_exit') && <label className="space-y-1 text-xs">درصد سهم‌الشرکه‌ی انتقالی<input type="number" min="0.000001" max="100" step="0.000001" value={interestPercent || ''} onChange={event => setInterestPercent(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>}
              {isCapitalIncreaseEventType(eventType) && <>
                <label className="space-y-1 text-xs">تعهد پرداخت‌نشده<input type="number" min="0" value={unpaidCapital} onChange={event => setUnpaidCapital(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>
                <label className="space-y-1 text-xs">صرف سهام<input type="number" min="0" value={sharePremium} onChange={event => setSharePremium(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>
              </>}
              {eventType === 'capital_decrease' && <label className="space-y-1 text-xs">روش کاهش سرمایه<select value={sourceAccount} onChange={event => setSourceAccount(event.target.value)} className="w-full rounded-md border bg-white p-2 text-sm"><option value="10102">بازپرداخت نقدی از بانک</option><option value="30102">انتقال به حساب جاری شریک</option><option value="30104">ابطال تعهد پرداخت‌نشده</option></select></label>}
              {eventType === 'profit_appropriation' && <label className="space-y-1 text-xs">اندوخته اختیاری<input type="number" min="0" value={optionalReserve} onChange={event => setOptionalReserve(Number(event.target.value))} className="w-full rounded-md border p-2 text-sm" /></label>}
              {(eventType === 'share_transfer' || eventType === 'partner_exit') && <>
                <label className="space-y-1 text-xs">انتقال‌دهنده<select value={ownerCode} onChange={event => setOwnerCode(event.target.value)} className="w-full rounded-md border bg-white p-2 text-sm"><option value="">انتخاب فروشنده</option>{positions.map(position => <option key={position.id} value={position.ownerTafsiliCode}>{position.ownerName}</option>)}</select></label>
                <label className="space-y-1 text-xs">گیرنده<select value={transferToCode} onChange={event => setTransferToCode(event.target.value)} className="w-full rounded-md border bg-white p-2 text-sm"><option value="">انتخاب خریدار</option>{partners.filter(partner => partner.code !== ownerCode).map(partner => <option key={partner.id} value={partner.code}>{partner.title}</option>)}</select></label>
              </>}
            </div>
            <button type="submit" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white">ثبت رویداد و سند</button>
            <p className="text-[11px] leading-5 text-slate-500">نقل‌وانتقال سهام بین مالکان فقط دفتر مالکیت را تغییر می‌دهد و سند شرکت ایجاد نمی‌کند. ارزش‌گذاری، ورود/خروج شریک و آثار سرقفلی نیازمند روش مصوب و ارزیابی مستند است.</p>
          </form>
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">آخرین رویدادها</h2>
            {events.length === 0 && <p className="text-xs text-slate-500">رویدادی ثبت نشده است.</p>}
            {events.map(item => <article key={item.id} className="border border-slate-200 p-3 text-xs">
              <div className="flex justify-between gap-3"><strong>{EVENT_LABELS[item.eventType as keyof typeof EVENT_LABELS] || item.eventType}</strong><span className="text-slate-500">{item.effectiveDate}</span></div>
              <div className="mt-1 text-slate-600">{item.approvalReference || 'بدون مرجع'}</div>
              {item.journalDocumentNumber && <div className="mt-1 font-mono text-slate-500">{item.journalDocumentNumber}</div>}
              <div className="mt-1 text-teal-700">{item.status === 'posted' ? 'ثبت‌شده' : item.status}</div>
            </article>)}
          </div>
        </section>
      )}
    </div>
  );
};