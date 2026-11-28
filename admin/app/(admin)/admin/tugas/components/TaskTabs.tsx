import Link from "next/link";
import React from "react";

const TABS = [
  { href: "/admin/tugas", label: "Tugas" },
  { href: "/admin/tugas/rutin", label: "Tugas rutin" },
];

export default function TaskTabs({ active }: { active: string }) {
  return (
    <nav className="inline-flex gap-1 rounded-2xl bg-surface/70 border border-rim p-1" aria-label="Jenis tugas">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center transition-all ${active === t.href ? "bg-ink text-canvas shadow-md" : "text-muted hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
