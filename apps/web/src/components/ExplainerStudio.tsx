import { useCallback, useEffect, useRef, useState } from 'react';

export type ExplainerVisualStyle = 'motion' | 'hand_drawn' | 'cinematic_3d';

export interface ExplainerSceneBeat {
  id: string;
  durationSec: number;
  headline: string;
  caption: string;
  metricBadge: string;
  visualCue: string;
}

interface ExplainerStudioProps {
  sessionToken: string | null;
  activeLlmProvider: string;
  onSyncToG2?: (lines: string[]) => void;
}

const DEFAULT_SCENES: ExplainerSceneBeat[] = [
  {
    id: 'sc_1',
    durationSec: 3.2,
    headline: '01 · EVEN G2 OPTICAL CORRIDOR',
    caption: 'Look once. Brief pulses straight into 525nm monochrome waveguide glass.',
    metricBadge: '60FPS · 7x42 GRID',
    visualCue: 'OPTICAL_HUD',
  },
  {
    id: 'sc_2',
    durationSec: 3.4,
    headline: '02 · OMNIROUTE & GROK FAILOVER',
    caption: 'Cascades Claude, Grok xAI, OmniRoute, OpenRouter, and GPT without stalling.',
    metricBadge: '5 ROUTES · ZERO KEYS LEAKED',
    visualCue: 'MODEL_GRAPH',
  },
  {
    id: 'sc_3',
    durationSec: 3.2,
    headline: '03 · TOON + RTK TOKEN GUARD',
    caption: 'TOON tables & Defuddle boilerplate stripping cut prompt size up to 62%.',
    metricBadge: '-62% TOKENS · LOCAL LEDGER',
    visualCue: 'TOKEN_BARS',
  },
  {
    id: 'sc_4',
    durationSec: 3.2,
    headline: '04 · MARKET & CITATION RAG',
    caption: 'Cited knowledge QA plus read-only BTC/ETH/TAO signal bots with safety locks.',
    metricBadge: 'PAPER-ONLY · CITED [1][2]',
    visualCue: 'SIGNAL_WAVE',
  },
  {
    id: 'sc_5',
    durationSec: 3.2,
    headline: '05 · DEFAULT-NO HOLD GUARD',
    caption: 'No email, calendar edit, or Telegram send fires without an explicit 2.0s hold.',
    metricBadge: 'DEFAULT-NO ARMED',
    visualCue: 'SAFETY_RING',
  },
];

function drawLineBoilSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  wobble = 2.1,
) {
  const mx = (x1 + x2) / 2 + Math.sin(seed * 3.1) * wobble;
  const my = (y1 + y2) / 2 + Math.cos(seed * 2.7) * wobble;
  ctx.beginPath();
  ctx.moveTo(x1 + Math.sin(seed) * 0.9, y1 + Math.cos(seed) * 0.9);
  ctx.quadraticCurveTo(mx, my, x2 + Math.cos(seed * 1.4) * 0.9, y2 + Math.sin(seed * 1.9) * 0.9);
  ctx.stroke();
}

