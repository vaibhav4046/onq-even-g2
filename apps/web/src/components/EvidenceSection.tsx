import { GlyphDecodeHeading, ScrollReveal } from './MotionPrimitives';

export function EvidenceSection() {
  const citations = [
    {
      source: 'MICROSOFT WORK TREND INDEX (2023-2025)',
      headline: '275 daily interruptions, 57% communicating vs 43% creating',
      detail: '68% of workers lack uninterrupted focus time; 55% leave meetings with unclear next steps.',
    },
    {
      source: 'MARK, GUDITH & KLOCKE (CHI 2008)',
      headline: 'Context switching raises measurable stress & time pressure',
      detail: 'doi:10.1145/1357054.1357072: interrupted workers rush to catch up at direct cognitive cost.',
    },
    {
      source: '24 NOV 2026 AUDIT (54 ENTRIES)',
      headline: 'Track 04 competitors stop at single-app read or mock stubs',
      detail: 'Aside is Notion-only, Nod is sample Gmail-only, FUSE Brief writes in memory without live OAuth.',
    },
  ];

  const matrix = [
    {
      project: 'OnQ (Track 04)',
      scope: 'GCal + Gmail + Drive + Notion + .ics',
      stt: 'AssemblyAI STT-3.7 + TTS-1 / Whisper',
      safety: 'Default-NO + 2.0s Ring + 409 Lock + Code-Guard',
      tests: '189 tests + 11/11 Geometry Gate',
      highlight: true,
    },
    {
      project: 'Aside (Track 04)',
      scope: 'Notion only',
      stt: 'Scripted demo transcripts',
      safety: 'Draft confirm (no 409/ring)',
      tests: '48 tests',
      highlight: false,
    },
    {
      project: 'Nod (Track 04)',
      scope: 'Sample Gmail only',
      stt: 'No calendar or Notion write',
      safety: 'Basic triage confirm',
      tests: '13 tests',
      highlight: false,
    },
    {
      project: 'FUSE Brief (Track 04)',
      scope: 'Offline .ics / .mbox exports',
      stt: 'In-memory writes only',
      safety: 'No live OAuth writeback',
      tests: 'No repo suite in audit',
      highlight: false,
    },
    {
      project: 'TapBack / PinGuard (Track 01)',
      scope: 'Telegram only',
      stt: 'whisper.cpp / BM25',
      safety: '2s undo / 409 lock',
      tests: '132 / 82 tests',
      highlight: false,
    },
  ];

  return (
    <section id="evidence" className="section-rule py-20 sm:py-28">
      <div className="container-page space-y-10">
        <ScrollReveal className="space-y-2 max-w-2xl">
          <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
            EVIDENCE &amp; BENCHMARK
          </p>
          <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
            <span className="block text-[var(--lightgray)]">Measured problem.</span>
            <GlyphDecodeHeading text="Verified margin." className="block text-[var(--bright)]" />
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.05}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px border border-dashed border-[var(--hairline)] bg-[var(--hairline)]">
            {citations.map((c) => (
              <article key={c.source} className="bg-[var(--ink)] p-6 space-y-2.5">
                <div className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lightgray)]">
                  {c.source}
                </div>
                <h3 className="font-display text-lg font-bold text-[var(--bright)] leading-snug">{c.headline}</h3>
                <p className="text-xs leading-relaxed text-[var(--lightgray)]">{c.detail}</p>
              </article>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="overflow-x-auto border border-dashed border-[var(--hairline)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--surface)] border-b border-dashed border-[var(--hairline)] text-[var(--lightgray)] font-pixel text-[10px] uppercase tracking-[0.15em]">
                  <th className="p-4">Entry</th>
                  <th className="p-4">Scope</th>
                  <th className="p-4">Voice / Execution</th>
                  <th className="p-4">Write Safety</th>
                  <th className="p-4">Verified Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-[var(--hairline)]">
                {matrix.map((row) => (
                  <tr
                    key={row.project}
                    className={row.highlight ? 'bg-[var(--lime-deep)] text-[var(--bright)]' : 'bg-[var(--ink)] text-[var(--lightgray)]'}
                  >
                    <td className={`p-4 font-semibold ${row.highlight ? 'text-[var(--lime)]' : 'text-[var(--bright)]'}`}>
                      {row.project}
                    </td>
                    <td className="p-4">{row.scope}</td>
                    <td className="p-4">{row.stt}</td>
                    <td className="p-4">{row.safety}</td>
                    <td className="p-4">{row.tests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
