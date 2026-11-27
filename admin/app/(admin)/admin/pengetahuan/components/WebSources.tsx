"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Icon } from "../../../_components/admin-icons";
import { useCreateProposal } from "../hooks/crud";
import type { WebSource } from "../types";

/** Sumber internet yang dipakai role, dengan tombol mengusulkannya sebagai pengetahuan organisasi. */
export function WebSources({ sources, taskId = null, agentId = null }: { sources: WebSource[]; taskId?: string | null; agentId?: string | null }) {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const propose = useCreateProposal();
  const [sent, setSent] = useState<string[]>([]);
  if (!sources.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">Dari internet</p>
      {sources.map((s) => (
        <div key={s.url} className="rounded-xl border border-line bg-surface/80 px-3 py-2 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-ink">[W{s.no}]</span>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline truncate max-w-full">
              {s.title}
            </a>
            <span className="text-faint">{s.domain}</span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">{s.snippet}</p>
          {accessRole && accessRole !== "viewer" && (
            <button
              type="button"
              disabled={sent.includes(s.url) || propose.isPending}
              onClick={() =>
                propose.mutate(
                  { url: s.url, title: s.title, excerpt: s.snippet, task_id: taskId, agent_id: agentId },
                  { onSuccess: () => setSent((v) => [...v, s.url]) }
                )
              }
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-brand disabled:opacity-60 cursor-pointer"
            >
              <Icon name={sent.includes(s.url) ? "check" : "plus"} size={12} />
              {sent.includes(s.url) ? "Sudah diusulkan" : "Usulkan sebagai pengetahuan"}
            </button>
          )}
        </div>
      ))}
      <p className="text-[10px] text-faint">Di luar dokumen organisasi. Bila berbeda, aturan organisasi yang dipakai.</p>
    </div>
  );
}
