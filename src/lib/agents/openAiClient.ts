/**
 * Habino AI - OpenAI & Omni Route Gateway
 * انطباق کامل با پروتکل OpenAI و سرویس مسیردهی چندمدلی (Omni Route)
 * پیش‌فرض Base URL: https://api.bazaarlink.ai/v1
 * پیش‌فرض مدل: openai/gpt-4o
 */

import OpenAI from 'openai';

let openAiClientInstance: OpenAI | null = null;
let lastUsedApiKey = '';
let lastUsedBaseUrl = '';
let openAiCooldownUntil = 0;
let openAiLastErrorReason: 'insufficient_credits' | 'rate_limit' | 'auth_error' | 'network_error' | null = null;

/**
 * بازیابی کلید API فعال برای OpenAI یا سرویس‌های سازگار با پروتکل آن
 */
export function getOpenAIApiKey(): string {
  return (
    process.env.OMNIROUTE_API_KEY ||
    process.env.OMNIRUTE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.BAZAARLINK_API_KEY ||
    process.env.VITE_OPENAI_API_KEY ||
    ''
  ).trim();
}

/**
 * بازیابی آدرس Base URL اختصاصی یا بازارلینک
 */
export function getOpenAIBaseUrl(): string {
  const url = (
    process.env.OMNIROUTE_BASE_URL ||
    process.env.OMNIRUTE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.BAZAARLINK_BASE_URL ||
    process.env.VITE_OPENAI_BASE_URL ||
    'https://api.bazaarlink.ai/v1'
  ).trim();
  if (url.includes('localhost:20128') || url.includes(' ') || url.startsWith('#')) {
    return 'https://api.bazaarlink.ai/v1';
  }
  return url.replace(/\/+$/, '');
}

export function getOpenAIProvider(): 'omni_route' | 'openai' {
  const hasOmniRouteConfig = Boolean(
    process.env.OMNIROUTE_API_KEY ||
    process.env.OMNIRUTE_API_KEY ||
    process.env.OMNIROUTE_BASE_URL ||
    process.env.OMNIRUTE_BASE_URL
  );
  return hasOmniRouteConfig || getOpenAIBaseUrl().includes('bazaarlink.ai')
    ? 'omni_route'
    : 'openai';
}

/**
 * بازیابی نام مدل پیش‌فرض (با پشتیبانی از Provider Prefix مانند openai/gpt-4o)
 */
export function getOpenAIDefaultModel(): string {
  const model = (
    process.env.OMNIROUTE_MODEL ||
    process.env.OMNIRUTE_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.VITE_OPENAI_MODEL ||
    'openai/gpt-4o'
  ).trim();
  if (!model || model.includes(' ') || model.startsWith('#')) {
    return 'openai/gpt-4o';
  }
  return model;
}

/**
 * بررسی وضعیت پیکربندی بودن کلید OpenAI / Omni
 */
export function isOpenAIConfigured(): boolean {
  return Boolean(getOpenAIApiKey());
}

/**
 * بررسی اینکه آیا کلاینت در حال حاضر در حالت Cooldown (به دلیل کمبود اعتبار یا ریت‌لیمیت) قرار ندارد
 */
export function isOpenAIAvailable(): boolean {
  if (!isOpenAIConfigured()) return false;
  return Date.now() >= openAiCooldownUntil;
}

/**
 * دریافت جزئیات وضعیت حساب و درگاه OpenAI
 */
export function getOpenAIAccountStatus(): {
  isConfigured: boolean;
  isAvailable: boolean;
  cooldownActive: boolean;
  cooldownRemainingSeconds: number;
  lastErrorReason: 'insufficient_credits' | 'rate_limit' | 'auth_error' | 'network_error' | null;
} {
  const isConfigured = isOpenAIConfigured();
  const now = Date.now();
  const cooldownRemainingSeconds = Math.max(0, Math.ceil((openAiCooldownUntil - now) / 1000));
  return {
    isConfigured,
    isAvailable: isConfigured && cooldownRemainingSeconds === 0,
    cooldownActive: cooldownRemainingSeconds > 0,
    cooldownRemainingSeconds,
    lastErrorReason: openAiLastErrorReason
  };
}

/**
 * مقداردهی اولیه یا بازیابی سینگلتون کلاینت OpenAI
 */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = getOpenAIApiKey();
  const baseURL = getOpenAIBaseUrl();

  if (!apiKey) {
    return null;
  }

  if (!openAiClientInstance || apiKey !== lastUsedApiKey || baseURL !== lastUsedBaseUrl) {
    lastUsedApiKey = apiKey;
    lastUsedBaseUrl = baseURL;
    openAiClientInstance = new OpenAI({
      apiKey,
      baseURL,
      timeout: 25000,
      maxRetries: 1
    });
  }

  return openAiClientInstance;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIGenerateOptions {
  messages: OpenAIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
}

