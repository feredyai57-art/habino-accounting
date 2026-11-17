import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
const url = 'https://idstkiqwlcelswwiblmm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3RraXF3bGNlbHN3d2libG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc5NjY1MiwiZXhwIjoyMDg3MzcyNjUyfQ.OBmWSQQwdOuUpuz2c0PL3_b6Z79iMuqYSzTZOeVS6nE';
const admin = createClient(url, serviceKey);
async function main() {
  const tenantId = '6011cce7-594e-4ab6-a800-9a466b32c904';
  const clientId = '079c5a39-7cde-4e75-9974-4a16056222ec';
  const clientName = 'جناب آقای رودگر (ساختمان بهمن مترو)';
  const bankAccountId = 'ea3b2bce-ab77-4ac7-8e1e-7b44724f125a';
  const checkId = randomUUID();
  const amount = 3000000;
  const p_check = {
    id: checkId,
    checkNumber: 'TEST-001',
    bankName: 'بانک پاسارگاد',
    branchName: null,
    amount,
    issueDate: '2026-01-01',
    dueDate: '2026-02-01',
    type: 'payable',
    status: 'pending',
    clientId,
    clientName,
    accountNumber: '9657646354',
    description: 'test',
    metadata: { bankAccountId }
  };
  const p_entries = [
    {
      id: randomUUID(),
      accountCode: '20101',
      accountTitle: 'بدهکاران تجاری',
      debit: amount,
      credit: 0,
      documentNumber: 'DOC-CHK-TEST-001',
      description: 'test',
      date: '2026-01-01',
      clientId,
      clientName,
      created_at: new Date().toISOString()
    },
    {
      id: randomUUID(),
      accountCode: '20102',
      accountTitle: 'چک‌های پرداختی',
      debit: 0,
      credit: amount,
      documentNumber: 'DOC-CHK-TEST-001',
      description: 'test',
      date: '2026-01-01',
      clientId,
      clientName,
      created_at: new Date().toISOString()
    }
  ];
  const { data, error } = await admin.rpc('rpc_register_check_atomic', {
    p_check,
    p_entries,
    p_tenant_id: tenantId
  });
  console.log('RPC result:', JSON.stringify(data));
  console.log('RPC error:', JSON.stringify(error));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},15000);