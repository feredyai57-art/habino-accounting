import React, { useState } from 'react';
import { useAccounting } from '../lib/store';
import {
  Sparkles,
  Users,
  Package,
  CheckCircle2,
  CreditCard,
  Building2,
  ArrowLeft,
  X,
  ShieldCheck,
  BookOpen,
  AlertTriangle
} from 'lucide-react';

interface TenantWorkflowWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToClients?: () => void;
  onNavigateToInventory?: () => void;
  onNavigateToBanks?: () => void;
  onNavigateToInvoices?: () => void;
  onNavigateToLedger?: () => void;
  openingPeriodStatus?: 'in_progress' | 'completed';
  onStartOpeningPeriod: () => Promise<void>;
  onFinishOpeningPeriod: () => Promise<void>;
  tenantName?: string;
  isPostReset?: boolean;
  isSuperAdminContext?: boolean;
}

export const TenantWorkflowWelcomeModal: React.FC<TenantWorkflowWelcomeModalProps> = ({
  isOpen,
  onClose,
  onNavigateToClients,
  onNavigateToInventory,
  onNavigateToBanks,
  onNavigateToInvoices,
  onNavigateToLedger,
  openingPeriodStatus,
  onStartOpeningPeriod,
  onFinishOpeningPeriod,
  tenantName = 'فضای کاری هابینو',
  isPostReset = false,
  isSuperAdminContext = false
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { canAccessModule } = useAccounting();

  if (!isOpen) return null;

  const runOpeningAction = async (
    action: () => Promise<void>,
    navigate?: () => void,
    closeAfterSuccess = false
  ) => {
    setIsSaving(true);
    setActionError(null);
    try {
      await action();
      if (navigate) {
        navigate();
        onClose();
      } else if (closeAfterSuccess) {
        onClose();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const startAndNavigate = (navigate?: () => void, moduleId?: string) => {
    if (navigate) {
      if (moduleId) {
        const access = canAccessModule(moduleId);
        if (!access.allowed) {
          setActionError('دسترسی به بخش «' + moduleId + '» مسدود است. ' + (access.reasonFa || ''));
          return;
        }
      }
      navigate();
      onClose();
      if (openingPeriodStatus !== 'in_progress' && openingPeriodStatus !== 'completed') {
        void onStartOpeningPeriod();
      }
      return;
    }
    const action = openingPeriodStatus === 'in_progress' || openingPeriodStatus === 'completed'
      ? async () => {}
      : onStartOpeningPeriod;
    void runOpeningAction(action, navigate);
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200'>
      <div className='bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden text-right font-sans'>
        {/* هدر گرادیان اختصاصی هابینو */}
        <div className='relative bg-gradient-to-l from-indigo-900/60 via-slate-900 to-emerald-950/40 p-6 border-b border-slate-800'>
          <div className='flex items-center justify-between'>
            {openingPeriodStatus !== undefined && (
              <button
                onClick={onClose}
                className='p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition'
                title='بستن'
              >
                <X className='w-5 h-5' />
              </button>
            )}
            <div className='flex items-center gap-3'>
              <div>
                <h3 className='text-lg font-bold text-white flex items-center gap-2 justify-end'>
                  <span>{isPostReset ? 'آماده‌سازی نقطه صفر کارخانه' : 'خوش‌آمدید به هابینو حسابداری'}</span>
                  <Sparkles className='w-5 h-5 text-amber-400 animate-pulse' />
                </h3>
                <p className='text-xs text-slate-400 mt-0.5'>
                  {tenantName} • راهنمای گردش عملیات مالی و قوانین ۹‌گانه
                </p>
              </div>
              <div className='p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400'>
                <BookOpen className='w-6 h-6' />
              </div>
            </div>
          </div>
        </div>

        {/* محتوای گام‌های ۳ گانه گردش کار هابینو */}
        <div className='p-6 space-y-4 max-h-[70vh] overflow-y-auto'>
          <div className='bg-slate-800/40 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed'>
            {isPostReset ? (
              <p>
                ریست کارخانه انجام شد. بسته به روش انتخاب‌شده، اطلاعات پایهٔ اشخاص یا کالاها ممکن است حفظ شده باشد؛ مانده‌ها و موجودی باقی‌مانده را بررسی کنید و سپس عملیات اول دوره را ببندید:
              </p>
            ) : (
              <p>
                ابتدا مانده‌های ابتدای کار را ثبت و تطبیق کنید. پس از پایان عملیات اول دوره، افزایش موجودی و تغییر مانده‌ها باید از مسیر اسناد مالی انجام شود:
              </p>
            )}
          </div>

          {isSuperAdminContext && (
            <div className='p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2'>
              <AlertTriangle className='w-4 h-4 shrink-0 mt-0.5' />
              <div>
                <p className='font-bold text-amber-100'>محدودیت دسترسی سوپرادمین</p>
                <p className='text-amber-300 mt-0.5'>
                  این بخش فقط برای مدیریت پلتفرم است، دسترسی به داده‌های مالی مستأجر از طریق این پنل ممکن نیست.
                  دکمه‌های هدایت به دفتر کل، فاکتورها، بانک‌ها و چک‌ها در حالت سوپرادمین غیرفعال شده‌اند.
                </p>
              </div>
            </div>
          )}

          <div className='space-y-3'>
            {/* گام ۱: مخاطب اجباری (قانون ۱) */}
            <div className='flex items-start gap-3.5 p-3.5 bg-slate-800/50 hover:bg-slate-800 border border-indigo-500/30 rounded-xl transition'>
              <div className='p-2.5 bg-indigo-500/20 text-indigo-300 rounded-lg shrink-0 mt-0.5'>
                <Users className='w-5 h-5' />
              </div>
              <div className='flex-1'>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] font-bold text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-md'>
                    گام اول • قانون ۱ هابینو
                  </span>
                  <h4 className='text-sm font-bold text-white'>ثبت طرف‌حساب و مخاطب</h4>
                </div>
                <p className='text-xs text-slate-300 mt-1.5 leading-relaxed'>
                  طرف‌حساب‌های مشتری و تأمین‌کننده را همراه با مانده بدهکار یا بستانکار ابتدای دوره ثبت کنید. پس از پایان این عملیات، مانده جدید اشخاص فقط از طریق فاکتور، دریافت، پرداخت یا سند اصلاحی تغییر می‌کند.
                </p>
                <div className='mt-2.5 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs leading-relaxed'>
                  <span className='font-bold text-amber-200'>مانده افتتاحیه:</span> مانده قبلی هر شخص را فقط در همین مرحله وارد کنید؛ گردش‌های بعدی نباید دوباره به‌عنوان افتتاحیه ثبت شوند.
                </div>
                {onNavigateToClients && (
                  <button
                    onClick={() => startAndNavigate(onNavigateToClients, 'clients')}
                    className='mt-2.5 text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1 font-medium transition'
                  >
                    <span>ورود به بخش مخاطبین و ثبت مانده اولیه</span>
                    <ArrowLeft className='w-3.5 h-3.5' />
                  </button>
                )}
              </div>
            </div>

            {/* گام ۲: تعریف کالا و انبار */}
            <div className='flex items-start gap-3.5 p-3.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition'>
              <div className='p-2.5 bg-emerald-500/20 text-emerald-300 rounded-lg shrink-0 mt-0.5'>
                <Package className='w-5 h-5' />
              </div>
              <div className='flex-1'>
                <div className='flex items-center justify-between'>
                  <span className='text-[11px] font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-md'>
                    گام دوم • انبار پایه
                  </span>
                  <h4 className='text-sm font-bold text-white'>تعریف کالاها و خدمات</h4>
                </div>
                <p className='text-xs text-slate-400 mt-1 leading-relaxed'>
                  کالاها و خدمات را تعریف کنید و موجودی واقعی اول دوره را همین حالا ثبت کنید. پس از بستن دوره اول، افزایش موجودی فقط با ثبت فاکتور خرید انجام می‌شود؛ رسید بارکدی جایگزین فاکتور خرید نیست.
                </p>
                {onNavigateToInventory && (
                  <button
                    onClick={() => startAndNavigate(onNavigateToInventory, 'inventory')}
                    className='mt-2 text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1 font-medium transition'
                  >
                    <span>ورود به انبار کالاها</span>
                    <ArrowLeft className='w-3.5 h-3.5' />
                  </button>
                )}
              </div>
            </div>

            {!isSuperAdminContext && (
              <>
                <div className='flex items-start gap-3.5 p-3.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition'>
                  <div className='p-2.5 bg-violet-500/20 text-violet-300 rounded-lg shrink-0 mt-0.5'>
                    <CreditCard className='w-5 h-5' />
                  </div>
                  <div className='flex-1'>
                    <div className='flex items-center justify-between'>
                      <span className='text-[11px] font-bold text-violet-400 px-2 py-0.5 bg-violet-500/10 rounded-md'>
                        مانده نقد و بانک
                      </span>
                      <h4 className='text-sm font-bold text-white'>ثبت حساب‌های بانکی و صندوق</h4>
                    </div>
                    <p className='text-xs text-slate-400 mt-1 leading-relaxed'>
                      موجودی واقعی هر حساب را در تاریخ شروع ثبت کنید. حساب ۳۰۱۰۳ فقط حساب موقت تراز افتتاحیه است و به‌تنهایی آورده واقعی شریک نیست.
                    </p>
                    {onNavigateToBanks && (
                      <button
                        onClick={() => startAndNavigate(onNavigateToBanks, 'banks')}
                        className='mt-2 text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1 font-medium transition'
                      >
                        <span>ثبت مانده بانک‌ها و صندوق</span>
                        <ArrowLeft className='w-3.5 h-3.5' />
                      </button>
                    )}
                  </div>
                </div>

                <div className='flex items-start gap-3.5 p-3.5 bg-slate-800/50 border border-amber-500/30 rounded-xl'>
                  <div className='p-2.5 bg-amber-500/15 text-amber-300 rounded-lg shrink-0 mt-0.5'>
                    <Users className='w-5 h-5' />
                  </div>
                  <div className='flex-1'>
                    <div className='flex items-center justify-between'>
                      <span className='text-[11px] font-bold text-amber-300 px-2 py-0.5 bg-amber-500/10 rounded-md'>
                        گام چهارم • حقوق صاحبان سرمایه
                      </span>
                      <h4 className='text-sm font-bold text-white'>ثبت آورده مستند شرکا</h4>
                    </div>
                    <p className='text-xs text-slate-300 mt-1.5 leading-relaxed'>
                      شریک را در تفصیلی‌های شناور تعریف کنید. آورده نقدی‌ای که قبلاً در صندوق یا بانک ثبت شده، با سند افتتاحیه از ۳۰۱۰۳ به ۳۰۱۰۱ و با تفصیلی همان شریک طبقه‌بندی شود؛ وجه را دوباره به صندوق یا بانک اضافه نکنید. آورده غیرنقدی باید در همان سند با دارایی تحویلی و ارزش مستند آن ثبت شود. سود یا زیان انباشته فقط با مدرک و در حساب ۳۰۲۰۱ ثبت می‌شود.
                    </p>
                    {onNavigateToLedger && (
                      <button
                        onClick={() => startAndNavigate(onNavigateToLedger, 'ledger')}
                        className='mt-2 text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1 font-medium transition'
                      >
                        <span>ورود به تفصیلی شرکا و دفتر روزنامه</span>
                        <ArrowLeft className='w-3.5 h-3.5' />
                      </button>
                    )}
                  </div>
                </div>

                <div className='flex items-start gap-3.5 p-3.5 bg-slate-800/50 border border-cyan-500/30 rounded-xl'>
                  <div className='p-2.5 bg-cyan-500/15 text-cyan-300 rounded-lg shrink-0 mt-0.5'>
                    <Building2 className='w-5 h-5' />
                  </div>
                  <div className='flex-1'>
                    <div className='flex items-center justify-between'>
                      <span className='text-[11px] font-bold text-cyan-300 px-2 py-0.5 bg-cyan-500/10 rounded-md'>
                        گام پنجم • دارایی‌های ثابت
                      </span>
                      <h4 className='text-sm font-bold text-white'>ثبت اموال منقول و غیرمنقول</h4>
                    </div>
                    <p className='text-xs text-slate-300 mt-1.5 leading-relaxed'>
                      برای هر قلم تحت کنترل کسب‌وکار یک سند جدا با شماره DOC-OPN- ثبت کنید: بهای ناخالص در حساب مناسب ۲۰۶۰۱ تا ۲۰۶۰۵ بدهکار و استهلاک انباشته تا تاریخ شروع در ۲۱۱۰۱ بستانکار شود. شرح باید هویت قلم و مبنای مبلغ را مشخص کند؛ زمین و ساختمان جدا هستند و زمین معمولاً مستهلک نمی‌شود. طرف بستانکار با مدرک تعیین شود؛ دارایی آورده‌شده توسط شریک به ۳۰۱۰۱ با تفصیلی شریک، بدهی خرید به ۲۰۱۰۱ با طرف‌حساب، و مانده موقت فقط به ۳۰۱۰۳ ثبت می‌شود. حساب ۳۰۱۰۳ باید پیش از بستن تعیین تکلیف و صفر شود.
                    </p>
                    {onNavigateToLedger && (
                      <button
                        onClick={() => startAndNavigate(onNavigateToLedger, 'ledger')}
                        className='mt-2 text-xs text-cyan-300 hover:text-cyan-200 flex items-center gap-1 font-medium transition'
                      >
                        <span>ثبت سند افتتاحیه دارایی ثابت</span>
                        <ArrowLeft className='w-3.5 h-3.5' />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {isSuperAdminContext && (
              <div className='flex items-start gap-3.5 p-3.5 bg-slate-800/50 border border-slate-700/40 rounded-xl opacity-50'>
                <div className='p-2.5 bg-slate-500/20 text-slate-400 rounded-lg shrink-0 mt-0.5'>
                  <Building2 className='w-5 h-5' />
                </div>
                <div className='flex-1'>
                  <div className='flex items-center justify-between'>
                    <span className='text-[11px] font-bold text-slate-400 px-2 py-0.5 bg-slate-500/10 rounded-md'>
                      نما • دارایی‌های ثابت (فقط‌خواندنی)
                    </span>
                    <h4 className='text-sm font-bold text-slate-300'>ثبت اموال منقول و غیرمنقول</h4>
                  </div>
                  <p className='text-xs text-slate-500 mt-1.5 leading-relaxed'>
                    این بخش در حالت سوپeradمین فقط برای مطالعه راهنما قابل مشاهده است. ثبت سند افتتاحیه دارایی ثابت و مدیریت تفصیلی شرکا از طریق داشبورد مستأجر انجام می‌شود.
                  </p>
                </div>
              </div>
            )}

          </div>

          {actionError && (
            <div role='alert' className='p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-200'>
              {actionError}
            </div>
          )}

          {/* نوار تضمین توازن */}
          <div className='flex items-center justify-between p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs'>
            <span className='text-slate-400 text-[11px]'>موتور تراز دوبل فعال</span>
            <div className='flex items-center gap-1.5 font-medium'>
              <ShieldCheck className='w-4 h-4 text-emerald-400' />
              <span>پایگاه داده ابری و صف آفلاین در وضعیت همگام قرار دارند</span>
            </div>
          </div>
        </div>

        {/* دکمه‌های اقدام نهایی */}
        <div className='p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3'>
          <button
            onClick={() => {
              onClose();
            }}
            disabled={openingPeriodStatus === undefined || isSaving}
            className='text-xs text-slate-400 hover:text-slate-200 transition'
          >
            {openingPeriodStatus === 'completed' ? 'بستن راهنما' : 'ادامه بعداً'}
          </button>
          <div className='flex items-center gap-2'>
            {openingPeriodStatus === undefined && (
              <button
                onClick={() => startAndNavigate()}
                disabled={isSaving}
                className='px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20'
              >
                <span>{isSaving ? 'در حال شروع...' : 'شروع عملیات اول دوره'}</span>
                <ArrowLeft className='w-4 h-4' />
              </button>
            )}
            {openingPeriodStatus === 'in_progress' && (
              <button
                onClick={() => void runOpeningAction(onFinishOpeningPeriod, undefined, true)}
                disabled={isSaving}
                className='px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5'
              >
                <span>{isSaving ? 'در حال تطبیق و ثبت...' : 'پایان عملیات اول دوره'}</span>
                <CheckCircle2 className='w-4 h-4' />
              </button>
            )}
            {openingPeriodStatus === 'completed' && (
              <button
                onClick={onClose}
                className='px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition'
              >
                ورود به داشبورد
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantWorkflowWelcomeModal;