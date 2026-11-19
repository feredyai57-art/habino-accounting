import React, { useState, useMemo } from 'react';
import { useAccounting } from '../lib/store';
import { Client, Employee } from '../types';
import { formatCurrency } from '../lib/currencyUtils';
import {
  Plus,
  Trash2,
  Edit3,
  UserCheck,
  Building,
  Phone,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  CreditCard,
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  ShieldAlert,
  Scale,
  Cloud
} from 'lucide-react';
import { ClientStatementModal } from './ClientStatementModal';
import { ClientProfilePrintModal } from './ClientProfilePrintModal';
import { getClientAccountBalance } from '../lib/clientLedger';
import { getStoredEmployees, PAYROLL_EDIT_EMPLOYEE_KEY } from '../lib/payrollEngine';
import { OnlineAddressMapPicker } from './common/OnlineAddressMapPicker';
import { exportClientsDirectoryToCsv } from '../lib/exportUtils';

export const Clients: React.FC<{ onNavigateToPayroll?: () => void }> = ({ onNavigateToPayroll }) => {
  const {
    clients,
    invoices,
    checks,
    transactions,
    accountingEntries,
    settings,
    addClient,
    updateClient,
    deleteClient,
    reconcileLedgerAndOpeningBalances,
    syncFromSupabase,
    isSupabaseLive,
    activeTenantId,
    hasPermission
  } = useAccounting();
  const canViewFinancials = hasPermission('accounting:view_reports');

  const employees = useMemo<Employee[]>(
    () => getStoredEmployees(activeTenantId),
    [activeTenantId]
  );

  const openEmployeeEditor = (employee: Employee) => {
    localStorage.setItem(PAYROLL_EDIT_EMPLOYEE_KEY, employee.id);
    window.dispatchEvent(new CustomEvent('habino_edit_payroll_employee', {
      detail: { tenantId: activeTenantId, employeeId: employee.id }
    }));
    onNavigateToPayroll?.();
  };

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'debtor' | 'creditor' | 'settled'>('all');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Expanded client row IDs
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal State (Create / Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [clientFormError, setClientFormError] = useState<string | null>(null);

  // Detailed Statement Modal State
  const [statementClient, setStatementClient] = useState<Client | null>(null);
  const [profileClient, setProfileClient] = useState<Client | null>(null);
  const [showDirectoryPrint, setShowDirectoryPrint] = useState(false);

  // Reconcile State & Feedback Modal
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<any | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [nationalCode, setNationalCode] = useState('');
  const [economicCode, setEconomicCode] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [type, setType] = useState<'individual' | 'corporate'>('individual');
  const [balance, setBalance] = useState<number>(0);
  const [balanceType, setBalanceType] = useState<'debtor' | 'creditor' | 'zero'>('zero');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [isBlockedForCredit, setIsBlockedForCredit] = useState<boolean>(false);

  const clientBalances = useMemo(
    () => new Map(clients.map(client => [
      client.id,
      getClientAccountBalance(accountingEntries, client.id, client.balance || 0, client.name)
    ])),
    [clients, accountingEntries]
  );

  // Filter clients
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (client.name || '').toLowerCase().includes(q);
        const matchCompany = (client.companyName || '').toLowerCase().includes(q);
        const matchPhone = (client.phone || '').toLowerCase().includes(q);
        const matchNational = (client.nationalCode || '').toLowerCase().includes(q);
        if (!matchName && !matchCompany && !matchPhone && !matchNational) return false;
      }

      // Balance status
      const bal = clientBalances.get(client.id) || 0;
      if (statusFilter === 'debtor' && bal <= 0) return false;
      if (statusFilter === 'creditor' && bal >= 0) return false;
      if (statusFilter === 'settled' && bal !== 0) return false;

      return true;
    });
  }, [clients, clientBalances, searchQuery, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = clients.length;
    const balances = clients.map(client => clientBalances.get(client.id) || 0);
    const totalDebtor = balances.filter(balance => balance > 0).reduce((s, balance) => s + balance, 0);
    const totalCreditor = balances.filter(balance => balance < 0).reduce((s, balance) => s + Math.abs(balance), 0);
    return { totalCount, totalDebtor, totalCreditor };
  }, [clients, clientBalances]);

  const openCreateModal = () => {
    setEditingClient(null);
    setFormStep(1);
    setClientFormError(null);
    setName('');
    setPhone('');
    setCompanyName('');
    setNationalCode('');
    setEconomicCode('');
    setEmail('');
    setAddress('');
    setPostalCode('');
    setLatitude(undefined);
    setLongitude(undefined);
    setType('individual');
    setBalance(0);
    setBalanceType('zero');
    setCreditLimit(0);
    setIsBlockedForCredit(false);
    setShowModal(true);
  };

  const openEditModal = (client: Client, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingClient(client);
    setFormStep(1);
    setClientFormError(null);
    setName(client.name || '');
    setPhone(client.phone || '');
    setCompanyName(client.companyName || '');
    setNationalCode(client.nationalCode || '');
    setEconomicCode(client.economicCode || '');
    setEmail(client.email || '');
    setAddress(client.address || '');
    setPostalCode(client.postalCode || '');
    setLatitude(client.lat ?? client.latitude);
    setLongitude(client.lng ?? client.longitude);
    setType(client.type || 'individual');
    setCreditLimit(client.creditLimit || 0);
    setIsBlockedForCredit(client.isBlockedForCredit || false);
    
    const rawBal = Number(client.balance) || 0;
    if (rawBal > 0) {
      setBalanceType('debtor');
      setBalance(rawBal);
    } else if (rawBal < 0) {
      setBalanceType('creditor');
      setBalance(Math.abs(rawBal));
    } else {
      setBalanceType('zero');
      setBalance(0);
    }
    setShowModal(true);
  };

  const handleDelete = (client: Client, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setClientToDelete(client);
  };

  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;
    await deleteClient(clientToDelete.id);
    if (expandedId === clientToDelete.id) {
      setExpandedId(null);
    }
    setClientToDelete(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleRunReconcile = async () => {
    setIsReconciling(true);
    try {
      const rep = await reconcileLedgerAndOpeningBalances();
      setReconcileReport(rep);
    } catch (err: any) {
      alert('خطا در اجرای تطبیق و بازسازی دفتر کل: ' + (err?.message || err));
    } finally {
      setIsReconciling(false);
    }
  };

  const handleSubmit = async (saveFromBasicInfo = false) => {
    if (formStep < 3 && !saveFromBasicInfo) {
      setClientFormError('برای ثبت طرف‌حساب، ابتدا مراحل را تا بخش «مانده و اعتبار» ادامه دهید.');
      return;
    }
    if (!name.trim()) {
      setClientFormError('نام طرف‌حساب را وارد کنید.');
      setFormStep(1);
      return;
    }

    const requestedBalance = balanceType === 'debtor'
      ? Math.abs(Number(balance) || 0)
      : balanceType === 'creditor'
      ? -Math.abs(Number(balance) || 0)
      : 0;
    const isOpeningPeriod = settings.openingPeriodStatus !== 'completed';
    const finalBalance = saveFromBasicInfo
      ? 0
      : isOpeningPeriod
        ? requestedBalance
        : (editingClient?.balance || 0);

    const payload = {
      name,
      phone,
      companyName,
      nationalCode,
      economicCode,
      email,
      address,
      postalCode,
      lat: latitude,
      lng: longitude,
      latitude,
      longitude,
      type,
      balance: finalBalance,
      creditLimit: saveFromBasicInfo ? 0 : Number(creditLimit) || 0,
      isBlockedForCredit: saveFromBasicInfo ? false : isBlockedForCredit
    };

    if (editingClient) {
      await updateClient(editingClient.id, payload, isOpeningPeriod);
    } else {
      await addClient(payload);
    }

    setShowModal(false);
  };

  const goToClientFormStep = (step: 1 | 2 | 3) => {
    if (step > 1 && !name.trim()) {
      setClientFormError('برای ادامه، نام طرف‌حساب را وارد کنید.');
      return;
    }
    setClientFormError(null);
    setFormStep(step);
  };

  const advanceClientForm = () => {
    goToClientFormStep(Math.min(formStep + 1, 3) as 1 | 2 | 3);
  };

  const handleCloudSync = async () => {
    setIsSyncingCloud(true);
    setSyncStatusMsg(null);
    try {
      const res = await syncFromSupabase();
      if (res.success) {
        setSyncStatusMsg({
          type: 'success',
          text: res.message || 'همگام‌سازی ابری طرف‌های حساب با موفقیت انجام شد.'
        });
      } else {
        setSyncStatusMsg({
          type: 'error',
          text: res.message || 'خطا در دریافت اطلاعات از پایگاه ابری.'
        });
      }
    } catch (err: any) {
      setSyncStatusMsg({
        type: 'error',
        text: 'خطا در برقراری ارتباط با پایگاه ابری: ' + (err?.message || err)
      });
    } finally {
      setIsSyncingCloud(false);
      setTimeout(() => setSyncStatusMsg(null), 4500);
    }
  };

  return (
    <div className="space-y-5" id="clients-module">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800" id="clients-title">
            مدیریت طرف‌های حساب و مخاطبین
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            فهرست کرکره‌ای یکپارچه، جستجوی سریع، کارت حساب تفصیلی، کنترل سقف اعتبار و دفتر کل
          </p>
          {syncStatusMsg && (
            <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium ${
              syncStatusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {syncStatusMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>{syncStatusMsg.text}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowDirectoryPrint(true)}
            disabled={filteredClients.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="چاپ دفترچه نشانی طرف‌حساب‌های فیلترشده"
          >
            <Printer className="h-3.5 w-3.5" />
            چاپ دفترچه نشانی
          </button>
          <button
            type="button"
            onClick={() => exportClientsDirectoryToCsv(filteredClients, clientBalances, settings.currency, canViewFinancials)}
            disabled={filteredClients.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="دریافت CSV دفترچه مخاطبین با رعایت مجوز اطلاعات مالی"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            خروجی CSV
          </button>
          <button
            type="button"
            onClick={handleCloudSync}
            disabled={isSyncingCloud}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-emerald-200 disabled:opacity-60 shadow-2xs"
            title="دریافت و بروزرسانی بلادرنگ مخاطبین از پایگاه داده ابری سوپابیس"
            id="cloud-sync-clients-btn"
          >
            <Cloud className={`w-3.5 h-3.5 text-emerald-600 ${isSyncingCloud ? 'animate-pulse' : ''}`} />
            <span>{isSyncingCloud ? 'در حال همگام‌سازی...' : 'بروزرسانی از ابر'}</span>
          </button>
          <button
            type="button"
            onClick={handleRunReconcile}
            disabled={isReconciling}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-300/80 disabled:opacity-60"
            title="تطبیق و بازسازی اسناد افتتاحیه و پاکسازی رکوردهای یتیم"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isReconciling ? 'animate-spin' : ''}`} />
            <span>{isReconciling ? 'در حال تطبیق...' : 'تطبیق اسناد دفتر کل (Reconcile)'}</span>
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
            id="add-client-btn"
          >
            <Plus className="w-4 h-4" />
            افزودن طرف‌حساب جدید
          </button>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-indigo-100 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">پرسنل و کارکنان</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">فهرست کارکنان این واحد؛ ویرایش اطلاعات کامل در ماژول حقوق و دستمزد</p>
          </div>
          <span className="text-xs text-slate-500">{employees.length} نفر</span>
        </div>
        {employees.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {employees.map(employee => (
              <div key={employee.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{employee.firstName} {employee.lastName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[employee.jobTitle, employee.department].filter(Boolean).join(' · ') || 'عنوان شغلی ثبت نشده'}
                    {' · '}
                    {employee.status === 'active' ? 'فعال' : employee.status === 'leave' ? 'مرخصی' : 'قطع همکاری'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEmployeeEditor(employee)}
                  disabled={!onNavigateToPayroll}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 rounded-lg border border-indigo-100"
                >
                  ویرایش پرونده
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-5 text-xs text-slate-500">برای این واحد پرونده پرسنلی ثبت نشده است.</p>
        )}
      </section>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500">کل طرف‌های حساب</span>
            <p className="text-base font-bold text-slate-900 mt-0.5">{stats.totalCount} مخاطب</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500">مجموع مطالبات (بدهکار به ما)</span>
            <p className="text-base font-bold text-rose-600 mt-0.5">
              {formatCurrency(stats.totalDebtor, settings.currency)}
            </p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500">مجموع تعهدات (بستانکار از ما)</span>
            <p className="text-base font-bold text-emerald-600 mt-0.5">
              {formatCurrency(stats.totalCreditor, settings.currency)}
            </p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Quick Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        {/* Quick Search Input */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجوی سریع نام، شرکت، شماره تماس، کد ملی..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            id="clients-quick-search"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            همه ({clients.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('debtor')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'debtor'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            بدهکاران ({clients.filter(c => (clientBalances.get(c.id) || 0) > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('creditor')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'creditor'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            بستانکاران ({clients.filter(c => (clientBalances.get(c.id) || 0) < 0).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('settled')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'settled'
                ? 'bg-slate-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            بی‌حساب ({clients.filter(c => (clientBalances.get(c.id) || 0) === 0).length})
          </button>
        </div>
      </div>

      {/* Accordion / Expandable List of Clients */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs divide-y divide-slate-100">
        {filteredClients.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            هیچ مخاطبی مطابق با جستجوی شما یافت نشد.
            {(searchQuery || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="block mx-auto mt-3 px-3 py-1.5 rounded-lg border border-slate-200 text-blue-700 hover:bg-blue-50 font-semibold"
              >
                پاک‌کردن جستجو و فیلترها
              </button>
            )}
          </div>
        ) : (
          filteredClients.map(client => {
            const isExpanded = expandedId === client.id;
            const bal = clientBalances.get(client.id) || 0;
            const clientInvoices = invoices.filter(i => i.clientId === client.id);
            const clientChecks = checks.filter(c => c.clientId === client.id);

            return (
              <div key={client.id} className="transition-colors hover:bg-slate-50/50">
                {/* Compact Row */}
                <div
                  onClick={() => toggleExpand(client.id)}
                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  {/* Left: Icon & Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      client.type === 'corporate' ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {client.type === 'corporate' ? (
                        <Building className="w-4 h-4" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 truncate">{client.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                          {client.type === 'corporate' ? 'حقوقی' : 'حقیقی'}
                        </span>
                      </div>
                      {client.companyName && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{client.companyName}</p>
                      )}
                    </div>
                  </div>

                  {/* Middle: Phone & Counts */}
                  <div className="hidden md:flex items-center gap-6 text-xs text-slate-500">
                    {client.phone && (
                      <div className="flex items-center gap-1.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>{clientInvoices.length} فاکتور</span>
                      <span>•</span>
                      <span>{clientChecks.length} چک صیادی</span>
                    </div>
                  </div>

                  {/* Right: Balance & Actions & Expand toggle */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left pl-2">
                      <div className={`text-xs font-bold font-mono ${
                        bal > 0 ? 'text-rose-600' : bal < 0 ? 'text-emerald-600' : 'text-slate-600'
                      }`}>
                        {formatCurrency(Math.abs(bal), settings.currency)}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {bal > 0 ? 'بدهکار به ما' : bal < 0 ? 'بستانکار از ما' : 'تسویه / بی‌حساب'}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setStatementClient(client);
                        }}
                        className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="کارت حساب تفصیلی و صورت ریز گردش اسناد"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={e => openEditModal(client, e)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="ویرایش مشخصات طرف‌حساب"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={e => handleDelete(client, e)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="حذف طرف‌حساب"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {/* Accordion Toggle */}
                      <button
                        type="button"
                        aria-label={isExpanded ? `بستن جزئیات ${client.name}` : `نمایش جزئیات ${client.name}`}
                        aria-expanded={isExpanded}
                        onClick={e => {
                          e.stopPropagation();
                          toggleExpand(client.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Accordion Details */}
                {isExpanded && (
                  <div className="bg-slate-50/70 p-4 border-t border-slate-100 text-xs text-slate-600 space-y-4 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-slate-200/80">
                      <div>
                        <span className="text-[10px] text-slate-400 block">شماره تماس:</span>
                        <span className="font-mono font-medium text-slate-800">{client.phone || 'ثبت نشده'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">کد ملی / شناسه ملی:</span>
                        <span className="font-mono font-medium text-slate-800">{client.nationalCode || 'ثبت نشده'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">کد اقتصادی:</span>
                        <span className="font-mono font-medium text-slate-800">{client.economicCode || 'ثبت نشده'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">ایمیل:</span>
                        <span className="font-mono font-medium text-slate-800">{client.email || 'ثبت نشده'}</span>
                      </div>
                      {client.address && (
                        <div className="col-span-2 sm:col-span-4 pt-1 border-t border-slate-100">
                          <span className="text-[10px] text-slate-400 block">نشانی:</span>
                          <span className="text-slate-700">{client.address}</span>
                        </div>
                      )}
                      {(client.postalCode || client.lat !== undefined || client.latitude !== undefined) && (
                        <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-2">
                          {client.postalCode && (
                            <div>
                              <span className="text-[10px] text-slate-400 block">کد پستی:</span>
                              <span className="font-mono font-medium text-slate-800">{client.postalCode}</span>
                            </div>
                          )}
                          {(client.lat ?? client.latitude) !== undefined && (client.lng ?? client.longitude) !== undefined && (
                            <div>
                              <span className="text-[10px] text-slate-400 block">مختصات جغرافیایی:</span>
                              <span className="font-mono font-medium text-slate-800">
                                {client.lat ?? client.latitude}, {client.lng ?? client.longitude}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Credit Status & Action Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200/80">
                      <div className="flex flex-wrap items-center gap-2">
                        {client.creditLimit && client.creditLimit > 0 ? (
                          <span className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-mono font-semibold flex items-center gap-1">
                            <Scale className="w-3.5 h-3.5 text-amber-600" />
                            سقف اعتبار: {formatCurrency(client.creditLimit, settings.currency)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 px-2 py-0.5">
                            سقف اعتبار: نامحدود
                          </span>
                        )}
                        {client.isBlockedForCredit && (
                          <span className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            مسدودیت صدور فاکتور نسیه
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setProfileClient(client)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl text-xs font-bold border border-sky-200 transition-colors cursor-pointer shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>پروفایل کامل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementClient(client)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer shrink-0"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>مشاهده و چاپ کارت حساب تفصیلی</span>
                      </button>
                    </div>

                    {/* Related Invoices & Checks Quick View */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Invoices */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            فاکتورهای ثبت‌شده ({clientInvoices.length})
                          </span>
                        </div>
                        {clientInvoices.length === 0 ? (
                          <p className="text-[11px] text-slate-400 py-1">فاکتوری برای این طرف‌حساب ثبت نشده است.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {clientInvoices.slice(0, 4).map(inv => (
                              <div key={inv.id} className="flex items-center justify-between text-[11px] p-1.5 bg-slate-50 rounded-lg">
                                <span className="font-mono font-bold">#{inv.invoiceNumber}</span>
                                <span className="text-slate-500 font-mono">{inv.date}</span>
                                <span className="font-bold text-slate-800 font-mono">
                                  {formatCurrency(inv.grandTotal, settings.currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Checks */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                            اسناد و چک‌های صیادی ({clientChecks.length})
                          </span>
                        </div>
                        {clientChecks.length === 0 ? (
                          <p className="text-[11px] text-slate-400 py-1">چکی برای این طرف‌حساب ثبت نشده است.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {clientChecks.slice(0, 4).map(chk => (
                              <div key={chk.id} className="flex items-center justify-between text-[11px] p-1.5 bg-slate-50 rounded-lg">
                                <span className="font-mono">صیاد: {chk.sayadNumber.slice(-6)}</span>
                                <span className="text-slate-500 font-mono">{chk.dueDate}</span>
                                <span className="font-bold text-slate-800 font-mono">
                                  {formatCurrency(chk.amount, settings.currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Add or Edit Client */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl max-w-3xl w-full h-[min(90dvh,680px)] max-h-[90dvh] p-4 sm:p-6 shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {editingClient ? 'ویرایش طرف‌حساب' : 'افزودن طرف‌حساب'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">اطلاعات را در سه گام کوتاه تکمیل کنید.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded-xl text-xs font-bold transition-colors"
                aria-label="بستن فرم طرف‌حساب"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">بستن</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 py-3 shrink-0" aria-label="مراحل فرم">
              {[
                { step: 1 as const, label: 'اطلاعات اصلی' },
                { step: 2 as const, label: 'راه‌های ارتباطی' },
                { step: 3 as const, label: 'مانده و اعتبار' }
              ].map(({ step, label }) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => goToClientFormStep(step)}
                  aria-current={formStep === step ? 'step' : undefined}
                  className={`rounded-xl px-2 py-2 text-[10px] sm:text-xs font-semibold transition-colors ${
                    formStep === step
                      ? 'bg-blue-600 text-white shadow-sm'
                      : formStep > step
                      ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="ml-1">{step}.</span>{label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto py-2">
                {formStep === 1 && (
                  <section className="space-y-4" aria-labelledby="client-form-step-1">
                    <div>
                      <h4 id="client-form-step-1" className="text-sm font-bold text-slate-800">اطلاعات اصلی</h4>
                      <p className="text-[11px] text-slate-500 mt-1">برای ثبت سریع، نام و نوع کافی است؛ اطلاعات دیگر را می‌توانید بعداً تکمیل کنید.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">نام کامل یا عنوان *</label>
                        <input
                          type="text"
                          required
                          autoFocus
                          value={name}
                          onChange={e => {
                            setName(e.target.value);
                            setClientFormError(null);
                          }}
                          placeholder="مثال: شرکت فنی مهندسی هابینو"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">نوع شخصیت</label>
                        <select
                          value={type}
                          onChange={e => setType(e.target.value as 'individual' | 'corporate')}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="individual">حقیقی (فردی / کارفرما)</option>
                          <option value="corporate">حقوقی (شرکت / سازمان)</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">نام شرکت / برند</label>
                        <input
                          type="text"
                          value={companyName}
                          onChange={e => setCompanyName(e.target.value)}
                          placeholder="در صورت وجود"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">شماره تماس</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          placeholder="مثال: ۰۹۱۲۱۲۳۴۵۶۷"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {formStep === 2 && (
                  <section className="space-y-2" aria-labelledby="client-form-step-2">
                    <div>
                      <h4 id="client-form-step-2" className="text-sm font-bold text-slate-800">شناسه‌ها و راه‌های ارتباطی</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">این اطلاعات اختیاری‌اند و بعداً هم قابل ویرایش هستند.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">کد ملی / شناسه ملی</label>
                        <input
                          type="text"
                          value={nationalCode}
                          onChange={e => setNationalCode(e.target.value)}
                          placeholder="۱۰ یا ۱۱ رقم"
                          className="w-full min-w-0 p-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">کد اقتصادی</label>
                        <input
                          type="text"
                          value={economicCode}
                          onChange={e => setEconomicCode(e.target.value)}
                          placeholder="کد اقتصادی"
                          className="w-full min-w-0 p-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-700 block mb-1">پست الکترونیکی</label>
                        <input
                          type="email"
                          dir="ltr"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="info@example.com"
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono text-xs text-left"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-700 block mb-1">نشانی</label>
                        <textarea
                          rows={2}
                          value={address}
                          onChange={e => setAddress(e.target.value)}
                          placeholder="استان، شهر، خیابان، پلاک و کد پستی"
                          className="w-full resize-none p-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <OnlineAddressMapPicker
                            value={address}
                            postalCode={postalCode}
                            lat={latitude}
                            lng={longitude}
                            onSelectAddress={payload => {
                              setAddress(payload.address);
                              setPostalCode(payload.postalCode || '');
                              setLatitude(payload.lat);
                              setLongitude(payload.lng);
                            }}
                          />
                          <input
                            type="text"
                            value={postalCode}
                            onChange={e => setPostalCode(e.target.value)}
                            placeholder="کد پستی (اختیاری)"
                            className="mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs focus:bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {formStep === 3 && (
                  <section className="space-y-3" aria-labelledby="client-form-step-3">
                    <div>
                      <h4 id="client-form-step-3" className="text-sm font-bold text-slate-800">مانده اول دوره و اعتبار</h4>
                      <p className="text-[11px] text-slate-500 mt-1">تنظیم مانده اختیاری است؛ با صفر، کاردکس بدون مانده افتتاحیه ساخته می‌شود.</p>
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3 space-y-2.5">
                      {settings.openingPeriodStatus === 'completed' ? (
                        <p className="text-xs text-slate-700 leading-relaxed">
                          دوره افتتاحیه بسته شده است؛ مانده از طریق فاکتور، دریافت، پرداخت یا سند اصلاحی ثبت می‌شود.
                        </p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                              <CreditCard className="w-4 h-4 text-blue-600" />
                              مانده حساب اول دوره
                            </label>
                            <span className="text-[10px] text-blue-700">
                              {settings.currency === 'IRT' ? 'تومان' : settings.currency === 'USD' ? 'دلار' : 'ریال'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-white rounded-xl border border-slate-200">
                            <button
                              type="button"
                              onClick={() => { setBalanceType('zero'); setBalance(0); }}
                              className={`py-2 px-1 text-[10px] sm:text-xs font-bold rounded-lg ${
                                balanceType === 'zero' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              بی‌حساب
                            </button>
                            <button
                              type="button"
                              onClick={() => setBalanceType('debtor')}
                              className={`py-2 px-1 text-[10px] sm:text-xs font-bold rounded-lg ${
                                balanceType === 'debtor' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              بدهکار به ما
                            </button>
                            <button
                              type="button"
                              onClick={() => setBalanceType('creditor')}
                              className={`py-2 px-1 text-[10px] sm:text-xs font-bold rounded-lg ${
                                balanceType === 'creditor' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              بستانکار از ما
                            </button>
                          </div>
                          {balanceType !== 'zero' && (
                            <div>
                              <input
                                type="number"
                                min="0"
                                value={balance || ''}
                                onChange={e => setBalance(Math.max(0, Number(e.target.value)))}
                                placeholder={`مبلغ مانده به ${settings.currency === 'IRT' ? 'تومان' : settings.currency === 'USD' ? 'دلار' : 'ریال'}`}
                                aria-label="مبلغ مانده اول دوره"
                                className="w-full p-2.5 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-sm font-bold text-slate-800"
                              />
                              <p className="mt-1 text-[10px] text-slate-600">
                                سند متوازن افتتاحیه در دفتر کل ثبت می‌شود.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                        سقف اعتبار و فروش نسیه
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        <div>
                          <label className="text-[11px] text-slate-600 block mb-1">حداکثر بدهی مجاز (صفر = نامحدود)</label>
                          <input
                            type="number"
                            min="0"
                            value={creditLimit || ''}
                            onChange={e => setCreditLimit(Math.max(0, Number(e.target.value)))}
                            placeholder="مثلاً ۵۰,۰۰۰,۰۰۰"
                            className="w-full p-2.5 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 font-mono text-xs font-bold"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-rose-700">
                          <input
                            type="checkbox"
                            checked={isBlockedForCredit}
                            onChange={e => setIsBlockedForCredit(e.target.checked)}
                            className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                          />
                          مسدودکردن کامل صدور فاکتور نسیه
                        </label>
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {clientFormError && (
                <p role="alert" className="mb-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                  {clientFormError}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (formStep === 1) setShowModal(false);
                    else {
                      setClientFormError(null);
                      setFormStep(step => Math.max(step - 1, 1) as 1 | 2 | 3);
                    }
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold"
                >
                  {formStep === 1 ? 'انصراف' : 'مرحله قبل'}
                </button>
                {formStep < 3 ? (
                  <div className="flex items-center gap-2">
                    {formStep === 1 && !editingClient && (
                      <button
                        type="button"
                        disabled={!name.trim()}
                        onClick={() => void handleSubmit(true)}
                        className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title="ثبت با اطلاعات اصلی؛ اطلاعات تکمیلی را بعداً اضافه کنید"
                      >
                        <Save className="h-3.5 w-3.5" />
                        ثبت سریع
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={advanceClientForm}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                    >
                      ادامه
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{editingClient ? 'ذخیره تغییرات' : 'ثبت طرف‌حساب'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Client Deletion */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200" dir="rtl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">حذف طرف‌حساب</h3>
                <p className="text-xs text-slate-500 mt-1">
                  آیا از حذف طرف‌حساب «<span className="font-semibold text-slate-800">{clientToDelete.name}</span>» از سامانه حسابداری اطمینان دارید؟
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={confirmDeleteClient}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف طرف‌حساب</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Client Statement Modal */}
      {statementClient && (
        <ClientStatementModal
          client={statementClient}
          onClose={() => setStatementClient(null)}
          invoices={invoices}
          transactions={transactions}
          accountingEntries={accountingEntries}
          checks={checks}
          settings={settings}
        />
      )}

      {profileClient && (
        <ClientProfilePrintModal
          mode="profile"
          clients={[profileClient]}
          selectedClient={profileClient}
          balances={canViewFinancials ? clientBalances : new Map()}
          canViewFinancials={canViewFinancials}
          settings={settings}
          invoices={invoices}
          checks={checks}
          onClose={() => setProfileClient(null)}
        />
      )}

      {showDirectoryPrint && (
        <ClientProfilePrintModal
          mode="directory"
          clients={filteredClients}
          balances={canViewFinancials ? clientBalances : new Map()}
          canViewFinancials={canViewFinancials}
          settings={settings}
          invoices={invoices}
          checks={checks}
          onClose={() => setShowDirectoryPrint(false)}
        />
      )}

      {/* Reconcile Results Modal */}
      {reconcileReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  گزارش تطبیق و بازسازی اسناد (Reconciliation)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تطبیق تراز افتتاحیه، دفتر کل و حذف رکوردهای یتیم
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-600">رکوردهای یتیم شناسایی و پاکسازی‌شده:</span>
                <span className="font-bold font-mono text-slate-900">{reconcileReport.purgedOrphansCount} ردیف</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-600">اسناد افتتاحیه دفتر کل بازسازی‌شده:</span>
                <span className="font-bold font-mono text-slate-900">{reconcileReport.reconstructedOpeningEntriesCount} سند</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-600">جمع کل بدهکار تراز افتتاحیه:</span>
                <span className="font-bold font-mono text-rose-600">
                  {formatCurrency(reconcileReport.openingBalanceSheet.totalDebit, settings.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-600">جمع کل بستانکار تراز افتتاحیه:</span>
                <span className="font-bold font-mono text-emerald-600">
                  {formatCurrency(reconcileReport.openingBalanceSheet.totalCredit, settings.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-600">وضعیت تراز دفتر کل:</span>
                <span className={`font-bold px-2 py-0.5 rounded-md ${
                  reconcileReport.openingBalanceSheet.isBalanced
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {reconcileReport.openingBalanceSheet.isBalanced ? 'کاملاً تراز و منطبق ✓' : 'دارای اختلاف'}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setReconcileReport(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
