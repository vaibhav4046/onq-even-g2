import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

export interface GalaxyMemoryItem {
  id: string;
  kind: 'task' | 'meeting' | 'email' | 'telegram' | 'note';
  title: string;
  summary: string;
  source: string;
  createdAtIso: string;
}

export interface Memory3DGalaxyProps {
  memories: GalaxyMemoryItem[];
  onSelectItem?: (item: GalaxyMemoryItem) => void;
}

interface PositionedNode {
  item: GalaxyMemoryItem;
  pos: [number, number, number];
  color: string;
  radius: number;
}

const KIND_COLOR: Record<GalaxyMemoryItem['kind'], string> = {
  task: '#00ff88',
  telegram: '#38bdf8',
  meeting: '#a3e635',
  email: '#34d399',
  note: '#facc15',
};

function GalaxyScene({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: PositionedNode[];
  selectedId: string | null;
  onSelect: (n: PositionedNode) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.14;
    }
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[0, 0, 0]} intensity={2.2} color="#00ff88" distance={16} />
      <group ref={groupRef}>
        {/* Central Core Node (JJK Six Eyes / Unified Brain) */}
        <mesh>
          <icosahedronGeometry args={[0.38, 1]} />
          <meshStandardMaterial
            color="#041c10"
            emissive="#00ff88"
            emissiveIntensity={1.35}
            wireframe
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.19, 16, 16]} />
          <meshBasicMaterial color="#00ff88" />
        </mesh>

        {/* Orbital Rings */}
        {[1.55, 2.35].map((r, i) => (
          <mesh key={r} rotation={[Math.PI / 2 + (i === 1 ? 0.32 : -0.18), 0.2 * i, 0]}>
            <torusGeometry args={[r, 0.008, 8, 72]} />
            <meshBasicMaterial color="#00ff88" transparent opacity={0.18} />
          </mesh>
        ))}

        {/* Filament Links + Memory Stars */}
        {nodes.map((node) => {
          const isSelected = node.item.id === selectedId || node.item.id === hoveredId;
          return (
            <group key={node.item.id}>
              <Line
                points={[
                  [0, 0, 0],
                  node.pos,
                ]}
                color={node.color}
                transparent
                opacity={isSelected ? 0.65 : 0.18}
                lineWidth={isSelected ? 1.5 : 0.8}
              />
              <mesh
                position={node.pos}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(node);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHoveredId(node.item.id);
                }}
                onPointerOut={() => setHoveredId(null)}
              >
                <sphereGeometry args={[isSelected ? node.radius * 1.45 : node.radius, 14, 14]} />
                <meshStandardMaterial
                  color="#05160c"
                  emissive={node.color}
                  emissiveIntensity={isSelected ? 2.1 : 1.05}
                  roughness={0.25}
                />
                {isSelected && (
                  <Html distanceFactor={8} position={[0, 0.25, 0]}>
                    <div className="pointer-events-none whitespace-nowrap rounded border border-[#00ff88]/50 bg-black/90 px-2 py-0.5 font-mono text-[9px] text-[#b4ffd7] shadow-lg">
                      {node.item.title.slice(0, 32)}
                    </div>
                  </Html>
                )}
              </mesh>
            </group>
          );
        })}
      </group>
      <OrbitControls enableZoom={true} enablePan={false} minDistance={2.8} maxDistance={7.5} />
    </>
  );
}

export const Memory3DGalaxy: React.FC<Memory3DGalaxyProps> = ({ memories, onSelectItem }) => {
  const [selected, setSelected] = useState<GalaxyMemoryItem | null>(memories[0] ?? null);

  const nodes = useMemo<PositionedNode[]>(() => {
    const items = memories.slice(0, 28);
    const n = Math.max(1, items.length);
    return items.map((item, idx) => {
      // Deterministic golden-angle Fibonacci lattice in 3D orbital shells
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const yNorm = 1 - ((idx + 0.5) / n) * 2;
      const radial = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const theta = goldenAngle * idx;
      const shell = idx % 2 === 0 ? 1.55 : 2.3;
      return {
        item,
        pos: [
          Math.cos(theta) * radial * shell,
          yNorm * (shell * 0.72),
          Math.sin(theta) * radial * shell,
        ],
        color: KIND_COLOR[item.kind] ?? '#00ff88',
        radius: item.kind === 'task' || item.kind === 'telegram' ? 0.13 : 0.105,
      };
    });
  }, [memories]);

  const activeSelection = selected ?? memories[0] ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[220px] w-full overflow-hidden rounded-xl border border-[#00ff88]/25 bg-[#030906]">
        <Canvas camera={{ position: [0, 1.3, 4.4], fov: 44 }} dpr={[1, 1.5]}>
          <color attach="background" args={['#030906']} />
          <GalaxyScene
            nodes={nodes}
            selectedId={activeSelection?.id ?? null}
            onSelect={(n) => {
              setSelected(n.item);
              onSelectItem?.(n.item);
            }}
          />
        </Canvas>
        <div className="pointer-events-none absolute left-2.5 top-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[#00ff88]/80">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00ff88]" />
          {memories.length} 3D Nodes · Drag to Orbit
        </div>
      </div>

      {activeSelection && (
        <div className="rounded-lg border border-white/10 bg-black/50 p-2.5 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#00ff88]">
              {activeSelection.kind} · {activeSelection.source}
            </span>
            <span className="font-mono text-[9px] text-zinc-500">
              {activeSelection.createdAtIso.slice(11, 16)}
            </span>
          </div>
          <div className="mt-1 font-medium text-zinc-100">{activeSelection.title}</div>
          <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">
            {activeSelection.summary}
          </div>
        </div>
      )}
    </div>
  );
};
