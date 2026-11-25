import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as THREE from 'three';
import type { HudState, VoiceOrbState } from '@onq/core';
import { G2LensCanvas } from './G2LensCanvas';
import { G2Model } from './G2Model';
import { OnQVoiceOrb } from './OnQVoiceOrb';
import { R1RingModel } from './R1RingModel';
import { createRadialFloorGlowTexture } from './hardwareTextures';

export type HardwareViewMode = 'optics' | 'exploded' | 'ring' | 'lens';

interface G2Hardware3DProps {
  hudState?: HudState;
  orbState?: VoiceOrbState;
  activeWord?: string;
  headerLine?: string;
  primaryLine?: string;
  ringProgress?: number;
  rmsLevel?: number;
  engineLabel?: string;
  defaultMode?: HardwareViewMode;
  theme?: 'dark' | 'light';
  onEnterLensView?: () => void;
  onConfirmAction?: () => void;
  onCancelAction?: () => void;
  onRunVoice?: () => void;
  className?: string;
}

function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

class CanvasErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(_err: Error, _info: ErrorInfo) {
    // Graceful silent drop to optical SVG fallback in headless/GPU-less CI
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function OpticalSvgFallback({
  phase,
  headerLine,
  primaryLine,
}: {
  phase: HudState['phase'];
  headerLine: string;
  primaryLine: string;
}) {
  const accent = phase === 'conflict' ? '#ffb020' : '#34F57E';
  return (
    <div
      className="w-full h-[300px] flex flex-col items-center justify-center gap-3 select-none"
      aria-label="Even Realities G2 camera-free eyewear and R1 ring optical view"
    >
      <svg viewBox="0 0 360 130" className="w-full max-w-[340px] h-auto" role="img" aria-label="Even G2 Silhouette">
        <defs>
          <linearGradient id="g2LensGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor="#080b0a" stopOpacity="0.88" />
          </linearGradient>
        </defs>
        <path
          d="M28,34 C58,20 120,20 148,34 C162,40 198,40 212,34 C240,20 302,20 332,34 C338,54 334,94 310,104 C268,114 226,102 214,68 C202,48 158,48 146,68 C134,102 92,114 50,104 C26,94 22,54 28,34 Z"
          fill="#141716"
          stroke="#2d3233"
          strokeWidth="2.5"
        />
        <rect x="44" y="34" width="96" height="62" rx="18" fill="url(#g2LensGrad)" stroke={accent} strokeOpacity="0.4" />
        <rect x="220" y="34" width="96" height="62" rx="18" fill="url(#g2LensGrad)" stroke={accent} strokeOpacity="0.4" />
        <text x="54" y="58" fill={accent} fontSize="9" fontFamily="monospace" fontWeight="700">
          {headerLine.slice(0, 16)}
        </text>
        <text x="54" y="76" fill={accent} fontSize="10" fontFamily="monospace">
          {primaryLine.slice(0, 15)}
        </text>
        <circle cx="268" cy="65" r="18" fill="none" stroke={accent} strokeWidth="2.5" strokeDasharray="88 26" />
      </svg>
    </div>
  );
}

interface StudioSceneProps {
  mode: HardwareViewMode;
  autoTour: boolean;
  zoomProgressRef: React.MutableRefObject<number>;
  onAutoLensPhase: (inside: boolean) => void;
  phase: HudState['phase'];
  orbState?: VoiceOrbState;
  activeWord?: string;
  headerLine: string;
  primaryLine: string;
  ringProgress: number;
  rmsLevel: number;
  reducedMotion: boolean;
  theme: 'dark' | 'light';
  onLensClick: () => void;
  onUserInteract: () => void;
  pointerRef: React.MutableRefObject<{ x: number; y: number }>;
  scrollProgressRef: React.MutableRefObject<number>;
}

function StudioScene({
  mode,
  autoTour,
  onAutoLensPhase,
  phase,
  orbState,
  activeWord,
  headerLine,
  primaryLine,
  ringProgress,
  rmsLevel,
  reducedMotion,
  theme,
  onLensClick,
  onUserInteract,
  pointerRef,
  scrollProgressRef,
}: StudioSceneProps) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const rigRef = useRef<THREE.Group>(null);
  const transitionTimerRef = useRef(0);
  const userInteractingRef = useRef(false);
  const tourClockRef = useRef(0);
  const lastInsideRef = useRef(false);

