import Link from "next/link";
import React from "react";
import { BrandMark } from "../../(admin)/_components/brand-mark";

export interface LegalSection {
  heading: string;
  body: React.ReactNode;
}

/** Halaman teks hukum sederhana (ketentuan layanan, kebijakan privasi). */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: React.ReactNode; sections: LegalSection[] }) {
  return (
    <div className="admin-shell min-h-screen">
      <header className="mx-auto max-w-3xl px-4 pt-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={36} />
          <span className="font-extrabold tracking-wide text-ink">
            MBUTI<span className="text-accent">.</span>
          </span>
        </Link>
        <nav className="flex gap-4 text-sm font-semibold">
          <Link href="/ketentuan" className="text-muted hover:text-brand">Ketentuan</Link>
          <Link href="/privasi" className="text-muted hover:text-brand">Privasi</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <div className="space-y-3">
          <p className="inline-flex text-[11px] font-bold uppercase tracking-wider text-amber-900 bg-accent-soft border border-accent/30 rounded-full px-3 py-1">
            Versi sementara · masa uji coba
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">{title}</h1>
          <p className="text-xs text-faint">Terakhir diperbarui {updated}</p>
          <div className="text-sm text-muted leading-relaxed">{intro}</div>
        </div>

        {sections.map((section, index) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-lg font-bold text-ink">
              {index + 1}. {section.heading}
            </h2>
            <div className="text-sm text-muted leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
              {section.body}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
