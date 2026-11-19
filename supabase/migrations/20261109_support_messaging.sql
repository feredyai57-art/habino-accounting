BEGIN;

CREATE TABLE IF NOT EXISTS public.support_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    created_by UUID NOT NULL DEFAULT auth.uid(),
    subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 160),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'waiting_human', 'answered', 'closed')),
    archived_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    last_message_sender_type TEXT,
    last_message_preview TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, tenant_id)
);

ALTER TABLE public.support_conversations
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_message_sender_type TEXT,
    ADD COLUMN IF NOT EXISTS last_message_preview TEXT;

UPDATE public.support_conversations
SET archived_at = COALESCE(archived_at, updated_at, created_at)
WHERE status = 'closed'
  AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    tenant_id TEXT NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('tenant', 'support', 'assistant')),
    sender_id UUID,
    content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 4000),
    reply_to_message_id UUID REFERENCES public.support_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT support_messages_conversation_tenant_fk
        FOREIGN KEY (conversation_id, tenant_id)
        REFERENCES public.support_conversations(id, tenant_id)
        ON DELETE CASCADE
);

ALTER TABLE public.support_messages
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS conversation_id UUID,
    ADD COLUMN IF NOT EXISTS tenant_id TEXT,
    ADD COLUMN IF NOT EXISTS sender_type TEXT,
    ADD COLUMN IF NOT EXISTS sender_id UUID,
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS reply_to_message_id UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.support_messages
        WHERE conversation_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Existing support_messages rows have no conversation_id. Preserve and migrate those rows before rerunning this migration.';
    END IF;

    UPDATE public.support_messages AS message
    SET tenant_id = conversation.tenant_id
    FROM public.support_conversations AS conversation
    WHERE message.conversation_id = conversation.id
      AND message.tenant_id IS NULL;

    IF EXISTS (
        SELECT 1
        FROM public.support_messages
        WHERE tenant_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Existing support_messages rows could not be linked to a tenant. Preserve and migrate those rows before rerunning this migration.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'support_messages'
          AND column_name = 'message_text'
    ) THEN
        EXECUTE $migration$
            UPDATE public.support_messages
            SET content = message_text
            WHERE (content IS NULL OR content = '[پیام قدیمی؛ متن پیام در دسترس نیست]')
              AND message_text IS NOT NULL
              AND length(trim(message_text)) > 0
        $migration$;
    END IF;

    -- Older support message tables did not identify the sender. Preserve such
    -- rows as tenant-authored messages instead of dropping or misclassifying them.
    UPDATE public.support_messages
    SET sender_type = 'tenant'
    WHERE sender_type IS NULL;

    UPDATE public.support_messages
    SET content = '[پیام قدیمی؛ متن پیام در دسترس نیست]'
    WHERE content IS NULL;
END;
$$;

ALTER TABLE public.support_messages
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN id SET NOT NULL,
    ALTER COLUMN conversation_id SET NOT NULL,
    ALTER COLUMN tenant_id SET NOT NULL,
    ALTER COLUMN sender_type SET DEFAULT 'tenant',
    ALTER COLUMN sender_type SET NOT NULL,
    ALTER COLUMN content SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN created_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_support_message_legacy_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_new JSONB := to_jsonb(NEW);
    v_old JSONB;
    v_text TEXT;
BEGIN
    IF NOT (v_new ? 'message_text') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        IF v_new -> 'content' IS DISTINCT FROM v_old -> 'content' THEN
            v_text := v_new ->> 'content';
        ELSE
            v_text := v_new ->> 'message_text';
        END IF;
    ELSE
        v_text := COALESCE(v_new ->> 'content', v_new ->> 'message_text');
    END IF;

    IF v_text IS NULL OR length(trim(v_text)) = 0 THEN
        RAISE EXCEPTION 'Support message text cannot be empty.';
    END IF;

    v_new := jsonb_set(v_new, '{content}', to_jsonb(v_text), TRUE);
    v_new := jsonb_set(v_new, '{message_text}', to_jsonb(v_text), TRUE);
    NEW := jsonb_populate_record(NEW, v_new);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_sync_legacy_text ON public.support_messages;
