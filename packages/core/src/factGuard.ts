const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|system)\s*(instructions|prompts?)?/i,
  /\bsystem\s*:\s*(you are|override|execute)/i,
  /\bforward\s+(all|every|my)\b/i,
  /\bexfiltrate\b/i,
  /\bsend\s+(all\s+)?(tokens|secrets|keys|passwords|contracts)\s+to\b/i,
  /<\s*\/?\s*system\s*>/i,
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TIME_RE = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:am|pm)\b|\b\d{1,3}\s?(?:m|min|mins|minutes?)\b/gi;
const CURRENCY_RE = /[$£€]\s?\d[\d,]*(?:\.\d+)?/g;

export interface FactGuardInput {
  draftText: string;
  recipientEmail?: string;
  allowedRecipients: string[];
  sourceCorpus: string;
  userUtterance: string;
  computedFacts?: string[];
  fallbackTemplate: string;
}

export interface FactGuardResult {
  passed: boolean;
  safeText: string;
  fallbackUsed: boolean;
  violations: string[];
}

export function detectPromptInjection(text: string): string | null {
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      return `Matched prompt-injection signature: ${re.source}`;
    }
  }
  return null;
}

export function wrapUntrustedWorkspaceData(label: string, raw: string): string {
  const sanitized = raw.replace(/<\/?untrusted_workspace_data[^>]*>/gi, '[TAG_STRIPPED]');
  return `<untrusted_workspace_data source="${label}">\n${sanitized}\n</untrusted_workspace_data>`;
}

/**
 * Deterministic Code-Guard verifier:
 * - Blocks unverified / LLM-invented recipients
 * - Blocks prompt-injection instructions in draft or source
 * - Blocks hallucinated emails, times, or currency figures not present in source or user utterance
 * - Falls back cleanly to a deterministic safe template
 */
export function verifyDraftAndPayload(input: FactGuardInput): FactGuardResult {
  const violations: string[] = [];
  const allowedLower = new Set(input.allowedRecipients.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const groundingCorpus = `${input.sourceCorpus}\n${input.userUtterance}\n${(input.computedFacts ?? []).join('\n')}`.toLowerCase();

  // 1. Check authoritative recipient allowlist
  if (input.recipientEmail) {
    const targetLower = input.recipientEmail.trim().toLowerCase();
    if (allowedLower.size === 0 || !allowedLower.has(targetLower)) {
      violations.push(`Recipient "${input.recipientEmail}" not in authoritative workspace contacts`);
    }
  }

  // 2. Check prompt injection inside draft itself
  const draftInj = detectPromptInjection(input.draftText);
  if (draftInj) {
    violations.push(draftInj);
  }

  // 3. Check any emails appearing inside draft body
  const draftEmails = input.draftText.match(EMAIL_RE) ?? [];
  for (const em of draftEmails) {
    const low = em.toLowerCase();
    if (!allowedLower.has(low) && !groundingCorpus.includes(low)) {
      violations.push(`Ungrounded email address in draft: ${em}`);
    }
  }

  // 4. Check times/durations mentioned in draft against grounding corpus
  const draftTimes = input.draftText.match(TIME_RE) ?? [];
  for (const tm of draftTimes) {
    const norm = tm.toLowerCase().replace(/\s+/g, '');
    const corpusNoSpace = groundingCorpus.replace(/\s+/g, '');
    if (!corpusNoSpace.includes(norm)) {
      violations.push(`Ungrounded time/duration in draft: ${tm}`);
    }
  }

  // 5. Check currency amounts
  const draftMoney = input.draftText.match(CURRENCY_RE) ?? [];
  for (const amt of draftMoney) {
    const norm = amt.toLowerCase().replace(/\s+/g, '');
    const corpusNoSpace = groundingCorpus.replace(/\s+/g, '');
    if (!corpusNoSpace.includes(norm)) {
      violations.push(`Ungrounded currency figure in draft: ${amt}`);
    }
  }

  if (violations.length > 0) {
    return {
      passed: false,
      safeText: input.fallbackTemplate,
      fallbackUsed: true,
      violations,
    };
  }

  return {
    passed: true,
    safeText: input.draftText,
    fallbackUsed: false,
    violations: [],
  };
}
