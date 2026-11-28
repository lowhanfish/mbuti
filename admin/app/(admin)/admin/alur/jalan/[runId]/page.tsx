"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { RunStatusBadge, Screenshot, formatDateTime } from "../../components/FlowParts";
import { useDecideRun, useResponseDetailRun, useStopRun, useSubmitOtp } from "../../hooks/crud";
import { RUN_MODE_LABEL, isActiveRun, type NamedValue, type RunDetail, type RunEvent } from "../../types";

const EVENT_DOT: Record<RunEvent["status"], string> = {
  done: "bg-emerald-500",
  waiting: "bg-amber-400",
  blocked: "bg-rose-500",
  failed: "bg-rose-500",
};

function Values({ title, values }: { title: string; values: NamedValue[] }) {
  if (!values.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted">{title}</p>
      <dl className="rounded-2xl border border-line bg-canvas divide-y divide-line/70">
        {values.map((v) => (
          <div key={v.label} className="px-3 py-2">
            <dt className="text-[11px] text-faint">{v.label}</dt>
            <dd className="text-sm text-ink whitespace-pre-line break-words">{v.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Pending({ run }: { run: RunDetail }) {
  const decide = useDecideRun(run.id);
  const otp = useSubmitOtp(run.id);
  const [code, setCode] = useState("");
  const pending = run.pending;
  if (!pending) return null;

  return (
    <Card className="ring-2 ring-amber-400/60">
      <CardHeader>
        <CardTitle>{pending.kind === "approval" ? "Menunggu persetujuan" : "Menunggu kode OTP"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink">{pending.question}</p>
        <Values title="Yang akan dikirim" values={pending.values} />
        <Screenshot url={pending.screenshot_url} alt="Keadaan halaman saat menunggu" large />
        {!run.can_decide ? (
          <p className="text-sm text-muted">Keputusan ada pada penanggung jawab role, pemilik, atau admin.</p>
        ) : pending.kind === "approval" ? (
          <div className="flex flex-wrap gap-2">
            <Button loading={decide.isPending && decide.variables === "approved"} onClick={() => decide.mutate("approved")}>
              Setujui dan lanjutkan
            </Button>
            <Button variant="outline" loading={decide.isPending && decide.variables === "rejected"} onClick={() => decide.mutate("rejected")}>
              Tolak
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              otp.mutate(code, { onSuccess: () => setCode("") });
            }}
          >
            <div className="w-48">
              <Input label="Kode dari SMS atau email" inputMode="numeric" autoComplete="off" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <Button type="submit" loading={otp.isPending} disabled={code.trim().length < 4}>
              Kirim kode
            </Button>
            {pending.expires_at && <p className="basis-full text-[11px] text-faint">Ditunggu sampai {formatDateTime(pending.expires_at)}.</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function RunView() {
  const { runId } = useParams<{ runId: string }>();
  const { Run, isLoading, isError, error } = useResponseDetailRun(runId);
  const stop = useStopRun(runId);

  if (isError) {
    return (
      <Card>
        <EmptyState icon={<Icon name="flow" size={26} />} title="Putaran tidak dapat dibuka" description={error instanceof Error ? error.message : undefined} />
      </Card>
    );
  }
  if (isLoading || !Run) return <Skeleton className="h-96 rounded-3xl" />;

  return (
    <div className="space-y-5">
      <Link href={`/admin/alur/${Run.flow_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand">
        <Icon name="chevron" size={14} className="rotate-90" />
        {Run.flow_name}
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-52 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-ink tracking-tight">
                {RUN_MODE_LABEL[Run.mode]} {formatDateTime(Run.created_at)}
              </h2>
              <RunStatusBadge status={Run.status} />
            </div>
            <p className="text-[11px] text-faint">
              {Run.role_name} · versi {Run.flow_version} · dimulai {Run.created_by_name}
            </p>
            {Run.message && <p className="text-sm text-muted">{Run.message}</p>}
          </div>
          {Run.can_decide && isActiveRun(Run.status) && (
            <Button variant="outline" size="sm" loading={stop.isPending} onClick={() => stop.mutate()}>
              Hentikan
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Di atas catatan agar keputusan langsung terlihat */}
      <Pending run={Run} />

      <div className="grid gap-4 xl:grid-cols-[1fr_420px] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Catatan putaran</CardTitle>
          </CardHeader>
          {Run.events.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted">Menunggu giliran…</p>
          ) : (
            <ol className="divide-y divide-line/70" aria-live="polite">
              {Run.events.map((event) => (
                <li key={event.no} className="flex flex-col sm:flex-row gap-3 px-6 py-4">
                  <span className={`mt-1.5 w-2.5 h-2.5 shrink-0 rounded-full ${EVENT_DOT[event.status]}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink break-words">{event.message}</p>
                    <p className="text-[11px] text-faint">{formatDateTime(event.created_at)}</p>
                  </div>
                  <Screenshot url={event.screenshot_url} alt={event.message} />
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-4">
          {(Run.inputs.length > 0 || Run.outputs.length > 0) && (
            <Card>
              <CardContent className="space-y-4">
                <Values title="Isian" values={Run.inputs} />
                <Values title="Data yang dibaca" values={Run.outputs} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RunPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-3xl" />}>
      <RunView />
    </Suspense>
  );
}
