import fetch from 'node-fetch';

const BASE = 'http://localhost:3000/api/v1';
const CREDS = [
  { email: 'admin@yourcompany.com', password: 'admin123!CHANGE_THIS' },
  { email: 'refsilva@yahoo.com', password: 'AdminPass123!' }
];

async function health() {
  const res = await fetch('http://localhost:3000/health');
  const j = await res.json().catch(()=>({}));
  console.log('health:', res.status, j.status);
}

async function tryLogin() {
  for (const c of CREDS) {
    const res = await fetch(`${BASE}/admin/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c)
    });
    const j = await res.json().catch(()=>({}));
    console.log('login attempt', c.email, res.status, JSON.stringify(j).slice(0,300));
    if (res.status === 200) {
      const token = j?.data?.token || j?.token || j?.data?.jwt;
      console.log('admin token prefix:', String(token||'').substring(0,12));
      if (!token) throw new Error('No token returned from login');
      return token;
    }
  }
  throw new Error('All admin login attempts failed');
}

async function nameSearch(token) {
  if (!token) throw new Error('Missing admin token before nameSearch');
  const payload = { SearchType: 'ALL', searchTerm: 'DANGOTE', maxResults: 3 };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  console.log('name-search headers:', headers);
  const res = await fetch(`${BASE}/name-search`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const j = await res.json().catch(()=>({}));
  console.log('admin name-search:', res.status, JSON.stringify(j).slice(0,400));
}

// name-similarity removed. Use nameSearch only.
// async function nameSimilarity(token) {
  if (!token) throw new Error('Missing admin token before nameSimilarity');
  const payload = { SearchType: 'ALL', searchTerm: 'DANGOTE', maxResults: 3 };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  console.log('name-similarity headers:', headers);
  // deprecated endpoint removed
  const j = await res.json().catch(()=>({}));
  // console.log('admin name-similarity:', res.status, JSON.stringify(j).slice(0,400));
}

async function registration(token) {
  const payload = {
    ref: 'REFADM002',
    full_name: 'Admin User',
    business_name1: 'ADMIN TEST LTD',
    business_name2: 'ADMIN TEST LIMITED',
    nature_of_business: 'Testing and validation',
    image_id_card: 'data:image/png;base64,' + 'a'.repeat(200),
    date_of_birth: '10-10-1980',
    email: 'admin@yourcompany.com',
    phone: '08000000000',
    image_passport: 'data:image/png;base64,' + 'a'.repeat(200),
    image_signature: 'data:image/png;base64,' + 'a'.repeat(200)
  };
  const res = await fetch(`${BASE}/business/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const j = await res.json().catch(()=>({}));
  console.log('admin registration:', res.status, JSON.stringify(j).slice(0,400));
}

async function audit(token) {
  const res = await fetch(`${BASE}/admin/audit/self?limit=10`, { headers: { Authorization: `Bearer ${token}` }});
  const j = await res.json().catch(()=>({}));
  console.log('admin audit/self:', res.status, JSON.stringify(j).slice(0,600));
}

(async () => {
  try {
    await health();
    const token = await tryLogin();
    await nameSearch(token);
    // name-similarity removed; using only nameSearch
    await registration(token);
    await audit(token);
    console.log('Full admin E2E complete.');
    process.exit(0);
  } catch (e) {
    console.error('Full admin E2E failed:', e.message);
    process.exit(1);
  }
})();
