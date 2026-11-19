export type MilestoneStatus = 'completed' | 'in_progress' | 'planned' | 'under_review';
export type MilestonePriority = 'P0' | 'P1' | 'P2';
export type MilestoneCategory = 
  | 'architecture' 
  | 'multitenancy' 
  | 'ai_siraflow' 
  | 'smart_contracts' 
  | 'decentralized_id' 
  | 'accounting_ledger' 
  | 'open_api' 
  | 'pwa_devops'
  | 'bazaar_market';

export interface ArchitectureDecisionRecord {
  id: string;
  code: string;
  title: string;
  status: 'accepted' | 'implemented' | 'under_evaluation';
  context: string;
  decision: string;
  consequences: string;
  technicalOwner: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  phaseId: string;
  phaseTitle: string;
  day: number;
  targetQuarter: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  category: MilestoneCategory;
  priority: MilestonePriority;
  complexity: 'low' | 'medium' | 'high' | 'epic';
  riskLevel: 'low' | 'medium' | 'high';
  kpiMetric: string;
  technicalRationale: string;
  adrRef?: string;
  techStack: string[];
  dependencies: string[];
  assigneeRole: string;
  progressPercent: number;
}

export interface RoadmapPhase {
  id: string;
  number: number;
  title: string;
  tagline: string;
  status: 'completed' | 'active' | 'future';
  targetTimeline: string;
  badge: string;
}

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: 'phase-1',
    number: 1,
    title: 'فاز ۱: هسته سیستم‌عامل، حسابداری دوبل و چندمستأجری',
    tagline: 'تثبیت دیتامدل، دفاتر دوبل مالی، چک صیادی، لایسنس و ایزولاسیون مستأجران',
    status: 'completed',
    targetTimeline: 'تحویل داده شده (Q2 1403)',
    badge: 'تکمیل ۱۰۰٪'
  },
  {
    id: 'phase-2',
    number: 2,
    title: 'فاز ۲: ارکستراسیون سایرافلو، مناقصه کور و قرارداد دیجیتال',
    tagline: 'موتور تحلیل RFP، ممیزی ضد دامپینگ، کاتالوگ اصناف آزاد و صدور قرارداد هوشمند',
    status: 'completed',
    targetTimeline: 'تحویل داده شده (Q3 1403)',
    badge: 'آماده سرمایه‌گذاری'
  },
  {
    id: 'phase-3',
    number: 3,
    title: 'فاز ۳: پروتکل هویت غیرمتمرکز (W3C DID) و امضای رمزنگاری',
    tagline: 'شناسه هویت سازمانی هابینو، مدارک قابل راستی‌آزمایی (VC) و امضای زنجیره‌ای قراردادها',
    status: 'completed',
    targetTimeline: 'تحویل داده شده (Q4 1403)',
    badge: 'تکمیل ۱۰۰٪'
  },
  {
    id: 'phase-4',
    number: 4,
    title: 'فاز ۴: وب‌سرویس‌های تجاری باز (Open Commerce API)، وب‌هوک‌ها و اکوسیستم افزونه‌ها',
    tagline: 'پایگاه ماژول‌های مستأجران، اتصال به فروشگاه‌های آنلاین (ووکامرس)، وب‌هوک‌های HMAC و ارکستراسیون انبار',
    status: 'completed',
    targetTimeline: 'تحویل داده شده و عملیاتی (Q1 1404)',
    badge: 'تکمیل ۱۰۰٪ (Active)'
  },
  {
    id: 'phase-bazaar',
    number: 5,
    title: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار (Bazaar Launch Fast-Track)',
    tagline: 'پرداخت درون‌برنامه‌ای بازار (IAP)، کانتینر TWA، سامانه مودیان، فیش‌پرینتر حرارتی اصناف و آنبوردینگ موبایل',
    status: 'active',
    targetTimeline: 'آماده‌سازی فوری بازار (Q3 1403)',
    badge: 'مأموریت عرضه بازار (P0)'
  },
  {
    id: 'phase-mena-foundation',
    number: 6,
    title: 'فاز ۶: زیرساخت چندکشوری خاورمیانه (MENA Localization: فارسی، عربی و انگلیسی) و پشتیبانی ریموت دولایه',
    tagline: 'جداسازی Locale از ارز پایه، پشتیبانی اعشار ۰/۲/۳ رقمی، تقویم شمسی/میلادی/هجری، RTL/LTR، بسته انطباق کشوری و پشتیبانی بدون مراجعه حضوری',
    status: 'planned' as unknown as 'future',
    targetTimeline: 'اولویت بازار منطقه‌ای (Q2 1404)',
    badge: 'بازار خاورمیانه (MENA)'
  } as RoadmapPhase,
  {
    id: 'phase-windows-local',
    number: 7,
    title: 'فاز ۷: نسخه دسکتاپ محلی ویندوز با دیتابیس SQLite (استقرار کاملاً آفلاین و بومی)',
    tagline: 'بسته نصبی ویندوز (Electron/Tauri + SQLite) بدون نیاز به سرور ابری، همگام با هسته حسابداری واحد',
    status: 'future',
    targetTimeline: 'چشم‌انداز (Q3 1404)',
    badge: 'نسخه محلی ویندوز'
  },
  {
    id: 'phase-hybrid-lan',
    number: 8,
    title: 'فاز ۸: سرور شبکه داخلی هیبرید (Hybrid LAN) و همگام‌سازی اختیاری ابری',
    tagline: 'استقرار سرور Node.js روی سیستم کارفرما در شبکه محلی (۲ تا ۱۰ کاربر) با همگام‌سازی زمان‌بندی‌شده به ابر در صورت داشتن اینترنت',
    status: 'future',
    targetTimeline: 'چشم‌انداز (Q4 1404)',
    badge: 'استقرار هیبرید شبکه'
  },
  {
    id: 'phase-5',
    number: 9,
    title: 'فاز ۹: شبکه تسویه همتابه‌همتا (P2P State Sync) و خردپرداخت‌ها',
    tagline: 'همگام‌سازی توزیع‌شده اسناد مالی میان مستأجران بدون نیاز به سرور مرکزی در تبادلات بین‌اصناف',
    status: 'future',
    targetTimeline: 'چشم‌انداز (Q1 1405)',
    badge: 'تحقیقات معماری'
  }
];

