import path from 'path';

export interface PlainApiKeyRecord {
  customerId: string;
  keyId: string;
  keyPrefix: string;
  plainKey: string;
  name?: string;
  createdAt: string;
}

/**
 * Initialize a lightweight sqlite vault for plaintext API keys (DEV-ONLY).
 * Uses dynamic import to avoid hard dependency when feature is disabled.
 * If sqlite3 is not available, returns null and callers should fallback to file vault.
 */
export async function initSqliteVault(dbPath?: string): Promise<any | null> {
  try {
    const sqlite3: any = await import('sqlite3');
    const { Database } = sqlite3.verbose();
    const target = dbPath || process.env.PLAIN_KEY_SQLITE || path.join('.data', 'plain_api_keys.sqlite');
    await new Promise<void>((resolve, reject) => {
      const db = new Database(target, (err: any) => (err ? reject(err) : resolve()));
      db.close();
    });
    // Reopen for schema creation
    const db = new Database(target);
    await new Promise<void>((resolve, reject) => {
      db.run(
        'CREATE TABLE IF NOT EXISTS api_keys (\n          id INTEGER PRIMARY KEY AUTOINCREMENT,\n          customerId TEXT NOT NULL,\n          keyId TEXT NOT NULL,\n          keyPrefix TEXT NOT NULL,\n          cipher TEXT NOT NULL,\n          name TEXT,\n          createdAt TEXT NOT NULL\n        )',
        (err: any) => (err ? reject(err) : resolve())
      );
    });
    return db;
  } catch (e) {
    console.warn('[sqliteVault] sqlite3 not available or failed to init:', (e as Error).message);
    return null;
  }
}

function maskSecret(s: string): string {
  // Naive reversible mask using env passphrase; DEV ONLY, NOT FOR PRODUCTION
  const key = process.env.SQLITE_VAULT_PASSPHRASE || 'dev-secret';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += String.fromCharCode(s.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(out, 'binary').toString('base64');
}

function unmaskSecret(b64: string): string {
  const key = process.env.SQLITE_VAULT_PASSPHRASE || 'dev-secret';
  const buf = Buffer.from(b64, 'base64').toString('binary');
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += String.fromCharCode(buf.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export async function savePlainApiKeySqlite(rec: PlainApiKeyRecord): Promise<boolean> {
  try {
    const db = await initSqliteVault();
    if (!db) return false;
    const cipher = maskSecret(rec.plainKey);
    await new Promise<void>((resolve, reject) => {
      db.run(
        'INSERT INTO api_keys (customerId, keyId, keyPrefix, cipher, name, createdAt) VALUES (?,?,?,?,?,?)',
        [rec.customerId, rec.keyId, rec.keyPrefix, cipher, rec.name || null, rec.createdAt],
        (err: any) => (err ? reject(err) : resolve())
      );
    });
    db.close();
    return true;
  } catch (e) {
    console.warn('[sqliteVault] Failed to save api key:', (e as Error).message);
    return false;
  }
}

export async function getRecentPlainKeysSqlite(limit = 50): Promise<Array<PlainApiKeyRecord & { plainKeyMasked: string }>> {
  const items: Array<PlainApiKeyRecord & { plainKeyMasked: string }> = [];
  try {
    const db = await initSqliteVault();
    if (!db) return items;
    const rows: any[] = await new Promise((resolve, reject) => {
      db.all('SELECT customerId, keyId, keyPrefix, cipher, name, createdAt FROM api_keys ORDER BY id DESC LIMIT ?', [limit], (err: any, rows: any[]) => (err ? reject(err) : resolve(rows)));
    });
    for (const r of rows) {
      const plain = unmaskSecret(r.cipher);
      const last4 = plain.slice(-4);
      items.push({
        customerId: r.customerId,
        keyId: r.keyId,
        keyPrefix: r.keyPrefix,
        plainKey: plain,
        plainKeyMasked: plain ? `ck_***${last4}` : '',
        name: r.name || undefined,
        createdAt: r.createdAt
      });
    }
    db.close();
  } catch (e) {
    console.warn('[sqliteVault] Failed to read api keys:', (e as Error).message);
  }
  return items;
}