export function ExplainerStudio({ sessionToken, activeLlmProvider, onSyncToG2 }: ExplainerStudioProps) {
  const [topic, setTopic] = useState('OnQ Proactive Smart-Glasses Architecture');
  const [style, setStyle] = useState<ExplainerVisualStyle>('motion');
  const [scenes, setScenes] = useState<ExplainerSceneBeat[]>(DEFAULT_SCENES);
  const [playing, setPlaying] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [statusNote, setStatusNote] = useState('Monochrome 525nm real-time explainer running live at 60fps.');
  const [recordingWebm, setRecordingWebm] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const elapsedRef = useRef(0);
  const lastIdxSpokenRef = useRef(-1);

  const generateStoryboard = useCallback(
    async (customTopic = topic, customStyle = style) => {
      if (!sessionToken) {
        setScenes(DEFAULT_SCENES);
        setStatusNote('Loaded local 5-scene storyboard.');
        return;
      }
      setGenerating(true);
      try {
        const res = await fetch('/api/explainer/script', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ topic: customTopic, style: customStyle }),
        });
        if (res.ok) {
          const j = (await res.json()) as {
            scenes?: ExplainerSceneBeat[];
            providerLabel?: string;
            g2Lines?: string[];
          };
          if (j.scenes?.length) {
            setScenes(j.scenes);
            elapsedRef.current = 0;
            setSceneIdx(0);
            lastIdxSpokenRef.current = -1;
            setStatusNote(`Storyboard synthesized (${j.providerLabel ?? activeLlmProvider}) · 5 scenes.`);
          }
          if (j.g2Lines?.length && onSyncToG2) {
            onSyncToG2(j.g2Lines);
          }
        }
      } catch {
        setStatusNote('Offline fallback storyboard active.');
      } finally {
        setGenerating(false);
      }
    },
    [activeLlmProvider, onSyncToG2, sessionToken, style, topic],
  );

  // Speak active scene caption via browser Web Speech if toggled
  useEffect(() => {
    if (!voiceOn || !playing || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    if (lastIdxSpokenRef.current === sceneIdx) return;
    lastIdxSpokenRef.current = sceneIdx;
    const beat = scenes[sceneIdx];
    if (!beat) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(beat.caption);
      utt.rate = 1.05;
      window.speechSynthesis.speak(utt);
    } catch {
      // ignore sandboxed speech restrictions
    }
  }, [playing, sceneIdx, scenes, voiceOn]);

  // Live 60fps Monochrome Matrix-Green 3-Style Canvas Engine (Motion / Hand-Drawn / Cinematic 3D)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const totalSec = scenes.reduce((acc, s) => acc + Math.max(2, s.durationSec), 0) || 15;
    let rafId = 0;
    let lastTs = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      if (playing) {
        elapsedRef.current = (elapsedRef.current + dt) % totalSec;
      }

      // Determine active scene
      let cursor = 0;
      let currentIdx = 0;
      let localProgress = 0;
      for (let i = 0; i < scenes.length; i++) {
        const dur = Math.max(2, scenes[i].durationSec);
        if (elapsedRef.current <= cursor + dur || i === scenes.length - 1) {
          currentIdx = i;
          localProgress = Math.min(1, Math.max(0, (elapsedRef.current - cursor) / dur));
          break;
        }
        cursor += dur;
      }
      setSceneIdx((prev) => (prev !== currentIdx ? currentIdx : prev));

      const beat = scenes[currentIdx] ?? DEFAULT_SCENES[0];
      const W = canvas.width;
      const H = canvas.height;
      const t = now * 0.001;

      // Monochrome Obsidian Surface
      ctx.fillStyle = '#060907';
      ctx.fillRect(0, 0, W, H);

      // Phosphor ambient radial wash
      const rad = ctx.createRadialGradient(W * 0.5, H * 0.42, 20, W * 0.5, H * 0.42, W * 0.58);
      rad.addColorStop(0, 'rgba(52, 245, 126, 0.16)');
      rad.addColorStop(0.55, 'rgba(18, 66, 36, 0.10)');
      rad.addColorStop(1, 'rgba(6, 9, 7, 0.95)');
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, W, H);

      // Dotted waveguide grid
      ctx.fillStyle = 'rgba(52, 245, 126, 0.14)';
      for (let gx = 24; gx < W; gx += 28) {
        for (let gy = 24; gy < H - 72; gy += 28) {
          ctx.fillRect(gx, gy, 1.4, 1.4);
        }
      }

      // Mode-specific center stage visual
      const cx = W * 0.5;
      const cy = H * 0.45;
      if (style === 'motion') {
        // Style 1: Crisp kinetic motion-graphics telemetry & pulsing wave-guides
        ctx.strokeStyle = 'rgba(134, 255, 175, 0.45)';
        ctx.lineWidth = 1.5;
        for (let r = 0; r < 3; r++) {
          const radius = 54 + r * 36 + ((localProgress * 30 + r * 10) % 24);
          ctx.globalAlpha = Math.max(0.12, 0.7 - r * 0.22);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Animated metric bar graph
        const bars = 9;
        const barW = 24;
        const gap = 14;
        const startX = cx - ((bars * (barW + gap) - gap) / 2);
        for (let b = 0; b < bars; b++) {
          const val = 0.28 + 0.65 * Math.abs(Math.sin(t * 2.3 + b * 0.55 + currentIdx));
          const bh = 112 * val * Math.min(1, localProgress * 2.2);
          const bx = startX + b * (barW + gap);
          const by = cy + 48 - bh;
          ctx.fillStyle = b === 4 ? '#86FFAF' : 'rgba(52, 245, 126, 0.45)';
          ctx.fillRect(bx, by, barW, bh);
          ctx.strokeStyle = '#34F57E';
          ctx.strokeRect(bx, by, barW, bh);
        }
      } else if (style === 'hand_drawn') {
        // Style 2: 2-frame line-boil sketch animation matching petergyang/video-explainer
        const boilBucket = Math.floor(t * 6);
        ctx.strokeStyle = '#86FFAF';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        // Sketch G2 eyewear wireframe outline
        drawLineBoilSegment(ctx, cx - 170, cy - 35, cx - 30, cy - 35, boilBucket + 1);
        drawLineBoilSegment(ctx, cx - 30, cy - 35, cx - 40, cy + 45, boilBucket + 2);
        drawLineBoilSegment(ctx, cx - 40, cy + 45, cx - 160, cy + 45, boilBucket + 3);
        drawLineBoilSegment(ctx, cx - 160, cy + 45, cx - 170, cy - 35, boilBucket + 4);
        // Bridge
        drawLineBoilSegment(ctx, cx - 30, cy - 18, cx + 30, cy - 18, boilBucket + 5);
        // Right lens
        drawLineBoilSegment(ctx, cx + 30, cy - 35, cx + 170, cy - 35, boilBucket + 6);
        drawLineBoilSegment(ctx, cx + 170, cy - 35, cx + 160, cy + 45, boilBucket + 7);
        drawLineBoilSegment(ctx, cx + 160, cy + 45, cx + 40, cy + 45, boilBucket + 8);
        drawLineBoilSegment(ctx, cx + 40, cy + 45, cx + 30, cy - 35, boilBucket + 9);
        // Hand-sketched annotations inside lenses
        ctx.strokeStyle = '#34F57E';
        ctx.lineWidth = 1.6;
        for (let l = 0; l < 4; l++) {
          const lx = cx - 144;
          const ly = cy - 14 + l * 14;
          drawLineBoilSegment(ctx, lx, ly, lx + 82, ly, boilBucket + l + 12, 1.4);
        }
        ctx.beginPath();
        ctx.arc(cx + 100, cy + 5, 22 + Math.sin(boilBucket) * 1.4, 0, Math.PI * 2 * Math.min(1, localProgress * 1.8));
        ctx.stroke();
      } else {
        // Style 3: Cinematic 3D perspective wireframe pyramid & orbiting lattice in 525nm green
        const rotY = t * 0.85 + currentIdx * 0.7;
        const rotX = 0.42 + Math.sin(t * 0.5) * 0.14;
        const pts: Array<[number, number, number]> = [
          [0, -1.25, 0],
          [-1.05, 0.85, -1.05],
          [1.05, 0.85, -1.05],
          [1.05, 0.85, 1.05],
          [-1.05, 0.85, 1.05],
          [0, 1.35, 0],
        ];
        const proj = pts.map(([x, y, z]) => {
          const rx = x * Math.cos(rotY) - z * Math.sin(rotY);
          const rz1 = x * Math.sin(rotY) + z * Math.cos(rotY);
          const ry = y * Math.cos(rotX) - rz1 * Math.sin(rotX);
          const rz = y * Math.sin(rotX) + rz1 * Math.cos(rotX) + 3.6;
          const scale = 255 / rz;
          return [cx + rx * scale, cy + ry * scale] as [number, number];
        });
        const edges: Array<[number, number]> = [
          [0, 1], [0, 2], [0, 3], [0, 4],
          [1, 2], [2, 3], [3, 4], [4, 1],
          [5, 1], [5, 2], [5, 3], [5, 4],
        ];
        ctx.strokeStyle = '#34F57E';
        ctx.lineWidth = 2;
        for (const [a, b] of edges) {
          ctx.beginPath();
          ctx.moveTo(proj[a][0], proj[a][1]);
          ctx.lineTo(proj[b][0], proj[b][1]);
          ctx.stroke();
        }
        for (const [px, py] of proj) {
          ctx.fillStyle = '#86FFAF';
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Top HUD bar
      ctx.fillStyle = 'rgba(10, 14, 11, 0.82)';
      ctx.fillRect(20, 16, W - 40, 36);
      ctx.strokeStyle = 'rgba(52, 245, 126, 0.35)';
      ctx.strokeRect(20, 16, W - 40, 36);

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#34F57E';
      ctx.fillText(beat.headline, 34, 39);

      ctx.font = '12px monospace';
      ctx.fillStyle = '#86FFAF';
      const badgeW = ctx.measureText(beat.metricBadge).width;
      ctx.fillText(beat.metricBadge, W - 34 - badgeW, 39);

      // Lower synchronized subtitle bar (word reveal)
      ctx.fillStyle = 'rgba(6, 10, 7, 0.9)';
      ctx.fillRect(20, H - 78, W - 40, 58);
      ctx.strokeStyle = 'rgba(52, 245, 126, 0.45)';
      ctx.strokeRect(20, H - 78, W - 40, 58);

      const words = beat.caption.split(' ');
      const shownCount = Math.max(2, Math.ceil(words.length * Math.min(1, localProgress * 1.45)));
      const partial = words.slice(0, shownCount).join(' ');
      ctx.font = '14px monospace';
      ctx.fillStyle = '#E8FFF0';
      ctx.fillText(partial.slice(0, 76), 34, H - 45);

      // Progress hairline
      ctx.fillStyle = 'rgba(52, 245, 126, 0.2)';
      ctx.fillRect(20, H - 22, W - 40, 3);
      ctx.fillStyle = '#34F57E';
      ctx.fillRect(20, H - 22, (W - 40) * (elapsedRef.current / totalSec), 3);

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [playing, scenes, style]);

  const exportWebmClip = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      setStatusNote('WebM canvas recording unavailable in this browser runtime.');
      return;
    }
    try {
      const stream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = () => {
        setRecordingWebm(false);
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `onq-explainer-${style}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setStatusNote(`Exported onq-explainer-${style}.webm cleanly.`);
      };
      setRecordingWebm(true);
      setStatusNote('Capturing 4s monochrome WebM clip...');
      rec.start();
      setTimeout(() => {
        if (rec.state !== 'inactive') rec.stop();
      }, 4000);
    } catch {
      setRecordingWebm(false);
      setStatusNote('WebM capture blocked cleanly in headless mode.');
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
            REAL-TIME MONOCHROME VIDEO EXPLAINER STUDIO
          </span>
          <p className="text-[11px] text-[var(--lightgray)] mt-0.5">
            Live 3-style generator (Motion · Hand-Drawn Sketch · Cinematic 3D) in 525nm OnQ green.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ['motion', 'Motion Graphics'],
            ['hand_drawn', 'Hand-Drawn'],
            ['cinematic_3d', 'Cinematic 3D'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStyle(id)}
              className={`px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                style === id
                  ? 'bg-[var(--g2-phosphor)] text-[#0a0a0a]'
                  : 'retro-btn-glass text-[var(--bright)] hover:text-[var(--g2-phosphor)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          aria-label="Explainer topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic to explain (e.g. How OnQ saves 62% tokens with TOON)"
          className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
        />
        <button
          type="button"
          disabled={generating}
          onClick={() => void generateStoryboard()}
          className="retro-btn-primary px-4 py-2 font-semibold cursor-pointer shrink-0"
        >
          {generating ? 'Drafting...' : 'Generate Explainer'}
        </button>
      </div>

      <div className="border border-[var(--g2-phosphor)]/40 bg-[#050806] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={720}
          height={360}
          className="w-full h-auto block"
          aria-label="Monochrome Matrix-Green Video Explainer Canvas"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="retro-btn-glass px-3 py-1.5 text-[var(--bright)] cursor-pointer"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            className={`px-3 py-1.5 cursor-pointer border ${
              voiceOn
                ? 'border-[var(--lime)] text-[var(--lime)] bg-[var(--lime)]/10'
                : 'border-[var(--hairline)] text-[var(--lightgray)]'
            }`}
          >
            {voiceOn ? 'Voiceover: ON' : 'Voiceover: OFF'}
          </button>
          {onSyncToG2 && (
            <button
              type="button"
              onClick={() => {
                const beat = scenes[sceneIdx] ?? scenes[0];
                if (beat) {
                  onSyncToG2([
                    beat.headline.slice(0, 40),
                    beat.metricBadge.slice(0, 40),
                    beat.caption.slice(0, 40),
                  ]);
                }
              }}
              className="retro-btn-glass px-3 py-1.5 text-[var(--g2-phosphor)] cursor-pointer"
            >
              Sync Beat to G2 Lens
            </button>
          )}
          <button
            type="button"
            disabled={recordingWebm}
            onClick={exportWebmClip}
            className="retro-btn-glass px-3 py-1.5 text-[var(--bright)] cursor-pointer"
          >
            {recordingWebm ? 'Recording...' : 'Export .webm'}
          </button>
        </div>
        <span className="font-pixel text-[9px] text-[var(--lightgray)]">
          SCENE {sceneIdx + 1}/{scenes.length} · {statusNote}
        </span>
      </div>
    </div>
  );
}
