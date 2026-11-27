"use client";

import React, { useEffect, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, StatCard } from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import DocumentList from "./components/DocumentList";
import SearchPanel from "./components/SearchPanel";
import UploadDocumentModal from "./components/UploadDocumentModal";
import { useDeleteDocument, useProposals, useResponseListDocument, useUploadDocument } from "./hooks/crud";
import ProposalList from "./components/ProposalList";
import { DOC_TYPE_LABEL, SCOPE_LABEL, type ResponseInterface } from "./types";

type PageTab = "dokumen" | "kebijakan" | "usulan";

const TAB_CATEGORIES: Record<PageTab, string> = {
  dokumen: "knowledge,formation,qa,web",
  kebijakan: "policy",
  usulan: "web",
};

const PAGE_TABS: Array<{ key: PageTab; label: string; icon: string; hint: string }> = [
  { key: "dokumen", label: "Dokumen", icon: "book", hint: "SOP, manual, pedoman, templat, uraian jabatan, dan hasil tanya jawab role." },
  {
    key: "kebijakan",
    label: "Kebijakan & Aturan",
    icon: "shield",
    hint: "Peraturan, kebijakan, standar mutu, dan panduan merek. Dicek lebih dulu saat role bekerja; bila berbeda dengan dokumen lain, aturan ini yang dipakai.",
  },
  {
    key: "usulan",
    label: "Usulan",
    icon: "search",
    hint: "Temuan internet yang diusulkan pengguna dari hasil role. Setelah disetujui admin, temuan menjadi pengetahuan organisasi.",
  },
];

export default function PengetahuanPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scope, setScope] = useState("");
  const [docType, setDocType] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [tab, setTab] = useState<PageTab>("dokumen");

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { List, isLoading, isError, error, refetch } = useResponseListDocument({
    search: debouncedSearch,
    scope,
    doc_type: docType,
    category: TAB_CATEGORIES[tab],
  });
  const uploadMutation = useUploadDocument();
  const { summary: proposalSummary } = useProposals("pending");
  const pendingProposals = proposalSummary?.pending ?? 0;
  const deleteMutation = useDeleteDocument();

  const docs = List?.data ?? [];
  const s = List?.summary ?? { queued: 0, processing: 0, ready: 0, failed: 0 };
  const filtered = Boolean(debouncedSearch || scope || docType);

  const handleDelete = async (doc: ResponseInterface) => {
    const ok = await confirmAlert(
      `Hapus "${doc.title}"?`,
      `Role tidak bisa lagi memakai dokumen ini. Bila pernah dirujuk tugas, isinya tetap bisa dibuka dari rujukan itu; bila belum, semua versi (${doc.version_count}) terhapus permanen.`,
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
          canEdit &&
          tab !== "usulan" && (
            <Button icon={<Icon name="plus" size={16} />} onClick={() => setUploadOpen(true)}>
              {tab === "kebijakan" ? "Unggah aturan" : "Unggah dokumen"}
            </Button>
          )
        }
      />

      <div className="space-y-2">
        <div className="glass rounded-2xl p-1.5 inline-flex gap-1 max-w-full overflow-x-auto" role="tablist" aria-label="Jenis pengetahuan">
          {PAGE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key);
                setDocType("");
              }}
              className={`h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
                tab === t.key
                  ? "bg-gradient-to-r from-brand to-[#9b6bff] text-white shadow-[0_8px_18px_-8px_rgba(124,77,255,.9)]"
                  : "text-muted hover:text-ink hover:bg-surface/80"
              }`}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
              {t.key === "usulan" && pendingProposals > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-night text-[10px] font-extrabold flex items-center justify-center">{pendingProposals}</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{PAGE_TABS.find((t) => t.key === tab)?.hint}</p>
      </div>

      {tab === "usulan" ? (
        <ProposalList canDecide={canEdit} />
      ) : (
        <>
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
              title={filtered ? "Tidak ada dokumen yang cocok" : tab === "kebijakan" ? "Belum ada kebijakan atau aturan" : "Belum ada dokumen"}
              description={
                filtered
                  ? "Ubah saringan atau kata pencarian."
                  : tab === "kebijakan"
                    ? "Unggah peraturan, kebijakan, standar mutu, atau panduan merek organisasi."
                    : "Unggah SOP atau pedoman pertama, lalu tentukan role atau unit yang boleh membacanya."
              }
              action={
                canEdit && !filtered ? (
                  <Button icon={<Icon name="plus" size={16} />} onClick={() => setUploadOpen(true)}>
                    {tab === "kebijakan" ? "Unggah aturan pertama" : "Unggah dokumen pertama"}
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
        </>
      )}

      {uploadOpen && (
        <UploadDocumentModal
          saving={uploadMutation.isPending}
          category={tab === "kebijakan" ? "policy" : "knowledge"}
          onClose={() => setUploadOpen(false)}
          onSubmit={(form) => uploadMutation.mutate(form, { onSuccess: () => setUploadOpen(false) })}
        />
      )}
    </div>
  );
}
