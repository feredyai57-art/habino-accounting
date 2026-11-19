import { getSupabaseClient, getSupabaseConfig } from './supabase';
import { AdminTier, GuildType } from '../types';

export type SupportNoteCategory = 'license' | 'accounting_fix' | 'onboarding' | 'bug_report';

export interface SupportNote {
  id: string;
  tenantId: string;
  authorId: string;
  timestamp: string;
  category: SupportNoteCategory;
  content: string;
}

export type PlatformOperatorRole = 'super_admin' | 'hubino_support' | 'tenant_owner';

export interface PlatformOperator {
  id: string;
  email: string;
  fullName: string;
  role: Exclude<PlatformOperatorRole, 'tenant_owner'>;
  adminTier: AdminTier;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface PlatformTenantSummary {
  id: string;
  name: string;
  slug: string;
  guildType: GuildType;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  status: 'active' | 'suspended' | 'trial';
  createdAt: string;
  subscription: {
    plan: 'starter' | 'professional' | 'enterprise';
    planNameFa: string;
    status: 'active' | 'expired' | 'trial';
    maxUsers: number;
    expiresAt: string;
    trialDaysRemaining?: number;
    isSuspended?: boolean;
    activeAddons?: string[];
  } | null;
  allowSupportReadOnlyAccess: boolean;
  supportAccessGrantedUntil: string | null;
}

const getPlatformAccessToken = async (): Promise<string> => {
  const client = await getPlatformSession();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(`بازیابی نشست پلتفرم ناموفق بود: ${error.message}`);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('نشست معتبر پلتفرمی پیدا نشد.');
  return accessToken;
};

async function callPlatformApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getPlatformAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  const result = await response.json().catch(() => null) as { error?: string } & T | null;
  if (!response.ok || !result) {
    throw new Error(result?.error || `درخواست پلتفرم ناموفق بود (HTTP ${response.status}).`);
  }
  return result;
}

const getPlatformSession = async (allowedTiers?: AdminTier[]) => {
  if (!getSupabaseConfig().isConfigured) {
    throw new Error('اتصال ابری برای پرونده مشترک پشتیبانی پیکربندی نشده است.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(`اعتبارسنجی نشست پشتیبانی ناموفق بود: ${error.message}`);
  const role = data.user?.app_metadata?.role;
  if (!data.user || !['super_admin', 'hubino_support'].includes(role)) {
    throw new Error('برای استفاده از پرونده پشتیبانی، نشست معتبر پلتفرمی لازم است.');
  }
  const rawTier = (['founder', 'support', 'billing', 'sre'] as const).find(
    value => value === data.user?.app_metadata?.admin_tier
  ) || (role === 'super_admin' ? 'founder' : 'support');
  const tier: AdminTier = role === 'super_admin'
    ? 'founder'
    : (rawTier === 'billing' || rawTier === 'sre' ? rawTier : 'support');
  if (allowedTiers && !allowedTiers.includes(tier)) {
    throw new Error('این عملیات برای سطح دسترسی اپراتور شما مجاز نیست.');
  }

  return client;
};

export async function listPlatformOperators(): Promise<PlatformOperator[]> {
  const result = await callPlatformApi<{ operators: PlatformOperator[] }>('/api/admin/operators');
  if (!Array.isArray(result.operators)) throw new Error('فهرست اپراتورهای پلتفرم پاسخ معتبری ندارد.');
  return result.operators;
}

export async function updatePlatformOperatorRole(
  email: string,
  role: PlatformOperatorRole,
  adminTier?: AdminTier | null
): Promise<PlatformOperator> {
  const result = await callPlatformApi<{ operator: PlatformOperator }>('/api/admin/operators/role', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), role, adminTier })
  });
  if (!result.operator?.id) throw new Error('پاسخ تغییر نقش اپراتور معتبر نیست.');
  return result.operator;
}

export async function listPlatformTenantsSummary(): Promise<PlatformTenantSummary[]> {
  const result = await callPlatformApi<{ tenants: PlatformTenantSummary[] }>('/api/admin/tenants-summary');
  if (!Array.isArray(result.tenants)) throw new Error('فهرست مستأجران پاسخ معتبری ندارد.');
  return result.tenants;
}

export async function startPlatformImpersonation(tenantId: string, reason?: string): Promise<{ consentGranted: boolean }> {
  const result = await callPlatformApi<{ consentGranted: boolean }>('/api/admin/impersonation/start', {
    method: 'POST',
    body: JSON.stringify({ tenantId, reason })
  });
  if (typeof result.consentGranted !== 'boolean') {
    throw new Error('پاسخ ثبت ممیزی مشاهده مستأجر معتبر نیست.');
  }
  return { consentGranted: result.consentGranted };
}

export async function listSupportNotes(tenantId: string): Promise<SupportNote[]> {
  const client = await getPlatformSession(['founder', 'support']);
  const { data, error } = await client
    .from('platform_support_notes')
    .select('id, tenant_id, created_by, category, content, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`بارگذاری پرونده تماس‌ها ناموفق بود: ${error.message}`);

  return (data || []).map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    authorId: row.created_by,
    timestamp: row.created_at,
    category: row.category,
    content: row.content
  }));
}

export async function addSupportNote(
  tenantId: string,
  category: SupportNoteCategory,
  content: string
): Promise<SupportNote> {
  const client = await getPlatformSession(['founder', 'support']);
  const { data, error } = await client
    .from('platform_support_notes')
    .insert({ tenant_id: tenantId, category, content: content.trim() })
    .select('id, tenant_id, created_by, category, content, created_at')
    .single();

  if (error) throw new Error(`ثبت یادداشت تماس ناموفق بود: ${error.message}`);

  return {
    id: data.id,
    tenantId: data.tenant_id,
    authorId: data.created_by,
    timestamp: data.created_at,
    category: data.category,
    content: data.content
  };
}

export async function issuePlatformLicense(
  tenantId: string,
  plan: 'starter' | 'professional' | 'enterprise',
  durationDays: number
): Promise<{ serialKey: string; expiresAt: string | null; isLifetime: boolean }> {
  await getPlatformSession(['founder', 'billing']);
  const result = await callPlatformApi<{
    serial_key: string;
    expires_at: string | null;
    is_lifetime: boolean;
  }>('/api/admin/licenses/issue', {
    method: 'POST',
    body: JSON.stringify({ tenantId, plan, durationDays })
  });
  if (!result.serial_key) throw new Error('سرویس صدور لایسنس پاسخ معتبری برنگرداند.');
  return {
    serialKey: result.serial_key,
    expiresAt: result.expires_at,
    isLifetime: result.is_lifetime
  };
}

export async function issuePlatformAddonLicense(
  tenantId: string,
  addonId: string,
  durationDays = 365
): Promise<{ serialKey: string; expiresAt: string }> {
  await getPlatformSession(['founder', 'billing']);
  const result = await callPlatformApi<{
    serial_key: string;
    expires_at: string;
  }>('/api/admin/licenses/issue-addon', {
    method: 'POST',
    body: JSON.stringify({ tenantId, addonId, durationDays })
  });
  if (!result.serial_key || !result.expires_at) throw new Error('سرویس صدور افزونه پاسخ معتبری برنگرداند.');
  return { serialKey: result.serial_key, expiresAt: result.expires_at };
}
