"use client";

import React from "react";

/** Kartu gelap dengan sorot cahaya yang mengikuti penunjuk. */
export default function Spotlight({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`lp-card ${className}`}
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - box.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - box.top}px`);
      }}
    >
      {children}
    </div>
  );
}