export interface OpenAIGenerateResult {
  text: string;
  modelUsed: string;
  provider: 'openai_omni' | 'openai';
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * ارسال درخواست چت به OpenAI / Omni Route با مکانیزم بازگشت‌پذیری و قطع فوری در خطاهای حسابی
 */
export async function generateOpenAIContent(
  options: OpenAIGenerateOptions
): Promise<OpenAIGenerateResult | null> {
  const now = Date.now();
  if (now < openAiCooldownUntil) {
    return null;
  }

  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const requestedModel = options.model || getOpenAIDefaultModel();
  const isOmniRoute = getOpenAIProvider() === 'omni_route' || requestedModel.includes('/');

  // لیست مدل‌های کاندیدا جهت فال‌بک (شامل مدل آزاد پایدار deepseek-v4-flash)
  const candidateModels = [
    requestedModel,
    'deepseek/deepseek-v4-flash-0731free:free',
    requestedModel.includes('/') ? requestedModel : `openai/${requestedModel}`,
    'openai/gpt-4o',
    'openai/gpt-4o-mini'
  ]
    .filter((m): m is string => Boolean(m && !m.includes(' ') && !m.startsWith('#')))
    .filter((m, idx, arr) => arr.indexOf(m) === idx);

  for (const model of candidateModels) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: options.messages as any,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        ...(options.responseFormatJson ? { response_format: { type: 'json_object' } } : {})
      });

      const choice = response.choices?.[0];
      const content = choice?.message?.content || '';

      if (content) {
        openAiLastErrorReason = null;
        return {
          text: content,
          modelUsed: model,
          provider: isOmniRoute ? 'openai_omni' : 'openai',
          finishReason: choice?.finish_reason || 'stop',
          usage: {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens
          }
        };
      }
    } catch (err: any) {
      const status = Number(err?.status || err?.statusCode || 0);
      const errMsg = String(err?.message || '');

      // ۱. خطای کمبود اعتبار / عدم موجودی (402 Insufficient credits)
      const isInsufficientCredits =
        status === 402 ||
        errMsg.includes('402') ||
        errMsg.includes('Insufficient credits') ||
        errMsg.includes('top up') ||
        errMsg.includes('billing');

      if (isInsufficientCredits) {
        openAiLastErrorReason = 'insufficient_credits';
        openAiCooldownUntil = Date.now() + 120000;
        console.info('[AI Router] Notice: Account requires credits. Switching cleanly to Gemini.');
        break;
      }

      // ۲. خطای کلید یا عدم احراز هویت (401)
      const isAuthError =
        status === 401 ||
        errMsg.includes('401') ||
        errMsg.includes('Invalid API') ||
        errMsg.includes('unauthorized');

      if (isAuthError) {
        openAiLastErrorReason = 'auth_error';
        openAiCooldownUntil = Date.now() + 120000;
        console.info('[AI Router] Notice: Omni Route authentication required. Switching cleanly to Gemini.');
        break;
      }

      // ۳. خطای محدودیت نرخ درخواست (429 Rate Limit)
      const isRateLimit = status === 429 || errMsg.includes('429') || errMsg.includes('rate limit');
      if (isRateLimit) {
        openAiLastErrorReason = 'rate_limit';
        openAiCooldownUntil = Date.now() + 30000;
        console.info('[AI Router] Notice: Rate limit reached. Switching to Gemini for 30s.');
        break;
      }

      // ۴. خطای عدم دسترسی شبکه
      const isConnectionError =
        status === 0 ||
        errMsg.toLowerCase().includes('connection error') ||
        errMsg.toLowerCase().includes('failed to fetch') ||
        errMsg.toLowerCase().includes('enotfound') ||
        errMsg.toLowerCase().includes('econnrefused') ||
        errMsg.toLowerCase().includes('timeout') ||
        errMsg.toLowerCase().includes('network');

      if (isConnectionError) {
        openAiLastErrorReason = 'network_error';
        openAiCooldownUntil = Date.now() + 120000;
        console.info(`[AI Router] Notice: Omni gateway temporarily offline (${errMsg.slice(0, 50)}). Switching to Gemini.`);
        break;
      }

      // سایر وضعیت‌های مدل
      console.info(`[AI Router] Model ${model} unavailable (status ${status || 0}). Trying next model...`);
    }
  }

  return null;
}
