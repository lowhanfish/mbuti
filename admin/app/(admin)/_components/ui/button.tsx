"use client";

import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs h-8",
    md: "px-4 py-2 text-sm h-10",
    lg: "px-5 py-2.5 text-base h-12",
  }[size];

  const variantClasses = {
    primary:
      "bg-brand text-white shadow-[0_6px_16px_rgba(76,91,212,.32)] hover:bg-brand-strong active:scale-[0.98]",
    accent:
      "bg-accent text-[#3b2a05] shadow-[0_6px_16px_rgba(242,169,59,.32)] hover:brightness-105 active:scale-[0.98]",
    secondary: "bg-white/85 text-ink border border-white hover:bg-white active:scale-[0.98]",
    outline:
      "border border-line text-ink bg-white/70 backdrop-blur hover:bg-white shadow-[0_2px_8px_rgba(40,52,140,.06)] active:scale-[0.98]",
    ghost: "text-muted hover:text-brand hover:bg-white/70 active:scale-[0.98]",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm active:scale-[0.98]",
  }[variant];

  return (
    <button
      type={type}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
}