CREATE TRIGGER support_messages_sync_legacy_text
    BEFORE INSERT OR UPDATE ON public.support_messages
    FOR EACH ROW EXECUTE FUNCTION public.sync_support_message_legacy_text();

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_messages_id_unique
    ON public.support_messages (id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_messages'::regclass
          AND conname = 'support_messages_sender_type_check'
    ) THEN
        ALTER TABLE public.support_messages
            ADD CONSTRAINT support_messages_sender_type_check
            CHECK (sender_type IN ('tenant', 'support', 'assistant'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_messages'::regclass
          AND conname IN (
              'support_messages_reply_to_message_id_fkey',
              'support_messages_reply_to_fk'
          )
    ) THEN
        ALTER TABLE public.support_messages
            ADD CONSTRAINT support_messages_reply_to_fk
            FOREIGN KEY (reply_to_message_id)
            REFERENCES public.support_messages(id)
            ON DELETE SET NULL;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.support_messages'::regclass
          AND conname = 'support_messages_conversation_tenant_fk'
    ) THEN
        ALTER TABLE public.support_messages
            ADD CONSTRAINT support_messages_conversation_tenant_fk
            FOREIGN KEY (conversation_id, tenant_id)
            REFERENCES public.support_conversations(id, tenant_id)
            ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_support_conversations_tenant_updated
    ON public.support_conversations (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_status_updated
    ON public.support_conversations (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation_created
    ON public.support_messages (conversation_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_messages_unique_ai_reply
    ON public.support_messages (reply_to_message_id)
    WHERE sender_type = 'assistant' AND reply_to_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_conversation_reads (
    conversation_id UUID NOT NULL,
    tenant_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT support_conversation_reads_conversation_fk
        FOREIGN KEY (conversation_id, tenant_id)
        REFERENCES public.support_conversations(id, tenant_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_conversation_reads_user
    ON public.support_conversation_reads (user_id, last_read_at DESC);

CREATE OR REPLACE FUNCTION public.touch_support_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.support_conversations
    SET updated_at = NOW(),
        last_message_at = NEW.created_at,
        last_message_sender_type = NEW.sender_type,
        last_message_preview = left(NEW.content, 240),
        status = CASE
            WHEN NEW.sender_type = 'support' AND status <> 'closed' THEN 'answered'
            WHEN NEW.sender_type = 'tenant' AND status = 'answered' THEN 'waiting_human'
            ELSE status
        END
    WHERE id = NEW.conversation_id AND tenant_id = NEW.tenant_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_message_touches_conversation ON public.support_messages;
CREATE TRIGGER support_message_touches_conversation
    AFTER INSERT ON public.support_messages
    FOR EACH ROW EXECUTE FUNCTION public.touch_support_conversation();

UPDATE public.support_conversations AS conversation
SET (last_message_at, last_message_sender_type, last_message_preview) = (
    SELECT message.created_at, message.sender_type, left(message.content, 240)
    FROM public.support_messages AS message
    WHERE message.conversation_id = conversation.id
      AND message.tenant_id = conversation.tenant_id
    ORDER BY message.created_at DESC
    LIMIT 1
)
WHERE conversation.last_message_at IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.support_messages AS message
      WHERE message.conversation_id = conversation.id
        AND message.tenant_id = conversation.tenant_id
  );

ALTER TABLE public.support_conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversation_reads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_conversation_reads_select ON public.support_conversation_reads;
CREATE POLICY support_conversation_reads_select
    ON public.support_conversation_reads FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        AND auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
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
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR auth.uid() IS NULL
       OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('super_admin', 'hubino_support') THEN
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
$$;

CREATE OR REPLACE FUNCTION public.rpc_mark_support_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR auth.uid() IS NULL
       OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('super_admin', 'hubino_support') THEN
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
$$;

CREATE OR REPLACE FUNCTION public.guard_support_conversation_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Support conversation identity fields cannot be changed.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_conversation_identity_immutable ON public.support_conversations;
CREATE TRIGGER support_conversation_identity_immutable
    BEFORE UPDATE ON public.support_conversations
    FOR EACH ROW EXECUTE FUNCTION public.guard_support_conversation_identity();

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_conversations_select ON public.support_conversations;
DROP POLICY IF EXISTS support_conversations_insert ON public.support_conversations;
DROP POLICY IF EXISTS support_conversations_update ON public.support_conversations;
DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;

CREATE POLICY support_conversations_select
    ON public.support_conversations FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
    );

CREATE POLICY support_conversations_insert
    ON public.support_conversations FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id = public.current_tenant_id()
        AND created_by = auth.uid()
        AND COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('super_admin', 'hubino_support')
    );

CREATE POLICY support_conversations_update
    ON public.support_conversations FOR UPDATE TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support'))
    WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support'));

CREATE POLICY support_messages_select
    ON public.support_messages FOR SELECT TO authenticated
    USING (
        tenant_id = public.current_tenant_id()
        OR auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
    );

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
                FROM public.support_conversations conversation
                WHERE conversation.id = support_messages.conversation_id
                  AND conversation.tenant_id = support_messages.tenant_id
                  AND conversation.status <> 'closed'
            )
        )
        OR (
            sender_type = 'support'
            AND sender_id = auth.uid()
            AND auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support')
            AND EXISTS (
                SELECT 1
                FROM public.support_conversations conversation
                WHERE conversation.id = support_messages.conversation_id
                  AND conversation.tenant_id = support_messages.tenant_id
                  AND conversation.status <> 'closed'
            )
        )
    );

