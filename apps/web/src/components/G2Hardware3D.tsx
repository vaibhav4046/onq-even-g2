import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { HudPhase } from '@oncue/core';

export type HardwareViewMode = 'optics' | 'exploded' | 'ring';

interface G2Hardware3DProps {
  phase?: HudPhase;
  headerLine?: string;
  primaryLine?: string;
  ringProgress?: number;
  defaultMode?: HardwareViewMode;
  theme?: 'dark' | 'light';
  className?: string;
}

interface Pt3 {
  x: number;
  y: number;
  z: number;
}

function projectPoint(pt: Pt3, yaw: number, pitch: number, cx: number, cy: number, fov: number) {
  const cyaw = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const cpitch = Math.cos(pitch);
  const spitch = Math.sin(pitch);

  const x1 = pt.x * cyaw - pt.z * syaw;
  const z1 = pt.x * syaw + pt.z * cyaw;
  const y2 = pt.y * cpitch - z1 * spitch;
  const z2 = pt.y * spitch + z1 * cpitch;

  const dist = fov + z2;
  const scale = fov / Math.max(120, dist);
  return { x: cx + x1 * scale, y: cy + y2 * scale, scale, z: z2 };
}

/**
 * Interactive 60fps 3D perspective hardware canvas depicting Even Realities G2 glasses
 * and R1 smart ring with live synced phosphor waveguide HUD projection.
 */
