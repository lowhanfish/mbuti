"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { Suspense, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { formatDate } from "@/utilities/labels";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, CodeInput, EmptyState, Input, Modal, Skeleton, codeReady } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import FlowFormModal from "../components/FlowFormModal";
import { RunList, Screenshot } from "../components/FlowParts";
import { useApproveFlow, useDeleteFlow, useRelearnFlow, useResponseDetailFlow, useRunFlow, useTrustFlow } from "../hooks/crud";
import { FLOW_STATUS, RISK_LABEL, TRUST_AFTER_RUNS, type FlowDetail } from "../types";

function RunModal({ flow, onClose }: { flow: FlowDetail; onClose: () => void }) {
  const router = useRouter();
  const run = useRunFlow(flow.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const ready = flow.inputs.every((i) => values[i.key]?.trim());

  return (
    <Modal isOpen onClose={onClose} title={`Jalankan ${flow.name}`} description={flow.trusted_submit ? "Alur ini mengirim tanpa menunggu persetujuan." : "Program berhenti sebelum mengirim dan menunggu persetujuan."}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          run.mutate(values, { onSuccess: (res) => router.push(`/admin/alur/jalan/${res.data.id}`) });
        }}
      >
        {flow.inputs.length === 0 && <p className="text-sm text-muted">Alur ini tidak memerlukan isian.</p>}
        {flow.inputs.map((input) => (
          <Input
            key={input.key}
            label={input.label}
            required
            maxLength={2000}
            placeholder={`Contoh: ${input.sample}`}
            value={values[input.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [input.key]: e.target.value }))}
          />
        ))}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={run.isPending} disabled={!ready}>
            Jalankan
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TrustModal({ flow, onClose }: { flow: FlowDetail; onClose: () => void }) {
  const trust = useTrustFlow(flow.id);
  const [code, setCode] = useState("");
  const enable = !flow.trusted_submit;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={enable ? "Kirim tanpa persetujuan?" : "Wajibkan persetujuan lagi?"}
      description={
        enable
          ? "Program akan mengirim atau menyimpan memakai akun Anda tanpa bertanya. Menghapus tetap selalu menunggu persetujuan."
          : "Setiap kirim atau simpan menunggu persetujuan."
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          trust.mutate({ enabled: enable, code }, { onSuccess: onClose });
        }}
      >
        <CodeInput label="Kode verifikasi MBUTI Anda" value={code} onValueChange={setCode} recovery autoFocus />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={trust.isPending} disabled={!codeReady(code)}>
            {enable ? "Bebaskan" : "Wajibkan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FlowView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { Flow, isLoading, isError, error } = useResponseDetailFlow(id);
  const approve = useApproveFlow(id);
  const relearn = useRelearnFlow(id);
  const remove = useDeleteFlow(id);
  const [dialog, setDialog] = useState<"run" | "relearn" | "trust" | null>(null);
  const close = () => setDialog(null);

  if (isError) {
    return (
      <Card>
        <EmptyState icon={<Icon name="flow" size={26} />} title="Alur tidak dapat dibuka" description={error instanceof Error ? error.message : undefined} />
      </Card>
    );
  }
  if (isLoading || !Flow) return <Skeleton className="h-96 rounded-3xl" />;

  const busy = Boolean(Flow.active_run_id);
  const canManage = Flow.access.can_manage;
  const trustReady = Flow.trusted_submit || Flow.successful_runs >= TRUST_AFTER_RUNS;
  const hasSubmit = Flow.steps.some((s) => s.risk === "submit");

  const handleDelete = async () => {
    const ok = await confirmAlert(`Hapus alur "${Flow.name}"?`, "Langkah, riwayat putaran, dan tangkapan layarnya dihapus.", "Ya, hapus");
    if (ok) remove.mutate(undefined, { onSuccess: () => router.push(`/admin/role/${Flow.role_id}`) });
  };

  return (
    <div className="space-y-5">
      <Link href={`/admin/role/${Flow.role_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand">
        <Icon name="chevron" size={14} className="rotate-90" />
        {Flow.role_name}
      </Link>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">{Flow.name}</h2>
            <Badge variant={FLOW_STATUS[Flow.status].variant}>{FLOW_STATUS[Flow.status].label}</Badge>
            {Flow.trusted_submit && <Badge variant="accent">Kirim tanpa persetujuan</Badge>}
          </div>
          <p className="text-sm text-muted whitespace-pre-line">{Flow.goal}</p>
          <p className="text-[11px] text-faint">
            Akun: {Flow.account_name || "sudah dihapus"} · versi {Flow.version} · {Flow.successful_runs} putaran berhasil
            {Flow.approved_at ? ` · disetujui ${formatDate(Flow.approved_at)} oleh ${Flow.approved_by_name ?? "-"}` : ""}
          </p>
          {Flow.note && <p role="alert" className="rounded-2xl bg-amber-400/20 p-3 text-sm text-amber-800">{Flow.note}</p>}
          <div className="flex flex-wrap gap-2">
            {Flow.active_run_id && (
              <Link href={`/admin/alur/jalan/${Flow.active_run_id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
                Lihat putaran yang berjalan
                <Icon name="arrow" size={14} />
              </Link>
            )}
            {canManage && !busy && (
              <>
                {Flow.status === "review" && (
                  <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(Flow.version)}>
                    Setujui alur
                  </Button>
                )}
                {Flow.status === "approved" && Flow.account_id && (
                  <Button size="sm" onClick={() => setDialog("run")}>
                    Jalankan
                  </Button>
                )}
                {Flow.account_id && (
                  <Button size="sm" variant="outline" onClick={() => setDialog("relearn")}>
                    {Flow.status === "needs_repair" ? "Perbaiki alur" : "Pelajari ulang"}
                  </Button>
                )}
                {Flow.access.can_trust && Flow.status === "approved" && hasSubmit && (
                  <Button size="sm" variant="outline" disabled={!trustReady} title={trustReady ? undefined : `Perlu ${TRUST_AFTER_RUNS} putaran berhasil`} onClick={() => setDialog("trust")}>
                    {Flow.trusted_submit ? "Wajibkan persetujuan" : "Bebaskan persetujuan kirim"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<Icon name="trash" size={14} />} onClick={handleDelete}>
                  Hapus
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px] items-start">
        <Card>
          <CardHeader>
            <CardTitle>Langkah</CardTitle>
            <span className="text-[11px] text-faint">Periksa urutannya sebelum menyetujui.</span>
          </CardHeader>
          {Flow.steps.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted">{Flow.status === "learning" ? "Role sedang menjelajahi aplikasi…" : "Belum ada langkah."}</p>
          ) : (
            <ol className="divide-y divide-line/70">
              {Flow.steps.map((step) => (
                <li key={step.no} className="flex flex-col sm:flex-row gap-3 px-6 py-4">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-brand-soft text-brand-strong text-xs font-bold flex items-center justify-center">{step.no}</span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-ink break-words">{step.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {step.value_label && <Badge size="sm">{step.value_label}</Badge>}
                      {step.risk !== "none" && <Badge size="sm" variant={step.risk === "delete" ? "danger" : "warning"}>{RISK_LABEL[step.risk]}</Badge>}
                    </div>
                  </div>
                  <Screenshot url={step.screenshot_url} alt={`Langkah ${step.no}: ${step.description}`} />
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Isian tiap putaran</CardTitle>
            </CardHeader>
            {Flow.inputs.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">Tidak ada.</p>
            ) : (
              <ul className="px-6 py-4 space-y-2">
                {Flow.inputs.map((i) => (
                  <li key={i.key} className="text-sm">
                    <span className="font-semibold text-ink">{i.label}</span>
                    <span className="block text-[11px] text-faint break-words">Contoh: {i.sample}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Riwayat putaran</CardTitle>
            </CardHeader>
            <RunList runs={Flow.runs} />
          </Card>
        </div>
      </div>

      {dialog === "run" && <RunModal flow={Flow} onClose={close} />}
      {dialog === "trust" && <TrustModal flow={Flow} onClose={close} />}
      {dialog === "relearn" && (
        <FlowFormModal
          roleName={Flow.role_name}
          initial={{ name: Flow.name, goal: Flow.goal, inputs: Flow.inputs }}
          saving={relearn.isPending}
          onClose={close}
          onSubmit={({ name, goal, inputs }) => relearn.mutate({ name, goal, inputs }, { onSuccess: close })}
        />
      )}
    </div>
  );
}

/** useParams() adalah data saat permintaan; dibungkus Suspense agar rute dinamis bisa diprerender. */
export default function FlowPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-3xl" />}>
      <FlowView />
    </Suspense>
  );
}