export const INITIAL_ADRS: ArchitectureDecisionRecord[] = [
  {
    id: 'adr-001',
    code: 'ADR-001',
    title: 'جداسازی داده‌های چندمستأجری با RLS و شاخص‌های GIN در JSONB',
    status: 'implemented',
    context: 'اصناف مختلف نیازمند فرم‌های پویای منعطف هستند اما پایگاه داده باید تفکیک و امنیت کامل چندمستأجری را بدون افت کارایی تضمین کند.',
    decision: 'استفاده از ستون dynamic_form_data از نوع JSONB با GIN Index و اعمال RLS سخت‌گیرانه با کلید tenant_id.',
    consequences: 'امکان ثبت هر نوع صنف بدون تغییر اسکیمای SQL فراهم شد. پرفورمنس کوئری‌های فیلتر زیر ۱۲ میلی‌ثانیه حفظ شد.',
    technicalOwner: 'معمار ارشد سیستم‌عامل هابینو',
    updatedAt: '1403/06/10'
  },
  {
    id: 'adr-002',
    code: 'ADR-002',
    title: 'ممیزی ضد دامپینگ و رمزنگاری هویت در مناقصه کور سایرافلو',
    status: 'implemented',
    context: 'در پلتفرم‌های واسطه‌ای خطر دامپینگ قیمت و تبانی مستأجران وجود دارد که به کیفیت پروژه‌ها آسیب می‌زند.',
    decision: 'محاسبه ریاضی کف قیمت مجاز (Floor Budget) و تخصیص کد ناشناس رمزنگاری‌شده (Anonymous Code) به پیشنهادها تا لحظه عقد قرارداد.',
    consequences: 'شکست قیمت‌ها غیرمجاز شناخته شده و پیشنهادهای غیرواقعی با ضریب جریمه رد می‌شوند؛ عدالت رقابتی به ۱۰۰٪ رسید.',
    technicalOwner: 'تیم ارکستراسیون سایرافلو',
    updatedAt: '1403/06/14'
  },
  {
    id: 'adr-003',
    code: 'ADR-003',
    title: 'معماری محلی-اول (Local-First) با بک‌آپ‌های آفلاین و پشتیبانی کلید مستر',
    status: 'implemented',
    context: 'قطعی اینترنت نباید باعث توقف امور مالی فروشگاه‌ها، چاپ فاکتور و کنترل انبار شود.',
    decision: 'ذخیره‌سازی لوکال بر روی IndexedDB / LocalStorage همراه با فشرده‌سازی بک‌آپ و همگام‌سازی واکنشی با سرور.',
    consequences: 'سامانه در حالت قطعی اینترنت ۱۰۰٪ قابل بهره‌برداری است و هیچ سندی مفقود نخواهد شد.',
    technicalOwner: 'مهندس ارشد زیرساخت',
    updatedAt: '1403/05/20'
  },
  {
    id: 'adr-004',
    code: 'ADR-004',
    title: 'پیاده‌سازی پروتکل هویت دیجیتال غیرمتمرکز (W3C DID) برای مستأجران',
    status: 'implemented',
    context: 'پلتفرم نیازمند سازوکاری است که هویت و سابقه کیفی تأمین‌کنندگان در میان اصناف بدون وابستگی به یک دیتابیس انحصاری قابل اثبات باشد.',
    decision: 'تولید زوج‌کلید Ed25519 محلی و صدور W3C Verifiable Credential برای هر مستأجر و امضای اسناد قرارداد.',
    consequences: 'امکان مهاجرت یا تأیید برون‌پلتفرمی صلاحیت تأمین‌کنندگان تضمین می‌شود و ارزش محصول در جلسات سرمایه‌گذاری ارتقا می‌یابد.',
    technicalOwner: 'متخصص امنیت و کریپتوگرافی',
    updatedAt: '1403/06/15'
  },
  {
    id: 'adr-005',
    code: 'ADR-005',
    title: 'معماری وب‌سرویس باز (Open Commerce API)، وب‌هوک‌های HMAC-SHA256 و اکوسیستم افزونه‌ها',
    status: 'implemented',
    context: 'فروشگاه‌های آنلاین، نرم‌افزارهای پوز و برنامه‌نویسان مستقل نیازمند اتصال دوطرفه به انبار و صدور خودکار فاکتور هستند، با تضمین عدم نشت اطلاعات مستأجران و کنترل سقف نرخ فراخوانی.',
    decision: 'ارائه کلیدهای API چندمستأجری با محیط‌های Live/Test و Scopes ریزدانه، گیت‌وی امضای دیجیتال وب‌هوک‌ها با هدر X-Habino-Signature بر پایه HMAC-SHA256، پل‌های ارتباطی و ساندباکس افزونه‌های اصناف.',
    consequences: 'همگام‌سازی بلادرنگ موجودی کالا بین فروشگاه مجازی و انبار فیزیکی، صفر شدن مغایرت انبار، و گشایش مارکت‌پلیس توسعه‌دهندگان اصناف.',
    technicalOwner: 'معمار ارشد API و اکوسیستم تجاری هابینو',
    updatedAt: '1403/06/18'
  },
  {
    id: 'adr-006',
    code: 'ADR-006',
    title: 'معماری آمادگی انتشار فوری در کافه‌بازار (Bazaar TWA, IAP, Taxpayer & Thermal Printing)',
    status: 'implemented',
    context: 'جهت عرضه حداکثر سرعتی در کافه‌بازار و جذب اصناف بازار، نرم‌افزار باید الزامات فنی بازار (پرداخت درون‌برنامه‌ای، لاگین پیامکی OTP، TWA نیتیو) و ابزارهای پرکاربرد بازاری (سامانه مودیان و فیش‌پرینتر حرارتی) را به صورت استاندارد ارائه دهد.',
    decision: 'یکپارچه‌سازی درگاه پرداخت درون‌برنامه‌ای کافه‌بازار، کانتینر TWA با وب‌ویو نیتیو، پروتکل پیامکی ورود با سرشماره خدماتی، درایور پرینتر حرارتی ESC/POS با وب‌بلوتوث و ماژول تولید شناسه ۲۲ رقمی سامانه مودیان.',
    consequences: 'تسهیل ورود بیش از ۱۰۰،۰۰۰ کسبه و اصناف از طریق کافه‌بازار، کاهش زمان نصب تا صدور فاکتور به زیر ۳ دقیقه و تضمین پذیرش بدون اشکال فنی در مارکت بازار.',
    technicalOwner: 'معمار ارشد سیستم‌عامل هابینو و لید تجاری‌سازی بازار',
    updatedAt: '1403/06/20'
  },
  {
    id: 'adr-007',
    code: 'ADR-007',
    title: 'معماری سیستم‌عامل کسب‌وکار همه‌کاره (آچارفرانسه تمامی اصناف) و تغییر پارادایم هوش مصنوعی‌محور',
    status: 'implemented',
    context: 'هابینو نباید محدود به یک صنف خاص (مانند صرفاً خدمات) باقی بماند. کارآفرینان در اصناف خدماتی، فروشگاهی، تولیدی/کارگاهی و شرکتی زیر بار سنگین حسابداری پیچیده، استخدام پرهزینه نیروهای دفتری و عدم انطباق سامانه‌های مالیاتی قرار دارند.',
    decision: 'تبدیل هابینو به سیستم‌عامل کسب‌وکار همه‌کاره (All-in-One AI Business OS) و آچارفرانسه مشاغل با ۴ بازوی تخصصی: ۱) خدماتی/پروژه‌ای (بهای نفر-ساعت و بیعانه)، ۲) فروشگاهی (بارکد دوربین، فیش‌پرینتر، نقطه سفارش)، ۳) کارگاهی/تولیدی (فرمول ساخت BOM و بهای تمام‌شده)، ۴) شرکتی (سامانه مودیان و دفاتر دوبل)، با ادعای محوری برداشتن بار فرسایشی از روی شانه‌های کارآفرینان برای خلق حداکثر بهره‌وری با کمترین نیرو و هزینه.',
    consequences: 'کاهش ۹۰٪ خطاهای انسانی، بی‌نیازی از استخدام لشکری از حسابداران سنتی، خودکارسازی فرآیندهای مالی با ایجنت‌های هوشمند، و مقیاس‌پذیری نرم‌افزار برای هر نوع صنف در ایران و خاورمیانه.',
    technicalOwner: 'معمار ارشد سیستم‌عامل هابینو و مهندس فرید تهرانی',
    updatedAt: '1403/06/22'
  },
  {
    id: 'adr-008',
    code: 'ADR-008',
    title: 'معماری مقیاس‌پذیری کلان هابینو و تکامل فراتر از حسابداری: ارکستراسیون سایرافلو و تاب‌آوری ۱۰۰ هزار مستأجر',
    status: 'implemented',
    context: 'هابینو از ابتدا در قالب نسخه ماکت و دمو با ماموریت روشن یک سیستم‌عامل کسب‌وکار همه‌کاره (Habino OS) متولد شد. هسته حسابداری تنها یکی از لایه‌های ثبتی است و ماموریت هابینو فراتر از حسابداری، پوشش چرخه حیات بیزنس (مناقصات سایرافلو، قراردادهای هوشمند، هویت DID، حقوق و دستمزد، انبارداری و بازرگانی) با قابلیت میزبانی بیش از ۱۰۰ هزار مستأجر تجاری است.',
    decision: 'استقرار معماری مقیاس‌پذیری در ۴ لایه: ۱) گذرگاه رویدادها (Event-Bus) سایرافلو به عنوان سیستم عصبی مرکزی با تفکیک وظایف، ۲) شاردینگ منطقی و ایندکس‌های کامپوزیت (tenant_id, created_at) برای پرس‌وجوهای پرسرعت لجر، ۳) کش چندلایه‌ای آفلاین-فرست (PWA IndexedDB + Server Read-Replicas)، ۴) طراحی Stateless ماژول‌های هوش مصنوعی و اجرای توزیع‌شده با کانتینرهای Auto-scaling.',
    consequences: 'تضمین پاسخ‌دهی زیر ۱۰۰ میلی‌ثانیه تحت بار سنگین، ایزولاسیون کامل بار پردازشی ماژول‌ها، عدم مسدود شدن لجر توسط سرویس‌های هوش مصنوعی، و پایداری تضمین‌شده از دمو تا مقیاس کلان ملی.',
    technicalOwner: 'معمار ارشد سیستم‌عامل هابینو و تیم ارکستراسیون سایرافلو',
    updatedAt: '1403/06/25'
  },
  {
    id: 'adr-009',
    code: 'ADR-009',
    title: 'معماری ۳ حالت استقرار (Cloud / Local SQLite / Hybrid LAN) روی هسته محاسباتی واحد',
    status: 'accepted',
    context: 'بازارهای خاورمیانه (ایران، عراق، افغانستان، امارات، عربستان) به دلیل محدودیت‌های اینترنت، حساسیت امنیتی داده یا تعداد کاربر شعبه، همزمان نیازمند نسخه ابری، نسخه محلی ویندوز و سرور شبکه داخلی هستند.',
    decision: 'انتزاع لایه ذخیره‌سازی پشت یک StorageAdapter مشترک به طوری که ۱۰۰٪ هسته حسابداری دوبل، مودیان و UI در سه حالت Cloud (Supabase)، Local Windows (SQLite) و Hybrid LAN (سرور محلی + همگام‌سازی اختیاری ابری) یکسان عمل کند.',
    consequences: 'کاهش هزینه نگهداری به یک کدبیس واحد، حذف اجبار سرور ابری برای مشتریان آفلاین و امکان ارتقای تدریجی از محلی به هیبرید بدون مهاجرت پیچیده.',
    technicalOwner: 'معمار ارشد هابینو و مهندس فرید تهرانی',
    updatedAt: '1405/08/28'
  },
  {
    id: 'adr-010',
    code: 'ADR-010',
    title: 'استاندارد چندکشوری خاورمیانه (MENA): تفکیک Locale از ارز، دقت ۰/۲/۳ اعشار و بسته انطباق کشوری',
    status: 'accepted',
    context: 'توسعه در بازارهای فارسی‌زبان (ایران، افغانستان)، عربی (عراق، امارات، عربستان، عمان/کویت/بحرین) و انگلیسی نیازمند پشتیبانی دقیق از ارزهای بدون اعشار (IRR/IQD)، دو اعشاری (AED/SAR/USD) و سه اعشاری (KWD/BHD/OMR) و مالیات‌های مختلف است.',
    decision: 'جداسازی کامل زبان/تقویم/جهت (Logical CSS برای RTL و LTR) از واحد پولی پایه مستأجر، نگهداری مبالغ با دقت اعشاری استاندارد در دیتابیس و کپسوله‌سازی قوانین مالیاتی و فاکتور الکترونیک هر کشور در Country Compliance Pack.',
    consequences: 'ورود بدون بازنویسی هسته به کشورهای همسایه، عدم بروز خطای گردکردن دیناری/فلسی در کشورهای عربی و پشتیبانی بومی از زبان فارسی، عربی و انگلیسی.',
    technicalOwner: 'معمار ارشد سیستم‌های مالی هابینو',
    updatedAt: '1405/08/28'
  },
  {
    id: 'adr-011',
    code: 'ADR-011',
    title: 'استاندارد پشتیبانی بدون مراجعه حضوری (Zero On-Site / 2-Layer Remote Support)',
    status: 'accepted',
    context: 'ارسال نیروی پشتیبان حضوری در مقیاس کشوری و منطقه‌ای (MENA) هزینه عملیاتی را به شدت افزایش می‌دهد و مقیاس‌پذیری را می‌شکند.',
    decision: 'طراحی سیستم برای پشتیبانی ۱۰۰٪ ریموت در دو لایه: ۱) لایه اول درون‌برنامه‌ای (بسته تشخیصی امن بدون داده مالی خام، بررسی وضعیت Outbox/RLS و ارسال مستقیم از مرکز پشتیبانی با رضایت کاربر)، ۲) لایه دوم دسترسی ریموت دسکتاپ صرفاً در موارد ضروری با تایید صریح کارفرما.',
    consequences: 'کاهش نزدیک به صفر نیاز به اعزام حضوری، کاهش زمان رفع خطا به چند دقیقه و حفظ حریم خصوصی داده‌های مالی مشتری.',
    technicalOwner: 'تیم زیرساخت و پشتیبانی هابینو',
    updatedAt: '1405/08/28'
  }
];

