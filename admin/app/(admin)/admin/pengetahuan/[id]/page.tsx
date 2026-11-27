"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Select, Skeleton, Textarea } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { FileGlyph, IngestionStatusView } from "../components/DocumentParts";
import { ScopeChip } from "../components/DocumentList";
import { useDeleteDocument, useResponseDetailDocument, useResponseVersion, useUpdateDocument } from "../hooks/crud";
import { DOC_TYPE_LABEL, type DetailInterface, type DocumentType, type UpdateInterface } from "../types";
import PageReader from "./components/PageReader";
import { CategoryBadges, PolicyFieldsForm } from "../components/PolicyParts";
import VersionPanel from "./components/VersionPanel";

function MetadataForm({ doc, canEdit }: { doc: DetailInterface; canEdit: boolean }) {
  const update = useUpdateDocument(doc.id);
  const initial: UpdateInterface = {
    title: doc.title,
    description: doc.description,
    doc_type: doc.doc_type,
    scope: doc.scope,
    scope_id: doc.scope_id,
    ...(doc.policy
      ? {
          policy: {
            kind: doc.policy.kind,
            reference_no: doc.policy.reference_no,
            issuer: doc.policy.issuer,
            effective_from: doc.policy.effective_from,
            effective_until: doc.policy.effective_until,
            status: doc.policy.status,
          },
        }
      : {}),
  };
  const [form, setForm] = useState<UpdateInterface>(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keterangan</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit || update.isPending} className="space-y-3">
          <Input label="Judul" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
          <Select
            label="Jenis"
            value={form.doc_type}
            onChange={(e) => setForm({ ...form, doc_type: e.target.value as DocumentType })}
            options={Object.entries(DOC_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Textarea label="Keterangan" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />
          {form.policy && <PolicyFieldsForm value={form.policy} withStatus onChange={(policy) => setForm({ ...form, policy })} />}
          {canEdit && (
            <Button className="w-full" disabled={!dirty} loading={update.isPending} onClick={() => update.mutate(form)}>
              Simpan keterangan
            </Button>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const isManager = accessRole === "owner" || accessRole === "admin";
  const { Document, isLoading, isError, error } = useResponseDetailDocument(id);
  // Rujukan bisa menunjuk versi yang bukan versi aktif
  const requested = searchParams.get("versi") ?? "";
  const otherId = Document && requested !== Document.active_version?.id ? requested : "";
  const other = useResponseVersion(id, otherId);
  const deleteMutation = useDeleteDocument();

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="book" size={26} />}
          title="Dokumen tidak dapat dibuka"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Link href="/admin/pengetahuan" className="text-sm font-semibold text-brand hover:underline">
              Kembali ke Pengetahuan
            </Link>
          }
        />
      </Card>
    );
  }
  if (isLoading || !Document) return <DetailFallback />;
  const archived = Boolean(Document.archived_at);
  // Hasil tanya jawab disusun sistem dari pembentukan role, jadi hanya-baca
  const systemDoc = Document.category === "qa";
  const canEdit = isManager && !archived && !systemDoc;
  const shown = otherId ? other.Version : Document.active_version;
  const sections = otherId ? other.Version?.sections ?? [] : Document.sections;

  const handleDelete = async () => {
    const ok = await confirmAlert(
      `Hapus "${Document.title}"?`,
      `Role tidak bisa lagi memakai dokumen ini. Bila pernah dirujuk tugas, isinya tetap bisa dibuka dari rujukan itu; bila belum, semua versi (${Document.versions.length}) terhapus permanen.`,
      "Ya, hapus"
    );
    if (ok) deleteMutation.mutate(Document.id, { onSuccess: () => router.push("/admin/pengetahuan") });
  };

  return (
    <div className="space-y-5">
      <Link href="/admin/pengetahuan" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand">
        <Icon name="chevron" size={14} className="rotate-90" />
        Semua dokumen
      </Link>

      {archived && (
        <p className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800" role="status">
          Dokumen ini sudah dihapus. Isinya disimpan karena pernah dirujuk tugas; role tidak memakainya lagi.
        </p>
      )}

      {systemDoc && (
        <p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-amber-900 dark:text-amber-200" role="status">
          Dokumen ini disusun otomatis dari tanya jawab saat role di-Final. Untuk mengubah isinya, buka pembentukan role.
        </p>
      )}

      <Card glow>
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <FileGlyph fileName={Document.active_version?.file_name ?? "berkas"} size={64} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">{Document.title}</h2>
              <Badge variant="info">{DOC_TYPE_LABEL[Document.doc_type]}</Badge>
              <CategoryBadges doc={Document} />
            </div>
            <p className="text-sm text-muted">{Document.description || "Tanpa keterangan."}</p>
            <div className="flex flex-wrap items-center gap-3">
              <ScopeChip doc={Document} />
              <IngestionStatusView version={Document.active_version} />
            </div>
          </div>
          {canEdit && (
            <Button variant="ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={handleDelete}>
              Hapus
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px] items-start">
        <div className="space-y-3 min-w-0">
          {otherId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand-strong rise" role="status">
              <span>
                {other.isError
                  ? "Versi yang dirujuk tidak ditemukan."
                  : `Anda melihat ${other.Version ? `v${other.Version.version_no}` : "versi lain"}, bukan versi aktif${
                      Document.active_version ? ` (v${Document.active_version.version_no})` : ""
                    }.`}
              </span>
              <Link href={`/admin/pengetahuan/${Document.id}`} className="font-bold underline">
                Buka versi aktif
              </Link>
            </div>
          )}
          {otherId && other.isLoading ? (
            <Skeleton className="h-[480px] rounded-3xl" />
          ) : (
            <PageReader
              key={`${shown?.id}-${shown?.status}`}
              title={Document.title}
              version={shown ?? null}
              sections={sections}
              initialPage={Number(searchParams.get("hlm") ?? 1)}
              query={searchParams.get("q") ?? ""}
            />
          )}
        </div>
        <div className="space-y-4">
          <VersionPanel doc={Document} canEdit={canEdit} />
          <MetadataForm key={Document.updated_at} doc={Document} canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}

function DetailFallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Memuat dokumen">
      <Skeleton className="h-32 rounded-3xl" />
      <Skeleton className="h-[480px] rounded-3xl" />
    </div>
  );
}

/** useParams/useSearchParams adalah data saat permintaan; dibungkus Suspense agar rute dinamis bisa diprerender. */
export default function DocumentDetailPage() {
  return (
    <Suspense fallback={<DetailFallback />}>
      <DocumentDetail />
    </Suspense>
  );
}
