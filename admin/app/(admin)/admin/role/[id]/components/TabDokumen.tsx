"use client";

import React, { useState } from "react";
import { Button, Card, CardHeader, CardTitle, EmptyState, Skeleton } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import DocumentList from "../../../pengetahuan/components/DocumentList";
import SearchPanel from "../../../pengetahuan/components/SearchPanel";
import UploadDocumentModal from "../../../pengetahuan/components/UploadDocumentModal";
import { useResponseListDocument, useUploadDocument } from "../../../pengetahuan/hooks/crud";
import type { ResponseInterface as DocumentItem } from "../../../pengetahuan/types";
import { KNOWLEDGE_SCOPE_LABEL, type ResponseInterface } from "../../types";

export default function TabDokumen({ role, canEdit }: { role: ResponseInterface; canEdit: boolean }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const { List, isLoading } = useResponseListDocument({ agent_id: role.id });
  const upload = useUploadDocument();
  const docs = List?.data ?? [];

  const inheritedLabel = (doc: DocumentItem) => {
    if (doc.scope === "agent" && doc.scope_id === role.id) return null;
    if (doc.scope === "organization") return "Dari organisasi";
    if (doc.scope === "unit") return "Dari unit";
    return "Dari role lain di unit";
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px] items-start">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Dokumen yang bisa dibaca {role.name}</CardTitle>
            <p className="text-xs text-muted mt-0.5">
              Lingkup: <strong className="text-ink">{KNOWLEDGE_SCOPE_LABEL[role.knowledge_scope].label}</strong>. Ubah di tab Instruksi.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setUploadOpen(true)}>
              Unggah untuk role ini
            </Button>
          )}
        </CardHeader>
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<Icon name="book" size={26} />}
            title="Belum ada dokumen dalam lingkup ini"
            description={`${role.name} tidak akan mengarang aturan. Unggah SOP atau pedoman agar role bisa bekerja dengan rujukan.`}
          />
        ) : (
          <DocumentList docs={docs} canEdit={false} inheritedLabel={inheritedLabel} />
        )}
      </Card>

      <div className="xl:sticky xl:top-24">
        <SearchPanel agentId={role.id} title={`Apa yang ditemukan ${role.name}?`} />
      </div>

      {uploadOpen && (
        <UploadDocumentModal
          saving={upload.isPending}
          preset={{ scope: "agent", scope_id: role.id, lock: true }}
          onClose={() => setUploadOpen(false)}
          onSubmit={(form) => upload.mutate(form, { onSuccess: () => setUploadOpen(false) })}
        />
      )}
    </div>
  );
}
