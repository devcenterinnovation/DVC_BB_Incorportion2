import fetch from 'node-fetch';

const BASE = 'http://localhost:3000/api/v1';
const EMAIL_PRIMARY = 'refsilva@yahoo.com';
const PASSWORD = 'Str0ngPass123!';

const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

async function health() {
  const res = await fetch('http://localhost:3000/health');
  const j = await res.json().catch(()=>({}));
  console.log('health:', res.status, j.status);
}

async function signupOrFallback() {
  const unique = `c_${Date.now()}@example.com`;
  let res = await fetch(`${BASE}/customer/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email: EMAIL_PRIMARY, 
      password: PASSWORD, 
      company: 'Acme', 
      plan: 'basic',
      full_name: 'John Doe Smith',
      nin_bvn: '12345678901',
      phone_number: '08012345678',
      id_document: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    })
  });
  if (res.status === 409) {
    res = await fetch(`${BASE}/customer/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: unique, 
        password: PASSWORD, 
        company: 'Acme', 
        plan: 'basic',
        full_name: 'John Doe Smith',
        nin_bvn: '12345678901',
        phone_number: '08012345678',
        id_document: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      })
    });
  }
  const j = await res.json();
  if (!res.ok) throw new Error('signup failed: ' + JSON.stringify(j));
  const token = j.data?.token || j.token;
  const id = j.data?.customer?.id || j.customer?.id;
  console.log('signup:', res.status, 'jwt prefix:', String(token).substring(0,10), 'customerId:', id);
  return { jwt: token, customerId: id };
}

async function me(jwt) {
  const res = await fetch(`${BASE}/customer/me`, { headers: { Authorization: `Bearer ${jwt}` }});
  const j = await res.json().catch(()=>({}));
  console.log('me:', res.status, JSON.stringify(j).slice(0,300));
}

async function keysList(jwt) {
  const res = await fetch(`${BASE}/customer/api-keys`, { headers: { Authorization: `Bearer ${jwt}` }});
  const j = await res.json().catch(()=>({}));
  console.log('keys list:', res.status, JSON.stringify(j).slice(0,300));
}

async function keyCreate(jwt) {
  const res = await fetch(`${BASE}/customer/api-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ name: 'E2E Key' }) });
  const j = await res.json();
  if (!res.ok) throw new Error('create key failed: ' + JSON.stringify(j));
  const ck = j.data?.token || j.token;
  const keyId = j.data?.key?.id || j.key?.id;
  console.log('key create:', res.status, 'ck prefix:', String(ck).substring(0,10), 'keyId:', keyId);
  return { ck, keyId };
}

async function nameSearch(ck) {
  const payload = { SearchType: 'ALL', searchTerm: 'DANGOTE', maxResults: 3 };
  const res = await fetch(`${BASE}/name-search`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
  const j = await res.json().catch(()=>({}));
  console.log('name-search:', res.status, JSON.stringify(j).slice(0,400));
}

// name-similarity removed. Use nameSearch only.

async function registration(ck) {
  const payload = {
    ref: 'REFCUST001',
    full_name: 'John Doe',
    business_name1: 'ACME GLOBAL LTD',
    business_name2: 'ACME GLOBAL LIMITED',
    nature_of_business: 'General trading and services across multiple sectors',
    image_id_card: 'data:image/png;base64,' + 'a'.repeat(200),
    date_of_birth: '01-01-1990',
    email: EMAIL_PRIMARY,
    phone: '08012345678',
    image_passport: 'data:image/png;base64,' + 'a'.repeat(200),
    image_signature: 'data:image/png;base64,' + 'a'.repeat(200)
  };
  const res = await fetch(`${BASE}/business/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
  const j = await res.json().catch(()=>({}));
  console.log('registration:', res.status, JSON.stringify(j).slice(0,400));
}

async function usage(jwt) {
  const res = await fetch(`${BASE}/customer/usage`, { headers: { Authorization: `Bearer ${jwt}` }});
  const j = await res.json().catch(()=>({}));
  console.log('usage:', res.status, JSON.stringify(j).slice(0,400));
}

async function keyDelete(jwt, keyId) {
  if (!keyId) return;
  const res = await fetch(`${BASE}/customer/api-keys/${keyId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` }});
  const j = await res.json().catch(()=>({}));
  console.log('key delete:', res.status, JSON.stringify(j).slice(0,200));
}

(async () => {
  try {
    await health();
    const { jwt } = await signupOrFallback();
    await me(jwt);
    await keysList(jwt);
    const { ck, keyId } = await keyCreate(jwt);
    await nameSearch(ck);
    // name-similarity removed; using only nameSearch
    await registration(ck);
    await usage(jwt);
    await keyDelete(jwt, keyId);
    console.log('Full customer E2E complete.');
    process.exit(0);
  } catch (e) {
    console.error('Full customer E2E failed:', e.message);
    process.exit(1);
  }
})();
