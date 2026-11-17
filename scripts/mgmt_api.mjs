import { createClient } from '@supabase/supabase-js';
const url = 'https://idstkiqwlcelswwiblmm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3RraXF3bGNlbHN3d2libG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc5NjY1MiwiZXhwIjoyMDg3MzcyNjUyfQ.OBmWSQQwdOuUpuz2c0PL3_b6Z79iMuqYSzTZOeVS6nE';
async function main() {
  const res = await fetch('https://api.supabase.com/v1/projects/idstkiqwlcelswwiblmm/database/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "select 1" })
  });
  console.log('status:', res.status);
  console.log(await res.text());
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},15000);