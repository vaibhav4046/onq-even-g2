import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { registerSecretForRedaction } from './logger.js';
import type { PreferredLlmProvider } from './harness/modelRouter.js';

export interface StoredCredentials {
  googleRefreshToken?: string;
  googleAccessToken?: string;
  googleAccessExpiresAt?: number;
  googleClientId?: string;
  googleClientSecret?: string;
  googleScopeMode?: 'identity' | 'workspace';
  notionToken?: string;
  notionDatabaseId?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  /** Chats (groups/channels/DMs) whose new messages OnQ may read and reply to. Empty = only the owner chat. */
  telegramWatchChats?: string[];
  preferredLlm?: PreferredLlmProvider;
  /** Model picked with select-model for preferredLlm. */
  preferredModel?: string;
  anthropicKey?: string;
  openRouterKey?: string;
  openRouterModel?: string;
  openAiKey?: string;
  xaiKey?: string;
  omniRouteUrl?: string;
  omniRouteKey?: string;
  omniRouteModel?: string;
  assemblyAiKey?: string;
  accountName?: string;
  accountEmail?: string;
}

function hasAnyValue(creds: StoredCredentials): boolean {
  return Object.values(creds).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== ''));
}

function stripUndefined(creds: StoredCredentials): StoredCredentials {
  return Object.fromEntries(Object.entries(creds).filter(([, v]) => v !== undefined)) as StoredCredentials;
}

/**
 * AES-256-GCM local encrypted token vault written at mode 0600.
 * Never persists email bodies or voice recordings to disk.
 */
export class EncryptedTokenVault {
  private readonly key: Buffer;
  private readonly vaultPath: string;
  private readonly backupPath: string;

  constructor(dataDir: string, explicitKeyHex?: string) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.vaultPath = path.join(dataDir, 'tokens.vault.json');
    this.backupPath = `${this.vaultPath}.bak`;

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

  /**
   * Writes the vault. Safe by default: the previous good file is copied to `tokens.vault.json.bak` first,
   * and a plain save can never drop a credential that is already stored (absent keys are carried over).
   * Only `{ allowShrink: true }` (explicit disconnect) may remove keys.
   */
  save(creds: StoredCredentials, opts: { allowShrink?: boolean } = {}): void {
    const current = this.readState();
    if (current.state === 'ok' && hasAnyValue(current.creds)) this.rollBackup();
    else if (current.state === 'unreadable') this.keepUnreadableCopy();
    if (!opts.allowShrink && current.state === 'ok') {
      creds = { ...current.creds, ...stripUndefined(creds) };
    }
    if (creds.googleRefreshToken) registerSecretForRedaction(creds.googleRefreshToken);
    if (creds.googleAccessToken) registerSecretForRedaction(creds.googleAccessToken);
    if (creds.googleClientSecret) registerSecretForRedaction(creds.googleClientSecret);
    if (creds.notionToken) registerSecretForRedaction(creds.notionToken);
    if (creds.telegramBotToken) registerSecretForRedaction(creds.telegramBotToken);
    if (creds.anthropicKey) registerSecretForRedaction(creds.anthropicKey);
    if (creds.openRouterKey) registerSecretForRedaction(creds.openRouterKey);
    if (creds.openAiKey) registerSecretForRedaction(creds.openAiKey);
    if (creds.xaiKey) registerSecretForRedaction(creds.xaiKey);
    if (creds.omniRouteKey) registerSecretForRedaction(creds.omniRouteKey);
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

  /** Decrypts one vault-format file. Throws when it is missing, corrupt, or sealed with another key. */
  private decryptFile(file: string): StoredCredentials {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { iv: string; tag: string; data: string };
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(raw.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(raw.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(raw.data, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(plain) as StoredCredentials;
  }

  private readState(): { state: 'missing' } | { state: 'unreadable' } | { state: 'ok'; creds: StoredCredentials } {
    if (!fs.existsSync(this.vaultPath)) return { state: 'missing' };
    try {
      return { state: 'ok', creds: this.decryptFile(this.vaultPath) };
    } catch {
      return { state: 'unreadable' };
    }
  }

  /** Copies the encrypted file as-is (mode kept) to the single rolling backup. */
  private copyPrivate(from: string, to: string): void {
    fs.copyFileSync(from, to);
    try {
      fs.chmodSync(to, 0o600);
    } catch {
      // Windows NTFS ignores POSIX chmod bits
    }
  }

  private rollBackup(): void {
    try {
      this.copyPrivate(this.vaultPath, this.backupPath);
    } catch {
      // a failed backup must not block the owner from saving a credential
    }
  }

  /** A vault we cannot decrypt (wrong key) is evidence, not trash: park it once and never roll it over a good backup. */
  private keepUnreadableCopy(): void {
    const parked = `${this.vaultPath}.unreadable`;
    try {
      if (!fs.existsSync(parked)) this.copyPrivate(this.vaultPath, parked);
    } catch {
      // best effort
    }
  }

  /**
   * Puts the rolling backup back as the live vault (after checking it decrypts with the current key).
   * Returns false when there is no usable backup. The file being replaced is parked as `.pre-restore`.
   */
  restoreBackup(): boolean {
    if (!fs.existsSync(this.backupPath)) return false;
    try {
      this.decryptFile(this.backupPath);
    } catch {
      return false;
    }
    try {
      if (fs.existsSync(this.vaultPath)) this.copyPrivate(this.vaultPath, `${this.vaultPath}.pre-restore`);
      this.copyPrivate(this.backupPath, this.vaultPath);
    } catch {
      return false;
    }
    return true;
  }

  /** The only intentional way to empty the vault: explicit "disconnect all". The backup keeps the last non-empty state. */
  disconnectAll(): void {
    this.save({}, { allowShrink: true });
  }

  getBackupPath(): string {
    return this.backupPath;
  }

  load(): StoredCredentials {
    if (!fs.existsSync(this.vaultPath)) return {};
    try {
      const parsed = this.decryptFile(this.vaultPath);
      if (parsed.googleRefreshToken) registerSecretForRedaction(parsed.googleRefreshToken);
      if (parsed.notionToken) registerSecretForRedaction(parsed.notionToken);
      if (parsed.telegramBotToken) registerSecretForRedaction(parsed.telegramBotToken);
      if (parsed.anthropicKey) registerSecretForRedaction(parsed.anthropicKey);
      if (parsed.openRouterKey) registerSecretForRedaction(parsed.openRouterKey);
      if (parsed.openAiKey) registerSecretForRedaction(parsed.openAiKey);
      if (parsed.xaiKey) registerSecretForRedaction(parsed.xaiKey);
      if (parsed.omniRouteKey) registerSecretForRedaction(parsed.omniRouteKey);
      if (parsed.assemblyAiKey) registerSecretForRedaction(parsed.assemblyAiKey);
      return parsed;
    } catch {
      return {};
    }
  }

  clear(): void {
    if (fs.existsSync(this.vaultPath)) {
      this.rollBackup();
      fs.unlinkSync(this.vaultPath);
    }
  }

  getVaultPath(): string {
    return this.vaultPath;
  }
}
