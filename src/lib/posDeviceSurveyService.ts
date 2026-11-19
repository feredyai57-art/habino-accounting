import { getSupabaseClient, getSupabaseConfig } from './supabase';

export type PosTerminalType = 'traditional' | 'android_smart' | 'other' | 'unknown';
export type PosConnectionInfo = 'api_sdk' | 'local_driver' | 'no_api' | 'unknown';

export interface PosDeviceSurveyInput {
  paymentProvider: string;
  deviceBrand: string;
  deviceModel: string;
  terminalType: PosTerminalType;
  connectionInfo: PosConnectionInfo;
  deviceCount: number;
  notes: string;
}

export interface PosDeviceSurvey extends PosDeviceSurveyInput {
  id: string;
  tenantId: string;
  tenantName?: string;
  createdAt: string;
}

const requireAuthenticatedClient = async () => {
  if (!getSupabaseConfig().isConfigured) {
    throw new Error('برای ثبت و مشاهدهٔ اطلاعات پوز، اتصال ابری باید فعال باشد.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(`بررسی نشست کاربر ناموفق بود: ${error.message}`);
  if (!data.user) throw new Error('برای ثبت یا مشاهدهٔ اطلاعات پوز، ابتدا وارد حساب شوید.');
  return { client, user: data.user };
};

const mapSurvey = (row: any): PosDeviceSurvey => ({
  id: row.id,
  tenantId: row.tenant_id,
  tenantName: row.tenant_name || undefined,
  paymentProvider: row.payment_provider,
  deviceBrand: row.device_brand || '',
  deviceModel: row.device_model,
  terminalType: row.terminal_type,
  connectionInfo: row.connection_info,
  deviceCount: row.device_count,
  notes: row.notes || '',
  createdAt: row.created_at
});

export async function listTenantPosDeviceSurveys(tenantId: string): Promise<PosDeviceSurvey[]> {
  if (!tenantId || tenantId === 'all') throw new Error('فضای کاری مستأجر معتبر نیست.');
  const { client } = await requireAuthenticatedClient();
  const { data, error } = await client
    .from('tenant_pos_device_surveys')
    .select('id, tenant_id, tenant_name, payment_provider, device_brand, device_model, terminal_type, connection_info, device_count, notes, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`بارگذاری اطلاعات دستگاه‌های پوز ناموفق بود: ${error.message}`);
  return (data || []).map(mapSurvey);
}

export async function listAllPosDeviceSurveys(): Promise<PosDeviceSurvey[]> {
  const { client, user } = await requireAuthenticatedClient();
  const role = user.app_metadata?.role;
  const rawTier = user.app_metadata?.admin_tier;
  const adminTier = role === 'super_admin'
    ? 'founder'
    : role === 'hubino_support'
      ? (rawTier === 'billing' || rawTier === 'sre' ? rawTier : 'support')
      : null;
  if (adminTier !== 'founder' && adminTier !== 'billing') {
    throw new Error('مشاهدهٔ پاسخ‌های همهٔ مستأجران فقط برای بنیان‌گذار و کارشناس مالی مجاز است.');
  }

  const { data, error } = await client
    .from('tenant_pos_device_surveys')
    .select('id, tenant_id, tenant_name, payment_provider, device_brand, device_model, terminal_type, connection_info, device_count, notes, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`بارگذاری پاسخ‌های نیازسنجی پوز ناموفق بود: ${error.message}`);
  const { data: tenantRows, error: tenantError } = await client
    .from('tenants')
    .select('id, name');

  if (tenantError) throw new Error(`بازیابی نام مستأجران ناموفق بود: ${tenantError.message}`);
  const tenantNames = new Map((tenantRows || []).map((tenant: { id: string; name: string }) => [tenant.id, tenant.name]));
  return (data || []).map(row => ({
    ...mapSurvey(row),
    tenantName: tenantNames.get(row.tenant_id) || row.tenant_name || undefined
  }));
}

export async function addPosDeviceSurvey(
  tenantId: string,
  tenantName: string,
  input: PosDeviceSurveyInput
): Promise<PosDeviceSurvey> {
  if (!tenantId || tenantId === 'all') throw new Error('فضای کاری مستأجر معتبر نیست.');
  const { client } = await requireAuthenticatedClient();
  const { data, error } = await client
    .from('tenant_pos_device_surveys')
    .insert({
      tenant_id: tenantId,
      tenant_name: tenantName.trim(),
      payment_provider: input.paymentProvider.trim(),
      device_brand: input.deviceBrand.trim() || null,
      device_model: input.deviceModel.trim(),
      terminal_type: input.terminalType,
      connection_info: input.connectionInfo,
      device_count: input.deviceCount,
      notes: input.notes.trim() || null
    })
    .select('id, tenant_id, tenant_name, payment_provider, device_brand, device_model, terminal_type, connection_info, device_count, notes, created_at')
    .single();

  if (error) throw new Error(`ثبت اطلاعات دستگاه پوز ناموفق بود: ${error.message}`);
  return mapSurvey(data);
}
