import React from "react";

interface SlotProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: SlotProps) {
  return <div className={`glass rounded-3xl overflow-hidden ${className}`}>{children}</div>;
}

export function CardHeader({ children, className = "" }: SlotProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-6 py-4 border-b border-white/70 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "" }: SlotProps) {
  return <h3 className={`text-base font-bold text-ink ${className}`}>{children}</h3>;
}

export function CardContent({ children, className = "" }: SlotProps) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