CREATE OR REPLACE FUNCTION public.rpc_request_support_handoff(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR
       auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin', 'hubino_support') THEN
        RAISE EXCEPTION 'Support handoff requires an authenticated tenant user.';
    END IF;

    v_tenant_id := public.current_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context is required.';
    END IF;

    UPDATE public.support_conversations
    SET status = 'waiting_human', updated_at = NOW()
    WHERE id = p_conversation_id
      AND tenant_id = v_tenant_id
      AND status IN ('open', 'answered');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation is not available for support handoff.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_create_support_conversation(p_subject TEXT, p_content TEXT)
RETURNS public.support_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id TEXT;
    v_conversation public.support_conversations;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR
       COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('super_admin', 'hubino_support') THEN
        RAISE EXCEPTION 'Support conversations can only be created by an authenticated tenant user.';
    END IF;

    v_tenant_id := public.current_tenant_id();
    IF v_tenant_id IS NULL OR COALESCE(length(trim(p_subject)), 0) NOT BETWEEN 1 AND 160
       OR COALESCE(length(trim(p_content)), 0) NOT BETWEEN 1 AND 4000 THEN
        RAISE EXCEPTION 'A tenant, subject, and initial message are required.';
    END IF;

    INSERT INTO public.support_conversations (tenant_id, created_by, subject)
    VALUES (v_tenant_id, auth.uid(), trim(p_subject))
    RETURNING * INTO v_conversation;

    INSERT INTO public.support_messages (
        conversation_id, tenant_id, sender_type, sender_id, content
    )
    VALUES (v_conversation.id, v_tenant_id, 'tenant', auth.uid(), trim(p_content));

    RETURN v_conversation;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_store_support_ai_reply(
    p_conversation_id UUID,
    p_message_id UUID,
    p_content TEXT,
    p_needs_human BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_conversation public.support_conversations;
    v_message public.support_messages;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Only the trusted support service can store AI replies.';
    END IF;
    IF COALESCE(length(trim(p_content)), 0) NOT BETWEEN 1 AND 4000 THEN
        RAISE EXCEPTION 'AI reply content is invalid.';
    END IF;

    SELECT * INTO v_conversation
    FROM public.support_conversations
    WHERE id = p_conversation_id
    FOR UPDATE;

    IF NOT FOUND OR v_conversation.status <> 'open' THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_message
    FROM public.support_messages
    WHERE id = p_message_id
      AND conversation_id = p_conversation_id
      AND tenant_id = v_conversation.tenant_id
      AND sender_type = 'tenant'
    FOR SHARE;

    IF NOT FOUND OR EXISTS (
        SELECT 1 FROM public.support_messages
        WHERE reply_to_message_id = p_message_id AND sender_type = 'assistant'
    ) THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.support_messages (
        conversation_id, tenant_id, sender_type, content, reply_to_message_id
    )
    VALUES (
        p_conversation_id, v_conversation.tenant_id, 'assistant', trim(p_content), p_message_id
    );

    IF p_needs_human THEN
        UPDATE public.support_conversations
        SET status = 'waiting_human', updated_at = NOW()
        WHERE id = p_conversation_id;
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_support_handoff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_support_handoff(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_create_support_conversation(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_support_conversation(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_store_support_ai_reply(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_store_support_ai_reply(UUID, UUID, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.rpc_list_support_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_support_inbox() TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_mark_support_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_support_conversation_read(UUID) TO authenticated;

REVOKE ALL ON TABLE public.support_conversations, public.support_messages, public.support_conversation_reads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.support_messages TO authenticated;
GRANT SELECT ON TABLE public.support_conversation_reads TO authenticated;
GRANT ALL ON TABLE public.support_conversations, public.support_messages TO service_role;
GRANT ALL ON TABLE public.support_conversation_reads TO service_role;

COMMIT;
