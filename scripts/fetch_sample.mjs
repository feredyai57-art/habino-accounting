import { createClient } from '@supabase/supabase-js';
const url = 'https://idstkiqwlcelswwiblmm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3RraXF3bGNlbHN3d2libG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc5NjY1MiwiZXhwIjoyMDg3MzcyNjUyfQ.OBmWSQQwdOuUpuz2c0PL3_b6Z79iMuqYSzTZOeVS6nE';
const admin = createClient(url, serviceKey);
async function main() {
  const { data: clients } = await admin.from('clients').select('id,name,tenant_id').limit(3);
  console.log('clients:', JSON.stringify(clients));
  const { data: banks } = await admin.from('bank_accounts').select('id,name,tenant_id,account_number').limit(3);
  console.log('banks:', JSON.stringify(banks));
  const { data: checks } = await admin.from('checks').select('id,client_id,client_name,bank_account_id,amount,type,status').limit(3);
  console.log('checks:', JSON.stringify(checks));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},15000);