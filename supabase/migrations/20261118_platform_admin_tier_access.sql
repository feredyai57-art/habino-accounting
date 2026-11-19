BEGIN;

CREATE OR REPLACE FUNCTION public.current_platform_admin_tier()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
    SELECT CASE
        WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN NULL
        WHEN auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin' THEN
            CASE
                WHEN auth.jwt() -> 'app_metadata' ->> 'admin_tier' IN ('founder', 'sre')
                    THEN auth.jwt() -> 'app_metadata' ->> 'admin_tier'
                ELSE 'founder'
            END
        WHEN auth.jwt() -> 'app_metadata' ->> 'role' = 'hubino_support' THEN
            CASE
                WHEN auth.jwt() -> 'app_metadata' ->> 'admin_tier' IN ('support', 'billing')
                    THEN auth.jwt() -> 'app_metadata' ->> 'admin_tier'
                ELSE 'support'
            END
        ELSE NULL
    END;
$function$;

REVOKE ALL ON FUNCTION public.current_platform_admin_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_platform_admin_tier() TO authenticated;

DROP POLICY IF EXISTS "platform_support_notes_select" ON public.platform_support_notes;
CREATE POLICY "platform_support_notes_select"
    ON public.platform_support_notes FOR SELECT TO authenticated
    USING (public.current_platform_admin_tier() IN ('founder', 'support'));

DROP POLICY IF EXISTS "platform_support_notes_insert" ON public.platform_support_notes;
CREATE POLICY "platform_support_notes_insert"
    ON public.platform_support_notes FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND public.current_platform_admin_tier() IN ('founder', 'support')
    );

DROP POLICY IF EXISTS system_audit_events_select ON public.system_audit_events;
CREATE POLICY system_audit_events_select
    ON public.system_audit_events FOR SELECT TO authenticated
    USING (
        tenant_id = auth.jwt() -> 'app_metadata' ->> 'tenant_id'
        OR public.current_platform_admin_tier() IN ('founder', 'sre')
    );

DO $migration$
BEGIN
    IF to_regclass('public.document_diagnostic_events') IS NOT NULL THEN
        EXECUTE 'DROP POLICY IF EXISTS document_diagnostic_events_select ON public.document_diagnostic_events';
        EXECUTE $policy$
            CREATE POLICY document_diagnostic_events_select
                ON public.document_diagnostic_events FOR SELECT TO authenticated
                USING (
                    created_at >= NOW() - INTERVAL '30 days'
                    AND (
                        tenant_id = public.current_tenant_id()
                        OR public.current_platform_admin_tier() IN ('founder', 'sre')
                    )
                )
        $policy$;
    END IF;
END;
$migration$;

DROP POLICY IF EXISTS tenant_pos_device_surveys_select ON public.tenant_pos_device_surveys;
CREATE POLICY tenant_pos_device_surveys_select
    ON public.tenant_pos_device_surveys FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR public.current_platform_admin_tier() IN ('founder', 'billing')
    );

DROP POLICY IF EXISTS support_conversations_select ON public.support_conversations;
CREATE POLICY support_conversations_select
    ON public.support_conversations FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR public.current_platform_admin_tier() IN ('founder', 'support')
    );

DROP POLICY IF EXISTS support_conversations_insert ON public.support_conversations;
CREATE POLICY support_conversations_insert
    ON public.support_conversations FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND created_by = auth.uid()
        AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('super_admin', 'hubino_support')
    );

DROP POLICY IF EXISTS support_conversations_update ON public.support_conversations;
CREATE POLICY support_conversations_update
    ON public.support_conversations FOR UPDATE TO authenticated
    USING (public.current_platform_admin_tier() IN ('founder', 'support'))
    WITH CHECK (public.current_platform_admin_tier() IN ('founder', 'support'));

DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select
    ON public.support_messages FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR public.current_platform_admin_tier() IN ('founder', 'support')
    );

DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;
CREATE POLICY support_messages_insert
    ON public.support_messages FOR INSERT TO authenticated
    WITH CHECK (
        (
            sender_type = 'tenant'
            AND sender_id = auth.uid()
            AND tenant_id = public.current_tenant_id()
            AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('super_admin', 'hubino_support')
            AND EXISTS (
                SELECT 1
                FROM public.support_conversations AS conversation
                WHERE conversation.id = support_messages.conversation_id
                  AND conversation.tenant_id = support_messages.tenant_id
                  AND conversation.status <> 'closed'
            )
        )
        OR (
            sender_type = 'support'
            AND sender_id = auth.uid()
            AND public.current_platform_admin_tier() IN ('founder', 'support')
            AND EXISTS (
                SELECT 1
                FROM public.support_conversations AS conversation
                WHERE conversation.id = support_messages.conversation_id
                  AND conversation.tenant_id = support_messages.tenant_id
                  AND conversation.status <> 'closed'
            )
        )
    );

DROP POLICY IF EXISTS support_conversation_reads_select ON public.support_conversation_reads;
CREATE POLICY support_conversation_reads_select
    ON public.support_conversation_reads FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        AND public.current_platform_admin_tier() IN ('founder', 'support')
    );

CREATE OR REPLACE FUNCTION public.rpc_list_support_inbox()
RETURNS TABLE (
    id UUID,
    tenant_id TEXT,
    created_by UUID,
    subject TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    last_message_sender_type TEXT,
    last_message_preview TEXT,
    last_read_at TIMESTAMPTZ,
    is_unread BOOLEAN,
    is_answered BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR auth.uid() IS NULL
       OR COALESCE(public.current_platform_admin_tier(), '') NOT IN ('founder', 'support') THEN
        RAISE EXCEPTION 'Support inbox is restricted to platform support staff.';
    END IF;

    RETURN QUERY
    SELECT
        conversation.id,
        conversation.tenant_id,
        conversation.created_by,
        conversation.subject,
        conversation.status,
        conversation.created_at,
        conversation.updated_at,
        conversation.archived_at,
        conversation.last_message_at,
        conversation.last_message_sender_type,
        conversation.last_message_preview,
        read_state.last_read_at,
        EXISTS (
            SELECT 1
            FROM public.support_messages AS unread_message
            WHERE unread_message.conversation_id = conversation.id
              AND unread_message.tenant_id = conversation.tenant_id
              AND unread_message.sender_type = 'tenant'
              AND (
                  read_state.last_read_at IS NULL
                  OR unread_message.created_at > read_state.last_read_at
              )
        ) AS is_unread,
        COALESCE(conversation.last_message_sender_type = 'support', FALSE) AS is_answered
    FROM public.support_conversations AS conversation
    LEFT JOIN public.support_conversation_reads AS read_state
      ON read_state.conversation_id = conversation.id
     AND read_state.user_id = auth.uid()
    ORDER BY COALESCE(conversation.last_message_at, conversation.updated_at) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_mark_support_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant_id TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR auth.uid() IS NULL
       OR COALESCE(public.current_platform_admin_tier(), '') NOT IN ('founder', 'support') THEN
        RAISE EXCEPTION 'Only platform support staff can mark inbox conversations as read.';
    END IF;

    SELECT conversation.tenant_id
    INTO v_tenant_id
    FROM public.support_conversations AS conversation
    WHERE conversation.id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Support conversation was not found.';
    END IF;

    INSERT INTO public.support_conversation_reads (conversation_id, tenant_id, user_id, last_read_at)
    VALUES (p_conversation_id, v_tenant_id, auth.uid(), NOW())
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET last_read_at = EXCLUDED.last_read_at;
END;
$function$;

COMMIT;
