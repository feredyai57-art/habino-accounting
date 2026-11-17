import { getSupabaseClient } from './supabase';

export type SupportConversationStatus = 'open' | 'waiting_human' | 'answered' | 'closed';
export type SupportMessageSender = 'tenant' | 'support' | 'assistant';

export interface SupportConversation {
  id: string;
  tenant_id: string;
  created_by: string;
  subject: string;
  status: SupportConversationStatus;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  last_message_at?: string | null;
  last_message_sender_type?: SupportMessageSender | null;
  last_message_preview?: string | null;
  last_read_at?: string | null;
  is_unread?: boolean;
  is_answered?: boolean;
}

export interface SupportMessage {
  id: string;
  conversation_id: string;
  tenant_id: string;
  sender_type: SupportMessageSender;
  sender_id: string | null;
  content: string;
  created_at: string;
}

export interface SupportSenderProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

const conversationsSelection = 'id,tenant_id,created_by,subject,status,created_at,updated_at,archived_at,last_message_at,last_message_sender_type,last_message_preview';
const messagesSelection = 'id,conversation_id,tenant_id,sender_type,sender_id,content,created_at';

function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

export async function listSupportConversations(tenantId: string | undefined, asSupport = false): Promise<SupportConversation[]> {
  if (asSupport) {
    const { data, error } = await getSupabaseClient().rpc('rpc_list_support_inbox');
    throwIfError(error);
    return (data || []) as SupportConversation[];
  }
  if (!tenantId) throw new Error('فضای کاری برای بارگذاری درخواست‌های پشتیبانی مشخص نیست.');

  let query = getSupabaseClient()
    .from('support_conversations')
    .select(conversationsSelection)
    .order('updated_at', { ascending: false })
    .limit(100);

  query = query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  throwIfError(error);
  return (data || []) as SupportConversation[];
}

export async function listSupportMessages(conversationId: string): Promise<SupportMessage[]> {
  const { data, error } = await getSupabaseClient()
    .from('support_messages')
    .select(messagesSelection)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  throwIfError(error);
  return (data || []) as SupportMessage[];
}

export async function getSupportSenderProfiles(
  conversationId: string,
  senderIds: string[]
): Promise<SupportSenderProfile[]> {
  if (senderIds.length === 0) return [];

  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  throwIfError(sessionError);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('نشست معتبر برای بازیابی پروفایل اعضا پیدا نشد.');

  const response = await fetch('/api/support/sender-profiles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ conversationId, senderIds })
  });
  const result = await response.json().catch(() => null) as {
    error?: string;
    profiles?: SupportSenderProfile[];
  } | null;
  if (!response.ok || !Array.isArray(result?.profiles)) {
    throw new Error(result?.error || 'بازیابی نام اعضای گفتگو ناموفق بود.');
  }
  return result.profiles;
}

export async function createSupportConversation(
  subject: string,
  content: string
): Promise<SupportConversation> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('rpc_create_support_conversation', {
    p_subject: subject.trim(),
    p_content: content.trim()
  });
  throwIfError(error);
  return data as SupportConversation;
}

export async function sendSupportMessage(
  conversation: SupportConversation,
  senderType: Extract<SupportMessageSender, 'tenant' | 'support'>,
  senderId: string,
  content: string
): Promise<SupportMessage> {
  const { data, error } = await getSupabaseClient()
    .from('support_messages')
    .insert({
      conversation_id: conversation.id,
      tenant_id: conversation.tenant_id,
      sender_type: senderType,
      sender_id: senderId,
      content: content.trim()
    })
    .select(messagesSelection)
    .single();
  throwIfError(error);
  return data as SupportMessage;
}

export async function handoffSupportConversation(conversationId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('rpc_request_support_handoff', {
    p_conversation_id: conversationId
  });
  throwIfError(error);
}

export async function closeSupportConversation(conversationId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('support_conversations')
    .update({ status: 'closed', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  throwIfError(error);
}

export async function reopenSupportConversation(conversationId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('support_conversations')
    .update({ status: 'waiting_human', archived_at: null, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  throwIfError(error);
}

export async function markSupportConversationRead(conversationId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('rpc_mark_support_conversation_read', {
    p_conversation_id: conversationId
  });
  throwIfError(error);
}

export async function requestSupportAssistantReply(
  conversationId: string,
  messageId: string
): Promise<void> {
  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  throwIfError(sessionError);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('نشست معتبر برای دستیار پشتیبانی پیدا نشد.');

  const response = await fetch('/api/support/ai-reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ conversationId, messageId })
  });
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(result?.error || 'دستیار پشتیبانی نتوانست پاسخ را آماده کند.');
  }
}
