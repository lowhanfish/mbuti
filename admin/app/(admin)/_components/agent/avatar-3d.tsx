"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import type { Group } from "three";
import type { AvatarConfig } from "./avatar-config";
import { BlockyCharacter, type CharacterPose } from "./blocky-character";

/** Putar karakter pelan; bisa diseret untuk memutar sendiri. */
function Turntable({ children, dragRef }: { children: React.ReactNode; dragRef: React.RefObject<number> }) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += dragRef.current !== 0 ? dragRef.current : delta * 0.5;
    dragRef.current *= 0.85;
    if (Math.abs(dragRef.current) < 0.001) dragRef.current = 0;
  });
  return <group ref={group}>{children}</group>;
}

export default function Avatar3D({
  avatar,
  pose = "waving",
  className = "",
}: {
  avatar: AvatarConfig;
  pose?: CharacterPose;
  className?: string;
}) {
  const drag = useRef(0);
  const lastX = useRef<number | null>(null);

  return (
    <div
      className={`relative touch-none cursor-grab active:cursor-grabbing ${className}`}
      onPointerDown={(e) => {
        lastX.current = e.clientX;
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (lastX.current === null) return;
        drag.current = (e.clientX - lastX.current) * 0.01;
        lastX.current = e.clientX;
      }}
      onPointerUp={() => (lastX.current = null)}
      onPointerCancel={() => (lastX.current = null)}
      role="img"
      aria-label="Pratinjau karakter 3D. Seret untuk memutar."
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0.5, 6.6], fov: 32 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#b79cff" />
        {/* Kamera bawaan R3F menatap titik (0,0,0); karakter digeser turun agar badannya di tengah */}
        <group position={[0, -1.5, 0]}>
          <Turntable dragRef={drag}>
            <BlockyCharacter avatar={avatar} pose={pose} />
          </Turntable>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <circleGeometry args={[1.3, 48]} />
            <meshStandardMaterial color="#efe8ff" transparent opacity={0.9} />
          </mesh>
        </group>
      </Canvas>
    </div>
  );
}
