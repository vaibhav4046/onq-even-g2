import { defuddleHtmlToText, TokenSavingsLedger } from './tokenOptimizer.js';

export interface KnowledgeDoc {
  id: string;
  title: string;
  source: string;
  url?: string;
  content: string;
  addedAtIso: string;
}

export interface CitedSnippet {
  index: number;
  docId: string;
  title: string;
  source: string;
  url?: string;
  excerpt: string;
  score: number;
}

export interface RagQueryResult {
  query: string;
  answer: string;
  citations: CitedSnippet[];
  lensLines: string[];
}

export interface TastePreferences {
  verbosity: 'caveman' | 'concise' | 'detailed';
  visualStyle: 'monochrome-matrix' | 'motion' | 'illustrated' | '3d';
  defaultRole: 'architect' | 'market_analyst' | 'bot_engineer' | 'security_auditor';
  updatedAtIso: string;
}

/**
 * Validates that external URL ingestion never targets loopback, link-local, or private subnets (SSRF guard).
 */
export function isSafePublicHttpUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

const DEFAULT_KNOWLEDGE: KnowledgeDoc[] = [
  {
    id: 'kb_onq_safety',
    title: 'OnQ Default-NO & 409 Lock Spec',
    source: 'OnQ Docs',
    content:
      'Every workspace mutation stages under Default-NO with 45s single-use previewToken, SHA-256 idempotencyKey, 2.0s optical countdown ring cancel window, and pre-commit HTTP 409 conflict verification.',
    addedAtIso: '2026-11-25T00:00:00Z',
  },
  {
    id: 'kb_onq_g2_hw',
    title: 'Even Realities G2 Optical & Sensor Constraints',
    source: 'EvenHub 0.0.16 Spec',
    content:
      'Even G2 uses a 576x288 4-bit monochrome green waveguide display with zero camera and zero built-in speaker. Audio routes via paired Bluetooth earbuds; input comes via G2 microphone PCM, temple touchpad, or R1 ring.',
    addedAtIso: '2026-11-25T00:00:00Z',
  },
  {
    id: 'kb_onq_harness',
    title: 'OnQ Multi-Model & Token Compression Harness',
    source: 'OnQ Architecture',
    content:
      'Routes across Claude, OpenRouter free cascade, Grok xAI, OmniRoute 1,400+ models, ChatGPT, and local account CLIs using TOON tabular compression, Defuddle web stripping, and RTK log reduction.',
    addedAtIso: '2026-11-25T00:00:00Z',
  },
];

export class CitedKnowledgeEngine {
  private docs: KnowledgeDoc[] = [...DEFAULT_KNOWLEDGE];
  private taste: TastePreferences = {
    verbosity: 'caveman',
    visualStyle: 'monochrome-matrix',
    defaultRole: 'architect',
    updatedAtIso: new Date().toISOString(),
  };

  constructor(private readonly tokenLedger: TokenSavingsLedger) {}

  listDocs(): KnowledgeDoc[] {
    return [...this.docs];
  }

  getTaste(): TastePreferences {
    return { ...this.taste };
  }

  updateTaste(patch: Partial<TastePreferences>): TastePreferences {
    this.taste = {
      ...this.taste,
      ...patch,
      updatedAtIso: new Date().toISOString(),
    };
    return this.getTaste();
  }

  addDocument(input: { title: string; source: string; url?: string; content: string }): KnowledgeDoc {
    const doc: KnowledgeDoc = {
      id: `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: input.title.trim().slice(0, 90) || 'Knowledge Note',
      source: input.source.trim().slice(0, 48) || 'Workspace',
      url: input.url,
      content: input.content.trim().slice(0, 8000),
      addedAtIso: new Date().toISOString(),
    };
    this.docs = [doc, ...this.docs.filter((d) => d.title !== doc.title)].slice(0, 48);
    return doc;
  }

  async ingestUrl(
    url: string,
    fetchImpl: typeof fetch = fetch,
  ): Promise<{ doc: KnowledgeDoc; rawChars: number; cleanChars: number }> {
    if (!isSafePublicHttpUrl(url)) {
      throw new Error('Blocked unsafe or non-HTTP(S) URL for Defuddle ingestion');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': 'OnQ-Defuddle/1.0' },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`URL fetch returned HTTP ${res.status}`);
      }
      const html = await res.text();
      const cleaned = defuddleHtmlToText(html);
      this.tokenLedger.record('DEFUDDLE', new URL(url).hostname, html.length, cleaned.markdown.length);
      const doc = this.addDocument({
        title: cleaned.title || url,
        source: `Defuddle · ${new URL(url).hostname}`,
        url,
        content: cleaned.markdown || cleaned.title,
      });
      return { doc, rawChars: html.length, cleanChars: cleaned.markdown.length };
    } finally {
      clearTimeout(timer);
    }
  }

  query(queryText: string, extraMemories: Array<{ id: string; title: string; summary: string; source: string }> = []): RagQueryResult {
    const cleanQ = queryText.trim();
    const terms = cleanQ
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2);

    const pool: KnowledgeDoc[] = [
      ...this.docs,
      ...extraMemories.map((m) => ({
        id: m.id,
        title: m.title,
        source: m.source || 'Unified Memory',
        content: m.summary,
        addedAtIso: new Date().toISOString(),
      })),
    ];

    const scored = pool
      .map((doc) => {
        const hay = `${doc.title} ${doc.content} ${doc.source}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (hay.includes(t)) {
            score += doc.title.toLowerCase().includes(t) ? 3 : 1;
          }
        }
        return { doc, score };
      })
      .sort((a, b) => b.score - a.score);

    const top = scored.filter((s) => s.score > 0).slice(0, 3);
    const chosen = top.length > 0 ? top : scored.slice(0, 2);
    const citations: CitedSnippet[] = chosen.map((item, idx) => ({
      index: idx + 1,
      docId: item.doc.id,
      title: item.doc.title,
      source: item.doc.source,
      url: item.doc.url,
      excerpt: item.doc.content.slice(0, 140),
      score: item.score,
    }));

    const answer =
      citations.length === 0
        ? 'No indexed documents matched.'
        : citations
            .map((c) => `[${c.index}] ${c.title}: ${c.excerpt}`)
            .join(' · ');

    const lensLines = [
      `RAG CITE: ${cleanQ.slice(0, 31)}`,
      ...citations.slice(0, 3).map((c) => `[${c.index}] ${c.title.slice(0, 38)}`),
    ];
    return { query: cleanQ, answer, citations, lensLines };
  }
}
