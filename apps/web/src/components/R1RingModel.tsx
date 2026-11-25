import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HudPhase } from '@onq/core';
import { createBrushedTitaniumMaps, createDotSpriteTexture } from './hardwareTextures';

interface R1RingModelProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  phase: HudPhase;
  explodeFactor?: number;
  macroFocus?: boolean;
  reducedMotion?: boolean;
  theme?: 'dark' | 'light';
}

/**
 * Procedural machined brushed-titanium Even R1 Smart Ring with chamfered bevels,
 * flush matte-obsidian capacitive touch saddle, and phase-reactive micro-accent.
 */
export function R1RingModel({
  position = [1.42, -0.49, 0.72],
  rotation = [Math.PI * 0.5, 0.12, -0.35],
  scale = 1,
  phase,
  explodeFactor = 0,
  macroFocus = false,
  reducedMotion = false,
  theme = 'dark',
}: R1RingModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const accentMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const maps = useMemo(() => createBrushedTitaniumMaps(), []);
  const dotTex = useMemo(() => createDotSpriteTexture(), []);
  useEffect(() => () => {
    maps.dispose();
    dotTex.dispose();
  }, [maps, dotTex]);

  // Chamfered architectural titanium profile revolved cleanly via LatheGeometry
  const ringGeometry = useMemo(() => {
    const outerR = 0.34;
    const innerR = 0.275;
    const halfH = 0.095;
    const chamfer = 0.02;

    const pts = [
      new THREE.Vector2(innerR + 0.008, -halfH),
      new THREE.Vector2(outerR - chamfer, -halfH),
      new THREE.Vector2(outerR, -halfH + chamfer),
      new THREE.Vector2(outerR, halfH - chamfer),
      new THREE.Vector2(outerR - chamfer, halfH),
      new THREE.Vector2(innerR + 0.008, halfH),
      new THREE.Vector2(innerR, halfH - 0.014),
      new THREE.Vector2(innerR, -halfH + 0.014),
      new THREE.Vector2(innerR + 0.008, -halfH),
    ];

    const geom = new THREE.LatheGeometry(pts, 72);
    geom.computeVertexNormals();
    return geom;
  }, []);

  // Capacitive touchpad inlay arc seated flush on front outer wall
  const touchPadGeometry = useMemo(() => {
    const geom = new THREE.CylinderGeometry(0.3425, 0.3425, 0.105, 32, 1, true, -0.45, 0.9);
    geom.computeVertexNormals();
    return geom;
  }, []);

  // Ultra-fine recessed 525nm status groove hairline on touch saddle
  const hairlineGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(0.344, 0.344, 0.012, 28, 1, true, -0.26, 0.52);
  }, []);

  const dotGeometry = useMemo(() => {
    const pos = ringGeometry.attributes.position;
    const norm = ringGeometry.attributes.normal;
    const pts: number[] = [];
    const cols: number[] = [];
    const c1 = new THREE.Color('#34F57E');
    const c2 = new THREE.Color('#86FFAF');
    for (let i = 0; i < pos.count; i += 2) {
      const nx = norm ? norm.getX(i) : 0;
      const ny = norm ? norm.getY(i) : 0;
      const nz = norm ? norm.getZ(i) : 0;
      pts.push(pos.getX(i) + nx * 0.004, pos.getY(i) + ny * 0.004, pos.getZ(i) + nz * 0.004);
      const col = i % 6 === 0 ? c2 : c1;
      cols.push(col.r, col.g, col.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }, [ringGeometry]);

  useEffect(() => {
    return () => {
      ringGeometry.dispose();
      touchPadGeometry.dispose();
      hairlineGeometry.dispose();
      dotGeometry.dispose();
    };
  }, [ringGeometry, touchPadGeometry, hairlineGeometry, dotGeometry]);

  const accentColor =
    phase === 'conflict' || phase === 'error'
      ? '#D4FFE4'
      : phase === 'armed' || phase === 'wrap_up'
        ? '#86FFAF'
        : '#34F57E';

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const targetZ = position[2] + explodeFactor * 0.55;
    const targetY =
      position[1] + (macroFocus && !reducedMotion ? Math.sin(state.clock.elapsedTime * 1.4) * 0.025 : 0);
    groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, position[0], 6, delta);
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, targetY, 6, delta);
    groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, targetZ, 6, delta);

    groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, rotation[0], 6, delta);
    groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, rotation[2], 6, delta);
    if (macroFocus && !reducedMotion) {
      groupRef.current.rotation.y += delta * 0.32;
    } else {
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, rotation[1], 6, delta);
    }

    if (accentMatRef.current) {
      const pulse =
        phase === 'armed' || phase === 'listening' || phase === 'meeting_live'
          ? 0.55 + 0.45 * Math.sin(state.clock.elapsedTime * 5)
          : 0.68;
      accentMatRef.current.opacity = pulse;
    }
  });

  const titaniumHex = theme === 'light' ? '#323739' : '#262b2c';

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <mesh geometry={ringGeometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={titaniumHex}
          metalness={0.9}
          roughness={0.23}
          roughnessMap={maps.roughnessMap}
          bumpMap={maps.bumpMap}
          bumpScale={0.0025}
          clearcoat={0.38}
          clearcoatRoughness={0.22}
          envMapIntensity={1.45}
        />
      </mesh>

      {/* Matte obsidian capacitive touch surface inlay */}
      <mesh geometry={touchPadGeometry}>
        <meshPhysicalMaterial
          color="#101312"
          metalness={0.18}
          roughness={0.55}
          clearcoat={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Recessed 525nm phosphor micro-accent */}
      <mesh geometry={hairlineGeometry}>
        <meshBasicMaterial
          ref={accentMatRef}
          color={accentColor}
          transparent
          opacity={0.7}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Dot-matrix titanium contour shimmer */}
      <points geometry={dotGeometry}>
        <pointsMaterial
          map={dotTex}
          size={0.015}
          sizeAttenuation
          vertexColors
          transparent
          opacity={macroFocus ? 0.58 : 0.34}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
