import { useMemo } from 'react';
import { encodeCountdownRingPng, encodePixelAvatarPng, formatLensFrame } from '@onq/core';
import type { HudState } from '@onq/core';

interface G2LensCanvasProps {
  hudState: HudState;
  opticsMode: 'waveguide' | 'raw';
  negativeControlOverflow?: boolean;
}

export function G2LensCanvas({
  hudState,
  opticsMode,
  negativeControlOverflow = false,
}: G2LensCanvasProps) {
  const frame = useMemo(() => formatLensFrame(hudState), [hudState]);

  const ringDataUrl = useMemo(() => {
    if (hudState.phase !== 'armed' || frame.ringProgress01 === undefined) return null;
    const pngBytes = encodeCountdownRingPng(frame.ringProgress01, 76);
    let bin = '';
    for (let i = 0; i < pngBytes.length; i++) {
      bin += String.fromCharCode(pngBytes[i]);
    }
    return `data:image/png;base64,${btoa(bin)}`;
  }, [hudState.phase, frame.ringProgress01]);

  const avatarDataUrl = useMemo(() => {
    if (hudState.phase !== 'listening' && hudState.phase !== 'meeting_live') return null;
    const pngBytes = encodePixelAvatarPng(
      hudState.phase === 'meeting_live' ? 'speaking' : 'listening',
      {
        tick: hudState.meeting?.turns.length ?? 2,
        rmsLevel: Math.max(0.35, hudState.rmsLevel),
        style: 'muse',
        size: 76,
      },
    );
    let bin = '';
    for (let i = 0; i < pngBytes.length; i++) {
      bin += String.fromCharCode(pngBytes[i]);
    }
    return `data:image/png;base64,${btoa(bin)}`;
  }, [hudState.phase, hudState.rmsLevel, hudState.meeting?.turns.length]);

  const sideImgUrl = ringDataUrl ?? avatarDataUrl;

  if (negativeControlOverflow) {
    // Deliberate defect injection mode used ONLY by Check 11 of verify-geometry.mjs
    return (
      <div
        data-testid="g2-lens"
        data-provenance={frame.provenanceTag}
        data-utf8-bytes={9999}
        className="g2-lens-canvas"
        style={{ fontSize: '32px', lineHeight: 1.8 }}
      >
        <div data-testid="g2-line-0">
          INTENTIONAL NEGATIVE CONTROL OVERFLOW LINE EXCEEDING 42 COLUMNS AND 576PX BOUNDS
        </div>
        <div data-testid="g2-line-1">OVERFLOW LINE 2</div>
        <div data-testid="g2-line-2">OVERFLOW LINE 3</div>
        <div data-testid="g2-line-3">OVERFLOW LINE 4</div>
      </div>
    );
  }

  return (
    <div
      data-testid="g2-lens"
      data-phase={hudState.phase}
      data-provenance={frame.provenanceTag}
      data-utf8-bytes={frame.utf8Bytes}
      className={`g2-lens-canvas ${opticsMode === 'waveguide' ? 'g2-lens-waveguide' : 'g2-lens-raw'}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {sideImgUrl && (
          <img
            src={sideImgUrl}
            width={76}
            height={76}
            alt={ringDataUrl ? '2.0 second countdown undo ring' : 'OnQ 4-bit Muse pixel avatar'}
            className="shrink-0 mt-4"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
        <div className="flex flex-col w-full min-w-0">
          {frame.lines.map((line, idx) => (
            <div
              key={idx}
              data-testid={`g2-line-${idx}`}
              className="whitespace-pre font-plex text-[15px] leading-[1.48] tracking-normal"
              style={
                idx === 0
                  ? { color: '#34f57e', fontWeight: 600 }
                  : idx === frame.lines.length - 1
                    ? { color: '#1ea352' }
                    : { color: '#34f57e' }
              }
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
