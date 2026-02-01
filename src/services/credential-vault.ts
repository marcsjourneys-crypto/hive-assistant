import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Database, UserCredential } from '../db/interface';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Manages encrypted user credentials.
 *
 * Credentials are encrypted at rest using AES-256-GCM with a master key
 * stored in the data directory. The master key is auto-generated on first use.
 *
 * Credentials are injected into script inputs at execution time via their
 * name (e.g., { credentials: vault.decrypt(credentialId) }).
 */
export class CredentialVault {
  private masterKey: Buffer;

  constructor(private db: Database, dataDir: string) {
    this.masterKey = this.loadOrCreateMasterKey(dataDir);
  }

  /**
   * Store a credential for a user.
   * The value is encrypted before storage.
   */
  async store(
    ownerId: string,
    name: string,
    service: string,
    plainValue: string
  ): Promise<Omit<UserCredential, 'encryptedValue'>> {
    const encrypted = this.encrypt(plainValue);
    const credential = await this.db.createUserCredential({
      id: uuidv4(),
      ownerId,
      name,
      service,
      encryptedValue: encrypted
    });

    // Return without the encrypted value
    return {
      id: credential.id,
      ownerId: credential.ownerId,
      name: credential.name,
      service: credential.service,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt
    };
  }

  /**
   * Retrieve and decrypt a credential value.
   */
  async retrieve(credentialId: string, requesterId: string): Promise<string> {
    const credential = await this.db.getUserCredential(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }
    if (credential.ownerId !== requesterId) {
      throw new Error('Access denied');
    }
    return this.decrypt(credential.encryptedValue);
  }

  /**
   * List credentials for a user (names and metadata only, no values).
   */
  async list(userId: string): Promise<Array<Omit<UserCredential, 'encryptedValue'>>> {
    const creds = await this.db.getUserCredentials(userId);
    return creds.map(c => ({
      id: c.id,
      ownerId: c.ownerId,
      name: c.name,
      service: c.service,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }));
  }

  /**
   * Delete a credential.
   */
  async delete(credentialId: string, requesterId: string): Promise<void> {
    const credential = await this.db.getUserCredential(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }
    if (credential.ownerId !== requesterId) {
      throw new Error('Access denied');
    }
    await this.db.deleteUserCredential(credentialId);
  }

  /**
   * Resolve credentials by name for a user.
   * Used by WorkflowEngine to inject credentials into script inputs.
   */
  async resolveByName(userId: string, name: string): Promise<string | null> {
    const creds = await this.db.getUserCredentials(userId);
    const match = creds.find(c => c.name === name);
    if (!match) return null;
    return this.decrypt(match.encryptedValue);
  }

  /**
   * Encrypt a plaintext value using AES-256-GCM.
   * Format: base64(iv + authTag + ciphertext)
   */
  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Combine iv + authTag + ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a value encrypted with encrypt().
   */
  private decrypt(encryptedBase64: string): string {
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Load or create the master encryption key.
   * Stored as hex in {dataDir}/encryption.key
   */
  private loadOrCreateMasterKey(dataDir: string): Buffer {
    const keyPath = path.join(dataDir, 'encryption.key');

    try {
      if (fs.existsSync(keyPath)) {
        const hex = fs.readFileSync(keyPath, 'utf8').trim();
        const key = Buffer.from(hex, 'hex');
        if (key.length === KEY_LENGTH) {
          return key;
        }
      }
    } catch {
      // Fall through to generate a new key
    }

    // Generate a new master key
    const key = crypto.randomBytes(KEY_LENGTH);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
    return key;
  }
}
