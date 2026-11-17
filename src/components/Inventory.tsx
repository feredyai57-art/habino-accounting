import React, { useState, useMemo } from 'react';
import { useAccounting } from '../lib/store';
import { InventoryItem } from '../types';
import { formatCurrency, toPersianDigits } from '../lib/currencyUtils';
import {
  Plus,
  Trash2,
  Package,
  Wrench,
  Search,
  Edit2,
  AlertTriangle,
  Layers,
  Sparkles,
  Check,
  ScanLine,
  X,
  PackagePlus,
  Camera,
  RefreshCw,
  Cloud
} from 'lucide-react';
import { BarcodeScannerStudio } from './BarcodeScannerStudio';
import { StockInBarcodeModal } from './StockInBarcodeModal';
import { QuickBarcodeScannerModal } from './QuickBarcodeScannerModal';

export const Inventory: React.FC = () => {
  const {
    inventory,
    settings,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    syncFromSupabase,
    pushToSupabase,
    isSupabaseLive
  } = useAccounting();
  const isOpeningPeriod = settings.openingPeriodStatus !== 'completed';
  const [showModal, setShowModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showStockInModal, setShowStockInModal] = useState(false);
  const [showCameraBarcodeModal, setShowCameraBarcodeModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'service' | 'good'>('all');
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSyncCloud = async () => {
    setSyncingCloud(true);
    setSyncStatusMsg(null);
    try {
      const res = await syncFromSupabase();
      if (res.success) {
        setSyncStatusMsg({
          text: `همگام‌سازی با سوپابیس با موفقیت انجام شد (${toPersianDigits(inventory.length)} قلم آیتم فعال)`,
          isError: false
        });
      } else {
        setSyncStatusMsg({ text: res.message || 'خطا در دریافت اطلاعات', isError: true });
      }
    } catch (e: any) {
      setSyncStatusMsg({ text: e.message || 'خطا در اتصال به سوپابیس', isError: true });
    } finally {
      setSyncingCloud(false);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsDeletingItem(true);
    setDeleteError(null);
    try {
      await deleteInventoryItem(itemToDelete.id);
      setItemToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handlePushCloud = async () => {
    setSyncingCloud(true);
    setSyncStatusMsg(null);
    try {
      const res = await pushToSupabase();
      if (res.success) {
        setSyncStatusMsg({
          text: `ارسال موفق اطلاعات انبار به سوپابیس (${toPersianDigits(inventory.length)} قلم ذخیره شد)`,
          isError: false
        });
      } else {
        setSyncStatusMsg({ text: res.message || 'خطا در ارسال اطلاعات', isError: true });
      }
    } catch (e: any) {
      setSyncStatusMsg({ text: e.message || 'خطا در ارسال اطلاعات به سوپابیس', isError: true });
    } finally {
      setSyncingCloud(false);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  const handleOpenCameraBarcodeScanner = async () => {
    try {
      if (!window.isSecureContext) {
        throw new Error('برای استفاده از دوربین، برنامه را با HTTPS یا از طریق localhost باز کنید.');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('این مرورگر یا محیط فعلی از دسترسی به دوربین پشتیبانی نمی‌کند.');
      }

      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true });
      permissionStream.getTracks().forEach(track => track.stop());
      setShowCameraBarcodeModal(true);
    } catch (error) {
      const cameraError = error as { name?: string; message?: string };
      const message = cameraError.name === 'NotAllowedError' || cameraError.name === 'PermissionDeniedError'
        ? 'مجوز دوربین رد یا مسدود شده است. از آیکون قفل کنار نشانی سایت، مجوز Camera را روی Allow بگذارید و دسترسی دوربین را در تنظیمات حریم خصوصی ویندوز نیز فعال کنید.'
        : cameraError.message || 'درخواست دسترسی به دوربین ناموفق بود.';
      setSyncStatusMsg({ text: message, isError: true });
      setTimeout(() => setSyncStatusMsg(null), 7000);
    }
  };

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [unit, setUnit] = useState('ساعت');
  const [buyPrice, setBuyPrice] = useState<number>(0);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [type, setType] = useState<'service' | 'good'>('service');

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = (item.name || '').toLowerCase().includes(q);
        const codeMatch = (item.code || '').toLowerCase().includes(q);
        const barcodeMatch = (item.barcode || '').toLowerCase().includes(q);
        const unitMatch = (item.unit || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !barcodeMatch && !unitMatch) return false;
      }

      return true;
    });
  }, [inventory, typeFilter, searchQuery]);

  // Inventory KPI statistics
  const stats = useMemo(() => {
    const totalServices = inventory.filter(i => i.type === 'service').length;
    const totalGoods = inventory.filter(i => i.type === 'good').length;
    const totalGoodsValue = inventory
      .filter(i => i.type === 'good')
      .reduce((sum, item) => sum + (item.stock * item.buyPrice), 0);

    return { totalServices, totalGoods, totalGoodsValue };
  }, [inventory]);

  const openCreateModal = () => {
    setEditingItem(null);
    setName('');
    setCode(`SKU-${Date.now().toString().slice(-4)}`);
    setBarcode('');
    setUnit('ساعت / پروژه');
    setBuyPrice(0);
    setSellPrice(0);
    setStock(0);
    setType('service');
    setShowModal(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setName(item.name);
    setCode(item.code);
    setBarcode(item.barcode || '');
    setUnit(item.unit);
    setBuyPrice(item.buyPrice);
    setSellPrice(item.sellPrice);
    setStock(item.stock);
    setType(item.type);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (editingItem) {
        await updateInventoryItem(editingItem.id, {
          name,
          code,
          barcode: barcode.trim() || undefined,
          unit,
          buyPrice: Number(buyPrice) || 0,
          sellPrice: Number(sellPrice) || 0,
          ...(isOpeningPeriod ? { stock: Number(stock) || 0 } : {}),
          type
        });
      } else {
        await addInventoryItem({
          name,
          code: code || `SKU-${Date.now().toString().slice(-4)}`,
          barcode: barcode.trim() || undefined,
          unit,
          buyPrice: Number(buyPrice) || 0,
          sellPrice: Number(sellPrice) || 0,
          stock: isOpeningPeriod ? Number(stock) || 0 : 0,
          type
        });
      }
      setShowModal(false);
    } catch (error) {
      setSyncStatusMsg({
        text: error instanceof Error ? error.message : String(error),
        isError: true
      });
    }
  };

  return (
    <div className="space-y-6" id="inventory-module">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600" />
              تعرفه خدمات و انبار کالا
            </h2>
            {isSupabaseLive ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200" title="متصل به دیتابیس زنده سوپابیس">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                سوپابیس ابری
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                حافظه محلی
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            مدیریت تعرفه خدمات تخصصی، بهای تمام‌شده و کنترل موجودی انبار هابینو
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="sync-inventory-from-supabase-btn"
            onClick={handleSyncCloud}
            disabled={syncingCloud}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200/80 transition-all cursor-pointer disabled:opacity-50"
            title="دریافت و ادغام آخرین اطلاعات کالاها، قیمت‌ها و موجودی از سوپابیس"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${syncingCloud ? 'animate-spin' : ''}`} />
            <span>{syncingCloud ? 'در حال همگام‌سازی...' : 'همگام‌سازی سوپابیس'}</span>
          </button>
          <button
            id="push-inventory-to-supabase-btn"
            onClick={handlePushCloud}
            disabled={syncingCloud}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            title="ارسال کلیه اقلام انبار به دیتابیس سوپابیس"
          >
            <Cloud className="w-3.5 h-3.5 text-slate-500" />
            <span>ارسال به سوپابیس</span>
          </button>
          {isOpeningPeriod ? (
            <button
              id="open-stock-in-barcode-btn"
              onClick={() => setShowStockInModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-bold shadow-xs shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <PackagePlus className="w-4 h-4 text-emerald-200" />
              <span>ثبت موجودی اول دوره با بارکدخوان</span>
            </button>
          ) : (
            <span className="text-xs text-slate-500 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl">
              ورود کالا پس از دوره اول فقط با فاکتور خرید
            </span>
          )}
          <button
            id="open-barcode-scanner-inventory-btn"
            onClick={() => setShowScannerModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ScanLine className="w-3.5 h-3.5 text-emerald-400" />
            <span>اسکن بارکد</span>
          </button>
          <button
            id="open-create-item-modal-btn"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4 text-slate-600" />
            تعریف کالای جدید
          </button>
        </div>
      </div>

      {/* Sync Notification Banner */}
      {syncStatusMsg && (
        <div className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
          syncStatusMsg.isError
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          <div className="flex items-center gap-2">
            {syncStatusMsg.isError ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{syncStatusMsg.text}</span>
          </div>
          <button
            onClick={() => setSyncStatusMsg(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-blue-600" />
              خدمات تخصصی فعال
            </span>
            <span className="text-[11px] font-mono text-blue-600 font-semibold">
              {toPersianDigits(stats.totalServices)} عنوان
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-blue-900">
            تعرفه‌گذاری و حق‌الزحمه ساعتی / پروژه‌ای
          </div>
        </div>

        <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-amber-600" />
              کالاهای فیزیکی انبار
            </span>
            <span className="text-[11px] font-mono text-amber-600 font-semibold">
              {toPersianDigits(stats.totalGoods)} قلم کالا
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-amber-900">
            {toPersianDigits(inventory.reduce((acc, i) => acc + (i.type === 'good' ? i.stock : 0), 0))} واحد کل موجودی
          </div>
        </div>

        <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              ارزش ریالی موجودی انبار
            </span>
            <span className="text-[11px] font-mono text-emerald-600 font-semibold">
              بهای تمام‌شده
            </span>
          </div>
          <div className="mt-2 text-lg font-bold text-emerald-900">
            {formatCurrency(stats.totalGoodsValue, settings.currency)}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              typeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            همه موارد ({toPersianDigits(inventory.length)})
          </button>
          <button
            onClick={() => setTypeFilter('service')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              typeFilter === 'service'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            خدمات تخصصی ({toPersianDigits(stats.totalServices)})
          </button>
          <button
            onClick={() => setTypeFilter('good')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-colors cursor-pointer ${
              typeFilter === 'good'
                ? 'bg-amber-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            کالای فیزیکی ({toPersianDigits(stats.totalGoods)})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="جستجوی سریع عنوان کالا یا خدمت، کد SKU، یا واحد..."
            aria-label="جستجو در کالاها و خدمات"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-2 p-0.5 text-slate-400 hover:text-slate-600"
              aria-label="پاک‌کردن جستجو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-xs">
        <table className="w-full min-w-[980px] text-right border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
              <th className="p-4">نوع</th>
              <th className="p-4">کد کالا (SKU)</th>
              <th className="p-4">عنوان خدمت / کالا</th>
              <th className="p-4">واحد سنجش</th>
              <th className="p-4">قیمت خرید کالا / هزینه پایه خدمت</th>
              <th className="p-4">قیمت فروش / تعرفه</th>
              <th className="p-4">موجودی / ظرفیت</th>
              <th className="p-4 text-center">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                  موردی با شرایط فیلتر و جستجوی کنونی یافت نشد.
                  {(searchQuery || typeFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setTypeFilter('all');
                      }}
                      className="block mx-auto mt-3 px-3 py-1.5 rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 font-semibold"
                    >
                      پاک‌کردن جستجو و فیلترها
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredInventory.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      item.type === 'service' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {item.type === 'service' ? <Wrench className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                      {item.type === 'service' ? 'خدمت' : 'کالا'}
                    </span>
                  </td>
                  <td className="p-4 font-mono font-medium text-slate-600">{item.code}</td>
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{item.name}</div>
                    {item.barcode && (
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500 font-mono">
                        <ScanLine className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>{item.barcode}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-slate-500 text-xs">{item.unit}</td>
                  <td className="p-4 text-slate-600 font-mono">
                    {item.type === 'service' && !item.buyPrice
                      ? '—'
                      : formatCurrency(item.buyPrice, settings.currency)}
                  </td>
                  <td className="p-4 font-bold text-slate-900 font-mono">{formatCurrency(item.sellPrice, settings.currency)}</td>
                  <td className="p-4 font-mono text-slate-700">
                    {item.type === 'good' ? (
                      <span className={item.stock <= 5 ? 'text-rose-600 font-bold' : ''}>
                        {toPersianDigits(item.stock)} {item.unit}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">نامحدود</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {isOpeningPeriod && item.type === 'good' && (
                        <button
                          onClick={() => {
                            setShowStockInModal(true);
                          }}
                          className="p-1.5 text-emerald-600 hover:text-emerald-800 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                          title="ورود کالا به انبار با بارکدخوان (افزایش موجودی)"
                        >
                          <PackagePlus className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                        title="ویرایش کالا / خدمت"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteError(null);
                          setItemToDelete(item);
                        }}
                        disabled={!isOpeningPeriod && item.type === 'good' && item.stock > 0}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        title={!isOpeningPeriod && item.type === 'good' && item.stock > 0
                          ? 'کالای دارای موجودی پس از پایان اول دوره قابل حذف نیست'
                          : 'حذف کالا / خدمت'}
                        aria-label={`حذف ${item.type === 'good' ? 'کالا' : 'خدمت'} ${item.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Add / Edit Item */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-600" />
                {editingItem ? 'ویرایش کالا یا خدمت' : 'افزودن خدمت یا کالای جدید'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">نوع ماهیت آیتم</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setType('service'); setUnit('ساعت / پروژه'); }}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                      type === 'service' ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    خدمات تخصصی
                  </button>
                  <button
                    type="button"
                    onClick={() => { setType('good'); setUnit('عدد'); }}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                      type === 'good' ? 'bg-amber-50 border-amber-600 text-amber-700 shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    کالای فیزیکی
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">عنوان کامل خدمت یا کالا *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="مثال: خدمات طراحی و مدلسازی BIM یا سرور فیزیکی"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">کد آیتم (SKU)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="کد کالا"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-600 text-xs">بارکد (EAN / ایران‌کد)</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenCameraBarcodeScanner}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5 cursor-pointer"
                        title="اسکن مستقیم بارکد کالا با دوربین"
                      >
                        <Camera className="w-3 h-3" />
                        <span>اسکن دوربین</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const randomIranCode = '626' + Math.floor(100000000 + Math.random() * 900000000).toString();
                          setBarcode(randomIranCode);
                        }}
                        className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium underline cursor-pointer"
                      >
                        تولید ایران‌کد
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      placeholder="مثال: 6260123456789"
                      className="w-full p-2.5 pl-8 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                    />
                    <ScanLine className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">واحد سنجش</label>
                <input
                  type="text"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  placeholder="مثال: ساعت، نفرروز، عدد، متر، کارتن"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    {type === 'service' ? 'هزینه پایه خدمت (اختیاری)' : 'قیمت خرید / بهای تمام‌شده کالا'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={buyPrice || ''}
                    onChange={e => setBuyPrice(Number(e.target.value))}
                    disabled={!isOpeningPeriod && editingItem?.type === 'good' && editingItem.stock > 0}
                    placeholder={type === 'service' ? 'در صورت برون‌سپاری وارد کنید' : '0'}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono disabled:opacity-60"
                  />
                  {type === 'service' && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      برای خدمت داخلی خالی بگذارید؛ برای خدمت برون‌سپاری‌شده فقط هزینه پایه برآوردی را وارد کنید. هزینه قطعی باید با فاکتور خرید ثبت شود.
                    </p>
                  )}
                  {!isOpeningPeriod && editingItem?.type === 'good' && editingItem.stock > 0 && (
                    <p className="mt-1 text-[10px] text-amber-700">بهای موجودی با سند خرید تغییر می‌کند.</p>
                  )}
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">قیمت فروش / تعرفه مصوب</label>
                  <input
                    type="number"
                    value={sellPrice || ''}
                    onChange={e => setSellPrice(Number(e.target.value))}
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {type === 'good' && isOpeningPeriod && (
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">موجودی اول دوره در انبار</label>
                  <input
                    type="number"
                    min="0"
                    value={stock}
                    onChange={e => setStock(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>
              )}
              {type === 'good' && !isOpeningPeriod && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                  موجودی فعلی تغییر نمی‌کند؛ افزایش موجودی فقط با ثبت فاکتور خرید امکان‌پذیر است.
                  {editingItem ? ` موجودی فعلی: ${toPersianDigits(editingItem.stock)} ${editingItem.unit}` : ''}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition-colors"
                >
                  {editingItem ? 'ذخیره تغییرات' : 'افزودن به انبار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {itemToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">حذف از فهرست انبار</h3>
            <p className="mt-2 text-sm text-slate-600">
              آیا از حذف «{itemToDelete.name}» ({itemToDelete.code}) اطمینان دارید؟
            </p>
            {deleteError && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                حذف آیتم انجام نشد: {deleteError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={confirmDeleteItem}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-60"
              >
                {isDeletingItem ? 'در حال حذف...' : 'حذف آیتم'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">اسکنر بارکد و انبارگردانی سریع هابینو</h3>
              </div>
              <button
                id="close-scanner-modal-btn"
                onClick={() => setShowScannerModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <BarcodeScannerStudio
              embeddedMode={true}
              onBarcodeDetected={(code, matched) => {
                if (matched) {
                  setSearchQuery(matched.code);
                }
              }}
              onNavigateToInventory={(prefilledBarcode) => {
                setShowScannerModal(false);
                openCreateModal();
                if (prefilledBarcode) {
                  setBarcode(prefilledBarcode);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Stock In via Barcode Scanner Modal */}
      <StockInBarcodeModal
        isOpen={showStockInModal}
        onClose={() => setShowStockInModal(false)}
      />

      {/* Quick Camera Barcode Scanner for Item Form */}
      <QuickBarcodeScannerModal
        isOpen={showCameraBarcodeModal}
        onClose={() => setShowCameraBarcodeModal(false)}
        onScan={(scannedCode) => {
          setBarcode(scannedCode);
          // if code is SKU empty, also fill with SKU prefix
          if (!code) {
            setCode(`SKU-${scannedCode.slice(-4)}`);
          }
        }}
        title="اسکن بارکد کالا با دوربین"
        description="بارکد چاپ‌شده روی بسته کالا را مقابل دوربین نگه دارید"
      />
    </div>
  );
};
