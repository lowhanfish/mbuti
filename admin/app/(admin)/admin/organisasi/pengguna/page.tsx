"use client";

import React, { useEffect, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { ACCESS_ROLE_LABEL, formatDate } from "@/utilities/labels";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
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
import { EditMemberModal, InviteMemberModal } from "./components/MemberModals";
import { MemberAvatar, RoleBadge, StatusBadge } from "./components/MemberParts";
import { useDeleteMember, useInviteMember, useResendInvite, useResponseListMember, useUpdateMember } from "./hooks/crud";
import { STATUS_LABEL, type MemberStatus, type ResponseInterface } from "./types";

const STATUS_TABS: Array<{ value: "" | MemberStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "active", label: STATUS_LABEL.active },
  { value: "invited", label: STATUS_LABEL.invited },
  { value: "disabled", label: STATUS_LABEL.disabled },
];

export default function OrganisasiPenggunaPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";
  const isOwner = accessRole === "owner";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | MemberStatus>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { List, isLoading, isError, error, refetch, isFetching } = useResponseListMember(page, pageSize, {
    search: debouncedSearch,
    access_role: roleFilter,
    status: statusFilter,
  });
  const inviteMutation = useInviteMember();
  const updateMutation = useUpdateMember();
  const deleteMutation = useDeleteMember();
  const resendMutation = useResendInvite();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [editing, setEditing] = useState<ResponseInterface | null>(null);

  const rows = List?.data ?? [];
  const summary = List?.summary ?? { active: 0, invited: 0, disabled: 0 };
  const totalAll = summary.active + summary.invited + summary.disabled;

  const handleRemove = async (member: ResponseInterface) => {
    const confirmed = await confirmAlert(
      `Keluarkan ${member.full_name}?`,
      "Pengguna kehilangan akses ke organisasi ini. Riwayat kerjanya tetap tersimpan.",
      "Ya, keluarkan"
    );
    if (confirmed) deleteMutation.mutate(member.id);
  };

  const rowActions = (member: ResponseInterface) =>
    canEdit && (
      <div className="flex items-center justify-end gap-0.5">
        {member.status === "invited" && (
          <IconButton
            label={`Kirim ulang undangan ke ${member.full_name}`}
            disabled={resendMutation.isPending}
            onClick={() => resendMutation.mutate(member.id)}
          >
            <Icon name="mail" size={16} />
          </IconButton>
        )}
        <IconButton label={`Ubah ${member.full_name}`} onClick={() => setEditing(member)}>
          <Icon name="edit" size={16} />
        </IconButton>
        {!member.is_self && (
          <IconButton label={`Keluarkan ${member.full_name}`} tone="danger" onClick={() => handleRemove(member)}>
            <Icon name="trash" size={16} />
          </IconButton>
        )}
      </div>
    );

  const nameCell = (member: ResponseInterface) => (
    <div className="flex items-center gap-3 min-w-0">
      <MemberAvatar name={member.full_name} />
      <div className="min-w-0">
        <p className="font-semibold text-ink truncate">
          {member.full_name}
          {member.is_self && <span className="ml-2 text-[10px] font-bold text-brand bg-brand-soft rounded-full px-2 py-0.5">Anda</span>}
        </p>
        <p className="text-xs text-muted truncate">{member.email}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengguna"
        description="Manusia yang memakai MBUTI: mengatur role, memberi tugas, dan menyetujui hasil kerja."
        action={
          canEdit && (
            <Button
              icon={<Icon name="plus" size={16} />}
              onClick={() => {
                setInviteKey((k) => k + 1);
                setInviteOpen(true);
              }}
            >
              Undang anggota
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        {STATUS_TABS.map((tab) => {
          const count = tab.value ? summary[tab.value] : totalAll;
          const active = statusFilter === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              aria-pressed={active}
              className={`text-left rounded-3xl p-4 transition-all cursor-pointer ${
                active
                  ? "bg-gradient-to-br from-ink to-[#3b2580] text-white shadow-[0_16px_30px_-14px_rgba(24,18,43,.8)] -translate-y-0.5"
                  : "glass card-hover text-ink"
              }`}
            >
              <span className={`text-xs font-semibold ${active ? "text-white/70" : "text-muted"}`}>{tab.label}</span>
              <span className="block text-2xl font-bold tabular-nums mt-1">{count}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4 border-b border-line/70">
          <div className="w-full md:w-72">
            <Input
              aria-label="Cari pengguna"
              placeholder="Cari nama, email, unit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Icon name="search" size={16} />}
            />
          </div>
          <div className="w-full md:w-48">
            <Select
              aria-label="Saring hak akses"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua hak akses</option>
              {Object.entries(ACCESS_ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isError ? (
          <EmptyState
            icon={<Icon name="users" size={26} />}
            title="Daftar pengguna gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        ) : (
          <>
            {/* Tabel untuk layar lebar */}
            <div className={`hidden md:block transition-opacity ${isFetching && !isLoading ? "opacity-60" : ""}`}>
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Nama</TableHead>
                    <TableHead>Hak akses</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden xl:table-cell">Terakhir aktif</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Aksi</span>
                    </TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <SkeletonTableRows rows={5} cols={6} />
                  ) : rows.length === 0 ? (
                    <TableEmpty colSpan={6} message="Tidak ada pengguna yang cocok dengan saringan." />
                  ) : (
                    rows.map((member) => (
                      <TableRow key={member.id} className="group">
                        <TableCell className="max-w-[280px]">{nameCell(member)}</TableCell>
                        <TableCell>
                          <RoleBadge role={member.access_role} />
                        </TableCell>
                        <TableCell className="text-muted">{member.unit_name ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={member.status} />
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-muted text-xs">{formatDate(member.last_active_at)}</TableCell>
                        <TableCell className="text-right">{rowActions(member)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Kartu untuk layar sempit */}
            <ul className="md:hidden divide-y divide-line/70">
              {isLoading ? (
                <li className="p-5 text-sm text-muted">Memuat…</li>
              ) : rows.length === 0 ? (
                <li className="p-8 text-center text-sm text-faint">Tidak ada pengguna yang cocok dengan saringan.</li>
              ) : (
                rows.map((member) => (
                  <li key={member.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      {nameCell(member)}
                      {rowActions(member)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-[52px]">
                      <RoleBadge role={member.access_role} />
                      <StatusBadge status={member.status} />
                      {member.unit_name && <span className="text-xs text-muted">{member.unit_name}</span>}
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="px-5 py-4 border-t border-line/70">
              <Pagination
                page={page}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                total={List?.total ?? 0}
              />
            </div>
          </>
        )}
      </Card>

      {inviteOpen && (
        <InviteMemberModal
          key={inviteKey}
          isOpen={inviteOpen}
          allowOwner={isOwner}
          saving={inviteMutation.isPending}
          onClose={() => setInviteOpen(false)}
          onSubmit={(body) => inviteMutation.mutate(body, { onSuccess: () => setInviteOpen(false) })}
        />
      )}

      {editing && (
        <EditMemberModal
          key={editing.id}
          member={editing}
          allowOwner={isOwner}
          saving={updateMutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(body) => updateMutation.mutate({ id: editing.id, body }, { onSuccess: () => setEditing(null) })}
        />
      )}
    </div>
  );
}
