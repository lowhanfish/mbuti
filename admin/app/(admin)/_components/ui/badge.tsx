import React from "react";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "info" | "neutral" | "accent" | "dark";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  className?: string;
}

export function Badge({ children, variant = "neutral", size = "md", dot = false, className = "" }: BadgeProps) {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1 text-sm",
  }[size];

  const variantClasses = {
    success: "bg-emerald-500/12 text-emerald-700",
    warning: "bg-amber-400/20 text-amber-800",
    danger: "bg-rose-500/12 text-rose-700",
    info: "bg-brand-soft text-brand-strong",
    accent: "bg-accent-soft text-amber-800",
    dark: "bg-night text-accent dark:bg-accent-soft",
    neutral: "bg-surface/80 text-muted border border-line",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full select-none whitespace-nowrap ${sizeClasses} ${variantClasses} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}
