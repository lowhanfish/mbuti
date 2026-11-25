"use client";

import { useFrame } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Buat tekstur teks di kanvas (papan nama, label, gelembung status). */
const makeTexture = (text: string, opts: { bg: string; fg: string; font: number; pad: number; radius: number; bold?: boolean }) => {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${opts.bold ? "700" : "600"} ${opts.font * scale}px ui-sans-serif, system-ui, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + opts.pad * 2 * scale);
  const h = Math.ceil(opts.font * scale + opts.pad * 1.6 * scale);
  canvas.width = Math.max(w, h);
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = opts.bg;
  const r = Math.min(opts.radius * scale, h / 2);
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, h, r);
  ctx.fill();
  ctx.fillStyle = opts.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, h / 2 + scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: canvas.width / h };
};

/** Label datar yang selalu menghadap kamera. */
export function TextSprite({
  text,
  position,
  height = 0.5,
  bg = "rgba(255,255,255,.92)",
  fg = "#18122b",
  font = 22,
  bold = false,
  bob = 0,
}: {
  text: string;
  position: [number, number, number];
  height?: number;
  bg?: string;
  fg?: string;
  font?: number;
  bold?: boolean;
  /** Amplitudo naik-turun (0 = diam) */
  bob?: number;
}) {
  const { texture, aspect } = useMemo(() => makeTexture(text, { bg, fg, font, pad: 12, radius: 14, bold }), [text, bg, fg, font, bold]);
  useEffect(() => () => texture.dispose(), [texture]);
  const ref = useRef<THREE.Sprite>(null);
  // Fase naik-turun berbeda per label, ditentukan dari teksnya
  const offset = useMemo(() => [...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 10, [text]);
  useFrame(({ clock }) => {
    if (ref.current && bob) ref.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 3 + offset) * bob;
  });
  return (
    <sprite ref={ref} position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthWrite={false} depthTest={false} />
    </sprite>
  );
}
