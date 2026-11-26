import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';
import { EncryptedTokenVault } from '../src/tokenVault.js';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const dirs: string[] = [];
const closers: Array<() => Promise<void>> = [];

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-vault-safety-'));
  dirs.push(d);
  return d;
}

afterEach(async () => {
  while (closers.length) await closers.pop()?.();
  while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('token vault safety (rolling backup, no accidental shrink)', () => {
  it('copies the previous encrypted file to tokens.vault.json.bak before every overwrite (bytes as-is)', () => {
    const vault = new EncryptedTokenVault(tmp(), KEY_A);
    vault.save({ googleRefreshToken: '1//g-refresh', notionToken: 'ntn_one' });
    expect(fs.existsSync(vault.getBackupPath())).toBe(false); // nothing to back up on the first write

    const before = fs.readFileSync(vault.getVaultPath());
    vault.save({ googleRefreshToken: '1//g-refresh', notionToken: 'ntn_two' });
    expect(vault.getBackupPath()).toBe(`${vault.getVaultPath()}.bak`);
    expect(fs.readFileSync(vault.getBackupPath()).equals(before)).toBe(true);
    expect(fs.readFileSync(vault.getBackupPath(), 'utf8')).not.toContain('ntn_one'); // still encrypted
    if (process.platform !== 'win32') {
      expect(fs.statSync(vault.getBackupPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('a plain save can never drop stored credentials; only an explicit allowShrink removes keys', () => {
    const vault = new EncryptedTokenVault(tmp(), KEY_A);
    vault.save({ googleRefreshToken: '1//g', notionToken: 'ntn_a', notionDatabaseId: 'db1' });

    vault.save({ telegramBotToken: '123:abc' }); // a buggy caller that forgot to spread the old values
    expect(vault.load()).toMatchObject({ googleRefreshToken: '1//g', notionToken: 'ntn_a', notionDatabaseId: 'db1', telegramBotToken: '123:abc' });

    vault.save({}); // an accidental empty save
    expect(vault.load().googleRefreshToken).toBe('1//g');

    vault.save({ ...vault.load(), notionToken: undefined, notionDatabaseId: undefined }, { allowShrink: true });
    expect(vault.load().notionToken).toBeUndefined();
    expect(vault.load().googleRefreshToken).toBe('1//g');
  });

  it('disconnectAll is the explicit way to empty it, and restoreBackup brings the last non-empty state back', () => {
    const vault = new EncryptedTokenVault(tmp(), KEY_A);
    vault.save({ googleRefreshToken: '1//g', notionToken: 'ntn_a' });
    vault.save({ googleRefreshToken: '1//g', notionToken: 'ntn_a', telegramChatId: '42' }); // backup now holds the 2-key state

    vault.disconnectAll();
    expect(vault.load()).toEqual({});

    vault.disconnectAll(); // a second wipe must not replace the backup with an empty vault
    expect(vault.restoreBackup()).toBe(true);
    expect(vault.load()).toMatchObject({ googleRefreshToken: '1//g', notionToken: 'ntn_a' });
    expect(fs.existsSync(`${vault.getVaultPath()}.pre-restore`)).toBe(true);
  });

  it('restoreBackup refuses a missing or unreadable backup and leaves the live vault alone', () => {
    const dir = tmp();
    const vault = new EncryptedTokenVault(dir, KEY_A);
    expect(vault.restoreBackup()).toBe(false); // no backup yet
    vault.save({ notionToken: 'ntn_live' });
    fs.writeFileSync(vault.getBackupPath(), '{"iv":"AA==","tag":"AA==","data":"AA=="}');
    expect(vault.restoreBackup()).toBe(false);
    expect(vault.load().notionToken).toBe('ntn_live');
  });

  it('a vault sealed with another key is parked as .unreadable and never overwrites the good backup', () => {
    const dir = tmp();
    const good = new EncryptedTokenVault(dir, KEY_A);
    good.save({ googleRefreshToken: '1//g' });
    good.save({ googleRefreshToken: '1//g', notionToken: 'ntn_a' }); // creates .bak holding the 1-key state
    const bakBefore = fs.readFileSync(good.getBackupPath());

    const wrongKey = new EncryptedTokenVault(dir, KEY_B); // e.g. vault.key regenerated or ONQ_VAULT_KEY changed
    expect(wrongKey.load()).toEqual({});
    wrongKey.save({ telegramBotToken: '1:x' });
    expect(fs.existsSync(`${good.getVaultPath()}.unreadable`)).toBe(true);
    expect(fs.readFileSync(good.getBackupPath()).equals(bakBefore)).toBe(true);

    expect(good.restoreBackup()).toBe(true); // the owner can still get their data back with the right key
    expect(good.load().googleRefreshToken).toBe('1//g');
  });

  it('sign-out keeps credentials; only "disconnect all" over HTTP empties the vault (and leaves a backup)', async () => {
    const dataDir = tmp();
    const srv = await createOnQServer({ port: 0, dataDir, disableProactiveTimer: true });
    closers.push(() => srv.close());
    srv.vault.save({ googleRefreshToken: '1//g', notionToken: 'ntn_a', notionDatabaseId: 'db1' });

    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const h = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

    const out = await fetch(`${srv.url}/api/auth/signout`, { method: 'POST', headers: h });
    expect(out.status).toBe(200);
    expect(srv.vault.load()).toMatchObject({ googleRefreshToken: '1//g', notionToken: 'ntn_a' });

    const { sessionToken: second } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const h2 = { Authorization: `Bearer ${second}`, 'Content-Type': 'application/json' };

    const one = await fetch(`${srv.url}/api/connectors/disconnect`, { method: 'POST', headers: h2, body: JSON.stringify({ provider: 'notion' }) });
    expect(one.status).toBe(200);
    expect(srv.vault.load().notionToken).toBeUndefined();
    expect(srv.vault.load().googleRefreshToken).toBe('1//g');

    const all = await fetch(`${srv.url}/api/connectors/disconnect`, { method: 'POST', headers: h2, body: JSON.stringify({ provider: 'all' }) });
    expect(all.status).toBe(200);
    expect(srv.vault.load()).toEqual({});
    expect(srv.vault.restoreBackup()).toBe(true);
    expect(srv.vault.load().googleRefreshToken).toBe('1//g');
  });
});
