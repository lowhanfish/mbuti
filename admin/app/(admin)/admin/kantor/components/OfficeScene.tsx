"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BlockyCharacter, type CharacterPose } from "../../../_components/agent/blocky-character";
import { RELATION_STYLE } from "../../relasi/types";
import { buildLayout, tint, type RoomLayout } from "../office-layout";
import { ACTIVITY_LABEL, type AgentActivity, type OfficeAgent, type OfficeState, type OfficeTransfer } from "../types";
import { TextSprite } from "./Sprites";

const POSE: Record<AgentActivity, CharacterPose> = {
  idle: "idle",
  working: "working",
  reviewing: "working",
  consulting: "working",
  incoming: "idle",
  waiting: "waving",
  paused: "idle",
  draft: "idle",
};

const CHAR_SCALE = 0.72;

/** Kamera isometrik: bisa diputar terbatas, digeser, dan diperbesar. */
function Controls({ span, controlsRef }: { span: number; controlsRef: React.RefObject<OrbitControls | null> }) {
  const { camera, gl, size } = useThree();
  const getState = useThree((s) => s.get);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = Math.PI / 7;
    controls.maxPolarAngle = Math.PI / 2.7;
    controls.minZoom = 12;
    controls.maxZoom = 110;
    controls.screenSpacePanning = true;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, controlsRef]);

  // Sesuaikan zoom awal agar seluruh denah terlihat
  useEffect(() => {
    const ortho = getState().camera as THREE.OrthographicCamera;
    ortho.zoom = Math.max(16, Math.min(70, Math.min(size.width, size.height) / (span * 0.78)));
    ortho.updateProjectionMatrix();
  }, [getState, size.width, size.height, span]);

  useFrame(() => controlsRef.current?.update());
  return null;
}

function Desk({ x, z, glowing, color }: { x: number; z: number; glowing: boolean; color: string }) {
  return (
    <group position={[x, 0, z + 0.55]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.08, 0.85]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      {[-0.75, 0.75].map((dx) => (
        <mesh key={dx} position={[dx, 0.27, 0]} castShadow>
          <boxGeometry args={[0.08, 0.54, 0.75]} />
          <meshStandardMaterial color={tint(color, 0.35)} />
        </mesh>
      ))}
      {/* Monitor: layar menyala saat role bekerja */}
      <mesh position={[0, 0.92, 0.18]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.05]} />
        <meshStandardMaterial color="#18122b" />
      </mesh>
      <mesh position={[0, 0.92, 0.21]}>
        <planeGeometry args={[0.7, 0.4]} />
        <meshStandardMaterial
          color={glowing ? "#c4b5fd" : "#334155"}
          emissive={glowing ? "#7c4dff" : "#000000"}
          emissiveIntensity={glowing ? 0.9 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.66, 0.2]}>
        <boxGeometry args={[0.1, 0.2, 0.05]} />
        <meshStandardMaterial color="#18122b" />
      </mesh>
    </group>
  );
}

function Character({
  agent,
  x,
  z,
  selected,
  onSelect,
}: {
  agent: OfficeAgent;
  x: number;
  z: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const act = ACTIVITY_LABEL[agent.activity];
  const dim = agent.activity === "paused" || agent.activity === "draft";
  return (
    <group position={[x, 0, z - 0.2]}>
      <group
        scale={CHAR_SCALE}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(agent.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <BlockyCharacter avatar={dim ? { ...agent.avatar, shirt: "#cbd5e1", pants: "#94a3b8" } : agent.avatar} pose={POSE[agent.activity]} />
      </group>
      {/* Lingkar penanda di lantai: warna aktivitas */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.42, selected ? 0.62 : 0.52, 40]} />
        <meshBasicMaterial color={selected ? "#7c4dff" : act.color} transparent opacity={selected ? 0.95 : 0.7} />
      </mesh>
      <TextSprite text={agent.name} position={[0, 2.55, 0]} height={0.4} font={20} bold />
      {act.symbol && (
        <TextSprite text={act.symbol} position={[0, 3.1, 0]} height={0.46} bg={act.color} fg="#ffffff" font={24} bold bob={0.06} />
      )}
    </group>
  );
}

function Room({
  room,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  room: RoomLayout;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const { unit, x, z, w, d } = room;
  const floor = tint(unit.color, selected ? 0.55 : hovered ? 0.65 : 0.78);
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0.06, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect(unit.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(unit.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[w, 0.12, d]} />
        <meshStandardMaterial color={floor} roughness={0.85} />
      </mesh>
      {/* Dinding belakang dan kiri */}
      <mesh position={[0, 0.65, -d / 2 + 0.06]} castShadow receiveShadow>
        <boxGeometry args={[w, 1.2, 0.12]} />
        <meshStandardMaterial color={tint(unit.color, 0.25)} transparent opacity={0.92} />
      </mesh>
      <mesh position={[-w / 2 + 0.06, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.12, 1.2, d]} />
        <meshStandardMaterial color={tint(unit.color, 0.4)} transparent opacity={0.9} />
      </mesh>
      {/* Garis tepi saat dipilih */}
      {selected && (
        <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w - 0.2, d - 0.2]} />
          <meshBasicMaterial color="#7c4dff" transparent opacity={0.12} />
        </mesh>
      )}
      <TextSprite
        text={`${unit.code ? unit.code + " · " : ""}${unit.name}`}
        position={[0, 1.75, -d / 2 + 0.1]}
        height={0.55}
        bg={unit.color}
        fg="#ffffff"
        font={22}
        bold
      />
      {unit.active_task_count > 0 && (
        <TextSprite text={`${unit.active_task_count} tugas aktif`} position={[w / 2 - 1.2, 1.2, -d / 2 + 0.1]} height={0.36} bg="#18122b" fg="#ffb81c" font={18} bold />
      )}
    </group>
  );
}