  const floorGlowTex = useMemo(() => createRadialFloorGlowTexture(), []);
  useEffect(() => () => floorGlowTex.dispose(), [floorGlowTex]);

  useEffect(() => {
    transitionTimerRef.current = 1.25;
  }, [mode]);

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta);

    // Cinematic 10.6s video loop: 0..2.6s 3D showcase -> 2.6..4.0s zoom into lens -> 4.0..8.6s inside UI -> 8.6..10.6s pull back
    let zoomInside = mode === 'lens';
    let cameraAutoZooming = false;
    if (autoTour && !reducedMotion && mode === 'optics' && !userInteractingRef.current) {
      tourClockRef.current = (tourClockRef.current + dt) % 10.6;
      const t = tourClockRef.current;
      zoomInside = t >= 3.6 && t <= 8.8;
      cameraAutoZooming = t >= 2.3 && t <= 9.6;
    } else if (mode !== 'optics') {
      tourClockRef.current = 0;
    }

    if (zoomInside !== lastInsideRef.current) {
      lastInsideRef.current = zoomInside;
      onAutoLensPhase(zoomInside);
    }

    const effectiveLensZoom = mode === 'lens' || (cameraAutoZooming && tourClockRef.current < 8.8);
    const targetPos = effectiveLensZoom
      ? new THREE.Vector3(0.0, 0.03, 1.38)
      : mode === 'ring'
        ? new THREE.Vector3(0.88, 0.44, 2.24)
        : mode === 'exploded'
          ? new THREE.Vector3(3.1, 0.72, 4.1)
          : new THREE.Vector3(0.68, 0.28, 4.58);

    const targetLook = effectiveLensZoom
      ? new THREE.Vector3(0.0, 0.01, -0.05)
      : mode === 'ring'
        ? new THREE.Vector3(0, -0.1, 0)
        : mode === 'exploded'
          ? new THREE.Vector3(0.04, -0.04, 0.12)
          : new THREE.Vector3(0.04, -0.06, -0.35);

    if ((transitionTimerRef.current > 0 || cameraAutoZooming) && !userInteractingRef.current) {
      if (transitionTimerRef.current > 0) {
        transitionTimerRef.current = Math.max(0, transitionTimerRef.current - dt);
      }
      const dampRate = effectiveLensZoom ? 3.2 : 4.5;
      camera.position.lerp(targetPos, 1 - Math.exp(-dampRate * dt));
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetLook, 1 - Math.exp(-dampRate * dt));
        controlsRef.current.update();
      }
    }

    if (rigRef.current) {
      const floatY = !reducedMotion && mode !== 'ring' && !effectiveLensZoom
        ? Math.sin(state.clock.elapsedTime * 1.15) * 0.018
        : 0;
      const idleSweep = !reducedMotion && autoTour && mode === 'optics' && !effectiveLensZoom
        ? Math.sin(state.clock.elapsedTime * 0.65) * 0.14
        : 0;
      const scrollYaw = !reducedMotion && !effectiveLensZoom ? (scrollProgressRef.current - 0.5) * 0.2 : 0;
      const targetYaw =
        effectiveLensZoom
          ? 0
          : (mode === 'ring' ? 0 : pointerRef.current.x * 0.24 + scrollYaw + idleSweep) +
            (mode === 'exploded' ? 0.16 : 0);
      const targetPitch = effectiveLensZoom || mode === 'ring' ? 0 : -pointerRef.current.y * 0.12;

      rigRef.current.position.y = THREE.MathUtils.damp(rigRef.current.position.y, floatY, 5, dt);
      rigRef.current.rotation.y = THREE.MathUtils.damp(rigRef.current.rotation.y, targetYaw, 5, dt);
      rigRef.current.rotation.x = THREE.MathUtils.damp(rigRef.current.rotation.x, targetPitch, 5, dt);
    }
  });

  return (
    <>
      {/* Pure transparent void canvas: inherits seamless #0a0a0a page background with zero hard border */}
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="rect"
          intensity={2.9}
          color="#ffd49e"
          position={[-4.5, 2.2, 3.6]}
          scale={[5, 2.6, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={3.6}
          color="#edf5ff"
          position={[3.8, 4.2, 2.8]}
          scale={[6, 1.4, 1]}
          target={[0, 0, -0.5]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#b5c2be"
          position={[0, -2.5, 4.5]}
          scale={[7, 2.2, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.25}
          color="#34F57E"
          position={[-3.2, 1.8, -3.5]}
          scale={[4.2, 1.3, 1]}
          target={[0, 0, -0.4]}
        />
      </Environment>

      <ambientLight intensity={0.42} />
      <directionalLight
        position={[3.2, 4.5, 3.8]}
        intensity={1.55}
        color="#fff9f0"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3.5, 2.0, 2.4]} intensity={0.8} color="#ffd9ad" />

      <group ref={rigRef}>
        <group visible={mode !== 'ring'}>
          <G2Model
            phase={phase}
            orbState={orbState}
            activeWord={activeWord}
            headerLine={headerLine}
            primaryLine={primaryLine}
            ringProgress={ringProgress}
            rmsLevel={rmsLevel}
            explodeFactor={mode === 'exploded' ? 1 : 0}
            reducedMotion={reducedMotion}
            theme={theme}
            onLensClick={onLensClick}
          />
        </group>

        <R1RingModel
          position={mode === 'ring' ? [0, -0.06, 0] : [1.34, -0.42, 0.62]}
          rotation={mode === 'ring' ? [Math.PI * 0.28, -0.42, 0.18] : [Math.PI * 0.14, -0.36, 0.08]}
          scale={mode === 'ring' ? 1.72 : 0.96}
          phase={phase}
          explodeFactor={mode === 'exploded' ? 1 : 0}
          macroFocus={mode === 'ring'}
          reducedMotion={reducedMotion}
          theme={theme}
        />

        {/* Soft, seamless radial floor aura fading to 0 alpha (zero visible pedestal edge) */}
        <mesh position={[0.04, -0.62, -0.35]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.4, 4.2]} />
          <meshBasicMaterial
            map={floorGlowTex}
            transparent
            opacity={0.75}
            depthWrite={false}
          />
        </mesh>
      </group>

      <ContactShadows
        frames={1}
        resolution={256}
        position={[0.04, -0.61, -0.35]}
        opacity={0.65}
        scale={6.2}
        blur={2.4}
        far={2.4}
        color="#000000"
      />

      <OrbitControls
        ref={controlsRef}
        enableZoom
        enablePan={false}
        enableDamping
        dampingFactor={0.07}
        minDistance={1.25}
        maxDistance={7.2}
        minPolarAngle={0.14}
        maxPolarAngle={Math.PI - 0.18}
        onStart={() => {
          userInteractingRef.current = true;
          onUserInteract();
        }}
        onEnd={() => {
          userInteractingRef.current = false;
        }}
      />
    </>
  );
}

