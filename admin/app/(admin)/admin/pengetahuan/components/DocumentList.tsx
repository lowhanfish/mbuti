"use client";

import Link from "next/link";
import React from "react";
import { formatDate } from "@/utilities/labels";
import { Badge, IconButton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { DOC_TYPE_LABEL, SCOPE_LABEL, type ResponseInterface } from "../types";
import { FileGlyph, IngestionStatusView } from "./DocumentParts";

export function ScopeChip({ doc }: { doc: ResponseInterface }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted bg-white border border-line rounded-full px-2 py-0.5 max-w-full">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: doc.scope_color ?? "var(--color-brand)" }} />
      <span className="truncate">{doc.scope === "organization" ? SCOPE_LABEL.organization : doc.scope_name ?? SCOPE_LABEL[doc.scope]}</span>
    </span>
  );
}

/** Daftar dokumen; dipakai di halaman Pengetahuan dan tab Dokumen role. */
export default function DocumentList({
  docs,
  canEdit,
  onDelete,
  inheritedLabel,
}: {
  docs: ResponseInterface[];
  canEdit: boolean;
  onDelete?: (doc: ResponseInterface) => void;
  /** Penanda dokumen yang terbaca karena lingkup (bukan milik role ini) */
  inheritedLabel?: (doc: ResponseInterface) => string | null;
}) {
  return (
    <ul className="divide-y divide-line/70">
      {docs.map((doc) => {
        const inherited = inheritedLabel?.(doc);
        return (
          <li key={doc.id} className="group relative flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-white/70 transition-colors">
            <FileGlyph fileName={doc.active_version?.file_name ?? "berkas"} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/pengetahuan/${doc.id}`} className="font-semibold text-ink hover:text-brand truncate after:absolute after:inset-0">
                  {doc.title}
                </Link>
                <Badge size="sm" variant="info">
                  {DOC_TYPE_LABEL[doc.doc_type]}
                </Badge>
                {inherited && (
                  <Badge size="sm" variant="accent">
                    {inherited}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
                <ScopeChip doc={doc} />
                <span>v{doc.active_version?.version_no ?? "—"}</span>
                <span className="hidden sm:inline">Diperbarui {formatDate(doc.updated_at)}</span>
              </div>
            </div>
            <div className="shrink-0 relative z-10">
              <IngestionStatusView version={doc.active_version} />
            </div>
            {canEdit && onDelete && (
              <div className="relative z-10 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <IconButton label={`Hapus ${doc.title}`} tone="danger" onClick={() => onDelete(doc)}>
                  <Icon name="trash" size={16} />
                </IconButton>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
