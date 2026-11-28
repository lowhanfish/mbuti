"use client";

import Link from "next/link";
import React, { useState } from "react";
import { formatDate } from "@/utilities/labels";
import { Badge, Button, Card, Textarea } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { Avatar2D } from "../../../_components/agent/avatar-2d";
import { useDecideApproval } from "../hooks/crud";
import { APPROVAL_REASON_LABEL, type ApprovalInterface } from "../types";
import { Screenshot } from "../../alur/components/FlowParts";

/** Kartu keputusan manusia: setujui, minta revisi, atau tolak. */
export default function ApprovalCard({ approval, showTask = false }: { approval: ApprovalInterface; showTask?: boolean }) {
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const decide = useDecideApproval();
  const pending = approval.status === "pending";
  const needComment = comment.trim().length < 5;

  const send = (decision: "approved" | "rejected" | "revise") => decide.mutate({ id: approval.id, body: { decision, comment: comment.trim() } });

  return (
    <Card glow={pending} className="relative">
      {pending && <div className="absolute inset-0 bg-gradient-to-br from-accent-soft/70 via-surface/30 to-brand-soft/60 pointer-events-none" aria-hidden="true" />}
      <div className="relative p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={pending ? "accent" : approval.status === "approved" ? "success" : approval.status === "revise" ? "warning" : "danger"} dot>
                {pending ? "Menunggu keputusan" : approval.status === "approved" ? "Disetujui" : approval.status === "revise" ? "Diminta revisi" : "Ditolak"}
              </Badge>
              <Badge size="sm">{APPROVAL_REASON_LABEL[approval.reason]}</Badge>
            </div>
            {showTask && (
              <Link href={`/admin/tugas/${approval.task_id}`} className="block font-bold text-ink hover:text-brand">
                {approval.task_title}
              </Link>
            )}
            <p className="text-sm text-ink font-medium">{approval.question}</p>
            <p className="text-[11px] text-faint">
              Untuk {approval.requested_from_name} · {formatDate(approval.created_at)}
            </p>
          </div>
          {approval.last_agent && (
            <div className="flex items-center gap-2 rounded-2xl bg-surface/80 border border-rim px-2 py-1.5">
              <Avatar2D avatar={approval.last_agent.avatar} size={34} />
              <span className="text-xs">
                <span className="block font-semibold text-ink">{approval.last_agent.name}</span>
                <span className="block text-faint">{approval.last_output ? "hasil terakhir" : "belum bekerja"}</span>
              </span>
            </div>
          )}
        </div>

        {approval.flow && (
          <div className="space-y-3">
            {approval.flow.values.length > 0 && (
              <dl className="rounded-2xl border border-line bg-surface divide-y divide-line/70">
                {approval.flow.values.map((v) => (
                  <div key={v.label} className="px-4 py-2">
                    <dt className="text-[11px] text-faint">{v.label}</dt>
                    <dd className="text-sm text-ink whitespace-pre-line break-words">{v.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="max-w-md">
              <Screenshot url={approval.flow.screenshot_url} alt="Keadaan halaman sebelum dikirim" large />
            </div>
            <Link href={`/admin/alur/jalan/${approval.flow.run_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
              Lihat putaran dan bukti
              <Icon name="arrow" size={13} />
            </Link>
          </div>
        )}

        {approval.last_output && (
          <div className="rounded-2xl bg-surface border border-line">
            <pre className={`px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap font-sans text-ink ${expanded ? "" : "max-h-32 overflow-hidden"}`}>{approval.last_output}</pre>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-line px-4 py-2 text-xs font-semibold text-brand hover:bg-brand-soft/40 cursor-pointer"
            >
              {expanded ? "Ringkas" : "Lihat hasil lengkap"}
            </button>
          </div>
        )}

        {pending ? (
          <div className="space-y-3">
            <Textarea
              aria-label="Catatan keputusan"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={approval.flow ? "Catatan (wajib untuk tolak)" : "Catatan (wajib untuk minta revisi atau tolak)"}
              maxLength={1000}
            />
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="ghost" icon={<Icon name="close" size={15} />} disabled={needComment || decide.isPending} onClick={() => send("rejected")}>
                Tolak
              </Button>
              {!approval.flow && (
                <Button variant="outline" icon={<Icon name="edit" size={15} />} disabled={needComment || decide.isPending} onClick={() => send("revise")}>
                  Minta revisi
                </Button>
              )}
              <Button icon={<Icon name="check" size={15} />} loading={decide.isPending} onClick={() => send("approved")}>
                {approval.flow ? "Setujui dan kirim" : "Setujui"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">
            {approval.decided_by_name} · {formatDate(approval.decided_at)}
            {approval.comment && <span className="block mt-1 text-ink">“{approval.comment}”</span>}
          </p>
        )}
      </div>
    </Card>
  );
}
