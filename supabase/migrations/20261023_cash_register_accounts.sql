ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'bank';

UPDATE public.accounting_entries AS entry
SET account_code = '10102',
    account_title = 'بانک‌ها و حساب‌های جاری ریالی',
    description = REPLACE(entry.description, 'موجودی نقد و بانک اول دوره', 'موجودی بانک اول دوره')
FROM public.bank_accounts AS account
WHERE entry.reference_id = account.id::text
  AND entry.document_number LIKE 'DOC-OPN-BNK-%'
  AND entry.account_code = '10101'
  AND account.account_type = 'bank';
