import path from 'path';
import crypto from 'crypto';
import { promises as fs } from 'fs';

export type VerificationDocumentType = 'cac' | 'photo_id';

export interface StoredDocument {
  filePath: string; // absolute path on disk
  publicName: string; // original name
  mimeType: string;
  sizeBytes: number;
}

/**
 * Local disk storage for verification documents.
 *
 * Security principles:
 * - Store outside the web root
 * - Use randomized filenames (no user-controlled paths)
 * - Do not serve directly; always stream via authenticated endpoints
 */
export class VerificationStorageService {
  private baseDir: string;

  constructor(baseDir = process.env.VERIFICATION_UPLOAD_DIR || path.join(process.cwd(), '.data', 'verification_uploads')) {
    this.baseDir = baseDir;
  }

  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  private generateSafeFilename(originalName: string) {
    const ext = path.extname(originalName).slice(0, 10) || '';
    const rand = crypto.randomBytes(16).toString('hex');
    return `${Date.now()}_${rand}${ext}`;
  }

  async saveCustomerDocument(params: {
    customerId: string;
    type: VerificationDocumentType;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<StoredDocument> {
    const customerDir = path.join(this.baseDir, params.customerId, params.type);
    await this.ensureDir(customerDir);

    const safeName = this.generateSafeFilename(params.originalName);
    const filePath = path.join(customerDir, safeName);

    await fs.writeFile(filePath, params.buffer);

    return {
      filePath,
      publicName: params.originalName,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.byteLength
    };
  }

  async getCustomerDocumentPath(params: { customerId: string; type: VerificationDocumentType; storedPath: string }): Promise<string> {
    // storedPath is the filePath we previously saved; validate it's inside baseDir
    const resolved = path.resolve(params.storedPath);
    const base = path.resolve(this.baseDir);
    if (!resolved.startsWith(base)) {
      throw new Error('INVALID_DOCUMENT_PATH');
    }
    return resolved;
  }
}

export const verificationStorage = new VerificationStorageService();
