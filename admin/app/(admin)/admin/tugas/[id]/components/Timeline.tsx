"use client";

import Link from "next/link";
import React, { useState } from "react";
import { Badge } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { Avatar2D } from "../../../../_components/agent/avatar-2d";
import { citationText } from "../../../pengetahuan/types";
import { RELATION_STYLE } from "../../../relasi/types";
import { STEP_KIND_LABEL, formatRupiah, type DetailInterface, type EventType, type StepInterface } from "../../types";

const EVENT_STYLE: Partial<Record<EventType, { icon: string; tone: string }>> = {
  created: { icon: "plus", tone: "bg-ink text-accent" },
  step_started: { icon: "sparkles", tone: "bg-brand-soft text-brand" },
  review_revise: { icon: "edit", tone: "bg-amber-100 text-amber-700" },
  review_approved: { icon: "check", tone: "bg-emerald-100 text-emerald-700" },
  relation_skipped: { icon: "chevron", tone: "bg-canvas text-faint" },
  approval_requested: { icon: "approval", tone: "bg-pink-100 text-pink-700" },
  approval_decided: { icon: "shield", tone: "bg-pink-100 text-pink-700" },
  completed: { icon: "check", tone: "bg-emerald-500 text-white" },
  failed: { icon: "close", tone: "bg-rose-500 text-white" },
  cancelled: { icon: "close", tone: "bg-slate-400 text-white" },
  stopped_budget: { icon: "wallet", tone: "bg-rose-500 text-white" },
};

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

function StepCard({ step }: { step: StepInterface }) {
  const [open, setOpen] = useState(false);
  const running = step.status === "running";
  return (
    <div className={`rounded-2xl border bg-white overflow-hidden transition-all ${running ? "border-brand shadow-[0_0_0_4px_rgba(124,77,255,.12)]" : "border-line"}`}>
      <div className="flex items-center gap-3 p-3">
        <span className="w-11 h-11 rounded-xl flex items-end justify-center overflow-hidden shrink-0" style={{ background: `${step.agent.unit_color ?? "#7c4dff"}2a` }}>
          <Avatar2D avatar={step.agent.avatar} size={40} className={running ? "animate-float" : ""} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">
            {step.agent.name} <span className="font-medium text-muted">· {STEP_KIND_LABEL[step.kind]}</span>
            {step.attempt_no > 1 && <span className="text-amber-700 font-semibold"> · percobaan {step.attempt_no}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {step.via_relation_type && (
              <span className="text-[10px] font-bold text-white rounded-full px-2 py-0.5" style={{ background: RELATION_STYLE[step.via_relation_type].color }}>
                lewat {RELATION_STYLE[step.via_relation_type].label}
              </span>
            )}
            {step.verdict && (
              <Badge size="sm" variant={step.verdict === "approved" ? "success" : "warning"}>
                {step.verdict === "approved" ? "Diterima" : "Perlu revisi"}
              </Badge>
            )}
            {step.status === "revise_requested" && (
              <Badge size="sm" variant="warning">
                Direvisi
              </Badge>
            )}
            {running && (
              <Badge size="sm" variant="info">
                Sedang bekerja…
              </Badge>
            )}
            {step.status === "skipped" && <Badge size="sm">Dilewati</Badge>}
          </div>
        </div>
        {step.cost > 0 && (
          <span className="text-[11px] text-faint shrink-0 text-right">
            <span className="block">{formatRupiah(step.cost)}</span>
            <span className="hidden sm:block font-mono text-[10px]">{step.model}</span>
          </span>
        )}
      </div>
      {running && (
        <div className="h-1 bg-brand-soft overflow-hidden">
          <div className="h-full w-1/2 bg-[linear-gradient(90deg,transparent,#7c4dff,#ffb81c,transparent)] bg-[length:200%_100%] animate-shimmer" />
        </div>
      )}
      {step.output && (
        <>
          <pre className={`border-t border-line px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap font-sans text-ink bg-canvas/40 ${open ? "" : "max-h-24 overflow-hidden"}`}>
            {step.output}
          </pre>
          {step.citations.length > 0 && (
            <div className="px-3 pb-2 pt-1 flex flex-wrap gap-1.5 bg-canvas/40">
              {step.citations.map((c, i) => (
                <Link
                  key={`${c.document_id}-${c.page_no}`}
                  href={`/admin/pengetahuan/${c.document_id}?hlm=${c.page_no}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-soft/70 px-2 py-1 text-[11px] text-brand-strong hover:bg-brand-soft"
                >
                  <span className="font-bold">[{i + 1}]</span> {citationText(c.document_title, c.version_no, c.page_no)}
                </Link>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full border-t border-line px-4 py-2 text-xs font-semibold text-brand hover:bg-brand-soft/40 cursor-pointer"
          >
            {open ? "Ringkas" : "Lihat hasil lengkap"}
          </button>
        </>
      )}
    </div>
  );
}

/** Linimasa: peristiwa berurutan; peristiwa langkah menampilkan kartu hasilnya. */
export default function Timeline({ task }: { task: DetailInterface }) {
  const stepById = new Map(task.steps.map((s) => [s.id, s]));
  const shownSteps = new Set<string>();

  return (
    <ol className="relative space-y-3 before:absolute before:left-[15px] before:top-3 before:bottom-3 before:w-0.5 before:bg-gradient-to-b before:from-brand/40 before:via-line before:to-accent/40">
      {task.events.map((e) => {
        const style = EVENT_STYLE[e.type] ?? { icon: "dot", tone: "bg-canvas text-muted" };
        // Kartu langkah ditampilkan sekali, pada peristiwa "mulai"; isinya ikut diperbarui saat selesai
        const step = e.step_id && e.type === "step_started" && !shownSteps.has(e.step_id) ? stepById.get(e.step_id) : undefined;
        if (step) shownSteps.add(step.id);
        return (
          <li key={e.id} className="relative pl-11 rise">
            <span className={`absolute left-0 top-0.5 w-8 h-8 rounded-xl flex items-center justify-center ${style.tone}`}>
              <Icon name={style.icon} size={15} />
            </span>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-ink">{e.message}</p>
              <time className="text-[10px] text-faint shrink-0 tabular-nums">{time(e.created_at)}</time>
            </div>
            {step && (
              <div className="mt-2">
                <StepCard step={step} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
