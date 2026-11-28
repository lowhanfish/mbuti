"use client";

import Link from "next/link";
import React, { useState } from "react";
import { useUrlStore } from "@/store/useUrlStore";
import { Badge, Modal } from "../../../_components/ui";
import { mediaSrc } from "../../pengetahuan/types";
import { RUN_MODE_LABEL, RUN_STATUS, type RunStatus, type RunSummary } from "../types";

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const RunStatusBadge = ({ status }: { status: RunStatus }) => (
  <Badge variant={RUN_STATUS[status].variant} size="sm" dot>
    {RUN_STATUS[status].label}
  </Badge>
);

/** Tangkapan layar kecil; diklik untuk diperbesar. */
export function Screenshot({ url, alt, large = false }: { url: string | null; alt: string; large?: boolean }) {
  const apiBase = useUrlStore((state) => state.URL.APP);
  const [open, setOpen] = useState(false);
  if (!url) return null;
  const src = mediaSrc(url, apiBase);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`block shrink-0 overflow-hidden rounded-xl border border-line bg-white cursor-zoom-in ${large ? "w-full" : "w-36"}`}
        aria-label={`Perbesar tangkapan layar: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- bukti dari API berizin atau data URL */}
        <img src={src} alt={alt} loading="lazy" className="block w-full h-auto" />
      </button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title="Tangkapan layar" description={alt} maxWidth="3xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- bukti dari API berizin atau data URL */}
          <img src={src} alt={alt} className="block w-full h-auto rounded-xl border border-line bg-white" />
        </Modal>
      )}
    </>
  );
}

export function RunList({ runs }: { runs: RunSummary[] }) {
  if (!runs.length) return <p className="px-6 py-5 text-sm text-muted">Belum ada putaran.</p>;
  return (
    <ul className="divide-y divide-line/70">
      {runs.map((run) => (
        <li key={run.id}>
          <Link href={`/admin/alur/jalan/${run.id}`} className="flex flex-wrap items-center gap-2 px-6 py-3 hover:bg-surface/60">
            <span className="text-sm font-semibold text-ink">
              {RUN_MODE_LABEL[run.mode]} {formatDateTime(run.created_at)}
            </span>
            <RunStatusBadge status={run.status} />
            <span className="text-[11px] text-faint">
              versi {run.flow_version} · {run.created_by_name}
            </span>
            {run.message && <span className="basis-full text-xs text-muted">{run.message}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
