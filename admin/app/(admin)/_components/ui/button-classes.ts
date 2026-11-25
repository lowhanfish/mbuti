/** Kelas tombol, terpisah dari button.tsx agar bisa dipakai di Server Component (mis. untuk <Link>). */
export type ButtonVariant = "primary" | "secondary" | "danger" | "outline" | "ghost" | "accent" | "dark";
export type ButtonSize = "sm" | "md" | "lg";

export const buttonClasses = (
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md"
) => {
  const base =
    "relative inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none select-none gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.97] whitespace-nowrap";

  const sizes = {
    sm: "px-3 text-xs h-8",
    md: "px-4 text-sm h-10",
    lg: "px-6 text-base h-12",
  }[size];

  const variants = {
    primary:
      "text-white bg-gradient-to-br from-[#9b6bff] via-brand to-brand-strong shadow-[0_8px_20px_-6px_rgba(124,77,255,.65)] hover:shadow-[0_12px_28px_-6px_rgba(124,77,255,.75)] hover:-translate-y-px",
    accent:
      "text-ink bg-gradient-to-br from-[#ffd25c] via-accent to-accent-strong shadow-[0_8px_20px_-6px_rgba(245,158,11,.6)] hover:shadow-[0_12px_28px_-6px_rgba(245,158,11,.7)] hover:-translate-y-px",
    dark: "text-white bg-ink hover:bg-[#2a2140] shadow-[0_8px_20px_-8px_rgba(24,18,43,.6)] hover:-translate-y-px",
    secondary: "bg-white text-ink border border-line hover:border-brand/30 hover:text-brand shadow-sm",
    outline:
      "border border-line text-ink bg-white/70 backdrop-blur hover:bg-white hover:border-brand/40 hover:text-brand",
    ghost: "text-muted hover:text-brand hover:bg-brand-soft/70",
    danger:
      "text-white bg-gradient-to-br from-rose-500 to-red-600 shadow-[0_8px_20px_-8px_rgba(225,29,72,.6)] hover:-translate-y-px",
  }[variant];

  return `${base} ${sizes} ${variants}`;
};
