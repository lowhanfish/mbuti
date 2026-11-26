"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Select,
  SkeletonTableRows,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import { useResponseListAudit } from "./hooks/crud";
import { GROUPS, actionTone, type ResponseInterface } from "./types";

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
    new Date(iso)
  );

const Actor = ({ entry }: { entry: ResponseInterface }) => (
  <div className="min-w-0">
    <p className="font-semibold text-ink truncate">{entry.actor_name || "Tidak dikenal"}</p>
    <p className="text-xs text-muted truncate">{entry.actor_email}</p>
  </div>
);

const EMPTY = "Belum ada catatan yang cocok.";

export default function JejakAuditPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const allowed = accessRole === "owner" || accessRole === "admin";

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { List, isLoading, isError, error, refetch, isFetching } = useResponseListAudit(page, pageSize, { search: debounced, group }, allowed);
  const rows = List?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Jejak Audit" description="Siapa melakukan apa dan kapan. Catatan ini hanya bertambah, tidak bisa diubah." />

      {accessRole && !allowed ? (
        <Card>
          <EmptyState icon={<Icon name="shield" size={26} />} title="Khusus pemilik dan admin" description="Hak akses Anda tidak dapat melihat jejak audit." />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4 border-b border-line/70">
            <div className="w-full md:w-80">
              <Input
                aria-label="Cari catatan"
                placeholder="Cari nama, email, atau sasaran…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Icon name="search" size={16} />}
              />
            </div>
            <div className="w-full md:w-56">
              <Select
                aria-label="Saring jenis tindakan"
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua tindakan</option>
                {GROUPS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {isError ? (
            <EmptyState
              icon={<Icon name="shield" size={26} />}
              title="Jejak audit gagal dimuat"
              description={error instanceof Error ? error.message : undefined}
              action={
                <Button variant="outline" onClick={() => refetch()}>
                  Coba lagi
                </Button>
              }
            />
          ) : (
            <>
              <div className={`hidden md:block transition-opacity ${isFetching && !isLoading ? "opacity-60" : ""}`}>
                <Table>
                  <TableHeader>
                    <tr>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Pelaku</TableHead>
                      <TableHead>Tindakan</TableHead>
                      <TableHead>Sasaran</TableHead>
                      <TableHead className="hidden xl:table-cell">Alamat</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <SkeletonTableRows rows={6} cols={5} />
                    ) : rows.length === 0 ? (
                      <TableEmpty colSpan={5} message={EMPTY} />
                    ) : (
                      rows.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs text-muted whitespace-nowrap">{formatTime(entry.created_at)}</TableCell>
                          <TableCell className="max-w-[240px]">
                            <Actor entry={entry} />
                          </TableCell>
                          <TableCell>
                            <Badge variant={actionTone(entry.action)}>{entry.label}</Badge>
                          </TableCell>
                          <TableCell className="text-muted max-w-[260px] truncate" >
                            <span title={entry.target}>{entry.target || "—"}</span>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-xs text-faint font-mono">
                            <span title={entry.request_id ? `Kode permintaan ${entry.request_id}` : undefined}>{entry.ip || "—"}</span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <ul className="md:hidden divide-y divide-line/70">
                {isLoading ? (
                  <li className="p-5 text-sm text-muted">Memuat…</li>
                ) : rows.length === 0 ? (
                  <li className="p-8 text-center text-sm text-faint">{EMPTY}</li>
                ) : (
                  rows.map((entry) => (
                    <li key={entry.id} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant={actionTone(entry.action)}>{entry.label}</Badge>
                        <span className="text-[11px] text-faint">{formatTime(entry.created_at)}</span>
                      </div>
                      {entry.target && <p className="text-sm text-ink break-words">{entry.target}</p>}
                      <Actor entry={entry} />
                    </li>
                  ))
                )}
              </ul>

              <div className="px-5 py-4 border-t border-line/70">
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={List?.total ?? 0}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  pageSizeOptions={[10, 20, 50]}
                />
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
