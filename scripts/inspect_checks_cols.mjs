import { createClient } from '@supabase/supabase-js';
const url = 'https://idstkiqwlcelswwiblmm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3RraXF3bGNlbHN3d2libG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc5NjY1MiwiZXhwIjoyMDg3MzcyNjUyfQ.OBmWSQQwdOuUpuz2c0PL3_b6Z79iMuqYSzTZOeVS6nE';
const admin = createClient(url, serviceKey);
async function main() {
  const { data, error } = await admin.rpc('exec_sql', { query: "select column_name from information_schema.columns where table_name='checks' order by ordinal_position" });
  console.log('rpc exec_sql:', data, error?.message);
  // fallback: try selecting one row
  const { data: row } = await admin.from('checks').select('*').limit(1);
  console.log('sample row keys:', row && row[0] ? Object.keys(row[0]) : 'no rows');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},15000);