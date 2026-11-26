import fs from 'node:fs';
import path from 'node:path';
import type { SnapshotSource } from '../harness/snapshotStore.js';
import { SNAPSHOT_SOURCES } from '../harness/snapshotStore.js';

/** Per-source choice: 'api' (token / OAuth), 'computer' (the owner's own logged-in Chrome), or 'auto'. */
export type SourceSetting = 'auto' | 'computer' | 'api';
export const SOURCE_SETTINGS: readonly SourceSetting[] = ['auto', 'computer', 'api'];

export const isSourceSetting = (v: unknown): v is SourceSetting => typeof v === 'string' && (SOURCE_SETTINGS as readonly string[]).includes(v);
export const isSourceId = (v: unknown): v is SnapshotSource => typeof v === 'string' && (SNAPSHOT_SOURCES as readonly string[]).includes(v);

/** Persisted in dataDir/source-modes.json. Default is 'auto' for every source. */
export class SourceModeStore {
  private modes: Record<SnapshotSource, SourceSetting> = { calendar: 'auto', gmail: 'auto', notion: 'auto', telegram: 'auto' };
  private readonly file: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = path.join(dataDir, 'source-modes.json');
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, unknown>;
        for (const s of SNAPSHOT_SOURCES) if (isSourceSetting(raw[s])) this.modes[s] = raw[s] as SourceSetting;
      }
    } catch {
      // corrupt settings fall back to auto
    }
  }

  get(source: SnapshotSource): SourceSetting {
    return this.modes[source];
  }

  /** Returns true when the value actually changed. */
  set(source: SnapshotSource, mode: SourceSetting): boolean {
    if (this.modes[source] === mode) return false;
    this.modes = { ...this.modes, [source]: mode };
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.modes), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch {
      // in-memory value still applies for this run
    }
    return true;
  }
}
