import fetch from 'node-fetch';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@yourcompany.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123!CHANGE_THIS';

async function seedAdmin() {
  const res = await fetch(`${BASE}/admin/dev/seed`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const j = await res.json().catch(()=>({}));
  console.log('seed admin:', res.status, j);
  if (!res.ok) throw new Error('seed failed');
}

async function adminLogin() {
  const res = await fetch(`${BASE}/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const j = await res.json().catch(()=>({}));
  console.log('admin login:', res.status, j && (j.data||j));
  if (!res.ok) throw new Error('login failed');
  return j.data?.token || j.token;
}

async function adminRegister(token) {
  const payload = {
    ref: 'REF67890',
    full_name: 'Jane Doe',
    business_name1: 'ACME ADMIN LTD',
    business_name2: 'ACME ADMIN LIMITED',
    nature_of_business: 'Administration and corporate services',
    image_id_card: 'data:image/png;base64,' + 'a'.repeat(200),
    date_of_birth: '15-05-1985',
    email: 'refsilva@yahoo.com',
    phone: '08012345678',
    image_passport: 'data:image/png;base64,' + 'a'.repeat(200),
    image_signature: 'data:image/png;base64,' + 'a'.repeat(200)
  };
  const res = await fetch(`${BASE}/business/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const j = await res.json().catch(()=>({}));
  console.log('admin registration:', res.status, j);
  if (res.status !== 201) throw new Error('registration failed');
}

(async () => {
  try {
    await seedAdmin();
    const token = await adminLogin();
    await adminRegister(token);
    console.log('E2E admin flow: SUCCESS');
    process.exit(0);
  } catch (e) {
    console.error('E2E admin flow: FAILED', e.message);
    process.exit(1);
  }
})();
