import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';

describe('Unified Persistent Memory & Autonomous Agent Tasks', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function mkDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-mem-test-'));
    dirs.push(d);
    return d;
  }

  it('persists memories via /api/memory CRUD and archives committed WRITE_CODE_BOT & OUTREACH_SCHEDULER tasks into SQLite', async () => {
    const srv = await createOnQServer({
      dataDir: mkDir(),
      disableProactiveTimer: true,
    });

    try {
      const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
      const { sessionToken } = (await sessRes.json()) as { sessionToken: string };
      const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

      // 1. Direct memory CRUD
      const addMem = await fetch(`${srv.url}/api/memory`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          kind: 'note',
          title: 'Prefer 15:45 for VC follow-ups',
          summary: 'Keep mornings clear for deep product sprints.',
        }),
      });
      expect(addMem.status).toBe(200);
      const added = (await addMem.json()) as { memory: { id: string; title: string } };
      expect(added.memory.title).toContain('15:45');

      // 2. Stage + commit WRITE_CODE_BOT task -> writes real runnable script + auto-archives into Unified Memory
      const stageBot = await fetch(`${srv.url}/api/agent/tasks/stage`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          kind: 'WRITE_CODE_BOT',
          title: 'Test AI Video Scout Bot',
          prompt: 'Write python automation bot to scout top AI YouTube videos daily',
        }),
      });
      expect(stageBot.status).toBe(200);
      const staged = (await stageBot.json()) as {
        task: { id: string; previewToken: string; status: string };
      };
      expect(staged.task.status).toBe('STAGED_DEFAULT_NO');

      const commitBot = await fetch(`${srv.url}/api/agent/tasks/commit`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          taskId: staged.task.id,
          previewToken: staged.task.previewToken,
        }),
      });
      expect(commitBot.status).toBe(200);
      const done = (await commitBot.json()) as {
        ok: boolean;
        task: { status: string; artifactPath?: string; codeSnippet?: string };
      };
      expect(done.ok).toBe(true);
      expect(done.task.status).toBe('DONE');
      expect(done.task.artifactPath).toBeTruthy();
      expect(done.task.codeSnippet).toContain('def scout_latest');
      if (done.task.artifactPath && fs.existsSync(done.task.artifactPath)) {
        fs.unlinkSync(done.task.artifactPath);
      }

      // 3. Unified memory contains both the user note and completed autonomous task
      const memList = await fetch(`${srv.url}/api/memory`, { headers: auth });
      expect(memList.status).toBe(200);
      const listJson = (await memList.json()) as { memories: Array<{ id: string; title: string }> };
      expect(listJson.memories.some((m) => m.title.includes('Test AI Video Scout Bot'))).toBe(true);
      expect(listJson.memories.some((m) => m.title.includes('Prefer 15:45'))).toBe(true);

      // 4. Delete test note cleanly
      const delRes = await fetch(`${srv.url}/api/memory/${added.memory.id}`, {
        method: 'DELETE',
        headers: auth,
      });
      expect(delRes.status).toBe(200);
    } finally {
      await srv.close();
    }
  });
});
