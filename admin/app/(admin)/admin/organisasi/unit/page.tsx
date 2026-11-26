"use client";

import React, { useEffect, useMemo, useState } from "react";
import { confirmAlert } from "@/lib/show_swall";
import { useAuthStore } from "@/store/useAuthStore";
import { Button, Card, EmptyState, Input, PageHeader, Skeleton } from "../../../_components/ui";
import { Icon } from "../../../_components/admin-icons";
import FormUnitModal, { emptyUnit, unitToForm } from "./components/FormUnitModal";
import { UnitCardView, UnitTreeView } from "./components/UnitViews";
import { useCreateUnit, useDeleteUnit, useResponseListUnit, useUpdateUnit } from "./hooks/crud";
import { buildTree, flattenTree } from "./tree";
import type { CreateInterface, ResponseInterface } from "./types";

type ViewMode = "tree" | "cards";

export default function OrganisasiUnitPage() {
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<ViewMode>("tree");

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { List, isLoading, isError, error, refetch } = useResponseListUnit(debouncedSearch);
  const { List: AllUnits } = useResponseListUnit("");
  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const deleteMutation = useDeleteUnit();

  const items = useMemo(() => List?.data ?? [], [List]);
  const tree = useMemo(() => buildTree(items), [items]);
  const allItems = useMemo(() => AllUnits?.data ?? [], [AllUnits]);

  // Modal form: `formKey` memaksa form dibuat ulang dengan isian awal yang baru
  const [formState, setFormState] = useState<{
    open: boolean;
    mode: "add" | "edit";
    id: string | null;
    initial: CreateInterface;
    key: number;
  }>({ open: false, mode: "add", id: null, initial: emptyUnit(), key: 0 });

  const openAdd = (parent: ResponseInterface | null = null) =>
    setFormState((s) => ({ open: true, mode: "add", id: null, initial: emptyUnit(parent?.id ?? null), key: s.key + 1 }));
  const openEdit = (unit: ResponseInterface) =>
    setFormState((s) => ({ open: true, mode: "edit", id: unit.id, initial: unitToForm(unit), key: s.key + 1 }));
  const closeForm = () => setFormState((s) => ({ ...s, open: false }));

  const handleSubmit = (body: CreateInterface) => {
    const options = { onSuccess: closeForm };
    if (formState.mode === "edit" && formState.id) {
      updateMutation.mutate({ id: formState.id, body }, options);
    } else {
      createMutation.mutate(body, options);
    }
  };

  const handleDelete = async (unit: ResponseInterface) => {
    const confirmed = await confirmAlert(
      `Hapus unit "${unit.name}"?`,
      unit.member_count > 0
        ? `${unit.member_count} anggota di unit ini akan menjadi tanpa unit. Tindakan ini tidak bisa dibatalkan.`
        : "Tindakan ini tidak bisa dibatalkan.",
      "Ya, hapus"
    );
    if (confirmed) deleteMutation.mutate(unit.id);
  };

  const actions = { canEdit, onAddChild: openAdd, onEdit: openEdit, onDelete: handleDelete };
  const rootCount = allItems.filter((u) => !u.parent_id).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unit / Divisi"
        description="Susun divisi tempat role AI bekerja. Setiap unit menjadi satu ruangan di kantor 3D."
        action={
          canEdit && (
            <Button icon={<Icon name="plus" size={16} />} onClick={() => openAdd(null)}>
              Tambah unit
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-line/70">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="font-semibold text-ink text-sm">{allItems.length} unit</span>
            <span className="w-1 h-1 rounded-full bg-faint" />
            <span>{rootCount} unit utama</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-full sm:w-64">
              <Input
                aria-label="Cari unit"
                placeholder="Cari nama, kode, tugas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Icon name="search" size={16} />}
              />
            </div>
            <div className="flex rounded-xl bg-canvas p-1 shrink-0" role="tablist" aria-label="Tampilan">
              {(
                [
                  ["tree", "tree", "Pohon"],
                  ["cards", "dashboard", "Kartu"],
                ] as const
              ).map(([mode, icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  title={label}
                  onClick={() => setView(mode)}
                  className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    view === mode ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon name={icon} size={15} />
                  <span className="hidden md:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={<Icon name="building" size={26} />}
              title="Unit gagal dimuat"
              description={error instanceof Error ? error.message : undefined}
              action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Icon name="building" size={26} />}
              title={debouncedSearch ? "Tidak ada unit yang cocok" : "Belum ada unit"}
              description={
                debouncedSearch
                  ? `Tidak ada unit dengan kata "${debouncedSearch}".`
                  : "Mulai dengan unit utama, mis. Sekretariat atau Bidang Layanan, lalu tambahkan sub-unit di dalamnya."
              }
              action={
                canEdit && !debouncedSearch ? (
                  <Button icon={<Icon name="plus" size={16} />} onClick={() => openAdd(null)}>
                    Tambah unit pertama
                  </Button>
                ) : undefined
              }
            />
          ) : view === "tree" ? (
            <UnitTreeView nodes={tree} {...actions} />
          ) : (
            <UnitCardView items={flattenTree(tree)} {...actions} />
          )}
        </div>
      </Card>

      {formState.open && (
        <FormUnitModal
          key={formState.key}
          isOpen={formState.open}
          mode={formState.mode}
          editingId={formState.id}
          initial={formState.initial}
          allUnits={allItems}
          saving={createMutation.isPending || updateMutation.isPending}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
