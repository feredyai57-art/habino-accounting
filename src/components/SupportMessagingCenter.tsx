import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Archive, ArchiveRestore, Bot, Headphones, Loader2, Mail, MailOpen, MessageCircle, Plus, Send, UserRound, Wrench } from 'lucide-react';
import { useAccounting } from '../lib/store';
import { getSupabaseClient } from '../lib/supabase';
import { collectSanitizedDiagnosticsBundle, formatDiagnosticBundleForSupport } from '../lib/clientDiagnosticsBundle';
import { SUPPORT_MACROS } from '../lib/supportMacros';
import { listSupportNotes, SupportNote, SupportNoteCategory } from '../lib/platformSupportService';
import { listSystemAuditEvents, SystemAuditEvent } from '../lib/systemAuditService';
import {
  closeSupportConversation,
  createSupportConversation,
  getSupportSenderProfiles,
  handoffSupportConversation,
  listSupportConversations,
  listSupportMessages,
  markSupportConversationRead,
  requestSupportAssistantReply,
  reopenSupportConversation,
  sendSupportMessage,
  SupportConversation,
  SupportMessage,
  SupportSenderProfile
} from '../lib/supportMessagingService';
import { Tenant } from '../types';

interface SupportMessagingCenterProps {
  mode: 'tenant' | 'support';
  tenants?: Tenant[];
  onRequestReadOnlyPreview?: (tenantId: string, reason: string) => void | Promise<void>;
  onQuickCreateSupportNote?: (
    tenantId: string,
    category: SupportNoteCategory,
    content: string
  ) => Promise<SupportNote>;
}

const statusLabels: Record<SupportConversation['status'], string> = {
  open: 'در انتظار پاسخ',
  waiting_human: 'ارجاع به کارشناس',
  answered: 'پاسخ داده‌شده',
  closed: 'بسته‌شده'
};

const getWaitLabel = (timestamp: string): string => {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (elapsedMinutes < 60) return `در انتظار پاسخ: ${elapsedMinutes.toLocaleString('fa-IR')} دقیقه`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `در انتظار پاسخ: ${elapsedHours.toLocaleString('fa-IR')} ساعت`;
  return `در انتظار پاسخ: ${Math.floor(elapsedHours / 24).toLocaleString('fa-IR')} روز`;
};

