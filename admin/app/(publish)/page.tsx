import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../(admin)/_components/brand-mark";
import { buttonClasses } from "../(admin)/_components/ui/button-classes";
import { CallToAction, Faq, Setup, UseCases } from "./_landing/Closing";
import Features from "./_landing/Features";
import Journey from "./_landing/Journey";
import Pricing from "./_landing/Pricing";
import { Comparison, Control, Roadmap } from "./_landing/Saas";

export const metadata: Metadata = {
  title: { absolute: "MBUTI — Rekrut tim AI yang bekerja dari SOP Anda" },
};

const LINKS = [
  { href: "#alur", label: "Cara kerja" },
  { href: "#fitur", label: "Fitur" },
  { href: "#kendali", label: "Kendali" },
  { href: "#harga", label: "Harga" },
  { href: "#peta-jalan", label: "Peta jalan" },
  { href: "#tanya", label: "Tanya jawab" },
];

export default function HomePage() {
  return (
    <div className="lp-root min-h-screen flex flex-col">
      <div className="lp-progress" aria-hidden="true" />
      <header className="fixed inset-x-0 top-3 z-50 px-3">
        <nav aria-label="Navigasi utama" className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-white/12 bg-[#140d2b]/70 py-2 pl-2.5 pr-2 shadow-[0_18px_50px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={36} />
            <span className="font-extrabold tracking-wide text-white">
              MBUTI<span className="text-accent">.</span>
            </span>
          </Link>
          <ul className="hidden lg:flex items-center gap-1 text-sm font-medium text-white/70">
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
        <div className="lp-body relative z-20 overflow-hidden">
          <UseCases />
          <Features />
          <Comparison />
          <Control />
          <Setup />
          <Pricing />
          <Roadmap />
          <Faq />
          <CallToAction />
        </div>
      </main>

      <footer className="relative z-20 border-t border-white/10 bg-[#0b0718] text-white/60">
        <div className="max-w-7xl mx-auto px-5 sm:px-10 py-12 grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr] text-sm">
          <div className="space-y-3">
            <span className="flex items-center gap-2.5 font-extrabold text-white">
              <BrandMark size={34} />
              MBUTI<span className="text-accent">.</span>
            </span>
            <p className="max-w-xs text-xs leading-relaxed">Multi-agent Business &amp; Unified Task Intelligence: kantor virtual berisi role AI yang bekerja dari dokumen organisasi Anda.</p>
          </div>
          <nav aria-label="Produk" className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Produk</p>
            {LINKS.slice(0, 3).map((link) => (
              <a key={link.href} href={link.href} className="block hover:text-accent">
                {link.label}
              </a>
            ))}
          </nav>
          <nav aria-label="Lainnya" className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Lainnya</p>
            {LINKS.slice(3).map((link) => (
              <a key={link.href} href={link.href} className="block hover:text-accent">
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="border-t border-white/5 py-5 text-center text-xs text-white/40">© 2026 MBUTI</p>
      </footer>
    </div>
  );
}
