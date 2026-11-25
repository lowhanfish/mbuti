"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Button, Card, EmptyState, Input, PageHeader, Select, SkeletonCard } from "../../_components/ui";
import { Icon } from "../../_components/admin-icons";
import { useResponseOptionUnit } from "../organisasi/unit/hooks/crud";
import FormRoleModal from "./components/FormRoleModal";
import { RoleCard } from "./components/RoleParts";
import { useCreateRole, useResponseListRole } from "./hooks/crud";
import { STATUS_LABEL, type AgentStatus, type ResponseInterface } from "./types";

const STATUS_FILTERS: Array<{ value: "" | AgentStatus; label: string }> = [
  { value: "", label: "Semua" },
  { value: "active", label: STATUS_LABEL.active },
  { value: "draft", label: STATUS_LABEL.draft },
  { value: "paused", label: STATUS_LABEL.paused },
];

export default function RolePage() {
  const router = useRouter();
  const accessRole = useAuthStore((state) => state.user?.access_role);
  const canEdit = accessRole === "owner" || accessRole === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [unitId, setUnitId] = useState("");
  const [status, setStatus] = useState<"" | AgentStatus>("");
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { List, isLoading, isError, error, refetch, isFetching } = useResponseListRole({
    search: debouncedSearch,
    unit_id: unitId,
    status,
  });
  const { List: units } = useResponseOptionUnit();
  const createMutation = useCreateRole();

  const roles = useMemo(() => List?.data ?? [], [List]);
  const summary = List?.summary ?? { draft: 0, active: 0, paused: 0 };

  // Kelompokkan per unit agar terasa seperti denah kantor
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null; items: ResponseInterface[] }>();
    for (const role of roles) {
      const key = role.unit_id ?? "none";
      const group = map.get(key) ?? { name: role.unit_name ?? "Belum ditempatkan", color: role.unit_color, items: [] };
      group.items.push(role);
      map.set(key, group);
    }
    return [...map.entries()];
  }, [roles]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role"
        description="Karyawan AI organisasi Anda. Setiap role punya tujuan, instruksi, dokumen kerja, dan penanggung jawab manusia."
        action={
          canEdit && (
            <Button icon={<Icon name="plus" size={16} />} onClick={() => setFormOpen(true)}>
              Buat role
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-wrap gap-1.5 shrink-0" role="tablist" aria-label="Saring status">
            {STATUS_FILTERS.map((f) => {
              const count = f.value ? summary[f.value] : summary.active + summary.draft + summary.paused;
              const active = status === f.value;
              return (
                <button
                  key={f.label}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(f.value)}
                  className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    active ? "bg-ink text-white shadow-md" : "bg-white/70 text-muted hover:text-ink hover:bg-white"
                  }`}
                >
                  {f.label}
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${active ? "bg-white/15 text-accent" : "bg-canvas"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="sm:w-56">
              <Select aria-label="Saring unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Semua unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.value}
                  </option>
                ))}
                <option value="none">Belum ditempatkan</option>
              </Select>
            </div>
            <div className="sm:w-64">
              <Input
                aria-label="Cari role"
                placeholder="Cari nama, jabatan, tujuan…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Icon name="search" size={16} />}
              />
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="h-64" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={<Icon name="agent" size={26} />}
            title="Daftar role gagal dimuat"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        </Card>
      ) : roles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="agent" size={26} />}
            title={debouncedSearch || unitId || status ? "Tidak ada role yang cocok" : "Belum ada role"}
            description={
              debouncedSearch || unitId || status
                ? "Ubah saringan atau kata pencarian."
                : "Buat role pertama, mis. Penyusun Surat Dinas, lalu unggah SOP sebagai dasar kerjanya."
            }
            action={
              canEdit && !debouncedSearch && !unitId && !status ? (
                <Button icon={<Icon name="plus" size={16} />} onClick={() => setFormOpen(true)}>
                  Buat role pertama
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className={`space-y-8 transition-opacity ${isFetching ? "opacity-70" : ""}`}>
          {groups.map(([key, group]) => (
            <section key={key} className="space-y-3" aria-label={group.name}>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: group.color ?? "var(--color-faint)" }} />
                <h2 className="text-sm font-bold text-ink">{group.name}</h2>
                <span className="text-xs text-faint">{group.items.length} role</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 stagger">
                {group.items.map((role) => (
                  <RoleCard key={role.id} role={role} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {formOpen && (
        <FormRoleModal
          saving={createMutation.isPending}
          defaultUnitId={unitId && unitId !== "none" ? unitId : null}
          onClose={() => setFormOpen(false)}
          onSubmit={(body) =>
            createMutation.mutate(body, {
              onSuccess: (res) => {
                setFormOpen(false);
                router.push(`/admin/role/${res.data.id}`);
              },
            })
          }
        />
      )}
    </div>
  );
}