export const INITIAL_ROADMAP_MILESTONES: Milestone[] = [
  // Phase 1: Foundation
  {
    id: 'm-101',
    phaseId: 'phase-1',
    phaseTitle: 'فاز ۱: هسته و چندمستأجری',
    day: 1,
    targetQuarter: '1403-Q2',
    title: 'طراحی زیرساخت چندمستأجری و ایزولاسیون داده‌ها',
    description: 'تثبیت tenant_id در تمامی جداول و سرویس‌های آفلاین و آنلاین به همراه سیاست‌های تفکیک دسترسی RLS.',
    status: 'completed',
    category: 'multitenancy',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'high',
    kpiMetric: 'نفوذناپذیری داده بین مستأجران (Zero-leakage)',
    technicalRationale: 'تضمین ایزولاسیون کامل رکوردها پیش از ورود اولین مشتری واقعی تجاری.',
    adrRef: 'ADR-001',
    techStack: ['Supabase', 'PostgreSQL RLS', 'TypeScript'],
    dependencies: [],
    assigneeRole: 'معمار پایگاه داده',
    progressPercent: 100
  },
  {
    id: 'm-102',
    phaseId: 'phase-1',
    phaseTitle: 'فاز ۱: هسته و چندمستأجری',
    day: 5,
    targetQuarter: '1403-Q2',
    title: 'هسته دوبل دفاتر کل، روزنامه و تفصیلی',
    description: 'ثبت متقارن اسناد بدهکار/بستانکار، ممیزی جلوگیری از مغایرت و محاسبه تراز آزمایشی چهارستونی لحظه‌ای.',
    status: 'completed',
    category: 'accounting_ledger',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'medium',
    kpiMetric: 'تراز ۱۰۰٪ ریاضی و صفر بودن خطای موازنه بدهکار/بستانکار',
    technicalRationale: 'رعایت استاندارد حسابداری مصوب سازمان حسابرسی جهت ارائه به ممیزان مالیاتی.',
    adrRef: 'ADR-003',
    techStack: ['Double-Entry Engine', 'BigNumber.js', 'Finance Models'],
    dependencies: ['m-101'],
    assigneeRole: 'تحلیل‌گر ارشد حسابداری و کدنویس الگوریتم',
    progressPercent: 100
  },
  {
    id: 'm-103',
    phaseId: 'phase-1',
    phaseTitle: 'فاز ۱: هسته و چندمستأجری',
    day: 10,
    targetQuarter: '1403-Q2',
    title: 'مدیریت چک‌های صیادی و اقساط زنجیره‌ای',
    description: 'ثبت زنجیره‌ای وصول چک، راس‌گیری زمانی، هشدار سررسید و تغییر وضعیت خودکار اقساط در لحظه پاس شدن.',
    status: 'completed',
    category: 'accounting_ledger',
    priority: 'P1',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'راس‌گیری دقیق روزشمار و همگام‌سازی دفتر اسناد دریافتنی/پرداختنی',
    technicalRationale: 'پوشش نیاز ضروری بازارهای سنتی ایران به چک‌های صیادی بنفش.',
    techStack: ['Jalali Date Engine', 'Sayad Check Parser'],
    dependencies: ['m-102'],
    assigneeRole: 'مهندس فرانت‌اند و بیزینس‌لاجیک',
    progressPercent: 100
  },
  {
    id: 'm-104',
    phaseId: 'phase-1',
    phaseTitle: 'فاز ۱: هسته و چندمستأجری',
    day: 15,
    targetQuarter: '1403-Q2',
    title: 'سیستم لایسنس مستقل، بک‌آپ رمزنگاری و PWA آفلاین',
    description: 'صدور سریال‌های فعال‌سازی، هش گارانتی، خروجی JSON فشرده و سرویس‌ورکر جهت کارکرد ۱۰۰٪ مستقل از اینترنت.',
    status: 'completed',
    category: 'pwa_devops',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'عملکرد آفلاین ۱۰۰٪ و بازیابی بدون خطا در کمتر از ۲ ثانیه',
    technicalRationale: 'حفظ استقلال کسب‌وکارها در شرایط اختلال اینترنت بین‌الملل.',
    adrRef: 'ADR-003',
    techStack: ['Service Worker', 'Cache Storage API', 'AES-GCM'],
    dependencies: ['m-101'],
    assigneeRole: 'مهندس DevOps و امنیت',
    progressPercent: 100
  },
  {
    id: 'm-105',
    phaseId: 'phase-1',
    phaseTitle: 'فاز ۱: هسته و چندمستأجری',
    day: 18,
    targetQuarter: '1403-Q2',
    title: 'موتور آچارفرانسه ۴ صنف: بهای تمام‌شده تولید، نقطه سفارش فروشگاه و خدمات',
    description: 'معماری همه‌کاره برای ۴ ستون کسب‌وکار: فرمول ساخت و بهای تمام‌شده (BOM) برای اصناف تولیدی، نقطه سفارش و انبارداری چندواحدی برای فروشگاه‌ها، تسویه مرحله‌ای و بیعانه برای خدمات، و کارپوشه دفاتر دوبل برای شرکت‌ها.',
    status: 'completed',
    category: 'accounting_ledger',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'medium',
    kpiMetric: 'پوشش ۱۰۰٪ نیازهای اصناف تولیدی، فروشگاهی، خدماتی و شرکتی با حداقل هزینه و نیرو',
    technicalRationale: 'تغییر پارادایم به سیستم‌عامل جامع هوش مصنوعی‌محور و برداشتن بار فرسایشی از روی دوش کارآفرینان.',
    adrRef: 'ADR-007',
    techStack: ['Bill of Materials Engine', 'Reorder-Point Alerting', 'Cost Accounting Module'],
    dependencies: ['m-102'],
    assigneeRole: 'معمار ارشد سیستم‌های مالی و صنعتی',
    progressPercent: 100
  },
  {
    id: 'm-106',
    phaseId: 'phase-1',
    phaseTitle: 'فاز ۱: هسته و چندمستأجری',
    day: 19,
    targetQuarter: '1403-Q2',
    title: 'معماری مقیاس‌پذیری کلان، ایونت‌باس سایرافلو و شاردینگ ۱۰۰ هزار مستأجر',
    description: 'استقرار گذرگاه غیرمسدودکننده رویدادها (Event-Bus) میان ماژول‌ها، شاخص‌های کامپوزیت پُستگرس بر مبنای tenant_id، کش چندلایه‌ای آفلاین-فرست و ایزولاسیون پردازش‌های سنگین هوش مصنوعی از هسته دیتابیس.',
    status: 'completed',
    category: 'multitenancy',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'high',
    kpiMetric: 'پایداری سیستم تحت بار ۱۰۰،۰۰۰ مستأجر با زمان پاسخگویی زیر ۱۰۰ میلی‌ثانیه',
    technicalRationale: 'تثبیت ماموریت سیستم‌عامل جامع هابینو فراتر از حسابداری سنتی و تضمین مقیاس‌پذیری زیرساخت.',
    adrRef: 'ADR-008',
    techStack: ['Event-Driven Bus', 'PostgreSQL Composite Indexes', 'Tier-2 IndexedDB Cache', 'Auto-scaling Microservices'],
    dependencies: ['m-101', 'm-105'],
    assigneeRole: 'معمار ارشد زیرساخت و لید سایرافلو',
    progressPercent: 100
  },

  // Phase 2: SiraFlow & Smart Contracts
  {
    id: 'm-201',
    phaseId: 'phase-2',
    phaseTitle: 'فاز ۲: ارکستراسیون سایرافلو و مناقصات',
    day: 20,
    targetQuarter: '1403-Q3',
    title: 'موتور استخراج فیلدهای حیاتی RFP و طبقه‌بندی هوشمند',
    description: 'شناسایی برندها، مدل‌ها، مکان فیزیکی، تشخیص الزام بازدید حضوری و طبقه‌بندی پروژه‌ها از کوچک تا سازمانی.',
    status: 'completed',
    category: 'ai_siraflow',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'دقت استخراج بالای ۹۵٪ فیلدهای حیاتی بدون دخالت انسان',
    technicalRationale: 'کاهش زمان پردازش سفارش‌ها و جلوگیری از خطای انسانی در تشخیص نیازمندی‌های مهندسی.',
    adrRef: 'ADR-001',
    techStack: ['SiraFlow Orchestrator', 'Regex Matrix', 'NLP Heuristics'],
    dependencies: ['m-101'],
    assigneeRole: 'توسعه‌دهنده هوش مصنوعی و ارکستراسیون',
    progressPercent: 100
  },
  {
    id: 'm-202',
    phaseId: 'phase-2',
    phaseTitle: 'فاز ۲: ارکستراسیون سایرافلو و مناقصات',
    day: 23,
    targetQuarter: '1403-Q3',
    title: 'پشتیبانی از کاتالوگ باز تمامی اصناف و تایپ آزاد صنف',
    description: 'طراحی ساختار صنف‌نامه‌های جامع کشور (بیش از ۶۰ صنف) با امکان تایپ کاملاً آزاد و ارکستراسیون فیلدهای پویا.',
    status: 'completed',
    category: 'multitenancy',
    priority: 'P0',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'عدم وجود هرگونه سقف صنف و پوشش ۱۰۰٪ مشاغل صنعتی، ساختمانی، خدماتی و بازرگانی',
    technicalRationale: 'پاسخ به اصل سیستم‌عامل جامع تجارت: هیچ صنف یا کسب‌وکاری نباید از پلتفرم پس‌زده شود.',
    techStack: ['Dynamic JSONB', 'Catalog Engine'],
    dependencies: ['m-201'],
    assigneeRole: 'مهندس محصول',
    progressPercent: 100
  },
  {
    id: 'm-203',
    phaseId: 'phase-2',
    phaseTitle: 'فاز ۲: ارکستراسیون سایرافلو و مناقصات',
    day: 26,
    targetQuarter: '1403-Q3',
    title: 'مناقصه کور (Blind Tender) و موتور ممیزی ضد دامپینگ',
    description: 'پنهان‌سازی هویت مستأجران، ممیزی قیمت‌های نامتعارف، اعلام اخطار دامپینگ و موازنه ریاضی قیمت و کیفیت (۳۰-۷۰).',
    status: 'completed',
    category: 'smart_contracts',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'high',
    kpiMetric: 'عدم افشای هویت پیش از تصمیم نهایی و مهار کامل دامپینگ مخرب',
    technicalRationale: 'ایجاد اعتماد کامل برای کارفرما و جلوگیری از ورشکستگی تأمین‌کنندگان در قیمت‌های زیان‌ده.',
    adrRef: 'ADR-002',
    techStack: ['Anonymization Hasher', 'Dumping Ratio Evaluator'],
    dependencies: ['m-201', 'm-202'],
    assigneeRole: 'طراح الگوریتم مناقصات',
    progressPercent: 100
  },
  {
    id: 'm-204',
    phaseId: 'phase-2',
    phaseTitle: 'فاز ۲: ارکستراسیون سایرافلو و مناقصات',
    day: 30,
    targetQuarter: '1403-Q3',
    title: 'صدور قراردادهای هوشمند دیجیتال با حساب امانی (Escrow)',
    description: 'تولید پیش‌نویس حقوقی، تعیین مایلستون‌های پرداخت مرحله‌ای، تعریف بندهای داوری اصناف و هش تأیید رمزنگاری.',
    status: 'completed',
    category: 'smart_contracts',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'انعقاد دیجیتال زیر ۳۰ ثانیه و اتصال خودکار به سرفصل‌های دوبل بهای تمام‌شده',
    technicalRationale: 'حذف فرآیندهای کاغذی و تأمین امنیت مالی طرفین با آزادسازی منوط به تأیید فازها.',
    adrRef: 'ADR-002',
    techStack: ['Digital Signature Simulator', 'Escrow Milestone Engine'],
    dependencies: ['m-203'],
    assigneeRole: 'مشاور حقوقی فناوری و مهندس قراردادها',
    progressPercent: 100
  },

  // Phase 3: Decentralized ID & Global Web Identity
  {
    id: 'm-301',
    phaseId: 'phase-3',
    phaseTitle: 'فاز ۳: هویت وب و پروتکل غیرمتمرکز',
    day: 35,
    targetQuarter: '1403-Q4',
    title: 'تولید شناسه هویت سازمانی غیرمتمرکز (W3C DID Specification)',
    description: 'پیاده‌سازی متد اختصاصی `did:habino:tenant` مبتنی بر کلیدهای عمومی رمزنگاری ECDSA P-256 برای مستأجران و کارفرمایان.',
    status: 'completed',
    category: 'decentralized_id',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'high',
    kpiMetric: 'تولید DID استاندارد W3C با زمان زیر ۱۰۰ میلی‌ثانیه و بدون وابستگی به سرور متمرکز',
    technicalRationale: 'محقق کردن هسته استراتژیک «سیستم‌عامل غیرمتمرکز تجارت و زیرساخت هویت وب».',
    adrRef: 'ADR-004',
    techStack: ['W3C DID', 'WebCrypto API', 'NIST P-256', 'ECDSA-SHA256'],
    dependencies: ['m-204'],
    assigneeRole: 'معمار کریپتوگرافی و هویت غیرمتمرکز',
    progressPercent: 100
  },
  {
    id: 'm-302',
    phaseId: 'phase-3',
    phaseTitle: 'فاز ۳: هویت وب و پروتکل غیرمتمرکز',
    day: 40,
    targetQuarter: '1403-Q4',
    title: 'صدور مدارک قابل راستی‌آزمایی صلاحیت اصناف (Verifiable Credentials)',
    description: 'امکان صدور گواهی تأیید صلاحیت فنی، پروانه کسب دیجیتال و سوابق حسن انجام کار با مهر رمزنگاری دیجیتال.',
    status: 'completed',
    category: 'decentralized_id',
    priority: 'P1',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'راستی‌آزمایی آفلاین اصالت مدرک در هر سیستم بیرونی ظرف ۱۰ میلی‌ثانیه',
    technicalRationale: 'افزایش اعتبار برند پلتفرم و امکان تبادل بی‌واسطه رتبه‌بندی کیفی پیمانکاران.',
    adrRef: 'ADR-004',
    techStack: ['JSON-LD', 'Verifiable Credentials', 'SHA-256 Signatures'],
    dependencies: ['m-301'],
    assigneeRole: 'توسعه‌دهنده پروتکل هویت',
    progressPercent: 100
  },
  {
    id: 'm-303',
    phaseId: 'phase-3',
    phaseTitle: 'فاز ۳: هویت وب و پروتکل غیرمتمرکز',
    day: 45,
    targetQuarter: '1403-Q4',
    title: 'امضای رمزنگاری واقعی قراردادها با کیف‌پول هویت (Web Identity Keyring)',
    description: 'امضای مستقیم اسناد با کلیدهای اختصاصی سخت‌افزاری/مرورگری طرفین قرارداد و ثبت هش روی زنجیره اثبات هابینو.',
    status: 'completed',
    category: 'smart_contracts',
    priority: 'P1',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'عدم امکان انکار امضا (Non-repudiation) با ضریب اطمینان ۹۹.۹۹٪',
    technicalRationale: 'حذف واسطه‌های کاغذی و اثبات‌پذیری قراردادها در مراجع حل اختلاف اصناف.',
    techStack: ['Hardware Token Auth', 'WebCrypto Keyring'],
    dependencies: ['m-301', 'm-302'],
    assigneeRole: 'مهندس ارشد امنیت',
    progressPercent: 100
  },

  // Phase 4: Open Commerce API & Multi-Tenant App Store
  {
    id: 'm-401',
    phaseId: 'phase-4',
    phaseTitle: 'فاز ۴: وب‌سرویس‌های تجاری باز و اکوسیستم',
    day: 55,
    targetQuarter: '1404-Q1',
    title: 'پایانه وب‌هوک و API باز تجاری هابینو (Open Commerce API)',
    description: 'سرویس‌دهی امن به فروشگاه‌های ووکامرس، شاپایفا و نرم‌افزارهای پوز اصناف جهت همگام‌سازی موجودی و صدور فاکتور متمرکز.',
    status: 'completed',
    category: 'open_api',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'medium',
    kpiMetric: 'ثبت و پردازش بیش از ۱,۰۰۰ تراکنش در ثانیه با تأخیر کمتر از ۸۰ میلی‌ثانیه',
    technicalRationale: 'تبدیل هابینو به هاب مرکزی مالی و انبارداری تمامی کانال‌های فروش کسب‌وکار.',
    adrRef: 'ADR-005',
    techStack: ['REST / GraphQL API', 'API Key Throttling', 'Webhooks HMAC'],
    dependencies: ['m-102', 'm-301'],
    assigneeRole: 'معمار API و میکروسرویس',
    progressPercent: 100
  },
  {
    id: 'm-402',
    phaseId: 'phase-4',
    phaseTitle: 'فاز ۴: وب‌سرویس‌های تجاری باز و اکوسیستم',
    day: 60,
    targetQuarter: '1404-Q1',
    title: 'مرکز توسعه‌دهندگان و SDK ماژول‌های اختصاصی اصناف (Habino Plugins)',
    description: 'چارچوب پلاگین‌نویسی جهت توسعه ماژول‌های صنف طلا، تراشکاری، پیمانکاری و املاک توسط برنامه‌نویسان شخص‌ثالث.',
    status: 'completed',
    category: 'open_api',
    priority: 'P1',
    complexity: 'high',
    riskLevel: 'low',
    kpiMetric: 'ایزولاسیون کامل جاوااسکریپت در ساندباکس و عدم تداخل با دیتای سایر افزونه‌ها',
    technicalRationale: 'رشد تصاعدی پلتفرم از طریق جامعه توسعه‌دهندگان مستقل و دریافت کارمزد از مارکت‌پلیس.',
    adrRef: 'ADR-005',
    techStack: ['Plugin Sandbox', 'Web Workers', 'Theme Token Adapter'],
    dependencies: ['m-401'],
    assigneeRole: 'مدیر پلتفرم و توسعه‌دهنده SDK',
    progressPercent: 100
  },
  {
    id: 'm-403',
    phaseId: 'phase-4',
    phaseTitle: 'فاز ۴: وب‌سرویس‌های تجاری باز و اکوسیستم',
    day: 65,
    targetQuarter: '1404-Q1',
    title: 'پل ارتباطی ووکامرس، دیجی‌کالا و پایانه‌های فروشگاهی (POS & E-Commerce Bridge)',
    description: 'تزریق آنی سفارش‌های فروشگاه اینترنتی به فاکتور هابینو و صدور اتوماتیک سند دوبل کاهش موجودی انبار بدون نیاز به مداخله دستی کاربر.',
    status: 'completed',
    category: 'open_api',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'همگام‌سازی لحظه‌ای موجودی و صدور سند زیر ۱ ثانیه با نرخ خطای صفر',
    technicalRationale: 'اتصال انبار فیزیکی بازار به کانال‌های فروش دیجیتال برای اصناف سنتی.',
    adrRef: 'ADR-005',
    techStack: ['WooCommerce REST API v3', 'Webhook Dispatcher', 'HMAC-SHA256'],
    dependencies: ['m-401'],
    assigneeRole: 'مهندس ارشد یکپارچه‌سازی سامانه‌ها',
    progressPercent: 100
  },
  {
    id: 'm-404',
    phaseId: 'phase-4',
    phaseTitle: 'فاز ۴: وب‌سرویس‌های تجاری باز و اکوسیستم',
    day: 70,
    targetQuarter: '1404-Q1',
    title: 'کنسول تعاملی تست API و شبیه‌ساز ارسال رویداد وب‌هوک (Interactive API Console)',
    description: 'کنسول آزمایش متدهای API با کدهای آماده cURL، Node.js، Python و PHP همراه با مانیتورینگ بلادرنگ دلیوری وب‌هوک‌های HMAC.',
    status: 'completed',
    category: 'open_api',
    priority: 'P1',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'تولید خودکار اسنیپت‌های معتبر و شبیه‌سازی بلادرنگ پاسخ با کد وضعیت ۲۰۰/۴۰۱',
    technicalRationale: 'کاهش زمان آنبوردینگ برنامه‌نویسان به زیر ۱۰ دقیقه و تسهیل ارائه به سرمایه‌گذاران.',
    adrRef: 'ADR-005',
    techStack: ['Interactive Console', 'Webhook Simulator', 'JSON Formatter'],
    dependencies: ['m-401', 'm-402'],
    assigneeRole: 'مهندس Developer Experience (DX)',
    progressPercent: 100
  },

  // Phase Bazaar: Cafe Bazaar & Iranian Market Launch Fast-Track
  {
    id: 'm-baz-01',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 72,
    targetQuarter: '1403-Q3',
    title: 'پکیجینگ نیتیو اندروید، TWA و استانداردهای فنی کافه‌بازار',
    description: 'پیکربندی کانتینر Trusted Web Activity (TWA)، تنظیم Splash Screen متریال هابینو، پیاده‌سازی Digital Asset Links برای حذف آدرس‌بار، و بهینه‌سازی بارگذاری سرد موبایل به زیر ۱.۵ ثانیه.',
    status: 'completed',
    category: 'pwa_devops',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'تأییدیه صفر خطای اعتبارسنجی خودکار و بازبینی کافه‌بازار (Zero-Rejection)',
    technicalRationale: 'رعایت کلیه دستورالعمل‌های فنی و UX کافه‌بازار جهت پذیرش فوری و بدون ریجکت در مارکت.',
    adrRef: 'ADR-006',
    techStack: ['Android TWA', 'Digital Asset Links', 'Service Worker v3', 'Lighthouse Mobile'],
    dependencies: ['m-104'],
    assigneeRole: 'معمار ارشد DevOps و کلاینت موبایل',
    progressPercent: 100
  },
  {
    id: 'm-baz-02',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 74,
    targetQuarter: '1403-Q3',
    title: 'ماژول پرداخت درون‌برنامه‌ای بازار (IAP) برای اشتراک‌ها و ارتقای لایسنس',
    description: 'اتصال هابینو به درگاه پرداخت درون‌برنامه‌ای کافه‌بازار، مدیریت خرید بسته‌های اشتراک پلن طلایی و سالانه، ثبت و اعتبارسنجی رمزنگاری توکن خرید در سرور و تمدید خودکار لایسنس.',
    status: 'completed',
    category: 'bazaar_market',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'high',
    kpiMetric: 'نرخ موفقیت پرداخت بالای ۹۸٪ و فعال‌سازی آنی اشتراک زیر ۲ ثانیه',
    technicalRationale: 'کانال درآمدزایی رسمی نرم‌افزار روی مارکت بازار و حذف واریز کارت‌به‌کارت سنتی.',
    adrRef: 'ADR-006',
    techStack: ['Bazaar In-App Billing SDK', 'Token Verifier', 'Supabase Secure RPC'],
    dependencies: ['m-baz-01'],
    assigneeRole: 'توسعه‌دهنده ارشد فین‌تک و بک‌اند',
    progressPercent: 100
  },
  {
    id: 'm-baz-03',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 76,
    targetQuarter: '1403-Q3',
    title: 'ورود آسان با شماره موبایل و کد یکبارمصرف پیامکی (OTP SMS)',
    description: 'احراز هویت سریع اصناف با ارسال کد ۴ رقمی پیامکی از خطوط خدماتی بدون بلک‌لیست، تخصیص خودکار مستأجر بر مبنای شماره تماس و حذف ثبت‌نام‌های پیچیده ایمیلی.',
    status: 'completed',
    category: 'multitenancy',
    priority: 'P0',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'تکمیل چرخه ورود کاربر به نرم‌افزار در کمتر از ۲۰ ثانیه',
    technicalRationale: 'اصناف بازار تمایلی به فرم‌های پیچیده ایمیل ندارند؛ سهولت لاگین شرط بقا در مارکت است.',
    adrRef: 'ADR-006',
    techStack: ['Kavenegar / SMS Provider API', 'OTP Auth Engine', 'Local Credential Cache'],
    dependencies: ['m-101'],
    assigneeRole: 'مهندس ارشد فرانت‌اند و احراز هویت',
    progressPercent: 100
  },
  {
    id: 'm-baz-04',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 78,
    targetQuarter: '1403-Q3',
    title: 'درایور چاپ مستقیم فیش حرارتی و فاکتور فروشگاهی (ESC/POS)',
    description: 'پشتیبانی از پرینترهای حرارتی ۸۰mm و ۵۸mm بازار (بلوتوث، وای‌فای و USB)، طراحی قالب فیش فشرده فروشگاهی، چاپ بارکد رهگیری فاکتور و سربرگ اختصاصی صنف با شکل‌دهی استاندارد متون فارسی.',
    status: 'completed',
    category: 'accounting_ledger',
    priority: 'P0',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'زمان ارسال سند به فیش‌پرینتر کمتر از ۱ ثانیه و سازگاری با ۹۰٪ پرینترهای بازار',
    technicalRationale: 'مغازه‌داران و کسبه بازار بلافاصله پس از ثبت فاکتور نیاز به تحویل فیش کاغذی مشتری دارند.',
    adrRef: 'ADR-006',
    techStack: ['Web Bluetooth API', 'ESC/POS Driver', 'Thermal Canvas Renderer', 'Persian Bidi Shaper'],
    dependencies: ['m-102'],
    assigneeRole: 'توسعه‌دهنده سخت‌افزار و پیرامونی',
    progressPercent: 100
  },
  {
    id: 'm-baz-05',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 80,
    targetQuarter: '1403-Q3',
    title: 'موتور صدور صورتحساب الکترونیکی سامانه مودیان مالیاتی (الگوی ۱ و ۲)',
    description: 'تولید شناسه ۲۲ رقمی مالیاتی یکتا با الگوریتم چکسام ورهوف (Verhoeff)، امضای دیجیتال فاکتور با شناسه حافظه مالیاتی صنف، ثبت خودکار مالیات بر ارزش افزوده و بسته دیتای معتمد مالیاتی (TSP).',
    status: 'completed',
    category: 'accounting_ledger',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'low',
    kpiMetric: 'تولید کد مالیاتی معتبر ۱۰۰٪ و به صفر رساندن جرایم عدم ارسال صورتحساب اصناف',
    technicalRationale: 'اصلی‌ترین برگ برنده و مزیت رقابتی در بازاریابی کافه‌بازار برای جذب حسابداران و اصناف.',
    adrRef: 'ADR-006',
    techStack: ['Taxpayer Crypto Module', 'Verhoeff Algorithm', 'Tax ID Generator', 'TSP Payload Schema'],
    dependencies: ['m-102'],
    assigneeRole: 'متخصص ارشد حسابداری مالیاتی و رمزنگاری',
    progressPercent: 100
  },
  {
    id: 'm-edge-01',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 81,
    targetQuarter: '1403-Q3',
    title: 'استقرار Supabase Edge Function برای RSA Verifier بازار',
    description: 'اعتبارسنجی سرورساید امضای RSA-SHA256 خریدهای کافه‌بازار در بستر Supabase Edge Functions / Deno، جلوگیری از Replay Attack و محافظت از امنیت چندمستأجری.',
    status: 'completed',
    category: 'multitenancy',
    priority: 'P1',
    complexity: 'high',
    riskLevel: 'low',
    kpiMetric: 'اعتبارسنجی ۱۰۰٪ بدون واسطه کلاینت با زمان پاسخگویی کمتر از ۵۰۰ میلی‌ثانیه',
    technicalRationale: 'کاهش ریسک دستکاری توکن در سمت کلاینت و ارتقای امنیت مالی به بالاترین سطح استاندارد فین‌تک.',
    adrRef: 'ADR-006',
    techStack: ['Supabase Edge Functions', 'Deno Crypto', 'RSA-SHA256', 'Postgres Token Vault'],
    dependencies: ['m-baz-02'],
    assigneeRole: 'مهندس ارشد امنیت ابری و بک‌اند',
    progressPercent: 100
  },
  {
    id: 'm-baz-06',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 82,
    targetQuarter: '1403-Q3',
    title: 'اسکنر بارکد انبار و بارکد دوبعدی چک‌های صیادی با دوربین گوشی',
    description: 'پردازش بلادرنگ کدهای میله‌ای کالاها (EAN-13 و Code128) برای خروج سریع در فاکتور، به همراه اسکنر QR چک‌های صیادی و استخراج اتوماتیک شناسه ۱۶ رقمی صیاد با دوربین موبایل.',
    status: 'in_progress',
    category: 'accounting_ledger',
    priority: 'P1',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'سرعت اسکن بارکد زیر ۲۰۰ میلی‌ثانیه و حذف نیاز به خرید بارکدخوان فیزیکی',
    technicalRationale: 'افزایش سرعت فاکتورزدن در ساعات شلوغی بازار بدون هزینه خرید سخت‌افزار جانبی.',
    adrRef: 'ADR-006',
    techStack: ['Barcode Detection API', 'ZBar WebAssembly', 'ZXing Scanner'],
    dependencies: ['m-103'],
    assigneeRole: 'مهندس وب‌کم و پردازش تصویر کلاینت',
    progressPercent: 75
  },
  {
    id: 'm-baz-07',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 84,
    targetQuarter: '1403-Q3',
    title: 'همگام‌سازی ابری تک‌کلیکه سوپابیس و بازیابی فوری اطلاعات',
    description: 'پشتیبان‌گیری ابری امن روی دیتابیس Supabase مستقرشده هابینو، بک‌آپ رمزنگاری‌شده روزانه، و قابلیت بازگردانی فوری تمام اطلاعات با یک کلیک در صورت تعویض یا مفقودی گوشی کاربر بازار.',
    status: 'completed',
    category: 'multitenancy',
    priority: 'P0',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'صفر درصد از دست رفتن دیتای اصناف و بازیابی کامل در کمتر از ۳ ثانیه',
    technicalRationale: 'رفع بزرگترین دغدغه اصناف بازار درباره از دست رفتن حساب‌ها هنگام سوختن یا گم شدن گوشی.',
    adrRef: 'ADR-003',
    techStack: ['Supabase Storage & DB', 'Incremental Sync', 'AES-256 Cloud Vault'],
    dependencies: ['m-101', 'm-104'],
    assigneeRole: 'مهندس پایگاه داده و زیرساخت ابری',
    progressPercent: 100
  },
  {
    id: 'm-baz-08',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 86,
    targetQuarter: '1403-Q3',
    title: 'تور هوشمند آنبوردینگ و راه‌اندازی سریع اولیه برای اصناف بازار',
    description: 'هدایت گام‌به‌گام کاربر جدید بازار، انتخاب صنف (خدماتی، فروشگاهی، صنعتی)، بارگذاری خودکار سرفصل‌ها و اقلام پیشنهادی، و آموزش تعاملی صدور اولین فاکتور در ۳ دقیقه.',
    status: 'in_progress',
    category: 'bazaar_market',
    priority: 'P1',
    complexity: 'low',
    riskLevel: 'low',
    kpiMetric: 'افزایش نرخ تبدیل نصب به کاربر فعال (Activation Rate) به بالای ۷۵٪',
    technicalRationale: 'جلوگیری از حذف اپلیکیشن در دقایق اولیه پس از نصب از کافه‌بازار.',
    adrRef: 'ADR-006',
    techStack: ['Onboarding Tour Guide', 'Preset Industry Catalogs', 'Micro-Animations'],
    dependencies: ['m-baz-03'],
    assigneeRole: 'طراح تجربه کاربری و مهندس محصول',
    progressPercent: 60
  },
  {
    id: 'm-baz-09',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار',
    day: 88,
    targetQuarter: '1403-Q3',
    title: 'تیکتینگ پشتیبانی آنلاین و دعوت هوشمند به امتیازدهی در کافه‌بازار',
    description: 'سیستم ثبت تیکت پشتیبانی فوری، پاسخگویی دستیار سایرافلو به سؤالات متداول کاربران بازار، و دیالوگ هوشمند ترغیب مشتریان راضی به ثبت ۵ ستاره در کافه‌بازار پس از فاکتور موفق.',
    status: 'in_progress',
    category: 'bazaar_market',
    priority: 'P1',
    complexity: 'low',
    riskLevel: 'low',
    kpiMetric: 'میانگین امتیاز بالای ۴.۷ در کافه‌بازار و کاهش زمان پاسخ به تیکت به زیر ۵ دقیقه',
    technicalRationale: 'رشد ارگانیک در الگوریتم‌های صفحه اصلی کافه‌بازار وابسته به نظرات و امتیازات مثبت است.',
    adrRef: 'ADR-006',
    techStack: ['Bazaar Intent Action', 'SiraFlow Support Agent', 'In-App Ticket Desk'],
    dependencies: ['m-baz-08'],
    assigneeRole: 'مهندس ارتباط با مشتری و ارکستراسیون سایرافلو',
    progressPercent: 50
  },
  {
    id: 'm-custom-1788965058006',
    phaseId: 'phase-bazaar',
    phaseTitle: 'فاز ضربتی: آماده‌سازی و انتشار رسمی در کافه‌بازار (Bazaar Launch Fast-Track)',
    day: 108,
    targetQuarter: '1404-Q3',
    title: 'یکپارچه‌سازی وب‌هوک پرداخت بازار با موتور ثبت سند اتوماتیک دفاتر دوبل',
    description: 'اتصال رسمی وب‌هوک و پرداخت درون‌برنامه‌ای کافه‌بازار به موتور ثبت سند حسابداری دوبل با رعایت اصول ۹‌گانه تغییرناپذیر، تفکیک خودکار کارمزد ۱۵٪ مارکت و ارزش افزوده ۱۰٪ مودیان، ایزولاسیون چندمستأجری و تضمین تراز ابدی دفاتر.',
    status: 'completed',
    category: 'accounting_ledger',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'تحقق ۱۰۰٪ آزمون‌های پذیرش فنی ایجنت ممیزی و تراز صفر قطعی دفاتر کل',
    technicalRationale: 'تضمین انضباط مالی بدون خطای انسانی، حذف مغایرت‌های بانکی و تسویه خودکار خریدهای اشتراک کافه‌بازار با استانداردهای دوبل.',
    adrRef: 'ADR-006',
    techStack: ['Bazaar IAP Webhook', 'Double-Entry Accounting Engine', 'Multi-Tenancy RLS', 'Supabase ACID'],
    dependencies: ['m-baz-02'],
    assigneeRole: 'سایرافلو (SiraFlow Lead)',
    progressPercent: 100
  },

  // Phase 6: P2P Settlement
  {
    id: 'm-501',
    phaseId: 'phase-5',
    phaseTitle: 'فاز ۶: تسویه همتابه‌همتا',
    day: 95,
    targetQuarter: '1404-Q2',
    title: 'موتور همگام‌سازی توزیع‌شده اسناد مالی بین مستأجران (P2P State Sync)',
    description: 'تسویه مستقیم مانده‌حساب‌ها و بدهی‌های بین‌اصناف بدون نیاز به سرور مرکزی با استفاده از فناوری CRDT و هشینگ مرکل.',
    status: 'planned',
    category: 'architecture',
    priority: 'P2',
    complexity: 'epic',
    riskLevel: 'high',
    kpiMetric: 'حل مغایرت خودکار ۱۰۰٪ تراکنش‌های موازی بدون بن‌بست داده (Conflict-free)',
    technicalRationale: 'بلوغ غایی سیستم‌عامل غیرمتمرکز تجارت و مصونیت کامل از سانسور یا قطعی‌های سرورهای بین‌المللی.',
    techStack: ['CRDT (Yjs/Automerge)', 'Merkle DAG', 'WebRTC Data Channels'],
    dependencies: ['m-301', 'm-401'],
    assigneeRole: 'پژوهشگر سیستم‌های توزیع‌شده',
    progressPercent: 0
  },
  {
    id: 'm-601',
    phaseId: 'phase-mena-foundation',
    phaseTitle: 'فاز ۶: زیرساخت چندکشوری خاورمیانه (MENA) و پشتیبانی ریموت',
    day: 45,
    targetQuarter: '1404-Q2',
    title: 'موتور i18n چندزبانه (فارسی، عربی، انگلیسی) و RTL/LTR منطقی با Logical CSS',
    description: 'پیاده‌سازی سیستم ترجمه بومی (fa/ar/en)، نگاشت تقویم‌های شمسی، میلادی و هجری و جایگزینی جهت‌های فیزیکی CSS با Logical Properties (ms-/me-/ps-/pe-).',
    status: 'planned',
    category: 'architecture',
    priority: 'P0',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'سوئیچ لحظه‌ای میان ۳ زبان با حفظ ۱۰۰٪ چیدمان بدون شکستگی رابط کاربری',
    technicalRationale: 'پیش‌نیاز ورود به بازارهای عربی خلیج فارس، عراق، افغانستان و مشتریان بین‌المللی انگلیسی‌زبان.',
    adrRef: 'ADR-010',
    techStack: ['i18n Engine', 'Intl Calendar/NumberFormat', 'Tailwind Logical CSS'],
    dependencies: ['m-101'],
    assigneeRole: 'مهندس ارشد فرانت‌اند و بومی‌سازی',
    progressPercent: 0
  },
  {
    id: 'm-602',
    phaseId: 'phase-mena-foundation',
    phaseTitle: 'فاز ۶: زیرساخت چندکشوری خاورمیانه (MENA) و پشتیبانی ریموت',
    day: 52,
    targetQuarter: '1404-Q2',
    title: 'ارز پایه مستأجر با دقت اعشار ۰/۲/۳ و Country Compliance Pack (ایران، عراق، امارات، عربستان)',
    description: 'پشتیبانی دقیق از ارزهای ۰ اعشاری (IRR/IQD/AFN)، ۲ اعشاری (AED/SAR/USD) و ۳ اعشاری (KWD/BHD/OMR) در تمام فرمول‌های فاکتور و تراز، همراه با ماژول مالیاتی کشورها (مودیان/ZATCA/FTA).',
    status: 'planned',
    category: 'accounting_ledger',
    priority: 'P0',
    complexity: 'epic',
    riskLevel: 'high',
    kpiMetric: 'صفر خطای گردکردن در تراز ۶ ستونی برای هر ۳ سطح اعشار ارزهای خاورمیانه',
    technicalRationale: 'تضمین صحت ریاضی دفاتر دوبل در کشورهای عربی و بین‌المللی بدون نیاز به تغییر هسته.',
    adrRef: 'ADR-010',
    techStack: ['Multi-Precision Decimal', 'Tax Compliance Pack', 'Double-Entry Kernel'],
    dependencies: ['m-601'],
    assigneeRole: 'معمار ارشد سیستم‌های مالی',
    progressPercent: 0
  },
  {
    id: 'm-603',
    phaseId: 'phase-mena-foundation',
    phaseTitle: 'فاز ۶: زیرساخت چندکشوری خاورمیانه (MENA) و پشتیبانی ریموت',
    day: 58,
    targetQuarter: '1404-Q2',
    title: 'بسته تشخیصی پشتیبانی ریموت دولایه (Zero On-Site Diagnostics Bundle)',
    description: 'ایجاد خروجی امن وضعیت فنی (نسخه اپ، سلامت Sync/Outbox، شمارش خطاها، وضعیت لایسنس بدون افشای مبالغ اسناد) + ویزارد اتصال ریموت با تایید صریح کارفرما.',
    status: 'planned',
    category: 'pwa_devops',
    priority: 'P1',
    complexity: 'medium',
    riskLevel: 'low',
    kpiMetric: 'رفع حداقل ۹۰٪ تیکت‌های فنی بدون اعزام نیروی حضوری در کمتر از ۱۵ دقیقه',
    technicalRationale: 'کاهش شدید هزینه پشتیبانی عملیاتی در سراسر ایران و کشورهای MENA.',
    adrRef: 'ADR-011',
    techStack: ['Support Bundle Diagnostics', 'Masked Telemetry', 'Remote Assist Bridge'],
    dependencies: ['m-104'],
    assigneeRole: 'مهندس زیرساخت و پشتیبانی فنی',
    progressPercent: 0
  },
  {
    id: 'm-701',
    phaseId: 'phase-windows-local',
    phaseTitle: 'فاز ۷: نسخه دسکتاپ محلی ویندوز با دیتابیس SQLite',
    day: 70,
    targetQuarter: '1404-Q3',
    title: 'لایه انتزاع StorageAdapter و موتور ذخیره‌سازی محلی SQLite برای ویندوز (Electron/Tauri)',
    description: 'پیاده‌سازی درایور محلی SQLite منطبق بر اسکیمای هسته حسابداری به همراه نصب‌کننده یک‌کلیکه ویندوز و بکاپ رمزنگاری‌شده خودکار روی درایو محلی.',
    status: 'planned',
    category: 'architecture',
    priority: 'P1',
    complexity: 'epic',
    riskLevel: 'medium',
    kpiMetric: 'نصب کامل در ویندوز زیر ۲ دقیقه با عملکرد آفلاین ۱۰۰٪ بدون نیاز به اینترنت',
    technicalRationale: 'جذب کسب‌وکارهای سنتی و کارگاه‌هایی که به دلایل امنیتی یا زیرساختی ترجیح می‌دهند داده فقط روی سیستم خودشان باشد.',
    adrRef: 'ADR-009',
    techStack: ['SQLite (WAL Mode)', 'Tauri/Electron', 'StorageAdapter Pattern'],
    dependencies: ['m-602'],
    assigneeRole: 'مهندس سیستم‌های دسکتاپ و دیتابیس',
    progressPercent: 0
  },
  {
    id: 'm-801',
    phaseId: 'phase-hybrid-lan',
    phaseTitle: 'فاز ۸: سرور شبکه داخلی هیبرید (Hybrid LAN) و همگام‌سازی اختیاری ابری',
    day: 85,
    targetQuarter: '1404-Q4',
    title: 'سرور محلی شبکه LAN (Multi-User On-Premise) با همگام‌سازی امن ابری',
    description: 'پکیج سرور سبک Node.js + Postgres/SQLite روی سیستم اصلی دفتر جهت اتصال ۲ تا ۱۰ کلاینت از طریق Wi-Fi/LAN با صف Outbox برای همگام‌سازی دوره‌ای به ابر.',
    status: 'planned',
    category: 'multitenancy',
    priority: 'P1',
    complexity: 'epic',
    riskLevel: 'high',
    kpiMetric: 'همگام‌سازی بدون تعارض ۵ کلاینت همزمان در شبکه داخلی و تاب‌آوری قطع اینترنت',
    technicalRationale: 'پاسخ به نیاز فروشگاه‌های زنجیره‌ای کوچک، کارگاه‌ها و شرکت‌هایی با چند صندوق و حسابدار در شبکه محلی.',
    adrRef: 'ADR-009',
    techStack: ['Local Express Server', 'PostgreSQL/SQLite', 'LAN mDNS & Cloud Outbox'],
    dependencies: ['m-701'],
    assigneeRole: 'معمار سیستم‌های توزیع‌شده و شبکه',
    progressPercent: 0
  },
  {
    id: 'm-802',
    phaseId: 'phase-hybrid-lan',
    phaseTitle: 'فاز ۸: سرور شبکه داخلی هیبرید (Hybrid LAN) و همگام‌سازی اختیاری ابری',
    day: 92,
    targetQuarter: '1404-Q4',
    title: 'حالت سوئیچ شفاف بین استقرار ابری، محلی و هیبرید و مهاجرت داده یک‌کلیکه',
    description: 'ابزار تبدیل و انتقال یکپارچه اسناد میان محیط Local SQLite، سرور LAN و فضای ابری Supabase با تضمین حفظ کامل تراز و شماره اسناد.',
    status: 'planned',
    category: 'accounting_ledger',
    priority: 'P2',
    complexity: 'high',
    riskLevel: 'medium',
    kpiMetric: 'انتقال ۱۰۰٪ اسناد و دفاتر دوبل بین سه حالت استقرار با اختلاف تراز ۰ ریال',
    technicalRationale: 'امکان رشد تدریجی مشتری از نسخه رایگان محلی به سیستم چندکاربره شبکه و ابری بدون قفل‌شدن داده.',
    adrRef: 'ADR-009',
    techStack: ['Encrypted Ledger Snapshot', 'Migration Pipeline', 'Integrity Verifier'],
    dependencies: ['m-801'],
    assigneeRole: 'مهندس مهاجرت داده و QA',
    progressPercent: 0
  }
];

