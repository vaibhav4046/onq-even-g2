import fs from 'node:fs';
import { runCliPrompt } from './cliRunner.js';
import type { BrowserContext, Page } from 'playwright';
import { detectLocalComputerTools } from '../providers/localComputerBridge.js';
import { orchestrateStructuredJson, type LlmConfig } from './modelRouter.js';
import {
  BROWSER_SYSTEM_PROMPT,
  buildPlannerPrompt,
  validatePlan,
  type BrowserDriver,
  type PageSnapshot,
  type Planner,
  type PlannerOutput,
} from './browserAgent.js';

/**
 * Drives the user's own installed Chrome (their PC, their network) with a dedicated OnQ profile, so the user
 * signs in to sites once in that window and OnQ reuses the session. Falls back to Playwright's Chromium.
 */
export function createLocalChromeDriver(opts: { profileDir: string; headless: boolean }): BrowserDriver {
  let ctx: BrowserContext | null = null;
  let page: Page | null = null;

  const getPage = async (): Promise<Page> => {
    if (page && !page.isClosed()) return page;
    const pw = await import('playwright');
    fs.mkdirSync(opts.profileDir, { recursive: true });
    const launch = (channel?: string) =>
      pw.chromium.launchPersistentContext(opts.profileDir, {
        channel,
        headless: opts.headless,
        viewport: { width: 1280, height: 860 },
      });
    try {
      ctx = await launch('chrome'); // the user's installed Google Chrome
    } catch {
      ctx = await launch(undefined); // bundled Chromium (needs `npx playwright install chromium`)
    }
    page = ctx.pages()[0] ?? (await ctx.newPage());
    return page;
  };

  const settle = async (p: Page) => {
    await p.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined);
    await p.waitForTimeout(400);
  };

  return {
    async goto(url) {
      const p = await getPage();
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await settle(p);
    },
    async snapshot(): Promise<PageSnapshot> {
      const p = await getPage();
      return p.evaluate(() => {
        const visible = (e: Element) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none';
        };
        document.querySelectorAll('[data-onq-id]').forEach((e) => e.removeAttribute('data-onq-id'));
        const nodes = Array.from(
          document.querySelectorAll('a[href],button,input,textarea,select,[role=button],[role=link],[role=searchbox],[role=tab]'),
        )
          .filter(visible)
          .slice(0, 60);
        const elements = nodes.map((node, i) => {
          const e = node as HTMLElement & { value?: string };
          e.setAttribute('data-onq-id', String(i + 1));
          const tag = e.tagName.toLowerCase();
          const type = (e.getAttribute('type') || '').toLowerCase();
          const attr = (n: string) => e.getAttribute(n) || '';
          const name = (attr('aria-label') || e.innerText || attr('placeholder') || (type !== 'password' ? e.value : '') || attr('name') || attr('title'))
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 80);
          const hint = `${attr('name')} ${attr('autocomplete')} ${e.id} ${attr('placeholder')}`;
          const kind = tag === 'a' || attr('role') === 'link' ? 'link' : tag === 'input' || tag === 'textarea' || tag === 'select' ? 'input' : 'button';
          return {
            id: i + 1,
            kind: kind as 'link' | 'button' | 'input',
            name,
            sensitive: type === 'password' || /pass|card|cc-|cvv|cvc|otp|one-time|ssn|iban|security code/i.test(hint),
            search: type === 'search' || attr('role') === 'searchbox' || /search|^q$/i.test(`${attr('name')} ${attr('placeholder')} ${attr('aria-label')}`),
            submit: type === 'submit' || (tag === 'button' && (attr('type') || 'submit') === 'submit' && Boolean(e.closest('form'))),
          };
        });
        return {
          url: location.href,
          title: document.title,
          text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3000),
          elements,
        };
      });
    },
    async click(id) {
      const p = await getPage();
      await p.click(`[data-onq-id="${id}"]`, { timeout: 6000 });
      await settle(p);
    },
    async type(id, text, submit) {
      const p = await getPage();
      await p.fill(`[data-onq-id="${id}"]`, text, { timeout: 6000 });
      if (submit) await p.press(`[data-onq-id="${id}"]`, 'Enter');
      await settle(p);
    },
    async scroll(dir) {
      const p = await getPage();
      await p.mouse.wheel(0, dir === 'down' ? 700 : -700);
      await p.waitForTimeout(300);
    },
    async close() {
      const c = ctx;
      ctx = null;
      page = null;
      await c?.close().catch(() => undefined);
    },
  };
}

export { runCliPrompt };

export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const NO_MODEL: PlannerOutput = {
  action: {
    type: 'done',
    answer:
      'No AI model is reachable, and fixed rules cannot browse. Add an OpenRouter, Claude or ChatGPT key in Connect, or sign in to the Claude Code or Codex CLI on this PC.',
  },
  reason: 'no model',
};

/**
 * Planner order: API-key models through the router (OpenRouter / Claude / ChatGPT), then the user's own
 * subscription via a local CLI (Claude Code, then Codex), then an honest "no model" finish.
 */
export function createBrowserPlanner(getLlmConfig: () => LlmConfig, opts: { useCli?: boolean } = {}): Planner {
  return async ({ goal, snapshot, history }) => {
    const userPrompt = buildPlannerPrompt(goal, snapshot, history);
    const routed = await orchestrateStructuredJson<PlannerOutput>(
      { systemPrompt: BROWSER_SYSTEM_PROMPT, userPrompt, fallbackJson: NO_MODEL, validate: validatePlan },
      getLlmConfig(),
    );
    if (!routed.fallbackUsed) return { plan: routed.data, providerLabel: routed.providerLabel };

    if (opts.useCli !== false) {
      const tools = detectLocalComputerTools();
      const cli =
        tools.find((t) => t.id === 'claude_cli' && t.installed && t.binaryPath) ??
        tools.find((t) => t.id === 'codex_cli' && t.installed && t.binaryPath);
      if (cli?.binaryPath) {
        const args = cli.id === 'claude_cli' ? ['-p'] : ['exec', '-'];
        try {
          const out = await runCliPrompt(cli.binaryPath, args, `${BROWSER_SYSTEM_PROMPT}\n\n${userPrompt}`);
          const plan = validatePlan(extractJson(out));
          if (plan) return { plan, providerLabel: `${cli.name} (your subscription)` };
        } catch {
          // fall through to the honest no-model finish
        }
      }
    }
    return { plan: NO_MODEL, providerLabel: routed.providerLabel };
  };
}
