import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../(admin)/_components/brand-mark";
import { buttonClasses } from "../(admin)/_components/ui/button-classes";
import { CallToAction, Faq, Setup, UseCases } from "./_landing/Closing";
import Features from "./_landing/Features";
import Journey from "./_landing/Journey";

export const metadata: Metadata = {
  title: { absolute: "MBUTI — Tim AI yang bekerja dari SOP Anda" },
};

const LINKS = [
  { href: "#alur", label: "Cara kerja" },
  { href: "#fitur", label: "Fitur" },
  { href: "#mulai", label: "Mulai" },
  { href: "#tanya", label: "Tanya jawab" },
];

export default function HomePage() {
  return (
    <div className="lp-root min-h-screen flex flex-col">
      <header className="fixed inset-x-0 top-3 z-50 px-3">
        <nav aria-label="Navigasi utama" className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border border-white/15 bg-ink/75 py-2 pl-2.5 pr-2 shadow-[0_18px_40px_-20px_rgba(24,18,43,.8)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={36} />
            <span className="font-extrabold tracking-wide text-white">
              MBUTI<span className="text-accent">.</span>
            </span>
          </Link>
          <ul className="hidden md:flex items-center gap-1 text-sm font-medium text-white/70">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-white/10 hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Link href="/login" className={`${buttonClasses("accent", "md")} rounded-full`}>
            Masuk
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <Journey />
        <div className="relative z-20 bg-canvas">
          <div className="admin-shell">
            <div className="pt-6">
              <UseCases />
            </div>
            <Features />
            <Setup />
            <Faq />
            <CallToAction />
          </div>
        </div>
      </main>

      <footer className="relative z-20 bg-ink text-white/60">
        <div className="max-w-7xl mx-auto px-5 sm:px-10 py-8 flex flex-wrap items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-2.5">
            <BrandMark size={28} />
            Multi-agent Business &amp; Unified Task Intelligence
          </span>
          <span>© 2026 MBUTI</span>
        </div>
      </footer>
    </div>
  );
}
