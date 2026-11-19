-- Keep finalized invoice content immutable while allowing payment/status,
-- signature, and presentation updates to continue through the existing workflow.

CREATE OR REPLACE FUNCTION public.prevent_posted_invoice_financial_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF COALESCE(OLD.type, '') NOT IN ('proforma', 'proforma_sale', 'proforma_purchase', 'pre_invoice')
       AND COALESCE(OLD.status, '') <> 'draft' THEN
        IF ROW(
            NEW.invoice_number,
            NEW.type,
            NEW.date,
            NEW.due_date,
            NEW.client_id,
            NEW.client_name,
            NEW.items,
            NEW.subtotal,
            NEW.total_discount,
            NEW.total_tax,
            NEW.grand_total,
            NEW.notes,
            NEW.terms,
            NEW.project_id
        ) IS DISTINCT FROM ROW(
            OLD.invoice_number,
            OLD.type,
            OLD.date,
            OLD.due_date,
            OLD.client_id,
            OLD.client_name,
            OLD.items,
            OLD.subtotal,
            OLD.total_discount,
            OLD.total_tax,
            OLD.grand_total,
            OLD.notes,
            OLD.terms,
            OLD.project_id
        ) THEN
            RAISE EXCEPTION 'اطلاعات مالی سند ثبت‌شده قفل است؛ برای اصلاح، سند اصلاحی ثبت کنید.'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status
           AND (
               OLD.status = 'cancelled'
               OR NEW.status IS NULL
               OR NEW.status NOT IN ('pending', 'paid', 'overdue')
           ) THEN
            RAISE EXCEPTION 'وضعیت سند ثبت‌شده فقط از مسیر عملیاتی مجاز قابل تغییر است.'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_posted_invoice_financial_edits
    ON public.invoices;

CREATE TRIGGER prevent_posted_invoice_financial_edits
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_posted_invoice_financial_edits();