export const ROADMAP_STORAGE_KEY = 'habino_engineering_roadmap_v6';
export const ADR_STORAGE_KEY = 'habino_engineering_adrs_v6';

export function getStoredRoadmapMilestones(): Milestone[] {
  try {
    const raw = localStorage.getItem(ROADMAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Auto-merge new milestones like m-105, m-106 or Bazaar phase if missing
        let updated = false;
        let merged = [...parsed];
        
        const hasM105 = merged.some((m: Milestone) => m.id === 'm-105');
        if (!hasM105) {
          const item105 = INITIAL_ROADMAP_MILESTONES.find(m => m.id === 'm-105');
          if (item105) {
            merged.splice(4, 0, item105);
            updated = true;
          }
        }

        const hasM106 = merged.some((m: Milestone) => m.id === 'm-106');
        if (!hasM106) {
          const item106 = INITIAL_ROADMAP_MILESTONES.find(m => m.id === 'm-106');
          if (item106) {
            const index105 = merged.findIndex(m => m.id === 'm-105');
            const insertIdx = index105 !== -1 ? index105 + 1 : 5;
            merged.splice(insertIdx, 0, item106);
            updated = true;
          }
        }

        const hasBazaar = merged.some((m: Milestone) => m.phaseId === 'phase-bazaar');
        if (!hasBazaar) {
          const bazaarItems = INITIAL_ROADMAP_MILESTONES.filter(m => m.phaseId === 'phase-bazaar');
          merged = [...merged, ...bazaarItems];
          updated = true;
        } else {
          // Ensure m-custom-1788965058006 is merged and completed
          const existingCustom = merged.find((m: Milestone) => m.id === 'm-custom-1788965058006');
          if (!existingCustom) {
            const customMilestone = INITIAL_ROADMAP_MILESTONES.find(m => m.id === 'm-custom-1788965058006');
            if (customMilestone) {
              merged.push(customMilestone);
              updated = true;
            }
          } else if (existingCustom.status !== 'completed' || existingCustom.progressPercent !== 100) {
            existingCustom.status = 'completed';
            existingCustom.progressPercent = 100;
            updated = true;
          }
        }

        const missingInitialMilestones = INITIAL_ROADMAP_MILESTONES.filter(
          initItem => !merged.some((m: Milestone) => m.id === initItem.id)
        );
        if (missingInitialMilestones.length > 0) {
          merged = [...merged, ...missingInitialMilestones];
          updated = true;
        }

        if (updated) {
          saveStoredRoadmapMilestones(merged);
        }
        return merged;
      }
    }
  } catch (e) {
    console.error('Error reading roadmap from storage:', e);
  }
  return INITIAL_ROADMAP_MILESTONES;
}

