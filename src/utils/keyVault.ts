import { promises as fs } from 'fs';
import path from 'path';

export interface PlainApiKeyRecord {
  customerId: string;
  keyId: string;
  keyPrefix: string;
  plainKey: string;
  name?: string;
  createdAt: string;
}

const ensureDir = async (filePath: string) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

/**
 * Save a plain API key to a local file for debugging or operational recovery.
 * File format: NDJSON (one JSON object per line).
 * Enable via env PLAIN_KEY_FILE (default .data/plain_api_keys.ndjson)
 */
export async function savePlainApiKey(record: PlainApiKeyRecord): Promise<void> {
  try {
    const target = process.env.PLAIN_KEY_FILE || path.join('.data', 'plain_api_keys.ndjson');
    await ensureDir(target);
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(target, line, { encoding: 'utf8' });
  } catch (e) {
    // Do not throw; logging is best-effort
    console.warn('[keyVault] Failed to persist plain API key:', (e as Error).message);
  }
}