/** Amplop yang terbang dari role pengirim ke role penerima. */
function Envelope({ from, to, color, delay }: { from: [number, number]; to: [number, number]; color: string; delay: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = ((clock.getElapsedTime() + delay) % 1.8) / 1.8;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    ref.current.position.set(from[0] + (to[0] - from[0]) * ease, 1.4 + Math.sin(Math.PI * t) * 1.6, from[1] + (to[1] - from[1]) * ease);
    ref.current.rotation.y = clock.getElapsedTime() * 2;
  });
  return (
    <group ref={ref}>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.06, 0.34]} />
        <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[0.24, 0.24]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function Scene({
  state,
  selectedUnit,
  selectedAgent,
  onSelectUnit,
  onSelectAgent,
  controlsRef,
}: {
  state: OfficeState;
  selectedUnit: string | null;
  selectedAgent: string | null;
  onSelectUnit: (id: string | null) => void;
  onSelectAgent: (id: string | null) => void;
  controlsRef: React.RefObject<OrbitControls | null>;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { rooms, span } = useMemo(() => buildLayout(state.units, state.agents), [state.units, state.agents]);
  const positions = useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const r of rooms) for (const a of r.agents) map.set(a.agent.id, [a.x, a.z]);
    return map;
  }, [rooms]);

  const transfers = state.transfers.filter((t) => positions.has(t.from_agent_id) && positions.has(t.to_agent_id));

  return (
    <>
      <Controls span={span} controlsRef={controlsRef} />
      <hemisphereLight args={["#ffffff", "#c4b5fd", 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[18, 28, 12]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow onClick={() => (onSelectUnit(null), onSelectAgent(null))}>
        <planeGeometry args={[span * 3, span * 3]} />
        <meshStandardMaterial color="#f3efff" />
      </mesh>
      <gridHelper args={[span * 3, Math.round(span * 1.5), "#e4dcff", "#ece6ff"]} position={[0, 0, 0]} />

      {rooms.map((room) => (
        <group key={room.unit.id}>
          <Room room={room} selected={selectedUnit === room.unit.id} hovered={hovered === room.unit.id} onSelect={onSelectUnit} onHover={setHovered} />
          {room.agents.map(({ agent, x, z }) => (
            <group key={agent.id}>
              <Desk x={x} z={z} color={room.unit.color} glowing={["working", "reviewing", "consulting"].includes(agent.activity)} />
              <Character agent={agent} x={x} z={z} selected={selectedAgent === agent.id} onSelect={onSelectAgent} />
            </group>
          ))}
        </group>
      ))}

      {transfers.map((t: OfficeTransfer, i) => (
        <Envelope
          key={`${t.task_id}-${t.to_agent_id}`}
          from={positions.get(t.from_agent_id)!}
          to={positions.get(t.to_agent_id)!}
          color={t.relation_type ? RELATION_STYLE[t.relation_type].color : "#ffb81c"}
          delay={i * 0.4}
        />
      ))}
    </>
  );
}

export default function OfficeScene(props: {
  state: OfficeState;
  selectedUnit: string | null;
  selectedAgent: string | null;
  onSelectUnit: (id: string | null) => void;
  onSelectAgent: (id: string | null) => void;
}) {
  const controlsRef = useRef<OrbitControls | null>(null);

  const zoomBy = (factor: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = controls.object as THREE.OrthographicCamera;
    cam.zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, cam.zoom * factor));
    cam.updateProjectionMatrix();
  };

  return (
    <div className="absolute inset-0">
      <Canvas
        orthographic
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [24, 22, 24], zoom: 30, near: 0.1, far: 400 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => {
          props.onSelectUnit(null);
          props.onSelectAgent(null);
        }}
      >
        <Scene {...props} controlsRef={controlsRef} />
      </Canvas>
      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
        {[
          ["+", 1.25, "Perbesar"],
          ["−", 0.8, "Perkecil"],
        ].map(([label, f, title]) => (
          <button
            key={String(label)}
            type="button"
            title={String(title)}
            aria-label={String(title)}
            onClick={() => zoomBy(Number(f))}
            className="w-9 h-9 rounded-xl glass text-ink font-bold hover:text-brand cursor-pointer"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