export function saveStoredRoadmapMilestones(milestones: Milestone[]): void {
  try {
    localStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(milestones));
  } catch (e) {
    console.error('Error saving roadmap to storage:', e);
  }
}

export function addCustomMilestone(data: {
  title: string;
  phaseId: string;
  category: MilestoneCategory;
  priority: MilestonePriority;
  complexity: 'low' | 'medium' | 'high' | 'epic';
  description: string;
  rationale: string;
  kpiTarget: string;
  techStack: string[];
  assignee: string;
}): Milestone {
  const current = getStoredRoadmapMilestones();
  const phase = ROADMAP_PHASES.find(p => p.id === data.phaseId) || ROADMAP_PHASES[ROADMAP_PHASES.length - 1];
  const newMilestone: Milestone = {
    id: `m-custom-${Date.now()}`,
    phaseId: data.phaseId,
    phaseTitle: phase.title,
    day: Math.max(30, ...current.map(m => m.day)) + 1,
    targetQuarter: 'Q3-1404',
    title: data.title,
    description: data.description,
    status: 'planned',
    category: data.category,
    priority: data.priority,
    complexity: data.complexity,
    riskLevel: 'medium',
    kpiMetric: data.kpiTarget,
    technicalRationale: data.rationale,
    techStack: data.techStack,
    dependencies: [],
    assigneeRole: data.assignee,
    progressPercent: 0
  };
  const updated = [newMilestone, ...current];
  saveStoredRoadmapMilestones(updated);
  return newMilestone;
}

