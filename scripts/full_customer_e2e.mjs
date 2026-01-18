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
   const payload = { proposedName: 'DANGOTE GLOBAL', lineOfBusiness: 'General trading' };
   const res = await fetch(`${BASE}/business/name-search`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
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
   const res = await fetch(`${BASE}/business/name-registration`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('registration:', res.status, JSON.stringify(j).slice(0,400));
}

async function usage(jwt) {
  const res = await fetch(`${BASE}/customer/usage`, { headers: { Authorization: `Bearer ${jwt}` }});
  const j = await res.json().catch(()=>({}));
  console.log('usage:', res.status, JSON.stringify(j).slice(0,400));
}

async function submitBusinessInfo(jwt) {
   const payload = {
     rcNumber: 'TEST123456',
     companyName: 'Test Company Ltd',
     businessAddress: '123 Test Street, Lagos',
     businessEmail: EMAIL_PRIMARY,
     businessPhone: '08012345678',
     directorName: 'John Doe',
     yearOfIncorporation: '2020',
     natureOfBusiness: 'Software Development'
   };
   const res = await fetch(`${BASE}/customer/verification/submit-business-info`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('submit business info:', res.status, JSON.stringify(j).slice(0,200));
}

async function submitCompliance(jwt) {
   const payload = {
     requiresLicense: false,
     amlCompliance: true,
     amlSanctions: false,
     dataProtectionPolicies: true,
     dataSecurityMeasures: true,
     internationalDataTransfer: false,
     alternateDatabase: false,
     regulatedByAuthority: false,
     fraudPreventionPolicies: true,
     ndaWithEmployees: true,
     dataBreachSanctions: true,
     countriesOfOperation: 'Nigeria',
     otherPurposeUsage: false,
     regulatorySanctions: false
   };
   const res = await fetch(`${BASE}/customer/verification/submit-compliance`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('submit compliance:', res.status, JSON.stringify(j).slice(0,200));
}

async function submitContactPerson(jwt) {
   const payload = {
     fullName: 'John Doe',
     email: EMAIL_PRIMARY,
     phone: '08012345678',
     jobTitle: 'CEO',
     website: 'https://testcompany.com'
   };
   const res = await fetch(`${BASE}/customer/verification/submit-contact-person`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('submit contact person:', res.status, JSON.stringify(j).slice(0,200));
}

async function completeVerification(jwt) {
   const res = await fetch(`${BASE}/customer/verification/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify({}) });
   const j = await res.json().catch(()=>({}));
   console.log('complete verification:', res.status, JSON.stringify(j).slice(0,400));
   return j.data?.customerId || 'unknown'; // Return customerId for admin approval
}

async function adminLogin() {
   const res = await fetch(`${BASE}/admin/auth/login`, {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ email: 'admin@yourcompany.com', password: 'admin123!CHANGE_THIS' })
   });
   const j = await res.json().catch(()=>({}));
   if (res.status !== 200) throw new Error('Admin login failed: ' + JSON.stringify(j));
   const token = j?.data?.token || j?.token;
   console.log('admin login:', res.status, 'token prefix:', String(token||'').substring(0,12));
   return token;
}

async function adminApprove(adminToken, customerId) {
   const res = await fetch(`${BASE}/admin/verification/${customerId}/approve`, {
     method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({})
   });
   const j = await res.json().catch(()=>({}));
   console.log('admin approve:', res.status, JSON.stringify(j).slice(0,200));
}

async function ping(ck) {
   const res = await fetch(`${BASE}/business/ping`, { headers: { Authorization: `Token ${ck}` }});
   const j = await res.json().catch(()=>({}));
   console.log('ping:', res.status, JSON.stringify(j).slice(0,200));
}

async function cacStoreProducts(ck) {
   const res = await fetch(`${BASE}/business/cac-store-products`, { headers: { Authorization: `Token ${ck}` }});
   const j = await res.json().catch(()=>({}));
   console.log('cac-store-products:', res.status, JSON.stringify(j).slice(0,200));
}

async function statusCheck(ck) {
   const res = await fetch(`${BASE}/business/status/REFCUST001`, { headers: { Authorization: `Token ${ck}` }});
   const j = await res.json().catch(()=>({}));
   console.log('status check:', res.status, JSON.stringify(j).slice(0,200));
}

async function companyRegistration(ck) {
   const payload = {
     ref: 'REFCOMP001',
     company_name: 'Test Company Ltd',
     nature_of_business: 'Software Development',
     registered_office_address: '123 Test Street, Lagos',
     director_name: 'John Doe',
     director_address: '123 Test Street, Lagos',
     director_phone: '08012345678',
     director_email: 'john@test.com',
     witness_name: 'Jane Smith',
     witness_address: '456 Witness Ave, Lagos',
     witness_phone: '08087654321',
     witness_email: 'jane@witness.com',
     image_id_card: 'data:image/png;base64,' + 'a'.repeat(200),
     image_passport: 'data:image/png;base64,' + 'a'.repeat(200),
     image_signature: 'data:image/png;base64,' + 'a'.repeat(200)
   };
   const res = await fetch(`${BASE}/company-registration`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('company registration:', res.status, JSON.stringify(j).slice(0,200));
}

async function bvnBasic(ck) {
   const payload = {
     firstName: 'John',
     lastName: 'Doe',
     gender: 'M',
     phone: '08012345678'
   };
   const res = await fetch(`${BASE}/business/identity/bvn-basic/12345678901`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('bvn basic:', res.status, JSON.stringify(j).slice(0,200));
}

async function driversLicense(ck) {
   const payload = {
     idNumber: 'ABC123456789',
     firstName: 'John',
     lastName: 'Doe',
     photoBase64: 'data:image/png;base64,' + 'a'.repeat(200)
   };
   const res = await fetch(`${BASE}/business/identity/drivers-license-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('drivers license:', res.status, JSON.stringify(j).slice(0,200));
}

async function passportFace(ck) {
   const payload = {
     idNumber: 'A12345678',
     firstName: 'John',
     lastname: 'Doe',
     photoBase64: 'data:image/png;base64,' + 'a'.repeat(200)
   };
   const res = await fetch(`${BASE}/business/identity/passport-face-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Token ${ck}` }, body: JSON.stringify(payload) });
   const j = await res.json().catch(()=>({}));
   console.log('passport face:', res.status, JSON.stringify(j).slice(0,200));
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
     await submitBusinessInfo(jwt);
     await submitCompliance(jwt);
     await submitContactPerson(jwt);
     await completeVerification(jwt);
     await keysList(jwt);
     const { ck, keyId } = await keyCreate(jwt);
     await ping(ck);
     await cacStoreProducts(ck);
     await nameSearch(ck);
     await registration(ck);
     await companyRegistration(ck);
     await statusCheck(ck);
     await bvnBasic(ck);
     await driversLicense(ck);
     await passportFace(ck);
     await usage(jwt);
     await keyDelete(jwt, keyId);
     console.log('Full customer E2E complete.');
     process.exit(0);
   } catch (e) {
     console.error('Full customer E2E failed:', e.message);
     process.exit(1);
   }
})();
