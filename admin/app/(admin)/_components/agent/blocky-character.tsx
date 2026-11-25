"use client";

import { useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import type { Group, Mesh } from "three";
import type { AvatarConfig } from "./avatar-config";

export type CharacterPose = "idle" | "working" | "waving";

function Block({
  size,
  position,
  color,
  rotation,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

/**
 * Karakter blok 3D (dipakai di editor avatar dan nanti di kantor 3D).
 * Satuan: tinggi karakter kira-kira 3.
 */
export function BlockyCharacter({ avatar, pose = "idle" }: { avatar: AvatarConfig; pose?: CharacterPose }) {
  const root = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const head = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (root.current) root.current.position.y = Math.sin(t * 2) * 0.03;
    if (head.current) head.current.rotation.y = Math.sin(t * 0.8) * 0.12;
    if (armL.current && armR.current) {
      if (pose === "working") {
        armL.current.rotation.x = -1.1 + Math.sin(t * 14) * 0.12;
        armR.current.rotation.x = -1.1 + Math.sin(t * 14 + Math.PI) * 0.12;
        armR.current.rotation.z = 0;
      } else if (pose === "waving") {
        armL.current.rotation.x = Math.sin(t * 2) * 0.08;
        armR.current.rotation.x = 0;
        armR.current.rotation.z = 2.6 + Math.sin(t * 6) * 0.35;
      } else {
        armL.current.rotation.x = Math.sin(t * 2) * 0.08;
        armR.current.rotation.x = -Math.sin(t * 2) * 0.08;
        armR.current.rotation.z = 0;
      }
    }
  });

  const { skin, hair, hair_style, shirt, pants, accessory } = avatar;
  const dark = "#18122b";

  return (
    <group ref={root}>
      {/* kaki */}
      <Block size={[0.44, 0.9, 0.44]} position={[-0.24, 0.45, 0]} color={pants} />
      <Block size={[0.44, 0.9, 0.44]} position={[0.24, 0.45, 0]} color={pants} />
      {/* badan */}
      <Block size={[1, 1, 0.56]} position={[0, 1.4, 0]} color={shirt} />
      {accessory === "tie" && <Block size={[0.14, 0.62, 0.04]} position={[0, 1.48, 0.3]} color={dark} />}
      {/* lengan: diputar dari bahu */}
      <group ref={armL} position={[-0.72, 1.86, 0]}>
        <Block size={[0.4, 0.78, 0.42]} position={[0, -0.36, 0]} color={shirt} />
        <Block size={[0.38, 0.2, 0.4]} position={[0, -0.84, 0]} color={skin} />
      </group>
      <group ref={armR} position={[0.72, 1.86, 0]}>
        <Block size={[0.4, 0.78, 0.42]} position={[0, -0.36, 0]} color={shirt} />
        <Block size={[0.38, 0.2, 0.4]} position={[0, -0.84, 0]} color={skin} />
      </group>
      {/* kepala */}
      <mesh ref={head} position={[0, 2.38, 0]} castShadow>
        <boxGeometry args={[0.9, 0.86, 0.86]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
        {/* mata dan mulut */}
        <Block size={[0.13, 0.16, 0.02]} position={[-0.2, 0.02, 0.435]} color={dark} />
        <Block size={[0.13, 0.16, 0.02]} position={[0.2, 0.02, 0.435]} color={dark} />
        <Block size={[0.26, 0.05, 0.02]} position={[0, -0.2, 0.435]} color={dark} />
        <Block size={[0.12, 0.06, 0.02]} position={[-0.32, -0.12, 0.435]} color="#f9a8d4" />
        <Block size={[0.12, 0.06, 0.02]} position={[0.32, -0.12, 0.435]} color="#f9a8d4" />
        {/* rambut */}
        {hair_style === "short" && (
          <>
            <Block size={[0.94, 0.2, 0.9]} position={[0, 0.43, 0]} color={hair} />
            <Block size={[0.94, 0.3, 0.2]} position={[0, 0.24, -0.36]} color={hair} />
          </>
        )}
        {hair_style === "long" && (
          <>
            <Block size={[0.96, 0.22, 0.92]} position={[0, 0.43, 0]} color={hair} />
            <Block size={[0.96, 1.05, 0.22]} position={[0, -0.1, -0.38]} color={hair} />
            <Block size={[0.12, 0.85, 0.7]} position={[-0.47, 0, -0.06]} color={hair} />
            <Block size={[0.12, 0.85, 0.7]} position={[0.47, 0, -0.06]} color={hair} />
          </>
        )}
        {hair_style === "bun" && (
          <>
            <Block size={[0.94, 0.18, 0.9]} position={[0, 0.42, 0]} color={hair} />
            <Block size={[0.36, 0.3, 0.36]} position={[0, 0.62, -0.18]} color={hair} />
          </>
        )}
        {hair_style === "cap" && (
          <>
            <Block size={[0.98, 0.26, 0.94]} position={[0, 0.46, 0]} color={hair} />
            <Block size={[0.7, 0.06, 0.42]} position={[0, 0.34, 0.6]} color={hair} />
          </>
        )}
        {/* aksesori kepala */}
        {accessory === "glasses" && (
          <>
            <Block size={[0.3, 0.24, 0.02]} position={[-0.2, 0.02, 0.45]} color="#f8fafc" />
            <Block size={[0.3, 0.24, 0.02]} position={[0.2, 0.02, 0.45]} color="#f8fafc" />
            <Block size={[0.72, 0.05, 0.03]} position={[0, 0.13, 0.46]} color={dark} />
          </>
        )}
        {accessory === "headset" && (
          <>
            <Block size={[1.04, 0.08, 0.12]} position={[0, 0.5, 0]} color={dark} />
            <Block size={[0.1, 0.34, 0.3]} position={[-0.5, 0, 0]} color={dark} />
            <Block size={[0.1, 0.34, 0.3]} position={[0.5, 0, 0]} color={dark} />
            <Block size={[0.06, 0.06, 0.32]} position={[-0.47, -0.18, 0.24]} color={dark} />
          </>
        )}
        {accessory === "flower" && (
          <>
            <Block size={[0.22, 0.22, 0.08]} position={[0.32, 0.46, 0.3]} color="#ffffff" />
            <Block size={[0.1, 0.1, 0.1]} position={[0.32, 0.46, 0.34]} color="#ffb81c" />
          </>
        )}
        {accessory === "antenna" && (
          <>
            <Block size={[0.05, 0.42, 0.05]} position={[-0.22, 0.62, 0]} color={dark} rotation={[0, 0, 0.35]} />
            <Block size={[0.05, 0.42, 0.05]} position={[0.22, 0.62, 0]} color={dark} rotation={[0, 0, -0.35]} />
            <Block size={[0.14, 0.14, 0.14]} position={[-0.3, 0.84, 0]} color="#ffb81c" />
            <Block size={[0.14, 0.14, 0.14]} position={[0.3, 0.84, 0]} color="#ffb81c" />
          </>
        )}
      </mesh>
    </group>
  );
}
