import React from "react";

/** Judul bagian yang seragam di seluruh halaman depan. */
export default function Heading({
  tag,
  title,
  text,
  center = false,
}: {
  tag: string;
  title: React.ReactNode;
  text?: string;
  center?: boolean;
}) {
  return (
    <header className={`lp-reveal max-w-2xl space-y-3 ${center ? "mx-auto text-center" : ""}`}>
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-accent">
        <span className="lp-hex w-2.5 h-2.5 bg-accent" aria-hidden="true" />
        {tag}
      </p>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white text-balance">{title}</h2>
      {text && <p className="text-white/65 leading-relaxed">{text}</p>}
    </header>
  );
}
