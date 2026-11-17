import { createClient } from '@supabase/supabase-js';
const url = 'https://idstkiqwlcelswwiblmm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3RraXF3bGNlbHN3d2libG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc5NjY1MiwiZXhwIjoyMDg3MzcyNjUyfQ.OBmWSQQwdOuUpuz2c0PL3_b6Z79iMuqYSzTZOeVS6nE';
const admin = createClient(url, serviceKey);
async function main() {
  const { data, error } = await admin.from('information_schema.routines').select('routine_name').eq('routine_schema','public');
  console.log('routines:', data, error?.message);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},15000);