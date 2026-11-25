import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { registerSecretForRedaction } from './logger.js';

export interface StoredCredentials {
  googleRefreshToken?: string;
  googleAccessToken?: string;
  googleAccessExpiresAt?: number;
  googleClientId?: string;
  googleClientSecret?: string;
  notionToken?: string;
  notionDatabaseId?: string;
  preferredLlm?: 'auto' | 'claude' | 'openrouter' | 'chatgpt' | 'rules';
  anthropicKey?: string;
  openRouterKey?: string;
  openRouterModel?: string;
  openAiKey?: string;
  assemblyAiKey?: string;
  accountName?: string;
  accountEmail?: string;
}

/**
 * AES-256-GCM local encrypted token vault written at mode 0600.
 * Never persists email bodies or voice recordings to disk.
 */
export class EncryptedTokenVault {
  private readonly key: Buffer;
  private readonly vaultPath: string;

  constructor(dataDir: string, explicitKeyHex?: string) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.vaultPath = path.join(dataDir, 'tokens.vault.json');

    const keySource = explicitKeyHex ?? process.env.ONQ_VAULT_KEY;
    if (keySource && /^[0-9a-fA-F]{64}$/.test(keySource)) {
      this.key = Buffer.from(keySource, 'hex');
    } else {
      const keyFile = path.join(dataDir, 'vault.key');
      if (fs.existsSync(keyFile)) {
        this.key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
      } else {
        this.key = crypto.randomBytes(32);
        fs.writeFileSync(keyFile, this.key.toString('hex'), { mode: 0o600 });
      }
    }
  }

  save(creds: StoredCredentials): void {
    if (creds.googleRefreshToken) registerSecretForRedaction(creds.googleRefreshToken);
    if (creds.googleAccessToken) registerSecretForRedaction(creds.googleAccessToken);
    if (creds.googleClientSecret) registerSecretForRedaction(creds.googleClientSecret);
    if (creds.notionToken) registerSecretForRedaction(creds.notionToken);
    if (creds.anthropicKey) registerSecretForRedaction(creds.anthropicKey);
    if (creds.openRouterKey) registerSecretForRedaction(creds.openRouterKey);
    if (creds.openAiKey) registerSecretForRedaction(creds.openAiKey);
    if (creds.assemblyAiKey) registerSecretForRedaction(creds.assemblyAiKey);

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(creds), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const envelope = {
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64'),
    };
    fs.writeFileSync(this.vaultPath, JSON.stringify(envelope), { mode: 0o600 });
    try {
      fs.chmodSync(this.vaultPath, 0o600);
    } catch {
      // Windows NTFS ignores POSIX chmod bits; file stays ACL-scoped to current user
    }
  }

  load(): StoredCredentials {
    if (!fs.existsSync(this.vaultPath)) return {};
    try {
      const raw = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8')) as {
        iv: string;
        tag: string;
        data: string;
      };
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(raw.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(raw.tag, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(raw.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const parsed = JSON.parse(plain) as StoredCredentials;
      if (parsed.googleRefreshToken) registerSecretForRedaction(parsed.googleRefreshToken);
      if (parsed.notionToken) registerSecretForRedaction(parsed.notionToken);
      if (parsed.anthropicKey) registerSecretForRedaction(parsed.anthropicKey);
      if (parsed.openRouterKey) registerSecretForRedaction(parsed.openRouterKey);
      if (parsed.openAiKey) registerSecretForRedaction(parsed.openAiKey);
      if (parsed.assemblyAiKey) registerSecretForRedaction(parsed.assemblyAiKey);
      return parsed;
    } catch {
      return {};
    }
  }

  clear(): void {
    if (fs.existsSync(this.vaultPath)) {
      fs.unlinkSync(this.vaultPath);
    }
  }

  getVaultPath(): string {
    return this.vaultPath;
  }
}
