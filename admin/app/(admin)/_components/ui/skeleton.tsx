import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`motion-safe:animate-pulse bg-white/55 border border-white/70 rounded-xl ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 motion-safe:animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-4 bg-white/55 border border-white/70 rounded-lg ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`p-5 glass rounded-3xl motion-safe:animate-pulse flex items-center justify-between ${className}`}>
      <div className="space-y-2 flex-1 mr-4">
        <div className="h-3 w-24 bg-white/60 rounded-md" />
        <div className="h-6 w-36 bg-white/80 rounded-lg" />
        <div className="h-3 w-20 bg-white/50 rounded-md" />
      </div>
      <div className="w-12 h-12 rounded-2xl bg-white/70" />
    </div>
  );
}

/** Baris tabel untuk keadaan memuat di dalam tbody yang sudah ada. */
export function SkeletonTableRows({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="motion-safe:animate-pulse" aria-busy="true" aria-label={row === 0 ? "Memuat data" : undefined}>
          {Array.from({ length: cols }, (_, col) => (
            <td key={col} className="px-4 py-3.5">
              <Skeleton className={`h-4 bg-brand-soft border-0 ${col === 0 ? "w-8" : row % 2 ? "w-2/3" : "w-3/4"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
