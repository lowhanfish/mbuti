"use client";

import React, { useMemo } from "react";

export interface PaginationProps {
  page: number;
  onPageChange: (newPage: number) => void;
  pageSize: number;
  onPageSizeChange?: (newPageSize: number) => void;
  total: number;
  pageSizeOptions?: number[];
  pageShow?: number;
  className?: string;
  showSummary?: boolean;
}

const navButton =
  "h-8 rounded-xl border border-white bg-white/75 hover:bg-white text-ink disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer text-xs";

export function Pagination({
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  total,
  pageSizeOptions = [5, 10, 20, 50],
  pageShow = 5,
  className = "",
  showSummary = true,
}: PaginationProps) {
  const totalPages = useMemo(
    () => (!total || !pageSize ? 1 : Math.max(1, Math.ceil(total / pageSize))),
    [total, pageSize]
  );

  const listPage = useMemo(() => {
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startGroup = Math.floor((safePage - 1) / pageShow) * pageShow + 1;
    const pages: number[] = [];
    for (let i = 0; i < pageShow; i++) {
      if (startGroup + i <= totalPages) pages.push(startGroup + i);
    }
    return pages;
  }, [page, pageShow, totalPages]);

  const startEntry = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, total);

  const pageButton = (p: number) => (
    <button
      key={p}
      type="button"
      onClick={() => onPageChange(p)}
      aria-current={p === page ? "page" : undefined}
      className={`min-w-8 h-8 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
        p === page ? "bg-brand text-white shadow-xs" : "bg-white/70 hover:bg-white text-ink border border-white"
      }`}
    >
      {p}
    </button>
  );

  return (
    <nav
      aria-label="Halaman"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted ${className}`}
    >
      {showSummary && (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Menampilkan <strong className="text-ink">{startEntry}</strong>–
            <strong className="text-ink">{endEntry}</strong> dari <strong className="text-ink">{total}</strong> data
          </span>
          {onPageSizeChange && (
            <label className="flex items-center gap-1.5 ml-2">
              <span className="text-faint">Tampilkan</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  onPageSizeChange(Number(e.target.value));
                  onPageChange(1);
                }}
                className="bg-white/85 border border-white text-ink font-semibold text-xs rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt} baris
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 font-medium">
        <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} title="Halaman pertama" className={`${navButton} w-8 font-bold`}>
          «
        </button>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} title="Sebelumnya" className={`${navButton} px-2.5`}>
          ‹
        </button>
        <div className="flex items-center gap-1 px-1">
          {listPage.map(pageButton)}
          {totalPages > pageShow && !listPage.includes(totalPages) && (
            <>
              <span className="px-1 text-faint font-bold">…</span>
              {pageButton(totalPages)}
            </>
          )}
        </div>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} title="Berikutnya" className={`${navButton} px-2.5`}>
          ›
        </button>
        <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} title="Halaman terakhir" className={`${navButton} w-8 font-bold`}>
          »
        </button>
      </div>
    </nav>
  );
}
