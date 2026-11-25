import { motion, useReducedMotion } from 'motion/react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * 01 · Corridor Brief: Workspace signals (Calendar, Gmail, Drive) converging into a crisp 42-col G2 lens readout.
 */
export function CorridorBriefVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="retro-glass-well relative h-24 w-full overflow-hidden flex items-center justify-center px-3">
      <svg viewBox="0 0 260 76" className="w-full h-full" aria-hidden="true">
        {/* Left incoming nodes */}
        {[
          { y: 16, label: 'CAL', color: '#daff52', delay: 0 },
          { y: 38, label: 'MAIL', color: '#34F57E', delay: 0.35 },
          { y: 60, label: 'DOC', color: '#8ab4ff', delay: 0.7 },
        ].map((node) => (
          <g key={node.label}>
            <rect x="10" y={node.y - 7} width="34" height="14" fill="#0d110f" stroke={node.color} strokeOpacity="0.65" strokeWidth="1" />
            <text x="27" y={node.y + 3} textAnchor="middle" fill={node.color} fontSize="7" fontFamily="monospace" fontWeight="700">
              {node.label}
            </text>
            <path d={`M44 ${node.y} C 82 ${node.y}, 94 38, 122 38`} fill="none" stroke={node.color} strokeOpacity="0.28" strokeWidth="1" strokeDasharray="3 3" />
            {!reduced && (
              <motion.circle
                r="2.2"
                fill={node.color}
                initial={{ cx: 46, cy: node.y, opacity: 0 }}
                animate={{ cx: [46, 86, 122], cy: [node.y, (node.y + 38) / 2, 38], opacity: [0, 1, 0] }}
                transition={{ duration: 2.1, repeat: Infinity, delay: node.delay, ease: EASE }}
              />
            )}
          </g>
        ))}

        {/* Right 525nm waveguide viewport */}
        <rect x="124" y="10" width="124" height="56" rx="6" fill="#04110a" stroke="#34F57E" strokeOpacity="0.65" strokeWidth="1.2" />
        <text x="134" y="25" fill="#daff52" fontSize="7" fontFamily="monospace" fontWeight="700">
          LIVE | 14:00 VC SYNC
        </text>
        <text x="134" y="40" fill="#34F57E" fontSize="6.5" fontFamily="monospace">
          ASK: Q4 deck ready?
        </text>
        <text x="134" y="53" fill="#239e53" fontSize="6.5" fontFamily="monospace">
          DOC: Q4_Metrics_v3
        </text>
        {!reduced && (
          <motion.rect
            x="126"
            width="120"
            height="1.5"
            fill="#34F57E"
            opacity={0.35}
            animate={{ y: [14, 62, 14] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </svg>
    </div>
  );
}

/**
 * 02 · One-Line Reschedule & Reply: Timeline slot glides +15m smoothly into free green window + confirmation pulse.
 */
export function ShiftScheduleVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="retro-glass-well relative h-24 w-full overflow-hidden flex items-center justify-center px-3">
      <svg viewBox="0 0 260 76" className="w-full h-full" aria-hidden="true">
        <line x1="16" y1="22" x2="244" y2="22" stroke="#222" strokeWidth="1" strokeDasharray="3 3" />
        <text x="16" y="15" fill="#777" fontSize="7" fontFamily="monospace">14:00</text>
        <text x="92" y="15" fill="#34F57E" fontSize="7" fontFamily="monospace">14:15 FREE</text>
        <text x="184" y="15" fill="#777" fontSize="7" fontFamily="monospace">14:45</text>

        {/* Original faded slot */}
        <rect x="16" y="27" width="84" height="22" fill="none" stroke="#444" strokeDasharray="3 2" strokeWidth="1" />
        {/* Animated shifted block */}
        <motion.g
          animate={reduced ? undefined : { x: [0, 32, 32, 0] }}
          transition={{ duration: 3.8, repeat: Infinity, times: [0, 0.35, 0.78, 1], ease: EASE }}
        >
          <rect x="16" y="27" width="84" height="22" fill="#082414" stroke="#34F57E" strokeWidth="1.2" />
          <text x="23" y="41" fill="#daff52" fontSize="7.2" fontFamily="monospace" fontWeight="700">
            SYNC +15M OK
          </text>
        </motion.g>

        {/* Thread confirmation pill on right */}
        <motion.g
          animate={reduced ? undefined : { opacity: [0.35, 1, 1, 0.35] }}
          transition={{ duration: 3.8, repeat: Infinity, times: [0, 0.45, 0.8, 1] }}
        >
          <rect x="150" y="27" width="96" height="22" fill="#0d1510" stroke="#daff52" strokeOpacity="0.7" strokeWidth="1" />
          <text x="157" y="41" fill="#34F57E" fontSize="6.8" fontFamily="monospace">
            MAIL DRAFT SENT
          </text>
        </motion.g>

        <text x="16" y="65" fill="#6b7280" fontSize="6.5" fontFamily="monospace">
          DEFAULT-NO · 2.0S UNDO RING VERIFIED
        </text>
      </svg>
    </div>
  );
}