export function G2Hardware3D({
  phase = 'dossier',
  headerLine = 'LIVE CORRIDOR BRIEF',
  primaryLine = 'VC Sync - Priya Nair',
  ringProgress = 0,
  defaultMode = 'optics',
  theme = 'dark',
  className = '',
}: G2Hardware3DProps) {
  const [mode, setMode] = useState<HardwareViewMode>(defaultMode);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const pointerRef = useRef({ tx: 0.24, ty: -0.14, cx: 0.24, cy: -0.14, active: false });
  const explodeRef = useRef(defaultMode === 'exploded' ? 1 : 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const fov = 560;
    let rafId = 0;

    const drawQuad = (pts: Pt3[], yaw: number, pitch: number, fill: string, stroke: string, lineWidth = 1.4) => {
      const p = pts.map((pt) => projectPoint(pt, yaw, pitch, cx, cy, fov));
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.closePath();
      if (fill !== 'none') {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke !== 'none') {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
      return p;
    };

    const drawLine = (a: Pt3, b: Pt3, yaw: number, pitch: number, stroke: string, width = 1.4, dashed = false) => {
      const pa = projectPoint(a, yaw, pitch, cx, cy, fov);
      const pb = projectPoint(b, yaw, pitch, cx, cy, fov);
      ctx.save();
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.restore();
    };

    const drawGlasses = (yaw: number, pitch: number, explode: number, nowSec: number) => {
      const isLight = theme === 'light';
      const ink = isLight ? '#0a0a0a' : '#f2f2f2';
      const rimMute = isLight ? '#525252' : '#71717a';
      const prismFill = isLight ? 'rgba(10, 10, 10, 0.06)' : 'rgba(52, 245, 126, 0.08)';
      const lensBorder =
        phase === 'conflict'
          ? '#ffb020'
          : isLight
            ? '#0a0a0a'
            : phase === 'armed'
              ? '#daff52'
              : '#34f57e';
      const phosphor = phase === 'conflict' ? '#ffb020' : isLight ? '#0a0a0a' : '#34f57e';

      const zBack = -125 - explode * 36;
      const zFrame = -explode * 22;
      const zPrism = explode * 22;
      const zHud = explode * 56;

      // 1. Temples extending into Z-depth
      drawLine({ x: -168, y: -26, z: zFrame }, { x: -158, y: -18, z: zBack }, yaw, pitch, rimMute, 3.2);
      drawLine({ x: -158, y: -18, z: zBack }, { x: -152, y: 12, z: zBack - 24 }, yaw, pitch, rimMute, 2.8);
      drawLine({ x: 168, y: -26, z: zFrame }, { x: 158, y: -18, z: zBack }, yaw, pitch, rimMute, 3.2);
      drawLine({ x: 158, y: -18, z: zBack }, { x: 152, y: 12, z: zBack - 24 }, yaw, pitch, rimMute, 2.8);

      // 2. Micro-LED projector pods at temple hinges
      drawQuad(
        [
          { x: -168, y: -32, z: zFrame + 4 },
          { x: -150, y: -32, z: zFrame + 4 },
          { x: -150, y: -16, z: zFrame + 4 },
          { x: -168, y: -16, z: zFrame + 4 },
        ],
        yaw,
        pitch,
        isLight ? '#d4d4d4' : '#18181b',
        ink,
        1.5,
      );
      drawQuad(
        [
          { x: 150, y: -32, z: zFrame + 4 },
          { x: 168, y: -32, z: zFrame + 4 },
          { x: 168, y: -16, z: zFrame + 4 },
          { x: 150, y: -16, z: zFrame + 4 },
        ],
        yaw,
        pitch,
        isLight ? '#d4d4d4' : '#18181b',
        ink,
        1.5,
      );

      // 3. Outer titanium browbar + nose bridge
      drawLine({ x: -160, y: -52, z: zFrame }, { x: -18, y: -52, z: zFrame + 6 }, yaw, pitch, ink, 2.6);
      drawLine({ x: 18, y: -52, z: zFrame + 6 }, { x: 160, y: -52, z: zFrame }, yaw, pitch, ink, 2.6);
      drawLine({ x: -18, y: -32, z: zFrame + 6 }, { x: 18, y: -32, z: zFrame + 6 }, yaw, pitch, ink, 2.6);

      // Left + right outer frames
      drawQuad(
        [
          { x: -158, y: -50, z: zFrame },
          { x: -18, y: -50, z: zFrame + 5 },
          { x: -24, y: 46, z: zFrame + 5 },
          { x: -150, y: 46, z: zFrame },
        ],
        yaw,
        pitch,
        'none',
        ink,
        2,
      );
      drawQuad(
        [
          { x: 18, y: -50, z: zFrame + 5 },
          { x: 158, y: -50, z: zFrame },
          { x: 150, y: 46, z: zFrame },
          { x: 24, y: 46, z: zFrame + 5 },
        ],
        yaw,
        pitch,
        'none',
        ink,
        2,
      );

      // 4. Waveguide optical prism combiners
      drawQuad(
        [
          { x: -144, y: -38, z: zPrism },
          { x: -32, y: -38, z: zPrism + 4 },
          { x: -36, y: 34, z: zPrism + 4 },
          { x: -138, y: 34, z: zPrism },
        ],
        yaw,
        pitch,
        prismFill,
        lensBorder,
        1.1,
      );
      drawQuad(
        [
          { x: 32, y: -38, z: zPrism + 4 },
          { x: 144, y: -38, z: zPrism },
          { x: 138, y: 34, z: zPrism },
          { x: 36, y: 34, z: zPrism + 4 },
        ],
        yaw,
        pitch,
        prismFill,
        lensBorder,
        1.1,
      );

      if (explode > 0.15) {
        drawLine({ x: -144, y: -38, z: zFrame }, { x: -144, y: -38, z: zHud }, yaw, pitch, rimMute, 0.9, true);
        drawLine({ x: 144, y: 34, z: zFrame }, { x: 144, y: 34, z: zHud }, yaw, pitch, rimMute, 0.9, true);
      }

      // 5. Projected 576x288 HUD inside both waveguides (right lens primary + ring)
      const leftAnchor = projectPoint({ x: -130, y: -14, z: zHud }, yaw, pitch, cx, cy, fov);
      const rightAnchor = projectPoint({ x: 44, y: -14, z: zHud }, yaw, pitch, cx, cy, fov);

      ctx.save();
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = phosphor;
      if (!isLight) {
        ctx.shadowColor = phosphor;
        ctx.shadowBlur = 8;
      }
      ctx.fillText(headerLine.slice(0, 16), leftAnchor.x, leftAnchor.y);
      ctx.fillText(primaryLine.slice(0, 16), leftAnchor.x, leftAnchor.y + 16);
      ctx.fillText('576x288 WAVEGUIDE', leftAnchor.x, leftAnchor.y + 32);

      // Right lens: countdown ring or state glyph
      const rc = projectPoint({ x: 88, y: -2, z: zHud }, yaw, pitch, cx, cy, fov);
      const sweep = phase === 'armed' ? Math.max(0.15, ringProgress || ((nowSec * 0.5) % 1)) : 0.72;
      ctx.strokeStyle = isLight ? 'rgba(10,10,10,0.22)' : 'rgba(52,245,126,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rc.x, rc.y, 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = phosphor;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(rc.x, rc.y, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep);
      ctx.stroke();
      ctx.fillText(phase.toUpperCase().slice(0, 8), rightAnchor.x + 12, rc.y + 29);
      ctx.restore();
    };

    const drawR1Ring = (yaw: number, pitch: number, nowSec: number) => {
      const isLight = theme === 'light';
      const ink = isLight ? '#0a0a0a' : '#f2f2f2';
      const accent = isLight ? '#0a0a0a' : '#daff52';
      const dim = isLight ? '#737373' : '#52525b';
      const spinYaw = yaw + (reduced ? 0.35 : Math.sin(nowSec * 0.8) * 0.45);
      const segments = 36;
      const rOuter = 74;
      const halfWidth = 22;

      // Outer and inner ring bands in 3D space
      const backRing: Array<{ x: number; y: number }> = [];
      const frontRing: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const px = Math.cos(a) * rOuter;
        const py = Math.sin(a) * rOuter;
        frontRing.push(projectPoint({ x: px, y: py, z: halfWidth }, spinYaw, pitch + 0.48, cx, cy, fov));
        backRing.push(projectPoint({ x: px, y: py, z: -halfWidth }, spinYaw, pitch + 0.48, cx, cy, fov));
      }

      // Crossbars
      ctx.strokeStyle = dim;
      ctx.lineWidth = 1;
      for (let i = 0; i < segments; i += 3) {
        ctx.beginPath();
        ctx.moveTo(frontRing[i].x, frontRing[i].y);
        ctx.lineTo(backRing[i].x, backRing[i].y);
        ctx.stroke();
      }

      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      frontRing.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      ctx.strokeStyle = dim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      backRing.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      // Active capacitive touch strip highlight on upper arc
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 24; i <= 31; i++) {
        const p = frontRing[i];
        if (i === 24) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // Label callout
      const pad = projectPoint({ x: 76, y: -56, z: halfWidth }, spinYaw, pitch + 0.48, cx, cy, fov);
      ctx.fillStyle = accent;
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillText('R1 TOUCHPAD // SWIPE + TAP + HOLD', Math.max(16, Math.min(w - 220, pad.x - 40)), Math.max(24, pad.y - 16));
    };

    const render = (nowMs: number) => {
      const nowSec = nowMs * 0.001;
      const scrollRatio = typeof window !== 'undefined' ? Math.min(1, window.scrollY / 1600) : 0;
      const ptr = pointerRef.current;

      if (!ptr.active && !reduced) {
        ptr.tx = 0.22 * Math.sin(nowSec * 0.55) + scrollRatio * 0.25;
        ptr.ty = -0.1 + 0.08 * Math.cos(nowSec * 0.45);
      }
      ptr.cx += (ptr.tx - ptr.cx) * 0.08;
      ptr.cy += (ptr.ty - ptr.cy) * 0.08;

      const targetExplode = mode === 'exploded' ? 1 : 0;
      explodeRef.current += (targetExplode - explodeRef.current) * 0.12;

      ctx.clearRect(0, 0, w, h);

      // Subtle architectural crosshair grid in background
      ctx.strokeStyle = theme === 'light' ? 'rgba(10,10,10,0.08)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, 18);
      ctx.lineTo(cx, h - 18);
      ctx.moveTo(24, cy);
      ctx.lineTo(w - 24, cy);
      ctx.stroke();

      if (mode === 'ring') {
        drawR1Ring(ptr.cx, ptr.cy, nowSec);
      } else {
        drawGlasses(ptr.cx, ptr.cy, explodeRef.current, nowSec);
      }

      if (!reduced) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [headerLine, mode, phase, primaryLine, reduced, ringProgress, theme]);

  const borderCls = theme === 'light' ? 'border-[#c4c4c4] bg-[#e8e8e8]' : 'border-[var(--hairline)] bg-[var(--surface)]';
  const muteCls = theme === 'light' ? 'text-[#525252]' : 'text-[var(--lightgray)]';

  return (
    <div className={`border border-dashed ${borderCls} p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-current/15">
        <span className={`font-pixel text-[10px] uppercase tracking-[0.16em] ${muteCls}`}>
          G2 HARDWARE TELEMETRY
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="3D hardware view mode">
          {(
            [
              ['optics', '3D Optics'],
              ['exploded', 'Exploded'],
              ['ring', 'R1 Ring'],
            ] as const
          ).map(([key, label]) => {
            const active = mode === key;
            const activeCls =
              theme === 'light'
                ? 'bg-[#0a0a0a] text-[#f2f2f2] border-[#0a0a0a]'
                : 'border-[var(--lime)] text-[var(--lime)]';
            const idleCls =
              theme === 'light'
                ? 'border-[#c4c4c4] text-[#525252] hover:text-[#0a0a0a]'
                : 'border-[var(--hairline)] text-[var(--lightgray)] hover:text-[var(--bright)]';
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`px-2 py-0.5 border font-pixel text-[9px] uppercase tracking-[0.12em] cursor-pointer transition-colors ${
                  active ? activeCls : idleCls
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={480}
        height={290}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const nx = (e.clientX - rect.left) / rect.width - 0.5;
          const ny = (e.clientY - rect.top) / rect.height - 0.5;
          pointerRef.current.tx = nx * 0.72;
          pointerRef.current.ty = ny * 0.48;
          pointerRef.current.active = true;
        }}
        onMouseLeave={() => {
          pointerRef.current.active = false;
        }}
        className="w-full h-auto block cursor-crosshair"
        aria-label="Interactive 3D Even Realities G2 glasses and R1 ring model"
      />
    </div>
  );
}