const SupportMessagingCenter: React.FC<SupportMessagingCenterProps> = ({
  mode,
  tenants = [],
  onRequestReadOnlyPreview,
  onQuickCreateSupportNote
}) => {
  const { activeTenant, currentUser } = useAccounting();
  const isSupport = mode === 'support';
  const tenantId = isSupport ? undefined : activeTenant?.id;
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, SupportSenderProfile>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAssistantWorking, setIsAssistantWorking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [inboxView, setInboxView] = useState<'active' | 'archive'>('active');
  const [needsExpertOnly, setNeedsExpertOnly] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');
  const [previewReason, setPreviewReason] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [quickNoteCategory, setQuickNoteCategory] = useState<SupportNoteCategory>('onboarding');
  const [quickNoteContent, setQuickNoteContent] = useState('');
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [supportNotes, setSupportNotes] = useState<SupportNote[]>([]);
  const [supportEvents, setSupportEvents] = useState<SystemAuditEvent[]>([]);
  const [contextError, setContextError] = useState('');
  const resolvedSenderIds = useRef(new Set<string>());

  const selectedConversation = useMemo(
    () => conversations.find(conversation => conversation.id === selectedId) || null,
    [conversations, selectedId]
  );
  const tenantNames = useMemo(
    () => new Map(tenants.map(tenant => [tenant.id, tenant.name])),
    [tenants]
  );
  const tenantsById = useMemo(
    () => new Map(tenants.map(tenant => [tenant.id, tenant])),
    [tenants]
  );
  const previewTenant = selectedConversation ? tenantsById.get(selectedConversation.tenant_id) : undefined;
  const previewConsentUntil = previewTenant?.metadata.supportAccessGrantedUntil;
  const previewConsentActive = previewTenant?.metadata.allowSupportReadOnlyAccess === true &&
    !!previewConsentUntil &&
    new Date(previewConsentUntil).getTime() > Date.now();
  const visibleConversations = useMemo(() => {
    const query = tenantSearch.trim().toLocaleLowerCase();
    const filtered = conversations.filter(conversation => {
      if (!isSupport) return true;
      if (inboxView === 'archive') return conversation.status === 'closed';
      if (conversation.status === 'closed') return false;
      if (needsExpertOnly && conversation.status !== 'waiting_human') return false;
      if (!query) return true;
      const tenant = tenantsById.get(conversation.tenant_id);
      return [
        tenant?.name,
        tenant?.ownerName,
        tenant?.ownerPhone,
        conversation.subject
      ].some(value => value?.toLocaleLowerCase().includes(query));
    });
    if (!isSupport || inboxView === 'archive') return filtered;
    return filtered.sort((left, right) => {
      const leftPriority = left.status === 'waiting_human' ? 0 : 1;
      const rightPriority = right.status === 'waiting_human' ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return new Date(left.last_message_at || left.updated_at).getTime() -
        new Date(right.last_message_at || right.updated_at).getTime();
    });
  }, [conversations, inboxView, isSupport, needsExpertOnly, tenantSearch, tenantsById]);

  const refreshConversations = useCallback(async () => {
    const rows = await listSupportConversations(tenantId, isSupport);
    setConversations(rows);
    setSelectedId(current => current && rows.some(row => row.id === current)
      ? current
      : (isSupport ? null : rows[0]?.id || null));
  }, [tenantId, isSupport]);

  const refreshMessages = useCallback(async (conversationId: string) => {
    const rows = await listSupportMessages(conversationId);
    setMessages(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listSupportConversations(tenantId, isSupport)
      .then(rows => {
        if (cancelled) return;
        setConversations(rows);
        setSelectedId(current => current && rows.some(row => row.id === current)
          ? current
          : (isSupport ? null : rows[0]?.id || null));
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'بارگذاری درخواست‌های پشتیبانی ناموفق بود.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const conversationsChannel = getSupabaseClient()
      .channel(`support-conversations-${isSupport ? 'inbox' : tenantId || 'none'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_conversations',
        ...(!isSupport ? { filter: `tenant_id=eq.${tenantId}` } : {})
      }, () => {
        void refreshConversations();
      })
      .subscribe();
    return () => {
      cancelled = true;
      void getSupabaseClient().removeChannel(conversationsChannel);
    };
  }, [tenantId, isSupport, refreshConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listSupportMessages(selectedId);
        if (cancelled) return;
        setMessages(rows);

        if (isSupport) {
          const senderIds = [...new Set(rows
            .filter(message => message.sender_type === 'tenant' && message.sender_id)
            .map(message => message.sender_id)
            .filter((id): id is string => typeof id === 'string' && !resolvedSenderIds.current.has(id)))];
          if (senderIds.length > 0) {
            const profiles = await getSupportSenderProfiles(selectedId, senderIds);
            if (cancelled) return;
            setSenderProfiles(current => {
              const next = { ...current };
              profiles.forEach(profile => { next[profile.id] = profile; });
              return next;
            });
            profiles.forEach(profile => resolvedSenderIds.current.add(profile.id));
            senderIds.forEach(id => resolvedSenderIds.current.add(id));
          }
          await markSupportConversationRead(selectedId);
          await refreshConversations();
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'بارگذاری پیام‌ها یا نام فرستنده‌ها ناموفق بود.');
      }
    };

    void load();
    const channel = getSupabaseClient()
      .channel(`support-messages-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `conversation_id=eq.${selectedId}`
      }, () => {
        void load();
      })
      .subscribe();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void getSupabaseClient().removeChannel(channel);
    };
  }, [selectedId, refreshConversations, isSupport]);

  useEffect(() => {
    if (!isSupport || !selectedConversation?.tenant_id) {
      setSupportNotes([]);
      setSupportEvents([]);
      setContextError('');
      return;
    }

    let cancelled = false;
    setContextError('');
    Promise.all([
      listSupportNotes(selectedConversation.tenant_id),
      listSystemAuditEvents(selectedConversation.tenant_id)
    ]).then(([notes, events]) => {
      if (cancelled) return;
      setSupportNotes(notes.slice(0, 3));
      setSupportEvents(events.filter(event =>
        event.outcome === 'failed' ||
        /ERROR|FAILED|SYNC/i.test(event.action)
      ).slice(0, 5));
    }).catch(cause => {
      if (!cancelled) {
        setContextError(cause instanceof Error ? cause.message : 'بارگذاری پرونده فنی مستأجر ناموفق بود.');
        setSupportNotes([]);
        setSupportEvents([]);
      }
    });
    return () => { cancelled = true; };
  }, [isSupport, selectedConversation?.tenant_id]);

  const handleAssistantReply = async (conversationId: string, messageId: string) => {
    setIsAssistantWorking(true);
    try {
      await requestSupportAssistantReply(conversationId, messageId);
      await Promise.all([refreshMessages(conversationId), refreshConversations()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'پاسخ دستیار آماده نشد؛ می‌توانید گفتگو را به کارشناس ارجاع دهید.');
    } finally {
      setIsAssistantWorking(false);
    }
  };

  const handleNewConversation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser?.id || !tenantId || !subject.trim() || !draft.trim()) return;

    setIsCreating(true);
    setError('');
    try {
      const conversation = await createSupportConversation(subject, draft);
      setSubject('');
      setDraft('');
      setIsNewConversation(false);
      setSelectedId(conversation.id);
      await refreshConversations();
      const firstMessage = (await listSupportMessages(conversation.id))[0];
      if (firstMessage) await handleAssistantReply(conversation.id, firstMessage.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ایجاد درخواست پشتیبانی ناموفق بود.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAttachDiagnostics = async (diagnosticTenantId = tenantId) => {
    if (!diagnosticTenantId || diagnosticLoading) return;
    setDiagnosticLoading(true);
    setError('');
    try {
      const bundle = await collectSanitizedDiagnosticsBundle(diagnosticTenantId);
      const diagnosticText = formatDiagnosticBundleForSupport(bundle);
      const marker = '--- گزارش فنی هابینو (بدون اطلاعات مالی) ---';
      const message = draft.split(marker)[0].trim();
      setDraft(`${message ? `${message}\n\n` : ''}${diagnosticText}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تهیهٔ بستهٔ عیب‌یابی فنی ناموفق بود.');
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const handleQuickCreateNote = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetTenantId = selectedConversation?.tenant_id;
    if (!targetTenantId || !onQuickCreateSupportNote || !quickNoteContent.trim() || quickNoteSaving) return;
    setQuickNoteSaving(true);
    setError('');
    try {
      const note = await onQuickCreateSupportNote(targetTenantId, quickNoteCategory, quickNoteContent.trim());
      setSupportNotes(notes => [note, ...notes.filter(item => item.id !== note.id)].slice(0, 3));
      setQuickNoteContent('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت یادداشت تماس ناموفق بود.');
    } finally {
      setQuickNoteSaving(false);
    }
  };

  const appendReferralMarker = () => {
    const marker = '[ارجاع به تیم فنی/لایسنس]';
    setDraft(current => current.includes(marker) ? current : `${current.trim()}${current.trim() ? '\n\n' : ''}${marker}`);
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedConversation || !currentUser?.id || !draft.trim() || isSending) return;

    const messageContent = draft.trim();
    setDraft('');
    setIsSending(true);
    setError('');
    try {
      const message = await sendSupportMessage(
        selectedConversation,
        isSupport ? 'support' : 'tenant',
        currentUser.id,
        messageContent
      );
      await Promise.all([refreshMessages(selectedConversation.id), refreshConversations()]);
      if (!isSupport && selectedConversation.status === 'open') {
        await handleAssistantReply(selectedConversation.id, message.id);
      }
    } catch (cause) {
      setDraft(messageContent);
      setError(cause instanceof Error ? cause.message : 'ارسال پیام ناموفق بود.');
    } finally {
      setIsSending(false);
    }
  };

  const handleHandoff = async () => {
    if (!selectedConversation) return;
    setError('');
    try {
      await handoffSupportConversation(selectedConversation.id);
      await refreshConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ارجاع گفتگو به کارشناس ناموفق بود.');
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedId(conversationId);
    setIsNewConversation(false);
    setPreviewReason('');
    setError('');
    if (!isSupport) return;

    try {
      await markSupportConversationRead(conversationId);
      await refreshConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت وضعیت خوانده‌شدن گفتگو ناموفق بود.');
    }
  };

  const handleReadOnlyPreview = async () => {
    if (!selectedConversation || !onRequestReadOnlyPreview || previewLoading) return;
    setPreviewLoading(true);
    setError('');
    try {
      await onRequestReadOnlyPreview(selectedConversation.tenant_id, previewReason.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'شروع مشاهدهٔ فقط‌خواندنی ناموفق بود.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClose = async () => {
    if (!selectedConversation) return;
    setError('');
    try {
      await closeSupportConversation(selectedConversation.id);
      await refreshConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بستن درخواست ناموفق بود.');
    }
  };

  const handleReopen = async () => {
    if (!selectedConversation) return;
    setError('');
    try {
      await reopenSupportConversation(selectedConversation.id);
      setInboxView('active');
      await refreshConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بازگردانی درخواست از بایگانی ناموفق بود.');
    }
  };

  const canSend = Boolean(selectedConversation && selectedConversation.status !== 'closed' && draft.trim());
  const canHandoff = !isSupport && selectedConversation &&
    (selectedConversation.status === 'open' || selectedConversation.status === 'answered');
  const activeInboxCount = conversations.filter(conversation => conversation.status !== 'closed').length;
  const archivedInboxCount = conversations.filter(conversation => conversation.status === 'closed').length;
  const unreadInboxCount = conversations.filter(conversation => conversation.status !== 'closed' && conversation.is_unread).length;

  return (
    <section
      className={isSupport
        ? 'flex min-h-[65vh] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:h-[calc(100vh-6.5rem)]'
        : 'rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6'}
      dir="rtl"
    >
      {!isSupport && (
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-800">
              <MessageCircle className="h-5 w-5 text-teal-600" />
              پشتیبانی هابینو
            </h2>
            <p className="mt-1 text-xs text-slate-500">پرسش خود را مطرح کنید؛ در صورت نیاز آن را به کارشناس ارجاع دهید.</p>
          </div>
          <button
            type="button"
            onClick={() => { setIsNewConversation(value => !value); setDraft(''); setError(''); }}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            درخواست جدید
          </button>
        </header>
      )}

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isSupport && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
          دستیار هوشمند فقط راهنمایی می‌کند و به اسناد یا عملیات مالی دسترسی ندارد. پیام‌های درخواست به سرویس هوش مصنوعی پیکربندی‌شده برای هابینو ارسال می‌شوند؛ رمز، کد یک‌بارمصرف یا اطلاعات محرمانهٔ بانکی را وارد نکنید.
        </p>
      )}

      <div className={isSupport
        ? `grid flex-1 min-h-0 gap-3 ${selectedConversation ? 'lg:grid-cols-[minmax(0,1fr)_300px_280px]' : 'lg:grid-cols-[minmax(0,1fr)_300px]'}`
        : 'grid min-h-[440px] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'}>
        <div className={`${isSupport ? 'flex min-h-0 flex-col' : 'flex min-h-[440px] flex-col'} overflow-hidden rounded-2xl border border-slate-200`}>
          {isNewConversation && !isSupport ? (
            <form onSubmit={handleNewConversation} className="flex flex-1 flex-col gap-3 p-4">
              <h3 className="font-bold text-slate-800">ثبت درخواست پشتیبانی</h3>
              <input
                value={subject}
                onChange={event => setSubject(event.target.value)}
                maxLength={160}
                required
                placeholder="موضوع درخواست"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
              />
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                maxLength={4000}
                required
                rows={7}
                placeholder="شرح پرسش یا مشکلی که با آن روبه‌رو شده‌اید..."
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handleAttachDiagnostics()}
                  disabled={diagnosticLoading || isCreating}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800 disabled:opacity-50"
                >
                  {diagnosticLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                  پیوست وضعیت فنی سیستم (بدون اطلاعات مالی)
                </button>
                <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsNewConversation(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">انصراف</button>
                <button disabled={isCreating || !subject.trim() || !draft.trim()} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  ارسال درخواست
                </button>
                </div>
              </div>
            </form>
          ) : selectedConversation ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
                <div>
                  <h3 className="font-bold text-slate-800">{selectedConversation.subject}</h3>
                  {isSupport && <p className="mt-1 text-[10px] text-slate-500">مستأجر: {tenantNames.get(selectedConversation.tenant_id) || selectedConversation.tenant_id}</p>}
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{statusLabels[selectedConversation.status]}</span>
              </div>
              {isSupport && (
                <div className="space-y-2 border-b border-slate-100 bg-slate-50 p-3">
                  <p className="text-[10px] font-black text-slate-600">گام ۲ · اقدام سریع</p>
                  <div className="flex flex-wrap gap-2">
                    {onRequestReadOnlyPreview && (
                      <div className="flex min-w-[220px] flex-1 gap-2">
                        <input
                          value={previewReason}
                          onChange={event => setPreviewReason(event.target.value)}
                          maxLength={180}
                          placeholder="دلیل مشاهدهٔ فقط‌خواندنی"
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px]"
                          aria-label="دلیل مشاهده فقط‌خواندنی"
                        />
                        <button
                          type="button"
                          disabled={previewLoading || (!previewConsentActive && previewReason.trim().length < 8)}
                          onClick={() => void handleReadOnlyPreview()}
                          className="rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50"
                        >
                          {previewLoading ? 'در حال مشاهده...' : '۱. مشاهده صفحه کاربر (فقط‌خواندنی)'}
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={diagnosticLoading}
                      onClick={() => void handleAttachDiagnostics(selectedConversation.tenant_id)}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-bold text-sky-800 disabled:opacity-50"
                    >
                      {diagnosticLoading ? 'در حال دریافت...' : '۲. دریافت وضعیت فنی'}
                    </button>
                    <button
                      type="button"
                      onClick={appendReferralMarker}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800"
                    >
                      ۳. ارجاع به فنی / لایسنس
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500">برای مشاهده، دلیل کوتاه ثبت کنید؛ گزارش فنی بدون اطلاعات مالی به متن پاسخ افزوده می‌شود.</p>
                </div>
              )}
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4">
                {messages.map(message => {
                  const isOwn = isSupport ? message.sender_type === 'support' : message.sender_type === 'tenant';
                  const senderProfile = message.sender_id ? senderProfiles[message.sender_id] : undefined;
                  const name = message.sender_type === 'assistant'
                    ? 'دستیار هابینو'
                    : message.sender_type === 'support'
                      ? (isOwn && message.sender_id === currentUser?.id ? currentUser.fullName : 'کارشناس هابینو')
                      : isSupport
                        ? senderProfile?.fullName || 'مستأجر'
                        : 'شما';
                  return (
                    <div key={message.id} className={`flex ${isOwn ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-sm leading-6 ${
                        isOwn ? 'rounded-tr-sm bg-teal-600 text-white' :
                          message.sender_type === 'assistant' ? 'rounded-tl-sm border border-violet-100 bg-violet-50 text-slate-800' :
                            'rounded-tl-sm border border-slate-200 bg-white text-slate-800'
                      }`}>
                        <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold ${isOwn ? 'text-teal-50' : 'text-slate-500'}`}>
                          {senderProfile?.avatarUrl && message.sender_type === 'tenant' && isSupport ? (
                            <img src={senderProfile.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                          ) : message.sender_type === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : message.sender_type === 'support' ? <Headphones className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                          {name}
                        </div>
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        <time className={`mt-1 block text-left text-[9px] ${isOwn ? 'text-teal-100' : 'text-slate-400'}`}>
                          {new Date(message.created_at).toLocaleString('fa-IR')}
                        </time>
                      </div>
                    </div>
                  );
                })}
                {isAssistantWorking && (
                  <div className="flex items-center gap-2 text-xs text-violet-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    دستیار در حال آماده‌سازی پاسخ است...
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 p-3">
                {selectedConversation.status === 'closed' ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="py-2 text-xs text-slate-500">این گفتگو بایگانی شده و سوابق آن حفظ شده است.</p>
                    {isSupport && (
                      <button type="button" onClick={() => void handleReopen()} className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-2 text-[10px] font-bold text-teal-700 hover:bg-teal-100">
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        بازگردانی
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {isSupport && (
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-600">پاسخ آماده:</span>
                        {SUPPORT_MACROS.map(macro => (
                          <button
                            key={macro.id}
                            type="button"
                            onClick={() => setDraft(macro.content)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-700 hover:bg-teal-50"
                          >
                            {macro.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleSend} className="flex items-end gap-2">
                      <textarea
                        value={draft}
                        onChange={event => setDraft(event.target.value)}
                        maxLength={4000}
                        rows={2}
                        placeholder={isSupport ? 'پاسخ کارشناس...' : selectedConversation.status === 'waiting_human' ? 'پیام برای کارشناس...' : 'پیام خود را بنویسید...'}
                        className="min-h-[48px] flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                      />
                      <button type="submit" disabled={!canSend || isSending} aria-label="ارسال پیام" className="rounded-xl bg-teal-600 p-3 text-white hover:bg-teal-700 disabled:opacity-50">
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </form>
                  </>
                )}
                <div className="mt-2 flex justify-between">
                  {canHandoff ? (
                    <button type="button" onClick={() => void handleHandoff()} className="text-[10px] font-bold text-amber-700 hover:text-amber-900">
                      درخواست پاسخ کارشناس
                    </button>
                  ) : <span />}
                  {isSupport && selectedConversation.status !== 'closed' && (
                    <button type="button" onClick={() => void handleClose()} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-rose-600">
                      <Archive className="h-3.5 w-3.5" />
                      بایگانی گفتگو
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
              <MessageCircle className="h-10 w-10" />
              <p className="text-sm">{loading ? 'در حال بارگذاری...' : 'گفتگویی انتخاب نشده است.'}</p>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          )}
        </div>

        <aside className={`${isSupport ? 'flex min-h-0 flex-col' : ''} overflow-hidden rounded-2xl border border-slate-200`}>
          {isSupport ? (
            <div className="border-b border-slate-100 p-2">
              <p className="mb-2 px-1 text-[10px] font-black text-slate-600">گام ۱ · صف و جستجوی تماس‌گیرنده</p>
              <input
                value={tenantSearch}
                onChange={event => setTenantSearch(event.target.value)}
                placeholder="نام کسب‌وکار یا موبایل مالک"
                aria-label="جستجوی مستأجر بر اساس نام یا موبایل مالک"
                className="mb-2 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] outline-none focus:border-teal-500"
              />
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => { setInboxView('active'); setNeedsExpertOnly(false); setSelectedId(null); }}
                  className={`rounded-lg px-2 py-2 text-[10px] font-bold transition-colors ${inboxView === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  همه تیکت‌های باز ({activeInboxCount})
                  {unreadInboxCount > 0 && <span className="mr-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-700">{unreadInboxCount} خوانده‌نشده</span>}
                </button>
                <button
                  type="button"
                  onClick={() => { setInboxView('archive'); setNeedsExpertOnly(false); setSelectedId(null); }}
                  className={`rounded-lg px-2 py-2 text-[10px] font-bold transition-colors ${inboxView === 'archive' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  بایگانی ({archivedInboxCount})
                </button>
              </div>
              {inboxView === 'active' && (
                <button
                  type="button"
                  aria-pressed={needsExpertOnly}
                  onClick={() => setNeedsExpertOnly(value => !value)}
                  className={`mt-2 w-full rounded-lg px-2 py-2 text-[10px] font-bold ${needsExpertOnly ? 'bg-amber-100 text-amber-900' : 'bg-white text-slate-600'}`}
                >
                  نیاز به پاسخ پشتیبان ({conversations.filter(conversation => conversation.status === 'waiting_human').length})
                </button>
              )}
            </div>
          ) : (
            <div className="border-b border-slate-100 px-4 py-3 text-xs font-bold text-slate-700">گفتگوهای من</div>
          )}
          <div className={isSupport ? 'min-h-0 flex-1 overflow-y-auto' : 'max-h-[440px] overflow-y-auto'}>
            {visibleConversations.map(conversation => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void handleSelectConversation(conversation.id)}
                className={`w-full border-b border-slate-100 px-4 py-3 text-right transition-colors hover:bg-teal-50 ${
                  selectedId === conversation.id ? 'bg-teal-50' : 'bg-white'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="block truncate text-xs font-bold text-slate-700">{conversation.subject}</span>
                  {isSupport && conversation.is_unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" title="خوانده‌نشده" />}
                </span>
                {isSupport && <span className="mt-1 block truncate text-[10px] text-slate-500">{tenantNames.get(conversation.tenant_id) || conversation.tenant_id}</span>}
                {isSupport && (conversation.status === 'open' || conversation.status === 'waiting_human') && (
                  <span className="mt-1 block text-[9px] font-semibold text-amber-700">
                    {getWaitLabel(conversation.last_message_at || conversation.updated_at)}
                  </span>
                )}
                {conversation.last_message_preview && (
                  <span className="mt-1 block truncate text-[10px] text-slate-400">{conversation.last_message_preview}</span>
                )}
                <span className="mt-2 flex items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${isSupport && conversation.is_answered ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {isSupport ? conversation.is_answered ? 'پاسخ داده‌شده' : 'پاسخ داده‌نشده' : statusLabels[conversation.status]}
                    </span>
                    {isSupport && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${conversation.is_unread ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {conversation.is_unread ? <Mail className="h-3 w-3" /> : <MailOpen className="h-3 w-3" />}
                        {conversation.is_unread ? 'خوانده‌نشده' : 'خوانده‌شده'}
                      </span>
                    )}
                  </span>
                  <time className="shrink-0 text-[9px] text-slate-400">{new Date(conversation.last_message_at || conversation.updated_at).toLocaleDateString('fa-IR')}</time>
                </span>
              </button>
            ))}
            {!loading && visibleConversations.length === 0 && (
              <p className="p-5 text-center text-xs text-slate-400">
                {isSupport ? inboxView === 'archive' ? 'درخواستی در بایگانی نیست.' : 'درخواست فعالی وجود ندارد.' : 'هنوز درخواستی ثبت نشده است.'}
              </p>
            )}
          </div>
        </aside>
        {isSupport && selectedConversation && (
          <aside className="flex min-h-0 flex-col space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
            {(() => {
              const tenant = tenantsById.get(selectedConversation.tenant_id);
              const subscription = tenant?.subscription;
              const consentActive = tenant?.metadata.allowSupportReadOnlyAccess === true &&
                !!tenant.metadata.supportAccessGrantedUntil &&
                new Date(tenant.metadata.supportAccessGrantedUntil).getTime() > Date.now();
              return (
                <section className="space-y-1.5 border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black text-slate-800">گام ۳ · پروندهٔ ۳۶۰ درجه</h3>
                  <p className="text-[11px] font-bold text-slate-700">{tenant?.name || selectedConversation.tenant_id}</p>
                  <p className="text-[10px] text-slate-500">مالک: {tenant?.ownerName || 'ثبت‌نشده'}</p>
                  <p className="text-[10px] text-slate-500">موبایل: {tenant?.ownerPhone || 'ثبت‌نشده'}</p>
                  <p className="text-[10px] text-slate-500">پلن: {subscription?.planNameFa || 'نامشخص'}</p>
                  <p className={`text-[10px] font-semibold ${consentActive ? 'text-emerald-700' : 'text-amber-700'}`}>
                    مشاهدهٔ فقط‌خواندنی: {consentActive ? 'مجاز با رضایت مستأجر' : 'نیازمند ثبت دلیل'}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    وضعیت: {tenant?.status === 'suspended' || subscription?.isSuspended
                      ? 'تعلیق‌شده'
                      : subscription?.status === 'trial'
                        ? 'آزمایشی'
                        : subscription?.status || 'نامشخص'}
                  </p>
                  {typeof subscription?.trialDaysRemaining === 'number' && (
                    <p className="text-[10px] text-slate-500">روزهای باقی‌ماندهٔ آزمایشی: {subscription.trialDaysRemaining.toLocaleString('fa-IR')}</p>
                  )}
                </section>
              );
            })()}
            {onQuickCreateSupportNote && (
              <form onSubmit={handleQuickCreateNote} className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5">
                <h4 className="text-[10px] font-black text-slate-700">ثبت فوری نتیجه تماس / یادداشت</h4>
                <select
                  value={quickNoteCategory}
                  onChange={event => setQuickNoteCategory(event.target.value as SupportNoteCategory)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px]"
                  aria-label="دسته‌بندی یادداشت پشتیبانی"
                >
                  <option value="onboarding">راهنمایی اولیه</option>
                  <option value="license">لایسنس</option>
                  <option value="accounting_fix">اصلاح حسابداری</option>
                  <option value="bug_report">گزارش خطا</option>
                </select>
                <textarea
                  value={quickNoteContent}
                  onChange={event => setQuickNoteContent(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  required
                  placeholder="نتیجه تماس یا اقدام انجام‌شده..."
                  className="w-full resize-y rounded-lg border border-slate-200 bg-white p-2 text-[10px]"
                />
                <button type="submit" disabled={quickNoteSaving || !quickNoteContent.trim()} className="w-full rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">
                  {quickNoteSaving ? 'در حال ثبت...' : 'ثبت یادداشت تماس'}
                </button>
              </form>
            )}
            {contextError && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-[10px] leading-5 text-rose-700">{contextError}</p>}
            <section>
              <h4 className="mb-2 text-[11px] font-bold text-slate-700">آخرین یادداشت‌های تماس</h4>
              {supportNotes.length ? supportNotes.map(note => (
                <article key={note.id} className="mb-2 rounded-lg bg-slate-50 p-2">
                  <p className="whitespace-pre-wrap text-[10px] leading-5 text-slate-700">{note.content}</p>
                  <time className="mt-1 block text-[9px] text-slate-400">{new Date(note.timestamp).toLocaleString('fa-IR')}</time>
                </article>
              )) : !contextError && <p className="text-[10px] text-slate-400">یادداشتی ثبت نشده است.</p>}
            </section>
            <section>
              <h4 className="mb-2 text-[11px] font-bold text-slate-700">خطاها و همگام‌سازی اخیر</h4>
              {supportEvents.length ? supportEvents.map(event => (
                <article key={event.id} className="mb-2 rounded-lg border border-amber-100 bg-amber-50 p-2">
                  <p className="text-[10px] font-bold text-amber-900">{event.action}</p>
                  <p className="mt-1 text-[9px] text-amber-800">{event.outcome} · {event.reasonCode || 'بدون کد علت'}</p>
                  <time className="mt-1 block text-[9px] text-amber-700">{new Date(event.createdAt).toLocaleString('fa-IR')}</time>
                </article>
              )) : !contextError && <p className="text-[10px] text-slate-400">رویداد خطا یا همگام‌سازی اخیر یافت نشد.</p>}
            </section>
          </aside>
        )}
      </div>
    </section>
  );
};

export default SupportMessagingCenter;
