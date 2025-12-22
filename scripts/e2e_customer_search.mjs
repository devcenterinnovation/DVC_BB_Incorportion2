import fetch from 'node-fetch';

const BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';
const KEY = process.env.CUSTOMER_API_KEY || 'ck_REPLACE_ME';

async function call(endpoint, body) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

(async () => {
  try {
    const payload = { SearchType: 'ALL', searchTerm: 'devcenter' };
    const legacy = await call('/name-search', payload);
    const newer  = null; // name-similarity removed; canonical endpoint is /name-search

    const legacyResults = legacy.data?.data?.results || legacy.data?.results || [];
    const newerResults  = newer.data?.data?.results || newer.data?.results || [];

    console.log('Legacy name-search:', legacy.status, 'count:', legacyResults.length);
    console.log('Canonical /name-search only. New name-similarity removed.');
    console.log('Legacy sample:', legacyResults.slice(0, 5).map(r => r.name));
    console.log('Newer  sample:', newerResults.slice(0, 5).map(r => r.name));

    process.exit(0);
  } catch (e) {
    console.error('E2E error:', e);
    process.exit(1);
  }
})();
