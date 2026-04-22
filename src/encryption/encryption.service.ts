import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SEP = ':';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) throw new Error('ENCRYPTION_KEY environment variable is not set');
    // Accept a 64-char hex string (32 bytes) or derive via scrypt if shorter
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      this.key = Buffer.from(raw, 'hex');
    } else {
      this.key = scryptSync(raw, 'leadsage-salt', 32);
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('hex'),
      tag.toString('hex'),
      encrypted.toString('hex'),
    ].join(SEP);
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(SEP);
    if (parts.length !== 3) throw new Error('Invalid ciphertext format');
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  }

  /** Returns true if the value looks like an encrypted payload (iv:tag:data). */
  isEncrypted(value: string): boolean {
    const parts = value.split(SEP);
    return (
      parts.length === 3 &&
      parts[0].length === IV_LEN * 2 &&
      parts[1].length === TAG_LEN * 2
    );
  }
}