export const addCustomRoadmapMilestone = addCustomMilestone;

export function getStoredADRs(): ArchitectureDecisionRecord[] {
  try {
    const raw = localStorage.getItem(ADR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const missingAdrs = INITIAL_ADRS.filter(
          initAdr => !parsed.some((a: ArchitectureDecisionRecord) => a.code === initAdr.code)
        );
        if (missingAdrs.length > 0) {
          const merged = [...parsed, ...missingAdrs];
          saveStoredADRs(merged);
          return merged;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading ADRs from storage:', e);
  }
  return INITIAL_ADRS;
}

export function saveStoredADRs(adrs: ArchitectureDecisionRecord[]): void {
  try {
    localStorage.setItem(ADR_STORAGE_KEY, JSON.stringify(adrs));
  } catch (e) {
    console.error('Error saving ADRs to storage:', e);
  }
}

// Backward compatibility alias for legacy imports
export const ROADMAP_30_DAYS = INITIAL_ROADMAP_MILESTONES.slice(0, 9);

// ==============================================================================
// NEXT-STEP ENGINE & RECOMMENDATIONS ARCHITECTURE
// ==============================================================================

export interface ProposedNextStep {
  milestone: Milestone;
  urgencyScore: number; // 1-100
  reasoning: string;
  impactArea: string;
  estimatedEffortDays: number;
  blockerRisk: 'high' | 'medium' | 'low';
}

export interface NextStepAnalysis {
  immediateNextStep: Milestone | null;
  immediateRationale: string;
  proposedNextSteps: ProposedNextStep[];
  currentSprintMilestones: Milestone[];
  completedCount: number;
  totalCount: number;
  overallProgressPercent: number;
  currentPhaseIndex: number;
  currentPhase: RoadmapPhase;
  criticalPathMilestones: Milestone[];
}

export function calculateNextStepAnalysis(milestones: Milestone[]): NextStepAnalysis {
  const totalCount = milestones.length;
  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const currentSprintMilestones = milestones.filter(m => m.status === 'in_progress');
  
  const overallProgressPercent = totalCount > 0 
    ? Math.round(milestones.reduce((acc, m) => acc + (m.progressPercent || (m.status === 'completed' ? 100 : 0)), 0) / totalCount)
    : 0;

  // Active or Current Phase Determination
  const activePhase = ROADMAP_PHASES.find(p => p.status === 'active') || ROADMAP_PHASES[ROADMAP_PHASES.length - 2];
  const activePhaseIdx = ROADMAP_PHASES.findIndex(p => p.id === activePhase.id);

  // Uncompleted Milestones
  const uncompleted = milestones.filter(m => m.status !== 'completed');

  // Priority scoring helper
  const scoreMilestone = (m: Milestone): number => {
    let score = 50;
    if (m.priority === 'P0') score += 35;
    if (m.priority === 'P1') score += 20;
    if (m.priority === 'P2') score += 5;
    if (m.phaseId === 'phase-bazaar') score += 25; // High priority for market launch
    if (m.status === 'in_progress') score += 15;
    if (m.status === 'planned') score += 10;
    if (m.riskLevel === 'high') score -= 5;
    return Math.min(100, Math.max(10, score));
  };

  // Immediate Next Step: Highest priority milestone that is either in_progress or uncompleted P0
  let immediateNextStep: Milestone | null = null;
  let immediateRationale = '';

  const urgentInProgress = currentSprintMilestones.find(m => m.priority === 'P0');
  if (urgentInProgress) {
    immediateNextStep = urgentInProgress;
    immediateRationale = `تسک «${urgentInProgress.title}» در اسپرینت جاری به عنوان اولویت مسدودکننده P0 تعریف شده و اتمام آن پیش‌نیاز حیاتی انتشار در بازار است.`;
  } else if (currentSprintMilestones.length > 0) {
    immediateNextStep = currentSprintMilestones[0];
    immediateRationale = `تکمیل مایلستون جاری «${immediateNextStep.title}» با پیشرفت فعلی ${immediateNextStep.progressPercent}% در اولویت اول تیم قرار دارد.`;
  } else {
    // Find uncompleted P0 in bazaar or active phase
    const nextP0 = uncompleted.find(m => m.phaseId === 'phase-bazaar' && m.priority === 'P0') 
      || uncompleted.find(m => m.priority === 'P0')
      || uncompleted[0] 
      || null;

    if (nextP0) {
      immediateNextStep = nextP0;
      immediateRationale = `با توجه به تکمیل گام‌های قبلی، مایلستون «${nextP0.title}» به عنوان گام بعدی بلافاصله پیشنهاد می‌شود.`;
    }
  }

  // Proposed Next Steps for Developer Team: Milestones waiting to be activated (planned/under_review)
  const candidatePool = milestones.filter(m => 
    m.status !== 'completed' && 
    m.status !== 'in_progress' && 
    (!immediateNextStep || m.id !== immediateNextStep.id)
  );

  // Fallback: If all planned are activated, pick any remaining uncompleted that is not the immediate next step
  const finalCandidates = candidatePool.length > 0 
    ? candidatePool 
    : uncompleted.filter(m => !immediateNextStep || m.id !== immediateNextStep.id);

  const candidates = [...finalCandidates]
    .sort((a, b) => scoreMilestone(b) - scoreMilestone(a))
    .slice(0, 4);

  const proposedNextSteps: ProposedNextStep[] = candidates.map(m => {
    let reason = '';
    let impact = 'زیرساخت عمومی';
    let effort = 3;
    let risk: 'high' | 'medium' | 'low' = m.riskLevel;

    if (m.phaseId === 'phase-bazaar') {
      impact = 'عرضه مستقیم در کافه‌بازار';
      if (m.id === 'm-baz-02') {
        reason = 'فعال‌سازی درگاه پرداخت درون‌برنامه‌ای بازار (IAP) درآمدزایی آنی و تمدید لایسنس ریالی را ممکن می‌سازد.';
        effort = 2;
      } else if (m.id === 'm-baz-05') {
        reason = 'سامانه مودیان مالیاتی برگ برنده جذب اصناف سنتی و شرکت‌ها به هابینو است.';
        effort = 4;
      } else if (m.id === 'm-baz-04') {
        reason = 'پشتیبانی از پرینترهای حرارتی بلوتوثی ESC/POS رضایت کسب‌وکارهای حضوری را چندبرابر می‌کند.';
        effort = 2;
      } else {
        reason = 'تسریع فرآیند ورود به بازار و کاهش ریسک رد صلاحیت اپلیکیشن توسط ارزیاب‌های استور.';
        effort = 3;
      }
    } else if (m.category === 'accounting_ledger') {
      impact = 'موتور حسابداری و پایداری دفاتر';
      reason = 'تضمین تراز دفاتر دوبل مالی و جلوگیری از بروز تراکنش‌های بدون سند.';
      effort = 2;
    } else {
      impact = 'معماری و توسعه سیستم‌عامل';
      reason = 'افزایش قابلیت‌های چندمستأجری و همگرایی ماژول‌ها بر اساس سند معماری هابینو.';
      effort = 3;
    }

    return {
      milestone: m,
      urgencyScore: scoreMilestone(m),
      reasoning: reason,
      impactArea: impact,
      estimatedEffortDays: effort,
      blockerRisk: risk
    };
  });

  // Critical path milestones (P0 milestones ordered by day)
  const criticalPathMilestones = milestones
    .filter(m => m.priority === 'P0')
    .sort((a, b) => a.day - b.day);

  return {
    immediateNextStep,
    immediateRationale: immediateRationale || 'سیستم در وضعیت پایدار قرار دارد و تمامی مایلستون‌های کلیدی در مسیر زمان‌بندی هستند.',
    proposedNextSteps,
    currentSprintMilestones,
    completedCount,
    totalCount,
    overallProgressPercent,
    currentPhaseIndex: activePhaseIdx,
    currentPhase: activePhase,
    criticalPathMilestones
  };
}

export function adoptProposedNextStep(milestoneId: string, currentMilestones?: Milestone[]): Milestone[] {
  const current = currentMilestones && currentMilestones.length > 0 ? currentMilestones : getStoredRoadmapMilestones();
  const updated = current.map(m => {
    if (m.id === milestoneId) {
      return {
        ...m,
        status: 'in_progress' as MilestoneStatus,
        progressPercent: Math.max(25, m.progressPercent || 0)
      };
    }
    return m;
  });
  saveStoredRoadmapMilestones(updated);
  return updated;
}

export function updateMilestoneStatus(
  milestoneId: string, 
  status: MilestoneStatus, 
  progress?: number, 
  currentMilestones?: Milestone[]
): Milestone[] {
  const current = currentMilestones && currentMilestones.length > 0 ? currentMilestones : getStoredRoadmapMilestones();
  const updated = current.map(m => {
    if (m.id === milestoneId) {
      const calculatedProgress = progress !== undefined 
        ? progress 
        : (status === 'completed' ? 100 : (status === 'in_progress' ? Math.max(25, m.progressPercent || 0) : (status === 'planned' ? 0 : m.progressPercent)));
      return {
        ...m,
        status,
        progressPercent: calculatedProgress
      };
    }
    return m;
  });
  saveStoredRoadmapMilestones(updated);
  return updated;
}