/**
 * Seamless pure-black 3D Even Realities G2 glasses & R1 smart ring showcase with dot-matrix
 * photorealism reveal, zero border seams, and cinematic auto-zoom into the live OnQ HUD UI.
 */
export function G2Hardware3D({
  hudState,
  orbState = 'idle',
  activeWord,
  headerLine = 'LIVE CORRIDOR BRIEF',
  primaryLine = 'Corridor Ready',
  ringProgress = 0,
  rmsLevel = 0,
  engineLabel = 'SANDBOX · LOCAL',
  defaultMode = 'optics',
  theme = 'dark',
  onEnterLensView,
  onConfirmAction,
  onCancelAction,
  onRunVoice,
  className = '',
}: G2Hardware3DProps) {
  const [mode, setMode] = useState<HardwareViewMode>(defaultMode);
  const [autoTour, setAutoTour] = useState(true);
  const [lensOverlayOpen, setLensOverlayOpen] = useState(false);
  const [inView, setInView] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduced = Boolean(useReducedMotion());
  const webglReady = useMemo(() => isWebGLAvailable(), []);
  const pointerRef = useRef({ x: 0, y: 0 });
  const scrollProgressRef = useRef(0.5);
  const zoomProgressRef = useRef(0);

  const phase = hudState?.phase ?? 'idle';

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || reduced) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      scrollProgressRef.current = Math.min(1, Math.max(0, window.scrollY / max));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reduced]);

  const fallback = (
    <OpticalSvgFallback phase={phase} headerLine={headerLine} primaryLine={primaryLine} />
  );

  const showInsideLensHud = (mode === 'lens' || lensOverlayOpen) && Boolean(hudState);

  return (
    <div className={`relative bg-transparent overflow-visible ${className}`}>
      <div
        ref={containerRef}
        className="relative w-full h-[380px] sm:h-[420px] lg:h-[455px] overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          pointerRef.current.x = (e.clientX - rect.left) / rect.width - 0.5;
          pointerRef.current.y = (e.clientY - rect.top) / rect.height - 0.5;
        }}
        onMouseLeave={() => {
          pointerRef.current.x = 0;
          pointerRef.current.y = 0;
        }}
        aria-label="Interactive 360 degree dot-matrix photorealistic Even Realities G2 glasses and R1 ring"
      >
        {!webglReady ? (
          fallback
        ) : (
          <CanvasErrorBoundary fallback={fallback}>
            <Canvas
              frameloop={inView ? 'always' : 'demand'}
              shadows
              dpr={[1, 1.5]}
              camera={{
                position: mode === 'ring' ? [0.88, 0.44, 2.24] : [0.68, 0.28, 4.58],
                fov: 32,
                near: 0.1,
                far: 40,
              }}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
              }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.18;
                gl.outputColorSpace = THREE.SRGBColorSpace;
              }}
            >
              <StudioScene
                mode={mode}
                autoTour={autoTour}
                zoomProgressRef={zoomProgressRef}
                onAutoLensPhase={(inside) => setLensOverlayOpen(inside)}
                phase={phase}
                orbState={orbState}
                activeWord={activeWord}
                headerLine={headerLine}
                primaryLine={primaryLine}
                ringProgress={ringProgress}
                rmsLevel={rmsLevel}
                reducedMotion={reduced}
                theme={theme}
                onLensClick={() => {
                  setAutoTour(false);
                  setMode('lens');
                  setLensOverlayOpen(true);
                }}
                onUserInteract={() => setAutoTour(false)}
                pointerRef={pointerRef}
                scrollProgressRef={scrollProgressRef}
              />
            </Canvas>
          </CanvasErrorBoundary>
        )}

        {/* Seamless Inside-the-Glasses OnQ Lens UI emerging when camera zooms into lenses */}
        <AnimatePresence>
          {showInsideLensHud && hudState && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setAutoTour(false)}
              className="retro-glass-panel absolute inset-x-2 inset-y-4 sm:inset-x-4 sm:inset-y-7 flex flex-col justify-center items-center px-4 py-3 z-10 pointer-events-auto"
            >
              <div className="w-full max-w-[600px] space-y-2.5">
                <div className="flex items-center justify-between text-[10px] font-pixel uppercase tracking-[0.16em] text-[var(--g2-phosphor)] px-1">
                  <span>INSIDE EVEN G2 · 525NM WAVEGUIDE</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAutoTour(false);
                      setLensOverlayOpen(false);
                      setMode('optics');
                    }}
                    className="text-[var(--lightgray)] hover:text-[var(--bright)] cursor-pointer"
                  >
                    Zoom Out
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <div className="sm:col-span-8 flex items-center justify-center overflow-hidden">
                    <div style={{ width: '374px', height: '188px', overflow: 'hidden' }}>
                      <div style={{ transform: 'scale(0.65)', transformOrigin: 'top left', width: '576px', height: '288px' }}>
                        <G2LensCanvas hudState={hudState} opticsMode="waveguide" />
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <OnQVoiceOrb
                      state={orbState}
                      rmsLevel={rmsLevel}
                      activeWord={activeWord}
                      armProgress01={ringProgress}
                      engineLabel={engineLabel}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {onRunVoice && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAutoTour(false);
                          onRunVoice();
                        }}
                        className="px-2.5 py-1 bg-[var(--lime)] text-[#0a0a0a] font-pixel text-[9px] uppercase cursor-pointer"
                      >
                        Run Voice
                      </button>
                    )}
                    {(hudState.phase === 'preview' || hudState.phase === 'wrap_up') && onConfirmAction && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAutoTour(false);
                          onConfirmAction();
                        }}
                        className="px-2.5 py-1 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] font-pixel text-[9px] uppercase cursor-pointer"
                      >
                        Arm 2s Ring
                      </button>
                    )}
                    {hudState.phase === 'armed' && onCancelAction && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAutoTour(false);
                          onCancelAction();
                        }}
                        className="px-2.5 py-1 bg-[var(--danger)] text-[#0a0a0a] font-pixel text-[9px] uppercase cursor-pointer"
                      >
                        Tap Abort
                      </button>
                    )}
                  </div>
                  {onEnterLensView && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAutoTour(false);
                        onEnterLensView();
                      }}
                      className="px-2.5 py-1 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--lime)] font-pixel text-[9px] uppercase cursor-pointer"
                    >
                      Expand Full Lens
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Minimal Apple liquid-glass floating pill bar */}
        <div className="absolute bottom-1.5 left-0 right-0 flex flex-wrap items-center justify-between gap-2 px-2 pointer-events-none z-20">
          <div
            className="retro-glass-dock pointer-events-auto inline-flex items-center gap-1 px-1.5 py-1"
            role="group"
            aria-label="3D hardware view mode"
          >
            {(
              [
                ['optics', '3D Optics'],
                ['exploded', 'Exploded'],
                ['ring', 'R1 Ring'],
                ['lens', 'Inside Lens'],
              ] as const
            ).map(([key, label]) => {
              const active = (key === 'lens' && showInsideLensHud) || (key !== 'lens' && !showInsideLensHud && mode === key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAutoTour(false);
                    if (key === 'lens') {
                      setMode('lens');
                      setLensOverlayOpen(true);
                    } else {
                      setLensOverlayOpen(false);
                      setMode(key);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-full font-pixel text-[9px] uppercase tracking-[0.11em] cursor-pointer transition-colors ${
                    active
                      ? 'bg-[var(--lime)] text-[#0a0a0a]'
                      : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !autoTour;
                setAutoTour(next);
                if (next) {
                  setLensOverlayOpen(false);
                  setMode('optics');
                }
              }}
              className={`px-2.5 py-1 rounded-full border font-pixel text-[8.5px] uppercase tracking-[0.12em] cursor-pointer transition-colors ${
                autoTour
                  ? 'border-[var(--g2-phosphor)]/60 text-[var(--g2-phosphor)] bg-black/70'
                  : 'border-white/15 text-[var(--lightgray)] bg-black/70 hover:text-[var(--bright)]'
              }`}
            >
              {autoTour ? 'Auto Tour On' : 'Auto Tour'}
            </button>
            {onEnterLensView && (
              <button
                type="button"
                onClick={() => {
                  setAutoTour(false);
                  onEnterLensView();
                }}
                className="px-3 py-1 rounded-full bg-black/75 border border-[var(--g2-phosphor)]/70 text-[var(--g2-phosphor)] hover:bg-[var(--g2-phosphor)] hover:text-[#0a0a0a] font-pixel text-[9px] uppercase tracking-[0.13em] cursor-pointer transition-colors"
              >
                Look Through G2
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
