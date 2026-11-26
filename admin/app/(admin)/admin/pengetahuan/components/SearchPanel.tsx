"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Input } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { useSearchDocuments } from "../hooks/crud";
import { citationHref, citationText } from "../types";
import { Highlight } from "./DocumentParts";

/** Uji pencarian: memperlihatkan potongan dokumen yang akan ditemukan role untuk sebuah pertanyaan. */
export default function SearchPanel({ agentId = "", title = "Uji pencarian" }: { agentId?: string; title?: string }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(q), 400);
    return () => clearTimeout(handler);
  }, [q]);
  const { Hits, isFetching } = useSearchDocuments(debounced, agentId);
  const terms = debounced
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-xs text-muted mt-0.5">Ketik pertanyaan untuk melihat potongan dokumen yang akan menjadi dasar jawaban.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          aria-label="Pertanyaan uji"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="mis. kapan undangan harus dikirim?"
          leftIcon={<Icon name="search" size={16} />}
        />
        {debounced.trim().length >= 3 && (
          <div className={`space-y-2 transition-opacity ${isFetching ? "opacity-60" : ""}`} aria-live="polite">
            {Hits.length === 0 && !isFetching ? (
              <p className="text-sm text-faint py-3 text-center">Tidak ada potongan dokumen yang cocok.</p>
            ) : (
              Hits.map((h, i) => (
                <Link
                  key={`${h.document_id}-${h.page_no}`}
                  href={citationHref(h, debounced)}
                  className="block rounded-2xl border border-line bg-white p-3 hover:border-brand/40 hover:shadow-md transition-all rise"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-brand truncate">{citationText(h.document_title, h.version_no, h.page_no)}</span>
                    <span className="text-faint shrink-0">skor {h.score}</span>
                  </div>
                  <p className="text-xs font-semibold text-ink mt-1">{h.heading}</p>
                  <p className="text-xs text-muted leading-relaxed mt-0.5">
                    <Highlight text={h.snippet} terms={terms} />
                  </p>
                </Link>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
