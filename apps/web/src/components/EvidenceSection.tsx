export function EvidenceSection() {
  const citations = [
    {
      source: 'MICROSOFT WORK TREND INDEX (2023-2025)',
      headline: '275 daily interruptions, 57% communicating vs 43% creating',
      detail:
        'Microsoft 365 telemetry documents interruptions every ~2 minutes during core hours, 68% of workers lacking focus time, 55% leaving meetings with unclear next steps, and 60% of meetings now ad-hoc.',
    },
    {
      source: 'MARK, GUDITH & KLOCKE (UC IRVINE, CHI 2008)',
      headline: 'Context switching drives measurable stress & time pressure',
      detail:
        'Published in Proceedings of SIGCHI (doi:10.1145/1357054.1357072): interrupted workers compensate by working faster at the direct cost of higher stress, frustration, and mental effort.',
    },
    {
      source: 'WHY EXISTING G2 TOOLS LEAVE A GAP (24 NOV AUDIT)',
      headline: 'Read-only briefs or single-app silos break in the corridor',
      detail:
        'Across 54 audited entries, Aside is Notion-only with scripted voice, Nod is Gmail-only on a sample inbox, and FUSE Brief uses offline .ics/.mbox with local-only in-memory writes.',
    },
  ];

  const matrix = [
    {
      project: 'OnCue (Track 04)',
      scope: 'GCal + Gmail + Drive + Notion + .ics',
      stt: 'Local 16kHz Whisper + RMS Gate',
      safety: 'Default-NO + 2.0s Ring + 409 Lock + Code-Guard',
      tests: '162 tests + 11/11 Geometry Gate',
      highlight: true,
    },
    {
      project: 'Aside (Track 04)',
      scope: 'Notion only (+ manual TG bot)',
      stt: 'Scripted transcripts in demo',
      safety: 'Confirm draft (no 409/ring)',
      tests: '48 tests',
      highlight: false,
    },
    {
      project: 'Nod (Track 04)',
      scope: 'Gmail triage only (sample inbox)',
      stt: 'No calendar/Notion writeback',
      safety: 'Basic triage confirmation',
      tests: '13 tests',
      highlight: false,
    },
    {
      project: 'FUSE Brief (Track 04)',
      scope: 'Offline .ics / .mbox exports',
      stt: 'Local in-memory writes only',
      safety: 'No real OAuth writeback',
      tests: 'No isolated repo suite in audit',
      highlight: false,
    },
    {
      project: 'TapBack / PinGuard (Track 01)',
      scope: 'Telegram messaging only',
      stt: 'whisper.cpp / BM25 clustering',
      safety: '2s undo / 409 admin lock',
      tests: '132 / 82 tests',
      highlight: false,
    },
  ];

  return (
    <section id="evidence" className="section-rule py-20 sm:py-28">
      <div className="container-page space-y-12">
        <div className="space-y-3">
          <p className="font-pixel text-xs uppercase tracking-[0.25em] text-[var(--lightgray)]">
            PROBLEM RESEARCH &amp; GALLERY BENCHMARK
          </p>
          <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
            <span className="block text-[var(--lightgray)]">Grounded in research.</span>
            <span className="block text-[var(--bright)]">Built to close every gap.</span>
          </h2>
        </div>

        {/* Cited Published Research */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px border border-dashed border-[var(--hairline)] bg-[var(--hairline)]">
          {citations.map((c) => (
            <article key={c.source} className="bg-[var(--ink)] p-6 space-y-3">
              <div className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--lime)]">
                {c.source}
              </div>
              <h3 className="font-display text-lg font-bold text-[var(--bright)]">{c.headline}</h3>
              <p className="text-xs leading-relaxed text-[var(--lightgray)]">{c.detail}</p>
            </article>
          ))}
        </div>

        {/* 4-Step Problem-to-Solution Framework */}
        <div className="border border-dashed border-[var(--hairline)] bg-[var(--surface)] p-6 space-y-4">
          <div className="font-pixel text-[11px] uppercase tracking-[0.2em] text-[var(--bright)]">
            PROBLEM FRAMEWORK: 90-SECOND CORRIDOR EXECUTION
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-1.5">
              <span className="font-pixel text-[10px] text-[var(--lime)]">01 / DIAGNOSIS</span>
              <p className="text-[var(--bright)] font-semibold">Split-Context Tax</p>
              <p className="text-[var(--lightgray)]">
                Before entering a room, key asks sit split across Calendar, Gmail, Drive, and Notion.
              </p>
            </div>
            <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-1.5">
              <span className="font-pixel text-[10px] text-[var(--lime)]">02 / CONSTRAINT</span>
              <p className="text-[var(--bright)] font-semibold">42-Col Waveguide</p>
              <p className="text-[var(--lightgray)]">
                Even G2 fits 7 lines x 42 cols (&lt;= 999B). Phone dashboards fail; rules must rank first.
              </p>
            </div>
            <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-1.5">
              <span className="font-pixel text-[10px] text-[var(--lime)]">03 / SAFETY MOAT</span>
              <p className="text-[var(--bright)] font-semibold">4-Layer Write Lock</p>
              <p className="text-[var(--lightgray)]">
                RMS gate, Default-NO diff, 2.0s 4-bit PNG Undo Ring, and live HTTP 409 Conflict Hard-Lock.
              </p>
            </div>
            <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-1.5">
              <span className="font-pixel text-[10px] text-[var(--lime)]">04 / VERIFICATION</span>
              <p className="text-[var(--bright)] font-semibold">Auditable Artifacts</p>
              <p className="text-[var(--lightgray)]">
                Clean-room tests, 11-check Chromium Geometry Gate, 0.9.5 Simulator captures, and .ehpk.
              </p>
            </div>
          </div>
        </div>

        {/* Competitive Gap Table from 24 Nov 2026 Audit */}
        <div className="overflow-x-auto border border-dashed border-[var(--hairline)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--surface)] border-b border-dashed border-[var(--hairline)] text-[var(--lightgray)] font-pixel text-[10px] uppercase tracking-[0.15em]">
                <th className="p-4">Entry</th>
                <th className="p-4">Workspace Scope</th>
                <th className="p-4">Voice / Input</th>
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
      </div>
    </section>
  );
}
