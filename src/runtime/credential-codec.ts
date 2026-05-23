import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1';

export interface CredentialCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

export class PlainTextCredentialCodec implements CredentialCodec {
  encrypt(value: string): string {
    return value;
  }

  decrypt(value: string): string {
    return value;
  }
}

export class AesGcmCredentialCodec implements CredentialCodec {
  private key: Buffer;

  constructor(secret: string) {
    if (!secret) {
      throw new Error('Credential encryption key is required');
    }

    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      ENCRYPTED_PREFIX,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string): string {
    if (!value.startsWith(`${ENCRYPTED_PREFIX}:`)) {
      return value;
    }

    const [, , ivText, tagText, encryptedText] = value.split(':');
    if (!ivText || !tagText || !encryptedText) {
      throw new Error('Invalid encrypted credential format');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivText, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export function createCredentialCodec(secret?: string): CredentialCodec {
  const key = secret || process.env.CREDENTIAL_ENCRYPTION_KEY || '';
  return key ? new AesGcmCredentialCodec(key) : new PlainTextCredentialCodec();
}
