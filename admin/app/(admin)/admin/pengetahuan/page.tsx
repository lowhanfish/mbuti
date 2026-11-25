"use client";

import React, { useEffect, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, StatCard } from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import DocumentList from "./components/DocumentList";
import SearchPanel from "./components/SearchPanel";
import UploadDocumentModal from "./components/UploadDocumentModal";
import { useDeleteDocument, useResponseListDocument, useUploadDocument } from "./hooks/crud";
import { DOC_TYPE_LABEL, SCOPE_LABEL, type ResponseInterface } from "./types";

export default function PengetahuanPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scope, setScope] = useState("");
  const [docType, setDocType] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { List, isLoading, isError, error, refetch } = useResponseListDocument({ search: debouncedSearch, scope, doc_type: docType });
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();

  const docs = List?.data ?? [];
  const s = List?.summary ?? { queued: 0, processing: 0, ready: 0, failed: 0 };
  const filtered = Boolean(debouncedSearch || scope || docType);

  const handleDelete = async (doc: ResponseInterface) => {
    const ok = await confirmAlert(
      `Hapus "${doc.title}"?`,
      `Semua versi (${doc.version_count}) ikut terhapus dan role tidak bisa lagi merujuk dokumen ini. Tindakan ini tidak bisa dibatalkan.`,
      "Ya, hapus"
    );
    if (ok) deleteMutation.mutate(doc.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengetahuan"
        description="SOP, manual book, dan panduan kerja yang menjadi dasar kerja role. Setiap jawaban role merujuk halaman dokumen ini."
        action={
          canEdit && (
            <Button icon={<Icon name="plus" size={16} />} onClick={() => setUploadOpen(true)}>
              Unggah dokumen
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 stagger">
        <StatCard label="Dokumen siap" value={s.ready} icon={<Icon name="check" size={22} />} tone="teal" />
        <StatCard label="Sedang diolah" value={s.queued + s.processing} icon={<Icon name="sparkles" size={22} />} tone="brand" />
        <StatCard label="Gagal diolah" value={s.failed} icon={<Icon name="close" size={22} />} tone="pink" />
        <StatCard label="Total dokumen" value={s.ready + s.queued + s.processing + s.failed} icon={<Icon name="book" size={22} />} tone="accent" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px] items-start">
        <Card>
          <div className="flex flex-col md:flex-row md:items-center gap-2 px-5 py-4 border-b border-line/70">
            <div className="flex-1">
              <Input
                aria-label="Cari dokumen"
                placeholder="Cari judul atau nama berkas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Icon name="search" size={16} />}
              />
            </div>
            <div className="md:w-44">
              <Select aria-label="Saring lingkup" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Semua lingkup</option>
                {Object.entries(SCOPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:w-40">
              <Select aria-label="Saring jenis" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="">Semua jenis</option>
                {Object.entries(DOC_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={<Icon name="book" size={26} />}
              title="Dokumen gagal dimuat"
              description={error instanceof Error ? error.message : undefined}
              action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
            />
          ) : docs.length === 0 ? (
            <EmptyState
              icon={<Icon name="book" size={26} />}
              title={filtered ? "Tidak ada dokumen yang cocok" : "Belum ada dokumen"}
              description={filtered ? "Ubah saringan atau kata pencarian." : "Unggah SOP atau pedoman pertama, lalu tentukan role atau unit yang boleh membacanya."}
              action={
                canEdit && !filtered ? (
                  <Button icon={<Icon name="plus" size={16} />} onClick={() => setUploadOpen(true)}>
                    Unggah dokumen pertama
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DocumentList docs={docs} canEdit={canEdit} onDelete={handleDelete} />
          )}
        </Card>

        <div className="xl:sticky xl:top-24">
          <SearchPanel />
        </div>
      </div>

      {uploadOpen && (
        <UploadDocumentModal
          saving={uploadMutation.isPending}
          onClose={() => setUploadOpen(false)}
          onSubmit={(form) => uploadMutation.mutate(form, { onSuccess: () => setUploadOpen(false) })}
        />
      )}
    </div>
  );
}