/**
 * 03 · Private In-Room Scribe: Dual speaker waveforms isolated inside volatile RAM chip (0 bytes written to disk).
 */
export function InRoomScribeVisual() {
  const reduced = useReducedMotion();
  const heights = [10, 18, 13, 24, 15, 22, 11, 17];
  return (
    <div className="retro-glass-well relative h-24 w-full overflow-hidden flex items-center justify-center px-3">
      <svg viewBox="0 0 260 76" className="w-full h-full" aria-hidden="true">
        {/* Speaker A & B animated equalizer bars */}
        {heights.map((h, i) => (
          <motion.rect
            key={i}
            x={16 + i * 11}
            width="6"
            rx="1"
            fill={i % 2 === 0 ? '#34F57E' : '#daff52'}
            initial={{ y: 38 - h / 2, height: h }}
            animate={
              reduced
                ? undefined
                : {
                    height: [h * 0.45, h, h * 0.6],
                    y: [38 - (h * 0.45) / 2, 38 - h / 2, 38 - (h * 0.6) / 2],
                  }
            }
            transition={{ duration: 1.2 + (i % 3) * 0.25, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}

        <path d="M108 38 L138 38" stroke="#34F57E" strokeWidth="1.2" strokeDasharray="3 3" />

        {/* RAM badge (Zero disk persistence) */}
        <rect x="142" y="13" width="104" height="50" fill="#07160e" stroke="#34F57E" strokeOpacity="0.7" strokeWidth="1.2" />
        <text x="152" y="29" fill="#daff52" fontSize="7.5" fontFamily="monospace" fontWeight="700">
          RAM-ONLY BUFFER
        </text>
        <text x="152" y="42" fill="#34F57E" fontSize="6.5" fontFamily="monospace">
          SPK A + SPK B LIVE
        </text>
        <text x="152" y="54" fill="#6ee7b7" fontSize="6" fontFamily="monospace">
          0 AUDIO ON DISK
        </text>
      </svg>
    </div>
  );
}

/**
 * 04 · Quiet Earbuds Recall: Voice query hits lens text AND streams TTS-1 word-synced pulses to earbuds.
 */
export function EarbudsRecallVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="retro-glass-well relative h-24 w-full overflow-hidden flex items-center justify-center px-3">
      <svg viewBox="0 0 260 76" className="w-full h-full" aria-hidden="true">
        <rect x="12" y="14" width="108" height="48" fill="#09110d" stroke="#34F57E" strokeOpacity="0.55" strokeWidth="1" />
        <text x="20" y="30" fill="#daff52" fontSize="7" fontFamily="monospace" fontWeight="700">
          &quot;ONQ, Q4 STATUS?&quot;
        </text>
        <text x="20" y="43" fill="#34F57E" fontSize="6.5" fontFamily="monospace">
          DECK LOCKED THU
        </text>
        <text x="20" y="54" fill="#239e53" fontSize="6" fontFamily="monospace">
          G2 LENS + TTS-1
        </text>

        {/* Sound wave arcs into earbud icon */}
        {[1, 2, 3].map((ring) => (
          <motion.circle
            key={ring}
            cx="198"
            cy="38"
            r={10 + ring * 7}
            fill="none"
            stroke={ring === 1 ? '#daff52' : '#34F57E'}
            strokeWidth="1.2"
            animate={reduced ? undefined : { opacity: [0.15, 0.85, 0.15], scale: [0.94, 1.06, 0.94] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: ring * 0.25 }}
            style={{ transformOrigin: '198px 38px' }}
          />
        ))}
        <circle cx="198" cy="38" r="8" fill="#daff52" />
        <path d="M198 46 L198 59" stroke="#daff52" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/**
 * 05 · Instant Post-Meeting Wrap-Up: Spoken decisions fan cleanly into Notion + Calendar + Gmail under Default-NO.
 */
export function WrapUpFanoutVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="retro-glass-well relative h-24 w-full overflow-hidden flex items-center justify-center px-3">
      <svg viewBox="0 0 260 76" className="w-full h-full" aria-hidden="true">
        <rect x="12" y="20" width="76" height="36" fill="#0b1510" stroke="#daff52" strokeWidth="1.2" />
        <text x="50" y="36" textAnchor="middle" fill="#daff52" fontSize="7" fontFamily="monospace" fontWeight="700">
          WRAP-UP
        </text>
        <text x="50" y="48" textAnchor="middle" fill="#34F57E" fontSize="6" fontFamily="monospace">
          DEFAULT: NO
        </text>

        {[
          { y: 17, label: 'NOTION TASK', color: '#ffffff' },
          { y: 38, label: 'GCAL HOLD', color: '#daff52' },
          { y: 59, label: 'MAIL DRAFT', color: '#34F57E' },
        ].map((target, idx) => (
          <g key={target.label}>
            <path d={`M88 38 L142 ${target.y}`} stroke="#34F57E" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 2" />
            {!reduced && (
              <motion.circle
                r="2"
                fill="#daff52"
                animate={{ cx: [88, 142], cy: [38, target.y], opacity: [0, 1, 0] }}
                transition={{ duration: 1.9, repeat: Infinity, delay: idx * 0.35, ease: EASE }}
              />
            )}
            <rect x="144" y={target.y - 8} width="102" height="16" fill="#0d1110" stroke={target.color} strokeOpacity="0.65" strokeWidth="1" />
            <text x="195" y={target.y + 3} textAnchor="middle" fill={target.color} fontSize="6.6" fontFamily="monospace" fontWeight="700">
              {target.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * 06 · Double-Booking & Prompt Shield: Blocked 14:45 slot triggers amber 409 SHIELD and auto-jumps to 15:45 FREE.
 */
export function ConflictShieldVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="retro-glass-well relative h-24 w-full overflow-hidden flex items-center justify-center px-3">
      <svg viewBox="0 0 260 76" className="w-full h-full" aria-hidden="true">
        {/* Blocked 14:45 collision box */}
        <rect x="14" y="16" width="96" height="44" fill="#1f1103" stroke="#ffb020" strokeWidth="1.3" />
        <text x="62" y="34" textAnchor="middle" fill="#ffb020" fontSize="7.5" fontFamily="monospace" fontWeight="700">
          409 LOCKED
        </text>
        <text x="62" y="47" textAnchor="middle" fill="#ffd280" fontSize="6" fontFamily="monospace">
          14:45 BUSY · 0 EDITS
        </text>

        {/* Animated shield bounce arrow */}
        <motion.path
          d="M114 38 L142 38"
          stroke="#ffb020"
          strokeWidth="1.5"
          strokeDasharray="3 2"
          animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />

        {/* Verified next free slot */}
        <motion.g
          animate={reduced ? undefined : { opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          <rect x="146" y="16" width="100" height="44" fill="#051c0f" stroke="#34F57E" strokeWidth="1.3" />
          <text x="196" y="34" textAnchor="middle" fill="#daff52" fontSize="7.5" fontFamily="monospace" fontWeight="700">
            15:45 FREE
          </text>
          <text x="196" y="47" textAnchor="middle" fill="#34F57E" fontSize="6" fontFamily="monospace">
            SAFE STAGE READY
          </text>
        </motion.g>
      </svg>
    </div>
  );
}
